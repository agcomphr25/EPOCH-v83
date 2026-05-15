/**
 * Onboarding PDF Bundle Service
 * 
 * Generates a canonical, immutable PDF bundle from a COMPLETED onboarding session.
 * Bundle generation is READ-ONLY - signed PDFs are never altered.
 * 
 * Bundle Structure:
 * 1. Cover Page - Employee info, branding
 * 2. Intake Summary - Read-only rendering of intake data
 * 3. Signed Documents - Appended signed PDFs (original order preserved)
 * 4. Captured Images - Driver license, employee photos
 * 5. Audit Summary - Document list, timestamps, finalization info
 */

import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFImage } from 'pdf-lib';
import { pool } from '../../db';
import { randomUUID } from 'crypto';
import {
  getFileStorageProvider,
  getFileStorageProviderForObjectPath,
  isSupabaseObjectPath,
} from './fileStorageProvider';

const BUNDLES_DIR = path.join(process.cwd(), 'uploads', 'onboarding-bundles');

if (!fs.existsSync(BUNDLES_DIR)) {
  fs.mkdirSync(BUNDLES_DIR, { recursive: true });
}

interface OnboardingSession {
  id: string;
  employeeId: number | null;
  pathId: string;
  adminId: number;
  status: string;
  intakeData: Record<string, any> | null;
  intakeDataSchema: any[] | null;
  startedAt: string;
  completedAt: string | null;
  pathName: string;
  pathType: string;
  pathPurpose: string | null;
  employeeName: string | null;
  bundleMediaItemId: string | null;
}

interface SessionDocument {
  id: string;
  templateId: string;
  templateName: string;
  signedPdfPath: string | null;
  signedAt: string | null;
  status: string;
}

interface SessionCapture {
  id: string;
  captureType: string;
  mediaItemId: string | null;
  storagePath: string | null;
  capturedAt: string | null;
}

interface BundleResult {
  success: boolean;
  mediaItemId?: string;
  downloadUrl?: string;
  error?: string;
}

export async function generateOnboardingBundle(sessionId: string): Promise<BundleResult> {
  try {
    // 1. Fetch session and validate
    const sessions = await pool.query(`
      SELECT 
        s.id, s.employee_id as "employeeId", s.path_id as "pathId",
        s.admin_id as "adminId", s.status, s.intake_data as "intakeData",
        s.intake_data_schema as "intakeDataSchema",
        s.started_at as "startedAt", s.completed_at as "completedAt",
        s.bundle_media_item_id as "bundleMediaItemId",
        p.name as "pathName", p.path_type as "pathType", p.path_purpose as "pathPurpose",
        e.name as "employeeName"
      FROM onboarding_sessions s
      LEFT JOIN onboarding_paths p ON s.path_id = p.id
      LEFT JOIN employees e ON s.employee_id = e.id
      WHERE s.id = $1
    `, [sessionId]);

    if (sessions.length === 0) {
      return { success: false, error: 'Session not found' };
    }

    const session: OnboardingSession = sessions[0];

    // Validate session is completed
    if (session.status !== 'completed') {
      return { success: false, error: `Session status is '${session.status}', must be 'completed' to generate bundle` };
    }

    // If bundle already exists, return it
    if (session.bundleMediaItemId) {
      const existingMedia = await pool.query(`
        SELECT id, storage_path as "storagePath" FROM media_library WHERE id = $1
      `, [session.bundleMediaItemId]);
      
      if (existingMedia.length > 0) {
        // Download URL is the storage path served through /objects/* route
        // Handle both /objects/ and objects/ prefixes for cloud storage
        const storagePath = existingMedia[0].storagePath;
        let downloadUrl: string;
        if (storagePath.startsWith('/objects/')) {
          downloadUrl = storagePath;
        } else if (storagePath.startsWith('objects/')) {
          downloadUrl = `/${storagePath}`;
        } else {
          downloadUrl = `/api/media/download/${existingMedia[0].id}`;
        }
        return { 
          success: true, 
          mediaItemId: session.bundleMediaItemId,
          downloadUrl 
        };
      }
    }

    // 2. Fetch related data
    const documents = await pool.query(`
      SELECT 
        sd.id, sd.template_id as "templateId", 
        sd.signed_pdf_path as "signedPdfPath",
        sd.signed_at as "signedAt", sd.status,
        t.name as "templateName"
      FROM onboarding_session_documents sd
      LEFT JOIN fillable_pdf_templates t ON sd.template_id = t.id
      WHERE sd.session_id = $1
      ORDER BY sd.order_index
    `, [sessionId]);

    const captures = await pool.query(`
      SELECT 
        sc.id, sc.capture_type as "captureType",
        sc.media_item_id as "mediaItemId",
        sc.captured_at as "capturedAt",
        m.storage_path as "storagePath"
      FROM onboarding_session_captures sc
      LEFT JOIN media_library m ON sc.media_item_id = m.id
      WHERE sc.session_id = $1
    `, [sessionId]);

    // Get admin info
    const admins = await pool.query(`
      SELECT username, first_name as "firstName", last_name as "lastName"
      FROM users WHERE id = $1
    `, [session.adminId]);
    const adminName = admins.length > 0 
      ? `${admins[0].firstName || ''} ${admins[0].lastName || admins[0].username}`.trim()
      : 'System';

    // Get employee details
    const employees = await pool.query(`
      SELECT name, email, job_title as "jobTitle", department, hire_date as "hireDate", employment_type as "employmentType"
      FROM employees WHERE id = $1
    `, [session.employeeId]);
    const employee = employees.length > 0 ? employees[0] : null;

    // 3. Create the PDF bundle
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Page 1: Cover Page (different for REHIRE vs ONBOARDING)
    const isRehire = session.pathPurpose === 'REHIRE';
    await addCoverPage(pdfDoc, font, boldFont, {
      employeeName: employee?.name || session.employeeName || 'New Employee',
      employmentType: employee?.employmentType || session.pathType,
      jobTitle: employee?.jobTitle || 'Not specified',
      department: employee?.department || 'Not specified',
      hireDate: employee?.hireDate || 'Not specified',
      completedAt: session.completedAt,
      adminName,
      pathName: session.pathName,
      isRehire,
    });

    // Page 2: Intake Summary
    await addIntakeSummaryPage(pdfDoc, font, boldFont, {
      intakeData: session.intakeData || {},
      intakeSchema: session.intakeDataSchema || [],
    });

    // Pages 3+: Signed Documents
    for (const doc of documents) {
      if (doc.signedPdfPath && doc.status === 'signed') {
        await appendSignedDocument(pdfDoc, doc.signedPdfPath, doc.templateName);
      }
    }

    // Next: Captured Images
    for (const capture of captures) {
      if (capture.storagePath) {
        await addCapturePage(pdfDoc, font, boldFont, capture);
      }
    }

    // Final Page: Audit Summary
    await addAuditSummaryPage(pdfDoc, font, boldFont, {
      documents,
      captures,
      completedAt: session.completedAt,
      adminName,
      sessionId,
    });

    // 4. Save and upload the bundle
    const pdfBytes = await pdfDoc.save();
    const bundleFilename = `onboarding-bundle-${sessionId}-${Date.now()}.pdf`;
    const localPath = path.join(BUNDLES_DIR, bundleFilename);
    
    fs.writeFileSync(localPath, pdfBytes);

    // Upload to object storage
    let storagePath: string;
    let downloadUrl: string;
    
    try {
      storagePath = await getFileStorageProvider().uploadBuffer({
        buffer: Buffer.from(pdfBytes),
        fileName: bundleFilename,
        contentType: 'application/pdf',
        scope: 'onboarding-bundles',
        entityId: sessionId,
      });
      // Download URL will be set after media item is created
      downloadUrl = storagePath;
    } catch (uploadError) {
      console.warn('Object storage upload failed, using local path:', uploadError);
      storagePath = `uploads/onboarding-bundles/${bundleFilename}`;
      downloadUrl = `/uploads/onboarding-bundles/${bundleFilename}`;
    }

    // 5. Create media library entry (use adminId for captured_by_id, not employeeId)
    const mediaResult = await pool.query(`
      INSERT INTO media_library (
        filename, storage_path, mime_type, file_size,
        title, category, tags, captured_by_id
      ) VALUES ($1, $2, 'application/pdf', $3, $4, 'onboarding_bundle', $5::jsonb, $6)
      RETURNING id
    `, [
      bundleFilename,
      storagePath,
      pdfBytes.length,
      `Onboarding Bundle - ${employee?.name || 'Employee'}`,
      JSON.stringify(['onboarding', 'bundle', 'employee']),
      session.adminId, // Use adminId, not employeeId
    ]);

    const mediaItemId = mediaResult[0].id;

    // 6. Update session with bundle reference
    await pool.query(`
      UPDATE onboarding_sessions 
      SET bundle_media_item_id = $1 
      WHERE id = $2
    `, [mediaItemId, sessionId]);

    // Clean up local file after upload
    try {
      fs.unlinkSync(localPath);
    } catch (cleanupError) {
      console.warn('Could not cleanup local bundle file:', cleanupError);
    }

    return {
      success: true,
      mediaItemId,
      downloadUrl,
    };

  } catch (error) {
    console.error('Error generating onboarding bundle:', error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

async function addCoverPage(
  pdfDoc: PDFDocument, 
  font: any, 
  boldFont: any,
  data: {
    employeeName: string;
    employmentType: string;
    jobTitle: string;
    department: string;
    hireDate: string;
    completedAt: string | null;
    adminName: string;
    pathName: string;
    isRehire?: boolean;
  }
): Promise<void> {
  const page = pdfDoc.addPage([612, 792]); // Letter size
  const { width, height } = page.getSize();
  
  // Title - different for re-hire vs onboarding
  const titleLine1 = data.isRehire ? 'EMPLOYEE RE-HIRE' : 'EMPLOYEE ONBOARDING';
  page.drawText(titleLine1, {
    x: 50,
    y: height - 100,
    size: 28,
    font: boldFont,
    color: rgb(0.1, 0.2, 0.4),
  });

  page.drawText('COMPLETION PACKET', {
    x: 50,
    y: height - 135,
    size: 24,
    font: boldFont,
    color: rgb(0.1, 0.2, 0.4),
  });

  // Horizontal line
  page.drawLine({
    start: { x: 50, y: height - 155 },
    end: { x: width - 50, y: height - 155 },
    thickness: 2,
    color: rgb(0.1, 0.2, 0.4),
  });

  // Employee info section
  let yPos = height - 200;
  const labelX = 50;
  const valueX = 200;
  const lineHeight = 30;

  const drawField = (label: string, value: string) => {
    page.drawText(label, { x: labelX, y: yPos, size: 12, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
    page.drawText(value || 'N/A', { x: valueX, y: yPos, size: 12, font, color: rgb(0, 0, 0) });
    yPos -= lineHeight;
  };

  drawField('Employee Name:', data.employeeName);
  drawField('Employment Type:', data.employmentType);
  drawField('Job Title:', data.jobTitle);
  drawField('Department:', data.department);
  drawField('Hire Date:', formatDate(data.hireDate));

  yPos -= 20;
  page.drawLine({
    start: { x: 50, y: yPos },
    end: { x: width - 50, y: yPos },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });
  yPos -= 30;

  drawField('Onboarding Path:', data.pathName);
  drawField('Completed:', formatDateTime(data.completedAt));
  drawField('Finalized By:', data.adminName);

  // Footer
  page.drawText('EPOCH Manufacturing ERP', {
    x: 50,
    y: 50,
    size: 10,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  page.drawText(`Generated: ${formatDateTime(new Date().toISOString())}`, {
    x: width - 200,
    y: 50,
    size: 10,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });
}

async function addIntakeSummaryPage(
  pdfDoc: PDFDocument,
  font: any,
  boldFont: any,
  data: {
    intakeData: Record<string, any>;
    intakeSchema: any[];
  }
): Promise<void> {
  const page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();

  // Title
  page.drawText('INTAKE FORM SUMMARY', {
    x: 50,
    y: height - 50,
    size: 18,
    font: boldFont,
    color: rgb(0.1, 0.2, 0.4),
  });

  page.drawLine({
    start: { x: 50, y: height - 60 },
    end: { x: width - 50, y: height - 60 },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });

  let yPos = height - 100;
  const lineHeight = 24;

  // Render each field from schema
  for (const field of data.intakeSchema) {
    const fieldKey = field.name || field.fieldKey;
    const label = field.label || fieldKey;
    const value = data.intakeData[fieldKey];

    // Skip internal fields
    if (fieldKey.startsWith('_') || fieldKey === 'internal') continue;

    // Check if we need a new page
    if (yPos < 80) {
      const newPage = pdfDoc.addPage([612, 792]);
      yPos = height - 50;
    }

    page.drawText(`${label}:`, {
      x: 50,
      y: yPos,
      size: 10,
      font: boldFont,
      color: rgb(0.3, 0.3, 0.3),
    });

    const displayValue = formatValue(value);
    page.drawText(displayValue, {
      x: 50,
      y: yPos - 14,
      size: 11,
      font,
      color: rgb(0, 0, 0),
    });

    yPos -= lineHeight + 10;
  }

  // If no fields, show message
  if (data.intakeSchema.length === 0) {
    page.drawText('No intake form data recorded.', {
      x: 50,
      y: yPos,
      size: 12,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  }
}

async function appendSignedDocument(
  pdfDoc: PDFDocument,
  signedPdfPath: string,
  templateName: string
): Promise<void> {
  try {
    // Resolve the path
    const fullPath = path.join(process.cwd(), signedPdfPath);
    
    if (!fs.existsSync(fullPath)) {
      console.warn(`Signed PDF not found: ${fullPath}`);
      return;
    }

    const signedPdfBytes = fs.readFileSync(fullPath);
    const signedPdf = await PDFDocument.load(signedPdfBytes);
    
    // Copy all pages from the signed document
    const copiedPages = await pdfDoc.copyPages(signedPdf, signedPdf.getPageIndices());
    for (const copiedPage of copiedPages) {
      pdfDoc.addPage(copiedPage);
    }
  } catch (error) {
    console.error(`Error appending signed document ${templateName}:`, error);
  }
}

async function addCapturePage(
  pdfDoc: PDFDocument,
  font: any,
  boldFont: any,
  capture: SessionCapture
): Promise<void> {
  try {
    const page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();

    // Title based on capture type
    const captureLabel = getCaptureLabel(capture.captureType);
    page.drawText(captureLabel.toUpperCase(), {
      x: 50,
      y: height - 50,
      size: 16,
      font: boldFont,
      color: rgb(0.1, 0.2, 0.4),
    });

    // Try to load and embed the image
    if (capture.storagePath) {
      try {
        let imageBytes: Buffer;
        
        // Check if it's a local path or object storage path
        // Normalize objects/ prefix to /objects/
        const normalizedPath = capture.storagePath.startsWith('objects/') 
          ? `/${capture.storagePath}` 
          : capture.storagePath;
        
        if (capture.storagePath.startsWith('uploads/')) {
          const localPath = path.join(process.cwd(), capture.storagePath);
          if (fs.existsSync(localPath)) {
            imageBytes = fs.readFileSync(localPath);
          } else {
            throw new Error('Local file not found');
          }
        } else if (normalizedPath.startsWith('/objects/') || isSupabaseObjectPath(normalizedPath)) {
          imageBytes = await getFileStorageProviderForObjectPath(normalizedPath).downloadBuffer(normalizedPath);
        } else {
          // Try as local path
          const localPath = path.join(process.cwd(), capture.storagePath);
          if (fs.existsSync(localPath)) {
            imageBytes = fs.readFileSync(localPath);
          } else {
            throw new Error('File not found');
          }
        }

        // Embed the image (assuming JPEG or PNG)
        let image: PDFImage;
        try {
          image = await pdfDoc.embedJpg(imageBytes);
        } catch {
          image = await pdfDoc.embedPng(imageBytes);
        }

        // Scale to fit page while maintaining aspect ratio
        const maxWidth = width - 100;
        const maxHeight = height - 200;
        const aspectRatio = image.width / image.height;
        
        let imgWidth = maxWidth;
        let imgHeight = imgWidth / aspectRatio;
        
        if (imgHeight > maxHeight) {
          imgHeight = maxHeight;
          imgWidth = imgHeight * aspectRatio;
        }

        const x = (width - imgWidth) / 2;
        const y = height - 100 - imgHeight;

        page.drawImage(image, {
          x,
          y,
          width: imgWidth,
          height: imgHeight,
        });

        // Capture timestamp
        if (capture.capturedAt) {
          page.drawText(`Captured: ${formatDateTime(capture.capturedAt)}`, {
            x: 50,
            y: 50,
            size: 10,
            font,
            color: rgb(0.5, 0.5, 0.5),
          });
        }
      } catch (imageError) {
        console.error(`Error embedding image for ${capture.captureType}:`, imageError);
        page.drawText('Image could not be loaded', {
          x: 50,
          y: height - 100,
          size: 12,
          font,
          color: rgb(0.5, 0.5, 0.5),
        });
      }
    }
  } catch (error) {
    console.error(`Error adding capture page:`, error);
  }
}

async function addAuditSummaryPage(
  pdfDoc: PDFDocument,
  font: any,
  boldFont: any,
  data: {
    documents: SessionDocument[];
    captures: SessionCapture[];
    completedAt: string | null;
    adminName: string;
    sessionId: string;
  }
): Promise<void> {
  const page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();

  // Title
  page.drawText('AUDIT SUMMARY', {
    x: 50,
    y: height - 50,
    size: 18,
    font: boldFont,
    color: rgb(0.1, 0.2, 0.4),
  });

  page.drawLine({
    start: { x: 50, y: height - 60 },
    end: { x: width - 50, y: height - 60 },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });

  let yPos = height - 100;
  const lineHeight = 20;

  // Finalization info
  page.drawText('Finalization Details', { x: 50, y: yPos, size: 14, font: boldFont, color: rgb(0.2, 0.2, 0.2) });
  yPos -= lineHeight + 5;

  page.drawText(`Session ID: ${data.sessionId}`, { x: 50, y: yPos, size: 10, font, color: rgb(0, 0, 0) });
  yPos -= lineHeight;
  page.drawText(`Completed: ${formatDateTime(data.completedAt)}`, { x: 50, y: yPos, size: 10, font, color: rgb(0, 0, 0) });
  yPos -= lineHeight;
  page.drawText(`Finalized By: ${data.adminName}`, { x: 50, y: yPos, size: 10, font, color: rgb(0, 0, 0) });
  yPos -= lineHeight + 15;

  // Documents section
  page.drawText('Signed Documents', { x: 50, y: yPos, size: 14, font: boldFont, color: rgb(0.2, 0.2, 0.2) });
  yPos -= lineHeight + 5;

  const signedDocs = data.documents.filter(d => d.status === 'signed');
  if (signedDocs.length === 0) {
    page.drawText('No documents were signed.', { x: 50, y: yPos, size: 10, font, color: rgb(0.5, 0.5, 0.5) });
    yPos -= lineHeight;
  } else {
    for (const doc of signedDocs) {
      page.drawText(`• ${doc.templateName || 'Document'}`, { x: 50, y: yPos, size: 10, font, color: rgb(0, 0, 0) });
      yPos -= 14;
      page.drawText(`  Signed: ${formatDateTime(doc.signedAt)}`, { x: 50, y: yPos, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
      yPos -= lineHeight;
    }
  }

  yPos -= 10;

  // Captures section
  page.drawText('Captured Images', { x: 50, y: yPos, size: 14, font: boldFont, color: rgb(0.2, 0.2, 0.2) });
  yPos -= lineHeight + 5;

  const completedCaptures = data.captures.filter(c => c.mediaItemId);
  if (completedCaptures.length === 0) {
    page.drawText('No images were captured.', { x: 50, y: yPos, size: 10, font, color: rgb(0.5, 0.5, 0.5) });
    yPos -= lineHeight;
  } else {
    for (const capture of completedCaptures) {
      const label = getCaptureLabel(capture.captureType);
      page.drawText(`• ${label}`, { x: 50, y: yPos, size: 10, font, color: rgb(0, 0, 0) });
      yPos -= 14;
      page.drawText(`  Captured: ${formatDateTime(capture.capturedAt)}`, { x: 50, y: yPos, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
      yPos -= lineHeight;
    }
  }

  // Footer
  page.drawText('This document is an official record of the employee onboarding process.', {
    x: 50,
    y: 70,
    size: 9,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  page.drawText(`Bundle generated: ${formatDateTime(new Date().toISOString())}`, {
    x: 50,
    y: 50,
    size: 9,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function formatValue(value: any): string {
  if (value === null || value === undefined) return 'Not provided';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function getCaptureLabel(captureType: string): string {
  const labels: Record<string, string> = {
    'photo_id': 'Photo ID / Driver License',
    'employee_photo': 'Employee Photo',
    'drivers_license': 'Driver License',
    'signature': 'Signature',
  };
  return labels[captureType] || captureType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}
