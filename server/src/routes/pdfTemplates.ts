import { Router, Request, Response } from 'express';
import { insertPdfTemplateSchema } from '@shared/schema';
import { z } from 'zod';
import { storage } from '../../storage';

const router = Router();

// GET /api/pdf-templates - List all PDF templates
router.get('/', async (req: Request, res: Response) => {
  try {
    const templates = await storage.getAllPdfTemplates();
    res.json(templates);
  } catch (error) {
    console.error('Get PDF templates error:', error);
    res.status(500).json({ error: 'Failed to retrieve PDF templates' });
  }
});

// GET /api/pdf-templates/type/:type - Get templates by type
router.get('/type/:type', async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    const templates = await storage.getPdfTemplatesByType(type);
    res.json(templates);
  } catch (error) {
    console.error('Get PDF templates by type error:', error);
    res.status(500).json({ error: 'Failed to retrieve PDF templates' });
  }
});

// GET /api/pdf-templates/active/:type - Get active template for a type
router.get('/active/:type', async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    const template = await storage.getActivePdfTemplateByType(type);
    
    if (!template) {
      return res.status(404).json({ error: 'No active template found for this type' });
    }
    
    res.json(template);
  } catch (error) {
    console.error('Get active PDF template error:', error);
    res.status(500).json({ error: 'Failed to retrieve active PDF template' });
  }
});

// GET /api/pdf-templates/:id - Get a single PDF template
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const template = await storage.getPdfTemplate(id);
    
    if (!template) {
      return res.status(404).json({ error: 'PDF template not found' });
    }
    
    res.json(template);
  } catch (error) {
    console.error('Get PDF template error:', error);
    res.status(500).json({ error: 'Failed to retrieve PDF template' });
  }
});

// POST /api/pdf-templates - Create a new PDF template
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = insertPdfTemplateSchema.parse(req.body);
    const template = await storage.createPdfTemplate(data);
    res.status(201).json(template);
  } catch (error) {
    console.error('Create PDF template error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid PDF template data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create PDF template' });
  }
});

// PUT /api/pdf-templates/:id - Update a PDF template
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = insertPdfTemplateSchema.partial().parse(req.body);
    const template = await storage.updatePdfTemplate(id, data);
    
    if (!template) {
      return res.status(404).json({ error: 'PDF template not found' });
    }
    
    res.json(template);
  } catch (error) {
    console.error('Update PDF template error:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid PDF template data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update PDF template' });
  }
});

// DELETE /api/pdf-templates/:id - Delete a PDF template
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await storage.deletePdfTemplate(id);
    res.status(204).send();
  } catch (error) {
    console.error('Delete PDF template error:', error);
    res.status(500).json({ error: 'Failed to delete PDF template' });
  }
});

export default router;
