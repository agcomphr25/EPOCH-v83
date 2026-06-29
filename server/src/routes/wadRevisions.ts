import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { pool } from '../../db';
import { authenticateToken } from '../../middleware/auth';
import { recordAuditEvent } from '../services/auditLedgerService';

const router = Router();

const WAD_REVISION_REASONS = [
  'PO quantity change',
  'Delivery date change',
  'Drawing revision change',
  'Routing change',
  'Traveler change',
  'Work instruction change',
  'BOM/material change',
  'Quality requirement change',
  'Budget/labor change',
  'Customer requirement change',
  'NCR/CAR related change',
  'Schedule/priority change',
  'Other',
] as const;

const WAD_REVISION_APPROVAL_ROLES = ['project_manager', 'production_manager', 'quality', 'engineering', 'finance_admin'] as const;

const WAD_REVISION_ALLOWED_SYSTEM_ROLES = new Set([
  'ADMIN',
  'OWNER',
  'PROJECT_MANAGER',
  'QUALITY_MANAGER',
  'QUALITY',
  'QC',
  'PRODUCTION_MANAGER',
  'MANAGER',
]);

const APPROVER_SYSTEM_ROLES: Record<string, string[]> = {
  project_manager: ['PROJECT_MANAGER', 'ADMIN', 'OWNER'],
  production_manager: ['PRODUCTION_MANAGER', 'MANAGER', 'ADMIN', 'OWNER'],
  quality: ['QUALITY_MANAGER', 'QUALITY', 'QC', 'ADMIN', 'OWNER'],
  engineering: ['ENGINEERING', 'ENGINEER', 'ADMIN', 'OWNER'],
  finance_admin: ['FINANCE', 'ADMIN', 'OWNER'],
};

function getUser(req: Request): { id?: number | string | null; username?: string | null; displayName?: string | null; role?: string | null } | null {
  return (req as Request & { user?: any }).user ?? null;
}

function userDisplayName(req: Request): string {
  const user = getUser(req);
  return user?.displayName || user?.username || `user:${user?.id ?? 'unknown'}`;
}

function userIdNumber(req: Request): number | null {
  const id = getUser(req)?.id;
  if (typeof id === 'number') return id;
  if (id == null) return null;
  const parsed = Number.parseInt(String(id), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function requireWadRevisionRole(req: Request, res: Response, next: NextFunction) {
  const role = String(getUser(req)?.role ?? '').toUpperCase();
  if (!WAD_REVISION_ALLOWED_SYSTEM_ROLES.has(role)) {
    return res.status(403).json({
      error: 'Only Admin, Owner, Project Manager, Quality Manager, or Production Manager can create or approve WAD revisions.',
    });
  }
  next();
}

function requireApprovalRole(req: Request, res: Response, approvalRole: string): boolean {
  const systemRole = String(getUser(req)?.role ?? '').toUpperCase();
  const allowed = APPROVER_SYSTEM_ROLES[approvalRole] ?? [];
  if (!allowed.includes(systemRole)) {
    res.status(403).json({ error: `Your role cannot approve the ${approvalRole.replace(/_/g, ' ')} WAD revision slot.` });
    return false;
  }
  return true;
}

function revisionCodeFromIndex(index: number): string {
  let n = Math.max(1, index);
  let code = '';
  while (n > 0) {
    n -= 1;
    code = String.fromCharCode(65 + (n % 26)) + code;
    n = Math.floor(n / 26);
  }
  return `Rev ${code}`;
}

function requiredRolesForRevision(revision: any): string[] {
  const roles = new Set<string>(['project_manager', 'production_manager', 'quality']);
  const reason = String(revision.revision_reason ?? revision.revisionReason ?? '').toLowerCase();
  if (
    reason.includes('drawing') ||
    reason.includes('routing') ||
    reason.includes('traveler') ||
    reason.includes('work instruction') ||
    revision.impact_inspection ||
    revision.impactInspection
  ) {
    roles.add('engineering');
  }
  if (reason.includes('budget') || revision.impact_labor_budget || revision.impactLaborBudget) {
    roles.add('finance_admin');
  }
  return [...roles];
}

function mapRevision(row: any) {
  if (!row) return row;
  return {
    id: row.id,
    wadId: row.wad_id,
    revisionCode: row.revision_code,
    status: row.status,
    revisionReason: row.revision_reason,
    reasonNotes: row.reason_notes,
    impactProduction: row.impact_production,
    impactReleasedTravelers: row.impact_released_travelers,
    impactCompletedWork: row.impact_completed_work,
    impactMaterialIssued: row.impact_material_issued,
    impactInspection: row.impact_inspection,
    impactLaborBudget: row.impact_labor_budget,
    impactDeliveryDate: row.impact_delivery_date,
    impactCustomerApproval: row.impact_customer_approval,
    requiresProductionHold: row.requires_production_hold,
    effectiveDate: row.effective_date,
    wadSnapshot: row.wad_snapshot,
    createdBy: row.created_by,
    createdByDisplayName: row.created_by_display_name,
    approvedBy: row.approved_by,
    approvedByDisplayName: row.approved_by_display_name,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvals: row.approvals ?? [],
  };
}

async function revisionWithApprovals(revisionId: string) {
  const rows = await pool.query(
    `SELECT wr.*,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', ah.id,
                  'wadRevisionId', ah.wad_revision_id,
                  'approverRole', ah.approver_role,
                  'approverUserId', ah.approver_user_id,
                  'status', ah.status,
                  'comments', ah.comments,
                  'signedAt', ah.signed_at
                )
                ORDER BY ah.approver_role
              ) FILTER (WHERE ah.id IS NOT NULL),
              '[]'::json
            ) AS approvals
     FROM wad_revisions wr
     LEFT JOIN wad_revision_approval_history ah ON ah.wad_revision_id = wr.id
     WHERE wr.id = $1
     GROUP BY wr.id`,
    [revisionId],
  );
  return mapRevision(rows.rows[0] ?? null);
}

async function logWadRevisionAction(req: Request, revisionId: string, action: string, reason?: string | null, payload?: Record<string, unknown>) {
  const revision = await pool.query('SELECT wad_id, revision_code FROM wad_revisions WHERE id = $1', [revisionId]);
  const row = revision.rows[0];
  await recordAuditEvent({
    eventType: action,
    subjectType: 'wad_revision',
    subjectId: revisionId,
    sourceService: 'wadRevisions.router',
    actor: { id: userIdNumber(req), username: userDisplayName(req), role: getUser(req)?.role ?? null },
    reason: reason ?? null,
    payload: {
      wadId: row?.wad_id ?? null,
      revisionCode: row?.revision_code ?? null,
      ...payload,
    },
  }).catch((error: Error) => console.warn(`[AuditLedger] ${action} failed:`, error?.message));
}

const revisionBodySchema = z.object({
  revisionReason: z.enum(WAD_REVISION_REASONS),
  reasonNotes: z.string().trim().optional().nullable(),
  impactProduction: z.boolean().optional().default(false),
  impactReleasedTravelers: z.boolean().optional().default(false),
  impactCompletedWork: z.boolean().optional().default(false),
  impactMaterialIssued: z.boolean().optional().default(false),
  impactInspection: z.boolean().optional().default(false),
  impactLaborBudget: z.boolean().optional().default(false),
  impactDeliveryDate: z.boolean().optional().default(false),
  impactCustomerApproval: z.boolean().optional().default(false),
  requiresProductionHold: z.boolean().optional().default(false),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
}).superRefine((data, ctx) => {
  const impactValues = [
    data.impactProduction,
    data.impactReleasedTravelers,
    data.impactCompletedWork,
    data.impactMaterialIssued,
    data.impactInspection,
    data.impactLaborBudget,
    data.impactDeliveryDate,
    data.impactCustomerApproval,
    data.requiresProductionHold,
  ];
  if (data.revisionReason === 'Other' && !data.reasonNotes?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Reason notes are required when Other is selected.', path: ['reasonNotes'] });
  }
  if (impactValues.some(Boolean) && !data.reasonNotes?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Impact notes are required when any impact answer is Yes.', path: ['reasonNotes'] });
  }
});

router.get('/wads/:wadId/revisions', async (req, res) => {
  try {
    const { wadId } = req.params;
    const rows = await pool.query(
      `SELECT wr.*,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', ah.id,
                    'wadRevisionId', ah.wad_revision_id,
                    'approverRole', ah.approver_role,
                    'approverUserId', ah.approver_user_id,
                    'status', ah.status,
                    'comments', ah.comments,
                    'signedAt', ah.signed_at
                  )
                  ORDER BY ah.approver_role
                ) FILTER (WHERE ah.id IS NOT NULL),
                '[]'::json
              ) AS approvals
       FROM wad_revisions wr
       LEFT JOIN wad_revision_approval_history ah ON ah.wad_revision_id = wr.id
       WHERE wr.wad_id = $1
       GROUP BY wr.id
       ORDER BY wr.created_at DESC`,
      [wadId],
    );
    res.json(rows.rows.map(mapRevision));
  } catch (error: any) {
    console.error('[WAD Revisions] list failed:', error);
    res.status(500).json({ error: 'Failed to fetch WAD revisions', message: error.message });
  }
});

router.post('/wads/:wadId/revisions', authenticateToken, requireWadRevisionRole, async (req, res) => {
  const parsed = revisionBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });

  const client = await pool.connect();
  try {
    const { wadId } = req.params;
    await client.query('BEGIN');
    const wadRows = await client.query('SELECT * FROM production_work_orders WHERE id = $1 FOR UPDATE', [wadId]);
    const wad = wadRows.rows[0];
    if (!wad) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'WAD not found' });
    }
    if (wad.wad_status !== 'APPROVED') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Only approved WADs can create a new revision.' });
    }

    const openRows = await client.query(
      `SELECT id FROM wad_revisions
       WHERE wad_id = $1 AND status IN ('draft', 'pending_approval')
       LIMIT 1`,
      [wadId],
    );
    if (openRows.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'A draft or pending WAD revision already exists for this WAD.' });
    }

    const countRows = await client.query('SELECT COUNT(*)::int AS count FROM wad_revisions WHERE wad_id = $1', [wadId]);
    const revisionCode = revisionCodeFromIndex(Number(countRows.rows[0]?.count ?? 0) + 1);
    const data = parsed.data;
    const inserted = await client.query(
      `INSERT INTO wad_revisions (
         wad_id, revision_code, status, revision_reason, reason_notes,
         impact_production, impact_released_travelers, impact_completed_work,
         impact_material_issued, impact_inspection, impact_labor_budget,
         impact_delivery_date, impact_customer_approval, requires_production_hold,
         effective_date, wad_snapshot, created_by, created_by_display_name
       )
       VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::date, $15::jsonb, $16, $17)
       RETURNING *`,
      [
        wadId,
        revisionCode,
        data.revisionReason,
        data.reasonNotes ?? null,
        data.impactProduction,
        data.impactReleasedTravelers,
        data.impactCompletedWork,
        data.impactMaterialIssued,
        data.impactInspection,
        data.impactLaborBudget,
        data.impactDeliveryDate,
        data.impactCustomerApproval,
        data.requiresProductionHold,
        data.effectiveDate ?? null,
        JSON.stringify(wad),
        userIdNumber(req),
        userDisplayName(req),
      ],
    );
    await client.query('COMMIT');
    await logWadRevisionAction(req, inserted.rows[0].id, 'wad_revision_created', data.revisionReason, { productionHold: data.requiresProductionHold });
    if (data.requiresProductionHold) {
      await logWadRevisionAction(req, inserted.rows[0].id, 'wad_revision_production_hold_applied', data.reasonNotes ?? data.revisionReason);
    }
    res.status(201).json(mapRevision(inserted.rows[0]));
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[WAD Revisions] create failed:', error);
    res.status(500).json({ error: 'Failed to create WAD revision', message: error.message });
  } finally {
    client.release();
  }
});

router.get('/wad-revisions/:revisionId', async (req, res) => {
  try {
    const revision = await revisionWithApprovals(req.params.revisionId);
    if (!revision) return res.status(404).json({ error: 'WAD revision not found' });
    res.json(revision);
  } catch (error: any) {
    console.error('[WAD Revisions] get failed:', error);
    res.status(500).json({ error: 'Failed to fetch WAD revision', message: error.message });
  }
});

router.patch('/wad-revisions/:revisionId', authenticateToken, requireWadRevisionRole, async (req, res) => {
  const parsed = revisionBodySchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  try {
    const existing = await pool.query('SELECT * FROM wad_revisions WHERE id = $1', [req.params.revisionId]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'WAD revision not found' });
    if (existing.rows[0].status !== 'draft') return res.status(409).json({ error: 'Only draft WAD revisions can be edited.' });
    const current = existing.rows[0];
    const data = { ...current, ...parsed.data };
    const updated = await pool.query(
      `UPDATE wad_revisions
       SET revision_reason = $2,
           reason_notes = $3,
           impact_production = $4,
           impact_released_travelers = $5,
           impact_completed_work = $6,
           impact_material_issued = $7,
           impact_inspection = $8,
           impact_labor_budget = $9,
           impact_delivery_date = $10,
           impact_customer_approval = $11,
           requires_production_hold = $12,
           effective_date = $13::date,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        req.params.revisionId,
        data.revisionReason ?? data.revision_reason,
        data.reasonNotes ?? data.reason_notes,
        data.impactProduction ?? data.impact_production,
        data.impactReleasedTravelers ?? data.impact_released_travelers,
        data.impactCompletedWork ?? data.impact_completed_work,
        data.impactMaterialIssued ?? data.impact_material_issued,
        data.impactInspection ?? data.impact_inspection,
        data.impactLaborBudget ?? data.impact_labor_budget,
        data.impactDeliveryDate ?? data.impact_delivery_date,
        data.impactCustomerApproval ?? data.impact_customer_approval,
        data.requiresProductionHold ?? data.requires_production_hold,
        data.effectiveDate ?? data.effective_date,
      ],
    );
    await logWadRevisionAction(req, req.params.revisionId, 'wad_revision_updated', parsed.data.reasonNotes ?? null);
    res.json(mapRevision(updated.rows[0]));
  } catch (error: any) {
    console.error('[WAD Revisions] patch failed:', error);
    res.status(500).json({ error: 'Failed to update WAD revision', message: error.message });
  }
});

router.post('/wad-revisions/:revisionId/submit', authenticateToken, requireWadRevisionRole, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const revisionRows = await client.query('SELECT * FROM wad_revisions WHERE id = $1 FOR UPDATE', [req.params.revisionId]);
    const revision = revisionRows.rows[0];
    if (!revision) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'WAD revision not found' });
    }
    if (revision.status !== 'draft') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Only draft WAD revisions can be submitted.' });
    }
    const roles = requiredRolesForRevision(revision);
    await client.query(`UPDATE wad_revisions SET status = 'pending_approval', updated_at = NOW() WHERE id = $1`, [revision.id]);
    for (const role of roles) {
      await client.query(
        `INSERT INTO wad_revision_approval_history (wad_revision_id, approver_role, status)
         VALUES ($1, $2, 'pending')`,
        [revision.id, role],
      );
    }
    await client.query('COMMIT');
    await logWadRevisionAction(req, revision.id, 'wad_revision_submitted', revision.revision_reason, { requiredRoles: roles });
    res.json(await revisionWithApprovals(revision.id));
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[WAD Revisions] submit failed:', error);
    res.status(500).json({ error: 'Failed to submit WAD revision', message: error.message });
  } finally {
    client.release();
  }
});

const decisionBodySchema = z.object({
  approverRole: z.enum(WAD_REVISION_APPROVAL_ROLES),
  comments: z.string().trim().optional().nullable(),
});

router.post('/wad-revisions/:revisionId/approve', authenticateToken, requireWadRevisionRole, async (req, res) => {
  const parsed = decisionBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  if (!requireApprovalRole(req, res, parsed.data.approverRole)) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const revisionRows = await client.query('SELECT * FROM wad_revisions WHERE id = $1 FOR UPDATE', [req.params.revisionId]);
    const revision = revisionRows.rows[0];
    if (!revision) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'WAD revision not found' });
    }
    if (revision.status !== 'pending_approval') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Only pending WAD revisions can be approved.' });
    }
    const approval = await client.query(
      `UPDATE wad_revision_approval_history
       SET status = 'approved', approver_user_id = $3, comments = $4, signed_at = NOW()
       WHERE wad_revision_id = $1 AND approver_role = $2
       RETURNING *`,
      [revision.id, parsed.data.approverRole, userIdNumber(req), parsed.data.comments ?? null],
    );
    if (approval.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Approval slot was not found for this WAD revision.' });
    }

    const pendingRows = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM wad_revision_approval_history
       WHERE wad_revision_id = $1 AND status <> 'approved'`,
      [revision.id],
    );
    const allApproved = Number(pendingRows.rows[0]?.count ?? 0) === 0;
    let supersededRevisionIds: string[] = [];
    if (allApproved) {
      const supersededRows = await client.query(
        `UPDATE wad_revisions
         SET status = 'superseded', updated_at = NOW()
         WHERE wad_id = $1 AND status = 'approved' AND id <> $2
         RETURNING id`,
        [revision.wad_id, revision.id],
      );
      supersededRevisionIds = supersededRows.rows.map((row) => row.id);
      await client.query(
        `UPDATE wad_revisions
         SET status = 'approved', approved_by = $2, approved_by_display_name = $3, approved_at = NOW(),
             effective_date = COALESCE(effective_date, CURRENT_DATE), updated_at = NOW()
         WHERE id = $1`,
        [revision.id, userIdNumber(req), userDisplayName(req)],
      );
    }
    await client.query('COMMIT');
    await logWadRevisionAction(req, revision.id, allApproved ? 'wad_revision_approved' : 'wad_revision_approval_signed', parsed.data.comments ?? null, { approverRole: parsed.data.approverRole });
    for (const supersededRevisionId of supersededRevisionIds) {
      await logWadRevisionAction(req, supersededRevisionId, 'wad_revision_superseded', `Superseded by ${revision.revision_code}`);
    }
    if (allApproved && revision.requires_production_hold) {
      await logWadRevisionAction(req, revision.id, 'wad_revision_production_hold_removed', 'WAD revision approved');
    }
    res.json(await revisionWithApprovals(revision.id));
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[WAD Revisions] approve failed:', error);
    res.status(500).json({ error: 'Failed to approve WAD revision', message: error.message });
  } finally {
    client.release();
  }
});

router.post('/wad-revisions/:revisionId/reject', authenticateToken, requireWadRevisionRole, async (req, res) => {
  const parsed = decisionBodySchema.extend({ comments: z.string().trim().min(1, 'comments are required') }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  if (!requireApprovalRole(req, res, parsed.data.approverRole)) return;

  try {
    const updated = await pool.query(
      `UPDATE wad_revisions
       SET status = 'rejected', updated_at = NOW()
       WHERE id = $1 AND status = 'pending_approval'
       RETURNING *`,
      [req.params.revisionId],
    );
    if (!updated.rows[0]) return res.status(404).json({ error: 'Pending WAD revision not found' });
    await pool.query(
      `UPDATE wad_revision_approval_history
       SET status = CASE WHEN approver_role = $2 THEN 'rejected' ELSE status END,
           approver_user_id = CASE WHEN approver_role = $2 THEN $3 ELSE approver_user_id END,
           comments = CASE WHEN approver_role = $2 THEN $4 ELSE comments END,
           signed_at = CASE WHEN approver_role = $2 THEN NOW() ELSE signed_at END
       WHERE wad_revision_id = $1`,
      [req.params.revisionId, parsed.data.approverRole, userIdNumber(req), parsed.data.comments],
    );
    await logWadRevisionAction(req, req.params.revisionId, 'wad_revision_rejected', parsed.data.comments, { approverRole: parsed.data.approverRole });
    res.json(await revisionWithApprovals(req.params.revisionId));
  } catch (error: any) {
    console.error('[WAD Revisions] reject failed:', error);
    res.status(500).json({ error: 'Failed to reject WAD revision', message: error.message });
  }
});

export default router;
