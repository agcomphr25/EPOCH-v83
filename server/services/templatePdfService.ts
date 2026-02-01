/**
 * Fillable PDF Template Service
 * 
 * Handles PDF template loading, field value application, and signature embedding
 * for the customer fill-and-sign workflow.
 * 
 * Uses pdf-lib for all PDF operations, following the same patterns as
 * orderPdfService.ts and salesOrderPdf.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { db } from '../db';
import { fillablePdfTemplates, fillablePdfInstances, FillableFieldDef } from '../schema';
import { eq, desc } from 'drizzle-orm';
import { generatePublicSignatureId, getCurrentEnvironment } from '../utils/magicLink';
import crypto from 'crypto';

const TEMPLATES_DIR = path.join(process.cwd(), 'uploads', 'pdf-templates');
const INSTANCES_DIR = path.join(process.cwd(), 'uploads', 'pdf-template-instances');

// Ensure directories exist
if (!fs.existsSync(TEMPLATES_DIR)) {
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
}
if (!fs.existsSync(INSTANCES_DIR)) {
  fs.mkdirSync(INSTANCES_DIR, { recursive: true });
}

/**
 * Load a template PDF by ID
 */
export async function loadTemplatePdf(templateId: string): Promise<{
  template: typeof fillablePdfTemplates.$inferSelect;
  pdfBytes: Buffer;
} | null> {
  const [template] = await db
    .select()
    .from(fillablePdfTemplates)
    .where(eq(fillablePdfTemplates.id, templateId))
    .limit(1);

  if (!template) {
    console.error(`[TemplatePDF] Template not found: ${templateId}`);
    return null;
  }

  // Handle both absolute and relative paths
  const pdfPath = template.templatePdfPath.startsWith('/') 
    ? template.templatePdfPath 
    : path.join(process.cwd(), template.templatePdfPath);
  if (!fs.existsSync(pdfPath)) {
    console.error(`[TemplatePDF] Template PDF file not found: ${pdfPath}`);
    return null;
  }

  const pdfBytes = fs.readFileSync(pdfPath);
  return { template, pdfBytes };
}

/**
 * Apply field values to a PDF
 * Uses AcroForm fields if present, falls back to coordinate-based text drawing
 */
export async function applyFieldValuesToPdf(
  pdfBytes: Buffer,
  fieldDefs: FillableFieldDef[],
  values: Record<string, any>
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  
  // Try to get form fields (AcroForm)
  let form;
  try {
    form = pdfDoc.getForm();
  } catch {
    form = null;
  }

  const pages = pdfDoc.getPages();

  for (const fieldDef of fieldDefs) {
    const value = values[fieldDef.name];
    if (value === undefined || value === null || value === '') continue;

    const stringValue = String(value);

    // Try AcroForm field first
    if (form && fieldDef.pdfFieldName) {
      try {
        const field = form.getTextField(fieldDef.pdfFieldName);
        if (field) {
          field.setText(stringValue);
          continue;
        }
      } catch (e) {
        // Field not found or not a text field, fall through to coordinate-based
      }
    }

    // Fall back to coordinate-based text drawing
    if (fieldDef.x !== undefined && fieldDef.y !== undefined) {
      const pageIndex = fieldDef.page ?? 0;
      const page = pages[pageIndex];
      if (!page) continue;

      const fontSize = fieldDef.fontSize ?? 10;
      
      if (fieldDef.type === 'checkbox') {
        // Draw checkmark or X for checkbox
        if (value === true || value === 'true' || value === 'yes' || value === '1') {
          page.drawText('X', {
            x: fieldDef.x,
            y: fieldDef.y,
            size: fontSize,
            font,
            color: rgb(0, 0, 0),
          });
        }
      } else if (fieldDef.type === 'textarea') {
        // Handle multi-line text
        const lines = stringValue.split('\n');
        let yOffset = 0;
        for (const line of lines) {
          page.drawText(line.substring(0, fieldDef.maxLength ?? 100), {
            x: fieldDef.x,
            y: fieldDef.y - yOffset,
            size: fontSize,
            font,
            color: rgb(0, 0, 0),
          });
          yOffset += fontSize + 2;
        }
      } else {
        // Single line text
        page.drawText(stringValue.substring(0, fieldDef.maxLength ?? 100), {
          x: fieldDef.x,
          y: fieldDef.y,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
      }
    }
  }

  // Flatten form fields if present
  if (form) {
    try {
      form.flatten();
    } catch {
      // Some forms can't be flattened, continue anyway
    }
  }

  const resultBytes = await pdfDoc.save();
  return Buffer.from(resultBytes);
}

/**
 * Embed signature image into PDF at specified location
 * Reuses the same pattern as salesOrderPdf.ts embedSignatureInPDF
 */
export async function embedSignatureInTemplatePdf(
  pdfBytes: Buffer,
  signatureDataUrl: string,
  placement?: {
    x: number;
    y: number;
    page: number;
    width: number;
    height: number;
  }
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  // Default placement: bottom of last page
  const defaultPlacement = {
    x: 100,
    y: 100,
    page: pages.length - 1,
    width: 150,
    height: 50,
  };

  const { x, y, page: pageIndex, width, height } = placement ?? defaultPlacement;
  
  const targetPage = pages[pageIndex] ?? pages[pages.length - 1];
  if (!targetPage) {
    throw new Error('PDF has no pages to embed signature');
  }

  // Extract base64 signature data
  const base64Data = signatureDataUrl.replace(/^data:image\/\w+;base64,/, '');
  const signatureBytes = Buffer.from(base64Data, 'base64');

  try {
    // Try PNG first
    const signatureImage = await pdfDoc.embedPng(signatureBytes);
    targetPage.drawImage(signatureImage, { x, y, width, height });
  } catch {
    try {
      // Fall back to JPEG
      const signatureImage = await pdfDoc.embedJpg(signatureBytes);
      targetPage.drawImage(signatureImage, { x, y, width, height });
    } catch (e) {
      console.error('[TemplatePDF] Failed to embed signature:', e);
      throw new Error('Failed to embed signature image');
    }
  }

  // Add signed date below signature
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  targetPage.drawText(`Signed: ${new Date().toLocaleDateString()}`, {
    x: x,
    y: y - 15,
    size: 8,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });

  const resultBytes = await pdfDoc.save();
  return Buffer.from(resultBytes);
}

/**
 * Create a new fillable PDF instance for customer fill-and-sign
 */
export async function createFillableInstance(params: {
  templateId: string;
  entityType?: string;
  entityId?: string;
  recipientEmail?: string;
  recipientName?: string;
}): Promise<{
  instance: typeof fillablePdfInstances.$inferSelect;
  publicUrl: string;
} | null> {
  // Verify template exists
  const templateData = await loadTemplatePdf(params.templateId);
  if (!templateData) {
    return null;
  }

  const publicSignatureId = generatePublicSignatureId();
  const signatureToken = crypto.randomBytes(32).toString('base64url');
  const environment = getCurrentEnvironment();

  const [instance] = await db
    .insert(fillablePdfInstances)
    .values({
      templateId: params.templateId,
      entityType: params.entityType ?? 'standalone',
      entityId: params.entityId,
      publicSignatureId,
      signatureToken,
      recipientEmail: params.recipientEmail,
      recipientName: params.recipientName,
      status: 'draft',
      environment,
      valuesJson: {},
    })
    .returning();

  // Generate public URL - uses same pattern as magicLink.ts
  const baseUrl = environment === 'prod' 
    ? 'https://agcompepoch.xyz'
    : 'https://epoch-v8-glennj.replit.app';
  const publicUrl = `${baseUrl}/fill-and-sign/${publicSignatureId}`;

  console.log(`[TemplatePDF] Created instance ${instance.id} with public URL: ${publicUrl}`);

  return { instance, publicUrl };
}

/**
 * Get instance by public signature ID (for customer access)
 */
export async function getInstanceByPublicId(publicSignatureId: string): Promise<{
  instance: typeof fillablePdfInstances.$inferSelect;
  template: typeof fillablePdfTemplates.$inferSelect;
} | null> {
  const [instance] = await db
    .select()
    .from(fillablePdfInstances)
    .where(eq(fillablePdfInstances.publicSignatureId, publicSignatureId))
    .limit(1);

  if (!instance) {
    return null;
  }

  const [template] = await db
    .select()
    .from(fillablePdfTemplates)
    .where(eq(fillablePdfTemplates.id, instance.templateId))
    .limit(1);

  if (!template) {
    return null;
  }

  return { instance, template };
}

/**
 * Submit filled form values and optional signature
 * Returns the signed PDF path
 */
export async function submitFilledForm(
  publicSignatureId: string,
  valuesJson: Record<string, any>,
  signatureDataUrl?: string,
  clientIp?: string
): Promise<{
  success: boolean;
  signedPdfPath?: string;
  error?: string;
}> {
  // Get instance and template
  const data = await getInstanceByPublicId(publicSignatureId);
  if (!data) {
    return { success: false, error: 'Instance not found' };
  }

  const { instance, template } = data;

  // Check if already signed
  if (instance.status === 'signed') {
    return { success: false, error: 'This form has already been signed' };
  }

  // Check signature requirement
  if (template.requiresSignature && !signatureDataUrl) {
    return { success: false, error: 'Signature is required' };
  }

  try {
    // Load template PDF
    const templateData = await loadTemplatePdf(template.id);
    if (!templateData) {
      return { success: false, error: 'Template PDF not found' };
    }

    // Apply field values
    let pdfBytes = await applyFieldValuesToPdf(
      templateData.pdfBytes,
      template.fieldDefsJson as FillableFieldDef[],
      valuesJson
    );

    // Embed signature if provided
    if (signatureDataUrl) {
      pdfBytes = await embedSignatureInTemplatePdf(
        pdfBytes,
        signatureDataUrl,
        template.signaturePlacement as any
      );
    }

    // Save signed PDF
    const timestamp = Date.now();
    const filename = `instance-${instance.id}-signed-${timestamp}.pdf`;
    const signedPdfPath = path.join('uploads', 'pdf-template-instances', filename);
    const fullPath = path.join(process.cwd(), signedPdfPath);
    
    fs.writeFileSync(fullPath, pdfBytes);
    console.log(`[TemplatePDF] Saved signed PDF: ${signedPdfPath}`);

    // Update instance
    await db
      .update(fillablePdfInstances)
      .set({
        status: 'signed',
        valuesJson,
        signatureData: signatureDataUrl,
        signedAt: new Date(),
        signedByIp: clientIp,
        signedPdfPath,
        updatedAt: new Date(),
      })
      .where(eq(fillablePdfInstances.id, instance.id));

    return { success: true, signedPdfPath };
  } catch (error) {
    console.error('[TemplatePDF] Error submitting form:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Mark instance as viewed
 */
export async function markInstanceViewed(publicSignatureId: string): Promise<void> {
  await db
    .update(fillablePdfInstances)
    .set({
      status: 'viewed',
      viewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(fillablePdfInstances.publicSignatureId, publicSignatureId));
}

/**
 * Get all templates for admin listing
 */
export async function getAllTemplates(): Promise<(typeof fillablePdfTemplates.$inferSelect)[]> {
  const templates = await db
    .select()
    .from(fillablePdfTemplates)
    .where(eq(fillablePdfTemplates.isActive, true))
    .orderBy(desc(fillablePdfTemplates.createdAt));
  return templates;
}

/**
 * Get all instances for a template
 */
export async function getInstancesForTemplate(templateId: string): Promise<(typeof fillablePdfInstances.$inferSelect)[]> {
  return await db
    .select()
    .from(fillablePdfInstances)
    .where(eq(fillablePdfInstances.templateId, templateId))
    .orderBy(fillablePdfInstances.createdAt);
}

/**
 * Create a new template
 */
export async function createTemplate(params: {
  name: string;
  description?: string;
  templatePdfPath: string;
  sourceMediaItemId?: string;
  fieldDefsJson: FillableFieldDef[];
  requiresSignature?: boolean;
  signaturePlacement?: {
    x: number;
    y: number;
    page: number;
    width: number;
    height: number;
  };
  createdBy?: string;
}): Promise<typeof fillablePdfTemplates.$inferSelect> {
  const [template] = await db
    .insert(fillablePdfTemplates)
    .values({
      name: params.name,
      description: params.description,
      templatePdfPath: params.templatePdfPath,
      sourceMediaItemId: params.sourceMediaItemId,
      fieldDefsJson: params.fieldDefsJson,
      requiresSignature: params.requiresSignature ?? true,
      signaturePlacement: params.signaturePlacement,
      createdBy: params.createdBy,
    })
    .returning();

  return template;
}

/**
 * Update a template
 */
export async function updateTemplate(
  templateId: string,
  params: Partial<{
    name: string;
    description: string;
    fieldDefsJson: FillableFieldDef[];
    requiresSignature: boolean;
    signaturePlacement: {
      x: number;
      y: number;
      page: number;
      width: number;
      height: number;
    };
    isActive: boolean;
  }>
): Promise<typeof fillablePdfTemplates.$inferSelect | null> {
  const [template] = await db
    .update(fillablePdfTemplates)
    .set({
      ...params,
      updatedAt: new Date(),
    })
    .where(eq(fillablePdfTemplates.id, templateId))
    .returning();

  return template ?? null;
}

/**
 * Delete a template (soft delete by setting isActive = false)
 */
export async function deactivateTemplate(templateId: string): Promise<boolean> {
  const result = await db
    .update(fillablePdfTemplates)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(eq(fillablePdfTemplates.id, templateId));

  return true;
}
