import { Router } from 'express';
import { z } from 'zod';
import { storage } from '../../storage';

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
router.post('/', async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const parsed = createClosingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid request data', errors: parsed.error.errors });
    }

    const closing = await storage.createProjectClosing({ ...parsed.data, projectId });
    res.status(201).json(closing);
  } catch (error: any) {
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
router.patch('/:id', async (req, res) => {
  try {
    const { projectId } = req.params;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid closing id' });
    }

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
  } catch (error) {
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
      return res.status(404).json({ message: 'No closing record found for this project' });
    }
    res.json(closing);
  } catch (error) {
    console.error('Error fetching project closing:', error);
    res.status(500).json({ message: 'Failed to fetch project closing' });
  }
});

// POST /api/projects/:projectId/closing/risks — add a risk to the project closing
router.post('/risks', async (req, res) => {
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
router.post('/actions', async (req, res) => {
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

export default router;
