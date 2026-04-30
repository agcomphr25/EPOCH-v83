import { Router } from 'express';
import { z } from 'zod';
import { storage } from '../../storage';
import { db, pool } from '../../db';
import { insertProjectSchema, insertProjectStepSchema, insertProjectActivityLogSchema, insertProjectNotificationSchema } from '../../schema';
import { createEmployeeIdentitySnapshot } from '../../identity/userIdentity';
import { validateProjectClosing, deriveClosingStatus } from '../lib/projectClosingValidation';
import { ensureProjectHasWAD } from '../lib/wadHelper';
import { resolveCustomersIntegerId } from '../lib/customerResolver';
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
});

const VALID_PIPELINE_STAGES = [
  'rfq_received', 'quote_preparing', 'quote_submitted', 'purchase_review',
  'po_received', 'production', 'completed',
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
  p2_order: 'production',
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
  'production',
  'completed',
] as const;

// Maps max completed step_order → max allowed stage index in PIPELINE_STAGE_ORDER
// Step orders: 1=rfq_risk_assessment, 2=quote, 3=purchase_review_checklist,
//              4=preproduction_checklist, 5=p2_order
function computeMaxAllowedStageKey(maxCompletedOrder: number): string {
  if (maxCompletedOrder >= 5) return 'completed';
  if (maxCompletedOrder >= 4) return 'production';
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
  production: 'Pre-production Checklist',
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
        `SELECT po_id::text,
                COUNT(*)::text AS total,
                COUNT(*) FILTER (WHERE status = 'COMPLETED')::text AS completed
         FROM p2_serialized_items
         WHERE po_id = ANY($1::int[])
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

router.post('/:id/link-po', async (req, res) => {
  try {
    const { id } = req.params;
    const schema = z.object({ poId: z.number().int().positive() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid request: poId (number) required' });
    }
    const { poId } = parsed.data;

    const project = await storage.getProject(id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    if (project.poId) {
      return res.status(409).json({ message: 'Project already has a PO linked' });
    }

    // Validate PO exists
    const poRows = await pool.query<{ id: number; po_number: string }>(
      `SELECT id, po_number FROM p2_purchase_orders WHERE id = $1`,
      [poId]
    );
    if (poRows.length === 0) return res.status(404).json({ message: 'PO not found' });

    // Ensure no other project already uses this poId
    const conflictRows = await pool.query<{ id: string }>(
      `SELECT id FROM projects WHERE po_id = $1 LIMIT 1`,
      [poId]
    );
    if (conflictRows.length > 0) {
      return res.status(409).json({ message: 'Another project is already linked to this PO' });
    }

    const updated = await storage.updateProject(id, { poId } as any);

    await storage.createProjectActivityLog({
      projectId: id,
      activityType: 'project_updated',
      description: `Linked to PO ${poRows[0].po_number}`,
    });

    res.json(updated);
  } catch (error) {
    console.error('Error linking PO to project:', error);
    res.status(500).json({ message: 'Failed to link PO' });
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
    const nextCode = await storage.getNextProjectCode();

    // Resolve the integer FK to the master customers table from the text customerId.
    const customersIntegerId = await resolveCustomersIntegerId(validatedData.customerId);

    const projectData = {
      ...validatedData,
      projectCode: nextCode,
      customersIntegerId,
    };
    
    const project = await storage.createProject(projectData);
    
    for (const stepType of PROJECT_STEP_TYPES) {
      await storage.createProjectStep({
        projectId: project.id,
        stepType: stepType.type as any,
        stepOrder: stepType.order,
        status: stepType.order === 1 ? 'in_progress' : 'pending',
        startedAt: stepType.order === 1 ? new Date() : null,
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
        const finalUpdate: any = {
          currentStage: isFinalP2Order ? 'production' : 'completed',
          stageUpdatedAt: new Date(),
          status: isFinalP2Order ? 'won' : 'completed',
        };
        if (!isFinalP2Order) {
          finalUpdate.actualShipDate = new Date().toISOString().split('T')[0];
        }
        if (isFinalP2Order && updateData.linkedP2OrderId) {
          finalUpdate.poId = updateData.linkedP2OrderId;
        }
        await storage.updateProject(projectId, finalUpdate);
        
        await storage.createProjectActivityLog({
          projectId,
          activityType: isFinalP2Order ? 'step_completed' : 'project_completed',
          stepType: isFinalP2Order ? 'p2_order' : undefined,
          description: isFinalP2Order ? 'P2 Order completed — project won' : 'Project completed',
        });
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

    // Lot — most recent for this PO
    const lots = await pool.query<{
      id: string; lot_number: string; status: string; shipped_at: string | null;
      created_at: string; quantity: number; po_number: string;
    }>(
      `SELECT id, lot_number, status, shipped_at, created_at, quantity, po_number
       FROM p2_lot_numbers
       WHERE po_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [project.poId]
    );
    const lot = lots[0] ?? null;

    let packingSlip: any = null;
    let packingSlips: any[] = [];
    let certificate: any = null;
    let invoice: any = null;

    if (lot) {
      // Packing slip — most recent for Shipment Summary
      const slips = await pool.query<{
        id: string; packing_slip_number: string; status: string;
        ship_date: string | null; carrier: string | null; tracking_number: string | null;
        total_quantity: number; created_at: string;
      }>(
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
      const cocs = await pool.query<{
        id: string; certificate_number: string; status: string;
        approved_at: string | null; issued_at: string | null; created_at: string;
      }>(
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
      const invoices = await pool.query<{
        id: string; invoice_number: string; status: string;
        total_amount: string; invoice_date: string; created_at: string;
      }>(
        `SELECT id, invoice_number, status, total_amount, invoice_date, created_at
         FROM ar_invoices ${invoiceWhere}
         ORDER BY created_at DESC
         LIMIT 1`,
        invoiceParams
      );
      invoice = invoices[0] ?? null;
    }

    // All packing slips across all lots for this PO (for Documents section)
    const allSlipsResult = await pool.query<{
      id: string; packing_slip_number: string; status: string;
      ship_date: string | null; carrier: string | null; tracking_number: string | null;
      total_quantity: number; created_at: string; external_pdf_url: string | null;
    }>(
      `SELECT ps.id, ps.packing_slip_number, ps.status, ps.ship_date, ps.carrier,
              ps.tracking_number, ps.total_quantity, ps.created_at, ps.external_pdf_url
       FROM p2_packing_slips ps
       JOIN p2_lot_numbers ln ON ln.id = ps.lot_number_id
       WHERE ln.po_id = $1
       ORDER BY ps.created_at ASC`,
      [project.poId]
    );
    packingSlips = allSlipsResult;

    // Serialized items for this PO
    const serials = await pool.query<{
      id: string; serial_number: string; barcode: string; part_number: string;
      part_name: string; status: string; completed_at: string | null; finalized_at: string | null;
      current_department: string; sku: string | null; sequence_number: number;
    }>(
      `SELECT id, serial_number, barcode, part_number, part_name, status,
              completed_at, finalized_at, current_department, sku, sequence_number
       FROM p2_serialized_items
       WHERE po_id = $1
       ORDER BY part_number, sequence_number`,
      [project.poId]
    );

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
