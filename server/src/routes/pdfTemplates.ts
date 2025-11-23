import express from 'express';
import { db } from '../../db';
import { pdfTemplates, insertPdfTemplateSchema } from '../../schema';
import { eq, desc, and } from 'drizzle-orm';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';

const router = express.Router();

// Helper to resolve attached assets path
const getAttachedAssetsPath = (relativePath: string = ''): string => {
  return path.join(process.cwd(), 'attached_assets', relativePath);
};

// Serve uploaded logo files (with path traversal protection)
router.get('/api/assets/pdf_logos/:filename', async (req, res) => {
  try {
    const requestedFilename = req.params.filename;
    
    // Sanitize filename to prevent path traversal attacks
    const safeFilename = path.basename(requestedFilename); // Removes any directory parts
    
    // Additional validation: only allow alphanumeric, dashes, underscores, and common image extensions
    if (!/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|svg)$/i.test(safeFilename)) {
      return res.status(400).json({ error: 'Invalid filename format' });
    }
    
    const filePath = getAttachedAssetsPath(`pdf_logos/${safeFilename}`);
    
    // Verify the resolved path is still within the pdf_logos directory (extra safety check)
    const logoDir = getAttachedAssetsPath('pdf_logos');
    if (!filePath.startsWith(logoDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'Logo file not found' });
    }

    // Send file with proper content type
    res.sendFile(filePath);
  } catch (error) {
    console.error('Serve logo error:', error);
    res.status(500).json({ 
      error: 'Failed to serve logo file',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Configure multer for logo uploads
const logoStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = getAttachedAssetsPath('pdf_logos');
    try {
      await fs.mkdir(uploadDir, { recursive: true});
      cb(null, uploadDir);
    } catch (error) {
      cb(error as Error, uploadDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `logo-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PNG, JPG, JPEG, and SVG files are allowed.'));
    }
  }
});

// Get all PDF templates
router.get('/api/pdf-templates', async (req, res) => {
  try {
    const templates = await db
      .select()
      .from(pdfTemplates)
      .orderBy(desc(pdfTemplates.createdAt));

    res.json(templates);
  } catch (error) {
    console.error('Get PDF templates error:', error);
    res.status(500).json({
      error: 'Failed to get PDF templates',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get PDF template by ID
router.get('/api/pdf-templates/:id', async (req, res) => {
  try {
    const [template] = await db
      .select()
      .from(pdfTemplates)
      .where(eq(pdfTemplates.id, req.params.id));

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(template);
  } catch (error) {
    console.error('Get PDF template error:', error);
    res.status(500).json({
      error: 'Failed to get PDF template',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get active template by type
router.get('/api/pdf-templates/by-type/:type', async (req, res) => {
  try {
    const [template] = await db
      .select()
      .from(pdfTemplates)
      .where(and(
        eq(pdfTemplates.templateType, req.params.type),
        eq(pdfTemplates.isActive, true)
      ))
      .orderBy(desc(pdfTemplates.updatedAt))
      .limit(1);

    if (!template) {
      return res.status(404).json({ error: 'No active template found for this type' });
    }

    res.json(template);
  } catch (error) {
    console.error('Get PDF template by type error:', error);
    res.status(500).json({
      error: 'Failed to get PDF template',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Create new PDF template
router.post('/api/pdf-templates', async (req, res) => {
  try {
    // Strip server-managed fields
    const { id, createdAt, updatedAt, ...clientData } = req.body;

    // Validate
    const validatedData = insertPdfTemplateSchema.parse(clientData);

    // Set created/updated by
    const username = req.user?.username || 'system';

    // If creating an active template, deactivate other templates of the same type
    if (validatedData.isActive && validatedData.templateType) {
      await db
        .update(pdfTemplates)
        .set({ isActive: false })
        .where(and(
          eq(pdfTemplates.templateType, validatedData.templateType),
          eq(pdfTemplates.isActive, true)
        ));
    }

    // Insert
    const [newTemplate] = await db.insert(pdfTemplates).values({
      ...validatedData,
      createdBy: username,
      updatedBy: username,
    }).returning();

    res.status(201).json(newTemplate);
  } catch (error) {
    console.error('Create PDF template error:', error);
    res.status(500).json({
      error: 'Failed to create PDF template',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Update PDF template
router.patch('/api/pdf-templates/:id', async (req, res) => {
  try {
    // Strip server-managed fields
    const { id: _id, createdAt, createdBy, updatedAt, updatedBy: _updatedBy, ...clientData } = req.body;

    // Validate using partial schema for PATCH
    const validatedData = insertPdfTemplateSchema.partial().parse(clientData);

    const username = req.user?.username || 'system';

    // Get current template to check for templateType changes
    const [currentTemplate] = await db
      .select()
      .from(pdfTemplates)
      .where(eq(pdfTemplates.id, req.params.id));

    if (!currentTemplate) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Prevent changing templateType on an active template (data integrity protection)
    if (validatedData.templateType && 
        validatedData.templateType !== currentTemplate.templateType && 
        currentTemplate.isActive) {
      return res.status(400).json({ 
        error: 'Cannot change template type on an active template. Deactivate it first.' 
      });
    }

    // Determine effective templateType (use new if provided, otherwise keep current)
    const effectiveTemplateType = validatedData.templateType || currentTemplate.templateType;

    // If setting this template to active, deactivate other templates of the same type
    if (validatedData.isActive && effectiveTemplateType) {
      await db
        .update(pdfTemplates)
        .set({ isActive: false })
        .where(and(
          eq(pdfTemplates.templateType, effectiveTemplateType),
          eq(pdfTemplates.isActive, true)
        ));
    }

    const [updated] = await db
      .update(pdfTemplates)
      .set({
        ...validatedData,
        updatedBy: username,
        updatedAt: new Date(),
      })
      .where(eq(pdfTemplates.id, req.params.id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error('Update PDF template error:', error);
    res.status(500).json({
      error: 'Failed to update PDF template',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Delete PDF template
router.delete('/api/pdf-templates/:id', async (req, res) => {
  try {
    // Get template first to delete logo file
    const [template] = await db
      .select()
      .from(pdfTemplates)
      .where(eq(pdfTemplates.id, req.params.id));

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Delete logo file if exists
    if (template.logoPath) {
      try {
        const logoFullPath = getAttachedAssetsPath(template.logoPath);
        await fs.unlink(logoFullPath);
      } catch (err) {
        console.warn('Failed to delete logo file:', err);
        // Continue with template deletion even if file deletion fails
      }
    }

    // Delete template
    await db.delete(pdfTemplates).where(eq(pdfTemplates.id, req.params.id));

    res.json({ success: true, message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Delete PDF template error:', error);
    res.status(500).json({
      error: 'Failed to delete PDF template',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Upload logo for template
router.post('/api/pdf-templates/:id/logo', upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get existing template to delete old logo
    const [template] = await db
      .select()
      .from(pdfTemplates)
      .where(eq(pdfTemplates.id, req.params.id));

    if (!template) {
      // Clean up uploaded file
      await fs.unlink(req.file.path);
      return res.status(404).json({ error: 'Template not found' });
    }

    // Delete old logo if exists
    if (template.logoPath) {
      try {
        const oldLogoPath = getAttachedAssetsPath(template.logoPath);
        await fs.unlink(oldLogoPath);
      } catch (err) {
        console.warn('Failed to delete old logo:', err);
      }
    }

    // Store relative path from attached_assets
    const relativePath = `pdf_logos/${req.file.filename}`;

    // Update template with new logo path
    const [updated] = await db
      .update(pdfTemplates)
      .set({
        logoPath: relativePath,
        updatedAt: new Date(),
        updatedBy: req.user?.username || 'system',
      })
      .where(eq(pdfTemplates.id, req.params.id))
      .returning();

    res.json({
      success: true,
      logoPath: relativePath,
      template: updated,
    });
  } catch (error) {
    console.error('Upload logo error:', error);
    // Clean up file if upload failed
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (err) {
        console.warn('Failed to clean up file:', err);
      }
    }
    res.status(500).json({
      error: 'Failed to upload logo',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
