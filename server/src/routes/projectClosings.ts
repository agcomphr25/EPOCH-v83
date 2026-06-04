import { Router } from 'express';
import { z } from 'zod';
import { storage } from '../../storage';
import { requirePermission } from '../../middleware/requirePermission';
import { requireScopedCapability, ScopedForbiddenError } from '../permissions';
import { auditService } from '../services/auditService';

const router = Router({ mergeParams: true });

const createClosingSchema = z.object({
  summary: z.string().optional().nullable(),
  whatWentWrong: z.string().optional().nullable(),
  strengths: z.string().optional().nullable(),
  opportunities: z.string().optional().nullable(),
  similaritiesToPriorProjects: z.string().optional().nullable(),
  nextProjectRecommendations: z.string().optional().nullable(),
  closedBy: z.number().int().positive().optional().nullable(),
  closedByDisplayName: z.string().optional().nullable(),
});

const updateClosingSchema = createClosingSchema.partial();

const createRiskSchema = z.object({
  category: z.string().min(1, 'Category is required'),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string().min(1, 'Description is required'),
  department: z.string().optional().nullable(),
  owner: z.string().optional().nullable(),
});

const createActionSchema = z.object({
  actionText: z.string().min(1, 'Action text is required'),
  owner: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be in YYYY-MM-DD format').optional().nullable(),
  status: z.enum(['open', 'in_progress', 'completed', 'cancelled']).optional(),
});

// POST /api/projects/:projectId/closing — create a closing record
router.post('/', requirePermission('projects.close'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    await requireScopedCapability((req as any).user, 'projects.close', { projectId });

    const parsed = createClosingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid request data', errors: parsed.error.errors });
    }

    const closing = await storage.createProjectClosing({ ...parsed.data, projectId });

    const actor = (req as any).user;
    auditService.logEvent({
      entityType: 'p2_project',
      entityId: projectId,
      action: 'PROJECT_CLOSING_CREATED',
      actor: actor
        ? { id: actor.id, username: actor.username, role: actor.role }
        : parsed.data.closedBy
          ? { id: parsed.data.closedBy }
          : undefined,
      meta: {
        closingId: closing.id,
        projectId,
        closedByDisplayName: parsed.data.closedByDisplayName ?? undefined,
      },
    }).catch(err => console.warn('[Audit] PROJECT_CLOSING_CREATED log failed:', err?.message));

    res.status(201).json(closing);
  } catch (error: any) {
    if (error instanceof ScopedForbiddenError) return res.status(403).json(error.payload);
    if (
      error?.message?.includes('already exists') ||
      error?.code === '23505' ||
      error?.constraint?.includes('project_closings_project_id')
    ) {
      return res.status(409).json({ message: `A closing record already exists for project ${req.params.projectId}` });
    }
    console.error('Error creating project closing:', error);
    res.status(500).json({ message: 'Failed to create project closing' });
  }
});

// PATCH /api/projects/:projectId/closing/:id — update a closing record
router.patch('/:id', requirePermission('projects.close'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid closing id' });
    }

    await requireScopedCapability((req as any).user, 'projects.close', { projectId });

    const existing = await storage.getProjectClosingByProjectId(projectId);
    if (!existing || existing.id !== id) {
      return res.status(404).json({ message: 'Closing record not found for this project' });
    }

    const parsed = updateClosingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid request data', errors: parsed.error.errors });
    }

    const closing = await storage.updateProjectClosing(id, parsed.data);
    res.json(closing);
  } catch (error: any) {
    if (error instanceof ScopedForbiddenError) return res.status(403).json(error.payload);
    console.error('Error updating project closing:', error);
    res.status(500).json({ message: 'Failed to update project closing' });
  }
});

// GET /api/projects/:projectId/closing — get a project's closing record
router.get('/', async (req, res) => {
  try {
    const { projectId } = req.params;
    const closing = await storage.getProjectClosingByProjectId(projectId);
    if (!closing) {
      return res.json(null);
    }
    res.json(closing);
  } catch (error) {
    console.error('Error fetching project closing:', error);
    res.status(500).json({ message: 'Failed to fetch project closing' });
  }
});

// POST /api/projects/:projectId/closing/approve — approve a project closing record
router.post('/approve', requirePermission('projects.approve_closing'), async (req, res) => {
  try {
    const { projectId } = req.params;

    await requireScopedCapability((req as any).user, 'projects.approve_closing', { projectId });

    const parsed = z.object({
      approvedBy: z.number().int().positive({ message: 'approvedBy must be a positive employee id' }),
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid request data', errors: parsed.error.errors });
    }

    const resolvedApproverId: number = req.user?.employeeId ?? parsed.data.approvedBy;

    const closing = await storage.getProjectClosingByProjectId(projectId);
    if (!closing) {
      return res.status(404).json({ message: 'No closing record found for this project' });
    }

    const updated = await storage.updateProjectClosing(closing.id, {
      approvedBy: resolvedApproverId,
      approvedAt: new Date(),
    });

    const actor = (req as any).user;
    auditService.logEvent({
      entityType: 'p2_project',
      entityId: projectId,
      action: 'PROJECT_CLOSING_APPROVED',
      actor: actor
        ? { id: actor.id, username: actor.username, role: actor.role }
        : { id: resolvedApproverId },
      meta: {
        closingId: closing.id,
        projectId,
        approvedBy: resolvedApproverId,
      },
    }).catch(err => console.warn('[Audit] PROJECT_CLOSING_APPROVED log failed:', err?.message));

    res.json(updated);
  } catch (error: any) {
    if (error instanceof ScopedForbiddenError) return res.status(403).json(error.payload);
    console.error('Error approving project closing:', error);
    res.status(500).json({ message: 'Failed to approve project closing' });
  }
});

// POST /api/projects/:projectId/closing/risks — add a risk to the project closing
router.post('/risks', requirePermission('projects.close'), async (req, res) => {
  try {
    const { projectId } = req.params;

    const closing = await storage.getProjectClosingByProjectId(projectId);
    if (!closing) {
      return res.status(404).json({ message: 'No closing record found for this project. Create a closing record first.' });
    }

    const parsed = createRiskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid request data', errors: parsed.error.errors });
    }

    const risk = await storage.createProjectClosingRisk({
      ...parsed.data,
      projectId,
      closingId: closing.id,
    });
    res.status(201).json(risk);
  } catch (error: any) {
    console.error('Error creating project closing risk:', error);
    res.status(500).json({ message: 'Failed to create project closing risk' });
  }
});

// GET /api/projects/:projectId/closing/risks — list risks for a project
router.get('/risks', async (req, res) => {
  try {
    const { projectId } = req.params;
    const risks = await storage.getProjectClosingRisks(projectId);
    res.json(risks);
  } catch (error) {
    console.error('Error fetching project closing risks:', error);
    res.status(500).json({ message: 'Failed to fetch project closing risks' });
  }
});

// POST /api/projects/:projectId/closing/actions — add an action to the project closing
router.post('/actions', requirePermission('projects.close'), async (req, res) => {
  try {
    const { projectId } = req.params;

    const closing = await storage.getProjectClosingByProjectId(projectId);
    if (!closing) {
      return res.status(404).json({ message: 'No closing record found for this project. Create a closing record first.' });
    }

    const parsed = createActionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid request data', errors: parsed.error.errors });
    }

    const action = await storage.createProjectClosingAction({
      ...parsed.data,
      projectId,
      closingId: closing.id,
    });
    res.status(201).json(action);
  } catch (error: any) {
    console.error('Error creating project closing action:', error);
    res.status(500).json({ message: 'Failed to create project closing action' });
  }
});

// GET /api/projects/:projectId/closing/actions — list actions for a project
router.get('/actions', async (req, res) => {
  try {
    const { projectId } = req.params;
    const actions = await storage.getProjectClosingActions(projectId);
    res.json(actions);
  } catch (error) {
    console.error('Error fetching project closing actions:', error);
    res.status(500).json({ message: 'Failed to fetch project closing actions' });
  }
});

const updateRiskSchema = createRiskSchema.partial();
const updateActionSchema = createActionSchema.partial();

// PATCH /api/projects/:projectId/closing/risks/:riskId — update a risk
router.patch('/risks/:riskId', requirePermission('projects.close'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const riskId = parseInt(req.params.riskId, 10);
    if (isNaN(riskId)) {
      return res.status(400).json({ message: 'Invalid risk id' });
    }

    await requireScopedCapability((req as any).user, 'projects.close', { projectId });

    const risks = await storage.getProjectClosingRisks(projectId);
    const target = risks.find(r => r.id === riskId);
    if (!target) {
      return res.status(404).json({ message: 'Risk not found for this project' });
    }

    const parsed = updateRiskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid request data', errors: parsed.error.errors });
    }

    const risk = await storage.updateProjectClosingRisk(riskId, parsed.data);
    res.json(risk);
  } catch (error: any) {
    if (error instanceof ScopedForbiddenError) return res.status(403).json(error.payload);
    console.error('Error updating project closing risk:', error);
    res.status(500).json({ message: 'Failed to update risk' });
  }
});

// DELETE /api/projects/:projectId/closing/risks/:riskId — delete a risk
router.delete('/risks/:riskId', requirePermission('projects.close'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const riskId = parseInt(req.params.riskId, 10);
    if (isNaN(riskId)) {
      return res.status(400).json({ message: 'Invalid risk id' });
    }

    await requireScopedCapability((req as any).user, 'projects.close', { projectId });

    const risks = await storage.getProjectClosingRisks(projectId);
    const target = risks.find(r => r.id === riskId);
    if (!target) {
      return res.status(404).json({ message: 'Risk not found for this project' });
    }

    await storage.deleteProjectClosingRisk(riskId);
    res.status(204).end();
  } catch (error: any) {
    if (error instanceof ScopedForbiddenError) return res.status(403).json(error.payload);
    console.error('Error deleting project closing risk:', error);
    res.status(500).json({ message: 'Failed to delete risk' });
  }
});

// PATCH /api/projects/:projectId/closing/actions/:actionId — update an action
router.patch('/actions/:actionId', requirePermission('projects.close'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const actionId = parseInt(req.params.actionId, 10);
    if (isNaN(actionId)) {
      return res.status(400).json({ message: 'Invalid action id' });
    }

    await requireScopedCapability((req as any).user, 'projects.close', { projectId });

    const actions = await storage.getProjectClosingActions(projectId);
    const target = actions.find(a => a.id === actionId);
    if (!target) {
      return res.status(404).json({ message: 'Action not found for this project' });
    }

    const parsed = updateActionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid request data', errors: parsed.error.errors });
    }

    const action = await storage.updateProjectClosingAction(actionId, parsed.data);
    res.json(action);
  } catch (error: any) {
    if (error instanceof ScopedForbiddenError) return res.status(403).json(error.payload);
    console.error('Error updating project closing action:', error);
    res.status(500).json({ message: 'Failed to update action' });
  }
});

// DELETE /api/projects/:projectId/closing/actions/:actionId — delete an action
router.delete('/actions/:actionId', requirePermission('projects.close'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const actionId = parseInt(req.params.actionId, 10);
    if (isNaN(actionId)) {
      return res.status(400).json({ message: 'Invalid action id' });
    }

    await requireScopedCapability((req as any).user, 'projects.close', { projectId });

    const actions = await storage.getProjectClosingActions(projectId);
    const target = actions.find(a => a.id === actionId);
    if (!target) {
      return res.status(404).json({ message: 'Action not found for this project' });
    }

    await storage.deleteProjectClosingAction(actionId);
    res.status(204).end();
  } catch (error: any) {
    if (error instanceof ScopedForbiddenError) return res.status(403).json(error.payload);
    console.error('Error deleting project closing action:', error);
    res.status(500).json({ message: 'Failed to delete action' });
  }
});

export default router;
