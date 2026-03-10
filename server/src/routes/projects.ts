import { Router } from 'express';
import { z } from 'zod';
import { storage } from '../../storage';
import { insertProjectSchema, insertProjectStepSchema, insertProjectActivityLogSchema, insertProjectNotificationSchema } from '../../schema';
import { createEmployeeIdentitySnapshot } from '../../identity/userIdentity';

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

const updateProjectRequestSchema = z.object({
  projectName: z.string().optional(),
  description: z.string().optional().nullable(),
  targetShipDate: z.string().optional().nullable(),
  projectManagerId: z.number().optional().nullable(),
  reminderDays: z.number().min(1).optional(),
  status: z.enum(['active', 'on_hold', 'completed', 'cancelled', 'inactive', 'won', 'lost']).optional(),
  currentStage: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  updatedBy: z.number().optional(),
});

const STEP_TO_STAGE_MAP: Record<string, string> = {
  rfq_risk_assessment: 'rfq_received',
  quote: 'quote_submitted',
  purchase_review_checklist: 'purchase_review',
  preproduction_checklist: 'po_received',
  p2_order: 'production',
};

const updateStepRequestSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'blocked']).optional(),
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
          const steps = await storage.getProjectSteps(project.id);
          const customer = project.customerId
            ? await storage.getP2CustomerByCustomerId(project.customerId)
            : null;
          const projectManager = project.projectManagerId 
            ? await storage.getEmployee(project.projectManagerId)
            : null;
          const attachments = await storage.getProjectStepAttachmentsByProject(project.id);
          
          return {
            ...project,
            steps,
            customer: customer || null,
            projectManager,
            attachmentCount: attachments.length,
          };
        } catch (enrichErr) {
          console.error(`Error enriching project ${project.id}:`, enrichErr);
          return {
            ...project,
            steps: [],
            customer: null,
            projectManager: null,
            attachmentCount: 0,
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

router.get('/pipeline', async (req, res) => {
  try {
    const allProjects = await storage.getAllProjects();
    const pipelineProjects = allProjects.filter(
      p => p.status === 'active' || p.status === 'won'
    );

    const results = await Promise.all(
      pipelineProjects.map(async (project) => {
        const customer = project.customerId
          ? await storage.getP2CustomerByCustomerId(project.customerId)
          : null;
        return {
          projectId: project.id,
          projectCode: project.projectCode,
          projectName: project.projectName,
          customerName: customer?.customerName || 'Unknown',
          currentStage: project.currentStage || 'rfq_received',
          status: project.status,
          targetShipDate: project.targetShipDate,
          stageUpdatedAt: project.stageUpdatedAt,
          poId: project.poId,
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

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const project = await storage.getProject(id);
    
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    const steps = await storage.getProjectSteps(project.id);
    const customer = await storage.getP2CustomerByCustomerId(project.customerId);
    const projectManager = project.projectManagerId 
      ? await storage.getEmployee(project.projectManagerId)
      : null;
    const activityLog = await storage.getProjectActivityLog(project.id);
    
    res.json({
      ...project,
      steps,
      customer,
      projectManager,
      activityLog,
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
    const projectData = {
      ...validatedData,
      projectCode: nextCode,
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
    
    const validationResult = updateProjectRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        message: 'Invalid request data', 
        errors: validationResult.error.errors 
      });
    }
    
    const validatedData = validationResult.data;
    const project = await storage.updateProject(id, validatedData);
    
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
    
    if (status === 'completed' || linkedRfqId !== undefined || linkedQuoteId !== undefined || 
        linkedPurchaseReviewId !== undefined || linkedPreproductionChecklistId !== undefined || 
        linkedP2OrderId !== undefined) {
      if (currentStep.status !== 'in_progress') {
        return res.status(400).json({ 
          message: 'Cannot modify a step that is not in progress. Complete previous steps first.' 
        });
      }
      
      const previousSteps = allSteps.filter(s => s.stepOrder < currentStep.stepOrder);
      const allPreviousCompleted = previousSteps.every(s => s.status === 'completed');
      
      if (!allPreviousCompleted) {
        return res.status(400).json({ 
          message: 'Cannot complete or link this step. All previous steps must be completed first.' 
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
        await storage.updateProjectStep(nextStep.id, { 
          status: 'in_progress',
          startedAt: new Date(),
        });
        
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

export default router;
