/**
 * Fillable PDF Templates API Routes
 * 
 * Admin routes for managing fillable PDF templates and instances.
 * Customer routes for fill-and-sign workflow.
 */

import express, { Request, Response } from 'express';
import multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import {
  createTemplate,
  updateTemplate,
  getAllTemplates,
  getInstancesForTemplate,
  createFillableInstance,
  getInstanceByPublicId,
  submitFilledForm,
  markInstanceViewed,
  deactivateTemplate,
} from '../../services/templatePdfService';
import { FillableFieldDef } from '../../schema';
import { getCurrentEnvironment } from '../../utils/magicLink';

const router = express.Router();

// Configure multer for PDF uploads
const TEMPLATES_DIR = path.join(process.cwd(), 'uploads', 'pdf-templates');
if (!fs.existsSync(TEMPLATES_DIR)) {
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, TEMPLATES_DIR);
  },
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `template-${timestamp}-${safeName}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new Error('Only PDF files are allowed'));
      return;
    }
    cb(null, true);
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
});

// Validation schemas
const fieldDefSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'number', 'date', 'email', 'phone', 'textarea', 'checkbox', 'select']),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  defaultValue: z.string().optional(),
  options: z.array(z.string()).optional(),
  pdfFieldName: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  page: z.number().optional(),
  fontSize: z.number().optional(),
  maxLength: z.number().optional(),
});

const createTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  fieldDefsJson: z.array(fieldDefSchema),
  requiresSignature: z.boolean().optional(),
  signaturePlacement: z.object({
    x: z.number(),
    y: z.number(),
    page: z.number(),
    width: z.number(),
    height: z.number(),
  }).optional(),
});

const createInstanceSchema = z.object({
  templateId: z.string().uuid(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  recipientEmail: z.string().email().optional(),
  recipientName: z.string().optional(),
});

const submitFormSchema = z.object({
  valuesJson: z.record(z.any()),
  signatureDataUrl: z.string().optional(),
});

// ============================================================================
// ADMIN ROUTES - Template Management
// ============================================================================

/**
 * GET /api/pdf-templates
 * List all templates (admin)
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const templates = await getAllTemplates();
    res.json(templates);
  } catch (error) {
    console.error('[API] Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

/**
 * GET /api/pdf-templates/:id
 * Get single template by ID (admin)
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Skip if id looks like a route segment
    if (id === 'instances') {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const { db } = await import('../../db');
    const { fillablePdfTemplates } = await import('../../schema');
    const { eq } = await import('drizzle-orm');
    
    const [template] = await db
      .select()
      .from(fillablePdfTemplates)
      .where(eq(fillablePdfTemplates.id, id))
      .limit(1);
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    res.json(template);
  } catch (error) {
    console.error('[API] Error fetching template:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

/**
 * POST /api/pdf-templates
 * Upload PDF and create template (admin)
 */
router.post('/', upload.single('templatePdf'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    // Parse and validate body
    let templateData;
    try {
      const bodyData = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body;
      templateData = createTemplateSchema.parse(bodyData);
    } catch (e) {
      // Delete uploaded file on validation error
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ 
        error: 'Invalid template data',
        details: e instanceof z.ZodError ? e.errors : String(e)
      });
    }

    const templatePdfPath = path.relative(process.cwd(), req.file.path);
    
    const template = await createTemplate({
      name: templateData.name,
      description: templateData.description,
      templatePdfPath,
      fieldDefsJson: templateData.fieldDefsJson as FillableFieldDef[],
      requiresSignature: templateData.requiresSignature,
      signaturePlacement: templateData.signaturePlacement,
    });

    console.log(`[API] Created template: ${template.id} - ${template.name}`);
    res.status(201).json(template);
  } catch (error) {
    console.error('[API] Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

/**
 * PATCH /api/pdf-templates/:id
 * Update template metadata/field defs (admin)
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const updateData: any = {};
    if (req.body.name) updateData.name = req.body.name;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.fieldDefsJson) updateData.fieldDefsJson = req.body.fieldDefsJson;
    if (req.body.requiresSignature !== undefined) updateData.requiresSignature = req.body.requiresSignature;
    if (req.body.signaturePlacement) updateData.signaturePlacement = req.body.signaturePlacement;
    if (req.body.isActive !== undefined) updateData.isActive = req.body.isActive;

    const template = await updateTemplate(id, updateData);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(template);
  } catch (error) {
    console.error('[API] Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

/**
 * DELETE /api/pdf-templates/:id
 * Deactivate template (soft delete)
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await deactivateTemplate(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('[API] Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

/**
 * GET /api/pdf-templates/:id/instances
 * List all instances for a template (admin)
 */
router.get('/:id/instances', async (req: Request, res: Response) => {
  try {
    const instances = await getInstancesForTemplate(req.params.id);
    res.json(instances);
  } catch (error) {
    console.error('[API] Error fetching instances:', error);
    res.status(500).json({ error: 'Failed to fetch instances' });
  }
});

// ============================================================================
// INSTANCE ROUTES - Create and manage fill-and-sign instances
// ============================================================================

/**
 * POST /api/pdf-template-instances
 * Create a new fill-and-sign instance (admin)
 */
router.post('/instances', async (req: Request, res: Response) => {
  try {
    const data = createInstanceSchema.parse(req.body);
    
    const result = await createFillableInstance({
      templateId: data.templateId,
      entityType: data.entityType,
      entityId: data.entityId,
      recipientEmail: data.recipientEmail,
      recipientName: data.recipientName,
    });

    if (!result) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.status(201).json({
      instance: result.instance,
      publicUrl: result.publicUrl,
    });
  } catch (error) {
    console.error('[API] Error creating instance:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create instance' });
  }
});

/**
 * GET /api/pdf-templates/instances/:publicSignatureId
 * Get instance for customer fill-and-sign (public route)
 */
router.get('/instances/:publicSignatureId', async (req: Request, res: Response) => {
  try {
    const { publicSignatureId } = req.params;
    
    const data = await getInstanceByPublicId(publicSignatureId);
    if (!data) {
      return res.status(404).json({ error: 'Form not found' });
    }

    const { instance, template } = data;

    // SIGNATURE LINK CONTRACT: Environment guard
    const currentEnv = getCurrentEnvironment();
    if (instance.environment && instance.environment !== currentEnv) {
      console.log(`[FILLABLE-PDF] Environment mismatch: instance=${instance.environment}, current=${currentEnv}`);
      return res.status(403).json({ error: 'This link is not valid in this environment' });
    }

    // Mark as viewed if first access
    if (instance.status === 'sent' || instance.status === 'draft') {
      await markInstanceViewed(publicSignatureId);
    }

    // Return template metadata and field defs (not the PDF itself)
    res.json({
      instanceId: instance.id,
      templateName: template.name,
      templateDescription: template.description,
      fieldDefs: template.fieldDefsJson,
      requiresSignature: template.requiresSignature,
      existingValues: instance.valuesJson,
      status: instance.status,
      recipientName: instance.recipientName,
      recipientEmail: instance.recipientEmail,
    });
  } catch (error) {
    console.error('[API] Error fetching instance:', error);
    res.status(500).json({ error: 'Failed to fetch form' });
  }
});

/**
 * POST /api/pdf-templates/instances/:publicSignatureId/submit
 * Submit filled form values + signature (public route)
 */
router.post('/instances/:publicSignatureId/submit', async (req: Request, res: Response) => {
  try {
    const { publicSignatureId } = req.params;
    
    // SIGNATURE LINK CONTRACT: Environment guard
    const instanceData = await getInstanceByPublicId(publicSignatureId);
    if (!instanceData) {
      return res.status(404).json({ error: 'Form not found' });
    }
    
    const currentEnv = getCurrentEnvironment();
    if (instanceData.instance.environment && instanceData.instance.environment !== currentEnv) {
      console.log(`[FILLABLE-PDF] Submit environment mismatch: instance=${instanceData.instance.environment}, current=${currentEnv}`);
      return res.status(403).json({ error: 'This link is not valid in this environment' });
    }
    
    const data = submitFormSchema.parse(req.body);
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    
    const result = await submitFilledForm(
      publicSignatureId,
      data.valuesJson,
      data.signatureDataUrl,
      clientIp
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      signedPdfPath: result.signedPdfPath,
    });
  } catch (error) {
    console.error('[API] Error submitting form:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to submit form' });
  }
});

/**
 * GET /api/pdf-templates/instances/:publicSignatureId/signed-pdf
 * Download the signed PDF (public route, only after signing)
 */
router.get('/instances/:publicSignatureId/signed-pdf', async (req: Request, res: Response) => {
  try {
    const { publicSignatureId } = req.params;
    
    const data = await getInstanceByPublicId(publicSignatureId);
    if (!data) {
      return res.status(404).json({ error: 'Form not found' });
    }

    const { instance } = data;

    // SIGNATURE LINK CONTRACT: Environment guard
    const currentEnv = getCurrentEnvironment();
    if (instance.environment && instance.environment !== currentEnv) {
      console.log(`[FILLABLE-PDF] PDF download environment mismatch: instance=${instance.environment}, current=${currentEnv}`);
      return res.status(403).json({ error: 'This link is not valid in this environment' });
    }

    if (instance.status !== 'signed' || !instance.signedPdfPath) {
      return res.status(400).json({ error: 'Form has not been signed yet' });
    }

    const pdfPath = path.join(process.cwd(), instance.signedPdfPath);
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({ error: 'Signed PDF not found' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="signed-form-${publicSignatureId}.pdf"`);
    res.sendFile(pdfPath);
  } catch (error) {
    console.error('[API] Error downloading signed PDF:', error);
    res.status(500).json({ error: 'Failed to download PDF' });
  }
});

export default router;
