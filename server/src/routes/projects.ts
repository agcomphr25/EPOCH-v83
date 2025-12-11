import { Router } from 'express';
import { storage } from '../../storage';
import { insertProjectSchema, insertProjectStepSchema, insertProjectActivityLogSchema, insertProjectNotificationSchema } from '../../schema';

const router = Router();

const PROJECT_STEP_TYPES = [
  { type: 'rfq_risk_assessment', order: 1, label: 'RFQ Risk Assessment', route: '/rfq-risk-assessment' },
  { type: 'quote', order: 2, label: 'Quote', route: '/p2-quote-form' },
  { type: 'purchase_review_checklist', order: 3, label: 'Purchase Review Checklist', route: '/purchase-review-checklist' },
  { type: 'preproduction_checklist', order: 4, label: 'Pre-production Checklist', route: '/preproduction-checklists' },
  { type: 'p2_order', order: 5, label: 'P2 Order', route: '/p2-control-center' },
];

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
        const steps = await storage.getProjectSteps(project.id);
        const customer = await storage.getCustomerById(project.customerId);
        const projectManager = project.projectManagerId 
          ? await storage.getEmployee(project.projectManagerId)
          : null;
        
        return {
          ...project,
          steps,
          customer,
          projectManager,
        };
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

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const project = await storage.getProject(id);
    
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    
    const steps = await storage.getProjectSteps(project.id);
    const customer = await storage.getCustomerById(project.customerId);
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
    const nextCode = await storage.getNextProjectCode();
    const projectData = {
      ...req.body,
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
    
    await storage.createProjectActivityLog({
      projectId: project.id,
      activityType: 'project_created',
      description: `Project ${project.projectCode} created`,
      performedBy: req.body.createdBy,
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
    const project = await storage.updateProject(id, req.body);
    
    if (req.body.projectManagerId) {
      await storage.createProjectActivityLog({
        projectId: id,
        activityType: 'project_updated',
        description: 'Project manager assigned',
        performedBy: req.body.updatedBy,
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
    const { status, linkedRfqId, linkedQuoteId, linkedPurchaseReviewId, linkedPreproductionChecklistId, linkedP2OrderId, notes } = req.body;
    
    const updateData: any = {};
    
    if (status) {
      updateData.status = status;
      if (status === 'in_progress' && !req.body.startedAt) {
        updateData.startedAt = new Date();
      }
      if (status === 'completed') {
        updateData.completedAt = new Date();
        updateData.completedBy = req.body.completedBy;
      }
    }
    
    if (linkedRfqId !== undefined) updateData.linkedRfqId = linkedRfqId;
    if (linkedQuoteId !== undefined) updateData.linkedQuoteId = linkedQuoteId;
    if (linkedPurchaseReviewId !== undefined) updateData.linkedPurchaseReviewId = linkedPurchaseReviewId;
    if (linkedPreproductionChecklistId !== undefined) updateData.linkedPreproductionChecklistId = linkedPreproductionChecklistId;
    if (linkedP2OrderId !== undefined) updateData.linkedP2OrderId = linkedP2OrderId;
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
      performedBy: req.body.completedBy || req.body.updatedBy,
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
        await storage.updateProject(projectId, { 
          currentStepType: nextStep.stepType as any,
        });
        
        await storage.createProjectActivityLog({
          projectId,
          activityType: 'step_started',
          stepType: nextStep.stepType,
          description: `${nextStepInfo?.label || nextStep.stepType} started`,
        });
      } else {
        await storage.updateProject(projectId, { 
          status: 'completed',
          actualShipDate: new Date().toISOString().split('T')[0],
        });
        
        await storage.createProjectActivityLog({
          projectId,
          activityType: 'project_completed',
          description: 'Project completed',
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

export default router;
