/**
 * Approval Inbox + Escalation Policies routes — Task #148.
 *
 * Mounted at:
 *   /api/approvals             — pending-approvals inbox & decisions
 *   /api/escalation-policies   — admin CRUD for chain definitions
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticateToken, requireAdminOrOwner } from '../../middleware/auth';
import {
  approve,
  cancel,
  escalateExpired,
  getRequest,
  listInboxFor,
  listPolicies,
  openRequest,
  reject,
  upsertPolicy,
  EscalationError,
} from '../services/escalationService';
import {
  executeInventoryApproval,
  isInventoryApprovalRequestType,
  InventoryExecutorError,
} from '../services/inventoryApprovalExecutor';
import { db } from '../../db';
import { approvalRequestHistory, approvalRequests, employees, users } from '../../schema';
import { and, asc, eq } from 'drizzle-orm';

export const approvalsRouter = Router();
export const escalationPoliciesRouter = Router();

approvalsRouter.use(authenticateToken);

function actorFromReq(req: Request): {
  userId: number | null;
  displayName: string;
  roles: string[];
} {
  const u = req.user;
  const roles: string[] = [];
  if (u?.role) roles.push(u.role);
  return {
    userId: u?.id ?? null,
    displayName: u?.username ?? 'unknown',
    roles,
  };
}

/**
 * Admins and owners may cancel any pending approval; everyone else may
 * only cancel their own. Routes never propagate
 * `isPrivilegedOverride` from a request body — it is only ever set here
 * after verifying the actor's role.
 */
function isAdminOrOwner(req: Request): boolean {
  const role = req.user?.role;
  return role === 'ADMIN' || role === 'OWNER';
}

approvalsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : 'PENDING';
    const userId = req.user?.id ?? null;
    const roles: string[] = [];
    if (req.user?.role) roles.push(req.user.role);
    // Only admins/owners may scope to a different role's inbox via ?role=.
    // For everyone else the parameter is silently dropped to prevent
    // queue-snooping across roles.
    if (typeof req.query.role === 'string' && isAdminOrOwner(req)) {
      roles.push(req.query.role);
    }
    const rows = await listInboxFor({
      userId,
      roles,
      status,
      limit: Number(req.query.limit ?? 200),
    });
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'inbox failed' });
  }
});

approvalsRouter.get('/my-tasks/:employeeId', async (req: Request, res: Response) => {
  try {
    const employeeId = Number(req.params.employeeId);
    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      return res.status(400).json({ error: 'invalid employee id', code: 'INVALID_EMPLOYEE_ID' });
    }

    const actorEmployeeId = req.user?.employeeId ?? null;
    if (!isAdminOrOwner(req) && actorEmployeeId !== employeeId) {
      return res.status(403).json({ error: 'not authorized to view approval tasks', code: 'FORBIDDEN' });
    }

    const [linkedUser] = await db
      .select({ userId: users.id })
      .from(users)
      .where(and(eq(users.employeeId, employeeId), eq(users.isActive, true)))
      .limit(1);

    if (!linkedUser) {
      return res.json({ tasks: [], stats: { total: 0, pending: 0, completed: 0, overdue: 0 } });
    }

    const rows = await db
      .select()
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.status, 'PENDING'),
          eq(approvalRequests.currentApproverUserId, linkedUser.userId),
        ),
      )
      .orderBy(asc(approvalRequests.currentLevelDeadline))
      .limit(100);

    const now = Date.now();
    const tasks = rows.map((row) => {
      const deadlineMs = row.currentLevelDeadline ? new Date(row.currentLevelDeadline).getTime() : null;
      const overdue = deadlineMs != null && deadlineMs <= now;
      return {
        id: `approval-${row.id}`,
        type: 'approval_request',
        title: `Approval required: ${row.requestType}`,
        description: row.subjectType && row.subjectId
          ? `${row.subjectType} #${row.subjectId}`
          : `Requested by ${row.requestedByDisplayName}`,
        requestType: row.requestType,
        requestedByDisplayName: row.requestedByDisplayName,
        createdAt: row.createdAt,
        dueAt: row.currentLevelDeadline,
        priority: overdue ? 'overdue' : 'normal',
        actionUrl: `/approvals?requestId=${row.id}`,
        sourceId: row.id,
      };
    });

    res.json({
      tasks,
      stats: {
        total: tasks.length,
        pending: tasks.length,
        completed: 0,
        overdue: tasks.filter((task) => task.priority === 'overdue').length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'approval tasks failed' });
  }
});

approvalsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const result = await getRequest(req.params.id);
    if (!result) return res.status(404).json({ error: 'not found' });
    // Object-level authorization: only the assigned approver
    // (by user id OR by role membership), the original requester, or
    // an admin/owner may read the full payload + decision history.
    const r = result.request;
    const actor = actorFromReq(req);
    const isAssignedUser =
      r.currentApproverUserId != null &&
      actor.userId != null &&
      r.currentApproverUserId === actor.userId;
    const isAssignedRole =
      !!r.currentApproverRole && actor.roles.includes(r.currentApproverRole);
    const isRequester =
      r.requestedByUserId != null &&
      actor.userId != null &&
      r.requestedByUserId === actor.userId;
    if (!isAdminOrOwner(req) && !isAssignedUser && !isAssignedRole && !isRequester) {
      return res.status(403).json({ error: 'not authorized to view this approval', code: 'FORBIDDEN' });
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'fetch failed' });
  }
});

const assignmentBodySchema = z.object({
  employeeId: z.number().int().positive().nullable().optional(),
});

approvalsRouter.patch('/:id/assignment', async (req: Request, res: Response) => {
  try {
    const body = assignmentBodySchema.parse(req.body ?? {});
    const [row] = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, req.params.id));
    if (!row) return res.status(404).json({ error: 'approval request not found', code: 'NOT_FOUND' });
    if (row.status !== 'PENDING') {
      return res.status(409).json({ error: `approval request is ${row.status}`, code: 'NOT_PENDING' });
    }

    const actor = actorFromReq(req);
    const isAssignedUser =
      row.currentApproverUserId != null &&
      actor.userId != null &&
      row.currentApproverUserId === actor.userId;
    const isAssignedRole =
      !!row.currentApproverRole && actor.roles.includes(row.currentApproverRole);
    if (!isAdminOrOwner(req) && !isAssignedUser && !isAssignedRole) {
      return res.status(403).json({ error: 'not authorized to assign this approval', code: 'FORBIDDEN' });
    }

    let assigneeUserId: number | null = null;
    let assigneeName: string | null = null;
    if (body.employeeId != null) {
      const [assignee] = await db
        .select({
          employeeId: employees.id,
          employeeName: employees.name,
          userId: users.id,
        })
        .from(employees)
        .leftJoin(users, and(eq(users.employeeId, employees.id), eq(users.isActive, true)))
        .where(eq(employees.id, body.employeeId))
        .limit(1);

      if (!assignee) {
        return res.status(404).json({ error: 'employee not found', code: 'EMPLOYEE_NOT_FOUND' });
      }
      if (assignee.userId == null) {
        return res.status(400).json({
          error: 'selected employee does not have an active user account',
          code: 'EMPLOYEE_WITHOUT_USER',
        });
      }
      if (row.requestedByUserId != null && row.requestedByUserId === assignee.userId) {
        return res.status(403).json({
          error: 'Self-approval is not permitted. Assign this request to another employee.',
          code: 'SELF_APPROVAL_BLOCKED',
        });
      }
      assigneeUserId = assignee.userId;
      assigneeName = assignee.employeeName;
    }

    const now = new Date();
    const [updated] = await db
      .update(approvalRequests)
      .set({
        currentApproverUserId: assigneeUserId,
        updatedAt: now,
      })
      .where(eq(approvalRequests.id, row.id))
      .returning();

    await db.insert(approvalRequestHistory).values({
      approvalRequestId: row.id,
      event: 'ASSIGNED',
      fromLevel: row.escalationLevel,
      toLevel: row.escalationLevel,
      fromStatus: row.status,
      toStatus: row.status,
      actorUserId: actor.userId,
      actorDisplayName: actor.displayName,
      notes: assigneeUserId == null
        ? 'Approval assignment cleared'
        : `Approval assigned to ${assigneeName}`,
      metadata: {
        assignedEmployeeId: body.employeeId ?? null,
        assignedUserId: assigneeUserId,
        assignedEmployeeName: assigneeName,
      },
    });

    res.json(updated);
  } catch (err: any) {
    handleEscalationError(err, res);
  }
});

const decisionBodySchema = z.object({
  notes: z.string().optional().nullable(),
  reasonCode: z.string().optional().nullable(),
  signature: z.string().optional().nullable(),
  signatureMeaning: z.string().optional().nullable(),
  signatureReason: z.string().optional().nullable(),
  signerUsername: z.string().optional().nullable(),
  signerRole: z.string().optional().nullable(),
  linkedObjectType: z.string().optional().nullable(),
  linkedObjectId: z.string().optional().nullable(),
  digitalSignatureId: z.string().uuid().optional().nullable(),
});

approvalsRouter.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const body = decisionBodySchema.parse(req.body ?? {});
    const actor = actorFromReq(req);

    // ── Pre-decision checks ────────────────────────────────────────────────
    // Block self-approval: the actor who opened the request cannot be the one
    // who approves it. Admins/owners are NOT exempted — segregation of duties
    // applies to everyone for the high-risk inventory pipeline.
    const [pre] = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, req.params.id));
    if (!pre) return res.status(404).json({ error: 'approval request not found', code: 'NOT_FOUND' });
    if (
      pre.requestedByUserId != null &&
      actor.userId != null &&
      pre.requestedByUserId === actor.userId
    ) {
      return res.status(403).json({
        error: 'Self-approval is not permitted. Another approver in the chain must act on this request.',
        code: 'SELF_APPROVAL_BLOCKED',
      });
    }
    // High-risk inventory request types require the dedicated capability
    // beyond the role-based escalation chain check.
    if (isInventoryApprovalRequestType(pre.requestType)) {
      const caps: string[] = (req as any).user?.permissions ?? [];
      const role = req.user?.role;
      const isAdmin = role === 'ADMIN' || role === 'OWNER';
      if (!isAdmin && !caps.includes('inventory.approve_high_risk')) {
        return res.status(403).json({
          error: 'Missing capability inventory.approve_high_risk',
          code: 'FORBIDDEN',
        });
      }
    }

    const result = await approve({
      approvalRequestId: req.params.id,
      approver: { ...actor, isPrivilegedOverride: false },
      notes: body.notes ?? null,
      reasonCode: body.reasonCode ?? null,
      signature: body.signature ?? null,
      signatureMeaning: body.signatureMeaning ?? null,
      signatureReason: body.signatureReason ?? null,
      signerUsername: body.signerUsername ?? null,
      signerRole: body.signerRole ?? null,
      linkedObjectType: body.linkedObjectType ?? null,
      linkedObjectId: body.linkedObjectId ?? null,
      digitalSignatureId: body.digitalSignatureId ?? null,
    });

    // Run the inventory executor inline so the operator sees the outcome
    // of the originating mutation in the same response. Failure surfaces as
    // 200 with an `executor.error` field so the approval row remains APPROVED
    // and the inbox history shows what went wrong on the floor side.
    let executor: { ok: boolean; error?: string; code?: string; detail?: any; ledgerEntryId?: string | null } | undefined;
    if (isInventoryApprovalRequestType(result.requestType)) {
      try {
        const r = await executeInventoryApproval({
          request: result,
          approver: { userId: actor.userId, displayName: actor.displayName },
        });
        if (r) {
          executor = { ok: true, ledgerEntryId: r.ledgerEntryId, detail: r.detail };
        }
      } catch (execErr: any) {
        executor = {
          ok: false,
          error: execErr?.message ?? 'inventory executor failed',
          code: execErr instanceof InventoryExecutorError ? execErr.code : 'EXECUTOR_ERROR',
        };
      }
    }

    res.json({ ...result, executor });
  } catch (err: any) {
    handleEscalationError(err, res);
  }
});

approvalsRouter.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const body = decisionBodySchema.parse(req.body ?? {});
    if (!body.notes && !body.reasonCode) {
      return res.status(400).json({ error: 'rejection requires notes or reasonCode' });
    }
    const actor = actorFromReq(req);
    const result = await reject({
      approvalRequestId: req.params.id,
      approver: { ...actor, isPrivilegedOverride: false },
      notes: body.notes ?? null,
      reasonCode: body.reasonCode ?? null,
      signature: body.signature ?? null,
      signatureMeaning: body.signatureMeaning ?? null,
      signatureReason: body.signatureReason ?? null,
      signerUsername: body.signerUsername ?? null,
      signerRole: body.signerRole ?? null,
      linkedObjectType: body.linkedObjectType ?? null,
      linkedObjectId: body.linkedObjectId ?? null,
      digitalSignatureId: body.digitalSignatureId ?? null,
    });
    res.json(result);
  } catch (err: any) {
    handleEscalationError(err, res);
  }
});

approvalsRouter.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const actor = actorFromReq(req);
    const result = await cancel(
      req.params.id,
      { ...actor, isPrivilegedOverride: isAdminOrOwner(req) },
      req.body?.notes,
    );
    res.json(result);
  } catch (err: any) {
    handleEscalationError(err, res);
  }
});

const openBodySchema = z.object({
  requestType: z.string().min(1),
  payload: z.record(z.any()).optional(),
  subjectType: z.string().optional().nullable(),
  subjectId: z.string().optional().nullable(),
  summary: z.string().optional(),
});

approvalsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const body = openBodySchema.parse(req.body ?? {});
    const actor = actorFromReq(req);
    const created = await openRequest({
      requestType: body.requestType,
      payload: body.payload ?? {},
      subjectType: body.subjectType ?? null,
      subjectId: body.subjectId ?? null,
      requestedByUserId: actor.userId,
      requestedByDisplayName: actor.displayName,
      summary: body.summary,
    });
    res.status(201).json(created);
  } catch (err: any) {
    handleEscalationError(err, res);
  }
});

approvalsRouter.post('/_run-escalation', requireAdminOrOwner, async (_req, res) => {
  try {
    const result = await escalateExpired(new Date());
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'escalation failed' });
  }
});

// ─── Escalation policies admin ───────────────────────────────────────────────

escalationPoliciesRouter.use(requireAdminOrOwner);

escalationPoliciesRouter.get('/', async (_req, res) => {
  try {
    const rows = await listPolicies();
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'list failed' });
  }
});

const policyBodySchema = z.object({
  id: z.number().int().positive().optional(),
  requestType: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().optional().nullable(),
  chain: z
    .array(
      z.object({
        role: z.string().min(1),
        slaSeconds: z.number().int().positive(),
        isBackstop: z.boolean().optional(),
      }),
    )
    .min(1),
  requiresSignature: z.boolean().optional(),
  reasonCodes: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

escalationPoliciesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const body = policyBodySchema.parse(req.body ?? {});
    const actor = actorFromReq(req);
    const row = await upsertPolicy({ ...body, actor });
    res.json(row);
  } catch (err: any) {
    handleEscalationError(err, res);
  }
});

escalationPoliciesRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const body = policyBodySchema.parse({ ...(req.body ?? {}), id: Number(req.params.id) });
    const actor = actorFromReq(req);
    const row = await upsertPolicy({ ...body, actor });
    res.json(row);
  } catch (err: any) {
    handleEscalationError(err, res);
  }
});

function handleEscalationError(err: any, res: Response) {
  if (err instanceof EscalationError) {
    const map: Record<string, number> = {
      NOT_FOUND: 404,
      NOT_PENDING: 409,
      FORBIDDEN: 403,
      SIGNATURE_REQUIRED: 422,
      NO_POLICY: 422,
      EMPTY_CHAIN: 422,
      INVALID: 400,
    };
    return res.status(map[err.code] ?? 400).json({ error: err.message, code: err.code });
  }
  if (err?.issues) {
    return res.status(400).json({ error: 'validation failed', details: err.issues });
  }
  console.error('[approvals] error:', err);
  res.status(500).json({ error: err?.message ?? 'request failed' });
}
