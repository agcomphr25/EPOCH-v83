import { Router } from 'express';
import { z } from 'zod';
import { storage } from '../../storage';
import { db, pool } from '../../db';
import { sql } from 'drizzle-orm';
import {
  insertInventoryItemSchema,
  insertProjectSchema,
  insertProjectStepSchema,
  insertProjectActivityLogSchema,
  insertProjectNotificationSchema,
} from '../../schema';
import { createEmployeeIdentitySnapshot } from '../../identity/userIdentity';
import { validateProjectClosing, deriveClosingStatus } from '../lib/projectClosingValidation';
import { ensureProjectHasWAD } from '../lib/wadHelper';
import { evaluateDocumentationRequirements } from '../lib/documentationRequirementsEngine';
import { cancelWadWorkOrdersSupersededByP2 } from '../services/wadSupersedeService';
import { ensureProductionWorkflowReadSchema } from '../lib/productionWorkflowReadiness';
import { resolveCustomersIntegerId } from '../lib/customerResolver';
import { getQuoteContractReviewGate } from '../services/quoteContractService';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// ── Project document upload setup ──────────────────────────────────────────
const projectDocsDir = path.join(process.cwd(), 'uploads', 'project-documents');
if (!fs.existsSync(projectDocsDir)) fs.mkdirSync(projectDocsDir, { recursive: true });

const projectDocStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, projectDocsDir),
  filename: (_req, file, cb) => {
    const hash = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}_${hash}${ext}`);
  },
});
const uploadProjectDoc = multer({
  storage: projectDocStorage,
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'];
    cb(null, allowed.includes(file.mimetype));
  },
});

const router = Router();

let projectRevisionSchemaReady = false;
let projectClinSchemaReady = false;

const ROM_LOCK_STAGES = new Set(['po_received', 'p2_release', 'production', 'completed']);
const ROM_EDITABLE_PO_STATUSES = new Set(['OPEN', 'DRAFT', 'CREATED']);

function currentUserSnapshot(req: any): { id: number | null; displayName: string | null } {
  const user = req.user ?? null;
  const rawId = user?.id;
  const parsedId = rawId == null ? null : Number.parseInt(String(rawId), 10);
  return {
    id: Number.isFinite(parsedId) ? parsedId : null,
    displayName: user?.displayName || user?.username || null,
  };
}

async function getLatestProjectWadDocumentationPackage(projectId: string) {
  const rows = await pool.query(
    `SELECT id::text, work_order_number AS "workOrderNumber", status, wad_status AS "wadStatus", wizard_data AS "wizardData"
       FROM production_work_orders
      WHERE project_id = $1
        AND (work_order_number LIKE 'WAD-%' OR wad_status IS NOT NULL)
      ORDER BY
        CASE wad_status WHEN 'APPROVED' THEN 0 WHEN 'PENDING_APPROVAL' THEN 1 ELSE 2 END,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST
      LIMIT 1`,
    [projectId]
  );
  const wad = rows[0];
  if (!wad) return null;
  return {
    wadId: wad.id,
    workOrderNumber: wad.workOrderNumber,
    status: wad.status,
    wadStatus: wad.wadStatus,
    documentationPackage: evaluateDocumentationRequirements(wad),
  };
}

function normalizeRomNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

async function nextNumericInventoryPartNumber() {
  const result = await db.execute(
    sql`SELECT ag_part_number FROM inventory_items WHERE ag_part_number ~ '^[0-9]+$' ORDER BY CAST(ag_part_number AS INTEGER) DESC LIMIT 1`,
  );
  const maxNum = result.rows?.[0]?.ag_part_number ? Number.parseInt(String(result.rows[0].ag_part_number), 10) : 0;
  return String(maxNum + 1);
}

function duplicateInventoryPartNumberError(error: unknown) {
  return typeof error === 'object' && error !== null && (
    (error as any).code === '23505' ||
    (error as any).cause?.code === '23505' ||
    String((error as any).message || '').includes('inventory_items_ag_part_number')
  );
}

function normalizeRomCategories(raw: unknown): Record<string, any> {
  const source = raw && typeof raw === 'object' ? raw as Record<string, any> : {};
  const normalizeCategory = (key: string, numericKeys: string[]) => {
    const category = source[key] && typeof source[key] === 'object' ? source[key] : {};
    return numericKeys.reduce((acc: Record<string, number | null>, numericKey) => {
      acc[numericKey] = normalizeRomNumber(category[numericKey]);
      return acc;
    }, {});
  };

  return {
    labor: normalizeCategory('labor', ['quotedHours']),
    material: normalizeCategory('material', ['budgetAmount']),
    outsideProcessing: normalizeCategory('outsideProcessing', ['budgetAmount']),
    nrc: normalizeCategory('nrc', ['budgetAmount']),
    tooling: normalizeCategory('tooling', ['budgetAmount']),
    design: normalizeCategory('design', ['budgetAmount']),
    capital: normalizeCategory('capital', ['budgetAmount']),
    generalAndAdmin: normalizeCategory('generalAndAdmin', ['budgetAmount']),
    overhead: normalizeCategory('overhead', ['budgetAmount']),
    qualityAndCompliance: normalizeCategory('qualityAndCompliance', ['budgetAmount']),
    shippingAndPackaging: normalizeCategory('shippingAndPackaging', ['budgetAmount']),
    contingency: normalizeCategory('contingency', ['budgetAmount']),
    escalationAndInflation: normalizeCategory('escalationAndInflation', ['budgetAmount']),
    profitFee: normalizeCategory('profitFee', ['budgetAmount']),
  };
}

async function getRomLockState(projectId: string) {
  const projectRows = await pool.query(
    `SELECT id, current_stage, po_id FROM projects WHERE id = $1 LIMIT 1`,
    [projectId],
  );
  const project = projectRows.rows[0];
  if (!project) return { project: null, locked: false, reason: null as string | null, po: null as any };

  const poRows = await pool.query(
    `SELECT id, status, locked_at
     FROM p2_purchase_orders
     WHERE id = $1 OR project_id = $2
     ORDER BY locked_at DESC NULLS LAST, updated_at DESC NULLS LAST, id DESC
     LIMIT 1`,
    [project.po_id ?? null, projectId],
  );
  const po = poRows.rows[0] ?? null;
  const stage = String(project.current_stage ?? '');
  const poStatus = String(po?.status ?? '').toUpperCase();
  const locked =
    ROM_LOCK_STAGES.has(stage) ||
    Boolean(po?.locked_at) ||
    Boolean(po && poStatus && !ROM_EDITABLE_PO_STATUSES.has(poStatus));
  const reason = ROM_LOCK_STAGES.has(stage)
    ? 'Project has reached PO received/award stage.'
    : po?.locked_at
      ? 'Linked PO is locked.'
      : locked
        ? `Linked PO status is ${poStatus}.`
        : null;

  return { project, locked, reason, po };
}

async function ensureProjectRevisionSchema() {
  if (projectRevisionSchemaReady) return;

  await pool.query(`
    ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS current_revision_number INTEGER NOT NULL DEFAULT 0
  `);
  await pool.query(`
    ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS current_revision_label TEXT NOT NULL DEFAULT 'Rev 0'
  `);
  await pool.query(`
    ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS p2_po_item_id INTEGER REFERENCES p2_purchase_order_items(id)
  `);
  await pool.query(`
    ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS p2_billing_allocation_id UUID
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_revisions (
      id SERIAL PRIMARY KEY,
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      revision_number INTEGER NOT NULL,
      revision_label TEXT NOT NULL,
      revision_type TEXT NOT NULL DEFAULT 'PROJECT_CHANGE',
      revision_date DATE NOT NULL DEFAULT CURRENT_DATE,
      has_po_change BOOLEAN NOT NULL DEFAULT false,
      summary TEXT NOT NULL,
      reason TEXT NOT NULL,
      previous_po_id INTEGER REFERENCES p2_purchase_orders(id),
      new_po_id INTEGER REFERENCES p2_purchase_orders(id),
      created_by INTEGER REFERENCES employees(id),
      created_by_display_name TEXT,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      CONSTRAINT project_revisions_project_revision_unique UNIQUE (project_id, revision_number)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS project_revisions_project_id_idx ON project_revisions(project_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS project_revisions_created_at_idx ON project_revisions(created_at)`);
  await pool.query(`ALTER TABLE project_revisions ADD COLUMN IF NOT EXISTS revision_date DATE NOT NULL DEFAULT CURRENT_DATE`);
  await pool.query(`ALTER TABLE project_revisions ADD COLUMN IF NOT EXISTS has_po_change BOOLEAN NOT NULL DEFAULT false`);

  projectRevisionSchemaReady = true;
}

async function ensureProjectClinSchema() {
  if (projectClinSchemaReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_clins (
      id SERIAL PRIMARY KEY,
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      clin_number TEXT NOT NULL,
      description TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(project_id, clin_number)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS project_clins_project_id_idx ON project_clins(project_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS project_clins_active_idx ON project_clins(active)`);
  projectClinSchemaReady = true;
}

const uuidStringSchema = z.string().uuid();

const projectClinBodySchema = z.object({
  clinNumber: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  active: z.boolean().optional(),
});

async function getNextProjectRevisionNumber(projectId: string): Promise<number> {
  const rows = await pool.query<{ next_revision: number }>(
    `SELECT COALESCE(MAX(revision_number), 0) + 1 AS next_revision
     FROM project_revisions
     WHERE project_id = $1`,
    [projectId]
  );
  return Number(rows[0]?.next_revision ?? 1);
}

router.use(async (_req, res, next) => {
  try {
    await ensureProductionWorkflowReadSchema();
    await ensureProjectRevisionSchema();
    next();
  } catch (error) {
    console.error('[Projects] Production workflow schema readiness failed:', error);
    res.status(503).json({ error: 'Production workflow schema is being prepared, please retry' });
  }
});

const PROJECT_STEP_TYPES = [
  { type: 'rfq_risk_assessment', order: 1, label: 'RFQ Risk Assessment', route: '/rfq-risk-assessment' },
  { type: 'quote', order: 2, label: 'Quote', route: '/p2-quote-form' },
  { type: 'purchase_review_checklist', order: 3, label: 'Purchase Review Checklist', route: '/purchase-review-checklist' },
  { type: 'preproduction_checklist', order: 4, label: 'Pre-production Checklist', route: '/preproduction-checklists' },
  { type: 'p2_order', order: 5, label: 'P2 Order', route: '/p2-control-center' },
];

const createProjectRequestSchema = z.object({
  projectName: z.string().min(1, 'Project name is required'),
  customerId: z.string().min(1, 'Customer ID is required'),
  description: z.string().optional(),
  targetShipDate: z.string().optional(),
  projectManagerId: z.number().optional().nullable(),
  reminderDays: z.number().min(1).default(3),
  createdBy: z.number().optional(),
  quoteId: z.string().uuid().optional().nullable(),
  customerNameSnapshot: z.string().optional().nullable(),
});

const VALID_PIPELINE_STAGES = [
  'rfq_received', 'quote_preparing', 'quote_submitted', 'purchase_review',
  'po_received', 'p2_release', 'production', 'completed',
] as const;

const updateProjectRequestSchema = z.object({
  projectName: z.string().optional(),
  description: z.string().optional().nullable(),
  targetShipDate: z.string().optional().nullable(),
  projectManagerId: z.number().optional().nullable(),
  reminderDays: z.number().min(1).optional(),
  status: z.enum(['active', 'on_hold', 'completed', 'cancelled', 'inactive', 'won', 'lost']).optional(),
  currentStage: z.enum(VALID_PIPELINE_STAGES).optional().nullable(),
  notes: z.string().optional().nullable(),
  updatedBy: z.number().optional(),
  force: z.boolean().optional(),
});

const STEP_TO_STAGE_MAP: Record<string, string> = {
  rfq_risk_assessment: 'rfq_received',
  quote: 'quote_submitted',
  purchase_review_checklist: 'purchase_review',
  preproduction_checklist: 'po_received',
  // p2_order intentionally omitted — advancing to production requires
  // the explicit three-way P2 Release Gate (POST /release-to-p2)
};

const updateStepRequestSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'blocked', 'not_applicable']).optional(),
  linkedRfqId: z.number().optional().nullable(),
  linkedQuoteId: z.string().optional().nullable(),
  linkedPurchaseReviewId: z.number().optional().nullable(),
  linkedPreproductionChecklistId: z.string().optional().nullable(),
  linkedP2OrderId: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  completedBy: z.number().optional(),
  updatedBy: z.number().optional(),
});

router.get('/', async (req, res) => {
  try {
    const { customerId } = req.query;
    
    let projectsList;
    if (customerId && typeof customerId === 'string') {
      projectsList = await storage.getProjectsByCustomer(customerId);
    } else {
      projectsList = await storage.getAllProjects();
    }
    
    const projectsWithSteps = await Promise.all(
      projectsList.map(async (project) => {
        try {
          const [steps, p2Customer, projectManager, attachments, closing] = await Promise.all([
            storage.getProjectSteps(project.id),
            project.customerId ? storage.getP2CustomerByCustomerId(project.customerId) : Promise.resolve(null),
            project.projectManagerId ? storage.getEmployee(project.projectManagerId) : Promise.resolve(null),
            storage.getProjectStepAttachmentsByProject(project.id),
            storage.getProjectClosingByProjectId(project.id),
          ]);

          // Resolve customer with bridge FK fallback
          let customer: { id: number | string; customerId: string; name: string } | null = null;
          if (p2Customer) {
            customer = { id: p2Customer.id, customerId: p2Customer.customerId, name: p2Customer.customerName };
          } else if (project.customersIntegerId) {
            const masterCustomer = await storage.getCustomer(project.customersIntegerId);
            if (masterCustomer) {
              customer = {
                id: masterCustomer.id,
                customerId: String(masterCustomer.id),
                name: masterCustomer.company || masterCustomer.name,
              };
            }
          }

          // Resolve linkedRfqNumber from the rfq_risk_assessment step
          let linkedRfqNumber: string | null = null;
          const rfqStep = steps.find(s => s.stepType === 'rfq_risk_assessment');
          if (rfqStep?.linkedRfqId) {
            const rfq = await storage.getRFQRiskAssessmentById(rfqStep.linkedRfqId);
            if (rfq) linkedRfqNumber = rfq.rfqNumber;
          }
          
          return {
            ...project,
            steps,
            customer,
            projectManager,
            attachmentCount: attachments.length,
            closingStatus: deriveClosingStatus(closing),
            linkedRfqNumber,
          };
        } catch (enrichErr) {
          console.error(`Error enriching project ${project.id}:`, enrichErr);
          return {
            ...project,
            steps: [],
            customer: null,
            projectManager: null,
            attachmentCount: 0,
            closingStatus: 'MISSING' as const,
          };
        }
      })
    );
    
    res.json(projectsWithSteps);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ message: 'Failed to fetch projects' });
  }
});

router.get('/next-code', async (req, res) => {
  try {
    const nextCode = await storage.getNextProjectCode();
    res.json({ code: nextCode });
  } catch (error) {
    console.error('Error getting next project code:', error);
    res.status(500).json({ message: 'Failed to get next project code' });
  }
});

router.get('/step-types', async (req, res) => {
  res.json(PROJECT_STEP_TYPES);
});

// GET /api/projects/closings/similar — find similar approved closings by customer or keyword
router.get('/closings/similar', async (req, res) => {
  try {
    const customerId = req.query.customerId ? String(req.query.customerId) : undefined;
    const partFamily = req.query.partFamily ? String(req.query.partFamily) : undefined;
    const limit = req.query.limit ? Math.min(parseInt(String(req.query.limit), 10) || 5, 20) : 5;

    if (!customerId && !partFamily) {
      return res.status(400).json({ message: 'At least one of customerId or partFamily is required' });
    }

    const results = await storage.getSimilarProjectClosings({ customerId, partFamily, limit });
    res.json(results);
  } catch (error) {
    console.error('Error fetching similar project closings:', error);
    res.status(500).json({ message: 'Failed to fetch similar project closings' });
  }
});

// Pipeline stage ordering used for drag-gate enforcement
const PIPELINE_STAGE_ORDER = [
  'rfq_received',
  'quote_preparing',
  'quote_submitted',
  'purchase_review',
  'po_received',
  'p2_release',
  'production',
  'completed',
] as const;

// Maps max completed step_order → max allowed stage index in PIPELINE_STAGE_ORDER
// Step orders: 1=rfq_risk_assessment, 2=quote, 3=purchase_review_checklist,
//              4=preproduction_checklist, 5=p2_order
function computeMaxAllowedStageKey(maxCompletedOrder: number): string {
  if (maxCompletedOrder >= 5) return 'completed';
  if (maxCompletedOrder >= 4) return 'p2_release';
  if (maxCompletedOrder >= 3) return 'po_received';
  if (maxCompletedOrder >= 2) return 'purchase_review';
  if (maxCompletedOrder >= 1) return 'quote_submitted';
  return 'quote_preparing';
}

// For each gated stage, which step label must be completed to unlock it
const STAGE_GATE_LABELS: Record<string, string> = {
  quote_submitted: 'RFQ Risk Assessment',
  purchase_review: 'Quote',
  po_received: 'Purchase Review Checklist',
  p2_release: 'Pre-production Checklist',
  production: 'P2 Release Gate (PO Review + WAD + Preproduction)',
  completed: 'P2 Order',
};

router.get('/pipeline', async (req, res) => {
  try {
    const allProjects = await storage.getAllProjects();
    const pipelineProjects = allProjects.filter(
      p => p.status === 'active' || p.status === 'won'
    );

    const projectIds = pipelineProjects.map(p => p.id);

    // Batch aggregate serial counts for all relevant PO ids in one query
    const poIds = pipelineProjects.map(p => p.poId).filter((id): id is number => id != null);
    const serialCountsByPoId: Record<number, { total: number; completed: number }> = {};
    if (poIds.length > 0) {
      const serialRows = await pool.query(
        `WITH item_state AS (
           SELECT
             psi.po_id,
             psi.status,
             EXISTS (
               SELECT 1
               FROM travelers t
               WHERE UPPER(COALESCE(t.status, '')) IN ('COMPLETE', 'COMPLETED', 'CLOSED')
                 AND t.serial_number IS NOT NULL
                 AND LOWER(TRIM(t.serial_number)) = LOWER(TRIM(psi.serial_number))
             ) AS has_completed_traveler
           FROM p2_serialized_items psi
           WHERE psi.po_id = ANY($1::int[])
         )
         SELECT po_id::text,
                COUNT(*)::text AS total,
                COUNT(*) FILTER (WHERE status = 'COMPLETED' OR has_completed_traveler)::text AS completed
         FROM item_state
         GROUP BY po_id`,
        [poIds]
      ) as any[];
      for (const row of serialRows) {
        serialCountsByPoId[parseInt(row.po_id, 10)] = {
          total: parseInt(row.total, 10) || 0,
          completed: parseInt(row.completed, 10) || 0,
        };
      }
    }

    // Batch query max completed/skipped step_order per project
    const maxStepOrderByProjectId: Record<string, number> = {};
    if (projectIds.length > 0) {
      const stepRows = await pool.query<{ project_id: string; max_order: string | null }>(
        `SELECT project_id::text,
                MAX(step_order) FILTER (WHERE status IN ('completed', 'skipped', 'not_applicable'))::text AS max_order
         FROM project_steps
         WHERE project_id = ANY($1::uuid[])
         GROUP BY project_id`,
        [projectIds]
      );
      for (const row of stepRows) {
        maxStepOrderByProjectId[row.project_id] = row.max_order ? parseInt(row.max_order, 10) : 0;
      }
    }

    // Batch fetch linked RFQ numbers for all pipeline projects
    const rfqStepRows = projectIds.length > 0
      ? await pool.query<{ project_id: string; linked_rfq_id: string | null }>(
          `SELECT project_id::text, linked_rfq_id::text
           FROM project_steps
           WHERE project_id = ANY($1::uuid[]) AND step_type = 'rfq_risk_assessment' AND linked_rfq_id IS NOT NULL`,
          [projectIds]
        )
      : [];
    const linkedRfqIdByProjectId: Record<string, number> = {};
    for (const row of rfqStepRows) {
      if (row.linked_rfq_id) linkedRfqIdByProjectId[row.project_id] = parseInt(row.linked_rfq_id, 10);
    }

    // Fetch RFQ numbers for all unique linked RFQ IDs
    const uniqueRfqIds = [...new Set(Object.values(linkedRfqIdByProjectId))];
    const rfqNumberById: Record<number, string> = {};
    if (uniqueRfqIds.length > 0) {
      const rfqRows = await pool.query<{ id: string; rfq_number: string }>(
        `SELECT id::text, rfq_number FROM rfq_risk_assessments WHERE id = ANY($1::int[])`,
        [uniqueRfqIds]
      );
      for (const row of rfqRows) {
        rfqNumberById[parseInt(row.id, 10)] = row.rfq_number;
      }
    }

    const results = await Promise.all(
      pipelineProjects.map(async (project) => {
        const [p2Customer, closing] = await Promise.all([
          project.customerId ? storage.getP2CustomerByCustomerId(project.customerId) : Promise.resolve(null),
          storage.getProjectClosingByProjectId(project.id),
        ]);

        // Resolve customer name: p2 lookup first, then bridge FK fallback
        let customerName = 'Unknown';
        if (p2Customer) {
          customerName = p2Customer.customerName;
        } else if (project.customersIntegerId) {
          const masterCustomer = await storage.getCustomer(project.customersIntegerId);
          if (masterCustomer) {
            customerName = masterCustomer.company || masterCustomer.name;
          }
        }

        const serialCounts = project.poId ? (serialCountsByPoId[project.poId] ?? { total: 0, completed: 0 }) : { total: 0, completed: 0 };
        const maxCompletedOrder = maxStepOrderByProjectId[project.id] ?? 0;
        const maxAllowedStageKey = computeMaxAllowedStageKey(maxCompletedOrder);
        const closingStatus = deriveClosingStatus(closing);

        const rfqId = linkedRfqIdByProjectId[project.id];
        const linkedRfqNumber = rfqId ? (rfqNumberById[rfqId] ?? null) : null;

        return {
          projectId: project.id,
          projectCode: project.projectCode,
          projectName: project.projectName,
          customerName,
          currentStage: project.currentStage || 'rfq_received',
          status: project.status,
          targetShipDate: project.targetShipDate,
          stageUpdatedAt: project.stageUpdatedAt,
          poId: project.poId,
          completedSerials: serialCounts.completed,
          totalSerials: serialCounts.total,
          closingStatus,
          maxAllowedStageKey,
          linkedRfqNumber,
        };
      })
    );

    res.json(results);
  } catch (error) {
    console.error('Error fetching project pipeline:', error);
    res.status(500).json({ message: 'Failed to fetch project pipeline' });
  }
});


router.get('/unlinked-submissions/:stepType', async (req, res) => {
  try {
    const { stepType } = req.params;
    const { customerId } = req.query;
    const customerIdStr = customerId ? String(customerId) : null;
    
    const linkedIds = await storage.getLinkedSubmissionIds(stepType);
    const linkedIdsSet = new Set(
      linkedIds
        .filter(id => id !== null && id !== undefined)
        .map(id => String(id))
    );
    
    let submissions: any[] = [];
    
    switch (stepType) {
      case 'rfq_risk_assessment':
        const allRfqs = await storage.getAllRFQRiskAssessments();
        submissions = allRfqs
          .filter(rfq => !linkedIdsSet.has(String(rfq.id)))
          .filter(rfq => !customerIdStr || String(rfq.customerId) === customerIdStr)
          .map(rfq => ({
            id: String(rfq.id),
            label: `${rfq.rfqNumber}: ${rfq.customerName || 'Unknown'}`,
            customerId: String(rfq.customerId),
            createdAt: rfq.createdAt,
          }));
        break;
        
      case 'quote':
        const allQuotes = await storage.getAllQuotes();
        submissions = allQuotes
          .filter((quote: any) => !linkedIdsSet.has(String(quote.id)))
          .filter((quote: any) => !customerIdStr || String(quote.customerId) === customerIdStr)
          .map((quote: any) => ({
            id: String(quote.id),
            label: `Quote ${quote.quoteNumber || quote.id}: ${quote.customerName || 'Unknown'}`,
            customerId: String(quote.customerId),
            createdAt: quote.createdAt,
          }));
        break;
        
      case 'purchase_review_checklist':
        const allPurchaseReviews = await storage.getAllPurchaseReviewChecklists();
        submissions = allPurchaseReviews
          .filter(pr => !linkedIdsSet.has(String(pr.id)))
          .filter(pr => !customerIdStr || String(pr.customerId) === customerIdStr)
          .map(pr => {
            const formData = pr.formData as any;
            return {
              id: String(pr.id),
              label: `PR-${pr.id}: ${formData?.customerName || 'Unknown'}`,
              customerId: String(pr.customerId),
              createdAt: pr.createdAt,
            };
          });
        break;
        
      case 'preproduction_checklist':
        const allPreproduction = await storage.getAllPreproductionChecklists();
        submissions = allPreproduction
          .filter((pp: any) => !linkedIdsSet.has(String(pp.id)))
          .filter((pp: any) => !customerIdStr || String(pp.customerId) === customerIdStr)
          .map((pp: any) => ({
            id: String(pp.id),
            label: `Pre-prod ${String(pp.id).substring(0, 8)}: ${pp.customerName || pp.projectName || 'Unknown'}`,
            customerId: String(pp.customerId),
            createdAt: pp.createdAt,
          }));
        break;
        
      case 'p2_order':
        const allP2Orders = await storage.getAllP2PurchaseOrders();
        submissions = allP2Orders
          .filter(order => !linkedIdsSet.has(String(order.id)))
          .map(order => ({
            id: String(order.id),
            label: `Order ${order.poNumber || order.id}: ${order.customerName}`,
            createdAt: order.createdAt,
          }));
        break;
        
      default:
        return res.status(400).json({ message: 'Invalid step type' });
    }
    
    submissions.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });
    
    res.json(submissions);
  } catch (error) {
    console.error('Error fetching unlinked submissions:', error);
    res.status(500).json({ message: 'Failed to fetch unlinked submissions' });
  }
});

router.get('/notifications/:recipientId', async (req, res) => {
  try {
    const recipientId = parseInt(req.params.recipientId, 10);
    const unreadOnly = req.query.unreadOnly === 'true';
    const notifications = await storage.getProjectNotifications(recipientId, unreadOnly);
    res.json(notifications);
  } catch (error) {
    console.error('Error fetching project notifications:', error);
    res.status(500).json({ message: 'Failed to fetch notifications' });
  }
});

router.patch('/notifications/:id/read', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await storage.markProjectNotificationRead(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ message: 'Failed to mark notification as read' });
  }
});

router.post('/notifications/:recipientId/mark-all-read', async (req, res) => {
  try {
    const recipientId = parseInt(req.params.recipientId, 10);
    await storage.markAllProjectNotificationsRead(recipientId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ message: 'Failed to mark all notifications as read' });
  }
});

router.get('/:id/revisions', async (req, res) => {
  try {
    const { id } = req.params;
    const project = await storage.getProject(id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const revisions = await pool.query(
      `SELECT
         pr.id,
         pr.project_id,
         pr.revision_number,
         pr.revision_label,
         pr.revision_type,
         pr.revision_date,
         pr.has_po_change,
         pr.summary,
         pr.reason,
         pr.previous_po_id,
         prev_po.po_number AS previous_po_number,
         pr.new_po_id,
         new_po.po_number AS new_po_number,
         pr.created_by,
         pr.created_by_display_name,
         pr.metadata,
         pr.created_at
       FROM project_revisions pr
       LEFT JOIN p2_purchase_orders prev_po ON prev_po.id = pr.previous_po_id
       LEFT JOIN p2_purchase_orders new_po ON new_po.id = pr.new_po_id
       WHERE pr.project_id = $1
       ORDER BY pr.revision_number DESC`,
      [id]
    );

    res.json(revisions);
  } catch (error) {
    console.error('Error fetching project revisions:', error);
    res.status(500).json({ message: 'Failed to fetch project revisions' });
  }
});

router.post('/:id/revisions', async (req, res) => {
  try {
    const { id } = req.params;
    const schema = z.object({
      summary: z.string().min(3).optional(),
      reason: z.string().min(3),
      revisionType: z.enum(['po', 'drawing', 'contract']).default('po'),
      revisionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      hasPoChange: z.boolean().optional().default(false),
      revisedPoNumber: z.string().trim().min(1).optional(),
      revisedDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      revisedLineItems: z.array(z.object({
        id: z.union([z.number().int().positive(), z.string()]).optional(),
        inventoryItemId: z.number().int().positive().nullable().optional(),
        partNumber: z.string().trim().min(1),
        partName: z.string().trim().min(1),
        quantity: z.number().int().positive(),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
        unitPrice: z.number().nonnegative().optional().nullable(),
        specifications: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      })).optional(),
      createdBy: z.number().int().positive().optional(),
      createdByDisplayName: z.string().optional(),
      metadata: z.record(z.any()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid revision request', errors: parsed.error.errors });
    }

    const project = await storage.getProject(id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const nextRevision = await getNextProjectRevisionNumber(id);
    const revisionLabel = `Rev ${nextRevision}`;
    const data = parsed.data;
    const summary = data.summary?.trim() || `${data.revisionType.toUpperCase()} revision`;
    let previousPoId = project.poId ?? null;
    let newPoId: number | null = null;
    let newPoNumber: string | null = null;

    if (data.hasPoChange) {
      if (data.revisionType !== 'po') {
        return res.status(400).json({ message: 'PO change can only be selected for PO revisions.' });
      }
      if (!project.poId) {
        return res.status(400).json({ message: 'This project does not have a linked PO to revise.' });
      }
      if (!data.revisedPoNumber?.trim()) {
        return res.status(400).json({ message: 'Revised PO number is required for PO-change revisions.' });
      }
      if (!data.revisedDueDate) {
        return res.status(400).json({ message: 'Revised due date is required for PO-change revisions.' });
      }
      if (!data.revisedLineItems?.length) {
        return res.status(400).json({ message: 'At least one revised PO line item is required.' });
      }
      const currentPo = await pool.query(
        `SELECT id, po_number FROM p2_purchase_orders WHERE id = $1 LIMIT 1`,
        [project.poId]
      );
      if (currentPo.rows.length === 0) {
        return res.status(404).json({ message: 'Linked PO was not found.' });
      }

      newPoId = project.poId;
      newPoNumber = currentPo.rows[0].po_number;
    }

    const rows = await pool.query(
      `INSERT INTO project_revisions (
         project_id, revision_number, revision_label, revision_type, revision_date,
         has_po_change, summary, reason, previous_po_id, new_po_id,
         created_by, created_by_display_name, metadata
       )
       VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
       RETURNING *`,
      [
        id,
        nextRevision,
        revisionLabel,
        data.revisionType,
        data.revisionDate || new Date().toISOString().split('T')[0],
        data.hasPoChange,
        summary,
        data.reason,
        previousPoId,
        newPoId,
        data.createdBy ?? null,
        data.createdByDisplayName ?? null,
        JSON.stringify({
          ...(data.metadata ?? {}),
          previousPoId,
          newPoId,
          newPoNumber,
          revisedDueDate: data.revisedDueDate,
          revisedLineItems: data.revisedLineItems,
        }),
      ]
    );

    await pool.query(
      `UPDATE projects
       SET current_revision_number = $2, current_revision_label = $3, updated_at = NOW()
       WHERE id = $1`,
      [id, nextRevision, revisionLabel]
    );

    await storage.createProjectActivityLog({
      projectId: id,
      activityType: 'project_revision_created',
      description: newPoNumber
        ? `${revisionLabel}: ${summary} and PO revision ${newPoNumber}`
        : `${revisionLabel}: ${summary}`,
      performedBy: data.createdBy ?? undefined,
      performedByDisplayName: data.createdByDisplayName,
      metadata: {
        revisionNumber: nextRevision,
        revisionType: data.revisionType,
        revisionDate: data.revisionDate,
        hasPoChange: data.hasPoChange,
        previousPoId,
        newPoId,
        newPoNumber,
        revisedDueDate: data.revisedDueDate,
        revisedLineItems: data.revisedLineItems,
      },
    } as any);

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Error creating project revision:', error);
    res.status(500).json({ message: 'Failed to create project revision' });
  }
});

router.get('/:id/po-link-options', async (req, res) => {
  try {
    const projectId = req.params.id;
    const poId = Number(req.query.poId);
    if (!Number.isFinite(poId) || poId <= 0) {
      return res.status(400).json({ message: 'poId is required' });
    }

    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const poRows = await pool.query<{ id: number; project_id: string | null }>(
      `SELECT id, project_id::text FROM p2_purchase_orders WHERE id = $1`,
      [poId]
    );
    if (poRows.length === 0) return res.status(404).json({ message: 'PO not found' });

    const conflictRows = await pool.query<{ id: string }>(
      `SELECT id FROM projects WHERE po_id = $1 LIMIT 1`,
      [poId]
    );
    if (conflictRows.length > 0 && conflictRows[0].id !== projectId) {
      return res.status(409).json({ message: 'Another project is already linked to this PO' });
    }

    const poItems = await pool.query(
      `SELECT id,
              po_id AS "poId",
              part_number AS "partNumber",
              part_name AS "partName",
              COALESCE(NULLIF(specifications, ''), NULLIF(notes, ''), part_name) AS description,
              quantity,
              unit_price AS "unitPrice",
              specifications,
              notes
         FROM p2_purchase_order_items
        WHERE po_id = $1
        ORDER BY id`,
      [poId]
    );

    const allocationTable = await pool.query<{ exists: string | null }>(
      `SELECT to_regclass('public.p2_billing_allocations')::text AS exists`
    );

    let billingBuckets: any[] = [];
    if (allocationTable[0]?.exists) {
      billingBuckets = await pool.query(
        `SELECT id::text,
                po_id AS "poId",
                po_item_id AS "poItemId",
                bucket_label AS "bucketLabel",
                description,
                customer_po_line AS "customerPoLine",
                quantity_authorized AS "quantityAuthorized",
                unit_price AS "unitPrice"
           FROM p2_billing_allocations
          WHERE po_id = $1
            AND active = true
          ORDER BY created_at, bucket_label`,
        [poId]
      );
    }

    res.json({ poItems, billingBuckets });
  } catch (error) {
    console.error('Error fetching project PO link options:', error);
    res.status(500).json({ message: 'Failed to fetch PO link options' });
  }
});

router.post('/:id/link-po', async (req, res) => {
  try {
    const { id } = req.params;
    const schema = z.object({
      poId: z.number().int().positive(),
      poItemId: z.number().int().positive().optional().nullable(),
      billingAllocationId: uuidStringSchema.optional().nullable(),
      reason: z.string().min(3).optional(),
      createdBy: z.number().int().positive().optional(),
      createdByDisplayName: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid request: poId (number) required', errors: parsed.error.errors });
    }
    const { poId, poItemId, billingAllocationId, reason, createdBy, createdByDisplayName } = parsed.data;

    const project = await storage.getProject(id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    if (project.poId === poId) {
      return res.status(409).json({ message: 'Project is already linked to this PO' });
    }

    if (project.poId && !reason?.trim()) {
      return res.status(400).json({ message: 'A revision reason is required when changing the linked PO' });
    }

    // Validate PO exists. p2_purchase_orders.project_id is repaired below in
    // the same transaction; projects.po_id remains the authoritative conflict
    // check because it has the enforced one-to-one project/PO relationship.
    const poRows = await pool.query<{ id: number; po_number: string; project_id: string | null }>(
      `SELECT id, po_number, project_id::text FROM p2_purchase_orders WHERE id = $1`,
      [poId]
    );
    if (poRows.length === 0) return res.status(404).json({ message: 'PO not found' });
    const previousPoProjectId = poRows[0].project_id ?? null;

    let poItemLabel: string | null = null;
    if (poItemId) {
      const itemRows = await pool.query<{ id: number; part_number: string; part_name: string }>(
        `SELECT id, part_number, part_name FROM p2_purchase_order_items WHERE id = $1 AND po_id = $2`,
        [poItemId, poId]
      );
      if (itemRows.length === 0) {
        return res.status(400).json({ message: 'Selected PO item does not belong to this PO' });
      }
      poItemLabel = `${itemRows[0].part_number} - ${itemRows[0].part_name}`;
    }

    let billingBucketLabel: string | null = null;
    if (billingAllocationId) {
      const allocationTable = await pool.query<{ exists: string | null }>(
        `SELECT to_regclass('public.p2_billing_allocations')::text AS exists`
      );
      if (!allocationTable[0]?.exists) {
        return res.status(400).json({ message: 'No CLIN/bucket allocations exist for this PO yet' });
      }

      const bucketRows = await pool.query<{ id: string; po_item_id: number | null; bucket_label: string }>(
        `SELECT id::text, po_item_id, bucket_label
           FROM p2_billing_allocations
          WHERE id = $1::uuid
            AND po_id = $2
            AND active = true`,
        [billingAllocationId, poId]
      );
      if (bucketRows.length === 0) {
        return res.status(400).json({ message: 'Selected CLIN/bucket does not belong to this PO' });
      }
      if (poItemId && bucketRows[0].po_item_id && bucketRows[0].po_item_id !== poItemId) {
        return res.status(400).json({ message: 'Selected CLIN/bucket does not belong to this PO item' });
      }
      billingBucketLabel = bucketRows[0].bucket_label;
    }

    // Ensure no other project already uses this poId
    const conflictRows = await pool.query<{ id: string }>(
      `SELECT id FROM projects WHERE po_id = $1 LIMIT 1`,
      [poId]
    );
    if (conflictRows.length > 0 && conflictRows[0].id !== id) {
      return res.status(409).json({ message: 'Another project is already linked to this PO' });
    }

    const previousPoId = project.poId ?? null;
    const nextRevision = await getNextProjectRevisionNumber(id);
    const revisionLabel = `Rev ${nextRevision}`;
    const isRelink = previousPoId !== null;
    const revisionReason = reason?.trim() || 'Initial production PO link';
    const revisionSummary = isRelink
      ? `Changed linked P2 PO to ${poRows[0].po_number}`
      : `Linked project to P2 PO ${poRows[0].po_number}`;
    const projectPoLabel = `${project.projectCode} - ${project.projectName}`;

    // Task #258: link-po writes + WAD supersede must be atomic. If any step
    // fails (including the supersede helper), the entire link is rolled back
    // so we cannot end up with a P2 PO linked while redundant WAD WOs remain
    // active.
    const { updated, supersedeResult } = await db.transaction(async (tx) => {
      if (previousPoId && previousPoId !== poId) {
        await tx.execute(sql`
          UPDATE p2_purchase_orders
             SET project_id = NULL,
                 updated_at = NOW()
           WHERE id = ${previousPoId}
             AND project_id = ${id}::uuid
        `);
      }

      const updatedRows = await tx.execute(sql`
        UPDATE projects
           SET po_id = ${poId},
               p2_po_item_id = ${poItemId ?? null},
               p2_billing_allocation_id = ${billingAllocationId ?? null}::uuid,
               current_revision_number = ${nextRevision},
               current_revision_label = ${revisionLabel},
               updated_at = NOW()
         WHERE id = ${id}::uuid
         RETURNING *
      `);
      const updatedRow = (updatedRows as unknown as { rows: Array<Record<string, unknown>> }).rows?.[0]
        ?? (Array.isArray(updatedRows) ? (updatedRows as Array<Record<string, unknown>>)[0] : undefined);

      await tx.execute(sql`
        UPDATE project_steps
           SET linked_p2_order_id = ${poId}, updated_at = NOW()
         WHERE project_id = ${id}::uuid AND step_type = 'p2_order'
      `);

      await tx.execute(sql`
        UPDATE p2_purchase_orders
           SET project_id = ${id}::uuid,
               project_name = COALESCE(project_name, ${projectPoLabel}),
               updated_at = NOW()
         WHERE id = ${poId}
      `);

      await tx.execute(sql`
        INSERT INTO project_revisions (
          project_id, revision_number, revision_label, revision_type, summary, reason,
          previous_po_id, new_po_id, created_by, created_by_display_name, metadata
        )
        VALUES (
          ${id}::uuid, ${nextRevision}, ${revisionLabel}, 'PO_LINK_CHANGE',
          ${revisionSummary}, ${revisionReason},
          ${previousPoId}, ${poId},
          ${createdBy ?? null}, ${createdByDisplayName ?? null},
          ${JSON.stringify({
            source: 'project_po_link',
            previousPoId,
            newPoId: poId,
            previousPoProjectId,
            poItemId: poItemId ?? null,
            billingAllocationId: billingAllocationId ?? null,
            poItemLabel,
            billingBucketLabel,
          })}::jsonb
        )
      `);

      // Same-tx supersede: errors propagate and roll back the link writes.
      const supersede = await cancelWadWorkOrdersSupersededByP2(id, {
        tx,
        actor: { id: createdBy ?? null, username: createdByDisplayName ?? null },
        sourceService: 'projects.linkPo',
      });

      return { updated: updatedRow, supersedeResult: supersede };
    });

    if (supersedeResult.cancelledCount > 0) {
      console.log(`[WAD-Supersede] Cancelled ${supersedeResult.cancelledCount} redundant WAD WO(s) on project ${id} after P2 PO link`);
    }

    // Activity log is best-effort and intentionally outside the tx: a logging
    // failure must not roll back a successful link.
    await storage.createProjectActivityLog({
      projectId: id,
      activityType: isRelink ? 'project_po_relinked' : 'project_po_linked',
      description: [
        `${revisionLabel}: ${revisionSummary}`,
        poItemLabel ? `item ${poItemLabel}` : null,
        billingBucketLabel ? `bucket ${billingBucketLabel}` : null,
      ].filter(Boolean).join(', '),
      performedBy: createdBy,
      performedByDisplayName: createdByDisplayName,
      metadata: {
        revisionNumber: nextRevision,
        previousPoId,
        newPoId: poId,
        previousPoProjectId,
        poItemId: poItemId ?? null,
        billingAllocationId: billingAllocationId ?? null,
        reason: revisionReason,
      },
    } as any);

    res.json(updated);
  } catch (error) {
    console.error('Error linking PO to project:', error);
    res.status(500).json({ message: 'Failed to link PO' });
  }
});

router.get('/:id/clins', async (req, res) => {
  try {
    await ensureProjectClinSchema();
    const rows = await pool.query(
      `SELECT id, project_id AS "projectId", clin_number AS "clinNumber", description, active, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM project_clins
        WHERE project_id = $1
        ORDER BY clin_number`,
      [req.params.id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Get project CLINs error:', error);
    res.status(500).json({ error: 'Failed to fetch project CLINs' });
  }
});

router.post('/:id/clins', async (req, res) => {
  try {
    await ensureProjectClinSchema();
    const parsed = projectClinBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid CLIN data', details: parsed.error.flatten() });
      return;
    }

    const projectRows = await pool.query(`SELECT id FROM projects WHERE id = $1 LIMIT 1`, [req.params.id]);
    if (projectRows.length === 0) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const [created] = await pool.query(
      `INSERT INTO project_clins (project_id, clin_number, description, active)
       VALUES ($1, $2, $3, $4)
       RETURNING id, project_id AS "projectId", clin_number AS "clinNumber", description, active, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [req.params.id, parsed.data.clinNumber, parsed.data.description ?? null, parsed.data.active ?? true]
    );
    res.status(201).json(created);
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ error: 'CLIN number already exists for this project' });
      return;
    }
    console.error('Create project CLIN error:', error);
    res.status(500).json({ error: 'Failed to create project CLIN' });
  }
});

router.patch('/:id/clins/:clinId', async (req, res) => {
  try {
    await ensureProjectClinSchema();
    const parsed = projectClinBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid CLIN data', details: parsed.error.flatten() });
      return;
    }

    const [updated] = await pool.query(
      `UPDATE project_clins
          SET clin_number = COALESCE($3, clin_number),
              description = CASE WHEN $4::boolean THEN $5 ELSE description END,
              active = COALESCE($6, active),
              updated_at = NOW()
        WHERE project_id = $1 AND id = $2
        RETURNING id, project_id AS "projectId", clin_number AS "clinNumber", description, active, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        req.params.id,
        Number(req.params.clinId),
        parsed.data.clinNumber ?? null,
        Object.prototype.hasOwnProperty.call(parsed.data, 'description'),
        parsed.data.description ?? null,
        parsed.data.active ?? null,
      ]
    );
    if (!updated) {
      res.status(404).json({ error: 'CLIN not found' });
      return;
    }
    res.json(updated);
  } catch (error: any) {
    if (error?.code === '23505') {
      res.status(409).json({ error: 'CLIN number already exists for this project' });
      return;
    }
    console.error('Update project CLIN error:', error);
    res.status(500).json({ error: 'Failed to update project CLIN' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const project = await storage.getProject(id);
    
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    const steps = await storage.getProjectSteps(project.id);
    const p2Customer = await storage.getP2CustomerByCustomerId(project.customerId);
    const projectManager = project.projectManagerId 
      ? await storage.getEmployee(project.projectManagerId)
      : null;
    const activityLog = await storage.getProjectActivityLog(project.id);
    const closing = await storage.getProjectClosingByProjectId(project.id);

    // Resolve customer: prefer p2 customer lookup, then fall back to the master
    // customers table via the bridge FK so the name is never "Unknown".
    let customer: { id: number | string; customerId: string; name: string } | null = null;
    if (p2Customer) {
      customer = { id: p2Customer.id, customerId: p2Customer.customerId, name: p2Customer.customerName };
    } else if (project.customersIntegerId) {
      const masterCustomer = await storage.getCustomer(project.customersIntegerId);
      if (masterCustomer) {
        customer = {
          id: masterCustomer.id,
          customerId: String(masterCustomer.id),
          name: masterCustomer.company || masterCustomer.name,
        };
      }
    }
    
    res.json({
      ...project,
      steps,
      customer,
      projectManager,
      activityLog,
      closingStatus: deriveClosingStatus(closing),
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ message: 'Failed to fetch project' });
  }
});

router.post('/', async (req, res) => {
  try {
    const validationResult = createProjectRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        message: 'Invalid request data', 
        errors: validationResult.error.errors 
      });
    }
    
    const validatedData = validationResult.data;
    const { quoteId, customerNameSnapshot, ...projectFields } = validatedData;

    const nextCode = await storage.getNextProjectCode();

    // Resolve the integer FK to the master customers table from the text customerId.
    const customersIntegerId = await resolveCustomersIntegerId(validatedData.customerId);

    const projectData = {
      ...projectFields,
      projectCode: nextCode,
      customersIntegerId,
      ...(customerNameSnapshot ? { customerNameSnapshot } : {}),
    };
    
    const project = await storage.createProject(projectData);
    
    for (const stepType of PROJECT_STEP_TYPES) {
      const isQuoteStep = stepType.type === 'quote';
      await storage.createProjectStep({
        projectId: project.id,
        stepType: stepType.type as any,
        stepOrder: stepType.order,
        status: stepType.order === 1 ? 'in_progress' : 'pending',
        startedAt: stepType.order === 1 ? new Date() : null,
        ...(isQuoteStep && quoteId ? { linkedQuoteId: quoteId, status: 'completed', completedAt: new Date() } : {}),
      });
    }

    await ensureProjectHasWAD(project.id, { projectName: project.projectName }).catch((err) => {
      console.error('[WAD] Failed to auto-create WAD on project creation:', err);
    });

    const creatorSnapshot = req.body.createdBy
      ? await createEmployeeIdentitySnapshot(req.body.createdBy)
      : null;

    await storage.createProjectActivityLog({
      projectId: project.id,
      activityType: 'project_created',
      description: `Project ${project.projectCode} created`,
      performedBy: req.body.createdBy,
      performedByDisplayName: creatorSnapshot?.displayName || null,
    });
    
    const steps = await storage.getProjectSteps(project.id);
    
    res.status(201).json({ ...project, steps });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ message: 'Failed to create project' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (req.body.currentStage === 'shipping') {
      return res.status(400).json({ message: "Invalid stage: 'shipping' has been deprecated" });
    }
    
    const validationResult = updateProjectRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        message: 'Invalid request data', 
        errors: validationResult.error.errors 
      });
    }
    
    const { force, ...validatedData } = validationResult.data;

    if (validatedData.status === 'completed') {
      const existing = await storage.getProject(id);
      const isTransitionToCompleted = existing && existing.status !== 'completed';
      if (isTransitionToCompleted) {
        const isAdmin = (req.user?.role || '').toUpperCase() === 'ADMIN';
        if (force && !isAdmin) {
          return res.status(403).json({
            message: 'Only admins can bypass the closing record requirement.',
          });
        }
        if (!force) {
          const closing = await storage.getProjectClosingByProjectId(id);
          if (!closing) {
            return res.status(400).json({
              message: 'Cannot mark project as completed without a closing record. Please create a closing/lessons-learned record first.',
            });
          }
          const { valid, missing } = validateProjectClosing(closing);
          if (!valid) {
            return res.status(400).json({
              message: 'Cannot mark project as completed: closing record is incomplete.',
              missingFields: missing,
            });
          }
          if (!closing.approvedBy) {
            return res.status(403).json({
              message: 'Cannot mark project as completed: closing record has not been approved by a manager.',
            });
          }
        }
      }
    }

    // Stage-gate enforcement: forward stage moves must be permitted by project_steps
    if (validatedData.currentStage) {
      // p2_release and production can ONLY be set via POST /release-to-p2 (the three-way gate)
      // Reject any attempt to set these stages via generic PATCH
      if (validatedData.currentStage === 'p2_release' || validatedData.currentStage === 'production') {
        return res.status(422).json({
          message: `Cannot set stage to "${validatedData.currentStage}" directly. Use the P2 Release Gate endpoint (POST /api/projects/:id/release-to-p2).`,
        });
      }

      const existing = await storage.getProject(id);
      if (existing && existing.currentStage) {
        const existingIdx = (PIPELINE_STAGE_ORDER as readonly string[]).indexOf(existing.currentStage);
        const newIdx = (PIPELINE_STAGE_ORDER as readonly string[]).indexOf(validatedData.currentStage);
        if (newIdx > existingIdx) {
          // Forward move — validate against project_steps completion
          const steps = await storage.getProjectSteps(id);
          const maxCompletedOrder = steps.reduce((max, s) => {
            if (s.status === 'completed' || s.status === 'skipped' || s.status === 'not_applicable') {
              return Math.max(max, s.stepOrder);
            }
            return max;
          }, 0);
          const maxAllowedKey = computeMaxAllowedStageKey(maxCompletedOrder);
          const maxAllowedIdx = (PIPELINE_STAGE_ORDER as readonly string[]).indexOf(maxAllowedKey);
          if (newIdx > maxAllowedIdx) {
            const prerequisite = STAGE_GATE_LABELS[validatedData.currentStage] || 'required steps';
            return res.status(422).json({
              message: `Cannot advance to "${validatedData.currentStage}": complete "${prerequisite}" first.`,
              maxAllowedStageKey: maxAllowedKey,
            });
          }
        }
      }
    }

    const updatePayload: any = { ...validatedData };
    if (validatedData.currentStage) {
      updatePayload.stageUpdatedAt = new Date();
    }
    const project = await storage.updateProject(id, updatePayload);
    
    if (validatedData.currentStage) {
      await storage.createProjectActivityLog({
        projectId: id,
        activityType: 'stage_changed',
        description: `Stage changed to ${validatedData.currentStage}`,
      });
    }

    if (validatedData.projectManagerId) {
      const updaterSnapshot = validatedData.updatedBy
        ? await createEmployeeIdentitySnapshot(validatedData.updatedBy)
        : null;

      await storage.createProjectActivityLog({
        projectId: id,
        activityType: 'project_updated',
        description: 'Project manager assigned',
        performedBy: validatedData.updatedBy,
        performedByDisplayName: updaterSnapshot?.displayName || null,
      });
    }
    
    res.json(project);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ message: 'Failed to update project' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await storage.deleteProject(id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ message: 'Failed to delete project' });
  }
});

router.get('/:projectId/steps', async (req, res) => {
  try {
    const { projectId } = req.params;
    const steps = await storage.getProjectSteps(projectId);
    res.json(steps);
  } catch (error) {
    console.error('Error fetching project steps:', error);
    res.status(500).json({ message: 'Failed to fetch project steps' });
  }
});

router.patch('/:projectId/steps/:stepId', async (req, res) => {
  try {
    const { projectId, stepId } = req.params;
    
    const validationResult = updateStepRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        message: 'Invalid request data', 
        errors: validationResult.error.errors 
      });
    }
    
    const validatedData = validationResult.data;
    const { status, linkedRfqId, linkedQuoteId, linkedPurchaseReviewId, linkedPreproductionChecklistId, linkedP2OrderId, notes } = validatedData;
    
    const allSteps = await storage.getProjectSteps(projectId);
    const currentStep = allSteps.find(s => s.id === stepId);
    
    if (!currentStep) {
      return res.status(404).json({ message: 'Step not found' });
    }
    
    if (status === 'completed') {
      if (currentStep.status !== 'in_progress') {
        return res.status(400).json({ 
          message: 'Cannot complete a step that is not in progress. Start the step first.' 
        });
      }
    }
    
    const performerUserId = validatedData.completedBy || validatedData.updatedBy;
    const performerSnapshot = performerUserId
      ? await createEmployeeIdentitySnapshot(performerUserId)
      : null;

    const updateData: any = {};
    
    if (status) {
      updateData.status = status;
      if (status === 'in_progress' && !req.body.startedAt) {
        updateData.startedAt = new Date();
      }
      if (status === 'completed') {
        updateData.completedAt = new Date();
        updateData.completedBy = validatedData.completedBy;
        updateData.completedByDisplayName = performerSnapshot?.displayName || null;
      }
    }
    
    if (linkedRfqId !== undefined) updateData.linkedRfqId = linkedRfqId;
    if (linkedQuoteId !== undefined) updateData.linkedQuoteId = linkedQuoteId;
    if (linkedPurchaseReviewId !== undefined) updateData.linkedPurchaseReviewId = linkedPurchaseReviewId;
    if (linkedPreproductionChecklistId !== undefined) updateData.linkedPreproductionChecklistId = linkedPreproductionChecklistId;
    if (linkedP2OrderId !== undefined) {
      updateData.linkedP2OrderId = linkedP2OrderId;
      if (linkedP2OrderId !== null) {
        await storage.updateProject(projectId, { poId: linkedP2OrderId } as any);
      }
    }
    if (notes !== undefined) updateData.notes = notes;
    
    const step = await storage.updateProjectStep(stepId, updateData);
    
    const stepInfo = PROJECT_STEP_TYPES.find(s => s.type === step.stepType);
    
    await storage.createProjectActivityLog({
      projectId,
      activityType: status === 'completed' ? 'step_completed' : 'step_updated',
      stepType: step.stepType,
      description: status === 'completed' 
        ? `${stepInfo?.label || step.stepType} completed`
        : `${stepInfo?.label || step.stepType} updated`,
      performedBy: performerUserId,
      performedByDisplayName: performerSnapshot?.displayName || null,
    });
    
    if (status === 'completed') {
      const project = await storage.getProject(projectId);
      if (project?.projectManagerId) {
        await storage.createProjectNotification({
          projectId,
          recipientId: project.projectManagerId,
          notificationType: 'step_completed',
          title: `Step Completed: ${stepInfo?.label}`,
          message: `${stepInfo?.label} has been completed for project ${project.projectCode}`,
          metadata: { stepId, stepType: step.stepType },
        });
      }
      
      const nextStepIndex = step.stepOrder;
      const allSteps = await storage.getProjectSteps(projectId);
      const nextStep = allSteps.find(s => s.stepOrder === nextStepIndex + 1);
      
      if (nextStep) {
        if (nextStep.status === 'pending') {
          await storage.updateProjectStep(nextStep.id, { 
            status: 'in_progress',
            startedAt: new Date(),
          });
        }
        
        const nextStepInfo = PROJECT_STEP_TYPES.find(s => s.type === nextStep.stepType);
        const completedStage = STEP_TO_STAGE_MAP[step.stepType] || null;
        const projectUpdate: any = { 
          currentStepType: nextStep.stepType as any,
        };
        if (completedStage) {
          projectUpdate.currentStage = completedStage;
          projectUpdate.stageUpdatedAt = new Date();
        }
        if (step.stepType === 'p2_order') {
          projectUpdate.status = 'won';
          if (updateData.linkedP2OrderId) {
            projectUpdate.poId = updateData.linkedP2OrderId;
          }
        }
        await storage.updateProject(projectId, projectUpdate);
        
        await storage.createProjectActivityLog({
          projectId,
          activityType: 'step_started',
          stepType: nextStep.stepType,
          description: `${nextStepInfo?.label || nextStep.stepType} started`,
        });
      } else {
        const isFinalP2Order = step.stepType === 'p2_order';
        if (isFinalP2Order) {
          // p2_order links the PO and marks project won, but does NOT advance the stage.
          // Advancing to production requires the explicit P2 Release Gate (POST /release-to-p2).
          const poLinkUpdate: any = { status: 'won' };
          if (updateData.linkedP2OrderId) {
            poLinkUpdate.poId = updateData.linkedP2OrderId;
          }
          await storage.updateProject(projectId, poLinkUpdate);
          await storage.createProjectActivityLog({
            projectId,
            activityType: 'step_completed',
            stepType: 'p2_order',
            description: 'P2 Order linked — use the Release Gate to advance to Production',
          });
        } else {
          const finalUpdate: any = {
            currentStage: 'completed',
            stageUpdatedAt: new Date(),
            status: 'completed',
            actualShipDate: new Date().toISOString().split('T')[0],
          };
          await storage.updateProject(projectId, finalUpdate);
          await storage.createProjectActivityLog({
            projectId,
            activityType: 'project_completed',
            description: 'Project completed',
          });
        }
      }
    }
    
    res.json(step);
  } catch (error) {
    console.error('Error updating project step:', error);
    res.status(500).json({ message: 'Failed to update project step' });
  }
});

router.get('/:projectId/activity', async (req, res) => {
  try {
    const { projectId } = req.params;
    const activityLog = await storage.getProjectActivityLog(projectId);
    res.json(activityLog);
  } catch (error) {
    console.error('Error fetching project activity log:', error);
    res.status(500).json({ message: 'Failed to fetch activity log' });
  }
});

router.patch('/:projectId/steps/:stepId/skip', async (req, res) => {
  try {
    const { projectId, stepId } = req.params;
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({ message: 'A skip reason is required' });
    }

    const allSteps = await storage.getProjectSteps(projectId);
    const step = allSteps.find(s => s.id === stepId);
    if (!step) {
      return res.status(404).json({ message: 'Step not found' });
    }

    if (step.status === 'completed') {
      return res.status(400).json({ message: 'Cannot skip a completed step. Reopen it first.' });
    }

    const existingNotes = step.notes ? `${step.notes}\n` : '';
    const updatedStep = await storage.updateProjectStep(stepId, {
      status: 'skipped' as any,
      completedAt: new Date(),
      notes: `${existingNotes}[Skipped] ${reason.trim()}`,
    });

    await storage.createProjectActivityLog({
      projectId,
      activityType: 'step_skipped',
      stepType: step.stepType,
      description: `${PROJECT_STEP_TYPES.find(s => s.type === step.stepType)?.label || step.stepType} skipped: ${reason.trim()}`,
    });

    res.json(updatedStep);
  } catch (error) {
    console.error('Error skipping project step:', error);
    res.status(500).json({ message: 'Failed to skip project step' });
  }
});

router.patch('/:projectId/steps/:stepId/reopen', async (req, res) => {
  try {
    const { projectId, stepId } = req.params;

    const allSteps = await storage.getProjectSteps(projectId);
    const step = allSteps.find(s => s.id === stepId);
    if (!step) {
      return res.status(404).json({ message: 'Step not found' });
    }

    if (step.status !== 'completed' && step.status !== 'skipped') {
      return res.status(400).json({ 
        message: 'Only completed or skipped steps can be reopened' 
      });
    }

    const updatedStep = await storage.updateProjectStep(stepId, {
      status: 'in_progress' as any,
      completedAt: null,
      completedBy: null,
      completedByDisplayName: null,
      startedAt: new Date(),
    });

    const project = await storage.getProject(projectId);
    if (project && (project.status === 'completed' || project.status === 'won')) {
      const projectUpdate: any = {
        status: 'active',
        currentStepType: step.stepType as any,
        currentStage: STEP_TO_STAGE_MAP[step.stepType] || project.currentStage,
        stageUpdatedAt: new Date(),
      };
      await storage.updateProject(projectId, projectUpdate);
    }

    await storage.createProjectActivityLog({
      projectId,
      activityType: 'step_reopened',
      stepType: step.stepType,
      description: `${PROJECT_STEP_TYPES.find(s => s.type === step.stepType)?.label || step.stepType} reopened`,
    });

    res.json(updatedStep);
  } catch (error) {
    console.error('Error reopening project step:', error);
    res.status(500).json({ message: 'Failed to reopen project step' });
  }
});

// POST /api/projects/:id/release-to-p2 — P2 Release Gate endpoint
// Release gate: PO Review + WAD + Preproduction must pass; Contract Review is required for primary POs.
// First call (pre-gate) → sets stage to p2_release and PO to ready_for_p2_release
// Second call (staged) → sets stage to production and PO to in_production
// Repeated calls once in production → 409 (idempotent-safe)
router.post('/:id/release-to-p2', async (req, res) => {
  try {
    const { id } = req.params;
    const project = await storage.getProject(id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const currentStage = project.currentStage || 'rfq_received';

    // Require a linked P2 Purchase Order — PO status is the authoritative state source
    if (!project.poId) {
      return res.status(422).json({
        message: 'A P2 Purchase Order must be linked to this project before it can be released to P2.',
        code: 'PO_REQUIRED',
      });
    }

    // Resolve current PO status (authoritative source for transition routing)
    const poRows = await pool.query<{ status: string }>(
      `SELECT status FROM p2_purchase_orders WHERE id = $1`,
      [project.poId]
    );
    const poStatus: string | null = poRows[0]?.status ?? null;

    // Guard: already fully released → reject to prevent backward regression (idempotent-safe)
    const alreadyInProduction = poStatus === 'in_production'
      || currentStage === 'production'
      || currentStage === 'completed';
    if (alreadyInProduction) {
      return res.status(409).json({
        message: 'Project is already in production. No further release action is required.',
        stage: currentStage,
        poStatus,
      });
    }

    const steps = await storage.getProjectSteps(id);

    // Check the three gate conditions
    const poReviewStep = steps.find(s => s.stepType === 'purchase_review_checklist');
    const preproStep = steps.find(s => s.stepType === 'preproduction_checklist');

    // PO Review = APPROVED: step must be explicitly completed (skipped/N/A do not satisfy this gate)
    const poReviewPassed = poReviewStep?.status === 'completed';

    // Preproduction = COMPLETE: step must be explicitly completed (skipped/N/A do not satisfy this gate)
    const preproductionPassed = preproStep?.status === 'completed';

    // WAD = APPROVED: at least one production work order must be in an authorized state
    // RELEASED means the WAD has been formally authorized for labor charges (DCAA requirement)
    const WAD_APPROVED_STATUSES = ['RELEASED', 'IN_PROGRESS', 'COMPLETE', 'CLOSED'];
    const workOrders = await storage.getWorkOrdersByProject(id);
    const wadPassed = workOrders.some(wo => WAD_APPROVED_STATUSES.includes(wo.status));
    const wadDocumentation = await getLatestProjectWadDocumentationPackage(id);
    const documentationIssues = wadDocumentation?.documentationPackage.gates.routingApproval.requiresSamplingPlan &&
      !wadDocumentation.documentationPackage.samplingPlanId
      ? ['Sampling plan is required by the WAD documentation package but no sampling plan ID is recorded.']
      : [];
    const documentationGate = {
      key: 'documentation_package',
      label: 'WAD Documentation Package',
      passed: Boolean(wadDocumentation) && documentationIssues.length === 0,
      status: !wadDocumentation ? 'missing_wad' : documentationIssues.length > 0 ? 'incomplete' : 'ready',
      message: !wadDocumentation
        ? 'No WAD documentation package is available.'
        : documentationIssues[0] ?? 'WAD documentation package is defined.',
      documentationPackage: wadDocumentation?.documentationPackage ?? null,
    };

    const quoteStep = steps.find(s => s.stepType === 'quote');
    const contractReviewGate = await getQuoteContractReviewGate(quoteStep?.linkedQuoteId ?? null, id, project.poId);

    const gates = [
      { key: 'po_review', label: 'PO Review', passed: poReviewPassed },
      contractReviewGate,
      { key: 'wad', label: 'WAD (Work Authorization Document)', passed: wadPassed },
      documentationGate,
      { key: 'preproduction', label: 'Preproduction', passed: preproductionPassed },
    ];

    const failedGates = gates.filter(g => !g.passed);

    if (failedGates.length > 0) {
      return res.status(422).json({
        message: 'P2 Release Gate not cleared',
        gates,
        failedGates: failedGates.map(g => g.label),
      });
    }

    // Transition routing is exclusively driven by PO status
    const isAlreadyStaged = poStatus === 'ready_for_p2_release';

    if (isAlreadyStaged) {
      // Second transition: PO already staged → release to production
      await storage.updateProject(id, {
        currentStage: 'production',
        stageUpdatedAt: new Date(),
        status: 'won',
      });

      await pool.query(
        `UPDATE p2_purchase_orders SET status = 'in_production', updated_at = NOW() WHERE id = $1`,
        [project.poId]
      );

      await storage.createProjectActivityLog({
        projectId: id,
        activityType: 'stage_changed',
        description: 'Released to Production — P2 Release Gate passed (all required conditions met)',
      });

      return res.json({
        success: true,
        stage: 'production',
        poStatus: 'in_production',
        gates,
        documentationPackage: wadDocumentation?.documentationPackage ?? null,
      });
    }

    // First transition: all gates pass, PO not yet staged → set ready_for_p2_release
    await storage.updateProject(id, {
      currentStage: 'p2_release',
      stageUpdatedAt: new Date(),
    });

    await pool.query(
      `UPDATE p2_purchase_orders SET status = 'ready_for_p2_release', updated_at = NOW() WHERE id = $1`,
      [project.poId]
    );

    await storage.createProjectActivityLog({
      projectId: id,
      activityType: 'stage_changed',
      description: 'P2 Release Gate passed — project staged for P2 (PO Review, WAD, Preproduction, and any required Contract Review cleared)',
    });

    return res.json({
      success: true,
      stage: 'p2_release',
      poStatus: 'ready_for_p2_release',
      gates,
      documentationPackage: wadDocumentation?.documentationPackage ?? null,
    });
  } catch (error) {
    console.error('Error in release-to-p2 gate:', error);
    res.status(500).json({ message: 'Failed to process P2 release gate' });
  }
});

// GET /api/projects/:id/p2-gate-status — return the current gate status for a project
router.get('/:id/p2-gate-status', async (req, res) => {
  try {
    const { id } = req.params;
    const project = await storage.getProject(id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const steps = await storage.getProjectSteps(id);

    const poReviewStep = steps.find(s => s.stepType === 'purchase_review_checklist');
    const preproStep = steps.find(s => s.stepType === 'preproduction_checklist');

    // PO Review = APPROVED: must be explicitly completed
    const poReviewPassed = poReviewStep?.status === 'completed';

    // Preproduction = COMPLETE: must be explicitly completed
    const preproductionPassed = preproStep?.status === 'completed';

    // WAD = APPROVED: at least one WAD must be in an authorized state (RELEASED or beyond)
    const WAD_APPROVED_STATUSES = ['RELEASED', 'IN_PROGRESS', 'COMPLETE', 'CLOSED'];
    const workOrders = await storage.getWorkOrdersByProject(id);
    const wadPassed = workOrders.some(wo => WAD_APPROVED_STATUSES.includes(wo.status));
    const wadDocumentation = await getLatestProjectWadDocumentationPackage(id);
    const documentationIssues = wadDocumentation?.documentationPackage.gates.routingApproval.requiresSamplingPlan &&
      !wadDocumentation.documentationPackage.samplingPlanId
      ? ['Sampling plan is required by the WAD documentation package but no sampling plan ID is recorded.']
      : [];
    const documentationGate = {
      key: 'documentation_package',
      label: 'WAD Documentation Package',
      passed: Boolean(wadDocumentation) && documentationIssues.length === 0,
      status: !wadDocumentation ? 'missing_wad' : documentationIssues.length > 0 ? 'incomplete' : 'ready',
      message: !wadDocumentation
        ? 'No WAD documentation package is available.'
        : documentationIssues[0] ?? 'WAD documentation package is defined.',
      documentationPackage: wadDocumentation?.documentationPackage ?? null,
    };

    const quoteStep = steps.find(s => s.stepType === 'quote');
    const contractReviewGate = await getQuoteContractReviewGate(quoteStep?.linkedQuoteId ?? null, id, project.poId);

    const gates = [
      { key: 'po_review', label: 'PO Review', passed: poReviewPassed },
      contractReviewGate,
      { key: 'wad', label: 'WAD (Work Authorization Document)', passed: wadPassed },
      documentationGate,
      { key: 'preproduction', label: 'Preproduction', passed: preproductionPassed },
    ];

    const currentStage = project.currentStage || 'rfq_received';
    const alreadyReleased = currentStage === 'p2_release' || currentStage === 'production' || currentStage === 'completed';

    return res.json({
      gates,
      allPassed: gates.every(g => g.passed),
      currentStage,
      alreadyReleased,
      poId: project.poId ?? null,
      documentationPackage: wadDocumentation?.documentationPackage ?? null,
    });
  } catch (error) {
    console.error('Error fetching P2 gate status:', error);
    res.status(500).json({ message: 'Failed to fetch P2 gate status' });
  }
});

const romDraftBodySchema = z.object({
  summary: z.string().trim().optional().nullable(),
  assumptions: z.string().trim().optional().nullable(),
  riskNotes: z.string().trim().optional().nullable(),
  categories: z.record(z.any()).optional().default({}),
});

// PATCH /api/projects/:id/rom-draft - edit ROM draft until PO/contract award locks it.
router.patch('/:id/rom-draft', async (req, res) => {
  try {
    const parsed = romDraftBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid ROM draft payload', details: parsed.error.flatten() });
    }

    const lockState = await getRomLockState(req.params.id);
    if (!lockState.project) return res.status(404).json({ message: 'Project not found' });
    if (lockState.locked) {
      await pool.query(
        `UPDATE project_rom_drafts
         SET status = 'locked',
             locked_at = COALESCE(locked_at, NOW()),
             locked_reason = COALESCE(locked_reason, $2),
             updated_at = NOW()
         WHERE project_id = $1`,
        [req.params.id, lockState.reason],
      );
      return res.status(409).json({ message: 'ROM is locked after PO/contract award.', lockedReason: lockState.reason });
    }

    const actor = currentUserSnapshot(req as any);
    const categories = normalizeRomCategories(parsed.data.categories);
    const result = await pool.query(
      `INSERT INTO project_rom_drafts (
         project_id, status, summary, assumptions, risk_notes, categories,
         created_by, created_by_display_name, updated_by, updated_by_display_name
       )
       VALUES ($1, 'draft', $2, $3, $4, $5::jsonb, $6, $7, $6, $7)
       ON CONFLICT (project_id) DO UPDATE
       SET summary = EXCLUDED.summary,
           assumptions = EXCLUDED.assumptions,
           risk_notes = EXCLUDED.risk_notes,
           categories = EXCLUDED.categories,
           updated_by = EXCLUDED.updated_by,
           updated_by_display_name = EXCLUDED.updated_by_display_name,
           updated_at = NOW()
       WHERE project_rom_drafts.status = 'draft'
       RETURNING *`,
      [
        req.params.id,
        parsed.data.summary || null,
        parsed.data.assumptions || null,
        parsed.data.riskNotes || null,
        JSON.stringify(categories),
        actor.id,
        actor.displayName,
      ],
    );

    if (!result.rows[0]) {
      return res.status(409).json({ message: 'ROM is locked and cannot be edited.' });
    }

    res.json({
      ...result.rows[0],
      lockState: { locked: false, reason: null },
    });
  } catch (error: any) {
    console.error('Error saving ROM draft:', error);
    res.status(500).json({ message: 'Failed to save ROM draft', error: error.message });
  }
});

const projectSourcePartInventorySchema = z.object({
  poItemId: z.number().int().positive().optional().nullable(),
  partNumber: z.string().min(1, 'Source part number is required'),
  partName: z.string().optional().nullable(),
  manufacturedCategory: z
    .enum(['PACKET', 'KIT', 'MACHINED_PART', 'CORE', 'SUB_ASSEMBLY', 'ASSEMBLY', 'FINAL_ASSEMBLY', 'COMPOSITE', 'COMPONENT'])
    .default('COMPONENT'),
});

// POST /api/projects/:id/p2-hub/source-parts/inventory-item - convert a project PO source part into a manufactured AG inventory item.
router.post('/:id/p2-hub/source-parts/inventory-item', async (req, res) => {
  try {
    const { id } = req.params;
    const project = await storage.getProject(id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const input = projectSourcePartInventorySchema.parse(req.body);
    const poRows = await pool.query<any>(
      `WITH selected_po AS (
         SELECT COALESCE(parent_po_id, id) AS family_root_id
         FROM p2_purchase_orders
         WHERE id = $2
       ),
       project_pos AS (
         SELECT po.id
         FROM p2_purchase_orders po
         LEFT JOIN selected_po sp ON true
         WHERE po.project_id = $1::uuid
            OR po.id = $2
            OR po.id = sp.family_root_id
            OR po.parent_po_id = sp.family_root_id
       )
       SELECT poi.id, poi.po_id, poi.inventory_item_id, poi.part_number, poi.part_name,
              poi.quantity, poi.specifications, poi.notes
       FROM p2_purchase_order_items poi
       JOIN project_pos pp ON pp.id = poi.po_id
       WHERE ($3::int IS NULL OR poi.id = $3::int)
          OR LOWER(TRIM(poi.part_number)) = LOWER(TRIM($4::text))
       ORDER BY CASE WHEN poi.id = $3::int THEN 0 ELSE 1 END, poi.id ASC`,
      [id, project.poId ?? null, input.poItemId ?? null, input.partNumber],
    );
    const sourceLine = poRows[0];
    if (!sourceLine) {
      return res.status(404).json({ error: 'Source part was not found on this project PO family.' });
    }

    const existingByLink = sourceLine.inventory_item_id
      ? await pool.query<any>(
          `SELECT id, ag_part_number, name, item_type, manufactured_category
           FROM inventory_items
           WHERE id = $1
           LIMIT 1`,
          [sourceLine.inventory_item_id],
        )
      : [];
    const existingByPartNumber = existingByLink.length > 0
      ? []
      : await pool.query<any>(
          `SELECT id, ag_part_number, name, item_type, manufactured_category
           FROM inventory_items
           WHERE LOWER(TRIM(ag_part_number)) = LOWER(TRIM($1))
           LIMIT 1`,
          [sourceLine.part_number],
        );
    const existingItem = existingByLink[0] ?? existingByPartNumber[0] ?? null;
    const linkedPoItemIds = poRows.map((row: any) => row.id);

    if (existingItem) {
      const updated = await pool.query<any>(
        `UPDATE inventory_items
         SET item_type = 'MANUFACTURED',
             type = 'Manufactured',
             manufactured_category = COALESCE(manufactured_category, $2),
             manufacturing_level = COALESCE(manufacturing_level, 'COMPONENT'),
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, ag_part_number, name, item_type, manufactured_category`,
        [existingItem.id, input.manufacturedCategory],
      );
      await pool.query(
        `UPDATE p2_purchase_order_items
         SET inventory_item_id = $1, updated_at = NOW()
         WHERE id = ANY($2::int[])`,
        [existingItem.id, linkedPoItemIds],
      );
      return res.json({
        inventoryItem: updated[0] ?? existingItem,
        linkedPoItemIds,
        created: false,
      });
    }

    const sourcePartName = input.partName || sourceLine.part_name || sourceLine.part_number;
    const notes = [
      'Created from P2 Project BOM/Routing source part conversion.',
      project.projectCode || project.projectName ? `Project: ${project.projectCode || project.projectName}` : null,
      sourceLine.part_number ? `Source PO part: ${sourceLine.part_number}` : null,
      sourceLine.specifications ? `Specifications: ${sourceLine.specifications}` : null,
      sourceLine.notes ? `PO line notes: ${sourceLine.notes}` : null,
    ].filter(Boolean).join('\n');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const agPartNumber = await nextNumericInventoryPartNumber();
      const itemData = insertInventoryItemSchema.parse({
        agPartNumber,
        name: sourcePartName,
        description: sourcePartName,
        source: 'P2 Project BOM/Routing',
        supplierPartNumber: sourceLine.part_number,
        usageUnit: 'EA',
        purchaseUnit: 'EA',
        notes,
        itemType: 'MANUFACTURED',
        type: 'Manufactured',
        manufacturedCategory: input.manufacturedCategory,
        manufacturingLevel: 'COMPONENT',
        isActive: true,
        utilizedInPL2: true,
      });

      try {
        const newItem = await storage.createInventoryItem(itemData);
        await pool.query(
          `UPDATE p2_purchase_order_items
           SET inventory_item_id = $1, updated_at = NOW()
           WHERE id = ANY($2::int[])`,
          [newItem.id, linkedPoItemIds],
        );
        return res.status(201).json({
          inventoryItem: newItem,
          linkedPoItemIds,
          created: true,
        });
      } catch (error) {
        if (duplicateInventoryPartNumberError(error) && attempt < 4) continue;
        throw error;
      }
    }

    return res.status(409).json({ error: 'Unable to allocate a unique AG part number. Please retry.' });
  } catch (error) {
    console.error('Create project source inventory item error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Invalid source part payload' });
    }
    if (error instanceof Error) return res.status(400).json({ error: error.message });
    return res.status(500).json({ error: 'Failed to create manufactured inventory item for source part' });
  }
});

// GET /api/projects/:id/p2-hub - read-only P2 Project Hub tab model.
router.get('/:id/p2-hub', async (req, res) => {
  try {
    const { id } = req.params;
    const project = await storage.getProject(id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const optionalHubQuery = async <T>(
      label: string,
      query: string,
      params: unknown[] = [],
    ): Promise<T[]> => {
      try {
        return await pool.query<T>(query, params);
      } catch (error) {
        console.warn(`[Project P2 Hub] ${label} unavailable for project ${id}:`, error);
        return [];
      }
    };

    const [steps, projectRevisions, activityLog, workOrders, manualDocuments] = await Promise.all([
      storage.getProjectSteps(id).catch(() => []),
      storage.getProjectRevisions(id).catch(() => []),
      storage.getProjectActivityLog(id).catch(() => []),
      storage.getWorkOrdersByProject(id).catch(() => []),
      optionalHubQuery(
        'manual project documents',
        `SELECT id, label, original_file_name, mime_type, file_size,
                media_library_id, uploaded_by, created_at
         FROM project_documents
         WHERE project_id = $1
         ORDER BY created_at DESC`,
        [id],
      ),
    ]);

    const linkedPoFamily = project.poId
      ? await optionalHubQuery<any>(
          'PO revision family',
          `WITH selected_po AS (
             SELECT COALESCE(parent_po_id, id) AS family_root_id
             FROM p2_purchase_orders
             WHERE id = $1
           )
           SELECT po.id, po.po_number, po.customer_id, po.customer_name, po.po_date,
                  po.expected_delivery, po.status, po.project_name, po.revision_number,
                  po.parent_po_id, po.change_reason, po.is_current_revision,
                  po.revised_at, po.revised_by, po.created_at, po.updated_at
           FROM p2_purchase_orders po
           CROSS JOIN selected_po sp
           WHERE po.id = sp.family_root_id OR po.parent_po_id = sp.family_root_id
           ORDER BY po.revision_number DESC, po.created_at DESC`,
          [project.poId],
        )
      : [];

    const assignedProjectPos = await optionalHubQuery<any>(
      'project-assigned P2 POs',
      `SELECT po.id, po.po_number, po.customer_id, po.customer_name, po.po_date,
              po.expected_delivery, po.status, po.project_name, po.revision_number,
              po.parent_po_id, po.change_reason, po.is_current_revision,
              po.revised_at, po.revised_by, po.created_at, po.updated_at
       FROM p2_purchase_orders po
       WHERE po.project_id = $1::uuid
       ORDER BY po.revision_number DESC, po.created_at DESC`,
      [id],
    );
    const poFamilyById = new Map<number, any>();
    [...linkedPoFamily, ...assignedProjectPos].forEach((po: any) => {
      const poId = Number(po.id);
      if (Number.isFinite(poId) && !poFamilyById.has(poId)) {
        poFamilyById.set(poId, po);
      }
    });
    const poFamily = Array.from(poFamilyById.values());
    const currentPo = poFamily.find((po: any) => po.is_current_revision) ?? poFamily[0] ?? null;
    const poIds = poFamily.map((po: any) => po.id);
    const activePoId = currentPo?.id ?? project.poId ?? null;

    const poItems = poIds.length > 0
      ? await optionalHubQuery<any>(
          'PO line items',
          `SELECT id, po_id, inventory_item_id, part_number, part_name, quantity, unit_price,
                  total_price, specifications, notes, created_at, updated_at
           FROM p2_purchase_order_items
           WHERE po_id = ANY($1::int[])
           ORDER BY po_id DESC, id ASC`,
          [poIds],
        )
      : [];
    const poInventoryItemIds = Array.from(new Set(poItems
      .map((item: any) => Number(item.inventory_item_id))
      .filter((id: number) => Number.isInteger(id) && id > 0)));
    const poInventoryItems = poInventoryItemIds.length > 0
      ? await optionalHubQuery<any>(
          'PO inventory items',
          `SELECT id, ag_part_number, name, item_type, type, manufactured_category
           FROM inventory_items
           WHERE id = ANY($1::int[])`,
          [poInventoryItemIds],
        )
      : [];
    const poInventoryPartById = new Map(poInventoryItems.map((item: any) => [Number(item.id), item.ag_part_number]));
    const poInventoryItemById = new Map(poInventoryItems.map((item: any) => [Number(item.id), item]));
    const partNumbers = Array.from(new Set([
      ...poItems.map((item: any) => item.part_number).filter(Boolean),
      ...poItems
        .map((item: any) => poInventoryPartById.get(Number(item.inventory_item_id)))
        .filter(Boolean),
    ]));

    const [
      productionOrders,
      serializedItems,
      lots,
      packingSlips,
      certificates,
      invoices,
      partsRequests,
      receivedMaterials,
      projectRoutings,
      bomRecords,
      quoteFeedback,
      projectFarFlowdowns,
      romDraftRows,
    ] = await Promise.all([
      poIds.length > 0
        ? optionalHubQuery<any>(
            'P2 production orders',
            `SELECT id, order_id, p2_po_id, p2_po_item_id, bom_definition_id,
                    bom_item_id, sku, part_name, quantity, quantity_manufactured,
                    department, status, priority, due_date, scheduled_layup_date,
                    started_at, completed_at, created_at, updated_at
             FROM p2_production_orders
             WHERE p2_po_id = ANY($1::int[])
             ORDER BY created_at DESC`,
            [poIds],
          )
        : Promise.resolve([]),
      poIds.length > 0
        ? optionalHubQuery<any>(
            'serialized items',
            `SELECT id, serial_number, barcode, po_id, po_item_id, po_number,
                    part_number, part_name, current_department, status, completed_at,
                    finalized_at, part_routing_id, traveler_barcode, sku,
                    sequence_number, created_at, updated_at,
                    active_traveler.traveler_number AS active_traveler_number,
                    active_traveler.status AS active_traveler_status,
                    active_traveler.department_name AS active_traveler_department,
                    active_traveler.started_at AS active_traveler_started_at
             FROM p2_serialized_items
             LEFT JOIN LATERAL (
               SELECT t.traveler_number, t.status, active_step.department_name, active_step.started_at
               FROM travelers t
               LEFT JOIN LATERAL (
                 SELECT ts.department_name, ts.started_at
                 FROM traveler_steps ts
                 WHERE ts.traveler_id = t.id
                   AND UPPER(ts.status) IN ('IN_PROGRESS', 'ACTIVE', 'STARTED')
                 ORDER BY ts.step_number ASC
                 LIMIT 1
               ) active_step ON true
               WHERE (
                   LOWER(TRIM(t.serial_number)) = LOWER(TRIM(p2_serialized_items.serial_number))
                   OR LOWER(TRIM(t.serial_number)) = LOWER(TRIM(p2_serialized_items.barcode))
                   OR LOWER(TRIM(t.lot_number)) = LOWER(TRIM(p2_serialized_items.serial_number))
                   OR LOWER(TRIM(t.lot_number)) = LOWER(TRIM(p2_serialized_items.barcode))
                 )
                 AND UPPER(t.status) IN ('IN_PROGRESS', 'ACTIVE', 'STARTED', 'COMPLETED')
               ORDER BY
                 CASE WHEN UPPER(t.status) IN ('IN_PROGRESS', 'ACTIVE', 'STARTED') THEN 0 ELSE 1 END,
                 t.updated_at DESC NULLS LAST
               LIMIT 1
             ) active_traveler ON true
             WHERE po_id = ANY($1::int[])
             ORDER BY po_number, part_number, sequence_number`,
            [poIds],
          )
        : Promise.resolve([]),
      poIds.length > 0
        ? optionalHubQuery<any>(
            'lots',
            `SELECT id, lot_number, lot_type, po_id, po_item_id, quantity, status,
                    shipped_at, packing_slip_id, certificate_id, created_at
             FROM p2_lot_numbers
             WHERE po_id = ANY($1::int[])
             ORDER BY created_at DESC`,
            [poIds],
          )
        : Promise.resolve([]),
      poIds.length > 0
        ? optionalHubQuery<any>(
            'packing slips',
            `SELECT ps.id, ps.packing_slip_number, ps.lot_number_id, ps.lot_number,
                    ps.po_number, ps.invoice_number, ps.ship_date, ps.shipment_number,
                    ps.carrier, ps.tracking_number, ps.total_quantity, ps.status,
                    ps.external_pdf_url, ps.created_at
             FROM p2_packing_slips ps
             JOIN p2_lot_numbers ln ON ln.id = ps.lot_number_id
             WHERE ln.po_id = ANY($1::int[])
             ORDER BY ps.created_at DESC`,
            [poIds],
          )
        : Promise.resolve([]),
      poIds.length > 0
        ? optionalHubQuery<any>(
            'certificates of conformance',
            `SELECT coc.id, coc.certificate_number, coc.lot_number_id, coc.lot_number,
                    coc.po_number, coc.part_number, coc.part_name, coc.status,
                    coc.approved_at, coc.issued_at, coc.created_at
             FROM p2_certificates_of_conformance coc
             JOIN p2_lot_numbers ln ON ln.id = coc.lot_number_id
             WHERE ln.po_id = ANY($1::int[])
             ORDER BY coc.created_at DESC`,
            [poIds],
          )
        : Promise.resolve([]),
      poIds.length > 0
        ? optionalHubQuery<any>(
            'AR invoices',
            `SELECT DISTINCT ai.id, ai.invoice_number, ai.invoice_date, ai.due_date,
                    ai.po_id, ai.lot_id, ai.packing_slip_id, ai.total_amount,
                    ai.status, ai.sent_at, ai.created_at
             FROM ar_invoices ai
             LEFT JOIN p2_lot_numbers ln ON ln.id = ai.lot_id
             LEFT JOIN p2_packing_slips ps ON ps.id = ai.packing_slip_id
             LEFT JOIN p2_lot_numbers ps_ln ON ps_ln.id = ps.lot_number_id
             WHERE ln.po_id = ANY($1::int[]) OR ps_ln.po_id = ANY($1::int[])
             ORDER BY ai.created_at DESC`,
            [poIds],
          )
        : Promise.resolve([]),
      optionalHubQuery<any>(
        'project parts requests',
        `SELECT id, part_number, part_name, quantity, urgency, status,
                estimated_cost, vendor_po_id, qty_ordered, qty_received,
                request_date, updated_at
         FROM parts_requests
         WHERE project_id = $1
         ORDER BY request_date DESC`,
        [id],
      ),
      optionalHubQuery<any>(
        'project received materials',
        `SELECT id, received_unit_id, receipt_id, material_lot_id, quantity,
                unit_cost, extended_cost, status, accepted_at, created_at
         FROM project_received_materials
         WHERE project_id = $1
         ORDER BY created_at DESC`,
        [id],
      ),
      optionalHubQuery<any>(
        'part routings',
        partNumbers.length > 0
          ? `SELECT id, project_id, part_number, part_name, routing_name,
                    routing_revision, routing_type, is_active, department_config,
                    qc_standards, created_by,
                    created_at, updated_at
             FROM part_routings
             WHERE project_id = $1 OR part_number = ANY($2::text[])
             ORDER BY is_active DESC, updated_at DESC`
          : `SELECT id, project_id, part_number, part_name, routing_name,
                    routing_revision, routing_type, is_active, department_config,
                    qc_standards, created_by,
                    created_at, updated_at
             FROM part_routings
             WHERE project_id = $1
             ORDER BY is_active DESC, updated_at DESC`,
        partNumbers.length > 0 ? [id, partNumbers] : [id],
      ),
      partNumbers.length > 0
        ? optionalHubQuery<any>(
            'BOM records',
            `SELECT b.id, b.parent_part_ag_number, b.code, b.description, b.is_active,
                    br.id AS latest_revision_id, br.rev_code AS latest_rev_code,
                    br.created_at AS latest_rev_created_at,
                    COUNT(bl.id)::int AS line_count
             FROM boms b
             LEFT JOIN LATERAL (
               SELECT id, rev_code, created_at
               FROM bom_revisions
               WHERE bom_id = b.id
               ORDER BY created_at DESC
               LIMIT 1
             ) br ON true
             LEFT JOIN bom_lines bl ON bl.revision_id = br.id
             WHERE b.parent_part_ag_number = ANY($1::text[])
             GROUP BY b.id, br.id, br.rev_code, br.created_at
             ORDER BY b.is_active DESC, br.created_at DESC NULLS LAST`,
            [partNumbers],
          )
        : Promise.resolve([]),
      optionalHubQuery<any>(
        'quote execution feedback',
        `SELECT id, quote_id, quoted_labor_hours, actual_labor_hours,
                labor_hours_variance, labor_hours_variance_pct, summary,
                created_at, updated_at
         FROM quote_execution_feedback
         WHERE project_id = $1
         ORDER BY updated_at DESC
         LIMIT 1`,
        [id],
      ),
      optionalHubQuery<any>(
        'project FAR flowdowns',
        `SELECT pff.id, pff.project_id, pff.purchase_review_checklist_id,
                pff.applicable, pff.reasoning, pff.source, pff.status,
                ffc.clause_number, ffc.title
         FROM project_far_flowdowns pff
         JOIN far_flowdown_clauses ffc ON ffc.id = pff.clause_id
         WHERE pff.project_id = $1
         ORDER BY pff.created_at DESC`,
        [id],
      ),
      optionalHubQuery<any>(
        'project ROM draft',
        `SELECT id, project_id, status, summary, assumptions, risk_notes,
                categories, locked_at, locked_reason, updated_at,
                updated_by_display_name
         FROM project_rom_drafts
         WHERE project_id = $1
         LIMIT 1`,
        [id],
      ),
    ]);

    const routingIds = projectRoutings.map((routing: any) => routing.id).filter(Boolean);
    const routingOperationSummaries = routingIds.length > 0
      ? await optionalHubQuery<any>(
          'routing operation summaries',
          `SELECT part_routing_id,
                  COUNT(*)::int AS operation_count,
                  COUNT(*) FILTER (
                    WHERE instruction_pack IS NOT NULL
                      AND instruction_pack::text NOT IN ('{}', '[]', 'null', '""')
                  )::int AS instruction_pack_count,
                  COUNT(*) FILTER (
                    WHERE operation_type IN ('QC', 'INSPECT')
                  )::int AS inspection_operation_count,
                  COUNT(*) FILTER (
                    WHERE certificate_required = true
                       OR receiving_inspection_required = true
                  )::int AS material_cert_requirement_count
           FROM routing_operations
           WHERE part_routing_id = ANY($1::uuid[])
           GROUP BY part_routing_id`,
          [routingIds],
        )
      : [];

    const completedSteps = steps.filter((step: any) => step.status === 'completed');
    const latestWad = [...workOrders].sort((a: any, b: any) => {
      const aTime = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
      const bTime = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
      return bTime - aTime;
    })[0] ?? null;
    const activePoItems = activePoId ? poItems.filter((item: any) => item.po_id === activePoId) : poItems;
    const sourceParts = activePoItems.map((item: any) => {
      const inventoryItem = poInventoryItemById.get(Number(item.inventory_item_id)) ?? null;
      const itemType = String(inventoryItem?.item_type ?? inventoryItem?.type ?? '').trim().toUpperCase();
      return {
        poItemId: item.id,
        poId: item.po_id,
        partNumber: item.part_number,
        partName: item.part_name,
        quantity: item.quantity,
        inventoryItemId: inventoryItem?.id ?? null,
        agPartNumber: inventoryItem?.ag_part_number ?? null,
        inventoryName: inventoryItem?.name ?? null,
        itemType: inventoryItem?.item_type ?? inventoryItem?.type ?? null,
        manufacturedCategory: inventoryItem?.manufactured_category ?? null,
        isManufactured: itemType === 'MANUFACTURED',
      };
    });
    const normalizeProductionKey = (value: unknown) => String(value ?? '').trim().toLowerCase();
    const normalizePlacementLabel = (value: unknown) => {
      const raw = String(value ?? '').trim();
      if (!raw) return '';
      const key = raw.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
      const canonical: Record<string, string> = {
        active: 'In Production',
        in_progress: 'In Production',
        'in progress': 'In Production',
        started: 'In Production',
        scheduled: 'Scheduled',
        pending: 'Pending',
        completed: 'Completed',
        complete: 'Completed',
        finalized: 'Completed',
        shipped: 'Shipped',
        closed: 'Closed',
        'pending layup': 'Pending Layup',
        layup: 'Layup',
        'cutting table': 'Cutting Table',
        cnc: 'CNC',
        finish: 'Finish',
        paint: 'Paint',
        'final qc': 'Final QC',
        qc: 'Final QC',
        shipping: 'Shipping',
      };
      return canonical[key] || raw;
    };
    const isCompletedSerializedItem = (item: any) => {
      const status = String(item.status ?? item.active_traveler_status ?? '').toUpperCase();
      return ['COMPLETE', 'COMPLETED', 'FINALIZED', 'SHIPPED', 'CLOSED'].includes(status)
        || Boolean(item.completed_at || item.finalized_at);
    };
    const getSerializedPlacement = (item: any) => {
      if (isCompletedSerializedItem(item)) return 'Completed';
      return normalizePlacementLabel(
        item.active_traveler_department
          || item.current_department
          || item.active_traveler_status
          || item.status
          || 'Not placed'
      );
    };
    const completedSerials = serializedItems.filter(isCompletedSerializedItem);
    const activePoItemIds = new Set(activePoItems.map((item: any) => Number(item.id)).filter(Number.isFinite));
    const lineIdByPart = new Map<string, number>();
    activePoItems.forEach((item: any) => {
      const partKey = normalizeProductionKey(item.part_number);
      const itemId = Number(item.id);
      if (partKey && Number.isFinite(itemId) && !lineIdByPart.has(partKey)) {
        lineIdByPart.set(partKey, itemId);
      }
    });
    const resolveLineId = (row: any, partValue?: unknown) => {
      const exactId = Number(row.po_item_id ?? row.p2_po_item_id);
      if (Number.isFinite(exactId) && activePoItemIds.has(exactId)) return exactId;
      const partKey = normalizeProductionKey(partValue ?? row.part_number ?? row.sku);
      return partKey ? lineIdByPart.get(partKey) ?? null : null;
    };
    const serializedByLineId = new Map<number, any[]>();
    serializedItems.forEach((item: any) => {
      const lineId = resolveLineId(item);
      if (!lineId) return;
      const rows = serializedByLineId.get(lineId) ?? [];
      rows.push(item);
      serializedByLineId.set(lineId, rows);
    });
    const productionOrdersByLineId = new Map<number, any[]>();
    productionOrders.forEach((order: any) => {
      const lineId = resolveLineId(order, order.sku ?? order.part_number);
      if (!lineId) return;
      const rows = productionOrdersByLineId.get(lineId) ?? [];
      rows.push(order);
      productionOrdersByLineId.set(lineId, rows);
    });
    const workOrdersByPart = new Map<string, any[]>();
    workOrders.forEach((workOrder: any) => {
      const partKey = normalizeProductionKey(workOrder.partNumber ?? workOrder.part_number);
      if (!partKey) return;
      const rows = workOrdersByPart.get(partKey) ?? [];
      rows.push(workOrder);
      workOrdersByPart.set(partKey, rows);
    });
    const poLinePlacements = activePoItems.map((item: any) => {
      const lineId = Number(item.id);
      const lineSerializedItems = serializedByLineId.get(lineId) ?? [];
      const lineProductionOrders = productionOrdersByLineId.get(lineId) ?? [];
      const lineWorkOrders = workOrdersByPart.get(normalizeProductionKey(item.part_number)) ?? [];
      const orderedQuantity = Math.max(0, Number(item.quantity ?? 0) || 0);
      const completedQuantity = lineSerializedItems.filter(isCompletedSerializedItem).length;
      const serializedQuantity = lineSerializedItems.length;
      const unreleasedQuantity = Math.max(orderedQuantity - serializedQuantity, 0);
      const remainingQuantity = Math.max(orderedQuantity - completedQuantity, 0);
      const placementCounts = lineSerializedItems.reduce((counts: Record<string, number>, serializedItem: any) => {
        const placement = getSerializedPlacement(serializedItem) || 'Not placed';
        counts[placement] = (counts[placement] ?? 0) + 1;
        return counts;
      }, {});
      if (unreleasedQuantity > 0) {
        placementCounts['Not serialized / not released'] = unreleasedQuantity;
      }

      return {
        poItemId: item.id,
        poId: item.po_id,
        partNumber: item.part_number,
        partName: item.part_name,
        orderedQuantity,
        serializedQuantity,
        completedQuantity,
        remainingQuantity,
        unreleasedQuantity,
        placementCounts,
        productionOrders: lineProductionOrders,
        workOrders: lineWorkOrders,
        serializedItems: lineSerializedItems.map((serializedItem: any) => ({
          ...serializedItem,
          productionPlacement: getSerializedPlacement(serializedItem),
          activeTravelerNumber: serializedItem.active_traveler_number ?? null,
        })),
      };
    });
    const productionTotals = poLinePlacements.reduce((totals: Record<string, number>, line: any) => {
      totals.orderedQuantity += line.orderedQuantity;
      totals.serializedQuantity += line.serializedQuantity;
      totals.completedQuantity += line.completedQuantity;
      totals.remainingQuantity += line.remainingQuantity;
      totals.unreleasedQuantity += line.unreleasedQuantity;
      return totals;
    }, {
      orderedQuantity: 0,
      serializedQuantity: 0,
      completedQuantity: 0,
      remainingQuantity: 0,
      unreleasedQuantity: 0,
    });
    const laborBudgetHours = workOrders.reduce((sum: number, workOrder: any) => {
      const hours = Number(workOrder.totalBudgetHours ?? 0);
      return Number.isFinite(hours) ? sum + hours : sum;
    }, 0);
    const materialBudget = workOrders.reduce((sum: number, workOrder: any) => {
      const amount = Number(workOrder.materialBudgetAmount ?? 0);
      return Number.isFinite(amount) ? sum + amount : sum;
    }, 0);
    const receivedMaterialCost = receivedMaterials.reduce((sum: number, material: any) => {
      const amount = Number(material.extended_cost ?? 0);
      return Number.isFinite(amount) ? sum + amount : sum;
    }, 0);
    const latestQuoteFeedback = quoteFeedback[0] ?? null;
    const routeByPartNumber = new Map(
      projectRoutings
        .filter((routing: any) => routing.part_number)
        .map((routing: any) => [String(routing.part_number).trim().toLowerCase(), routing]),
    );
    const routingOperationSummaryById = new Map(
      routingOperationSummaries.map((summary: any) => [String(summary.part_routing_id), summary]),
    );
    const hasManualDocument = (...needles: string[]) => manualDocuments.some((document: any) => {
      const haystack = [
        document.label,
        document.original_file_name,
        document.mime_type,
      ].filter(Boolean).join(' ').toLowerCase();
      return needles.some(needle => haystack.includes(needle.toLowerCase()));
    });
    const stepByType = new Map(steps.map((step: any) => [step.stepType, step]));
    const isStepCovered = (stepType: string) => {
      const step = stepByType.get(stepType) as any;
      return !!step && ['completed', 'not_applicable'].includes(step.status);
    };
    const activePoPartNumbers = Array.from(new Set(activePoItems.map((item: any) => item.part_number).filter(Boolean)));
    const partsMissingRoutings = activePoPartNumbers.filter((partNumber: string) => (
      !routeByPartNumber.has(String(partNumber).trim().toLowerCase())
    ));
    const partsMissingInstructions = activePoPartNumbers.filter((partNumber: string) => {
      const routing = routeByPartNumber.get(String(partNumber).trim().toLowerCase()) as any;
      if (!routing) return true;
      const operationSummary = routingOperationSummaryById.get(String(routing.id)) as any;
      const departmentConfigText = JSON.stringify(routing.department_config ?? {});
      const hasInstructionConfig = /workInstructionRefs|aiSnippets|specialNotes|instructionPack|media/i.test(departmentConfigText);
      return !hasInstructionConfig && Number(operationSummary?.instruction_pack_count ?? 0) === 0;
    });
    const routingInspectionCount = routingOperationSummaries.reduce((sum: number, summary: any) => (
      sum + Number(summary.inspection_operation_count ?? 0)
    ), 0);
    const routingMaterialCertRequirementCount = routingOperationSummaries.reduce((sum: number, summary: any) => (
      sum + Number(summary.material_cert_requirement_count ?? 0)
    ), 0);
    const routingQcStandardCount = projectRoutings.reduce((sum: number, routing: any) => {
      const standards = routing.qc_standards;
      return sum + (Array.isArray(standards) ? standards.length : standards ? 1 : 0);
    }, 0);
    const poSpecsCount = activePoItems.filter((item: any) => item.specifications || item.notes).length;
    const revisionsForSpecs = projectRevisions.filter((revision: any) => {
      const type = String(revision.revisionType ?? revision.revision_type ?? '').toLowerCase();
      return ['drawing', 'contract', 'spec', 'po'].includes(type);
    });
    const coverageItems = [
      {
        key: 'customer_po',
        label: 'Customer PO',
        status: currentPo ? 'covered_by_project_data' : 'needs_upload',
        source: currentPo ? 'P2 PO record' : 'Project document upload',
        detail: currentPo ? `PO ${currentPo.po_number ?? currentPo.poNumber ?? activePoId} is linked to the project.` : 'Attach or link the customer PO before release.',
        route: currentPo ? `/p2/purchase-orders/${currentPo.id}/preview` : '/p2-control-center',
        relatedCount: currentPo ? 1 : 0,
      },
      {
        key: 'drawing',
        label: 'Drawing',
        status: hasManualDocument('drawing', 'print') ? 'attached' : 'covered_by_project_data',
        source: hasManualDocument('drawing', 'print') ? 'Project document attachment' : 'Received / pending vaulted storage',
        detail: hasManualDocument('drawing', 'print')
          ? 'Drawing file is attached to the project.'
          : 'Vaulted drawing storage is not available yet, so received drawing status is tracked as acceptable project coverage.',
        route: `/projects/${id}?tab=workflow`,
        relatedCount: manualDocuments.filter((document: any) => String(document.label ?? document.original_file_name ?? '').toLowerCase().includes('drawing')).length,
      },
      {
        key: 'rev_spec',
        label: 'Revision / Specification',
        status: revisionsForSpecs.length > 0 || poSpecsCount > 0 ? 'covered_by_project_data' : 'needs_clarification',
        source: revisionsForSpecs.length > 0 ? 'Project revision ledger' : poSpecsCount > 0 ? 'PO line specifications' : 'Clarification required',
        detail: revisionsForSpecs.length > 0 || poSpecsCount > 0
          ? 'Revision/spec coverage is present through project revisions or PO line specifications.'
          : 'Define whether Rev/Spec means drawing revision, customer spec, PO revision, or part specification for this project.',
        route: `/projects/${id}?tab=po`,
        relatedCount: revisionsForSpecs.length + poSpecsCount,
      },
      {
        key: 'work_instructions',
        label: 'Work Instructions',
        status: activePoPartNumbers.length > 0 && partsMissingInstructions.length === 0 ? 'covered_by_project_data' : 'needs_setup',
        source: 'Part routing instruction packs',
        detail: activePoPartNumbers.length === 0
          ? 'No PO parts are linked yet.'
          : partsMissingInstructions.length === 0
            ? 'Every PO part has routing instruction evidence.'
            : `${partsMissingInstructions.length} PO part(s) need work instruction setup.`,
        route: `/p2-control-center?tab=routing&projectId=${encodeURIComponent(id)}`,
        relatedCount: Math.max(activePoPartNumbers.length - partsMissingInstructions.length, 0),
        missingParts: partsMissingInstructions,
      },
      {
        key: 'bom',
        label: 'BOM',
        status: bomRecords.length > 0 ? 'covered_by_project_data' : 'needs_setup',
        source: 'Project BOM/Routing tab',
        detail: bomRecords.length > 0 ? `${bomRecords.length} BOM record(s) match PO parts.` : 'Create or link BOM records for the PO parts.',
        route: `/projects/${id}?tab=bom-routing`,
        relatedCount: bomRecords.length,
      },
      {
        key: 'routing',
        label: 'Routing',
        status: projectRoutings.length > 0 && partsMissingRoutings.length === 0 ? 'covered_by_project_data' : 'needs_setup',
        source: 'Part routings',
        detail: partsMissingRoutings.length === 0 && projectRoutings.length > 0
          ? `${projectRoutings.length} routing record(s) cover the PO parts.`
          : `${partsMissingRoutings.length || activePoPartNumbers.length} PO part(s) need routing coverage.`,
        route: `/projects/${id}?tab=bom-routing`,
        relatedCount: projectRoutings.length,
        missingParts: partsMissingRoutings,
      },
      {
        key: 'quote',
        label: 'Quote',
        status: isStepCovered('quote') || !!latestQuoteFeedback ? 'covered_by_project_data' : 'needs_setup',
        source: latestQuoteFeedback ? 'ROM / quote feedback' : 'Project workflow',
        detail: isStepCovered('quote') || !!latestQuoteFeedback ? 'Quote or quote execution feedback is linked to the project.' : 'Link or complete the quote workflow step.',
        route: `/p2-quote-form?projectId=${encodeURIComponent(id)}`,
        relatedCount: isStepCovered('quote') || !!latestQuoteFeedback ? 1 : 0,
      },
      {
        key: 'risk_assessment',
        label: 'Risk Assessment',
        status: isStepCovered('rfq_risk_assessment') ? 'covered_by_project_data' : 'needs_setup',
        source: 'RFQ risk assessment step',
        detail: isStepCovered('rfq_risk_assessment') ? 'Risk assessment workflow step is complete.' : 'Complete or link the RFQ risk assessment.',
        route: '/rfq-risk-assessment',
        relatedCount: isStepCovered('rfq_risk_assessment') ? 1 : 0,
      },
      {
        key: 'purchase_review_checklist',
        label: 'Purchase Review Checklist',
        status: isStepCovered('purchase_review_checklist') || projectFarFlowdowns.length > 0 ? 'covered_by_project_data' : 'needs_setup',
        source: 'Purchase review workflow',
        detail: isStepCovered('purchase_review_checklist') || projectFarFlowdowns.length > 0 ? 'Purchase review evidence is linked to the project.' : 'Complete the purchase review checklist.',
        route: `/purchase-review-checklist?projectId=${encodeURIComponent(id)}`,
        relatedCount: projectFarFlowdowns.length || (isStepCovered('purchase_review_checklist') ? 1 : 0),
      },
      {
        key: 'material_cert_requirements',
        label: 'Material Cert Requirements',
        status: routingMaterialCertRequirementCount > 0 || certificates.length > 0 ? 'covered_by_project_data' : 'needs_setup',
        source: routingMaterialCertRequirementCount > 0 ? 'Routing operation requirements' : certificates.length > 0 ? 'COC / cert records' : 'Structured requirement setup needed',
        detail: routingMaterialCertRequirementCount > 0 || certificates.length > 0
          ? 'Certificate requirements or resulting cert records are visible in the project read model.'
          : 'Add a structured requirement model for material cert type, supplier responsibility, receiving hold, and closeout evidence.',
        route: `/projects/${id}?tab=material`,
        relatedCount: routingMaterialCertRequirementCount + certificates.length,
      },
      {
        key: 'inspection_plan',
        label: 'Inspection Plan',
        status: routingInspectionCount > 0 || routingQcStandardCount > 0 ? 'covered_by_project_data' : 'needs_setup',
        source: 'QC routing requirements',
        detail: routingInspectionCount > 0 || routingQcStandardCount > 0 ? 'QC/inspection operations or standards exist on the routing.' : 'Add QC standards or inspection operations to the part routing.',
        route: `/projects/${id}?tab=bom-routing`,
        relatedCount: routingInspectionCount + routingQcStandardCount,
      },
      {
        key: 'flowdowns',
        label: 'Flow Downs',
        status: projectFarFlowdowns.length > 0 ? 'covered_by_project_data' : 'needs_setup',
        source: 'WAD / purchase review flowdowns',
        detail: projectFarFlowdowns.length > 0 ? `${projectFarFlowdowns.length} project flowdown clause(s) are recorded.` : 'Capture flowdowns through the purchase review checklist so WAD can display them.',
        route: `/projects/${id}?tab=workflow`,
        relatedCount: projectFarFlowdowns.length,
      },
    ];
    const coveredStatuses = new Set(['attached', 'covered_by_project_data', 'not_applicable']);
    const coverageCoveredCount = coverageItems.filter(item => coveredStatuses.has(item.status)).length;
    const latestRomDraft = romDraftRows[0] ?? null;
    const romLockState = await getRomLockState(id);
    const savedRomCategories = latestRomDraft?.categories && typeof latestRomDraft.categories === 'object'
      ? latestRomDraft.categories
      : {};
    const getSavedRomNumber = (category: string, key = 'budgetAmount') => {
      const value = savedRomCategories?.[category]?.[key];
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    };
    const romLaborHours = getSavedRomNumber('labor', 'quotedHours') ?? latestQuoteFeedback?.quoted_labor_hours ?? null;
    const romMaterialBudget = getSavedRomNumber('material') ?? materialBudget;

    return res.json({
      project,
      generatedAt: new Date().toISOString(),
      source: {
        mode: 'read_model',
        activePoId,
        poFamilyIds: poIds,
        additiveOnly: true,
      },
      tabs: {
        workflow: {
          summary: {
            totalSteps: steps.length,
            completedSteps: completedSteps.length,
            currentStage: project.currentStage ?? null,
            status: project.status ?? null,
          },
          steps,
          completedForms: completedSteps,
          activityLog,
          documents: manualDocuments,
        },
        documentCoverage: {
          summary: {
            totalItems: coverageItems.length,
            coveredItems: coverageCoveredCount,
            needsAttention: coverageItems.length - coverageCoveredCount,
            attachedItems: coverageItems.filter(item => item.status === 'attached').length,
            coveredByProjectData: coverageItems.filter(item => item.status === 'covered_by_project_data').length,
          },
          items: coverageItems,
          flowdowns: projectFarFlowdowns,
          routingOperationSummaries,
        },
        po: {
          summary: {
            currentPo,
            revisionCount: Math.max(poFamily.length - 1, 0),
            lineItemCount: activePoItems.length,
          },
          currentPo,
          lineItems: activePoItems,
          revisionFamily: poFamily,
          projectRevisions: projectRevisions.filter((revision: any) => revision.revisionType === 'po'),
        },
        bomRouting: {
          summary: {
            bomCount: bomRecords.length,
            routingCount: projectRoutings.length,
            manufacturedLineCount: poItems.length,
          },
          bomRecords,
          routings: projectRoutings,
          sourcePartNumbers: partNumbers,
          sourceParts,
          changeLinks: projectRevisions.filter((revision: any) => ['drawing', 'contract'].includes(revision.revisionType)),
        },
        wad: {
          summary: {
            latestWad,
            totalWads: workOrders.length,
            releasedOrBeyond: workOrders.filter((wo: any) => ['RELEASED', 'IN_PROGRESS', 'COMPLETE', 'CLOSED'].includes(wo.status)).length,
          },
          latestWad,
          workOrders,
          revisions: projectRevisions.filter((revision: any) => revision.revisionType === 'wad'),
        },
        rom: {
          summary: {
            ...(latestQuoteFeedback ?? {}),
            draftId: latestRomDraft?.id ?? null,
            status: romLockState.locked ? 'locked' : (latestRomDraft?.status ?? 'draft'),
            locked: romLockState.locked,
            lockedAt: latestRomDraft?.locked_at ?? null,
            lockedReason: romLockState.reason ?? latestRomDraft?.locked_reason ?? null,
            draftSummary: latestRomDraft?.summary ?? latestQuoteFeedback?.summary ?? null,
            assumptions: latestRomDraft?.assumptions ?? null,
            riskNotes: latestRomDraft?.risk_notes ?? null,
            updatedAt: latestRomDraft?.updated_at ?? latestQuoteFeedback?.updated_at ?? null,
            updatedByDisplayName: latestRomDraft?.updated_by_display_name ?? null,
          },
          draft: latestRomDraft,
          lockState: {
            locked: romLockState.locked,
            reason: romLockState.reason,
          },
          categories: {
            labor: { quotedHours: romLaborHours },
            material: { budgetAmount: romMaterialBudget },
            outsideProcessing: { budgetAmount: getSavedRomNumber('outsideProcessing') },
            nrc: { budgetAmount: getSavedRomNumber('nrc') },
            tooling: { budgetAmount: getSavedRomNumber('tooling') },
            design: { budgetAmount: getSavedRomNumber('design') },
            capital: { budgetAmount: getSavedRomNumber('capital') },
            generalAndAdmin: { budgetAmount: getSavedRomNumber('generalAndAdmin') },
            overhead: { budgetAmount: getSavedRomNumber('overhead') },
            qualityAndCompliance: { budgetAmount: getSavedRomNumber('qualityAndCompliance') },
            shippingAndPackaging: { budgetAmount: getSavedRomNumber('shippingAndPackaging') },
            contingency: { budgetAmount: getSavedRomNumber('contingency') },
            escalationAndInflation: { budgetAmount: getSavedRomNumber('escalationAndInflation') },
            profitFee: { budgetAmount: getSavedRomNumber('profitFee') },
          },
        },
        production: {
          summary: {
            productionOrderCount: productionOrders.length,
            serializedCount: serializedItems.length,
            completedSerializedCount: completedSerials.length,
            workOrderCount: workOrders.length,
            ...productionTotals,
          },
          poLinePlacements,
          productionOrders,
          serializedItems,
          assemblyTree: {
            poItems: activePoItems,
            bomRecords,
            productionOrders,
          },
        },
        material: {
          summary: {
            partsRequestCount: partsRequests.length,
            receivedMaterialCount: receivedMaterials.length,
            materialBudget,
            receivedMaterialCost,
          },
          parts: poItems,
          partsRequests,
          receivedMaterials,
        },
        labor: {
          summary: {
            budgetHours: laborBudgetHours,
            actualHours: latestQuoteFeedback?.actual_labor_hours ?? null,
            varianceHours: latestQuoteFeedback?.labor_hours_variance ?? null,
            variancePercent: latestQuoteFeedback?.labor_hours_variance_pct ?? null,
          },
          workOrders,
          quoteFeedback: latestQuoteFeedback,
        },
        traceability: {
          summary: {
            travelerCount: serializedItems.length,
            cocCount: certificates.length,
            lotCount: lots.length,
          },
          travelers: serializedItems,
          lots,
          certificates,
        },
        shippingInvoicing: {
          summary: {
            packingSlipCount: packingSlips.length,
            invoiceCount: invoices.length,
            needsInvoice: packingSlips.length > invoices.length,
            sentInvoices: invoices.filter((invoice: any) => invoice.status === 'SENT' || invoice.sent_at).length,
            receivedInvoices: invoices.filter((invoice: any) => ['PAID', 'RECEIVED'].includes(invoice.status)).length,
          },
          packingSlips,
          certificates,
          invoices,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching P2 project hub:', error);
    res.status(500).json({ message: 'Failed to fetch P2 project hub' });
  }
});

// GET /api/projects/:id/traceability — full cradle-to-grave data for a project
router.get('/:id/traceability', async (req, res) => {
  try {
    const { id } = req.params;
    const project = await storage.getProject(id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    if (!project.poId) {
      return res.json({ hasShipment: false, serials: [], project, po: null });
    }

    // PO details
    const poRows = await pool.query<{
      id: number; po_number: string; customer_name: string; customer_id: string; status: string; created_at: string;
    }>(
      `SELECT id, po_number, customer_name, customer_id, status, created_at
       FROM p2_purchase_orders WHERE id = $1 LIMIT 1`,
      [project.poId]
    );
    const po = poRows[0] ?? null;
    const linkedPoId = Number(project.poId);
    let traceabilityPoIds = [linkedPoId].filter(Number.isFinite);

    if (po) {
      const poFamilyRows = await pool.query<{
        id: number;
        parentPoId: number | null;
        revisionNumber: number;
      }>(
        `WITH linked_po AS (
           SELECT id, parent_po_id
           FROM p2_purchase_orders
           WHERE id = $1
         ),
         family_root AS (
           SELECT COALESCE(parent_po_id, id) AS root_id
           FROM linked_po
         )
         SELECT id,
                parent_po_id AS "parentPoId",
                revision_number AS "revisionNumber"
         FROM p2_purchase_orders
         WHERE id = (SELECT root_id FROM family_root)
            OR parent_po_id = (SELECT root_id FROM family_root)
         ORDER BY revision_number ASC, id ASC`,
        [linkedPoId]
      );
      const familyIds = poFamilyRows
        .map((row) => Number(row.id))
        .filter(Number.isFinite);
      if (familyIds.length > 0) {
        traceabilityPoIds = familyIds;
      }
    }

    const optionalTraceQuery = async <T>(
      label: string,
      query: string,
      params: unknown[],
    ): Promise<T[]> => {
      try {
        return await pool.query<T>(query, params);
      } catch (error) {
        console.warn(`[Project Traceability] ${label} unavailable for project ${id}:`, error);
        return [];
      }
    };

    // Lot — most recent for this PO
    const lots = await optionalTraceQuery<{
      id: string; lot_number: string; status: string; shipped_at: string | null;
      created_at: string; quantity: number; po_number: string;
    }>('lot lookup',
      `SELECT id, lot_number, status, shipped_at, created_at, quantity, po_number
       FROM p2_lot_numbers
       WHERE po_id = ANY($1::int[])
       ORDER BY created_at DESC
       LIMIT 1`,
      [traceabilityPoIds]
    );
    const lot = lots[0] ?? null;

    let packingSlip: any = null;
    let packingSlips: any[] = [];
    let certificate: any = null;
    let invoice: any = null;

    if (lot) {
      // Packing slip — most recent for Shipment Summary
      const slips = await optionalTraceQuery<{
        id: string; packing_slip_number: string; status: string;
        ship_date: string | null; carrier: string | null; tracking_number: string | null;
        total_quantity: number; created_at: string;
      }>('packing slip lookup',
        `SELECT id, packing_slip_number, status, ship_date, carrier, tracking_number,
                total_quantity, created_at
         FROM p2_packing_slips
         WHERE lot_number_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [lot.id]
      );
      packingSlip = slips[0] ?? null;

      // Certificate of Conformance
      const cocs = await optionalTraceQuery<{
        id: string; certificate_number: string; status: string;
        approved_at: string | null; issued_at: string | null; created_at: string;
      }>('certificate lookup',
        `SELECT id, certificate_number, status, approved_at, issued_at, created_at
         FROM p2_certificates_of_conformance
         WHERE lot_number_id = $1
         LIMIT 1`,
        [lot.id]
      );
      certificate = cocs[0] ?? null;

      // Invoice (optional — linked via lot_id or packing_slip_id)
      const invoiceParams: any[] = [lot.id];
      let invoiceWhere = `WHERE lot_id = $1`;
      if (packingSlip) {
        invoiceWhere += ` OR packing_slip_id = $2`;
        invoiceParams.push(packingSlip.id);
      }
      const invoices = await optionalTraceQuery<{
        id: string; invoice_number: string; status: string;
        total_amount: string; invoice_date: string; created_at: string;
      }>('invoice lookup',
        `SELECT id, invoice_number, status, total_amount, invoice_date, created_at
         FROM ar_invoices ${invoiceWhere}
         ORDER BY created_at DESC
         LIMIT 1`,
        invoiceParams
      );
      invoice = invoices[0] ?? null;
    }

    // All packing slips across all lots for this PO (for Documents section)
    const allSlipsResult = await optionalTraceQuery<{
      id: string; packing_slip_number: string; status: string;
      ship_date: string | null; carrier: string | null; tracking_number: string | null;
      total_quantity: number; created_at: string; external_pdf_url: string | null;
    }>('all packing slips lookup',
      `SELECT ps.id, ps.packing_slip_number, ps.status, ps.ship_date, ps.carrier,
              ps.tracking_number, ps.total_quantity, ps.created_at, ps.external_pdf_url
       FROM p2_packing_slips ps
       JOIN p2_lot_numbers ln ON ln.id = ps.lot_number_id
       WHERE ln.po_id = ANY($1::int[])
       ORDER BY ps.created_at ASC`,
      [traceabilityPoIds]
    );
    packingSlips = allSlipsResult;

    const currentPoItems = await optionalTraceQuery<{
      poItemId: number;
      orderedQuantity: number;
    }>('current revision PO item lookup',
      `SELECT id AS "poItemId",
              quantity AS "orderedQuantity"
       FROM p2_purchase_order_items
       WHERE po_id = $1
       ORDER BY created_at ASC, id ASC`,
      [linkedPoId]
    );
    const currentRevisionQuantity = currentPoItems.reduce(
      (sum, item) => sum + (Number(item.orderedQuantity) || 0),
      0
    );

    // Serialized items for this PO revision family, capped to the current revised PO quantity.
    const familySerials = await optionalTraceQuery<{
      id: string; serial_number: string; barcode: string; part_number: string;
      part_name: string; status: string; completed_at: string | null; finalized_at: string | null;
      current_department: string; sku: string | null; sequence_number: number;
      po_id: number; po_item_id: number; po_number: string;
    }>('serialized items lookup',
      `SELECT id, serial_number, barcode, part_number, part_name, status,
              completed_at, finalized_at, current_department, sku, sequence_number,
              po_id, po_item_id, po_number
       FROM p2_serialized_items
       WHERE po_id = ANY($1::int[])
       ORDER BY po_id, part_number, sequence_number`,
      [traceabilityPoIds]
    );
    const consumesTraceabilityCapacity = (serial: (typeof familySerials)[number]) => {
      if (serial.status === 'COMPLETED' || serial.status === 'SCRAPPED') return true;
      if (serial.status !== 'ACTIVE') return false;
      const dept = String(serial.current_department || '').trim();
      return dept !== '' && dept !== 'Pending Layup';
    };
    const sortSerials = (a: (typeof familySerials)[number], b: (typeof familySerials)[number]) =>
      Number(a.po_id) - Number(b.po_id) ||
      String(a.part_number || '').localeCompare(String(b.part_number || '')) ||
      (Number(a.sequence_number) || 0) - (Number(b.sequence_number) || 0) ||
      String(a.id).localeCompare(String(b.id));
    const consumedSerials = familySerials
      .filter(consumesTraceabilityCapacity)
      .sort(sortSerials);
    const consumedIds = new Set(consumedSerials.map((serial) => serial.id));
    const pendingCurrentRevisionSerials = familySerials
      .filter((serial) =>
        !consumedIds.has(serial.id) &&
        Number(serial.po_id) === linkedPoId &&
        serial.status === 'ACTIVE'
      )
      .sort(sortSerials);
    const currentCapacity = currentRevisionQuantity > 0
      ? currentRevisionQuantity
      : familySerials.length;
    const serials = [...consumedSerials, ...pendingCurrentRevisionSerials]
      .slice(0, currentCapacity)
      .sort(sortSerials);

    return res.json({
      hasShipment: !!lot,
      project,
      po,
      lot,
      packingSlip,
      packingSlips,
      certificate,
      invoice,
      serials,
    });
  } catch (err: any) {
    console.error('Error fetching project traceability:', err);
    res.status(500).json({ message: 'Failed to fetch traceability data' });
  }
});

// ── Project Documents (manual attachments) ────────────────────────────────

// GET /api/projects/:id/documents — list all manual attachments
router.get('/:id/documents', async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await pool.query<{
      id: number; project_id: string; label: string | null; original_file_name: string;
      file_name: string | null; mime_type: string; file_size: number | null;
      media_library_id: number | null; uploaded_by: string | null; created_at: string;
    }>(
      `SELECT id, project_id, label, original_file_name, file_name, mime_type, file_size,
              media_library_id, uploaded_by, created_at
       FROM project_documents WHERE project_id = $1 ORDER BY created_at DESC`,
      [id]
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to list project documents' });
  }
});

// POST /api/projects/:id/documents/upload — upload a file from the user's computer
router.post('/:id/documents/upload', uploadProjectDoc.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const { label, uploadedBy } = req.body;
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const rows = await pool.query<{ id: number }>(
      `INSERT INTO project_documents
         (project_id, label, original_file_name, file_name, file_path, mime_type, file_size, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [id, label || null, req.file.originalname, req.file.filename,
       req.file.path, req.file.mimetype, req.file.size, uploadedBy || null]
    );
    res.json({ id: rows[0].id, message: 'Document uploaded' });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to upload document' });
  }
});

// POST /api/projects/:id/documents/link — link a file from Central Storage
router.post('/:id/documents/link', async (req, res) => {
  try {
    const { id } = req.params;
    const { mediaLibraryId, label } = req.body;
    if (!mediaLibraryId) return res.status(400).json({ message: 'mediaLibraryId required' });

    const mediaRows = await pool.query<{
      filename: string; mime_type: string; file_size: number;
    }>(
      `SELECT filename, mime_type, file_size FROM media_library WHERE id = $1`,
      [mediaLibraryId]
    );
    if (!mediaRows[0]) return res.status(404).json({ message: 'Media item not found' });
    const media = mediaRows[0];

    const rows = await pool.query<{ id: number }>(
      `INSERT INTO project_documents
         (project_id, label, original_file_name, media_library_id, mime_type, file_size)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [id, label || null, media.filename, mediaLibraryId, media.mime_type, media.file_size]
    );
    res.json({ id: rows[0].id, message: 'Document linked' });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to link document' });
  }
});

// DELETE /api/projects/:id/documents/:docId — remove an attachment
router.delete('/:id/documents/:docId', async (req, res) => {
  try {
    const { id, docId } = req.params;
    const rows = await pool.query<{ file_path: string | null; media_library_id: number | null }>(
      `DELETE FROM project_documents WHERE id = $1 AND project_id = $2
       RETURNING file_path, media_library_id`,
      [docId, id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Document not found' });
    // Delete physical file if it was a direct upload
    if (rows[0].file_path && fs.existsSync(rows[0].file_path)) {
      fs.unlinkSync(rows[0].file_path);
    }
    res.json({ message: 'Document removed' });
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to remove document' });
  }
});

// GET /api/projects/:id/documents/:docId/file — serve the file (preview/download)
router.get('/:id/documents/:docId/file', async (req, res) => {
  try {
    const { id, docId } = req.params;
    const rows = await pool.query<{
      file_path: string | null; file_name: string | null; original_file_name: string;
      mime_type: string; media_library_id: number | null;
    }>(
      `SELECT file_path, file_name, original_file_name, mime_type, media_library_id
       FROM project_documents WHERE id = $1 AND project_id = $2`,
      [docId, id]
    );
    const doc = rows[0];
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    if (doc.media_library_id) {
      // Redirect to existing media serve endpoint
      return res.redirect(`/api/media/${doc.media_library_id}/download`);
    }

    if (!doc.file_path || !fs.existsSync(doc.file_path)) {
      return res.status(404).json({ message: 'File not found on disk' });
    }
    res.set('Content-Type', doc.mime_type || 'application/pdf');
    res.set('Content-Disposition', `inline; filename="${doc.original_file_name}"`);
    res.sendFile(path.resolve(doc.file_path));
  } catch (err: any) {
    res.status(500).json({ message: 'Failed to serve document' });
  }
});

export default router;
