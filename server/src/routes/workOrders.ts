import { Router, Request, Response, NextFunction } from 'express';
import { auditService } from '../services/auditService';
import { db, pool } from '../../db';
import {
  workOrders,
  workOrderParts,
  workOrderAttachments,
  assets,
  inventoryItems,
  users,
  maintenanceSchedules,
  productionWorkOrders,
  employees,
  projects,
  p2PurchaseOrders,
  p2PurchaseOrderItems,
  vendorPOItems,
  insertWorkOrderSchema,
  insertWorkOrderPartSchema,
  insertWorkOrderAttachmentSchema,
  insertProductionWorkOrderSchema,
  insertLaborThresholdSettingsSchema,
  insertLaborBudgetOverrideSchema,
  productionControlTemplates,
  wadProductionControls,
  wadDocumentLinks,
  partRoutings,
  travelers,
  travelerSteps,
  travelerTasks,
  insertWadProductionControlsSchema,
  projectSteps,
  rfqRiskAssessments,
  purchaseReviewChecklists,
  preproductionChecklists,
  preproductionChecklistSections,
  preproductionChecklistTasks,
  type LaborBudgetOverride,
  type ProductionControlTemplate,
} from '../../schema';
import { eq, desc, and, or, sql, inArray, ilike, type SQL } from 'drizzle-orm';
import { recordAuditEvent } from '../services/auditLedgerService';
import { z } from 'zod';
import { storage } from '../../storage';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { requireScopedCapability, ScopedForbiddenError } from '../permissions';
import { evaluateWorkOrderLaborStatus } from '../helpers/laborBudgetHelper';
import { evaluateWorkOrderReadiness } from '../lib/workOrderReadiness';
import { ensureProjectHasWADFromCanonicalSources } from '../lib/wadHelper';
import { evaluateDocumentationRequirements } from '../lib/documentationRequirementsEngine';
import { ensureProductionWorkflowReadSchema } from '../lib/productionWorkflowReadiness';
import { assignDashboardForWorkOrder } from '../lib/workOrderDashboardAssignment';
import {
  getProductionControlRecommendation,
  type WadContext,
  type ApprovedTemplateSummary,
} from '../services/productionControl/productionControlAI.service';
import { getProjectProductionExecutionGate } from '../services/projectProductionExecutionService';

const router = Router();

type WadStatusP2Demand = {
  projectId: string;
  p2PoCount: number;
  p2PoNumbers: string | null;
  p2DemandQuantity: number;
  p2SerializedCount: number;
  p2ActiveUnits: number;
  p2ProductionOrderCount: number;
};

async function getWadStatusP2Demand(projectIds: string[]): Promise<Map<string, WadStatusP2Demand>> {
  if (projectIds.length === 0) return new Map();

  const rows = await pool.query<{
    projectId: string;
    p2PoCount: string;
    p2PoNumbers: string | null;
    p2DemandQuantity: string;
    p2SerializedCount: string;
    p2ActiveUnits: string;
    p2ProductionOrderCount: string;
  }>(`
    WITH project_po_link AS (
      SELECT p.id AS project_id, p.po_id AS po_id
      FROM projects p
      WHERE p.id = ANY($1::uuid[])
        AND p.po_id IS NOT NULL
      UNION
      SELECT ps.project_id, ps.linked_p2_order_id AS po_id
      FROM project_steps ps
      WHERE ps.project_id = ANY($1::uuid[])
        AND ps.linked_p2_order_id IS NOT NULL
      UNION
      SELECT DISTINCT p2po.project_id, p2po.p2_po_id AS po_id
      FROM p2_production_orders p2po
      WHERE p2po.project_id = ANY($1::uuid[])
        AND p2po.project_id IS NOT NULL
      UNION
      SELECT p.id AS project_id, po.id AS po_id
      FROM p2_purchase_orders po
      JOIN projects p ON LOWER(TRIM(po.project_name)) IN (
        LOWER(TRIM(p.project_code)),
        LOWER(TRIM(p.project_name)),
        LOWER(TRIM(CONCAT_WS(' - ', NULLIF(p.project_code, ''), NULLIF(p.project_name, ''))))
      )
      WHERE p.id = ANY($1::uuid[])
        AND po.project_name IS NOT NULL
        AND TRIM(po.project_name) <> ''
        AND po.is_current_revision IS NOT FALSE
    ),
    distinct_links AS (
      SELECT DISTINCT project_id, po_id
      FROM project_po_link
      WHERE project_id IS NOT NULL
        AND po_id IS NOT NULL
    ),
    ordered_qty AS (
      SELECT dl.project_id, COALESCE(SUM(poi.quantity), 0)::int AS qty
      FROM distinct_links dl
      JOIN p2_purchase_order_items poi ON poi.po_id = dl.po_id
      GROUP BY dl.project_id
    ),
    serialized AS (
      SELECT
        dl.project_id,
        COUNT(psi.id)::int AS serialized_count,
        COUNT(psi.id) FILTER (
          WHERE COALESCE(UPPER(psi.status), '') NOT IN ('COMPLETED', 'CLOSED', 'CANCELLED', 'CANCELED', 'SCRAPPED', 'SHIPPED')
        )::int AS active_units
      FROM distinct_links dl
      JOIN p2_serialized_items psi ON psi.po_id = dl.po_id
      GROUP BY dl.project_id
    ),
    production_orders AS (
      SELECT dl.project_id, COUNT(p2po.id)::int AS production_order_count
      FROM distinct_links dl
      JOIN p2_production_orders p2po ON p2po.p2_po_id = dl.po_id
      GROUP BY dl.project_id
    )
    SELECT
      dl.project_id::text AS "projectId",
      COUNT(DISTINCT dl.po_id)::text AS "p2PoCount",
      string_agg(DISTINCT po.po_number, ', ' ORDER BY po.po_number) AS "p2PoNumbers",
      COALESCE(MAX(oq.qty), 0)::text AS "p2DemandQuantity",
      COALESCE(MAX(s.serialized_count), 0)::text AS "p2SerializedCount",
      COALESCE(MAX(s.active_units), 0)::text AS "p2ActiveUnits",
      COALESCE(MAX(po2.production_order_count), 0)::text AS "p2ProductionOrderCount"
    FROM distinct_links dl
    JOIN p2_purchase_orders po ON po.id = dl.po_id
    LEFT JOIN ordered_qty oq ON oq.project_id = dl.project_id
    LEFT JOIN serialized s ON s.project_id = dl.project_id
    LEFT JOIN production_orders po2 ON po2.project_id = dl.project_id
    GROUP BY dl.project_id
  `, [projectIds]);

  return new Map(rows.map((row) => [
    row.projectId,
    {
      projectId: row.projectId,
      p2PoCount: parseInt(row.p2PoCount, 10) || 0,
      p2PoNumbers: row.p2PoNumbers,
      p2DemandQuantity: parseInt(row.p2DemandQuantity, 10) || 0,
      p2SerializedCount: parseInt(row.p2SerializedCount, 10) || 0,
      p2ActiveUnits: parseInt(row.p2ActiveUnits, 10) || 0,
      p2ProductionOrderCount: parseInt(row.p2ProductionOrderCount, 10) || 0,
    },
  ]));
}

router.use(async (_req, res, next) => {
  try {
    await ensureProductionWorkflowReadSchema();
    next();
  } catch (error) {
    console.error('[WorkOrders] Production workflow schema readiness failed:', error);
    res.status(503).json({ error: 'Production workflow schema is being prepared, please retry' });
  }
});

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (!user || (user.role !== 'ADMIN' && user.role !== 'OWNER')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function requireSupervisorOrAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  const supervisorRoles = ['ADMIN', 'OWNER', 'SUPERVISOR', 'MANAGER'];
  if (!user || !supervisorRoles.includes(user.role)) {
    return res.status(403).json({ error: 'Supervisor or admin access required to approve labor overruns' });
  }
  next();
}

const WAD_APPROVAL_MATRIX = [
  { key: 'project_manager', label: 'Project Manager', allowedRoles: ['PROJECT_MANAGER', 'ADMIN', 'OWNER'] },
  { key: 'engineering', label: 'Engineering', allowedRoles: ['ENGINEERING', 'ADMIN', 'OWNER'] },
  { key: 'quality', label: 'Quality', allowedRoles: ['QUALITY', 'QC', 'MANAGER', 'ADMIN', 'OWNER'] },
  { key: 'operations', label: 'Operations', allowedRoles: ['OPERATIONS', 'PRODUCTION_MANAGER', 'MANAGER', 'SUPERVISOR', 'ADMIN', 'OWNER'] },
  { key: 'executive', label: 'Executive', allowedRoles: ['EXECUTIVE', 'OWNER', 'ADMIN'] },
] as const;

type WadApprovalSlot = typeof WAD_APPROVAL_MATRIX[number]['key'];
const WAD_APPROVAL_SLOTS: WadApprovalSlot[] = WAD_APPROVAL_MATRIX.map((slot) => slot.key);
const WAD_SLOT_ALLOWED_ROLES: Record<WadApprovalSlot, ReadonlyArray<string>> =
  Object.fromEntries(WAD_APPROVAL_MATRIX.map((slot) => [slot.key, slot.allowedRoles])) as Record<WadApprovalSlot, ReadonlyArray<string>>;

const WAD_LEGACY_SLOT_ALIASES: Record<string, WadApprovalSlot> = {
  production_manager: 'operations',
  finance: 'executive',
  compliance: 'executive',
};

const WAD_EXCEPTION_TYPES = ['overrun', 'charge_code_override', 'late_release_exception'] as const;
type WadExceptionType = typeof WAD_EXCEPTION_TYPES[number];

function normalizeWadApprovalRole(role: string | undefined | null): WadApprovalSlot | null {
  if (!role) return null;
  const normalized = role.trim().toLowerCase();
  if ((WAD_APPROVAL_SLOTS as readonly string[]).includes(normalized)) return normalized as WadApprovalSlot;
  return WAD_LEGACY_SLOT_ALIASES[normalized] ?? null;
}

const WAD_APPROVAL_TASK_SECTION_NAME = 'WAD Approvals';

/**
 * Sync per-role WAD approval assignments to the project's preproduction
 * checklist so the assignee sees the document signature on their My Tasks /
 * Pre-production Checklist dashboard.
 *
 * Stable lookup: tasks in the "WAD Approvals" section whose `link` matches
 * the WAD summary page, with support for older wizard deep-links.
 *
 * Backfill-safe: if the project has no linked preproduction checklist, or
 * the WAD has no assignments and no pre-existing approval tasks, this is a
 * no-op.
 */
async function syncWadApprovalChecklistTasks(params: {
  wadId: string;
  workOrderNumber: string;
  projectId: string | null;
  wizardData: Record<string, unknown>;
}): Promise<void> {
  try {
    if (!params.projectId) return;
    const [project] = await db
      .select({ checklistId: projects.linkedPreproductionChecklistId })
      .from(projects)
      .where(eq(projects.id, params.projectId))
      .limit(1);
    const checklistId = project?.checklistId ?? null;
    if (!checklistId) return;

    const rawAssignments = (params.wizardData?.approvalAssignments as Record<string, unknown>) ?? {};
    const approvals = (Array.isArray(params.wizardData?.approvals) ? params.wizardData.approvals : []) as Array<{
      role?: string;
      decision?: string;
      displayName?: string;
      timestamp?: string;
    }>;

    // Build desired map: role → { employeeId, employeeName }
    const desiredByRole = new Map<WadApprovalSlot, { employeeId: number; employeeName: string | null }>();
    for (const [rawRole, raw] of Object.entries(rawAssignments)) {
      const role = normalizeWadApprovalRole(rawRole);
      if (!role) continue;
      if (!raw || typeof raw !== 'object') continue;
      const a = raw as { employeeId?: number | string | null; employeeName?: string | null };
      const empId =
        typeof a.employeeId === 'number'
          ? a.employeeId
          : (a.employeeId != null ? Number.parseInt(String(a.employeeId), 10) : NaN);
      if (!Number.isFinite(empId) || empId <= 0) continue;
      desiredByRole.set(role, { employeeId: empId as number, employeeName: a.employeeName ?? null });
    }

    // Find or create the "WAD Approvals" section
    let [section] = await db
      .select()
      .from(preproductionChecklistSections)
      .where(
        and(
          eq(preproductionChecklistSections.checklistId, checklistId),
          eq(preproductionChecklistSections.name, WAD_APPROVAL_TASK_SECTION_NAME),
        ),
      )
      .limit(1);

    // Fetch existing tasks for this WAD (if section exists)
    type TaskRow = typeof preproductionChecklistTasks.$inferSelect;
    const existingByRole = new Map<WadApprovalSlot, TaskRow>();
    const summaryLinkPrefix = `/work-orders/${params.wadId}/wad-summary`;
    const legacyWizardLinkPrefix = `/work-orders/${params.wadId}/wizard`;

    if (section) {
      const tasks = await db
        .select()
        .from(preproductionChecklistTasks)
        .where(eq(preproductionChecklistTasks.sectionId, section.id));
      for (const t of tasks) {
        if (!t.link || (!t.link.startsWith(summaryLinkPrefix) && !t.link.startsWith(legacyWizardLinkPrefix))) continue;
        const m = t.link.match(/[?&]role=([^&]+)/);
        const role = normalizeWadApprovalRole(m ? decodeURIComponent(m[1]) : null);
        if (role) existingByRole.set(role, t);
      }
    }

    // Nothing to do, and nothing to clean up
    if (desiredByRole.size === 0 && existingByRole.size === 0) return;

    if (!section && desiredByRole.size > 0) {
      [section] = await db
        .insert(preproductionChecklistSections)
        .values({ checklistId, name: WAD_APPROVAL_TASK_SECTION_NAME, sortOrder: 999 })
        .returning();
    }
    if (!section) return;

    // Upsert one task per desired role
    for (const [role, assignment] of desiredByRole) {
      const matrixEntry = WAD_APPROVAL_MATRIX.find((s) => s.key === role);
      const roleLabel = matrixEntry?.label ?? role;
      const description = `Sign ${roleLabel} approval — WAD ${params.workOrderNumber}`;
      const link = `${summaryLinkPrefix}?role=${role}`;
      const sortOrder = WAD_APPROVAL_MATRIX.findIndex((s) => s.key === role);
      const matchingApproval = approvals.find(
        (a) => normalizeWadApprovalRole(a.role) === role && a.decision === 'APPROVED',
      );
      const isApproved = !!matchingApproval;
      const existing = existingByRole.get(role);

      if (existing) {
        const patch: Partial<typeof preproductionChecklistTasks.$inferInsert> = {
          description,
          assignedToEmployeeId: assignment.employeeId,
          assignedTo: assignment.employeeName ?? existing.assignedTo ?? null,
          link,
          sortOrder,
          updatedAt: new Date(),
        };
        if (isApproved && !existing.isCompleted) {
          patch.isCompleted = true;
          patch.completedAt = matchingApproval?.timestamp ? new Date(matchingApproval.timestamp) : new Date();
          patch.completedBy = matchingApproval?.displayName ?? assignment.employeeName ?? null;
        } else if (!isApproved && existing.isCompleted) {
          patch.isCompleted = false;
          patch.completedAt = null;
          patch.completedBy = null;
        }
        await db
          .update(preproductionChecklistTasks)
          .set(patch)
          .where(eq(preproductionChecklistTasks.id, existing.id));
      } else {
        await db.insert(preproductionChecklistTasks).values({
          sectionId: section.id,
          description,
          sortOrder,
          assignedToEmployeeId: assignment.employeeId,
          assignedTo: assignment.employeeName ?? null,
          link,
          isCompleted: isApproved,
          completedAt: isApproved
            ? (matchingApproval?.timestamp ? new Date(matchingApproval.timestamp) : new Date())
            : null,
          completedBy: isApproved ? (matchingApproval?.displayName ?? assignment.employeeName ?? null) : null,
        });
      }
    }

    // Delete tasks for roles no longer assigned
    for (const [role, task] of existingByRole) {
      if (!desiredByRole.has(role)) {
        await db.delete(preproductionChecklistTasks).where(eq(preproductionChecklistTasks.id, task.id));
      }
    }
  } catch (err) {
    // Sync failures must not break wizard save/approve — log only.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[WAD Wizard] syncWadApprovalChecklistTasks failed:', msg);
  }
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function percent(numerator: number, denominator: number | null): number | null {
  if (denominator == null || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 10000) / 100;
}

function normalizeWizardData(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return normalizeWizardData(parsed);
    } catch {
      return {};
    }
  }
  if (typeof value !== 'object' || Array.isArray(value)) return {};

  const data = value as Record<string, unknown>;
  const nested = data.wizardData ?? data.wizard_data;
  if (nested && nested !== data) {
    const normalizedNested = normalizeWizardData(nested);
    if (Object.keys(normalizedNested).length > 0) return normalizedNested;
  }

  return data;
}

function hasApprovedExceptionRequest(wizardData: Record<string, unknown>, type: WadExceptionType): boolean {
  const requests = Array.isArray(wizardData.approvalRequests) ? wizardData.approvalRequests : [];
  return requests.some((req) => {
    const r = req as { type?: string; status?: string };
    return r.type === type && r.status === 'APPROVED';
  });
}

function getWadRevisionNumber(wizardData: Record<string, unknown>): number {
  const value = toNumber(wizardData.currentRevision);
  return value != null && value > 0 ? value : 1;
}

async function calculateWadControlStatus(wad: typeof productionWorkOrders.$inferSelect, wizardData: Record<string, unknown>) {
  const step4 = (wizardData.step4 as { chargeCodes?: Array<{ budgetedHours?: number; operatorOverrideAllowed?: boolean }> } | undefined) ?? {};
  const step5 = (wizardData.step5 as { materialSpendCap?: number; outsideProcessingCap?: number } | undefined) ?? {};
  const step8 = (wizardData.step8 as { authorizedStartDate?: string; requiredCompletionDate?: string } | undefined) ?? {};

  const laborStatus = await evaluateWorkOrderLaborStatus(wad.id, undefined);
  const plannedLaborHours = (step4.chargeCodes ?? []).reduce((sum, row) => sum + (toNumber(row.budgetedHours) ?? 0), 0);
  const laborCap = toNumber(wad.totalBudgetHours) ?? (plannedLaborHours > 0 ? plannedLaborHours : null);
  const laborUsedHours = laborStatus.totalHours;
  const laborProjectedHours = Math.max(laborUsedHours, plannedLaborHours);

  const [materialRow] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${vendorPOItems.lineTotal}), 0)`,
    })
    .from(vendorPOItems)
    .where(eq(vendorPOItems.productionWorkOrderId, wad.id));

  const [outsideRow] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${vendorPOItems.lineTotal}), 0)`,
    })
    .from(vendorPOItems)
    .where(and(
      eq(vendorPOItems.productionWorkOrderId, wad.id),
      sql`(
        LOWER(COALESCE(${vendorPOItems.description}, '')) LIKE '%outside%'
        OR LOWER(COALESCE(${vendorPOItems.description}, '')) LIKE '%subcontract%'
        OR LOWER(COALESCE(${vendorPOItems.description}, '')) LIKE '%special process%'
      )`,
    ));

  const materialSpendCap = toNumber(step5.materialSpendCap);
  const materialSpendUsed = toNumber(materialRow?.total) ?? 0;
  const outsideProcessingCap = toNumber(step5.outsideProcessingCap);
  const outsideProcessingUsed = toNumber(outsideRow?.total) ?? 0;

  const hasChargeCodeOverride = (step4.chargeCodes ?? []).some((row) => row.operatorOverrideAllowed);
  const lateRelease = Boolean(step8.requiredCompletionDate && new Date(step8.requiredCompletionDate) < new Date() && wad.wadStatus !== 'APPROVED');

  const requiredExceptionRequests: WadExceptionType[] = [];
  if ((laborCap != null && laborProjectedHours > laborCap) || (materialSpendCap != null && materialSpendUsed > materialSpendCap) || (outsideProcessingCap != null && outsideProcessingUsed > outsideProcessingCap)) {
    requiredExceptionRequests.push('overrun');
  }
  if (hasChargeCodeOverride) requiredExceptionRequests.push('charge_code_override');
  if (lateRelease) requiredExceptionRequests.push('late_release_exception');

  return {
    labor: {
      usedHours: laborUsedHours,
      budgetHours: laborCap,
      plannedHours: plannedLaborHours,
      projectedHours: laborProjectedHours,
      percentUsed: percent(laborUsedHours, laborCap),
      projectedPercentUsed: percent(laborProjectedHours, laborCap),
      projectedOverrun: laborCap != null && laborProjectedHours > laborCap,
      status: laborStatus.status,
    },
    material: {
      usedSpend: materialSpendUsed,
      spendCap: materialSpendCap,
      percentUsed: percent(materialSpendUsed, materialSpendCap),
      projectedOverrun: materialSpendCap != null && materialSpendUsed > materialSpendCap,
    },
    outsideProcessing: {
      usedSpend: outsideProcessingUsed,
      spendCap: outsideProcessingCap,
      percentUsed: percent(outsideProcessingUsed, outsideProcessingCap),
      projectedOverrun: outsideProcessingCap != null && outsideProcessingUsed > outsideProcessingCap,
    },
    exceptions: {
      chargeCodeOverride: hasChargeCodeOverride,
      lateRelease,
      requiredRequests: Array.from(new Set(requiredExceptionRequests)),
      missingRequests: Array.from(new Set(requiredExceptionRequests)).filter((type) => !hasApprovedExceptionRequest(wizardData, type)),
    },
  };
}

// ==================== WORK ORDERS (MAINTENANCE EVENTS) ====================

router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, type, assetId } = req.query;
    let query = db
      .select({
        id: workOrders.id,
        assetId: workOrders.assetId,
        type: workOrders.type,
        title: workOrders.title,
        description: workOrders.description,
        priority: workOrders.priority,
        status: workOrders.status,
        severity: workOrders.severity,
        reportedAt: workOrders.reportedAt,
        startedAt: workOrders.startedAt,
        completedAt: workOrders.completedAt,
        downtimeStart: workOrders.downtimeStart,
        downtimeEnd: workOrders.downtimeEnd,
        createdBy: workOrders.createdBy,
        closedBy: workOrders.closedBy,
        maintenanceScheduleId: workOrders.maintenanceScheduleId,
        createdAt: workOrders.createdAt,
        assetName: assets.name,
        assetTag: assets.assetTag,
        createdByUsername: users.username,
      })
      .from(workOrders)
      .leftJoin(assets, eq(workOrders.assetId, assets.id))
      .leftJoin(users, eq(workOrders.createdBy, users.id))
      .orderBy(desc(workOrders.reportedAt))
      .$dynamic();

    const conditions = [];
    if (status && typeof status === 'string') {
      conditions.push(eq(workOrders.status, status));
    }
    if (type && typeof type === 'string') {
      conditions.push(eq(workOrders.type, type));
    }
    if (assetId && typeof assetId === 'string') {
      conditions.push(eq(workOrders.assetId, assetId));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const results = await query;
    res.json(results);
  } catch (error) {
    console.error('[WorkOrders] Error fetching work orders:', error);
    res.status(500).json({ error: 'Failed to fetch work orders' });
  }
});

// ==================== PRODUCTION WORK ORDERS (WAD) — EPOCH v9 spine ====================

// GET /production — list all production work orders (with project + customer + PO context) for the WAD Wizard launcher.
// Optional query params:
//   ?search=<text>           — case-insensitive match against work order #, project code/name, customer, PO #, part #
//   ?missingWad=true         — only return rows whose WAD has not yet reached APPROVED
router.get('/production', authenticateToken, requirePermission('work_orders.release'), async (req: Request, res: Response) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const missingWad = req.query.missingWad === 'true' || req.query.missingWad === '1';

    const conditions: SQL[] = [];
    if (search) {
      const like = `%${search}%`;
      const searchOr = or(
        ilike(productionWorkOrders.workOrderNumber, like),
        ilike(productionWorkOrders.partNumber, like),
        ilike(productionWorkOrders.description, like),
        ilike(projects.projectCode, like),
        ilike(projects.projectName, like),
        ilike(projects.customerNameSnapshot, like),
        ilike(p2PurchaseOrders.poNumber, like),
      );
      if (searchOr) conditions.push(searchOr);
    }
    if (missingWad) {
      // The WAD gate is satisfied only when wadStatus='APPROVED' AND
      // status='RELEASED'. A row is "missing" if either condition fails
      // (covers legacy rows that were marked APPROVED but never RELEASED,
      // and rows still in DRAFT/PENDING_APPROVAL).
      conditions.push(sql`(
        ${productionWorkOrders.wadStatus} IS NULL
        OR ${productionWorkOrders.wadStatus} <> 'APPROVED'
        OR ${productionWorkOrders.status} <> 'RELEASED'
      )`);
    }

    let q = db
      .select({
        id: productionWorkOrders.id,
        workOrderNumber: productionWorkOrders.workOrderNumber,
        projectId: productionWorkOrders.projectId,
        partNumber: productionWorkOrders.partNumber,
        description: productionWorkOrders.description,
        status: productionWorkOrders.status,
        wadStatus: productionWorkOrders.wadStatus,
        wizardData: productionWorkOrders.wizardData,
        dueDate: productionWorkOrders.dueDate,
        updatedAt: productionWorkOrders.updatedAt,
        createdAt: productionWorkOrders.createdAt,
        projectName: projects.projectName,
        projectCode: projects.projectCode,
        projectStage: projects.currentStage,
        customerName: projects.customerNameSnapshot,
        poNumber: p2PurchaseOrders.poNumber,
      })
      .from(productionWorkOrders)
      .leftJoin(projects, eq(productionWorkOrders.projectId, projects.id))
      .leftJoin(p2PurchaseOrders, eq(projects.poId, p2PurchaseOrders.id))
      .$dynamic();

    if (conditions.length > 0) q = q.where(and(...conditions));
    const rows = await q.orderBy(desc(productionWorkOrders.createdAt));
    return res.json(rows.map((row) => ({
      ...row,
      wizardData: normalizeWizardData(row.wizardData),
    })));
  } catch (err: any) {
    console.error('[ProductionWorkOrders] Error listing production work orders:', err);
    return res.status(500).json({ error: err?.message || 'Failed to list production work orders' });
  }
});

// GET /production/wad-status — WAD backlog dashboard.
// Returns one row per active project that has reached PO/WAD readiness with the
// aggregated WAD status, PWO count, latest PWO id, percent-complete (from
// wizardData), and last-edited info.
router.get('/production/wad-status', authenticateToken, requirePermission('work_orders.release'), async (_req: Request, res: Response) => {
  try {
    const projRows = await db
      .select({
        id: projects.id,
        projectCode: projects.projectCode,
        projectName: projects.projectName,
        customerName: projects.customerNameSnapshot,
        currentStage: projects.currentStage,
        poId: projects.poId,
        poNumber: p2PurchaseOrders.poNumber,
      })
      .from(projects)
      .leftJoin(p2PurchaseOrders, eq(projects.poId, p2PurchaseOrders.id))
      .where(and(
        sql`${projects.status} NOT IN ('cancelled', 'completed', 'inactive', 'lost')`,
        or(
          inArray(projects.currentStage, ['po_received', 'p2_release', 'production']),
          sql`${projects.poId} IS NOT NULL`,
          sql`EXISTS (
            SELECT 1
            FROM project_steps ps
            WHERE ps.project_id = ${projects.id}
              AND ps.status = 'completed'
              AND ps.step_type IN ('purchase_review_checklist', 'preproduction_checklist', 'p2_order')
          )`,
          sql`EXISTS (
            SELECT 1
            FROM project_steps ps
            WHERE ps.project_id = ${projects.id}
              AND ps.linked_p2_order_id IS NOT NULL
          )`,
          sql`EXISTS (
            SELECT 1
            FROM p2_production_orders p2po
            WHERE p2po.project_id = ${projects.id}
          )`,
          sql`EXISTS (
            SELECT 1
            FROM p2_purchase_orders po
            WHERE po.project_name IS NOT NULL
              AND TRIM(po.project_name) <> ''
              AND po.is_current_revision IS NOT FALSE
              AND LOWER(TRIM(po.project_name)) IN (
                LOWER(TRIM(${projects.projectCode})),
                LOWER(TRIM(${projects.projectName})),
                LOWER(TRIM(CONCAT_WS(' - ', NULLIF(${projects.projectCode}, ''), NULLIF(${projects.projectName}, ''))))
              )
          )`,
        ),
      ));

    const projectIds = projRows.map((p) => p.id);
    const p2DemandByProject = await getWadStatusP2Demand(projectIds);
    const woRows = projectIds.length > 0
      ? await db
          .select({
            id: productionWorkOrders.id,
            projectId: productionWorkOrders.projectId,
            workOrderNumber: productionWorkOrders.workOrderNumber,
            wadStatus: productionWorkOrders.wadStatus,
            status: productionWorkOrders.status,
            wizardData: productionWorkOrders.wizardData,
            updatedAt: productionWorkOrders.updatedAt,
            createdAt: productionWorkOrders.createdAt,
          })
          .from(productionWorkOrders)
          .where(inArray(productionWorkOrders.projectId, projectIds))
          .orderBy(desc(productionWorkOrders.createdAt))
      : [];

    // Rank: APPROVED (3) > PENDING_APPROVAL (2) > DRAFT (1) > NONE (0)
    type WadStatus = 'APPROVED' | 'PENDING_APPROVAL' | 'DRAFT' | null | undefined;
    const rank = (s: WadStatus) =>
      s === 'APPROVED' ? 3 : s === 'PENDING_APPROVAL' ? 2 : s === 'DRAFT' ? 1 : 0;
    const STEP_KEYS = ['step1','step2','step3','step4','step5','step6','step7','step8','step9','step10'] as const;
    type WizardData = {
      approvals?: Array<{ role?: string; decision?: string }>;
    } & Partial<Record<typeof STEP_KEYS[number], Record<string, unknown> | null>>;
    const calcPercent = (wd: unknown): number => {
      if (!wd || typeof wd !== 'object') return 0;
      const data = wd as WizardData;
      const filled = STEP_KEYS.filter((k) => {
        const v = data[k];
        return v != null && typeof v === 'object' && Object.keys(v).length > 0;
      }).length;
      const approvalsCount = Array.isArray(data.approvals) ? data.approvals.length : 0;
      // 10 step-cards + 1 approvals card + 1 final review = 12
      return Math.round(((filled + Math.min(approvalsCount, 1) + (approvalsCount >= 4 ? 1 : 0)) / 12) * 100);
    };

    const byProject = new Map<string, typeof woRows>();
    for (const w of woRows) {
      const arr = byProject.get(w.projectId) ?? [];
      arr.push(w);
      byProject.set(w.projectId, arr);
    }

    const result = projRows.map((p) => {
      const wos = byProject.get(p.id) ?? [];
      const p2Demand = p2DemandByProject.get(p.id) ?? null;
      let aggregateStatus: 'NONE' | 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' = 'NONE';
      let bestRank = 0;
      let latestPwo: typeof woRows[number] | null = null;
      let percentComplete = 0;
      // Gate truth: APPROVED WAD + RELEASED PWO satisfies the project's WAD gate.
      const gateSatisfied = wos.some((w) => w.wadStatus === 'APPROVED' && w.status === 'RELEASED');
      for (const w of wos) {
        const ws = w.wadStatus as WadStatus;
        const r = rank(ws);
        if (r > bestRank) {
          bestRank = r;
          aggregateStatus = ws === 'APPROVED' || ws === 'PENDING_APPROVAL' || ws === 'DRAFT' ? ws : 'DRAFT';
          latestPwo = w;
          percentComplete = ws === 'APPROVED' ? 100 : calcPercent(normalizeWizardData(w.wizardData));
        }
      }
      if (!latestPwo && wos.length > 0) {
        latestPwo = wos[0]; // newest
        percentComplete = calcPercent(normalizeWizardData(latestPwo.wizardData));
      }
      // "Last edited" — prefer the editor identity captured in wizardData.__meta on
      // each PATCH (see the PATCH /production/:id/wizard route). Fall back to the row's
      // updated_at timestamp when no edit metadata exists yet.
      const latestWizardData = latestPwo ? normalizeWizardData(latestPwo.wizardData) : null;
      const meta = (latestWizardData as { __meta?: { lastEditedBy?: string; lastEditedAt?: string } } | null)?.__meta;
      return {
        projectId: p.id,
        projectCode: p.projectCode,
        projectName: p.projectName,
        customerName: p.customerName,
        currentStage: p.currentStage,
        poNumber: p.poNumber ?? p2Demand?.p2PoNumbers ?? null,
        pwoCount: wos.length,
        wadStatus: aggregateStatus,
        gateSatisfied,
        p2HasProductionDemand: !!p2Demand && (
          p2Demand.p2PoCount > 0 ||
          p2Demand.p2DemandQuantity > 0 ||
          p2Demand.p2SerializedCount > 0 ||
          p2Demand.p2ProductionOrderCount > 0
        ),
        p2PoCount: p2Demand?.p2PoCount ?? 0,
        p2PoNumbers: p2Demand?.p2PoNumbers ?? null,
        p2DemandQuantity: p2Demand?.p2DemandQuantity ?? 0,
        p2SerializedCount: p2Demand?.p2SerializedCount ?? 0,
        p2ActiveUnits: p2Demand?.p2ActiveUnits ?? 0,
        p2ProductionOrderCount: p2Demand?.p2ProductionOrderCount ?? 0,
        p2WadConnectionStatus: p2Demand
          ? gateSatisfied
            ? 'P2_WAD_APPROVED'
            : wos.length > 0
              ? 'P2_WAD_INCOMPLETE'
              : 'P2_WAD_MISSING'
          : 'NO_P2_DEMAND',
        latestPwoId: latestPwo?.id ?? null,
        latestWorkOrderNumber: latestPwo?.workOrderNumber ?? null,
        percentComplete,
        lastEditedAt: meta?.lastEditedAt ?? (latestPwo?.updatedAt ? new Date(latestPwo.updatedAt).toISOString() : null),
        lastEditedBy: meta?.lastEditedBy ?? null,
      };
    });

    // Order: gate-unsatisfied first (the actual backlog), then by WAD rank,
    // then projectCode for stable ordering.
    const sortRank = (s: string) => (s === 'NONE' ? 0 : s === 'DRAFT' ? 1 : s === 'PENDING_APPROVAL' ? 2 : 3);
    result.sort((a, b) =>
      Number(a.gateSatisfied) - Number(b.gateSatisfied)
      || sortRank(a.wadStatus) - sortRank(b.wadStatus)
      || (a.projectCode ?? '').localeCompare(b.projectCode ?? '')
    );
    return res.json(result);
  } catch (err: any) {
    console.error('[ProductionWorkOrders] Error building WAD status dashboard:', err);
    return res.status(500).json({ error: err?.message || 'Failed to load WAD status' });
  }
});

// POST /production/ensure-for-project/:projectId — auto-create a PWO for a project if none exists.
// Returns the existing or newly-created PWO so the client can route straight into the WAD Wizard.
router.post('/production/ensure-for-project/:projectId', authenticateToken, requirePermission('work_orders.release'), async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    if (!WAD_UUID_RE.test(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID format' });
    }
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Delegate to the canonical helper (same creation path as quote acceptance);
    // serializes concurrent callers via a project-scoped advisory lock.
    const { workOrder, created, seedData } = await ensureProjectHasWADFromCanonicalSources(projectId);

    if (!created) {
      return res.json({ workOrder, created: false });
    }
    const wo = workOrder;

    const user = req.user;
    await recordAuditEvent({
      eventType: 'WAD_PWO_AUTO_CREATED',
      subjectType: 'production_work_order',
      subjectId: wo.id,
      sourceService: 'workOrders.router',
      actor: user
        ? { id: user.id ?? null, username: user.username ?? user.displayName ?? null, role: user.role ?? null }
        : undefined,
      payload: {
        projectId,
        projectCode: project.projectCode,
        currentStage: project.currentStage,
        seededPartNumber: seedData?.partNumber ?? null,
        seededQuantity: seedData?.quantity ?? null,
        seededDueDate: seedData?.dueDate ?? null,
        seededTotalBudgetHours: seedData?.totalBudgetHours ?? null,
        seededDepartmentBudgets: seedData?.departmentBudgets ?? null,
        sources: seedData?.sources ?? null,
        trigger: 'wad_status_dashboard',
      },
    }).catch((e: Error) => console.warn('[Audit] WAD PWO auto-create log failed:', e?.message));

    return res.status(201).json({ workOrder: wo, created: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to ensure PWO';
    console.error('[ProductionWorkOrders] Error auto-creating PWO:', err);
    return res.status(500).json({ error: message });
  }
});

// GET /project/:projectId — list production work orders for a project, newest-first
router.get('/project/:projectId', async (req: Request, res: Response) => {
  try {
    const workOrderList = await storage.getWorkOrdersByProject(req.params.projectId);
    return res.json(workOrderList);
  } catch (err: any) {
    console.error('[ProductionWorkOrders] Error fetching by project:', err);
    return res.status(500).json({ error: err?.message || 'Failed to fetch work orders' });
  }
});

// GET /:id — checks production WO first; falls back to maintenance WO for legacy compat
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Production WO lookup takes priority
    const productionWO = await storage.getWorkOrderById(id);
    if (productionWO) {
      return res.json(productionWO);
    }

    // Compatibility alias: fall through to maintenance WO for legacy clients
    const [wo] = await db
      .select({
        id: workOrders.id,
        assetId: workOrders.assetId,
        type: workOrders.type,
        title: workOrders.title,
        description: workOrders.description,
        priority: workOrders.priority,
        status: workOrders.status,
        severity: workOrders.severity,
        reportedAt: workOrders.reportedAt,
        startedAt: workOrders.startedAt,
        completedAt: workOrders.completedAt,
        downtimeStart: workOrders.downtimeStart,
        downtimeEnd: workOrders.downtimeEnd,
        createdBy: workOrders.createdBy,
        closedBy: workOrders.closedBy,
        maintenanceScheduleId: workOrders.maintenanceScheduleId,
        createdAt: workOrders.createdAt,
        assetName: assets.name,
        assetTag: assets.assetTag,
        createdByUsername: users.username,
      })
      .from(workOrders)
      .leftJoin(assets, eq(workOrders.assetId, assets.id))
      .leftJoin(users, eq(workOrders.createdBy, users.id))
      .where(eq(workOrders.id, id))
      .limit(1);

    if (!wo) {
      return res.status(404).json({ error: 'Work order not found' });
    }
    return res.json(wo);
  } catch (err: any) {
    console.error('[WorkOrders] Error fetching work order:', err);
    return res.status(500).json({ error: err?.message || 'Failed to fetch work order' });
  }
});

// GET /maintenance/:id — maintenance work order detail (legacy)
router.get('/maintenance/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [wo] = await db
      .select({
        id: workOrders.id,
        assetId: workOrders.assetId,
        type: workOrders.type,
        title: workOrders.title,
        description: workOrders.description,
        priority: workOrders.priority,
        status: workOrders.status,
        severity: workOrders.severity,
        reportedAt: workOrders.reportedAt,
        startedAt: workOrders.startedAt,
        completedAt: workOrders.completedAt,
        downtimeStart: workOrders.downtimeStart,
        downtimeEnd: workOrders.downtimeEnd,
        createdBy: workOrders.createdBy,
        closedBy: workOrders.closedBy,
        maintenanceScheduleId: workOrders.maintenanceScheduleId,
        createdAt: workOrders.createdAt,
        assetName: assets.name,
        assetTag: assets.assetTag,
        createdByUsername: users.username,
      })
      .from(workOrders)
      .leftJoin(assets, eq(workOrders.assetId, assets.id))
      .leftJoin(users, eq(workOrders.createdBy, users.id))
      .where(eq(workOrders.id, id))
      .limit(1);

    if (!wo) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    const parts = await db
      .select({
        id: workOrderParts.id,
        workOrderId: workOrderParts.workOrderId,
        inventoryItemId: workOrderParts.inventoryItemId,
        partName: workOrderParts.partName,
        quantity: workOrderParts.quantity,
        costSnapshot: workOrderParts.costSnapshot,
        inventoryPartNumber: inventoryItems.agPartNumber,
        inventoryPartName: inventoryItems.name,
      })
      .from(workOrderParts)
      .leftJoin(inventoryItems, eq(workOrderParts.inventoryItemId, inventoryItems.id))
      .where(eq(workOrderParts.workOrderId, id));

    const attachments = await db
      .select({
        id: workOrderAttachments.id,
        workOrderId: workOrderAttachments.workOrderId,
        fileUrl: workOrderAttachments.fileUrl,
        fileName: workOrderAttachments.fileName,
        uploadedBy: workOrderAttachments.uploadedBy,
        uploadedAt: workOrderAttachments.uploadedAt,
        uploadedByUsername: users.username,
      })
      .from(workOrderAttachments)
      .leftJoin(users, eq(workOrderAttachments.uploadedBy, users.id))
      .where(eq(workOrderAttachments.workOrderId, id));

    res.json({ ...wo, parts, attachments });
  } catch (error) {
    console.error('[WorkOrders] Error fetching work order:', error);
    res.status(500).json({ error: 'Failed to fetch work order' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const user = (req as any).user;

  try {
    // Production Work Order path — detected by presence of workOrderNumber
    if (req.body.workOrderNumber !== undefined) {
      // Require authentication for production WO creation
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const parsed = insertProductionWorkOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
      }
      const productionWO = await storage.createProductionWorkOrder(parsed.data);
      return res.status(201).json(productionWO);
    }

    // Maintenance Work Order path — requires admin role
    if (!user || (user.role !== 'ADMIN' && user.role !== 'OWNER')) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const parsed = insertWorkOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.issues });
    }

    const [wo] = await db.insert(workOrders).values({
      ...parsed.data,
      createdBy: user?.id,
    }).returning();

    res.status(201).json(wo);
  } catch (error) {
    console.error('[WorkOrders] Error creating work order:', error);
    res.status(500).json({ error: 'Failed to create work order' });
  }
});

router.put('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = insertWorkOrderSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.issues });
    }

    const [existing] = await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    const [updated] = await db.update(workOrders).set(parsed.data).where(eq(workOrders.id, id)).returning();
    res.json(updated);
  } catch (error) {
    console.error('[WorkOrders] Error updating work order:', error);
    res.status(500).json({ error: 'Failed to update work order' });
  }
});

// ==================== WORK ORDER STATE TRANSITIONS ====================

router.post('/:id/start', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
    if (!wo) return res.status(404).json({ error: 'Work order not found' });
    if (wo.status !== 'open' && wo.status !== 'waiting_parts') {
      return res.status(400).json({ error: `Cannot start work order with status: ${wo.status}` });
    }

    const [updated] = await db.update(workOrders).set({
      status: 'in_progress',
      startedAt: new Date(),
      downtimeStart: wo.downtimeStart || new Date(),
    }).where(eq(workOrders.id, id)).returning();

    res.json(updated);
  } catch (error) {
    console.error('[WorkOrders] Error starting work order:', error);
    res.status(500).json({ error: 'Failed to start work order' });
  }
});

router.post('/:id/complete', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
    if (!wo) return res.status(404).json({ error: 'Work order not found' });
    if (wo.status === 'completed' || wo.status === 'closed') {
      return res.status(400).json({ error: `Work order already ${wo.status}` });
    }

    const now = new Date();
    const [updated] = await db.update(workOrders).set({
      status: 'completed',
      completedAt: now,
      downtimeEnd: wo.downtimeStart ? now : null,
    }).where(eq(workOrders.id, id)).returning();

    res.json(updated);
  } catch (error) {
    console.error('[WorkOrders] Error completing work order:', error);
    res.status(500).json({ error: 'Failed to complete work order' });
  }
});

router.post('/:id/close', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
    if (!wo) return res.status(404).json({ error: 'Work order not found' });
    if (wo.status === 'closed') {
      return res.status(400).json({ error: 'Work order already closed' });
    }

    const now = new Date();
    const [updated] = await db.update(workOrders).set({
      status: 'closed',
      closedBy: userId,
      completedAt: wo.completedAt || now,
      downtimeEnd: wo.downtimeStart && !wo.downtimeEnd ? now : wo.downtimeEnd,
    }).where(eq(workOrders.id, id)).returning();

    res.json(updated);
  } catch (error) {
    console.error('[WorkOrders] Error closing work order:', error);
    res.status(500).json({ error: 'Failed to close work order' });
  }
});

// ==================== WORK ORDER PARTS ====================

router.post('/:id/add-part', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
    if (!wo) return res.status(404).json({ error: 'Work order not found' });

    const partSchema = z.object({
      inventoryItemId: z.number().int().positive().optional(),
      partName: z.string().optional(),
      quantity: z.string().or(z.number()).transform(v => String(v)),
      costSnapshot: z.string().or(z.number()).transform(v => String(v)).optional(),
    });

    const parsed = partSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.issues });
    }

    let costSnapshot = parsed.data.costSnapshot;
    if (parsed.data.inventoryItemId && !costSnapshot) {
      const [item] = await db.select({ costPer: inventoryItems.costPer }).from(inventoryItems).where(eq(inventoryItems.id, parsed.data.inventoryItemId)).limit(1);
      if (item?.costPer) {
        costSnapshot = String(item.costPer);
      }
    }

    const [part] = await db.insert(workOrderParts).values({
      workOrderId: id,
      inventoryItemId: parsed.data.inventoryItemId,
      partName: parsed.data.partName,
      quantity: parsed.data.quantity,
      costSnapshot: costSnapshot,
    }).returning();

    res.status(201).json(part);
  } catch (error) {
    console.error('[WorkOrders] Error adding part:', error);
    res.status(500).json({ error: 'Failed to add part' });
  }
});

// ==================== WORK ORDER ATTACHMENTS ====================

router.post('/:id/add-attachment', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
    if (!wo) return res.status(404).json({ error: 'Work order not found' });

    const attachSchema = z.object({
      fileUrl: z.string().min(1),
      fileName: z.string().optional(),
    });

    const parsed = attachSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.issues });
    }

    const userId = (req as any).user?.id;
    const [attachment] = await db.insert(workOrderAttachments).values({
      workOrderId: id,
      fileUrl: parsed.data.fileUrl,
      fileName: parsed.data.fileName,
      uploadedBy: userId,
    }).returning();

    res.status(201).json(attachment);
  } catch (error) {
    console.error('[WorkOrders] Error adding attachment:', error);
    res.status(500).json({ error: 'Failed to add attachment' });
  }
});

// ==================== PM-TO-WORK-ORDER GENERATION ====================

router.post('/generate-from-pm', requireAdmin, async (req: Request, res: Response) => {
  try {
    const pmSchema = z.object({
      scheduleId: z.number().int().positive(),
      assetId: z.string().uuid().optional(),
    });

    const parsed = pmSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid data', details: parsed.error.issues });
    }

    const [schedule] = await db
      .select()
      .from(maintenanceSchedules)
      .where(eq(maintenanceSchedules.id, parsed.data.scheduleId))
      .limit(1);

    if (!schedule) {
      return res.status(404).json({ error: 'Maintenance schedule not found' });
    }

    const userId = (req as any).user?.id;
    const title = `PM: ${schedule.equipment} - ${schedule.frequency} maintenance`;

    const [wo] = await db.insert(workOrders).values({
      assetId: parsed.data.assetId || null,
      type: 'preventive',
      title,
      description: schedule.description || `Scheduled ${schedule.frequency.toLowerCase()} maintenance for ${schedule.equipment}`,
      priority: 'medium',
      status: 'open',
      createdBy: userId,
      maintenanceScheduleId: schedule.id,
    }).returning();

    console.log(`[WorkOrders] Generated PM work order ${wo.id} from schedule ${schedule.id} (${schedule.equipment})`);
    res.status(201).json(wo);
  } catch (error) {
    console.error('[WorkOrders] Error generating PM work order:', error);
    res.status(500).json({ error: 'Failed to generate work order from PM schedule' });
  }
});

export { generateWorkOrderFromPM };

// ==================== PRODUCTION WORK ORDER (WAD) TRAVELER ENDPOINTS ====================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

type BlockingWadRevision = {
  id: string;
  revision_code: string;
  requires_production_hold: boolean;
};

async function getBlockingWadRevision(wadId: string): Promise<BlockingWadRevision | null> {
  const result = await pool.query<BlockingWadRevision>(
    `
      SELECT id, revision_code, requires_production_hold
      FROM wad_revisions
      WHERE wad_id = $1
        AND status IN ('draft', 'pending_approval')
        AND (
          impact_production = true
          OR impact_released_travelers = true
          OR impact_inspection = true
          OR impact_material_issued = true
          OR requires_production_hold = true
        )
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [wadId]
  );

  return result.rows[0] ?? null;
}

function sendBlockedWadRevisionResponse(res: Response, revision: BlockingWadRevision) {
  const productionHoldMessage = 'Production Hold Required — Revision approval required before continuing.';
  const pendingRevisionMessage = 'Pending WAD Revision — Production changes cannot be released until approved.';
  return res.status(409).json({
    error: revision.requires_production_hold ? productionHoldMessage : pendingRevisionMessage,
    revisionId: revision.id,
    revisionCode: revision.revision_code,
    productionHoldRequired: revision.requires_production_hold,
  });
}

// POST /api/work-orders/:id/travelers/create — create a traveler from a WAD using its part routing
router.post('/:id/travelers/create', requirePermission('work_orders.release'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!validateUuid(id)) {
      return res.status(400).json({ error: 'Invalid production work order ID format', id });
    }

    const user = (req as any).user;
    const createdBy = req.body?.createdBy ?? user?.username ?? user?.id ?? 'system';

    const blockingRevision = await getBlockingWadRevision(id);
    if (blockingRevision) {
      return sendBlockedWadRevisionResponse(res, blockingRevision);
    }

    const [wad] = await db
      .select()
      .from(productionWorkOrders)
      .where(eq(productionWorkOrders.id, id))
      .limit(1);
    if (!wad) return res.status(404).json({ error: 'Production work order not found', id });
    const v2ExecutionGate = await getProjectProductionExecutionGate(wad.projectId);
    if (!v2ExecutionGate.allowed) {
      return res.status(409).json({
        error: v2ExecutionGate.code,
        message: v2ExecutionGate.reason,
      });
    }
    const documentationPackage = evaluateDocumentationRequirements(wad);

    let traveler: Awaited<ReturnType<typeof storage.createTravelerFromProductionWorkOrder>>;
    try {
      traveler = await storage.createTravelerFromProductionWorkOrder(id, String(createdBy));
    } catch (err: any) {
      if (err?.code === 'DUPLICATE_TRAVELER') {
        return res.status(409).json({
          error: 'A traveler already exists for this work order',
          travelerId: err.travelerId,
        });
      }
      if (err?.code === 'NO_ROUTING') {
        return res.status(400).json({ error: err.message });
      }
      if (err?.message?.includes('not found')) {
        return res.status(404).json({ error: err.message });
      }
      throw err;
    }
    if (v2ExecutionGate.appliesToV2) {
      const [linkedTraveler] = await db
        .update(travelers)
        .set({ projectId: wad.projectId, updatedAt: new Date() })
        .where(eq(travelers.id, traveler.id))
        .returning();
      traveler = linkedTraveler ?? traveler;
    }

    return res.status(201).json({
      id: traveler.id,
      travelerNumber: traveler.travelerNumber,
      productionWorkOrderId: traveler.productionWorkOrderId,
      partNumber: traveler.partNumber,
      status: traveler.status,
      partRoutingId: traveler.partRoutingId,
      wadRevisionId: traveler.wadRevisionId,
      documentationPackage,
    });
  } catch (error: any) {
    console.error('[WorkOrders] Error creating traveler from WAD:', error);
    return res.status(500).json({ error: 'Failed to create traveler', message: error.message });
  }
});

// GET /api/work-orders/:id/travelers — return all travelers linked to a production WAD (newest first)
router.get('/:id/travelers', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!validateUuid(id)) {
      return res.status(400).json({ error: 'Invalid production work order ID format', id });
    }

    const [wad] = await db
      .select()
      .from(productionWorkOrders)
      .where(eq(productionWorkOrders.id, id));

    if (!wad) {
      return res.status(404).json({ error: 'Production work order not found', id });
    }

    const linkedTravelers = await storage.getTravelersByProductionWorkOrderId(id);
    res.json(linkedTravelers);
  } catch (error: any) {
    console.error('Error fetching travelers for production work order:', error);
    res.status(500).json({ error: 'Failed to fetch travelers', message: error.message });
  }
});

// POST /api/work-orders/:id/travelers/:travelerId/link — link an existing traveler to a WAD
router.post('/:id/travelers/:travelerId/link', async (req: Request, res: Response) => {
  try {
    const { id, travelerId } = req.params;

    if (!validateUuid(id)) {
      return res.status(400).json({ error: 'Invalid production work order ID format', id });
    }
    if (!validateUuid(travelerId)) {
      return res.status(400).json({ error: 'Invalid traveler ID format', travelerId });
    }

    const [wad] = await db
      .select()
      .from(productionWorkOrders)
      .where(eq(productionWorkOrders.id, id));

    if (!wad) {
      return res.status(404).json({ error: 'Production work order not found', id });
    }

    const traveler = await storage.getTraveler(travelerId);
    if (!traveler) {
      return res.status(404).json({ error: 'Traveler not found', travelerId });
    }

    const updated = await storage.linkTravelerToProductionWorkOrder(travelerId, id);
    res.json(updated);
  } catch (error: any) {
    console.error('Error linking traveler to production work order:', error);
    res.status(500).json({ error: 'Failed to link traveler', message: error.message });
  }
});

// DELETE /api/work-orders/:id/travelers/:travelerId/link — unlink a traveler from a WAD
router.delete('/:id/travelers/:travelerId/link', async (req: Request, res: Response) => {
  try {
    const { id, travelerId } = req.params;

    if (!validateUuid(id)) {
      return res.status(400).json({ error: 'Invalid production work order ID format', id });
    }
    if (!validateUuid(travelerId)) {
      return res.status(400).json({ error: 'Invalid traveler ID format', travelerId });
    }

    const [wad] = await db
      .select()
      .from(productionWorkOrders)
      .where(eq(productionWorkOrders.id, id));

    if (!wad) {
      return res.status(404).json({ error: 'Production work order not found', id });
    }

    const traveler = await storage.getTraveler(travelerId);
    if (!traveler) {
      return res.status(404).json({ error: 'Traveler not found', travelerId });
    }

    if (traveler.productionWorkOrderId !== id) {
      return res.status(400).json({
        error: 'Traveler is not linked to this production work order',
        travelerId,
        linkedWorkOrderId: traveler.productionWorkOrderId,
      });
    }

    const updated = await storage.unlinkTravelerFromProductionWorkOrder(travelerId);
    res.json(updated);
  } catch (error: any) {
    console.error('Error unlinking traveler from production work order:', error);
    res.status(500).json({ error: 'Failed to unlink traveler', message: error.message });
  }
});

// ==================== PRODUCTION WORK ORDER LABOR BUDGET ====================

const approveOverrunBodySchema = z.object({
  employeeId: z.string().min(1, 'employeeId is required'),
  supervisorEmployeeId: z.string().min(1, 'supervisorEmployeeId is required'),
  reason: z.string().min(1, 'reason is required'),
  department: z.string().optional(),
});

const SUPERVISOR_ROLES = ['ADMIN', 'OWNER', 'SUPERVISOR'];

router.post(
  '/:id/approve-overrun',
  authenticateToken,
  requirePermission('work_orders.override_charges'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      if (!validateUuid(id)) {
        return res.status(400).json({ error: 'Invalid production work order ID format', id });
      }

      const parsed = approveOverrunBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      }

      const supervisorIdRaw = parsed.data.supervisorEmployeeId.trim();

      // Validate the supervisor by employee code or strict numeric ID.
      // Use /^\d+$/ to require exact numeric format — prevents "12abc" from matching employee 12.
      const isStrictNumericId = /^\d+$/.test(supervisorIdRaw);
      const supervisorQuery = isStrictNumericId
        ? db.select({ id: employees.id, name: employees.name, employeeCode: employees.employeeCode, userRole: employees.userRole })
            .from(employees)
            .where(eq(employees.id, parseInt(supervisorIdRaw, 10)))
            .limit(1)
        : db.select({ id: employees.id, name: employees.name, employeeCode: employees.employeeCode, userRole: employees.userRole })
            .from(employees)
            .where(eq(employees.employeeCode, supervisorIdRaw))
            .limit(1);

      const [supervisor] = await supervisorQuery;

      if (!supervisor) {
        return res.status(403).json({
          error: 'SUPERVISOR_NOT_FOUND',
          message: `No employee found with ID "${supervisorIdRaw}". Please enter a valid supervisor employee ID.`,
        });
      }

      if (!SUPERVISOR_ROLES.includes(supervisor.userRole)) {
        return res.status(403).json({
          error: 'INSUFFICIENT_SUPERVISOR_ROLE',
          message: `Employee "${supervisor.name}" does not have supervisor or admin privileges to approve labor overruns.`,
        });
      }

      const [wad] = await db
        .select()
        .from(productionWorkOrders)
        .where(eq(productionWorkOrders.id, id))
        .limit(1);

      if (!wad) {
        return res.status(404).json({ error: 'Production work order not found' });
      }

      // Build overrun set from server data so scope context is never taken raw from req.body.
      const departmentBudgets = (wad.departmentBudgets as Record<string, number>) ?? {};
      const overrunDepts: string[] = [];
      for (const dept of Object.keys(departmentBudgets)) {
        const deptCheck = await evaluateWorkOrderLaborStatus(id, dept);
        if (deptCheck.status !== 'OK') overrunDepts.push(dept);
      }

      // Also evaluate overall WAD-level labor (null dept = total hours vs total budget)
      const overallLaborStatus = await evaluateWorkOrderLaborStatus(id, undefined);
      const wadHasGlobalOverrun = overallLaborStatus.status !== 'OK';

      // Derive the canonical department and final labor status from server data
      let canonicalDept: string | null;
      let laborStatus: typeof overallLaborStatus;

      if (parsed.data.department != null) {
        // Client named a specific department. Confirm it is in the server-computed overrun set.
        canonicalDept = overrunDepts.find(d => d === parsed.data.department) ?? null;
        if (canonicalDept === null) {
          return res.status(409).json({
            error: 'NO_OVERRUN_DETECTED',
            message: `No labor overrun detected for department "${parsed.data.department}" on this work order.`,
            overrunDepartments: overrunDepts,
          });
        }
        laborStatus = await evaluateWorkOrderLaborStatus(id, canonicalDept);
      } else {
        // No department specified — approve the overall WAD-level overrun.
        if (!wadHasGlobalOverrun && overrunDepts.length === 0) {
          return res.status(409).json({
            error: 'NO_OVERRUN_DETECTED',
            message: 'No labor overrun has been detected for this work order. Approval is not required.',
          });
        }
        canonicalDept = null;
        laborStatus = overallLaborStatus;
      }

      const requestingUser = (req as any).user as { id: number; role?: string } | undefined;
      await requireScopedCapability(
        requestingUser,
        'work_orders.override_charges',
        { department: canonicalDept, projectId: wad.projectId }
      );

      const approvedBy = supervisor.employeeCode
        ? `${supervisor.name} (${supervisor.employeeCode})`
        : supervisor.name;
      const approval = await storage.createLaborApproval({
        productionWorkOrderId: id,
        employeeId: parsed.data.employeeId.trim(),
        approvedBy,
        department: canonicalDept,
        reason: parsed.data.reason,
        hoursAtApproval: String(laborStatus.totalHours),
      });

      auditService.logEvent({
        entityType: 'work_order',
        entityId: id,
        action: 'LABOR_OVERRUN_APPROVED',
        actor: { id: supervisor.id, username: supervisor.name },
        reason: parsed.data.reason,
        meta: {
          supervisorEmployeeId: supervisor.id,
          supervisorName: supervisor.name,
          supervisorEmployeeCode: supervisor.employeeCode ?? undefined,
          department: canonicalDept ?? undefined,
          hoursAtApproval: laborStatus.totalHours,
          projectId: (wad as any).projectId ?? undefined,
        },
      }).catch(err => console.warn('[Audit] LABOR_OVERRUN_APPROVED log failed:', err?.message));

      return res.status(201).json({ approval, laborStatus });
    } catch (error: any) {
      if (error instanceof ScopedForbiddenError) return res.status(403).json(error.payload);
      console.error('[WorkOrders] Error creating labor approval:', error);
      return res.status(500).json({ error: 'Failed to create labor approval', message: error.message });
    }
  }
);

router.get('/:id/labor-status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { department } = req.query;

    if (!validateUuid(id)) {
      return res.status(400).json({ error: 'Invalid production work order ID format', id });
    }

    const [wad] = await db
      .select()
      .from(productionWorkOrders)
      .where(eq(productionWorkOrders.id, id))
      .limit(1);

    if (!wad) {
      return res.status(404).json({ error: 'Production work order not found' });
    }

    const laborStatus = await evaluateWorkOrderLaborStatus(id, department ? String(department) : undefined);
    const latestApproval = await storage.getLatestLaborApprovalByWorkOrder(id);
    return res.json({
      workOrderId: id,
      ...laborStatus,
      latestApprovalId: latestApproval?.id ?? null,
      latestApprovalAt: latestApproval?.approvedAt ?? null,
    });
  } catch (error: any) {
    console.error('[WorkOrders] Error fetching labor status:', error);
    return res.status(500).json({ error: 'Failed to fetch labor status', message: error.message });
  }
});

// ==================== LABOR THRESHOLD SETTINGS (system-wide) ====================

router.get('/production/labor-settings', async (req: Request, res: Response) => {
  try {
    const settings = await storage.getLaborThresholdSettings();
    if (!settings) {
      return res.json({
        warningThreshold: '0.8',
        blockedThreshold: '1.0',
        isDefault: true,
      });
    }
    return res.json({ ...settings, isDefault: false });
  } catch (error: any) {
    console.error('[WorkOrders] Error fetching labor threshold settings:', error);
    return res.status(500).json({ error: 'Failed to fetch labor threshold settings', message: error.message });
  }
});

router.put('/production/labor-settings', authenticateToken, requireSupervisorOrAdmin, async (req: Request, res: Response) => {
  try {
    const parsed = insertLaborThresholdSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid threshold values', details: parsed.error.flatten() });
    }

    const { warningThreshold, blockedThreshold } = parsed.data;
    const warning = parseFloat(warningThreshold);
    const blocked = parseFloat(blockedThreshold);

    if (warning <= 0 || warning >= blocked) {
      return res.status(400).json({ error: 'warningThreshold must be positive and less than blockedThreshold' });
    }

    const settings = await storage.upsertLaborThresholdSettings(warningThreshold, blockedThreshold);
    return res.json(settings);
  } catch (error: any) {
    console.error('[WorkOrders] Error updating labor threshold settings:', error);
    return res.status(500).json({ error: 'Failed to update labor threshold settings', message: error.message });
  }
});

// ==================== PER-WORK-ORDER THRESHOLD OVERRIDE ====================

router.patch('/production/:id/labor-thresholds', authenticateToken, requireSupervisorOrAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!validateUuid(id)) {
      return res.status(400).json({ error: 'Invalid production work order ID format', id });
    }

    const patchSchema = z.object({
      warningThreshold: z.string().regex(/^\d+(\.\d+)?$/, 'Must be a positive decimal').nullable().optional(),
      blockedThreshold: z.string().regex(/^\d+(\.\d+)?$/, 'Must be a positive decimal').nullable().optional(),
    }).refine(
      (data) => {
        const hasWarning = data.warningThreshold !== undefined;
        const hasBlocked = data.blockedThreshold !== undefined;
        return hasWarning === hasBlocked;
      },
      { message: 'warningThreshold and blockedThreshold must be provided or cleared together' }
    );

    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid threshold values', details: parsed.error.flatten() });
    }

    const { warningThreshold, blockedThreshold } = parsed.data;

    const [existing] = await db
      .select()
      .from(productionWorkOrders)
      .where(eq(productionWorkOrders.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Production work order not found' });
    }

    const newWarning = warningThreshold !== undefined ? warningThreshold : existing.warningThreshold;
    const newBlocked = blockedThreshold !== undefined ? blockedThreshold : existing.blockedThreshold;

    if (newWarning != null && newBlocked != null) {
      const w = parseFloat(String(newWarning));
      const b = parseFloat(String(newBlocked));
      if (w <= 0 || w >= b) {
        return res.status(400).json({ error: 'warningThreshold must be positive and less than blockedThreshold' });
      }
    }

    const [updated] = await db
      .update(productionWorkOrders)
      .set({
        warningThreshold: newWarning,
        blockedThreshold: newBlocked,
        updatedAt: new Date(),
      })
      .where(eq(productionWorkOrders.id, id))
      .returning();

    return res.json({
      id: updated.id,
      warningThreshold: updated.warningThreshold,
      blockedThreshold: updated.blockedThreshold,
    });
  } catch (error: any) {
    console.error('[WorkOrders] Error updating work order labor thresholds:', error);
    return res.status(500).json({ error: 'Failed to update labor thresholds', message: error.message });
  }
});

// ==================== WAD RELEASE GATE ====================

// POST /api/work-orders/:id/release — evaluate readiness and flip WAD to RELEASED
router.post('/:id/release', authenticateToken, requirePermission('work_orders.release'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!validateUuid(id)) {
      return res.status(400).json({ error: 'Invalid production work order ID format', id });
    }

    const [wad] = await db
      .select()
      .from(productionWorkOrders)
      .where(eq(productionWorkOrders.id, id))
      .limit(1);

    if (!wad) {
      return res.status(404).json({ error: 'Production work order not found', id });
    }

    const releasingUser = (req as any).user as { id: number; role?: string } | undefined;
    await requireScopedCapability(releasingUser, 'work_orders.release', { projectId: wad.projectId });

    if (wad.status === 'RELEASED') {
      return res.status(400).json({ error: 'Work order is already released to the floor' });
    }

    if (wad.status === 'IN_PROGRESS' || wad.status === 'COMPLETE' || wad.status === 'CLOSED') {
      return res.status(400).json({ error: `Cannot release a work order with status: ${wad.status}` });
    }

    const blockingRevision = await getBlockingWadRevision(id);
    if (blockingRevision) {
      return sendBlockedWadRevisionResponse(res, blockingRevision);
    }

    const readiness = await evaluateWorkOrderReadiness(id);

    if (readiness.status !== 'READY') {
      return res.status(400).json({
        error: 'Work order not ready for release to floor',
        readiness,
      });
    }

    const updated = await storage.updateWorkOrderStatus(id, 'RELEASED');
    console.log(`[WorkOrders] WAD ${id} released to floor`);

    const releasingActor = (req as any).user;
    auditService.logEvent({
      entityType: 'work_order',
      entityId: id,
      action: 'WORK_ORDER_RELEASED',
      actor: releasingActor
        ? { id: releasingActor.id, username: releasingActor.username, role: releasingActor.role }
        : undefined,
      fieldsChanged: {
        status: { before: wad.status, after: 'RELEASED' },
      },
      meta: {
        workOrderNumber: (wad as any).workOrderNumber ?? undefined,
        projectId: (wad as any).projectId ?? undefined,
      },
    }).catch(err => console.warn('[Audit] WORK_ORDER_RELEASED log failed:', err?.message));

    return res.json(updated);
  } catch (err: any) {
    if (err instanceof ScopedForbiddenError) return res.status(403).json(err.payload);
    console.error('[WorkOrders] Error releasing work order:', err);
    return res.status(500).json({ error: 'Failed to release work order', message: err?.message });
  }
});

// ==================== LABOR BUDGET OVERRIDE REQUEST WORKFLOW ====================

const SHIFT_UNLOCK_HOURS = 8; // approved override expires after one 8-hour shift

function validateProductionWadId(id: string, res: Response): boolean {
  if (!validateUuid(id)) {
    res.status(400).json({ error: 'Invalid production work order ID format', id });
    return false;
  }
  return true;
}

// POST /api/work-orders/production/:id/budget-overrides
// Operator creates a PENDING override request when blocked by budget exhaustion.
// Kiosk-mode: no session required, but operatorEmployeeId is validated against DB.
router.post('/production/:id/budget-overrides', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!validateProductionWadId(id, res)) return;

    const [wad] = await db
      .select()
      .from(productionWorkOrders)
      .where(eq(productionWorkOrders.id, id))
      .limit(1);

    if (!wad) {
      return res.status(404).json({ error: 'Production work order not found' });
    }

    const parsed = insertLaborBudgetOverrideSchema.safeParse({ ...req.body, productionWorkOrderId: id });
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const { operatorEmployeeId, operatorDisplayName, requestedHours, note } = parsed.data;

    // Validate operator identity against employees table to prevent fabricated requests
    const idRaw = operatorEmployeeId.trim();
    const isNumericId = /^\d+$/.test(idRaw);
    const [operatorRow] = await (isNumericId
      ? db.select({ id: employees.id, name: employees.name, employeeCode: employees.employeeCode })
          .from(employees)
          .where(eq(employees.id, parseInt(idRaw, 10)))
          .limit(1)
      : db.select({ id: employees.id, name: employees.name, employeeCode: employees.employeeCode })
          .from(employees)
          .where(eq(employees.employeeCode, idRaw))
          .limit(1));

    if (!operatorRow) {
      return res.status(403).json({
        error: 'OPERATOR_NOT_FOUND',
        message: `No employee found with ID "${idRaw}". Cannot submit override request.`,
      });
    }

    // Canonical display name comes from DB, not client-supplied value
    const canonicalDisplayName = operatorRow.employeeCode
      ? `${operatorRow.name} (${operatorRow.employeeCode})`
      : operatorRow.name;

    // Only one PENDING request allowed per operator per WAD
    const existing = await storage.getPendingLaborBudgetOverrideByOperator(id, String(operatorRow.id));
    if (existing) {
      return res.status(409).json({
        error: 'OVERRIDE_REQUEST_ALREADY_PENDING',
        message: 'You already have a pending override request for this work order.',
        existingOverride: existing,
      });
    }

    const override = await storage.createLaborBudgetOverride({
      productionWorkOrderId: id,
      operatorEmployeeId: String(operatorRow.id),
      operatorDisplayName: canonicalDisplayName,
      requestedHours,
      note: note ?? null,
    });

    auditService.logEvent({
      entityType: 'work_order',
      entityId: id,
      action: 'LABOR_BUDGET_OVERRIDE_REQUESTED',
      actor: { id: operatorRow.id, username: operatorRow.name },
      meta: {
        overrideId: override.id,
        operatorEmployeeId: String(operatorRow.id),
        requestedHours,
        note: note ?? null,
      },
    }).catch(err => console.warn('[Audit] LABOR_BUDGET_OVERRIDE_REQUESTED log failed:', err?.message));

    return res.status(201).json({ override });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[WorkOrders] Error creating budget override request:', err);
    return res.status(500).json({ error: 'Failed to create override request', message: msg });
  }
});

// GET /api/work-orders/production/:id/budget-overrides
// Supervisor (authenticated) fetches all requests.
// Authenticated operator may self-poll by providing operatorEmployeeId query param.
// Requires authentication — unauthenticated access is not permitted.
router.get('/production/:id/budget-overrides', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!validateProductionWadId(id, res)) return;

    const { operatorEmployeeId } = req.query;
    const authUser = req.user!;
    const SUPERVISOR_ROLES = ['ADMIN', 'OWNER', 'SUPERVISOR', 'MANAGER'];
    const isSupervisor = SUPERVISOR_ROLES.includes(authUser.role);
    const overrides = await storage.getLaborBudgetOverridesByWorkOrder(id);

    if (operatorEmployeeId && typeof operatorEmployeeId === 'string') {
      // Non-supervisors: verify the requested filter resolves to the caller's own employee record
      if (!isSupervisor) {
        const callerEmpId = authUser.employeeId;
        if (callerEmpId == null) {
          return res.status(403).json({ error: 'IDENTITY_NOT_LINKED', message: 'Session is not linked to an employee record.' });
        }
        const paramTrimmed = operatorEmployeeId.trim();
        const isNumericParam = /^\d+$/.test(paramTrimmed);
        const paramNumericId = isNumericParam ? parseInt(paramTrimmed, 10) : null;
        // Allow if the param is the caller's own numeric ID; otherwise resolve by employee code
        if (paramNumericId !== callerEmpId) {
          const [empRow] = await db.select({ id: employees.id }).from(employees)
            .where(eq(employees.employeeCode, paramTrimmed)).limit(1);
          if (!empRow || empRow.id !== callerEmpId) {
            return res.status(403).json({ error: 'UNAUTHORIZED_FILTER', message: 'You may only query your own override requests.' });
          }
        }
      }
      return res.json(overrides.filter(o => o.operatorEmployeeId === operatorEmployeeId.trim()));
    }

    // Full list with no filter: supervisor-only
    if (!isSupervisor) {
      return res.status(403).json({
        error: 'INSUFFICIENT_PERMISSIONS',
        message: 'Only supervisors and administrators may view all override requests.',
      });
    }
    return res.json(overrides);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[WorkOrders] Error fetching budget overrides:', msg);
    return res.status(500).json({ error: 'Failed to fetch budget overrides', message: msg });
  }
});

// PATCH /api/work-orders/production/:id/budget-overrides/:overrideId
// Supervisor approves or denies an override request.
// supervisorEmployeeId is optional when the authenticated session can provide identity
const resolveOverrideBodySchema = z.object({
  action: z.enum(['APPROVED', 'DENIED']),
  // Only required if req.user.employeeId is null (e.g. in kiosk/dev-bypass scenarios)
  supervisorEmployeeId: z.string().min(1).optional(),
  supervisorNote: z.string().optional(),
  additionalHours: z.number().positive().optional(), // for approval, defaults to SHIFT_UNLOCK_HOURS
});

router.patch(
  '/production/:id/budget-overrides/:overrideId',
  authenticateToken,
  requirePermission('work_orders.approve_overrun'),
  async (req: Request, res: Response) => {
    try {
      const { id, overrideId } = req.params;
      if (!validateProductionWadId(id, res)) return;

      const overrideIdNum = parseInt(overrideId, 10);
      if (isNaN(overrideIdNum)) {
        return res.status(400).json({ error: 'Invalid overrideId' });
      }

      const parsed = resolveOverrideBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      }

      const override = await storage.getLaborBudgetOverrideById(overrideIdNum);
      if (!override) {
        return res.status(404).json({ error: 'Override request not found' });
      }
      if (override.productionWorkOrderId !== id) {
        return res.status(400).json({ error: 'Override request does not belong to this work order' });
      }
      if (override.status !== 'PENDING') {
        return res.status(409).json({
          error: 'OVERRIDE_ALREADY_RESOLVED',
          message: `Override request has already been ${override.status.toLowerCase()}.`,
        });
      }

      // ── Supervisor identity resolution ───────────────────────────────────
      // Primary source: authenticated session (req.user.employeeId).
      // Fallback (dev-bypass only, where employeeId is null): body supervisorEmployeeId.
      const authUser = req.user!;
      let supervisor: { id: number; name: string; employeeCode: string | null; userRole: string | null } | undefined;

      if (authUser.employeeId != null) {
        // Authenticated user has a linked employee record — use it directly
        const [emp] = await db
          .select({ id: employees.id, name: employees.name, employeeCode: employees.employeeCode, userRole: employees.userRole })
          .from(employees)
          .where(eq(employees.id, authUser.employeeId))
          .limit(1);
        supervisor = emp;
        if (!supervisor) {
          return res.status(403).json({
            error: 'SUPERVISOR_NOT_FOUND',
            message: 'Authenticated user has no linked employee record.',
          });
        }
        // If caller also supplied a body supervisorEmployeeId, cross-check it matches
        if (parsed.data.supervisorEmployeeId) {
          const bodyIdRaw = parsed.data.supervisorEmployeeId.trim();
          const isNum = /^\d+$/.test(bodyIdRaw);
          const bodyMatchesAuth = isNum
            ? parseInt(bodyIdRaw, 10) === supervisor.id
            : bodyIdRaw === (supervisor.employeeCode ?? '');
          if (!bodyMatchesAuth) {
            return res.status(403).json({
              error: 'IDENTITY_MISMATCH',
              message: 'supervisorEmployeeId does not match the authenticated user. Omit it or provide your own ID.',
            });
          }
        }
      } else {
        // Dev-bypass or session without linked employee: fall back to body supervisorEmployeeId
        if (!parsed.data.supervisorEmployeeId) {
          return res.status(400).json({
            error: 'SUPERVISOR_ID_REQUIRED',
            message: 'supervisorEmployeeId is required when the session has no linked employee record.',
          });
        }
        const supervisorIdRaw = parsed.data.supervisorEmployeeId.trim();
        const isStrictNumericId = /^\d+$/.test(supervisorIdRaw);
        const [emp] = await (isStrictNumericId
          ? db.select({ id: employees.id, name: employees.name, employeeCode: employees.employeeCode, userRole: employees.userRole })
              .from(employees)
              .where(eq(employees.id, parseInt(supervisorIdRaw, 10)))
              .limit(1)
          : db.select({ id: employees.id, name: employees.name, employeeCode: employees.employeeCode, userRole: employees.userRole })
              .from(employees)
              .where(eq(employees.employeeCode, supervisorIdRaw))
              .limit(1));
        supervisor = emp;
        if (!supervisor) {
          return res.status(403).json({
            error: 'SUPERVISOR_NOT_FOUND',
            message: `No employee found with ID "${supervisorIdRaw}".`,
          });
        }
      }

      const SUPERVISOR_ROLES_LIST = ['ADMIN', 'OWNER', 'SUPERVISOR', 'MANAGER'];
      if (!SUPERVISOR_ROLES_LIST.includes(supervisor.userRole ?? '')) {
        return res.status(403).json({
          error: 'INSUFFICIENT_SUPERVISOR_ROLE',
          message: `Employee "${supervisor.name}" does not have supervisor privileges.`,
        });
      }

      const { action, supervisorNote, additionalHours } = parsed.data;
      const supervisorDisplayName = supervisor.employeeCode
        ? `${supervisor.name} (${supervisor.employeeCode})`
        : supervisor.name;

      // Time-box the unlock: approved overrides expire at end of current shift
      let expiresAt: Date | null = null;
      if (action === 'APPROVED') {
        const unlockHours = additionalHours ?? SHIFT_UNLOCK_HOURS;
        expiresAt = new Date(Date.now() + unlockHours * 60 * 60 * 1000);
      }

      const resolved = await storage.resolveLaborBudgetOverride(
        overrideIdNum,
        action,
        String(supervisor.id),
        supervisorDisplayName,
        supervisorNote ?? null,
        expiresAt
      );

      auditService.logEvent({
        entityType: 'work_order',
        entityId: id,
        action: action === 'APPROVED' ? 'LABOR_BUDGET_OVERRIDE_APPROVED' : 'LABOR_BUDGET_OVERRIDE_DENIED',
        actor: { id: supervisor.id, username: supervisor.name },
        reason: supervisorNote,
        meta: {
          overrideId: overrideIdNum,
          operatorEmployeeId: override.operatorEmployeeId,
          operatorDisplayName: override.operatorDisplayName,
          requestedHours: override.requestedHours,
          expiresAt: expiresAt?.toISOString() ?? null,
        },
      }).catch(err => console.warn('[Audit] LABOR_BUDGET_OVERRIDE resolution log failed:', err?.message));

      return res.json({ override: resolved });
    } catch (err) {
      if (err instanceof ScopedForbiddenError) return res.status(403).json(err.payload);
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[WorkOrders] Error resolving budget override:', err);
      return res.status(500).json({ error: 'Failed to resolve override request', message: msg });
    }
  }
);

// ==================== PRODUCTION CONTROLS (WAD Step 6) ====================

const PRODUCTION_SUPERVISOR_ROLES = ['ADMIN', 'OWNER', 'SUPERVISOR', 'MANAGER'];

function isSupervisorForProduction(user: any): boolean {
  return user && PRODUCTION_SUPERVISOR_ROLES.includes(user.role);
}

/**
 * POST /api/work-orders/production/:id/production-controls/recommend
 * Fetches WAD context + APPROVED templates, calls AI, returns recommendation (no persistence).
 */
router.post(
  '/production/:id/production-controls/recommend',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { partType, productionType } = req.body as { partType: string; productionType: string };

      if (!partType || !productionType) {
        return res.status(400).json({ error: 'partType and productionType are required' });
      }

      const [wad] = await db
        .select()
        .from(productionWorkOrders)
        .where(eq(productionWorkOrders.id, id))
        .limit(1);

      if (!wad) return res.status(404).json({ error: 'Work order not found' });

      // Fetch APPROVED templates
      const approvedTemplates: ProductionControlTemplate[] = await db
        .select()
        .from(productionControlTemplates)
        .where(eq(productionControlTemplates.approvalStatus, 'APPROVED'));

      const templateSummaries: ApprovedTemplateSummary[] = approvedTemplates.map((t) => ({
        id: t.id,
        name: t.name,
        templateType: t.templateType,
        routingType: t.routingType,
        version: t.version,
      }));

      const wadContext: WadContext = {
        workOrderId: wad.id,
        workOrderNumber: wad.workOrderNumber,
        partNumber: wad.partNumber,
        description: wad.description,
        quantity: wad.quantity,
        partType,
        productionType,
      };

      const recommendation = await getProductionControlRecommendation(wadContext, templateSummaries);

      // Enrich suggested templates with name/version for display
      const enriched: Record<string, { id: string; name: string; version: number; templateType: string } | null> = {};
      for (const [key, templateId] of Object.entries(recommendation.suggestedTemplates)) {
        if (!templateId) { enriched[key] = null; continue; }
        const tmpl = approvedTemplates.find((t) => t.id === templateId);
        enriched[key] = tmpl
          ? { id: tmpl.id, name: tmpl.name, version: tmpl.version, templateType: tmpl.templateType }
          : null;
      }

      return res.json({ ...recommendation, suggestedTemplatesEnriched: enriched, availableTemplates: templateSummaries });
    } catch (err: unknown) {
      console.error('[ProductionControls] recommend error:', err);
      return res.status(500).json({ error: 'Failed to get recommendation' });
    }
  },
);

/**
 * GET /api/work-orders/production/:id/production-controls
 * Returns the persisted controls record for this WAD (if any).
 */
router.get(
  '/production/:id/production-controls',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const [controls] = await db
        .select()
        .from(wadProductionControls)
        .where(eq(wadProductionControls.workOrderId, id))
        .limit(1);

      if (!controls) return res.status(404).json({ error: 'No production controls found for this WAD' });
      return res.json(controls);
    } catch (err: unknown) {
      console.error('[ProductionControls] get error:', err);
      return res.status(500).json({ error: 'Failed to fetch production controls' });
    }
  },
);

// Helper type for provisioning artifact summary
type ProvisionArtifact = {
  type: string;
  id: string | null;
  templateName: string | null;
  templateVersion: number | null;
};

type ProvisionSummary = {
  routingId?: string;
  travelerId?: string;
  travelerNumber?: string;
  travelerStepsCreated?: number;
  qcCheckpointsInjected?: number;
  workInstructionTemplateId?: string;
  workInstructionFileUrl?: string | null;
  specSheetTemplateId?: string;
  specSheetFileUrl?: string | null;
  artifacts: ProvisionArtifact[];
};

/**
 * POST /api/work-orders/production/:id/production-controls
 * Persists controls, runs provisioning pipeline atomically:
 *   (a) upsert controls record
 *   (b) create routing from APPROVED routing template
 *   (c) create traveler from APPROVED traveler template
 *   (d) inject QC checkpoints from APPROVED QC template
 *   (e) persist work instruction / spec sheet template links
 */
router.post(
  '/production/:id/production-controls',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = (req as any).user;

      const [wad] = await db
        .select()
        .from(productionWorkOrders)
        .where(eq(productionWorkOrders.id, id))
        .limit(1);

      if (!wad) return res.status(404).json({ error: 'Work order not found' });
      if (wad.status !== 'PLANNED') {
        return res.status(400).json({ error: 'Production controls can only be set on WADs in PLANNED status' });
      }

      // Parse and validate body
      const bodySchema = insertWadProductionControlsSchema.extend({
        selectedTemplateIds: z.record(z.string(), z.string().nullable()).optional().nullable(),
      });
      const parsed = bodySchema.safeParse({ ...req.body, workOrderId: id });
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
      }

      const controls = parsed.data;

      // HIGH risk guard — requires supervisor role
      if (controls.aiRiskLevel === 'HIGH' && !isSupervisorForProduction(user)) {
        return res.status(403).json({
          error: 'HIGH risk jobs require supervisor or admin approval before generating artifacts.',
          riskLevel: 'HIGH',
        });
      }

      const selectedTemplateIds = (controls.selectedTemplateIds ?? {}) as Record<string, string | null>;

      // ── Pre-flight: required-control and template validation ────────────────
      // Map from selectedTemplateIds key → expected templateType
      const CONTROL_TYPE_MAP: Record<string, string> = {
        routing: 'ROUTING',
        traveler: 'TRAVELER',
        qc: 'QC',
        work_instruction: 'WORK_INSTRUCTION',
        spec_sheet: 'SPEC_SHEET',
      };

      // 1) Fail fast if any required control has no template ID
      const requiredFlags: { flag: boolean; key: string; expectedType: string }[] = [
        { flag: controls.routingRequired, key: 'routing', expectedType: 'ROUTING' },
        { flag: controls.travelerRequired, key: 'traveler', expectedType: 'TRAVELER' },
        {
          flag: controls.finalQcOnly || controls.inProcessInspectionRequired || controls.spotCheckPlanRequired,
          key: 'qc',
          expectedType: 'QC',
        },
        { flag: controls.workInstructionRequired, key: 'work_instruction', expectedType: 'WORK_INSTRUCTION' },
        { flag: controls.specSheetRequired, key: 'spec_sheet', expectedType: 'SPEC_SHEET' },
      ];
      const missingRequired = requiredFlags.filter(
        ({ flag, key }) => flag && !selectedTemplateIds[key],
      );
      if (missingRequired.length > 0) {
        return res.status(400).json({
          error: 'Missing required template selections. Select an APPROVED template for each required control.',
          missing: missingRequired.map(({ key, expectedType }) => ({ controlKey: key, expectedType })),
        });
      }

      // 2) Validate that every provided ID exists, is APPROVED, and matches its expected type.
      //    Also build a versioned map so we can persist {id, version} pairs for full traceability.
      const providedIdEntries = Object.entries(selectedTemplateIds).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0,
      );
      // Map from controlKey → { id, version } — populated during validation, used when persisting
      const versionedTemplateIds: Record<string, { id: string; version: number }> = {};

      if (providedIdEntries.length > 0) {
        const fetchedTemplates = await db
          .select({
            id: productionControlTemplates.id,
            version: productionControlTemplates.version,
            approvalStatus: productionControlTemplates.approvalStatus,
            templateType: productionControlTemplates.templateType,
          })
          .from(productionControlTemplates)
          .where(inArray(productionControlTemplates.id, providedIdEntries.map(([, v]) => v)));

        const fetchedMap = new Map(fetchedTemplates.map((t) => [t.id, t]));
        const validationErrors: string[] = [];

        for (const [key, templateId] of providedIdEntries) {
          const tmpl = fetchedMap.get(templateId);
          if (!tmpl) {
            validationErrors.push(`Template ID ${templateId} (${key}) does not exist`);
          } else if (tmpl.approvalStatus !== 'APPROVED') {
            validationErrors.push(
              `Template ${templateId} (${key}) is not APPROVED (status: ${tmpl.approvalStatus})`,
            );
          } else {
            const expectedType = CONTROL_TYPE_MAP[key];
            if (expectedType && tmpl.templateType !== expectedType) {
              validationErrors.push(
                `Template ${templateId} (${key}) has wrong type: expected ${expectedType}, got ${tmpl.templateType}`,
              );
            } else {
              versionedTemplateIds[key] = { id: tmpl.id, version: tmpl.version ?? 1 };
            }
          }
        }

        if (validationErrors.length > 0) {
          return res.status(400).json({
            error: 'Template validation failed',
            details: validationErrors,
          });
        }
      }

      // ── Phase 1: Atomic — controls record + routing + WI/SS doc links ────────
      // Traveler creation happens in Phase 2 so it can reuse storage.generateTravelerFromRouting.
      const provisionSummary: ProvisionSummary = { artifacts: [] };
      let createdRoutingId: string | null = null;

      await db.transaction(async (tx) => {
        // (a) Upsert controls record
        const [existingCtrl] = await tx
          .select({ id: wadProductionControls.id })
          .from(wadProductionControls)
          .where(eq(wadProductionControls.workOrderId, id))
          .limit(1);

        const controlData = {
          workOrderId: id,
          partType: controls.partType,
          productionType: controls.productionType,
          routingRequired: controls.routingRequired,
          travelerRequired: controls.travelerRequired,
          workInstructionRequired: controls.workInstructionRequired,
          specSheetRequired: controls.specSheetRequired,
          finalQcOnly: controls.finalQcOnly,
          inProcessInspectionRequired: controls.inProcessInspectionRequired,
          spotCheckPlanRequired: controls.spotCheckPlanRequired,
          certRequired: controls.certRequired,
          aiReason: controls.aiReason ?? null,
          aiConfidenceScore: controls.aiConfidenceScore ?? null,
          aiRiskLevel: controls.aiRiskLevel ?? null,
          // Store {id, version} pairs for full traceability, not bare IDs
          selectedTemplateIds: Object.keys(versionedTemplateIds).length > 0 ? versionedTemplateIds : (controls.selectedTemplateIds ?? null),
        };

        if (existingCtrl) {
          await tx.update(wadProductionControls).set(controlData).where(eq(wadProductionControls.workOrderId, id));
        } else {
          await tx.insert(wadProductionControls).values(controlData);
        }

        // (b) Create routing from APPROVED ROUTING template
        const routingTemplateId = selectedTemplateIds['routing'] ?? null;

        if (controls.routingRequired && routingTemplateId) {
          const [tmpl] = await tx
            .select()
            .from(productionControlTemplates)
            .where(
              and(
                eq(productionControlTemplates.id, routingTemplateId),
                eq(productionControlTemplates.approvalStatus, 'APPROVED'),
                eq(productionControlTemplates.templateType, 'ROUTING'),
              ),
            )
            .limit(1);

          if (tmpl?.data) {
            const tmplData = tmpl.data as Record<string, unknown>;
            const [newRouting] = await tx
              .insert(partRoutings)
              .values({
                inventoryItemId: wad.partNumber,
                partNumber: wad.partNumber,
                partName: wad.description ?? wad.partNumber,
                routingType: (tmplData.routingType as string) ?? 'COMPOSITE',
                departmentSequence: (tmplData.departmentSequence as string[]) ?? [],
                traceabilityConfig: (tmplData.traceabilityConfig ?? {}) as Record<string, unknown>,
                departmentConfig: (tmplData.departmentConfig ?? {}) as Record<string, unknown>,
                createdFromTemplateId: tmpl.id,
                createdFromTemplateVersion: tmpl.version,
                createdBy: user?.username ?? 'system',
              })
              .returning({ id: partRoutings.id });

            createdRoutingId = newRouting.id;
            provisionSummary.routingId = newRouting.id;
            provisionSummary.artifacts.push({
              type: 'routing',
              id: newRouting.id,
              templateName: tmpl.name,
              templateVersion: tmpl.version,
            });
          }
        }

        // (e) Persist work instruction / spec sheet template links
        const wiTemplateId = selectedTemplateIds['work_instruction'] ?? null;
        const ssTemplateId = selectedTemplateIds['spec_sheet'] ?? null;

        if (wiTemplateId) {
          const [wiTmpl] = await tx
            .select()
            .from(productionControlTemplates)
            .where(
              and(
                eq(productionControlTemplates.id, wiTemplateId),
                eq(productionControlTemplates.approvalStatus, 'APPROVED'),
                eq(productionControlTemplates.templateType, 'WORK_INSTRUCTION'),
              ),
            )
            .limit(1);
          if (wiTmpl) {
            provisionSummary.workInstructionTemplateId = wiTmpl.id;
            provisionSummary.workInstructionFileUrl = wiTmpl.fileUrl;
            provisionSummary.artifacts.push({
              type: 'work_instruction',
              id: wiTmpl.id,
              templateName: wiTmpl.name,
              templateVersion: wiTmpl.version,
            });
            await tx.insert(wadDocumentLinks).values({
              workOrderId: id,
              templateId: wiTmpl.id,
              templateVersion: wiTmpl.version,
              templateType: 'WORK_INSTRUCTION',
              templateName: wiTmpl.name,
              fileUrl: wiTmpl.fileUrl ?? null,
            });
          }
        }

        if (ssTemplateId) {
          const [ssTmpl] = await tx
            .select()
            .from(productionControlTemplates)
            .where(
              and(
                eq(productionControlTemplates.id, ssTemplateId),
                eq(productionControlTemplates.approvalStatus, 'APPROVED'),
                eq(productionControlTemplates.templateType, 'SPEC_SHEET'),
              ),
            )
            .limit(1);
          if (ssTmpl) {
            provisionSummary.specSheetTemplateId = ssTmpl.id;
            provisionSummary.specSheetFileUrl = ssTmpl.fileUrl;
            provisionSummary.artifacts.push({
              type: 'spec_sheet',
              id: ssTmpl.id,
              templateName: ssTmpl.name,
              templateVersion: ssTmpl.version,
            });
            await tx.insert(wadDocumentLinks).values({
              workOrderId: id,
              templateId: ssTmpl.id,
              templateVersion: ssTmpl.version,
              templateType: 'SPEC_SHEET',
              templateName: ssTmpl.name,
              fileUrl: ssTmpl.fileUrl ?? null,
            });
          }
        }
      });

      // ── Phase 2: Traveler creation via established storage pipeline ───────────
      // When a routing exists, delegate to storage.generateTravelerFromRouting so
      // step-generation logic stays in one canonical place (avoids drift).
      // When no routing was created, fall back to materialising from traveler template JSON.
      let createdTravelerId: string | null = null;
      const travelerTemplateId = selectedTemplateIds['traveler'] ?? null;

      if (controls.travelerRequired) {
        // Fetch the traveler template (for version stamping or JSON-fallback steps)
        let travelerTmpl: (typeof productionControlTemplates.$inferSelect) | null = null;
        if (travelerTemplateId) {
          const [row] = await db
            .select()
            .from(productionControlTemplates)
            .where(
              and(
                eq(productionControlTemplates.id, travelerTemplateId),
                eq(productionControlTemplates.approvalStatus, 'APPROVED'),
                eq(productionControlTemplates.templateType, 'TRAVELER'),
              ),
            )
            .limit(1);
          travelerTmpl = row ?? null;
        }

        if (createdRoutingId) {
          // ── Primary path: reuse the established generateTravelerFromRouting pipeline
          const generatedTraveler = await storage.generateTravelerFromRouting(createdRoutingId, {
            quantity: wad.quantity ?? 1,
            createdBy: user?.username ?? 'system',
          });
          // Link the traveler to the WAD
          await storage.linkTravelerToProductionWorkOrder(generatedTraveler.id, wad.id);
          createdTravelerId = generatedTraveler.id;

          // Stamp traveler template traceability on the traveler if one was selected
          if (travelerTmpl) {
            await db
              .update(travelers)
              .set({
                createdFromTemplateId: travelerTmpl.id,
                createdFromTemplateVersion: travelerTmpl.version,
              })
              .where(eq(travelers.id, createdTravelerId));
          }
        } else if (travelerTmpl?.data) {
          // ── Fallback: no routing — materialise steps directly from traveler template JSON
          const travelerNumber = `T-${wad.workOrderNumber}-${Date.now().toString(36).toUpperCase()}`;
          const [newTraveler] = await db
            .insert(travelers)
            .values({
              travelerNumber,
              partNumber: wad.partNumber,
              partName: wad.description ?? wad.partNumber,
              productionWorkOrderId: wad.id,
              quantity: wad.quantity ?? 1,
              status: 'DRAFT',
              partRoutingId: null,
              createdFromTemplateId: travelerTmpl.id,
              createdFromTemplateVersion: travelerTmpl.version,
              createdBy: user?.username ?? 'system',
            })
            .returning({ id: travelers.id, travelerNumber: travelers.travelerNumber });

          createdTravelerId = newTraveler.id;

          type TmplTask = { phase?: string; title: string; taskType?: string; instructions?: string };
          type TmplStep = { departmentName: string; tasks?: TmplTask[] };
          const travelerTmplData = travelerTmpl.data as { steps?: TmplStep[] };
          const tmplSteps = travelerTmplData.steps ?? [];

          for (let si = 0; si < tmplSteps.length; si++) {
            const step = tmplSteps[si];
            const [newStep] = await db
              .insert(travelerSteps)
              .values({
                travelerId: newTraveler.id,
                departmentName: step.departmentName,
                stepNumber: si + 1,
                status: 'NOT_STARTED',
              })
              .returning({ id: travelerSteps.id });

            const stepTasks = step.tasks ?? [];
            for (let ti = 0; ti < stepTasks.length; ti++) {
              const task = stepTasks[ti];
              await db.insert(travelerTasks).values({
                travelerStepId: newStep.id,
                taskType: task.taskType ?? 'GENERAL',
                taskPhase: task.phase ?? 'WORK',
                title: task.title,
                instructions: task.instructions ?? null,
                required: true,
                sortOrder: ti,
                status: 'NOT_STARTED',
                templateSourceId: travelerTmpl.id,
              });
            }
          }

          provisionSummary.travelerStepsCreated = tmplSteps.length;
        }

        if (createdTravelerId) {
          const [createdTravelerRow] = await db
            .select({ id: travelers.id, travelerNumber: travelers.travelerNumber })
            .from(travelers)
            .where(eq(travelers.id, createdTravelerId))
            .limit(1);
          if (createdTravelerRow) {
            provisionSummary.travelerId = createdTravelerRow.id;
            provisionSummary.travelerNumber = createdTravelerRow.travelerNumber;
            provisionSummary.artifacts.push({
              type: 'traveler',
              id: createdTravelerRow.id,
              templateName: travelerTmpl?.name ?? null,
              templateVersion: travelerTmpl?.version ?? null,
            });
          }

          // ── Phase 3: QC checkpoint injection into traveler steps ─────────────
          const qcTemplateId = selectedTemplateIds['qc'] ?? null;
          if (qcTemplateId) {
            const [qcTmpl] = await db
              .select()
              .from(productionControlTemplates)
              .where(
                and(
                  eq(productionControlTemplates.id, qcTemplateId),
                  eq(productionControlTemplates.approvalStatus, 'APPROVED'),
                  eq(productionControlTemplates.templateType, 'QC'),
                ),
              )
              .limit(1);

            if (qcTmpl?.data) {
              type QcCheckpoint = { title: string; type?: string; instructions?: string };
              const qcData = qcTmpl.data as { checkpoints?: QcCheckpoint[] };
              const checkpoints = qcData.checkpoints ?? [];

              if (checkpoints.length > 0) {
                const [qcStep] = await db
                  .insert(travelerSteps)
                  .values({
                    travelerId: createdTravelerId,
                    departmentName: 'QC',
                    stepNumber: 999,
                    status: 'NOT_STARTED',
                  })
                  .returning({ id: travelerSteps.id });

                for (let i = 0; i < checkpoints.length; i++) {
                  const cp = checkpoints[i];
                  await db.insert(travelerTasks).values({
                    travelerStepId: qcStep.id,
                    taskType: cp.type ?? 'QC_CHECKPOINT',
                    taskPhase: 'WORK',
                    title: cp.title,
                    instructions: cp.instructions ?? null,
                    required: true,
                    sortOrder: i,
                    status: 'NOT_STARTED',
                    templateSourceId: qcTmpl.id,
                  });
                }

                provisionSummary.qcCheckpointsInjected = checkpoints.length;
                provisionSummary.artifacts.push({
                  type: 'qc_plan',
                  id: qcStep.id,
                  templateName: qcTmpl.name,
                  templateVersion: qcTmpl.version,
                });
              }
            }
          }
        }
      }

      // ── Final stamp: provisionedAt + summary ──────────────────────────────────
      const [finalControls] = await db
        .update(wadProductionControls)
        .set({
          provisionedAt: new Date(),
          provisionSummary: provisionSummary as Record<string, unknown>,
        })
        .where(eq(wadProductionControls.workOrderId, id))
        .returning();

      return res.status(201).json({ controls: finalControls, provisionSummary });
    } catch (err: unknown) {
      console.error('[ProductionControls] provision error:', err);
      return res.status(500).json({ error: 'Failed to provision production controls' });
    }
  },
);

// ==================== WAD WIZARD ROUTES ====================

const WAD_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Contract Context Defaults helper ─────────────────────────────────────────
// Builds a normalized `contractContextDefaults` object from upstream docs so the
// WAD Wizard Step 1 can be pre-populated without duplicate data entry.
//
// Precedence rules (first truthy value wins):
//   projectNumber      ← project.projectCode                           (auto:project)
//   customer           ← PO Review formData.companyName
//                        → RFQ customerName
//                        → project.customerNameSnapshot                (auto:po-review | auto:rfq | auto:project)
//   poNumber           ← p2PurchaseOrders.poNumber
//                        → PO Review formData.poNumber                 (auto:po | auto:po-review)
//   customerPartNumber ← PO Review formData.partNumber or level1ItemNumber (auto:po-review)
//   internalPartNumber ← productionWorkOrders.partNumber               (auto:wad)
//   revision           ← PO Review formData.partRevision or revision   (auto:po-review)
//   quantity           ← PO Review formData.quantityRequested
//                        → p2PurchaseOrderItems[0].quantity             (auto:po-review | auto:po)
//   shipDate           ← PO Review formData.firstArticleDueDate
//                        → p2PurchaseOrders.expectedDelivery            (auto:po-review | auto:po)
//   contractReviewStatus ← RFQ status (submitted → APPROVED, else IN_REVIEW) (auto:rfq)
//   riskAssessmentStatus ← RFQ riskDetermination presence (COMPLETE | IN_PROGRESS) (auto:rfq)
//   poReviewApproved   ← purchaseReviewChecklists.status === 'APPROVED' (auto:po-review)
type AutoSource = 'auto:project' | 'auto:po' | 'auto:po-review' | 'auto:rfq' | 'auto:wad';

interface ContractContextDefaults {
  values: {
    projectNumber: string;
    customer: string;
    poNumber: string;
    customerPartNumber: string;
    internalPartNumber: string;
    revision: string;
    quantity: number;
    shipDate: string;
    contractReviewStatus: string;
    riskAssessmentStatus: string;
    poReviewApproved: boolean;
  };
  sources: {
    projectNumber: AutoSource | null;
    customer: AutoSource | null;
    poNumber: AutoSource | null;
    customerPartNumber: AutoSource | null;
    internalPartNumber: AutoSource | null;
    revision: AutoSource | null;
    quantity: AutoSource | null;
    shipDate: AutoSource | null;
    contractReviewStatus: AutoSource | null;
    riskAssessmentStatus: AutoSource | null;
    poReviewApproved: AutoSource | null;
  };
}

async function buildContractContextDefaults(
  wad: typeof productionWorkOrders.$inferSelect,
  project: typeof projects.$inferSelect | null,
  po: typeof p2PurchaseOrders.$inferSelect | null,
): Promise<ContractContextDefaults> {
  const v: ContractContextDefaults['values'] = {
    projectNumber: '',
    customer: '',
    poNumber: '',
    customerPartNumber: '',
    internalPartNumber: '',
    revision: '',
    quantity: 1,
    shipDate: '',
    contractReviewStatus: '',
    riskAssessmentStatus: '',
    poReviewApproved: false,
  };
  const s: ContractContextDefaults['sources'] = {
    projectNumber: null,
    customer: null,
    poNumber: null,
    customerPartNumber: null,
    internalPartNumber: null,
    revision: null,
    quantity: null,
    shipDate: null,
    contractReviewStatus: null,
    riskAssessmentStatus: null,
    poReviewApproved: null,
  };

  // Project Number — always from project
  if (project?.projectCode) {
    v.projectNumber = project.projectCode;
    s.projectNumber = 'auto:project';
  }

  // Internal Part Number — from WAD's own partNumber field
  if (wad.partNumber) {
    v.internalPartNumber = wad.partNumber;
    s.internalPartNumber = 'auto:wad';
  }

  // Customer (start with project snapshot; may be overridden by PO Review or RFQ below)
  if (project?.customerNameSnapshot) {
    v.customer = project.customerNameSnapshot;
    s.customer = 'auto:project';
  }

  // Load RFQ and PO Review via project_steps
  let rfq: typeof rfqRiskAssessments.$inferSelect | null = null;
  let poReview: typeof purchaseReviewChecklists.$inferSelect | null = null;

  if (project?.id) {
    const steps = await db.select().from(projectSteps).where(eq(projectSteps.projectId, project.id));
    const rfqStep = steps.find((st) => st.stepType === 'rfq_risk_assessment');
    const prStep = steps.find((st) => st.stepType === 'purchase_review_checklist');

    if (rfqStep?.linkedRfqId) {
      const [row] = await db.select().from(rfqRiskAssessments).where(eq(rfqRiskAssessments.id, rfqStep.linkedRfqId)).limit(1);
      rfq = row ?? null;
    }
    if (prStep?.linkedPurchaseReviewId) {
      const [row] = await db.select().from(purchaseReviewChecklists).where(eq(purchaseReviewChecklists.id, prStep.linkedPurchaseReviewId)).limit(1);
      poReview = row ?? null;
    }
  }

  // ── Step A: RFQ fallbacks (lowest precedence for most fields) ─────────────
  // Customer ← RFQ customerName (overrides project snapshot)
  if (rfq?.customerName) {
    v.customer = rfq.customerName;
    s.customer = 'auto:rfq';
  }

  // Contract Review Status ← RFQ status (submitted → APPROVED, else IN_REVIEW)
  if (rfq) {
    v.contractReviewStatus = rfq.status === 'submitted' ? 'APPROVED' : 'IN_REVIEW';
    s.contractReviewStatus = 'auto:rfq';
  }

  // Risk Assessment Status ← RFQ riskDetermination presence (COMPLETE | IN_PROGRESS)
  if (rfq) {
    v.riskAssessmentStatus = rfq.riskDetermination ? 'COMPLETE' : 'IN_PROGRESS';
    s.riskAssessmentStatus = 'auto:rfq';
  }

  // Part Number / Revision / Quantity / Required Ship Date ← RFQ formData (lowest precedence)
  // RFQ forms don't always have these fields; check common key names permissively
  if (rfq) {
    const rfd = (rfq.formData ?? {}) as Record<string, unknown>;
    const rStr = (k: string) => typeof rfd[k] === 'string' ? (rfd[k] as string).trim() : '';
    const rNum = (k: string) => { const n = parseFloat(String(rfd[k] ?? '')); return Number.isFinite(n) ? n : null; };
    const rfqPartNumber = rStr('partNumber') || rStr('part_number') || rStr('itemPartNumber');
    if (!v.customerPartNumber && rfqPartNumber) { v.customerPartNumber = rfqPartNumber; s.customerPartNumber = 'auto:rfq'; }
    const rfqRevision = rStr('revision') || rStr('partRevision') || rStr('rev');
    if (!v.revision && rfqRevision) { v.revision = rfqRevision; s.revision = 'auto:rfq'; }
    const rfqQty = rNum('quantity') ?? rNum('quantityRequested');
    if ((!v.quantity || v.quantity <= 1) && rfqQty !== null && rfqQty > 0) { v.quantity = rfqQty; s.quantity = 'auto:rfq'; }
    const rfqShipDate = rStr('shipDate') || rStr('requiredDeliveryDate') || rStr('deliveryDate');
    if (!v.shipDate && rfqShipDate) { v.shipDate = rfqShipDate; s.shipDate = 'auto:rfq'; }
  }

  // ── Step B: PO Review (higher precedence than RFQ for customer/part/quantity/shipDate) ──
  if (poReview) {
    const fd = (poReview.formData ?? {}) as Record<string, unknown>;
    const str = (k: string) => typeof fd[k] === 'string' ? (fd[k] as string).trim() : '';
    const num = (k: string) => { const n = parseFloat(String(fd[k] ?? '')); return Number.isFinite(n) ? n : null; };

    // Customer name — PO Review takes precedence over RFQ and project
    if (str('companyName')) { v.customer = str('companyName'); s.customer = 'auto:po-review'; }

    // Customer Part Number ← PO Review formData level items (overrides RFQ)
    const cpn = str('partNumber') || str('level1ItemNumber') || str('level1PartsKits') || str('level2ItemNumber');
    if (cpn) { v.customerPartNumber = cpn; s.customerPartNumber = 'auto:po-review'; }

    // Part Revision ← PO Review (overrides RFQ)
    const rev = str('partRevision') || str('revision');
    if (rev) { v.revision = rev; s.revision = 'auto:po-review'; }

    // Quantity ← PO Review quantityRequested (overrides RFQ)
    const qty = num('quantityRequested');
    if (qty !== null && qty > 0) { v.quantity = qty; s.quantity = 'auto:po-review'; }

    // Ship date ← PO Review firstArticleDueDate (overrides RFQ)
    const sd = str('firstArticleDueDate') || str('deliverySchedule');
    if (sd) { v.shipDate = sd; s.shipDate = 'auto:po-review'; }

    // PO Review Approved ← checklist status
    v.poReviewApproved = poReview.status === 'APPROVED';
    s.poReviewApproved = 'auto:po-review';

    // Customer PO Number from PO Review (only if linked P2 PO has no number — PO Review is fallback)
    if (!v.poNumber && str('poNumber')) { v.poNumber = str('poNumber'); s.poNumber = 'auto:po-review'; }
  }

  // ── Step C: Linked P2 PO (highest precedence for poNumber, customer, ship date) ──
  // Task spec: Customer PO Number ← linked P2 PO → PO Review formData
  // Meaning P2 PO wins over PO Review for poNumber.
  if (po) {
    // poNumber: P2 PO takes precedence — set unconditionally (overrides PO Review)
    if (po.poNumber) { v.poNumber = po.poNumber; s.poNumber = 'auto:po'; }
    // customer: P2 PO fills gap only if still empty
    if (!v.customer && po.customerName) { v.customer = po.customerName; s.customer = 'auto:po'; }
    // ship date: P2 PO fills gap if not already set by PO Review or RFQ
    if (!v.shipDate && po.expectedDelivery) {
      v.shipDate = typeof po.expectedDelivery === 'string'
        ? po.expectedDelivery
        : (po.expectedDelivery as Date).toISOString().split('T')[0];
      s.shipDate = 'auto:po';
    }
    // Load first PO item for quantity / customer part number gaps
    if ((!v.quantity || v.quantity <= 1) || !v.customerPartNumber) {
      const [poItem] = await db
        .select()
        .from(p2PurchaseOrderItems)
        .where(eq(p2PurchaseOrderItems.poId, po.id))
        .limit(1);
      if (poItem) {
        if ((!v.quantity || v.quantity <= 1) && poItem.quantity > 0) {
          v.quantity = poItem.quantity;
          s.quantity = 'auto:po';
        }
        if (!v.customerPartNumber && poItem.partNumber) {
          v.customerPartNumber = poItem.partNumber;
          s.customerPartNumber = 'auto:po';
        }
      }
    }
  }

  return { values: v, sources: s };
}

// GET /production/:id/wizard — fetch WAD wizard data + project context for pre-population
router.get('/production/:id/wizard', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!WAD_UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid WAD ID format' });
  try {
    const [wad] = await db.select().from(productionWorkOrders).where(eq(productionWorkOrders.id, id)).limit(1);
    if (!wad) return res.status(404).json({ error: 'WAD not found' });

    // Load linked project
    const [project] = await db.select().from(projects).where(eq(projects.id, wad.projectId)).limit(1);

    // Load linked PO if available
    let po = null;
    if (project?.poId) {
      const [poRow] = await db.select().from(p2PurchaseOrders).where(eq(p2PurchaseOrders.id, project.poId)).limit(1);
      po = poRow ?? null;
    }

    const wizardData = normalizeWizardData(wad.wizardData);
    const controlStatus = await calculateWadControlStatus(wad, wizardData);

    // Build contract context defaults from upstream docs (RFQ, PO Review, PO, Project)
    const contractContextDefaults = await buildContractContextDefaults(wad, project ?? null, po);

    return res.json({
      wad: {
        ...wad,
        wizardData: {
          currentRevision: 1,
          revisionStatus: 'DRAFT',
          revisionHistory: [],
          approvalRequests: [],
          ...wizardData,
        },
      },
      project: project ?? null,
      po,
      controlStatus,
      approvalMatrix: WAD_APPROVAL_MATRIX.map(({ key, label }) => ({ key, label })),
      contractContextDefaults,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[WAD Wizard] GET error:', err);
    return res.status(500).json({ error: 'Failed to fetch WAD wizard data', message: msg });
  }
});

// GET /production/:id/documentation-requirements - shared package engine for WAD review, routing, travelers, QC, and release gates.
router.get('/production/:id/documentation-requirements', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!WAD_UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid WAD ID format' });
  try {
    const [wad] = await db.select().from(productionWorkOrders).where(eq(productionWorkOrders.id, id)).limit(1);
    if (!wad) return res.status(404).json({ error: 'WAD not found' });

    return res.json({
      wadId: wad.id,
      workOrderNumber: wad.workOrderNumber,
      documentationPackage: evaluateDocumentationRequirements(wad),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[WAD Documentation Requirements] GET error:', err);
    return res.status(500).json({ error: 'Failed to evaluate WAD documentation requirements', message: msg });
  }
});

// PATCH /production/:id/wizard — save/update wizard data (draft save, any step).
// Auth: authenticated session + work_orders.release capability (same as the approve route).
// IMPORTANT: this endpoint MUST NOT be a back-door to the APPROVED state. Transitioning a
// WAD to APPROVED is only permitted through POST /production/:id/wizard/approve, which
// enforces per-slot role authorization, records signed approvals in the immutable audit
// ledger, and atomically flips PWO.status to RELEASED. Allowed PATCH transitions are
// limited to DRAFT and PENDING_APPROVAL.
router.patch(
  '/production/:id/wizard',
  authenticateToken,
  requirePermission('work_orders.release'),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!WAD_UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid WAD ID format' });

    const sessionUser = (req as Request & { user?: { id?: number | string | null; username?: string | null; displayName?: string | null; role?: string | null } }).user;
    if (!sessionUser) return res.status(401).json({ error: 'Authentication required' });

    try {
      const [wad] = await db.select().from(productionWorkOrders).where(eq(productionWorkOrders.id, id)).limit(1);
      if (!wad) return res.status(404).json({ error: 'WAD not found' });

      if (wad.wadStatus === 'APPROVED') {
        return res.status(409).json({ error: 'WAD is already approved and cannot be modified' });
      }

      const { wizardData, wadStatus } = req.body as { wizardData?: Record<string, unknown>; wadStatus?: string };

      // Reject any attempt to flip status via PATCH — APPROVED must go through /wizard/approve.
      if (wadStatus !== undefined && wadStatus !== 'DRAFT' && wadStatus !== 'PENDING_APPROVAL') {
        return res.status(400).json({
          error: 'wadStatus may only be set to DRAFT or PENDING_APPROVAL via PATCH. ' +
            'Use POST /production/:id/wizard/approve to record approvals; APPROVED is granted server-side once all required slots are signed.',
        });
      }

      // Capture editor identity inside wizardData.__meta so launcher/dashboard can show
      // "last edited by … on …" without needing a separate column.
      const sessionDisplayName = sessionUser.displayName ?? sessionUser.username ?? `user:${sessionUser.id ?? 'unknown'}`;
      const editedAt = new Date().toISOString();
      const existingWizardData = normalizeWizardData(wad.wizardData);
      const existingMeta =
        (existingWizardData.__meta as Record<string, unknown> | undefined) ?? {};
      const existingRevisionStatus = typeof existingWizardData.revisionStatus === 'string' ? existingWizardData.revisionStatus : 'DRAFT';
      const existingRevisionHistory = Array.isArray(existingWizardData.revisionHistory) ? existingWizardData.revisionHistory : [];
      const nextRevision = existingRevisionStatus === 'NEEDS_REVISION'
        ? getWadRevisionNumber(existingWizardData) + 1
        : getWadRevisionNumber(existingWizardData);
      const revisionHistory = existingRevisionStatus === 'NEEDS_REVISION'
        ? [
            ...existingRevisionHistory,
            {
              revision: nextRevision,
              action: 'REVISION_STARTED',
              actorId: sessionUser.id ?? null,
              actorName: sessionDisplayName,
              timestamp: editedAt,
            },
          ]
        : existingRevisionHistory;

      const mergedWizardData: Record<string, unknown> = {
        ...existingWizardData,
        ...(wizardData ?? {}),
        currentRevision: nextRevision,
        revisionStatus: existingRevisionStatus === 'NEEDS_REVISION' ? 'IN_REVISION' : existingRevisionStatus,
        revisionHistory,
        approvals: existingRevisionStatus === 'NEEDS_REVISION' ? [] : existingWizardData.approvals,
        __meta: {
          ...existingMeta,
          lastEditedBy: sessionDisplayName,
          lastEditedById: sessionUser.id ?? null,
          lastEditedAt: editedAt,
        },
      };
      mergedWizardData.__documentationRequirements = evaluateDocumentationRequirements(mergedWizardData);

      const updatePayload: Partial<typeof productionWorkOrders.$inferInsert> = {
        wizardData: mergedWizardData,
        updatedAt: new Date(),
      };
      const assignment = assignDashboardForWorkOrder({
        assignedDepartment: wad.assignedDepartment,
        dashboardType: wad.dashboardType,
        queueType: wad.queueType,
        assignedDashboardRoute: wad.assignedDashboardRoute,
        wizardData: mergedWizardData,
        departmentBudgets: wad.departmentBudgets,
      });
      updatePayload.dashboardType = assignment.dashboardType;
      updatePayload.queueType = assignment.queueType;
      updatePayload.assignedDepartment = assignment.assignedDepartment;
      updatePayload.assignedDashboardRoute = assignment.assignedDashboardRoute;
      if (wadStatus === 'DRAFT' || wadStatus === 'PENDING_APPROVAL') {
        updatePayload.wadStatus = wadStatus;
      } else if (existingRevisionStatus === 'NEEDS_REVISION') {
        updatePayload.wadStatus = 'DRAFT';
      }

      const [updated] = await db
        .update(productionWorkOrders)
        .set(updatePayload)
        .where(eq(productionWorkOrders.id, id))
        .returning();

      await syncWadApprovalChecklistTasks({
        wadId: id,
        workOrderNumber: updated.workOrderNumber ?? wad.workOrderNumber,
        projectId: updated.projectId ?? wad.projectId ?? null,
        wizardData: mergedWizardData,
      });

      return res.json({ wad: updated });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[WAD Wizard] PATCH error:', err);
      return res.status(500).json({ error: 'Failed to save WAD wizard data', message: msg });
    }
  },
);

router.get('/production/:id/control-status', authenticateToken, requirePermission('work_orders.release'), async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!WAD_UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid WAD ID format' });
  try {
    const [wad] = await db.select().from(productionWorkOrders).where(eq(productionWorkOrders.id, id)).limit(1);
    if (!wad) return res.status(404).json({ error: 'WAD not found' });
    const wizardData = normalizeWizardData(wad.wizardData);
    return res.json(await calculateWadControlStatus(wad, wizardData));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[WAD Wizard] control status error:', err);
    return res.status(500).json({ error: 'Failed to calculate WAD control status', message: msg });
  }
});

const wadApprovalRequestBodySchema = z.object({
  type: z.enum(WAD_EXCEPTION_TYPES),
  action: z.enum(['REQUEST', 'APPROVE', 'REJECT']).default('REQUEST'),
  reason: z.string().min(1, 'reason is required'),
});

router.post('/production/:id/approval-requests', authenticateToken, requirePermission('work_orders.release'), async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!WAD_UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid WAD ID format' });

  const sessionUser = (req as Request & { user?: { id?: number | string | null; username?: string | null; displayName?: string | null; role?: string | null } }).user;
  if (!sessionUser) return res.status(401).json({ error: 'Authentication required' });

  const parsed = wadApprovalRequestBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
  }

  try {
    const [wad] = await db.select().from(productionWorkOrders).where(eq(productionWorkOrders.id, id)).limit(1);
    if (!wad) return res.status(404).json({ error: 'WAD not found' });

    const sessionRole = (sessionUser.role ?? '').toUpperCase();
    const canResolve = sessionRole === 'ADMIN' || sessionRole === 'OWNER' || sessionRole === 'EXECUTIVE' || sessionRole === 'PROJECT_MANAGER';
    if (parsed.data.action !== 'REQUEST' && !canResolve) {
      return res.status(403).json({ error: 'Only PM, executive, admin, or owner roles may resolve WAD exception approval requests.' });
    }

    const sessionUserIdRaw = sessionUser.id;
    const sessionUserIdNumber = typeof sessionUserIdRaw === 'number'
      ? sessionUserIdRaw
      : (sessionUserIdRaw != null ? Number.parseInt(String(sessionUserIdRaw), 10) || null : null);
    const sessionDisplayName = sessionUser.displayName ?? sessionUser.username ?? `user:${sessionUserIdRaw ?? 'unknown'}`;
    const now = new Date().toISOString();

    const existingData = normalizeWizardData(wad.wizardData);
    const existingRequests = Array.isArray(existingData.approvalRequests) ? existingData.approvalRequests : [];
    const nextRequest = {
      id: `wad-ex-${Date.now().toString(36)}`,
      type: parsed.data.type,
      status: parsed.data.action === 'APPROVE' ? 'APPROVED' : parsed.data.action === 'REJECT' ? 'REJECTED' : 'PENDING',
      reason: parsed.data.reason,
      requestedById: sessionUserIdNumber,
      requestedByName: sessionDisplayName,
      requestedAt: now,
      resolvedById: parsed.data.action === 'REQUEST' ? null : sessionUserIdNumber,
      resolvedByName: parsed.data.action === 'REQUEST' ? null : sessionDisplayName,
      resolvedAt: parsed.data.action === 'REQUEST' ? null : now,
    };

    const updatedWizardData = {
      ...existingData,
      approvalRequests: [...existingRequests, nextRequest],
    };

    const [updated] = await db
      .update(productionWorkOrders)
      .set({ wizardData: updatedWizardData, updatedAt: new Date() })
      .where(eq(productionWorkOrders.id, id))
      .returning();

    await recordAuditEvent({
      eventType: `WAD_EXCEPTION_${nextRequest.status}`,
      subjectType: 'production_work_order',
      subjectId: id,
      sourceService: 'workOrders.router',
      actor: { id: sessionUserIdNumber, username: sessionDisplayName, role: sessionRole || null },
      reason: parsed.data.reason,
      payload: {
        workOrderNumber: wad.workOrderNumber,
        projectId: wad.projectId,
        request: nextRequest,
      },
    }).catch((e: Error) => console.warn('[AuditLedger] WAD exception request ledger write failed:', e?.message));

    return res.status(201).json({ wad: updated, request: nextRequest });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[WAD Wizard] approval request error:', err);
    return res.status(500).json({ error: 'Failed to record WAD approval request', message: msg });
  }
});

// POST /production/:id/wizard/approve — record an approval role decision.
// Auth: an authenticated session is required, plus the work_orders.release capability
// (the same gate used for the P2 release flow this approval implicitly satisfies).
// Identity (userId / displayName / system role) is taken from req.user — never the body —
// so an attacker cannot spoof the approver. The body's `role` field selects which WAD
// approval slot is being filled (PM / engineering / quality / operations / executive);
// the user must hold the system-level capability to fill it, enforced via the slot policy.

router.post(
  '/production/:id/wizard/approve',
  authenticateToken,
  requirePermission('work_orders.release'),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!WAD_UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid WAD ID format' });

    const sessionUser = (req as Request & { user?: { id?: number | string | null; username?: string | null; displayName?: string | null; role?: string | null } }).user;
    if (!sessionUser) return res.status(401).json({ error: 'Authentication required' });

    try {
      const [wad] = await db.select().from(productionWorkOrders).where(eq(productionWorkOrders.id, id)).limit(1);
      if (!wad) return res.status(404).json({ error: 'WAD not found' });

      const body = req.body as {
        role?: string;
        decision?: 'APPROVED' | 'REJECTED';
        comments?: string | null;
        signature?: string | null;
      };
      const role = normalizeWadApprovalRole(body.role);
      const decision = body.decision;
      const comments = typeof body.comments === 'string' && body.comments.trim() ? body.comments.trim() : null;
      const signature = typeof body.signature === 'string' ? body.signature.trim() : '';

      if (!role) {
        return res.status(400).json({ error: `role must be one of: ${WAD_APPROVAL_SLOTS.join(', ')}` });
      }
      if (decision !== 'APPROVED' && decision !== 'REJECTED') {
        return res.status(400).json({ error: 'decision must be APPROVED or REJECTED' });
      }
      if (signature.length < 2) {
        return res.status(400).json({ error: 'A typed signature is required to approve or deny a WAD' });
      }
      if (decision === 'REJECTED' && !comments) {
        return res.status(400).json({ error: 'Denial notes are required when rejecting a WAD approval slot' });
      }

      // Slot authorization: verify the session user holds a system role permitted to fill this slot.
      const sessionRole = (sessionUser.role ?? '').toUpperCase();
      const allowedForSlot = WAD_SLOT_ALLOWED_ROLES[role];
      const isSuperUser = sessionRole === 'ADMIN' || sessionRole === 'OWNER';
      if (!isSuperUser && !allowedForSlot.includes(sessionRole)) {
        return res.status(403).json({
          error: `Your role (${sessionRole || 'unknown'}) is not permitted to sign the '${role}' WAD slot`,
          allowedRoles: allowedForSlot,
        });
      }

      // Server-derived identity — the body's userId/displayName are intentionally ignored.
      const sessionUserIdRaw = sessionUser.id;
      const sessionUserIdNumber = typeof sessionUserIdRaw === 'number'
        ? sessionUserIdRaw
        : (sessionUserIdRaw != null ? Number.parseInt(String(sessionUserIdRaw), 10) || null : null);
      const sessionDisplayName = sessionUser.displayName ?? sessionUser.username ?? `user:${sessionUserIdRaw ?? 'unknown'}`;

      const existingData = normalizeWizardData(wad.wizardData);
      const existingApprovals = (existingData.approvals as unknown[] ?? []) as Array<{
        role?: string; userId?: number | string | null; displayName?: string; decision?: string;
        comments?: string | null; signature?: string | null; signedAt?: string | null; timestamp?: string;
      }>;
      const existingRevisionHistory = Array.isArray(existingData.revisionHistory) ? existingData.revisionHistory : [];
      const currentRevision = getWadRevisionNumber(existingData);

      const newApproval = {
        role,
        userId: sessionUserIdNumber,
        displayName: sessionDisplayName,
        decision,
        comments,
        signature,
        signatureMeaning: 'Typed signature confirms the signer reviewed the WAD summary and accepts responsibility for this decision.',
        signedAt: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      };

      const updatedApprovals = [
        ...existingApprovals.filter((a) => normalizeWadApprovalRole(a.role) !== role),
        newApproval,
      ];

      const revisionEvent = {
        revision: currentRevision,
        action: decision === 'APPROVED' ? 'APPROVAL_RECORDED' : 'REJECTION_RECORDED',
        role,
        actorId: sessionUserIdNumber,
        actorName: sessionDisplayName,
        comments,
        signatureMeaning: newApproval.signatureMeaning,
        signedAt: newApproval.signedAt,
        timestamp: newApproval.timestamp,
      };

      const updatedWizardData = {
        ...existingData,
        currentRevision,
        revisionStatus: decision === 'REJECTED' ? 'NEEDS_REVISION' : existingData.revisionStatus ?? 'IN_REVIEW',
        approvals: updatedApprovals,
        revisionHistory: [...existingRevisionHistory, revisionEvent],
      };

      // Determine required roles for full approval (PM, engineering, quality, operations, executive).
      const requiredRoles: WadApprovalSlot[] = [...WAD_APPROVAL_SLOTS];
      const allApproved = requiredRoles.every((r) =>
        updatedApprovals.some((a) => normalizeWadApprovalRole(a.role) === r && a.decision === 'APPROVED')
      );

      const controlStatus = await calculateWadControlStatus(wad, updatedWizardData);
      const missingExceptionRequests = controlStatus.exceptions.missingRequests;
      const releaseApproved = allApproved && missingExceptionRequests.length === 0;

      const newWadStatus = releaseApproved ? 'APPROVED' : (decision === 'REJECTED' ? 'DRAFT' : wad.wadStatus);

      // Detect backfill: WAD reaching APPROVED while project is already in production.
      let isBackfill = false;
      let projectStage: string | null = null;
      if (releaseApproved && wad.projectId) {
        const [p] = await db.select({ currentStage: projects.currentStage })
          .from(projects).where(eq(projects.id, wad.projectId)).limit(1);
        projectStage = p?.currentStage ?? null;
        isBackfill = projectStage === 'production';
      }

      // When the WAD reaches APPROVED, also flip the work order status to RELEASED
      // so the project's WAD gate is satisfied without re-running the P2 release flow.
      const updateSet: Partial<typeof productionWorkOrders.$inferInsert> = {
        wizardData: updatedWizardData,
        wadStatus: newWadStatus,
        updatedAt: new Date(),
      };
      const assignment = assignDashboardForWorkOrder({
        assignedDepartment: wad.assignedDepartment,
        dashboardType: wad.dashboardType,
        queueType: wad.queueType,
        assignedDashboardRoute: wad.assignedDashboardRoute,
        wizardData: updatedWizardData,
        departmentBudgets: wad.departmentBudgets,
      });
      updateSet.dashboardType = assignment.dashboardType;
      updateSet.queueType = assignment.queueType;
      updateSet.assignedDepartment = assignment.assignedDepartment;
      updateSet.assignedDashboardRoute = assignment.assignedDashboardRoute;
      // Backfill gate contract: any non-terminal PWO must end up RELEASED on
      // approval so the project's WAD gate flips ✓ regardless of where the PWO
      // sat before approval (e.g. PLANNED, READY, IN_PROGRESS for backfill).
      const TERMINAL_STATUSES = new Set(['COMPLETE', 'COMPLETED', 'CANCELLED', 'CANCELED', 'CLOSED']);
      if (releaseApproved && wad.status !== 'RELEASED' && !TERMINAL_STATUSES.has(wad.status)) {
        updateSet.status = 'RELEASED';
      }

      const [updated] = await db
        .update(productionWorkOrders)
        .set(updateSet)
        .where(eq(productionWorkOrders.id, id))
        .returning();

      await syncWadApprovalChecklistTasks({
        wadId: id,
        workOrderNumber: updated.workOrderNumber ?? wad.workOrderNumber,
        projectId: updated.projectId ?? wad.projectId ?? null,
        wizardData: updatedWizardData,
      });

      auditService.logEvent({
        entityType: 'work_order',
        entityId: id,
        action: decision === 'APPROVED' ? 'WAD_APPROVAL_RECORDED' : 'WAD_REJECTION_RECORDED',
        actor: { id: sessionUserIdNumber ?? 0, username: sessionDisplayName },
        reason: comments ?? undefined,
        meta: { role, decision, allApproved: releaseApproved, matrixApproved: allApproved, missingExceptionRequests, backfill: isBackfill, sessionRole, hasSignature: true, signedAt: newApproval.signedAt },
      }).catch((e: Error) => console.warn('[Audit] WAD approval log failed:', e?.message));

      await recordAuditEvent({
        eventType: decision === 'APPROVED' ? 'WAD_APPROVAL_SLOT_APPROVED' : 'WAD_APPROVAL_SLOT_REJECTED',
        subjectType: 'production_work_order',
        subjectId: id,
        sourceService: 'workOrders.router',
        actor: { id: sessionUserIdNumber, username: sessionDisplayName, role: sessionRole || null },
        reason: comments,
        payload: {
          projectId: wad.projectId,
          workOrderNumber: wad.workOrderNumber,
          role,
          decision,
          hasSignature: true,
          signatureMeaning: newApproval.signatureMeaning,
          signedAt: newApproval.signedAt,
          revision: currentRevision,
          revisionStatus: updatedWizardData.revisionStatus,
          matrixApproved: allApproved,
          missingExceptionRequests,
        },
      }).catch((e: Error) => console.warn('[AuditLedger] WAD approval slot ledger write failed:', e?.message));

      if (releaseApproved) {
        await recordAuditEvent({
          eventType: isBackfill ? 'WAD_BACKFILL_APPROVED' : 'WAD_APPROVED',
          subjectType: 'production_work_order',
          subjectId: id,
          sourceService: 'workOrders.router',
          actor: { id: sessionUserIdNumber, username: sessionDisplayName, role: sessionRole || null },
          reason: comments,
          payload: {
            projectId: wad.projectId,
            workOrderNumber: wad.workOrderNumber,
            projectStage,
            backfill: isBackfill,
            tag: isBackfill ? 'wad_backfill' : 'wad_release',
            approvals: updatedApprovals.map((a) => ({
              role: a.role,
              decision: a.decision,
              displayName: a.displayName,
              signedAt: a.signedAt ?? a.timestamp,
              hasSignature: !!a.signature,
              timestamp: a.timestamp,
            })),
          },
        }).catch((e: Error) => console.warn('[AuditLedger] WAD approval ledger write failed:', e?.message));
      }

      return res.json({ wad: updated, allApproved: releaseApproved, matrixApproved: allApproved, missingRequests: missingExceptionRequests, backfill: isBackfill });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[WAD Wizard] approve error:', err);
      return res.status(500).json({ error: 'Failed to record WAD approval', message: msg });
    }
  },
);

async function generateWorkOrderFromPM(scheduleId: number, assetId?: string, userId?: number): Promise<any> {
  try {
    const [schedule] = await db
      .select()
      .from(maintenanceSchedules)
      .where(eq(maintenanceSchedules.id, scheduleId))
      .limit(1);

    if (!schedule) {
      console.error(`[WorkOrders] PM schedule ${scheduleId} not found for WO generation`);
      return null;
    }

    const title = `PM: ${schedule.equipment} - ${schedule.frequency} maintenance`;
    const [wo] = await db.insert(workOrders).values({
      assetId: assetId || null,
      type: 'preventive',
      title,
      description: schedule.description || `Scheduled ${schedule.frequency.toLowerCase()} maintenance for ${schedule.equipment}`,
      priority: 'medium',
      status: 'open',
      createdBy: userId || null,
      maintenanceScheduleId: schedule.id,
    }).returning();

    console.log(`[WorkOrders] Auto-generated PM work order ${wo.id} from schedule ${schedule.id}`);
    return wo;
  } catch (error) {
    console.error('[WorkOrders] Error auto-generating PM work order:', error);
    return null;
  }
}

export default router;
