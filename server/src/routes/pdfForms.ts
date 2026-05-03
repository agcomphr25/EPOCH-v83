import { Router } from 'express';
import multer from 'multer';
import { db } from '../../db';
import { pdfFormTemplates, pdfFormFields } from '../../schema';
import { eq, desc, asc } from 'drizzle-orm';
import { ObjectStorageService } from '../../replit_integrations/object_storage/objectStorage';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const router = Router();
const objectStorage = new ObjectStorageService();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

interface FieldPayload {
  pageIndex?: number;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
  label: string;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function getPdfPageDimensions(buffer: Buffer): Promise<Array<{ width: number; height: number }>> {
  try {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    return pages.map(page => {
      const { width, height } = page.getSize();
      return { width, height };
    });
  } catch (err) {
    console.error('[pdfForms] Error getting page dimensions:', err);
    return [];
  }
}

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }
    const { name } = req.body as { name?: string };
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Template name is required' });
    }

    const buffer = req.file.buffer;
    const pageDimensions = await getPdfPageDimensions(buffer);
    const storagePath = await objectStorage.uploadBuffer(buffer, req.file.originalname, 'application/pdf', 'pdf-forms');

    let template;
    try {
      const [inserted] = await db
        .insert(pdfFormTemplates)
        .values({
          name: name.trim(),
          storagePath,
          pageCount: pageDimensions.length || 1,
          pageDimensions,
        })
        .returning();
      template = inserted;
    } catch (dbErr) {
      // Clean up the uploaded file so it does not become orphaned
      try { await objectStorage.deleteByStoragePath(storagePath); } catch { /* best effort */ }
      throw dbErr;
    }

    let pdfUrl: string | null = null;
    try {
      const file = await objectStorage.getObjectEntityFile(storagePath);
      pdfUrl = await objectStorage.getObjectEntityDownloadURL(file, 3600);
    } catch {
      pdfUrl = null;
    }

    res.status(201).json({ ...template, pdfUrl });
  } catch (err) {
    console.error('[pdfForms] Upload error:', err);
    res.status(500).json({ error: errorMessage(err) || 'Failed to upload PDF' });
  }
});

router.get('/', async (_req, res) => {
  try {
    const templates = await db
      .select()
      .from(pdfFormTemplates)
      .orderBy(desc(pdfFormTemplates.createdAt));
    res.json(templates);
  } catch (err) {
    console.error('[pdfForms] List error:', err);
    res.status(500).json({ error: errorMessage(err) || 'Failed to fetch templates' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid template ID' });

    const [template] = await db
      .select()
      .from(pdfFormTemplates)
      .where(eq(pdfFormTemplates.id, id));

    if (!template) return res.status(404).json({ error: 'Template not found' });

    const fields = await db
      .select()
      .from(pdfFormFields)
      .where(eq(pdfFormFields.templateId, id))
      .orderBy(asc(pdfFormFields.pageIndex), asc(pdfFormFields.id));

    let pdfUrl: string | null = null;
    try {
      const file = await objectStorage.getObjectEntityFile(template.storagePath);
      pdfUrl = await objectStorage.getObjectEntityDownloadURL(file, 3600);
    } catch (e) {
      console.warn('[pdfForms] Could not get signed URL for template', id, e);
    }

    res.json({ ...template, fields, pdfUrl });
  } catch (err) {
    console.error('[pdfForms] Get error:', err);
    res.status(500).json({ error: errorMessage(err) || 'Failed to fetch template' });
  }
});

router.get('/:id/pdf', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid template ID' });

    const [template] = await db
      .select()
      .from(pdfFormTemplates)
      .where(eq(pdfFormTemplates.id, id));

    if (!template) return res.status(404).json({ error: 'Template not found' });

    const file = await objectStorage.getObjectEntityFile(template.storagePath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Access-Control-Allow-Origin', '*');
    await objectStorage.downloadObject(file, res);
  } catch (err) {
    console.error('[pdfForms] PDF serve error:', err);
    res.status(500).json({ error: errorMessage(err) || 'Failed to serve PDF' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid template ID' });

    const existing = await db.select().from(pdfFormTemplates).where(eq(pdfFormTemplates.id, id));
    if (existing.length === 0) return res.status(404).json({ error: 'Template not found' });

    const { name, fields } = req.body as { name?: string; fields?: FieldPayload[] };

    if (name) {
      await db
        .update(pdfFormTemplates)
        .set({ name: name.trim(), updatedAt: new Date() })
        .where(eq(pdfFormTemplates.id, id));
    }

    if (Array.isArray(fields)) {
      const pageCount = existing[0].pageCount ?? 1;
      for (const f of fields) {
        const inRange = (v: number) => typeof v === 'number' && isFinite(v) && v >= 0 && v <= 1;
        const isPositive = (v: number) => typeof v === 'number' && v > 0;
        if (!inRange(f.xPercent) || !inRange(f.yPercent) || !inRange(f.widthPercent) || !inRange(f.heightPercent)) {
          return res.status(400).json({ error: 'Field coordinates must be numbers between 0 and 1' });
        }
        if (!isPositive(f.widthPercent) || !isPositive(f.heightPercent)) {
          return res.status(400).json({ error: 'Field width and height must be greater than 0' });
        }
        const pageIndex = f.pageIndex ?? 0;
        if (pageIndex < 0 || pageIndex >= pageCount) {
          return res.status(400).json({ error: `Field pageIndex must be between 0 and ${pageCount - 1}` });
        }
        if (!f.label || typeof f.label !== 'string' || !f.label.trim()) {
          return res.status(400).json({ error: 'Field label must be a non-empty string' });
        }
      }
      await db.transaction(async (tx) => {
        await tx
          .update(pdfFormTemplates)
          .set({ updatedAt: new Date() })
          .where(eq(pdfFormTemplates.id, id));
        await tx.delete(pdfFormFields).where(eq(pdfFormFields.templateId, id));
        if (fields.length > 0) {
          await tx.insert(pdfFormFields).values(
            fields.map((f: FieldPayload) => ({
              templateId: id,
              pageIndex: f.pageIndex ?? 0,
              xPercent: f.xPercent,
              yPercent: f.yPercent,
              widthPercent: f.widthPercent,
              heightPercent: f.heightPercent,
              label: f.label.trim(),
            }))
          );
        }
      });
    }

    const [updated] = await db.select().from(pdfFormTemplates).where(eq(pdfFormTemplates.id, id));
    const updatedFields = await db
      .select()
      .from(pdfFormFields)
      .where(eq(pdfFormFields.templateId, id))
      .orderBy(asc(pdfFormFields.pageIndex), asc(pdfFormFields.id));
    res.json({ ...updated, fields: updatedFields });
  } catch (err) {
    console.error('[pdfForms] Update error:', err);
    res.status(500).json({ error: errorMessage(err) || 'Failed to update template' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid template ID' });

    const [template] = await db.select().from(pdfFormTemplates).where(eq(pdfFormTemplates.id, id));
    if (!template) return res.status(404).json({ error: 'Template not found' });

    await db.delete(pdfFormFields).where(eq(pdfFormFields.templateId, id));
    await db.delete(pdfFormTemplates).where(eq(pdfFormTemplates.id, id));

    if (template?.storagePath) {
      await objectStorage.deleteByStoragePath(template.storagePath);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[pdfForms] Delete error:', err);
    res.status(500).json({ error: errorMessage(err) || 'Failed to delete template' });
  }
});

router.post('/:id/download-filled', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid template ID' });

    const { values } = req.body as { values?: Record<string | number, string> };
    if (!values || typeof values !== 'object') {
      return res.status(400).json({ error: 'values object is required' });
    }

    const [template] = await db.select().from(pdfFormTemplates).where(eq(pdfFormTemplates.id, id));
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const fields = await db.select().from(pdfFormFields).where(eq(pdfFormFields.templateId, id));

    const pdfBuffer = await objectStorage.downloadAsBuffer(template.storagePath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();

    for (const field of fields) {
      const value = values[field.id] ?? values[field.label] ?? '';
      if (!value) continue;

      const pageIndex = field.pageIndex ?? 0;
      if (pageIndex >= pages.length) continue;

      const page = pages[pageIndex];
      const { width: pageWidth, height: pageHeight } = page.getSize();

      const x = field.xPercent * pageWidth;
      const fieldHeight = field.heightPercent * pageHeight;
      const fieldWidth = field.widthPercent * pageWidth;
      const yFromBottom = pageHeight - (field.yPercent * pageHeight) - fieldHeight;

      const fontSize = Math.min(12, fieldHeight * 0.6);
      const maxCharsApprox = Math.floor(fieldWidth / (fontSize * 0.55));
      const displayValue = String(value).slice(0, maxCharsApprox);

      page.drawText(displayValue, {
        x: x + 2,
        y: yFromBottom + fieldHeight * 0.2,
        size: fontSize,
        font: helveticaFont,
        color: rgb(0, 0, 0),
      });
    }

    const filledBytes = await pdfDoc.save();
    const safeName = template.name.replace(/[^a-zA-Z0-9-_]/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_filled.pdf"`);
    res.setHeader('Content-Length', filledBytes.length);
    res.send(Buffer.from(filledBytes));
  } catch (err) {
    console.error('[pdfForms] Fill/download error:', err);
    res.status(500).json({ error: errorMessage(err) || 'Failed to generate filled PDF' });
  }
});

export default router;
