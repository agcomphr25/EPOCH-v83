import { Router } from 'express';
import { z } from 'zod';
import { storage } from '../../storage';
import { insertRoutingTemplateSchema, updateRoutingTemplateSchema, insertRoutingTemplateOperationSchema } from '../../schema';

const router = Router();

// GET /api/routing-templates
router.get('/', async (req, res) => {
  try {
    const { routingType, isActive } = req.query;
    const filters: { routingType?: string; isActive?: boolean } = {};
    if (routingType && typeof routingType === 'string') filters.routingType = routingType;
    if (isActive !== undefined) filters.isActive = isActive === 'true';
    const templates = await storage.getRoutingTemplates(filters);
    res.json(templates);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/routing-templates/:id
router.get('/:id', async (req, res) => {
  try {
    const template = await storage.getRoutingTemplate(req.params.id);
    if (!template) return res.status(404).json({ error: 'Routing template not found' });
    res.json(template);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/routing-templates
router.post('/', async (req, res) => {
  try {
    const parsed = insertRoutingTemplateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    const template = await storage.createRoutingTemplate(parsed.data);
    res.status(201).json(template);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/routing-templates/:id
router.put('/:id', async (req, res) => {
  try {
    const parsed = updateRoutingTemplateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    const existing = await storage.getRoutingTemplate(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Routing template not found' });
    const template = await storage.updateRoutingTemplate(req.params.id, parsed.data);
    res.json(template);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/routing-templates/:id
router.delete('/:id', async (req, res) => {
  try {
    const existing = await storage.getRoutingTemplate(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Routing template not found' });
    await storage.deleteRoutingTemplate(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/routing-templates/:id/operations
router.get('/:id/operations', async (req, res) => {
  try {
    const existing = await storage.getRoutingTemplate(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Routing template not found' });
    const ops = await storage.getRoutingTemplateOperations(req.params.id);
    res.json(ops);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/routing-templates/:id/operations/replace
router.put('/:id/operations/replace', async (req, res) => {
  try {
    const existing = await storage.getRoutingTemplate(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Routing template not found' });
    const opSchema = insertRoutingTemplateOperationSchema.omit({ routingTemplateId: true });
    const arraySchema = z.array(opSchema);
    const parsed = arraySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    const ops = await storage.replaceRoutingTemplateOperations(req.params.id, parsed.data);
    res.json(ops);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/routing-templates/:id/create-routing
router.post('/:id/create-routing', async (req, res) => {
  try {
    const existing = await storage.getRoutingTemplate(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Routing template not found' });

    const schema = z.object({
      inventoryItemId: z.string().min(1),
      partNumber: z.string().min(1),
      partName: z.string().min(1),
      routingName: z.string().optional(),
      routingRevision: z.number().int().positive().optional(),
      createdBy: z.string().min(1),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });

    const result = await storage.createPartRoutingFromTemplate(req.params.id, parsed.data);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
