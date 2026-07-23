import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { 
  controlledDocuments,
  controlledDocumentNumberRegistry,
  documentVersionHistory,
  inventoryItems,
  routingDocuments, 
  specSheets, 
  documentTemplates, 
  templateFields,
  routingDocumentLinks,
  certificationTaskLinks,
  documentDistributionLogs,
  insertRoutingDocumentSchema,
  insertSpecSheetSchema,
  insertDocumentTemplateSchema,
  insertTemplateFieldSchema
} from '@shared/schema';
import { eq, desc, and, ilike, sql } from 'drizzle-orm';
import OpenAI from 'openai';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  getFileStorageProvider,
  getFileStorageProviderForObjectPath,
  getStorageErrorResponse,
} from '../services/fileStorageProvider';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import { createHash, randomUUID } from 'crypto';

const require = createRequire(import.meta.url);
const TEMPLATE_UPLOAD_TABLES = new Set([
  'routing_documents',
  'spec_sheets',
  'document_templates',
  'template_fields',
  'controlled_documents',
  'controlled_document_number_registry',
  'document_version_history',
  'project_documents',
  'media_library',
]);

async function getPublicTableColumns(tableName: string) {
  const result = await db.execute(sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
  `);
  const rows = ((result as any)?.rows || result || []) as any[];
  return new Map(rows.map((row) => [String(row.column_name), String(row.data_type || '')]));
}

function valueSqlForPublicColumn(columns: Map<string, string>, key: string, value: any) {
  const dataType = columns.get(key);
  if ((dataType === 'json' || dataType === 'jsonb') && value !== null) {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    return dataType === 'jsonb' ? sql`${serialized}::jsonb` : sql`${serialized}::json`;
  }
  if (dataType?.toLowerCase() === 'array' && Array.isArray(value)) {
    const serialized = JSON.stringify(value.map((entry) => String(entry)));
    return sql`ARRAY(SELECT jsonb_array_elements_text(${serialized}::jsonb))`;
  }
  return sql`${value}`;
}

async function insertPublicRowReturning(tableName: string, values: Record<string, any>, requiredColumns: string[] = []) {
  if (!TEMPLATE_UPLOAD_TABLES.has(tableName)) {
    throw new Error(`Unsupported template upload table: ${tableName}`);
  }

  const columns = await getPublicTableColumns(tableName);
  const availableKeys = Object.keys(values).filter((key) => columns.has(key) && values[key] !== undefined);
  const missingRequired = requiredColumns.filter((key) => !availableKeys.includes(key));
  if (missingRequired.length > 0) {
    throw new Error(`${tableName} is missing required column(s): ${missingRequired.join(', ')}`);
  }
  if (availableKeys.length === 0) {
    throw new Error(`${tableName} has no compatible columns for insert`);
  }

  const columnSql = availableKeys.map((key) => sql.raw(`"${key}"`));
  const valueSql = availableKeys.map((key) => valueSqlForPublicColumn(columns, key, values[key]));
  const result = await db.execute(sql`
    INSERT INTO ${sql.raw(`"${tableName}"`)} (${sql.join(columnSql, sql`, `)})
    VALUES (${sql.join(valueSql, sql`, `)})
    RETURNING *
  `);
  const rows = ((result as any)?.rows || result || []) as any[];
  return rows[0];
}

async function updatePublicRowByIdReturning(tableName: string, id: string, values: Record<string, any>) {
  if (!TEMPLATE_UPLOAD_TABLES.has(tableName)) {
    throw new Error(`Unsupported template upload table: ${tableName}`);
  }

  const columns = await getPublicTableColumns(tableName);
  const availableKeys = Object.keys(values).filter((key) => columns.has(key) && values[key] !== undefined);
  if (availableKeys.length === 0) {
    const existingResult = await db.execute(sql`
      SELECT *
      FROM ${sql.raw(`"${tableName}"`)}
      WHERE id = ${id}
      LIMIT 1
    `);
    return (((existingResult as any)?.rows || existingResult || []) as any[])[0];
  }

  const setSql = availableKeys.map((key) => sql`${sql.raw(`"${key}"`)} = ${valueSqlForPublicColumn(columns, key, values[key])}`);
  const result = await db.execute(sql`
    UPDATE ${sql.raw(`"${tableName}"`)}
    SET ${sql.join(setSql, sql`, `)}
    WHERE id = ${id}
    RETURNING *
  `);
  return (((result as any)?.rows || result || []) as any[])[0];
}

async function resolveFileToBuffer(fileUrl: string): Promise<Buffer | null> {
  if (fileUrl.startsWith('/assets/documents/')) {
    const filename = fileUrl.replace('/assets/documents/', '');
    const localPath = path.join(process.cwd(), 'server/src/assets/documents', filename);
    if (fs.existsSync(localPath)) {
      console.log(`[FileResolve] Reading controlled document asset: ${localPath}`);
      return fs.readFileSync(localPath);
    }
    return null;
  }
  if (fileUrl.startsWith('/api/media/file/')) {
    const filename = fileUrl.replace('/api/media/file/', '');
    const localPath = path.join(process.cwd(), 'uploads', 'media-library', filename);
    if (fs.existsSync(localPath)) {
      console.log(`[FileResolve] Reading local file: ${localPath}`);
      return fs.readFileSync(localPath);
    }
    const storagePath = `uploads/media-library/${filename}`;
    try {
      console.log(`[FileResolve] Trying object storage path: ${storagePath}`);
      return await getFileStorageProviderForObjectPath(storagePath).downloadBuffer(storagePath);
    } catch (e) {
      console.log(`[FileResolve] Object storage failed, trying /objects/ prefix`);
      try {
        const objectPath = `/objects/${storagePath}`;
        return await getFileStorageProviderForObjectPath(objectPath).downloadBuffer(objectPath);
      } catch (e2) {
        console.error(`[FileResolve] All attempts failed for: ${fileUrl}`);
      }
    }
    return null;
  }
  if (fileUrl.startsWith('/api/media/cloud/')) {
    const cloudPath = fileUrl.replace('/api/media/cloud/', '');
    try {
      const objectPath = `/objects/${cloudPath}`;
      return await getFileStorageProviderForObjectPath(objectPath).downloadBuffer(objectPath);
    } catch (e) {
      console.error(`[FileResolve] Cloud download failed for: ${fileUrl}`);
    }
    return null;
  }
  try {
    return await getFileStorageProviderForObjectPath(fileUrl).downloadBuffer(fileUrl);
  } catch (e) {
    console.error(`[FileResolve] Direct download failed for: ${fileUrl}`);
  }
  return null;
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = await import('pdf-parse');
    const PDFParseClass = (pdfParse as any).PDFParse || (pdfParse as any).default?.PDFParse;
    if (PDFParseClass) {
      const parser = new PDFParseClass({ data: new Uint8Array(buffer), verbosity: 0 });
      const textResult = await parser.getText();
      await parser.destroy();
      const text = textResult?.text || '';
      if (text.trim()) {
        console.log(`[PDF] Extracted ${text.length} chars via PDFParse`);
        return text;
      }
    }
  } catch (e1) {
    console.log('[PDF] PDFParse class method failed, trying default export:', (e1 as Error).message);
  }
  try {
    const pdfParse = await import('pdf-parse');
    const fn = (pdfParse as any).default || pdfParse;
    if (typeof fn === 'function') {
      const result = await fn(buffer);
      const text = result?.text || '';
      if (text.trim()) {
        console.log(`[PDF] Extracted ${text.length} chars via default export`);
        return text;
      }
    }
  } catch (e2) {
    console.error('[PDF] All extraction methods failed:', (e2 as Error).message);
  }
  return '';
}

const router = Router();

const CONTROLLED_TEMPLATE_PREFIX = 'FDT';

function sanitizeFileName(fileName: string): string {
  const ext = path.extname(fileName) || '.pdf';
  const base = path.basename(fileName, ext)
    .replace(/[^a-z0-9-_ ]/gi, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'uploaded-document';
  return `${base}-${Date.now()}${ext.toLowerCase()}`;
}

function normalizeTemplateField(field: any, index: number) {
  const label = String(field?.fieldLabel || field?.label || field?.fieldName || `Field ${index + 1}`).trim();
  const rawName = String(field?.fieldName || label)
    .trim()
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  const allowedTypes = new Set(['text', 'textarea', 'number', 'date', 'signature', 'barcode', 'checkbox', 'inventory_parts']);

  return {
    fieldName: rawName || `field_${index + 1}`,
    fieldLabel: label,
    fieldType: allowedTypes.has(field?.fieldType) ? field.fieldType : 'text',
    isRequired: Boolean(field?.isRequired),
    isUniquePerSerial: Boolean(field?.isUniquePerSerial),
    defaultValue: field?.defaultValue ?? null,
    sectionName: field?.sectionName || field?.department || null,
    sortOrder: Number.isFinite(Number(field?.sortOrder)) ? Number(field.sortOrder) : index,
    aiSuggested: true,
    validationRules: field?.validationRules ?? (field?.fieldType === 'inventory_parts' ? { source: 'inventory_items', multiple: true } : null),
    options: field?.options ?? null,
  };
}

function fallbackTemplateFields(documentType: string) {
  const baseFields = [
    { fieldName: 'completed_by', fieldLabel: 'Completed By', fieldType: 'signature', isRequired: true, sectionName: 'Completion', sortOrder: 0 },
    { fieldName: 'completed_at', fieldLabel: 'Completed Date', fieldType: 'date', isRequired: true, sectionName: 'Completion', sortOrder: 1 },
    { fieldName: 'revision', fieldLabel: 'Revision', fieldType: 'text', isRequired: false, sectionName: 'Document Control', sortOrder: 2 },
    { fieldName: 'notes', fieldLabel: 'Notes', fieldType: 'text', isRequired: false, sectionName: 'Notes', sortOrder: 3 },
  ];

  if (documentType.includes('inspection') || documentType.includes('quality')) {
    baseFields.splice(2, 0, { fieldName: 'inspection_result', fieldLabel: 'Inspection Result', fieldType: 'text', isRequired: true, sectionName: 'Quality', sortOrder: 2 });
  }

  return baseFields.map(normalizeTemplateField);
}

function buildSpecSheetTemplateFields(sheet: any) {
  const specifications = sheet.specifications && typeof sheet.specifications === 'object' ? sheet.specifications : {};
  const fieldValues = specifications.fieldValues && typeof specifications.fieldValues === 'object'
    ? specifications.fieldValues
    : specifications;
  const seededFields = [
    { fieldName: 'partNumber', fieldLabel: 'Part Number', fieldType: 'text', sectionName: 'Header', isRequired: true, defaultValue: sheet.part_number ?? sheet.partNumber ?? '' },
    { fieldName: 'title', fieldLabel: 'Spec Sheet Title', fieldType: 'text', sectionName: 'Header', isRequired: true, defaultValue: sheet.title ?? '' },
  ];

  const valueFields = Object.entries(fieldValues)
    .filter(([key]) => !['templateId', 'templateName', 'manufacturedPart', 'controlledDocumentNumber'].includes(key))
    .map(([key, value], index) => {
      const displayValue = Array.isArray(value) ? value.join('\n') : value == null ? '' : String(value);
      return {
        fieldName: key,
        fieldLabel: key.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (match) => match.toUpperCase()),
        fieldType: displayValue.includes('\n') || displayValue.length > 80 ? 'textarea' : 'text',
        sectionName: key === 'partNumber' || key === 'partName' || key === 'sku' ? 'Header' : 'Spec Sheet',
        isRequired: false,
        defaultValue: displayValue,
        sortOrder: index + seededFields.length,
      };
    });

  const merged = [...seededFields, ...valueFields].filter((field, index, fields) =>
    fields.findIndex((candidate) => candidate.fieldName === field.fieldName) === index
  );
  return merged.map(normalizeTemplateField);
}

function buildFallbackDocumentAnalysis(title: string, textContent: string, documentType = 'work_instruction') {
  const lines = textContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const likelyFields = [
    { key: 'partNumber', label: 'Part Number', pattern: /\b(?:part\s*#|part\s*number|p\/n)\s*:?\s*([A-Z0-9._-]+)/i },
    { key: 'sku', label: 'SKU #', pattern: /\bsku\s*#?\s*:?\s*([A-Z0-9._-]+)/i },
    { key: 'revision', label: 'Revision', pattern: /\b(?:rev|revision)\s*:?\s*([A-Z0-9._-]+)/i },
  ];
  const dataFields = likelyFields.map((field, index) => {
    const match = textContent.match(field.pattern);
    return normalizeTemplateField({
      fieldName: field.key,
      fieldLabel: field.label,
      fieldType: 'text',
      sectionName: 'Header',
      defaultValue: match?.[1] || '',
      sortOrder: index,
    });
  });
  dataFields.push(normalizeTemplateField({
    fieldName: 'documentNotes',
    fieldLabel: 'Document Notes',
    fieldType: 'textarea',
    sectionName: 'Document',
    defaultValue: lines.slice(0, 30).join('\n'),
    sortOrder: dataFields.length,
  }));

  return {
    documentType,
    title,
    summary: lines.slice(0, 8).join(' '),
    routingSteps: [],
    dataFields,
    qualityChecks: [],
    materials: [],
    source: 'fallback_text_analysis',
  };
}

async function generateControlledTemplateNumber() {
  const year = new Date().getFullYear();
  const prefix = `${CONTROLLED_TEMPLATE_PREFIX}-${year}-`;
  const result = await db.execute(sql`
    SELECT document_number
    FROM controlled_documents
    WHERE document_number LIKE ${`${prefix}%`}
    ORDER BY document_number DESC
    LIMIT 1
  `);
  const rows = ((result as any)?.rows || result || []) as any[];
  const lastSequence = rows
    .map((row) => Number(String(row.document_number || '').replace(prefix, '')))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0] || 0;

  return `${prefix}${String(lastSequence + 1).padStart(3, '0')}`;
}

async function saveControlledDocumentFile(fileName: string, fileBuffer: Buffer) {
  const storedFileName = sanitizeFileName(fileName);
  return getFileStorageProvider().uploadBuffer({
    fileName: storedFileName,
    contentType: 'application/pdf',
    scope: 'controlled-documents',
    buffer: fileBuffer,
  });
}

function humanizeDocumentType(value: string) {
  return String(value || 'Document')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function stringifyGeneratedSection(section: any) {
  if (!section || typeof section !== 'object') return String(section ?? '');
  const fields = Array.isArray(section.fields) && section.fields.length > 0
    ? `\nFields: ${section.fields.map((field: any) => field.fieldLabel || field.fieldName).filter(Boolean).join(', ')}`
    : '';
  return `${section.name || 'Section'}\n${section.content || section.description || ''}${fields}`;
}

function wrapPdfText(text: string, maxChars = 92) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > maxChars) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = (line ? `${line} ` : '') + word;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [''];
}

async function createGeneratedControlledPdf(params: {
  title: string;
  documentType: string;
  partNumber: string;
  partName?: string | null;
  documentNumber: string;
  generatedContent: any;
}) {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const margin = 48;
  let y = 744;

  const addPageIfNeeded = (height = 16) => {
    if (y - height < 64) {
      page = pdfDoc.addPage([612, 792]);
      y = 744;
    }
  };
  const drawLine = (text: string, options: { size?: number; bold?: boolean; color?: any; gap?: number } = {}) => {
    addPageIfNeeded(options.gap ?? 16);
    page.drawText(text.substring(0, 120), {
      x: margin,
      y,
      size: options.size ?? 10,
      font: options.bold ? boldFont : font,
      color: options.color ?? rgb(0.12, 0.12, 0.12),
    });
    y -= options.gap ?? 16;
  };
  const drawWrapped = (text: string, options: { size?: number; bold?: boolean; gap?: number } = {}) => {
    for (const line of wrapPdfText(text, options.size && options.size > 11 ? 76 : 92)) {
      drawLine(line, options);
    }
  };

  drawWrapped(params.title, { size: 18, bold: true, gap: 22 });
  drawLine(`${params.documentNumber} | ${humanizeDocumentType(params.documentType)}`, { size: 10, bold: true, color: rgb(0.32, 0.32, 0.32) });
  drawLine(`Part / Source: ${params.partNumber}${params.partName ? ` - ${params.partName}` : ''}`, { size: 10 });
  drawLine(`Generated: ${new Date().toLocaleDateString()}`, { size: 9, color: rgb(0.42, 0.42, 0.42), gap: 24 });

  const sections = Array.isArray(params.generatedContent?.sections) ? params.generatedContent.sections : [];
  if (sections.length > 0) {
    sections.forEach((section: any, index: number) => {
      drawLine(`${index + 1}. ${section?.name || 'Section'}`, { size: 12, bold: true, gap: 18 });
      drawWrapped(section?.content || section?.description || stringifyGeneratedSection(section), { size: 10 });
      y -= 6;
    });
  } else {
    drawWrapped(JSON.stringify(params.generatedContent, null, 2), { size: 9 });
  }

  pdfDoc.getPages().forEach((pdfPage) => {
    pdfPage.drawText(`Doc #: ${params.documentNumber} | Version: 1.0 | Date: ${new Date().toLocaleDateString()}`, {
      x: margin,
      y: 28,
      size: 8,
      font,
      color: rgb(0.42, 0.42, 0.42),
    });
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

async function generateSpecSheetDocumentNumber() {
  const year = new Date().getFullYear();
  const prefix = `SPEC-${year}-`;
  const result = await db.execute(sql`
    SELECT document_number
    FROM controlled_documents
    WHERE document_number LIKE ${`${prefix}%`}
    ORDER BY document_number DESC
    LIMIT 1
  `);
  const rows = ((result as any)?.rows || result || []) as any[];
  const lastSequence = rows
    .map((row) => Number(String(row.document_number || '').replace(prefix, '')))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0] || 0;

  return `${prefix}${String(lastSequence + 1).padStart(3, '0')}`;
}

function normalizeSpecSheetFileName(title: string, partNumber: string | null | undefined) {
  const base = `${partNumber || 'spec-sheet'}-${title || 'spec-sheet'}`
    .replace(/[^a-z0-9-_ ]/gi, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 100) || 'spec-sheet';
  return `${base}-${Date.now()}.pdf`;
}

async function renderSpecSheetPdf(input: {
  title: string;
  sku?: string | null;
  partNumber?: string | null;
  partName?: string | null;
  manufacturedPart?: any;
  fieldValues: Record<string, any>;
  templateSections: any[];
  templateFields: any[];
  documentNumber: string;
}) {
  const PDFKitDocument = require('pdfkit');
  const doc = new PDFKitDocument({ margin: 36, size: 'LETTER' });
  const chunks: Buffer[] = [];

  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const writeLine = (label: string, value: any) => {
    doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
    doc.font('Helvetica').text(value ? String(value) : '-');
  };

  doc.font('Helvetica-Bold').fontSize(16).text(input.title, { width: pageWidth });
  doc.moveDown(0.4);
  doc.fontSize(9).font('Helvetica').text(`Controlled Doc #: ${input.documentNumber}`);
  doc.moveDown(0.8);
  writeLine('SKU #', input.sku);
  writeLine('Part #', input.partNumber);
  writeLine('Part Name', input.partName);
  if (input.manufacturedPart) {
    writeLine('Linked Manufactured Part', `${input.manufacturedPart.agPartNumber || input.manufacturedPart.id} - ${input.manufacturedPart.name || ''}`);
  }

  const sections = input.templateSections.length > 0
    ? input.templateSections
    : Array.from(new Set(input.templateFields.map((field) => field.sectionName).filter(Boolean))).map((name) => ({ name }));

  for (const section of sections) {
    const sectionName = section.name || section.sectionName || 'Section';
    const fields = input.templateFields.filter((field) => (field.sectionName || 'Section') === sectionName);
    if (fields.length === 0) continue;

    doc.moveDown(0.9);
    doc.font('Helvetica-Bold').fontSize(12).text(sectionName, { underline: true });
    doc.moveDown(0.25);

    for (const field of fields) {
      const rawValue = input.fieldValues[field.fieldName] ?? field.defaultValue ?? '';
      const value = Array.isArray(rawValue) ? rawValue.join('\n') : String(rawValue || '');
      doc.font('Helvetica-Bold').fontSize(9).text(field.fieldLabel || field.fieldName);
      doc.font('Helvetica').fontSize(9).text(value || '-', { width: pageWidth, lineGap: 2 });
      doc.moveDown(0.35);
    }
  }

  doc.moveDown(1);
  doc.fontSize(8).fillColor('gray').text(`Generated by Form & Document Builder on ${new Date().toLocaleDateString()}`);
  doc.end();
  const generatedPdf = await finished;
  const controlledPdf = await PDFDocument.load(generatedPdf);
  const footerFont = await controlledPdf.embedFont(StandardFonts.Helvetica);
  const footerDate = new Date().toLocaleDateString('en-US');
  const footerText = `Doc #: ${input.documentNumber} | Revision: 1.0 | Date: ${footerDate} | Configuration Controlled`;

  for (const page of controlledPdf.getPages()) {
    const { width } = page.getSize();
    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height: 24,
      color: rgb(1, 1, 1),
      opacity: 0.92,
    });
    page.drawLine({
      start: { x: 36, y: 24 },
      end: { x: width - 36, y: 24 },
      thickness: 0.5,
      color: rgb(0.72, 0.72, 0.72),
    });
    page.drawText(footerText, {
      x: 36,
      y: 8,
      size: 8,
      font: footerFont,
      color: rgb(0.2, 0.2, 0.2),
    });
  }

  return Buffer.from(await controlledPdf.save());
}

async function saveSpecSheetPdfFile(fileName: string, fileBuffer: Buffer) {
  const storedFileName = normalizeSpecSheetFileName(fileName, null);
  return saveControlledDocumentFile(storedFileName, fileBuffer);
}

async function saveGeneratedTemplatePdf(fileName: string, fileBuffer: Buffer) {
  try {
    const fileUrl = await saveSpecSheetPdfFile(fileName, fileBuffer);
    return { fileUrl, storagePath: fileUrl, storageWarning: null };
  } catch (error) {
    const { reason, message } = getStorageErrorResponse(error);
    const storedFileName = sanitizeFileName(fileName);
    const relativePath = path.posix.join('uploads', 'media-library', storedFileName);
    const absoluteDirectory = path.join(process.cwd(), 'uploads', 'media-library');
    await fs.promises.mkdir(absoluteDirectory, { recursive: true });
    await fs.promises.writeFile(path.join(absoluteDirectory, storedFileName), fileBuffer);
    console.warn('Generated template PDF used central-storage local fallback', {
      fileName: storedFileName,
      reason,
      message,
    });
    return {
      fileUrl: `/api/media/file/${encodeURIComponent(storedFileName)}`,
      storagePath: relativePath,
      storageWarning: message,
    };
  }
}

// Helper to format UUID bytes to string if needed
function formatUuid(value: any): string {
  if (!value) return '';
  // If it's a proper UUID string (with dashes), return it
  if (typeof value === 'string' && value.includes('-') && value.length === 36) {
    return value;
  }
  // If it's a comma-separated byte string like "111,95,164,137,..."
  if (typeof value === 'string' && value.includes(',')) {
    const byteArray = value.split(',').map(b => parseInt(b.trim(), 10));
    if (byteArray.length === 16) {
      const bytes = Buffer.from(byteArray);
      const hex = bytes.toString('hex');
      return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    }
  }
  // If it's a Buffer or byte array, convert to UUID format
  if (Buffer.isBuffer(value) || (Array.isArray(value) && value.length === 16)) {
    const bytes = Buffer.from(value);
    const hex = bytes.toString('hex');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  return String(value);
}

// Transform row UUIDs to string format
function transformRow(row: any): any {
  if (!row) return row;
  const transformed = { ...row };
  if (transformed.id) transformed.id = formatUuid(transformed.id);
  if (transformed.template_id) transformed.template_id = formatUuid(transformed.template_id);
  if (transformed.document_id) transformed.document_id = formatUuid(transformed.document_id);
  if (transformed.part_id) transformed.part_id = formatUuid(transformed.part_id);
  return transformed;
}

// Lazy initialization of OpenAI client - only created when needed
let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY or configure the AI integration.');
    }
    openaiClient = new OpenAI({
      apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return openaiClient;
}

const COMPOSITE_ANALYSIS_PROMPT = `You are an expert composite manufacturing document analyzer. Your job is to EXTRACT information that is ACTUALLY PRESENT in the document text provided. You specialize in composite layup, mold creation, and production processes used in firearms stock and component manufacturing.

CRITICAL RULES:
1. ONLY extract information that is EXPLICITLY stated in the document text. Do NOT invent, hallucinate, or fill in generic/assumed information.
2. Use the EXACT part numbers, material names, temperatures, tolerances, dimensions, and specifications from the document.
3. If the document mentions specific part numbers (e.g., "301j", "542f", "440"), include them exactly as written.
4. If the document specifies exact temperatures (e.g., "335°F"), use those exact values — do NOT substitute generic values.
5. If the document references specific standards (e.g., "ASTM D2563-08(2015)"), include them exactly.
6. If a field is not mentioned in the document, do NOT include it. Omit it entirely rather than guessing.
7. Preserve the document's own section names and structure (e.g., "Mandrel Preparation", "Lay Up Schedule", "Cello Wrap Schedule", "Oven Processes", "In-Process Inspection", "Final QC").

You understand composite manufacturing concepts:
- Layup processes, ply schedules with specific part numbers and quantities
- Mold/mandrel preparation steps
- Curing/oven processes with specific temperatures and times
- Quality inspections with tolerance levels and ASTM standards
- Dimensional measurements with specific Go/No-Go values
- Wrapping/bagging steps
- Material traceability (lot numbers, serial numbers)

When analyzing documents, map operations to these standard departments when applicable: Layup, Assemble/Disassembly, Trim, Paint, Quality Control, CNC, Finish, Bonding, Prep, Mold Prep, Oven/Cure, Cello Wrap.

For each routing step, include:
- The EXACT description from the document including part numbers and quantities
- The specific materials and their part numbers as listed
- Any dimensional requirements exactly as specified

For quality checkpoints, include:
- The EXACT tolerance values from the document (e.g., "+/- .005", "Level I, none", "Go/No Go")
- The EXACT requirement values (e.g., "11.891-11.901", ">/= 96\"")
- The specific ASTM or other standards referenced
- The specific inspection method described

`;

const COMPOSITE_ANALYSIS_JSON_SCHEMA = `Return a JSON object with the following structure. ONLY include sections and fields that are ACTUALLY PRESENT in the document:
{
  "routingSteps": [{"stepNumber": 1, "department": "string", "operation": "string", "description": "string - use EXACT text from document including part numbers, quantities, and dimensions"}],
  "layupSchedule": [{"plyNumber": "number or string", "partNumber": "string - exact part number from document", "quantity": number, "description": "string - exact description from document including dimensions"}],
  "dataFields": [{"fieldName": "string", "fieldLabel": "string", "fieldType": "text|number|date|signature|barcode|checkbox", "isRequired": boolean, "isUniquePerSerial": boolean, "department": "string", "unit": "string or null"}],
  "qualityCheckpoints": [{"checkpoint": "string", "standard": "string - exact standard from document (e.g. ASTM D2563-08(2015))", "tolerance": "string - exact tolerance from document", "requirement": "string - exact requirement value from document", "department": "string", "inspectionMethod": "string or null"}],
  "certificationRequirements": [{"certification": "string", "department": "string", "task": "string"}],
  "specialProcesses": [{"process": "string", "requirements": "string", "department": "string", "processParameters": "string or null"}],
  "materialRequirements": [{"material": "string - exact name from document", "partNumber": "string or null - exact part number if listed", "specification": "string - exact spec from document", "department": "string", "traceabilityRequired": boolean}],
  "curingParameters": [{"step": "string", "temperature": "string - exact temp from document", "time": "string - exact time from document", "vacuumPressure": "string or null", "rampRate": "string or null", "department": "string", "tolerance": "string or null - exact tolerance if specified"}]
}

CRITICAL EXTRACTION RULES:
- Extract ONLY what is written in the document. Do NOT add generic or assumed information.
- Use the EXACT part numbers as they appear (e.g., "301j", "542f", "542k", "440", "485", "486").
- Use the EXACT temperatures, times, and tolerances (e.g., "335°F", "105 mins", "+/- .005", "+/- 15°F").
- Use the EXACT dimensional requirements (e.g., "11.780", "11.891-11.901", ">/= 96\"").
- Use the EXACT standards referenced (e.g., "ASTM D2563-08(2015)").
- Use the EXACT tolerance levels as described (e.g., "Level I, none", "Level III, 1/32\" & <50", "Go/No Go").
- For layup schedules, include EVERY ply listed with its exact part number, quantity, and description.
- For quality checkpoints, include the EXACT tolerance, requirement value, and standard — do not generalize.
- Map departments to standard names when clear: Layup, Mold Prep, Oven/Cure, Quality Control, Cello Wrap, Trim, etc.
- If the document has sections like "Mandrel Preparation", "Lay Up Schedule", "Cello Wrap Schedule", "Oven Processes", "In-Process Inspection", "Final QC" — create routing steps that match these exact sections.
- Include signature fields where the document shows signature lines (e.g., "In-Process Verification Signature", "Approved to Ship Signature").`;

// Get all routing documents
router.get('/', async (req: Request, res: Response) => {
  try {
    const { partNumber, departmentName, documentType, isTemplate } = req.query;
    
    // Use raw SQL template to avoid Neon HTTP driver issues with empty tables
    const results = await db.execute(sql`SELECT * FROM routing_documents WHERE is_active = true ORDER BY created_at DESC`);
    
    // Extract rows from the raw result and transform UUIDs
    const rows = (results as any)?.rows || results || [];
    const transformed = Array.isArray(rows) ? rows.map(transformRow) : [];
    res.json(transformed);
  } catch (error: any) {
    console.error('Error fetching routing documents:', error);
    // Return empty array on error (for new/empty tables)
    res.json([]);
  }
});

// Spec Sheets endpoints - MUST be before /:id to avoid route matching issues
router.get('/spec-sheets', async (req: Request, res: Response) => {
  try {
    const results = await db.execute(sql`SELECT * FROM spec_sheets WHERE is_active = true ORDER BY created_at DESC`);
    const rows = (results as any)?.rows || results || [];
    const transformed = Array.isArray(rows) ? rows.map(transformRow) : [];
    res.json(transformed);
  } catch (error) {
    console.error('Error fetching spec sheets:', error);
    res.json([]);
  }
});

// Get all templates - MUST be before /:id
router.get('/templates/list', async (req: Request, res: Response) => {
  try {
    const results = await db.execute(sql`SELECT * FROM document_templates WHERE is_active = true ORDER BY created_at DESC`);
    const rows = (results as any)?.rows || results || [];
    const transformed = Array.isArray(rows) ? rows.map(transformRow) : [];
    res.json(transformed);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.json([]);
  }
});

// Get template with fields - MUST be before /:id
router.get('/templates/:templateId', async (req: Request, res: Response) => {
  try {
    const templateResults = await db.execute(sql`SELECT * FROM document_templates WHERE id = ${req.params.templateId} LIMIT 1`);
    const templates = (templateResults as any)?.rows || templateResults || [];
    const template = templates[0];
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    const fieldResults = await db.execute(sql`SELECT * FROM template_fields WHERE template_id = ${req.params.templateId} ORDER BY sort_order ASC`);
    const fields = (fieldResults as any)?.rows || fieldResults || [];
    
    res.json({ template, fields: Array.isArray(fields) ? fields : [] });
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// Document Distribution Logs - MUST be before /:id
router.get('/distribution-logs', async (req: Request, res: Response) => {
  try {
    const { poId, departmentName } = req.query;
    
    let results;
    if (poId && departmentName) {
      const parsedPoId = Number(poId);
      if (isNaN(parsedPoId)) {
        return res.status(400).json({ error: 'Invalid PO ID' });
      }
      results = await db.execute(sql`SELECT * FROM document_distribution_logs WHERE po_id = ${parsedPoId} AND department_name = ${String(departmentName)} ORDER BY printed_at DESC LIMIT 100`);
    } else if (poId) {
      const parsedPoId = Number(poId);
      if (isNaN(parsedPoId)) {
        return res.status(400).json({ error: 'Invalid PO ID' });
      }
      results = await db.execute(sql`SELECT * FROM document_distribution_logs WHERE po_id = ${parsedPoId} ORDER BY printed_at DESC LIMIT 100`);
    } else if (departmentName) {
      results = await db.execute(sql`SELECT * FROM document_distribution_logs WHERE department_name = ${String(departmentName)} ORDER BY printed_at DESC LIMIT 100`);
    } else {
      results = await db.execute(sql`SELECT * FROM document_distribution_logs ORDER BY printed_at DESC LIMIT 100`);
    }
    
    const rows = (results as any)?.rows || results || [];
    res.json(Array.isArray(rows) ? rows : []);
  } catch (error) {
    console.error('Error fetching distribution logs:', error);
    res.json([]);
  }
});

// Routing document links by routing ID - MUST be before /:id
router.get('/routing-links/:partRoutingId', async (req: Request, res: Response) => {
  try {
    const results = await db.execute(sql`SELECT * FROM routing_document_links WHERE part_routing_id = ${req.params.partRoutingId} ORDER BY sort_order ASC`);
    const links = (results as any)?.rows || results || [];
    
    // Get the actual documents
    const enrichedLinks = await Promise.all(links.map(async (link: any) => {
      let document = null;
      try {
        if (link.document_type !== 'spec_sheet') {
          const docResult = await db.execute(sql`SELECT * FROM routing_documents WHERE id = ${link.document_id} LIMIT 1`);
          const docRows = (docResult as any)?.rows || docResult || [];
          document = docRows[0] || null;
        } else if (link.document_type === 'spec_sheet') {
          const docResult = await db.execute(sql`SELECT * FROM spec_sheets WHERE id = ${link.document_id} LIMIT 1`);
          const docRows = (docResult as any)?.rows || docResult || [];
          document = docRows[0] || null;
        }
      } catch (e) {
        console.warn('Error fetching linked document:', e);
      }
      return { ...link, document };
    }));
    
    res.json(enrichedLinks);
  } catch (error) {
    console.error('Error fetching routing document links:', error);
    res.json([]);
  }
});

// Certification task links - MUST be before /:id
router.get('/certification-links/:certificationId', async (req: Request, res: Response) => {
  try {
    const certId = Number(req.params.certificationId);
    if (isNaN(certId)) {
      return res.status(400).json({ error: 'Invalid certification ID' });
    }
    const results = await db.execute(sql`SELECT * FROM certification_task_links WHERE certification_id = ${certId}`);
    const rows = (results as any)?.rows || results || [];
    res.json(Array.isArray(rows) ? rows : []);
  } catch (error) {
    console.error('Error fetching certification task links:', error);
    res.json([]);
  }
});

router.get('/:id/sections', async (req: Request, res: Response) => {
  try {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid document ID format' });
    }

    const results = await db.execute(sql`SELECT id, title, file_name, file_url, file_type, ai_extracted_content, description FROM routing_documents WHERE id = ${req.params.id} LIMIT 1`);
    const rows = (results as any)?.rows || results || [];
    const document = rows[0];

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const sections: { id: string; title: string; content: string; startIndex: number }[] = [];
    let fullText = '';

    if (document.ai_extracted_content) {
      const rawContent = document.ai_extracted_content;
      const isStructuredJson = typeof rawContent === 'object' && rawContent !== null && !Array.isArray(rawContent) &&
        (rawContent.routingSteps || rawContent.dataFields || rawContent.qualityCheckpoints || rawContent.specialProcesses || rawContent.certificationRequirements || rawContent.layupSchedule || rawContent.curingParameters || rawContent.materialRequirements || rawContent.materialsConfig || rawContent.qcStandards || rawContent.customFields || rawContent.specialProcessConfig);

      if (isStructuredJson) {
        const parts: string[] = [];

        if (rawContent.routingSteps && rawContent.routingSteps.length > 0) {
          const stepsContent = rawContent.routingSteps.map((s: any) =>
            `Step ${s.stepNumber}: ${s.department || ''} - ${s.operation || ''}\n${s.description || ''}`
          ).join('\n\n');
          sections.push({ id: `section-${sections.length}`, title: `Routing Steps (${rawContent.routingSteps.length})`, content: stepsContent.trim(), startIndex: 0 });
          parts.push(`## Routing Steps\n${stepsContent}`);
        }

        if (rawContent.dataFields && rawContent.dataFields.length > 0) {
          const fieldsContent = rawContent.dataFields.map((f: any) =>
            `${f.fieldLabel || f.fieldName}: ${f.fieldType || 'text'}${f.isRequired ? ' (Required)' : ''}${f.department ? ` [${f.department}]` : ''}`
          ).join('\n');
          sections.push({ id: `section-${sections.length}`, title: `Data Fields (${rawContent.dataFields.length})`, content: fieldsContent.trim(), startIndex: 0 });
          parts.push(`## Data Fields\n${fieldsContent}`);
        }

        if (rawContent.qualityCheckpoints && rawContent.qualityCheckpoints.length > 0) {
          const qcContent = rawContent.qualityCheckpoints.map((q: any) =>
            `${q.checkpoint}: Standard: ${q.standard || 'N/A'}, Tolerance: ${q.tolerance || 'N/A'}${q.department ? ` [${q.department}]` : ''}`
          ).join('\n');
          sections.push({ id: `section-${sections.length}`, title: `Quality Checkpoints (${rawContent.qualityCheckpoints.length})`, content: qcContent.trim(), startIndex: 0 });
          parts.push(`## Quality Checkpoints\n${qcContent}`);
        }

        if (rawContent.specialProcesses && rawContent.specialProcesses.length > 0) {
          const spContent = rawContent.specialProcesses.map((s: any) =>
            `${s.process}: ${s.requirements || ''}${s.department ? ` [${s.department}]` : ''}`
          ).join('\n');
          sections.push({ id: `section-${sections.length}`, title: `Special Processes (${rawContent.specialProcesses.length})`, content: spContent.trim(), startIndex: 0 });
          parts.push(`## Special Processes\n${spContent}`);
        }

        if (rawContent.certificationRequirements && rawContent.certificationRequirements.length > 0) {
          const certContent = rawContent.certificationRequirements.map((c: any) =>
            `${c.certification}: ${c.task || ''}${c.department ? ` [${c.department}]` : ''}`
          ).join('\n');
          sections.push({ id: `section-${sections.length}`, title: `Certification Requirements (${rawContent.certificationRequirements.length})`, content: certContent.trim(), startIndex: 0 });
          parts.push(`## Certification Requirements\n${certContent}`);
        }

        if (rawContent.layupSchedule && Array.isArray(rawContent.layupSchedule) && rawContent.layupSchedule.length > 0) {
          const layupContent = rawContent.layupSchedule.map((l: any, i: number) =>
            `Layer ${l.layer || l.layerNumber || (i + 1)}: ${l.material || l.materialType || ''} - ${l.orientation || ''} ${l.notes ? `(${l.notes})` : ''}`
          ).join('\n');
          sections.push({ id: `section-${sections.length}`, title: `Layup Schedule (${rawContent.layupSchedule.length} layers)`, content: layupContent.trim(), startIndex: 0 });
          parts.push(`## Layup Schedule\n${layupContent}`);
        }

        if (rawContent.curingParameters) {
          const cp = rawContent.curingParameters;
          const curingContent = typeof cp === 'string' ? cp : Object.entries(cp).map(([k, v]: [string, any]) =>
            `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`
          ).join('\n');
          if (curingContent.trim()) {
            sections.push({ id: `section-${sections.length}`, title: 'Curing Parameters', content: curingContent.trim(), startIndex: 0 });
            parts.push(`## Curing Parameters\n${curingContent}`);
          }
        }

        if (rawContent.materialRequirements && Array.isArray(rawContent.materialRequirements) && rawContent.materialRequirements.length > 0) {
          const matContent = rawContent.materialRequirements.map((m: any) =>
            `${m.material || m.name || m.partNumber || 'Material'}: ${m.quantity || ''} ${m.unit || ''} ${m.specification ? `- Spec: ${m.specification}` : ''}`
          ).join('\n');
          sections.push({ id: `section-${sections.length}`, title: `Material Requirements (${rawContent.materialRequirements.length})`, content: matContent.trim(), startIndex: 0 });
          parts.push(`## Material Requirements\n${matContent}`);
        }

        if (rawContent.materialsConfig && typeof rawContent.materialsConfig === 'object') {
          const mcContent = Object.entries(rawContent.materialsConfig).map(([k, v]: [string, any]) =>
            `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`
          ).join('\n');
          if (mcContent.trim()) {
            sections.push({ id: `section-${sections.length}`, title: 'Materials Configuration', content: mcContent.trim(), startIndex: 0 });
            parts.push(`## Materials Configuration\n${mcContent}`);
          }
        }

        if (rawContent.qcStandards && typeof rawContent.qcStandards === 'object') {
          const qcsContent = typeof rawContent.qcStandards === 'string' ? rawContent.qcStandards : Object.entries(rawContent.qcStandards).map(([k, v]: [string, any]) =>
            `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`
          ).join('\n');
          if (qcsContent.trim()) {
            sections.push({ id: `section-${sections.length}`, title: 'QC Standards', content: qcsContent.trim(), startIndex: 0 });
            parts.push(`## QC Standards\n${qcsContent}`);
          }
        }

        if (rawContent.specialProcessConfig && typeof rawContent.specialProcessConfig === 'object') {
          const spcContent = Object.entries(rawContent.specialProcessConfig).map(([k, v]: [string, any]) =>
            `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`
          ).join('\n');
          if (spcContent.trim()) {
            sections.push({ id: `section-${sections.length}`, title: 'Special Process Configuration', content: spcContent.trim(), startIndex: 0 });
            parts.push(`## Special Process Configuration\n${spcContent}`);
          }
        }

        if (rawContent.customFields && typeof rawContent.customFields === 'object') {
          const cfEntries = Array.isArray(rawContent.customFields) ? rawContent.customFields : Object.entries(rawContent.customFields);
          if (cfEntries.length > 0) {
            const cfContent = Array.isArray(rawContent.customFields)
              ? rawContent.customFields.map((f: any) => `${f.label || f.name || f.key}: ${f.value || f.type || ''}`).join('\n')
              : Object.entries(rawContent.customFields).map(([k, v]: [string, any]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n');
            sections.push({ id: `section-${sections.length}`, title: 'Custom Fields', content: cfContent.trim(), startIndex: 0 });
            parts.push(`## Custom Fields\n${cfContent}`);
          }
        }

        fullText = parts.join('\n\n');
      } else {
        const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent, null, 2);
        fullText = content;
        const lines = content.split('\n');
        let currentSection: { title: string; content: string[]; startIndex: number } | null = null;
        let lineIndex = 0;

        for (const line of lines) {
          const headerMatch = line.match(/^#{1,3}\s+(.+)$/) ||
            line.match(/^([A-Z][A-Z\s/&-]{3,})\s*$/) ||
            line.match(/^\d+\.\s+([A-Z].{3,})$/);

          if (headerMatch) {
            if (currentSection && currentSection.content.length > 0) {
              sections.push({
                id: `section-${sections.length}`,
                title: currentSection.title,
                content: currentSection.content.join('\n').trim(),
                startIndex: currentSection.startIndex,
              });
            }
            currentSection = { title: headerMatch[1].trim(), content: [], startIndex: lineIndex };
          } else if (currentSection) {
            currentSection.content.push(line);
          } else if (line.trim()) {
            if (!currentSection) {
              currentSection = { title: 'Introduction', content: [line], startIndex: lineIndex };
            }
          }
          lineIndex++;
        }

        if (currentSection && currentSection.content.length > 0) {
          sections.push({
            id: `section-${sections.length}`,
            title: currentSection.title,
            content: currentSection.content.join('\n').trim(),
            startIndex: currentSection.startIndex,
          });
        }
      }
    }

    if (sections.length === 0 && document.file_url) {
      try {
        const fileBuffer = await getFileStorageProviderForObjectPath(document.file_url).downloadBuffer(document.file_url);
        let extractedText = '';

        const fileType = (document.file_type || document.file_name || '').toLowerCase();
        if (fileType.includes('pdf')) {
          extractedText = await extractPdfText(fileBuffer);
        } else if (fileType.match(/text|txt|md|csv|json|xml/)) {
          extractedText = fileBuffer.toString('utf-8');
        }

        if (extractedText.trim()) {
          fullText = extractedText;

          const lines = extractedText.split('\n');
          let currentSection: { title: string; content: string[]; startIndex: number } | null = null;
          let lineIndex = 0;

          for (const line of lines) {
            const headerMatch = line.match(/^#{1,3}\s+(.+)$/) ||
              line.match(/^([A-Z][A-Z\s/&-]{3,})\s*$/) ||
              line.match(/^\d+\.\s+([A-Z].{3,})$/);

            if (headerMatch) {
              if (currentSection && currentSection.content.length > 0) {
                sections.push({
                  id: `section-${sections.length}`,
                  title: currentSection.title,
                  content: currentSection.content.join('\n').trim(),
                  startIndex: currentSection.startIndex,
                });
              }
              currentSection = { title: headerMatch[1].trim(), content: [], startIndex: lineIndex };
            } else if (currentSection) {
              currentSection.content.push(line);
            } else if (line.trim()) {
              if (!currentSection) {
                currentSection = { title: 'Introduction', content: [line], startIndex: lineIndex };
              }
            }
            lineIndex++;
          }

          if (currentSection && currentSection.content.length > 0) {
            sections.push({
              id: `section-${sections.length}`,
              title: currentSection.title,
              content: currentSection.content.join('\n').trim(),
              startIndex: currentSection.startIndex,
            });
          }
        }
      } catch (fileErr) {
        console.warn('Could not fetch file from storage for section extraction:', fileErr);
      }
    }

    if (sections.length === 0 && fullText) {
      sections.push({
        id: 'section-0',
        title: 'Full Document',
        content: fullText,
        startIndex: 0,
      });
    }

    if (sections.length === 0 && document.description) {
      fullText = document.description;
      sections.push({
        id: 'section-0',
        title: 'Document Description',
        content: document.description,
        startIndex: 0,
      });
    }

    res.json({
      documentId: formatUuid(document.id),
      documentTitle: document.title || document.file_name,
      fullText,
      sections,
    });
  } catch (error) {
    console.error('Error fetching document sections:', error);
    res.status(500).json({ error: 'Failed to fetch document sections' });
  }
});

// Get single routing document - This MUST come after all other GET routes with path segments
router.get('/:id', async (req: Request, res: Response) => {
  try {
    // Validate UUID format to avoid invalid queries
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid document ID format' });
    }
    
    const results = await db.execute(sql`SELECT * FROM routing_documents WHERE id = ${req.params.id} LIMIT 1`);
    const rows = (results as any)?.rows || results || [];
    if (!rows.length) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching routing document:', error);
    res.status(500).json({ error: 'Failed to fetch routing document' });
  }
});

// Request upload URL for routing document
router.post('/request-upload-url', async (req: Request, res: Response) => {
  try {
    const { name, size, contentType } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Missing required field: name' });
    }
    
    try {
      const uploadTarget = await getFileStorageProvider().createUploadTarget({
        fileName: name,
        contentType,
        scope: 'routing-documents',
      });
      
      res.json({
        uploadURL: uploadTarget.uploadURL,
        objectPath: uploadTarget.objectPath,
        provider: uploadTarget.provider,
        metadata: { name, size, contentType },
      });
    } catch (storageError: any) {
      // Object Storage not available - provide alternative response
      console.warn('Object Storage unavailable, using metadata-only mode:', storageError.message);
      res.json({
        uploadURL: null,
        objectPath: null,
        metadata: { name, size, contentType },
        fallbackMode: true,
        message: 'File storage temporarily unavailable. Document will be created with metadata only.',
      });
    }
  } catch (error) {
    console.error('Error generating upload URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// Extract text from file (for AI analysis)
router.post('/extract-text', async (req: Request, res: Response) => {
  try {
    const { fileContent, fileName, mimeType } = req.body;
    
    if (!fileContent || !fileName) {
      return res.status(400).json({ error: 'File content and fileName are required' });
    }
    
    // Decode base64 file content
    const fileBuffer = Buffer.from(fileContent, 'base64');
    let extractedText = '';
    let fileUrl: string | null = null;

    if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
      fileUrl = await saveControlledDocumentFile(fileName, fileBuffer);
    }
    
    // Extract text based on file type
    if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
      extractedText = await extractPdfText(fileBuffer);
      console.log(`Extracted ${extractedText.length} characters from PDF: ${fileName}`);
    } else if (mimeType?.startsWith('text/') || fileName.match(/\.(txt|md|csv|json|xml)$/i)) {
      extractedText = fileBuffer.toString('utf-8');
    }
    
    res.json({
      extractedText,
      extractedLength: extractedText.length,
      fileName,
    });
  } catch (error) {
    console.error('Error extracting text:', error);
    res.status(500).json({ error: 'Failed to extract text from file' });
  }
});

// Extract text from a stored document by ID (for AI analysis of already-imported documents)
router.get('/:id/extract-stored-text', async (req: Request, res: Response) => {
  try {
    const results = await db.execute(sql`SELECT id, title, file_name, file_url, file_type, description, extracted_text, ai_extracted_content FROM routing_documents WHERE id = ${req.params.id} LIMIT 1`);
    const rows = (results as any)?.rows || results || [];
    const document = rows[0];

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    let extractedText = '';

    if (document.extracted_text && document.extracted_text.trim().length > 200 && 
        !document.extracted_text.startsWith('Imported from media library:')) {
      extractedText = document.extracted_text;
    }

    if (!extractedText.trim() && document.ai_extracted_content) {
      const content = typeof document.ai_extracted_content === 'string'
        ? JSON.parse(document.ai_extracted_content)
        : document.ai_extracted_content;
      if (content.fullText) {
        extractedText = content.fullText;
      }
    }

    if (!extractedText.trim() && document.file_url) {
      try {
        const fileBuffer = await resolveFileToBuffer(document.file_url);
        if (fileBuffer && fileBuffer.length > 0) {
          const fileType = (document.file_type || document.file_name || document.file_url || '').toLowerCase();
          if (fileType.includes('pdf')) {
            extractedText = await extractPdfText(fileBuffer);
          } else {
            extractedText = fileBuffer.toString('utf-8');
          }
          if (extractedText.trim().length > 50) {
            await db.execute(sql`UPDATE routing_documents SET extracted_text = ${extractedText} WHERE id = ${req.params.id}`);
            console.log(`[ExtractStoredText] Saved ${extractedText.length} chars for document ${req.params.id}`);
          }
        }
      } catch (dlError) {
        console.error('Error downloading stored file for text extraction:', dlError);
      }
    }

    if (!extractedText.trim() && document.description) {
      extractedText = document.description;
    }

    res.json({
      extractedText,
      extractedLength: extractedText.length,
      fileName: document.file_name || document.title,
      hasStoredFile: !!document.file_url,
    });
  } catch (error) {
    console.error('Error extracting text from stored document:', error);
    res.status(500).json({ error: 'Failed to extract text from stored document' });
  }
});

// Create document without file (metadata only)
router.post('/create', async (req: Request, res: Response) => {
  try {
    const { title, partNumber, departmentName, documentType, isTemplate, description } = req.body;
    const user = (req as any).user;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    const [document] = await db.insert(routingDocuments).values({
      title,
      partNumber: partNumber || null,
      departmentName: departmentName || null,
      documentType: documentType || 'work_instruction',
      sourceType: 'uploaded',
      description: description || null,
      isTemplate: isTemplate === true || isTemplate === 'true',
      createdBy: user?.username || 'system',
    }).returning();
    
    res.status(201).json(document);
  } catch (error) {
    console.error('Error creating document:', error);
    res.status(500).json({ error: 'Failed to create document' });
  }
});

// Upload file with content extraction - accepts base64 file content
router.post('/upload-with-extraction', async (req: Request, res: Response) => {
  try {
    const { fileContent, fileName, mimeType, title, partNumber, departmentName, documentType, isTemplate, autoAnalyze } = req.body;
    const user = (req as any).user;
    
    if (!fileContent || !fileName) {
      return res.status(400).json({ error: 'File content and fileName are required' });
    }
    
    // Decode base64 file content
    const fileBuffer = Buffer.from(fileContent, 'base64');
    let extractedText = '';
    let fileUrl: string | null = null;

    if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
      fileUrl = await saveControlledDocumentFile(fileName, fileBuffer);
    }
    
    // Extract text based on file type
    if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
      extractedText = await extractPdfText(fileBuffer);
      console.log(`Extracted ${extractedText.length} characters from PDF: ${fileName}`);
    } else if (mimeType?.startsWith('text/') || fileName.match(/\.(txt|md|csv|json|xml)$/i)) {
      extractedText = fileBuffer.toString('utf-8');
    }
    
    const [document] = await db.insert(routingDocuments).values({
      title: title || fileName,
      partNumber: partNumber || null,
      departmentName: departmentName || null,
      documentType: documentType || 'work_instruction',
      sourceType: 'uploaded',
      fileUrl,
      fileName: fileName,
      fileType: mimeType || 'application/octet-stream',
      fileSize: fileBuffer.length,
      extractedText: extractedText || null,
      description: extractedText ? `Extracted ${extractedText.length} characters from file` : `Original file: ${fileName}`,
      isTemplate: isTemplate === true || isTemplate === 'true',
      createdBy: user?.username || 'system',
    }).returning();
    
    // If autoAnalyze is true and we have extracted text, run AI analysis
    let aiResult = null;
    if (autoAnalyze && extractedText.trim()) {
      try {
        const systemPrompt = COMPOSITE_ANALYSIS_PROMPT + COMPOSITE_ANALYSIS_JSON_SCHEMA;

        const response = await getOpenAI().chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Analyze this composite manufacturing document and extract the routing information, paying close attention to layup sequences, cure cycles, material traceability, and quality inspection requirements:\n\n${extractedText.substring(0, 50000)}` }
          ],
          response_format: { type: 'json_object' },
          max_completion_tokens: 4096,
        });
        
        aiResult = JSON.parse(response.choices[0]?.message?.content || '{}');
        
        // Update document with AI extracted content
        await db.update(routingDocuments)
          .set({
            aiExtractedContent: aiResult,
            aiExtractedFields: aiResult.dataFields || [],
            aiProcessedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(routingDocuments.id, document.id));
      } catch (aiError) {
        console.error('Error during auto AI analysis:', aiError);
      }
    }
    
    res.status(201).json({
      document,
      fileUrl,
      extractedText: extractedText.substring(0, 1000) + (extractedText.length > 1000 ? '...' : ''),
      extractedLength: extractedText.length,
      aiAnalysis: aiResult,
    });
  } catch (error) {
    console.error('Error uploading document with extraction:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// Upload a PDF, turn it into a reusable fillable template, and register it in the Master Document Register
router.post('/upload-template-to-register', async (req: Request, res: Response) => {
  try {
    const { fileContent, fileName, mimeType, title, partNumber, departmentName, documentType } = req.body;
    const user = (req as any).user;

    if (!fileContent || !fileName) {
      return res.status(400).json({ error: 'File content and fileName are required' });
    }

    const isPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      return res.status(400).json({ error: 'Reusable controlled templates must be uploaded as PDF files' });
    }

    const fileBuffer = Buffer.from(fileContent, 'base64');
    const finalTitle = String(title || fileName.replace(/\.[^/.]+$/, '')).trim();
    const finalDocumentType = String(documentType || 'form_template').trim();
    const finalDepartment = String(departmentName || 'Quality').trim();
    const fileUrl = await saveControlledDocumentFile(fileName, fileBuffer);
    const extractedText = await extractPdfText(fileBuffer);

    let aiResult: any = null;
    if (extractedText.trim()) {
      try {
        const systemPrompt = COMPOSITE_ANALYSIS_PROMPT + COMPOSITE_ANALYSIS_JSON_SCHEMA;
        const response = await getOpenAI().chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Create a reusable fillable template from this controlled form or document. Extract only fields, sections, checks, signatures, and requirements that are visible in the source text.\n\nDocument Title: ${finalTitle}\n\nDOCUMENT TEXT:\n${extractedText.substring(0, 50000)}` }
          ],
          response_format: { type: 'json_object' },
          max_completion_tokens: 4096,
        });
        aiResult = JSON.parse(response.choices[0]?.message?.content || '{}');
      } catch (aiError) {
        console.error('[Registered Template Upload] AI analysis failed, creating fallback template:', aiError);
      }
    }

    const parsedFields = Array.isArray(aiResult?.dataFields) ? aiResult.dataFields : [];
    const normalizedFields = parsedFields.length > 0
      ? parsedFields.map(normalizeTemplateField)
      : fallbackTemplateFields(finalDocumentType);
    const templateSections = Array.isArray(aiResult?.routingSteps)
      ? aiResult.routingSteps.map((step: any, index: number) => ({
          name: step.department || step.operation || `Section ${index + 1}`,
          description: step.description || step.operation || '',
          order: Number(step.stepNumber) || index + 1,
        }))
      : Array.from(new Set(normalizedFields.map((field) => field.sectionName).filter(Boolean))).map((name, index) => ({
          name,
          description: '',
          order: index + 1,
        }));
    const documentNumber = await generateControlledTemplateNumber();
    const createdBy = user?.username || 'system';
    const expirationDate = new Date();
    expirationDate.setFullYear(expirationDate.getFullYear() + 1);

    const routingDocument = await insertPublicRowReturning('routing_documents', {
      title: finalTitle,
      part_number: partNumber || null,
      department_name: finalDepartment,
      document_type: finalDocumentType,
      source_type: 'uploaded',
      file_url: fileUrl,
      file_name: fileName,
      file_type: mimeType || 'application/pdf',
      file_size: fileBuffer.length,
      extracted_text: extractedText || null,
      ai_extracted_content: aiResult || null,
      ai_extracted_fields: normalizedFields,
      ai_processed_at: aiResult ? new Date() : null,
      description: `Reusable controlled template ${documentNumber}`,
      is_template: true,
      is_active: true,
      created_by: createdBy,
      created_at: new Date(),
      updated_at: new Date(),
    }, ['title', 'document_type']);

    const template = await insertPublicRowReturning('document_templates', {
      id: randomUUID(),
      template_name: finalTitle,
      template_type: finalDocumentType,
      description: `Controlled template ${documentNumber} created from ${fileName}`,
      source_document_ids: [routingDocument.id],
      learned_from_count: 1,
      structure: {
        source: 'pdf_upload',
        controlledDocumentNumber: documentNumber,
        sourceDocumentId: routingDocument.id,
        sourceFileName: fileName,
      },
      sections: templateSections,
      default_fields: normalizedFields,
      ai_generated_prompt: aiResult ? 'Generate a fillable form using the extracted controlled-template fields and source document structure.' : null,
      is_active: true,
      created_by: createdBy,
      created_at: new Date(),
      updated_at: new Date(),
    }, ['template_name', 'template_type']);

    for (const field of normalizedFields) {
      await insertPublicRowReturning('template_fields', {
        id: randomUUID(),
        template_id: template.id,
        field_name: field.fieldName,
        field_label: field.fieldLabel,
        field_type: field.fieldType || 'text',
        is_required: field.isRequired || false,
        is_unique_per_serial: field.isUniquePerSerial || false,
        default_value: field.defaultValue || null,
        validation_rules: field.validationRules || null,
        options: field.options || null,
        section_name: field.sectionName || null,
        sort_order: field.sortOrder ?? 0,
        ai_suggested: field.aiSuggested || false,
        created_at: new Date(),
      }, ['template_id', 'field_name', 'field_label', 'field_type']);
    }

    const controlledDocument = await insertPublicRowReturning('controlled_documents', {
      document_number: documentNumber,
      document_name: finalTitle,
      document_type: finalDocumentType,
      department: finalDepartment,
      category: 'Form & Document Builder Template',
      description: `Reusable fillable template created from uploaded PDF ${fileName}`,
      current_version: '1.0',
      status: 'pending',
      retention_length: 'controlled',
      document_owner: createdBy,
      file_path: fileUrl,
      created_by: createdBy,
      expiration_date: expirationDate.toISOString().split('T')[0],
      created_at: new Date(),
      updated_at: new Date(),
    }, ['document_number', 'document_name', 'document_type', 'department', 'current_version', 'status', 'created_by']);
    await insertPublicRowReturning('controlled_document_number_registry', {
      normalized_number: documentNumber.trim().toUpperCase(),
      display_number: documentNumber.trim(),
      controlled_document_id: controlledDocument.id,
      status: 'RESERVED',
      created_at: new Date(),
      updated_at: new Date(),
    }, ['normalized_number', 'display_number', 'controlled_document_id']);

    const controlledRevision = await insertPublicRowReturning('document_version_history', {
      document_id: controlledDocument.id,
      version_number: '1.0',
      revision_sequence: 1,
      lifecycle_status: 'DRAFT',
      change_description: 'Initial controlled template imported from Form & Document Builder',
      revision_reason: 'Initial controlled template imported from Form & Document Builder',
      change_type: 'major',
      file_path: fileUrl,
      file_name: fileName,
      media_type: mimeType || 'application/pdf',
      file_size: fileBuffer.length,
      file_checksum: createHash('sha256').update(fileBuffer).digest('hex'),
      checksum_status: 'VERIFIED',
      status: 'draft',
      created_by: createdBy,
      expiration_date: expirationDate.toISOString().split('T')[0],
      created_at: new Date(),
    }, ['document_id', 'version_number', 'status', 'created_by']);
    await db.execute(sql`
      UPDATE controlled_documents
      SET current_revision_id = ${controlledRevision.id},
          working_draft_revision_id = ${controlledRevision.id},
          lifecycle_status = 'DRAFT',
          status = 'draft'
      WHERE id = ${controlledDocument.id}
    `);

    res.status(201).json({
      document: routingDocument,
      template,
      controlledDocument,
      fields: normalizedFields,
      extractedLength: extractedText.length,
      aiAnalysis: aiResult,
      message: `Template registered as ${documentNumber}`,
    });
  } catch (error) {
    console.error('Error uploading registered template:', error);
    res.status(500).json({
      error: 'Failed to upload and register reusable template',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Import reference document from media library
router.post('/import-from-library', async (req: Request, res: Response) => {
  try {
    const { fileUrl, fileName, title, documentType, sourceType } = req.body;
    const user = (req as any).user;
    
    if (!fileUrl || !fileName) {
      return res.status(400).json({ error: 'File URL and file name are required' });
    }
    
    // Create the document linked to the media library file
    const [document] = await db.insert(routingDocuments).values({
      title: title || fileName.replace(/\.[^/.]+$/, ''),
      documentType: documentType || 'reference',
      sourceType: sourceType || 'media_library',
      fileName: fileName,
      fileUrl: fileUrl,
      description: `Imported from media library: ${fileName}`,
      isTemplate: false,
      createdBy: user?.username || 'system',
    }).returning();
    
    res.status(201).json({ 
      ...transformRow(document),
      message: 'Reference document imported successfully' 
    });
  } catch (error) {
    console.error('Error importing document from library:', error);
    res.status(500).json({ error: 'Failed to import document from library' });
  }
});

// Complete upload and create routing document
router.post('/complete-upload', async (req: Request, res: Response) => {
  try {
    const { objectPath, title, originalFileName, fileSize, mimeType, partRoutingId, partNumber, departmentName, documentType, isTemplate, sourceType } = req.body;
    const user = (req as any).user;
    
    if (!objectPath || !originalFileName) {
      return res.status(400).json({ error: 'Missing required fields: objectPath, originalFileName' });
    }
    
    // Validate sourceType
    const validSourceTypes = ['uploaded', 'generated', 'imported'];
    const finalSourceType = validSourceTypes.includes(sourceType) ? sourceType : 'uploaded';
    
    // Set ACL policy to make file accessible
    try {
      await getFileStorageProviderForObjectPath(objectPath).setPublicReadPolicy(
        objectPath,
        user?.id?.toString() || 'system',
      );
    } catch (aclError) {
      console.warn('Failed to set ACL policy for routing document:', aclError);
    }
    
    const [document] = await db.insert(routingDocuments).values({
      title: title || originalFileName,
      partRoutingId: partRoutingId || null,
      partNumber: partNumber || null,
      departmentName: departmentName || null,
      documentType: documentType || 'work_instruction',
      sourceType: finalSourceType,
      fileUrl: objectPath,
      fileName: originalFileName,
      fileType: mimeType || 'application/octet-stream',
      fileSize: fileSize || 0,
      isTemplate: isTemplate === true || isTemplate === 'true',
      createdBy: user?.username || 'system',
    }).returning();
    
    res.status(201).json(document);
  } catch (error) {
    console.error('Error completing routing document upload:', error);
    res.status(500).json({ error: 'Failed to complete document upload' });
  }
});

// AI Parse document to extract routing information
router.post('/:id/ai-parse', async (req: Request, res: Response) => {
  try {
    const results = await db.execute(sql`SELECT * FROM routing_documents WHERE id = ${req.params.id} LIMIT 1`);
    const rows = (results as any)?.rows || results || [];
    const document = rows[0];
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    let textContent = req.body.textContent || '';
    
    if (!textContent.trim() && document.extracted_text) {
      const isPlaceholder = document.extracted_text.startsWith('Imported from media library:') || 
                            document.extracted_text.length < 200;
      if (!isPlaceholder) {
        textContent = document.extracted_text;
        console.log(`[AI Parse] Using stored extracted text (${textContent.length} chars) for document: ${document.title}`);
      }
    }
    
    if (!textContent.trim() && document.file_url) {
      console.log(`[AI Parse] No usable text stored. Attempting PDF extraction from file: ${document.file_url}`);
      try {
        let fileBuffer = await resolveFileToBuffer(document.file_url);
        
        if (!fileBuffer && document.file_url.startsWith('/api/media/file/')) {
          const filename = document.file_url.replace('/api/media/file/', '');
          console.log(`[AI Parse] Direct resolve failed. Querying media_library for storage_path matching: ${filename}`);
          try {
            const mediaResult = await db.execute(sql`SELECT storage_path FROM media_library WHERE storage_path LIKE ${'%' + filename} LIMIT 1`);
            const mediaRows = (mediaResult as any)?.rows || mediaResult || [];
            if (mediaRows[0]?.storage_path) {
              const storagePath = mediaRows[0].storage_path;
              console.log(`[AI Parse] Found media storage_path: ${storagePath}`);
              const localMediaPath = path.join(process.cwd(), storagePath);
              if (fs.existsSync(localMediaPath)) {
                fileBuffer = fs.readFileSync(localMediaPath);
                console.log(`[AI Parse] Read ${fileBuffer.length} bytes from local media path`);
              } else {
                fileBuffer = await resolveFileToBuffer(storagePath);
              }
            }
          } catch (mediaErr) {
            console.error('[AI Parse] Media library lookup failed:', (mediaErr as Error).message);
          }
        }
        
        if (fileBuffer && fileBuffer.length > 0) {
          const extractedText = await extractPdfText(fileBuffer);
          if (extractedText && extractedText.trim().length > 50) {
            textContent = extractedText;
            console.log(`[AI Parse] Extracted ${textContent.length} chars from PDF file`);
            await db.execute(sql`UPDATE routing_documents SET extracted_text = ${textContent} WHERE id = ${req.params.id}`);
          } else {
            console.log(`[AI Parse] PDF text extraction returned insufficient text (${extractedText?.length || 0} chars)`);
          }
        } else {
          console.log(`[AI Parse] Could not retrieve file buffer from any source for: ${document.file_url}`);
        }
      } catch (pdfError) {
        console.error('[AI Parse] Failed to extract text from PDF:', (pdfError as Error).message);
      }
    }
    
    if (!textContent.trim()) {
      return res.status(400).json({ error: 'No text content available. The PDF may be image-based. Please use the manual text paste option or try Azure Document Intelligence to extract text from scanned documents.' });
    }
    
    console.log(`[AI Parse] Analyzing ${textContent.length} chars for document: ${document.title}`);
    
    const systemPrompt = COMPOSITE_ANALYSIS_PROMPT + COMPOSITE_ANALYSIS_JSON_SCHEMA;

    let parsedContent: any;
    try {
      const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Extract the EXACT information from this document. Do NOT generate generic content — only include data that is explicitly written in the text below. Preserve all part numbers, temperatures, tolerances, dimensions, and standards exactly as they appear.\n\nDocument Title: ${document.title}\n\nDOCUMENT TEXT:\n${textContent.substring(0, 50000)}` }
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 4096,
    });
    
      parsedContent = JSON.parse(response.choices[0]?.message?.content || '{}');
    } catch (aiError) {
      console.error('[AI Parse] AI analysis failed, using fallback text analysis:', aiError);
      parsedContent = buildFallbackDocumentAnalysis(document.title, textContent, document.document_type || 'work_instruction');
    }
    
    const updateData: Record<string, any> = {
      ai_extracted_content: parsedContent,
      ai_extracted_fields: parsedContent.dataFields || [],
      ai_processed_at: new Date(),
      updated_at: new Date(),
    };
    if (!document.extracted_text && textContent.trim()) {
      updateData.extracted_text = textContent;
    }
    
    const updatedDocument = await updatePublicRowByIdReturning('routing_documents', req.params.id, updateData);
    
    res.json({ document: updatedDocument, extractedContent: parsedContent });
  } catch (error) {
    console.error('Error parsing document with AI:', error);
    res.status(500).json({ error: 'Failed to parse document with AI' });
  }
});

// AI Generate new document from templates
router.post('/ai-generate', async (req: Request, res: Response) => {
  try {
    const { templateId, partNumber, partName, departmentName, documentType, customFields, referenceDocumentIds } = req.body;
    const finalDocumentType = typeof documentType === 'string' && documentType.trim()
      ? documentType.trim()
      : 'work_instruction';
    const finalDepartment = typeof departmentName === 'string' && departmentName.trim()
      ? departmentName.trim()
      : 'Manufacturing';
    
    if (!partNumber) {
      return res.status(400).json({ error: 'Reference, part, or equipment ID is required' });
    }
    
    // Validate and get reference documents
    let referenceContent = '';
    if (referenceDocumentIds && referenceDocumentIds.length > 0) {
      // Build individual queries for each document ID to avoid SQL injection
      const refDocs: any[] = [];
      for (const docId of referenceDocumentIds) {
        const result = await db.execute(sql`SELECT * FROM routing_documents WHERE id = ${docId}`);
        const rows = (result as any)?.rows || result || [];
        if (rows.length > 0) refDocs.push(rows[0]);
      }
      
      // Validate that all referenced documents exist
      if (refDocs.length !== referenceDocumentIds.length) {
        const foundIds = refDocs.map((d: any) => d.id);
        const missingIds = referenceDocumentIds.filter((id: string) => !foundIds.includes(id));
        return res.status(400).json({ error: `Referenced documents not found: ${missingIds.join(', ')}` });
      }
      
      referenceContent = refDocs.map((doc: any) => {
        const parts = [`Document: ${doc.title}`];
        if (doc.extracted_text && doc.extracted_text.trim()) {
          parts.push(`Full Text:\n${doc.extracted_text.substring(0, 15000)}`);
        }
        if (doc.ai_extracted_content) {
          parts.push(`AI Analysis: ${JSON.stringify(doc.ai_extracted_content)}`);
        }
        return parts.join('\n');
      }).join('\n\n---\n\n');
    }
    
    // Validate and get template if provided
    let templateContent = '';
    if (templateId) {
      const templateResult = await db.execute(sql`SELECT * FROM document_templates WHERE id = ${templateId} LIMIT 1`);
      const templates = ((templateResult as any)?.rows || templateResult || []) as any[];
      const template = templates[0];
      if (!template) {
        return res.status(400).json({ error: `Template not found: ${templateId}` });
      }
      const fieldsResult = await db.execute(sql`SELECT * FROM template_fields WHERE template_id = ${templateId}`);
      const fields = ((fieldsResult as any)?.rows || fieldsResult || []) as any[];
      templateContent = `Template: ${template.template_name}\nStructure: ${JSON.stringify(template.structure)}\nSections: ${JSON.stringify(template.sections)}\nFields: ${JSON.stringify(fields)}`;
    }
    
    const systemPrompt = `You are an expert at creating controlled manufacturing forms and instruction documents, including work instructions, assembly instructions, operator instructions, maintenance schedules, maintenance instructions, inspection forms, quality checklists, training forms, procedures, spec sheets, and travelers. Based on the requested document type, the provided reference documents, and the selected template, generate a practical document structure with all necessary sections and fields.

When the source material is composite manufacturing related, preserve exact composite terminology such as ply layup, fiber orientation, prepreg handling/out-time, vacuum bagging, autoclave/oven cure cycles, mold prep, surface prep, bonding, trimming, and NDI/NDT inspection. Use exact reference values where provided. For maintenance and operator forms, include frequencies, ownership, safety checks, acceptance criteria, signoffs, and escalation notes when supported by the source material.

Return a JSON object with:
{
  "title": "Generated document title",
  "documentType": "requested document type",
  "sections": [{"name": "string", "content": "string", "fields": [...]}],
  "fields": [{"fieldName": "string", "fieldLabel": "string", "fieldType": "string", "isRequired": boolean, "isUniquePerSerial": boolean, "defaultValue": "string", "unit": "string or null"}],
  "routingSteps": [...],
  "qualityCheckpoints": [...],
  "materialRequirements": [{"material": "string", "specification": "string", "department": "string", "traceabilityRequired": boolean}],
  "curingParameters": [{"step": "string", "temperature": "string", "time": "string", "vacuumPressure": "string or null", "department": "string"}]
}`;

    const userPrompt = `Generate a document for:
Document Type: ${finalDocumentType}
Reference / Part / Equipment ID: ${partNumber || 'Not specified'}
Subject / Part Name: ${partName || 'Not specified'}
Department: ${finalDepartment}
Custom Requirements: ${JSON.stringify(customFields || {})}

${referenceContent ? `Reference Documents:\n${referenceContent}` : ''}
${templateContent ? `\nTemplate:\n${templateContent}` : ''}`;

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 4096,
    });
    
    const generatedContent = JSON.parse(response.choices[0]?.message?.content || '{}');
    const documentTitle = generatedContent.title || `${humanizeDocumentType(finalDocumentType)} for ${partNumber}`;
    const documentNumber = await generateControlledTemplateNumber();
    const createdBy = (req as any).user?.username || 'system';
    const pdfBuffer = await createGeneratedControlledPdf({
      title: documentTitle,
      documentType: finalDocumentType,
      partNumber,
      partName,
      documentNumber,
      generatedContent,
    });
    const pdfFileName = `${documentNumber}-${documentTitle}.pdf`;
    const fileUrl = await saveControlledDocumentFile(pdfFileName, pdfBuffer);
    const expirationDate = new Date();
    expirationDate.setFullYear(expirationDate.getFullYear() + 1);

    // Create new routing document with generated content
    const [newDocument] = await db.insert(routingDocuments).values({
      title: documentTitle,
      partNumber,
      departmentName: finalDepartment,
      documentType: finalDocumentType,
      sourceType: 'generated',
      fileUrl,
      fileName: pdfFileName,
      fileType: 'application/pdf',
      fileSize: pdfBuffer.length,
      aiExtractedContent: generatedContent,
      aiExtractedFields: generatedContent.fields || [],
      aiProcessedAt: new Date(),
      isTemplate: false,
      description: `Controlled generated document ${documentNumber}`,
      createdBy,
    }).returning();

    let specSheet = null;
    if (finalDocumentType === 'spec_sheet' || finalDocumentType === 'specification') {
      [specSheet] = await db.insert(specSheets).values({
        title: documentTitle,
        partNumber,
        partRoutingId: null,
        description: `Controlled generated spec sheet ${documentNumber}`,
        sourceType: 'generated',
        fileUrl,
        fileName: pdfFileName,
        fileType: 'application/pdf',
        fileSize: pdfBuffer.length,
        specifications: generatedContent,
        aiExtractedContent: generatedContent,
        aiExtractedFields: generatedContent.fields || [],
        aiProcessedAt: new Date(),
        isTemplate: false,
        createdBy,
      }).returning();
    }

    const [controlledDocument] = await db.insert(controlledDocuments).values({
      documentNumber,
      documentName: documentTitle,
      documentType: finalDocumentType,
      department: finalDepartment,
      category: specSheet ? 'Form & Document Builder Spec Sheet' : 'Form & Document Builder Work Instruction',
      description: `${humanizeDocumentType(finalDocumentType)} generated from Form & Document Builder for ${partNumber}`,
      currentVersion: '1.0',
      status: 'pending',
      retentionLength: 'controlled',
      documentOwner: createdBy,
      filePath: fileUrl,
      createdBy,
      expirationDate: expirationDate.toISOString().split('T')[0],
    }).returning();

    const [controlledRevision] = await db.insert(documentVersionHistory).values({
      documentId: controlledDocument.id,
      versionNumber: '1.0',
      revisionSequence: 1,
      lifecycleStatus: 'DRAFT',
      changeDescription: 'Initial generated document created from Form & Document Builder',
      revisionReason: 'Initial generated document created from Form & Document Builder',
      changeType: 'major',
      filePath: fileUrl,
      fileName: pdfFileName,
      mediaType: 'application/pdf',
      fileSize: pdfBuffer.length,
      fileChecksum: createHash('sha256').update(pdfBuffer).digest('hex'),
      checksumStatus: 'VERIFIED',
      status: 'draft',
      createdBy,
      expirationDate: expirationDate.toISOString().split('T')[0],
    }).returning();
    await db.insert(controlledDocumentNumberRegistry).values({
      normalizedNumber: documentNumber.trim().toUpperCase(),
      displayNumber: documentNumber.trim(),
      controlledDocumentId: controlledDocument.id,
      status: 'RESERVED',
    });
    await db.update(controlledDocuments).set({
      currentRevisionId: controlledRevision.id,
      workingDraftRevisionId: controlledRevision.id,
      lifecycleStatus: 'DRAFT',
      status: 'draft',
    }).where(eq(controlledDocuments.id, controlledDocument.id));
    
    res.status(201).json({ document: newDocument, specSheet, controlledDocument, generatedContent });
  } catch (error) {
    console.error('Error generating document with AI:', error);
    res.status(500).json({ error: 'Failed to generate document' });
  }
});

// Create document template from reference documents
router.post('/templates/learn', async (req: Request, res: Response) => {
  try {
    const { templateName, templateType, description, referenceDocumentIds } = req.body;
    
    if (!templateName || !templateName.trim()) {
      return res.status(400).json({ error: 'Template name is required' });
    }
    
    if (!referenceDocumentIds || referenceDocumentIds.length === 0) {
      return res.status(400).json({ error: 'At least one reference document is required' });
    }
    
    // Get reference documents and validate all exist
    const refDocs: any[] = [];
    for (const docId of referenceDocumentIds) {
      const result = await db.execute(sql`SELECT * FROM routing_documents WHERE id = ${docId}`);
      const rows = (result as any)?.rows || result || [];
      if (rows.length > 0) refDocs.push(rows[0]);
    }
    
    if (refDocs.length === 0) {
      return res.status(404).json({ error: 'No reference documents found' });
    }
    
    // Validate that all referenced documents exist
    if (refDocs.length !== referenceDocumentIds.length) {
      const foundIds = refDocs.map((d: any) => d.id);
      const missingIds = referenceDocumentIds.filter((id: string) => !foundIds.includes(id));
      return res.status(400).json({ error: `Referenced documents not found: ${missingIds.join(', ')}` });
    }
    
    const documentAnalysis = refDocs.map((doc: any) => {
      const analysis: any = {
        title: doc.title,
        documentType: doc.document_type,
        partNumber: doc.part_number,
        department: doc.department_name,
      };
      if (doc.extracted_text && doc.extracted_text.trim()) {
        analysis.fullText = doc.extracted_text.substring(0, 15000);
      }
      if (doc.ai_extracted_content) {
        analysis.aiAnalysis = doc.ai_extracted_content;
      }
      return analysis;
    });
    
    const hasActualText = refDocs.some((doc: any) => doc.extracted_text && doc.extracted_text.trim());
    
    const systemPrompt = `You are an expert at analyzing composite manufacturing documents (work instructions, spec sheets, travelers) for composite layup, mold creation, curing, and fabrication processes. Analyze the provided documents and identify common patterns, fields, and structure to create a reusable template.

You understand composite manufacturing processes deeply: ply layup, fiber orientation, prepreg handling, vacuum bagging, cure cycles, mold prep, bonding, trimming, and NDI/NDT inspection.

CRITICAL: Base your analysis on the ACTUAL document text provided in the "fullText" field. This is the real content from the user's uploaded documents. Do NOT make up generic content - extract the actual structure, fields, steps, and requirements found in these specific documents.

Return a JSON object with:
{
  "structure": {"sections": [...], "layout": "string"},
  "sections": [{"name": "string", "description": "string", "order": number}],
  "defaultFields": [{"fieldName": "string", "fieldLabel": "string", "fieldType": "string", "isRequired": boolean, "isUniquePerSerial": boolean, "sectionName": "string", "sortOrder": number, "unit": "string or null"}],
  "aiGeneratedPrompt": "A prompt that can be used to generate similar composite manufacturing documents in the future"
}`;

    console.log(`[Learn Template] Analyzing ${refDocs.length} documents, ${hasActualText ? 'with' : 'WITHOUT'} actual text content`);

    let learnedContent: any;
    try {
      const response = await getOpenAI().chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze these ${refDocs.length} documents and create a template based on their ACTUAL content:\n\n${JSON.stringify(documentAnalysis, null, 2)}` }
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: 4096,
      });
      learnedContent = JSON.parse(response.choices[0]?.message?.content || '{}');
    } catch (aiError) {
      console.error('[Learn Template] AI analysis failed, using fallback template content:', aiError);
      const combinedText = refDocs
        .map((doc: any) => doc.extracted_text || '')
        .filter(Boolean)
        .join('\n\n---\n\n');
      const fallbackAnalysis = buildFallbackDocumentAnalysis(templateName, combinedText || JSON.stringify(documentAnalysis), templateType || 'mixed');
      learnedContent = {
        structure: { source: 'fallback_text_analysis', documentCount: refDocs.length },
        sections: [
          { name: 'Header', description: 'Document identity fields', order: 1 },
          { name: 'Document', description: 'Fields inferred from extracted text', order: 2 },
        ],
        defaultFields: fallbackAnalysis.dataFields,
        aiGeneratedPrompt: 'Template created from extracted document text using fallback analysis.',
      };
    }
    
    // Create template with explicit error handling
    let template: any;
    try {
      template = await insertPublicRowReturning('document_templates', {
        id: randomUUID(),
        template_name: templateName || 'Learned Template',
        template_type: templateType || 'mixed',
        description: description || 'Template learned from reference documents',
        source_document_ids: referenceDocumentIds,
        learned_from_count: referenceDocumentIds.length,
        structure: {
          ...(learnedContent.structure || {}),
          sourceDocumentIds: referenceDocumentIds,
        },
        sections: learnedContent.sections || null,
        default_fields: learnedContent.defaultFields || null,
        ai_generated_prompt: learnedContent.aiGeneratedPrompt || null,
        is_active: true,
        created_by: (req as any).user?.username || 'system',
        created_at: new Date(),
        updated_at: new Date(),
      }, ['template_name', 'template_type']);
    } catch (insertError) {
      console.error('Template insert error:', insertError);
      return res.status(500).json({
        error: 'Failed to insert template into database',
        detail: insertError instanceof Error ? insertError.message : 'Unknown database error',
      });
    }
    
    if (!template) {
      console.error('Template insert returned empty result');
      return res.status(500).json({ error: 'Template creation returned empty result' });
    }
    
    // Create template fields
    if (learnedContent.defaultFields && learnedContent.defaultFields.length > 0) {
      for (const field of learnedContent.defaultFields) {
        const normalizedField = normalizeTemplateField(field);
        await insertPublicRowReturning('template_fields', {
          id: randomUUID(),
          template_id: template.id,
          field_name: normalizedField.fieldName,
          field_label: normalizedField.fieldLabel,
          field_type: normalizedField.fieldType || 'text',
          is_required: normalizedField.isRequired || false,
          is_unique_per_serial: normalizedField.isUniquePerSerial || false,
          default_value: normalizedField.defaultValue || null,
          validation_rules: normalizedField.validationRules || null,
          options: normalizedField.options || null,
          section_name: normalizedField.sectionName || null,
          sort_order: normalizedField.sortOrder || 0,
          ai_suggested: true,
          created_at: new Date(),
        }, ['template_id', 'field_name', 'field_label', 'field_type']);
      }
    }
    
    const fieldsResult = await db.execute(sql`SELECT * FROM template_fields WHERE template_id = ${template.id} ORDER BY sort_order ASC`);
    const fields = ((fieldsResult as any)?.rows || fieldsResult || []) as any[];
    
    res.status(201).json({ template, fields, learnedContent });
  } catch (error) {
    console.error('Error learning template:', error);
    res.status(500).json({ error: 'Failed to learn template from documents' });
  }
});

// Request upload URL for spec sheet
router.post('/spec-sheets/request-upload-url', async (req: Request, res: Response) => {
  try {
    const { name, size, contentType } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Missing required field: name' });
    }
    
    const uploadTarget = await getFileStorageProvider().createUploadTarget({
      fileName: name,
      contentType,
      scope: 'spec-sheets',
    });
    
    res.json({
      uploadURL: uploadTarget.uploadURL,
      objectPath: uploadTarget.objectPath,
      provider: uploadTarget.provider,
      metadata: { name, size, contentType },
    });
  } catch (error) {
    const { status, reason, message } = getStorageErrorResponse(error);
    console.error('Error generating upload URL for spec sheet:', { status, reason, message });
    res.status(status).json({ error: 'Failed to generate upload URL', reason, details: message });
  }
});

// Complete upload for spec sheet
router.post('/spec-sheets/complete-upload', async (req: Request, res: Response) => {
  try {
    const { objectPath, title, originalFileName, fileSize, mimeType, partRoutingId, partNumber, isTemplate, sourceType } = req.body;
    const user = (req as any).user;
    
    if (!objectPath || !originalFileName) {
      return res.status(400).json({ error: 'Missing required fields: objectPath, originalFileName' });
    }
    
    // Validate sourceType
    const validSourceTypes = ['uploaded', 'generated', 'imported'];
    const finalSourceType = validSourceTypes.includes(sourceType) ? sourceType : 'uploaded';
    
    try {
      await getFileStorageProviderForObjectPath(objectPath).setPublicReadPolicy(
        objectPath,
        user?.id?.toString() || 'system',
      );
    } catch (aclError) {
      console.warn('Failed to set ACL policy for spec sheet:', aclError);
    }
    
    const [sheet] = await db.insert(specSheets).values({
      title: title || originalFileName,
      partRoutingId: partRoutingId || null,
      partNumber: partNumber || null,
      sourceType: finalSourceType,
      fileUrl: objectPath,
      fileName: originalFileName,
      fileType: mimeType || 'application/octet-stream',
      fileSize: fileSize || 0,
      isTemplate: isTemplate === true || isTemplate === 'true',
      createdBy: user?.username || 'system',
    }).returning();
    
    res.status(201).json(sheet);
  } catch (error) {
    console.error('Error completing spec sheet upload:', error);
    res.status(500).json({ error: 'Failed to complete spec sheet upload' });
  }
});

// Fill any reusable template, save the finished PDF in central storage, register it in MDR,
// and optionally attach it directly to a project.
const createDocumentFromTemplate = async (req: Request, res: Response) => {
  let creationStage = 'validating request';
  try {
    const {
      templateId,
      inventoryItemId,
      partNumber,
      partName,
      sku,
      title,
      fieldValues,
      description,
      projectId,
    } = req.body;
    const user = (req as any).user;
    const createdBy = user?.username || 'system';

    if (!templateId) {
      return res.status(400).json({ error: 'Template is required' });
    }

    creationStage = 'loading template';
    const templateResult = await db.execute(sql`SELECT * FROM document_templates WHERE id = ${templateId} AND is_active = true LIMIT 1`);
    const templateRows = ((templateResult as any)?.rows || templateResult || []) as any[];
    const template = templateRows[0];
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const fieldResult = await db.execute(sql`SELECT * FROM template_fields WHERE template_id = ${templateId} ORDER BY sort_order ASC`);
    const defaultFields = Array.isArray(template.default_fields ?? template.defaultFields)
      ? (template.default_fields ?? template.defaultFields)
      : [];
    const defaultFieldByName = new Map(defaultFields.map((field: any) => [field.fieldName ?? field.field_name, field]));
    const templateFields = (((fieldResult as any)?.rows || fieldResult || []) as any[]).map((field) => {
      const fieldName = field.field_name ?? field.fieldName;
      const defaultField = defaultFieldByName.get(fieldName) ?? {};
      return {
        fieldName,
        fieldLabel: field.field_label ?? field.fieldLabel ?? defaultField.fieldLabel ?? defaultField.field_label,
        fieldType: field.field_type ?? field.fieldType ?? defaultField.fieldType ?? defaultField.field_type,
        defaultValue: field.default_value ?? field.defaultValue ?? defaultField.defaultValue ?? defaultField.default_value,
        sectionName: field.section_name ?? field.sectionName ?? defaultField.sectionName ?? defaultField.section_name,
        isRequired: field.is_required ?? field.isRequired ?? defaultField.isRequired ?? defaultField.is_required,
        sortOrder: field.sort_order ?? field.sortOrder ?? defaultField.sortOrder ?? defaultField.sort_order,
      };
    });

    const values = fieldValues && typeof fieldValues === 'object' ? fieldValues : {};
    const finalPartNumber = String(partNumber || values.partNumber || '').trim();
    const finalPartName = String(partName || values.partName || '').trim();
    const finalSku = String(sku || values.sku || '').trim();

    let manufacturedPart: any = null;
    const parsedInventoryItemId = Number(inventoryItemId);
    if (Number.isFinite(parsedInventoryItemId) && parsedInventoryItemId > 0) {
      const [item] = await db.select({
        id: inventoryItems.id,
        agPartNumber: inventoryItems.agPartNumber,
        name: inventoryItems.name,
        sku: inventoryItems.sku,
        itemType: inventoryItems.itemType,
        manufacturedCategory: inventoryItems.manufacturedCategory,
      }).from(inventoryItems).where(eq(inventoryItems.id, parsedInventoryItemId)).limit(1);
      if (!item) {
        return res.status(404).json({ error: 'Manufactured part not found' });
      }
      manufacturedPart = item;
    }

    const resolvedPartNumber = finalPartNumber || manufacturedPart?.agPartNumber || null;
    const resolvedPartName = finalPartName || manufacturedPart?.name || null;
    const resolvedSku = finalSku || manufacturedPart?.sku || null;
    const templateType = String(template.template_type ?? template.templateType ?? 'work_instruction');
    const finalDepartment = String(template.department_name ?? template.departmentName ?? (templateType === 'spec_sheet' ? 'CNC' : 'Manufacturing'));
    const fallbackTitle = `${humanizeDocumentType(templateType)} - ${resolvedPartName || resolvedPartNumber || 'New Document'}`;
    const resolvedTitle = String(title || fallbackTitle).trim();
    const templateSections = Array.isArray(template.sections) ? template.sections : [];
    const documentNumber = templateType === 'spec_sheet' || templateType === 'specification'
      ? await generateSpecSheetDocumentNumber()
      : await generateControlledTemplateNumber();
    creationStage = 'rendering PDF';
    const pdfBuffer = await renderSpecSheetPdf({
      title: resolvedTitle,
      sku: resolvedSku,
      partNumber: resolvedPartNumber,
      partName: resolvedPartName,
      manufacturedPart,
      fieldValues: values,
      templateSections,
      templateFields,
      documentNumber,
    });
    const fileName = normalizeSpecSheetFileName(resolvedTitle, resolvedPartNumber || templateType);
    creationStage = 'saving PDF to central storage';
    const { fileUrl, storagePath, storageWarning } = await saveGeneratedTemplatePdf(fileName, pdfBuffer);
    const specifications = {
      templateId,
      templateName: template.template_name ?? template.templateName,
      fieldValues: values,
      manufacturedPart: manufacturedPart ? {
        inventoryItemId: manufacturedPart.id,
        agPartNumber: manufacturedPart.agPartNumber,
        name: manufacturedPart.name,
        sku: manufacturedPart.sku,
        manufacturedCategory: manufacturedPart.manufacturedCategory,
      } : null,
      controlledDocumentNumber: documentNumber,
    };

    creationStage = 'registering central storage record';
    const centralStorageDocument = await insertPublicRowReturning('media_library', {
      filename: path.basename(decodeURIComponent(fileUrl)),
      storage_path: storagePath,
      mime_type: 'application/pdf',
      file_size: pdfBuffer.length,
      captured_by_name: createdBy,
      title: resolvedTitle,
      notes: `Generated from reusable template ${template.template_name ?? template.templateName}`,
      tags: ['form_document_builder', templateType],
      category: 'document',
      created_at: new Date(),
      updated_at: new Date(),
    }, ['filename', 'storage_path', 'mime_type']);

    creationStage = 'registering generated document';
    const routingDocument = await insertPublicRowReturning('routing_documents', {
      part_number: resolvedPartNumber,
      title: resolvedTitle,
      version: 1,
      description: description || `Filled ${humanizeDocumentType(templateType)} from template ${template.template_name ?? template.templateName}`,
      department_name: finalDepartment,
      document_type: templateType,
      source_type: 'generated',
      file_url: fileUrl,
      file_name: path.basename(fileUrl),
      file_type: 'application/pdf',
      file_size: pdfBuffer.length,
      ai_extracted_content: specifications,
      ai_extracted_fields: templateFields,
      is_template: false,
      is_active: true,
      created_by: createdBy,
      created_at: new Date(),
      updated_at: new Date(),
    }, ['title', 'document_type']);

    let specSheet = null;
    if (templateType === 'spec_sheet' || templateType === 'specification') {
      specSheet = await insertPublicRowReturning('spec_sheets', {
        part_number: resolvedPartNumber,
        title: resolvedTitle,
        version: 1,
        description: description || `Filled spec sheet from template ${template.template_name ?? template.templateName}`,
        specifications,
        source_type: 'generated',
        file_url: fileUrl,
        file_name: path.basename(fileUrl),
        file_type: 'application/pdf',
        file_size: pdfBuffer.length,
        is_template: false,
        is_active: true,
        created_by: createdBy,
        created_at: new Date(),
        updated_at: new Date(),
      }, ['title']);
    }

    const expirationDate = new Date();
    expirationDate.setFullYear(expirationDate.getFullYear() + 1);
    creationStage = 'queueing Master Document record';
    const controlledDocument = await insertPublicRowReturning('controlled_documents', {
      document_number: documentNumber,
      document_name: resolvedTitle,
      document_type: templateType,
      department: finalDepartment,
      category: templateType === 'spec_sheet' ? 'Spec Sheet' : 'Form & Document Builder',
      description: description || `${humanizeDocumentType(templateType)} created from reusable template${resolvedPartNumber ? ` for ${resolvedPartNumber}` : ''}`,
      current_version: '1.0',
      status: 'pending',
      retention_length: 'controlled',
      document_owner: createdBy,
      file_path: fileUrl,
      created_by: createdBy,
      expiration_date: expirationDate.toISOString().split('T')[0],
      created_at: new Date(),
      updated_at: new Date(),
    }, ['document_number', 'document_name', 'document_type', 'department', 'current_version', 'status', 'created_by']);
    await insertPublicRowReturning('controlled_document_number_registry', {
      normalized_number: documentNumber.trim().toUpperCase(),
      display_number: documentNumber.trim(),
      controlled_document_id: controlledDocument.id,
      status: 'RESERVED',
      created_at: new Date(),
      updated_at: new Date(),
    }, ['normalized_number', 'display_number', 'controlled_document_id']);

    const controlledRevision = await insertPublicRowReturning('document_version_history', {
      document_id: controlledDocument.id,
      version_number: '1.0',
      revision_sequence: 1,
      lifecycle_status: 'DRAFT',
      change_description: `Initial ${humanizeDocumentType(templateType)} created from reusable Form & Document Builder template`,
      revision_reason: `Initial ${humanizeDocumentType(templateType)} created from reusable Form & Document Builder template`,
      change_type: 'major',
      file_path: fileUrl,
      file_name: path.basename(fileUrl),
      media_type: 'application/pdf',
      file_size: pdfBuffer.length,
      file_checksum: createHash('sha256').update(pdfBuffer).digest('hex'),
      checksum_status: 'VERIFIED',
      status: 'draft',
      created_by: createdBy,
      expiration_date: expirationDate.toISOString().split('T')[0],
      created_at: new Date(),
    }, ['document_id', 'version_number', 'status', 'created_by']);
    await db.execute(sql`
      UPDATE controlled_documents
      SET current_revision_id = ${controlledRevision.id},
          working_draft_revision_id = ${controlledRevision.id},
          lifecycle_status = 'DRAFT',
          status = 'draft'
      WHERE id = ${controlledDocument.id}
    `);

    creationStage = 'attaching document to project';
    let projectDocument = null;
    let projectAttachmentWarning = null;
    if (projectId) {
      try {
        projectDocument = await insertPublicRowReturning('project_documents', {
          project_id: projectId,
          label: resolvedTitle,
          original_file_name: path.basename(fileUrl),
          file_name: path.basename(fileUrl),
          file_path: fileUrl,
          mime_type: 'application/pdf',
          file_size: pdfBuffer.length,
          uploaded_by: createdBy,
          created_at: new Date(),
        }, ['project_id']);
      } catch (error) {
        projectAttachmentWarning = error instanceof Error ? error.message : String(error);
        console.warn('Optional project attachment failed after template document save:', error);
      }
    }

    res.status(201).json({
      document: routingDocument,
      specSheet,
      controlledDocument,
      centralStorageDocument,
      projectDocument,
      projectAttachmentWarning,
      fileUrl,
      documentNumber,
      storageWarning,
    });
  } catch (error) {
    const { status, reason, message } = getStorageErrorResponse(error);
    console.error('Error creating document from template:', { stage: creationStage, reason, message, error });
    res.status(status).json({
      error: 'Failed to create document from template',
      stage: creationStage,
      reason,
      details: message,
    });
  }
};

router.post('/documents/from-template', createDocumentFromTemplate);
router.post('/spec-sheets/from-template', createDocumentFromTemplate);

// Create Distribution Log
router.post('/distribution-logs', async (req: Request, res: Response) => {
  try {
    const { poId, poNumber, documentType, documentId, documentTitle, departmentName, recipientId, recipientName, distributionMethod, notes } = req.body;
    
    const [log] = await db.insert(documentDistributionLogs).values({
      poId,
      poNumber,
      documentType,
      documentId,
      documentTitle,
      departmentName,
      recipientId,
      recipientName,
      distributionMethod: distributionMethod || 'print',
      printedBy: (req as any).user?.username || 'system',
      notes,
    }).returning();
    
    res.status(201).json(log);
  } catch (error) {
    console.error('Error creating distribution log:', error);
    res.status(500).json({ error: 'Failed to create distribution log' });
  }
});

router.patch('/distribution-logs/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const [log] = await db.update(documentDistributionLogs)
      .set({
        acknowledged: true,
        acknowledgedAt: new Date(),
        acknowledgedBy: (req as any).user?.username || 'system',
      })
      .where(eq(documentDistributionLogs.id, req.params.id))
      .returning();
    
    if (!log) {
      return res.status(404).json({ error: 'Distribution log not found' });
    }
    
    res.json(log);
  } catch (error) {
    console.error('Error acknowledging distribution:', error);
    res.status(500).json({ error: 'Failed to acknowledge distribution' });
  }
});

// Generate Part Routing from analyzed document
// Converts AI-extracted routing steps into an actual part routing
router.post('/:id/generate-routing', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { partNumber, partName, inventoryItemId, routingName } = req.body;
    
    if (!partNumber || !partName || !inventoryItemId) {
      return res.status(400).json({ 
        error: 'Missing required fields: partNumber, partName, and inventoryItemId are required' 
      });
    }
    
    // Fetch the document with AI-extracted content
    const [document] = await db.select().from(routingDocuments).where(eq(routingDocuments.id, id));
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Parse AI content - handle both string and object types
    let aiContent: any = document.aiExtractedContent;
    if (typeof aiContent === 'string') {
      try {
        aiContent = JSON.parse(aiContent);
      } catch (e) {
        aiContent = null;
      }
    }
    
    // Guard: ensure we have valid routing steps
    const routingSteps = Array.isArray(aiContent?.routingSteps) ? aiContent.routingSteps : [];
    
    if (routingSteps.length === 0) {
      return res.status(400).json({ 
        error: 'Document has not been analyzed or has no routing steps extracted',
        hint: 'Please analyze the document with AI first to extract routing steps'
      });
    }
    
    // Get unique departments in order of appearance
    const departmentSequence: string[] = [];
    const departmentConfig: Record<string, any> = {};
    const traceabilityConfig: Record<string, string[]> = {};
    
    for (const step of routingSteps) {
      const dept = step.department || 'General';
      
      if (!departmentSequence.includes(dept)) {
        departmentSequence.push(dept);
        
        // Build department config with operations and quality checkpoints
        departmentConfig[dept] = {
          operations: [],
          qcStandards: [],
          technicianRequired: true,
          materials: []
        };
        
        // Default traceability requirements
        traceabilityConfig[dept] = ['operator', 'timestamp'];
      }
      
      // Add operation to department
      departmentConfig[dept].operations.push({
        stepNumber: step.stepNumber,
        operation: step.operation,
        description: step.description || ''
      });
      
      // Add quality checkpoints if present
      if (step.qualityCheckpoints && step.qualityCheckpoints.length > 0) {
        for (const qc of step.qualityCheckpoints) {
          departmentConfig[dept].qcStandards.push({
            standard: qc,
            requirement: 'Pass/Fail'
          });
        }
      }
    }
    
    // Add quality checkpoints from aiContent if available (with guard)
    const qualityCheckpoints = Array.isArray(aiContent?.qualityCheckpoints) ? aiContent.qualityCheckpoints : [];
    for (const qc of qualityCheckpoints) {
      const dept = qc.department || departmentSequence[0] || 'Quality';
      if (!departmentConfig[dept]) {
        if (!departmentSequence.includes(dept)) {
          departmentSequence.push(dept);
        }
        departmentConfig[dept] = { operations: [], qcStandards: [], technicianRequired: true, materials: [] };
        traceabilityConfig[dept] = ['operator', 'timestamp'];
      }
      departmentConfig[dept].qcStandards.push({
        standard: qc.checkpoint,
        requirement: qc.requirement || 'Pass/Fail'
      });
    }
    
    // Build QC standards array from qualityCheckpoints and curing parameters
    const qcStandards: any[] = [];
    for (const qc of qualityCheckpoints) {
      qcStandards.push({
        standardName: qc.checkpoint || qc.standard || 'Quality Check',
        specification: qc.specification || qc.checkpoint || '',
        tolerance: qc.tolerance || '',
        requirement: qc.requirement || 'Pass/Fail',
        measurementType: qc.measurementType || 'visual',
        department: qc.department || ''
      });
    }
    
    // Add curing parameters as QC standards
    const curingParameters = aiContent?.curingParameters;
    if (curingParameters && typeof curingParameters === 'object') {
      if (curingParameters.temperature) {
        qcStandards.push({
          standardName: 'Curing Temperature',
          specification: curingParameters.temperature,
          tolerance: curingParameters.temperatureTolerance || '',
          requirement: 'Measured',
          measurementType: 'temperature'
        });
      }
      if (curingParameters.duration) {
        qcStandards.push({
          standardName: 'Curing Duration',
          specification: curingParameters.duration,
          tolerance: curingParameters.durationTolerance || '',
          requirement: 'Measured',
          measurementType: 'time'
        });
      }
      if (curingParameters.pressure) {
        qcStandards.push({
          standardName: 'Curing Pressure',
          specification: curingParameters.pressure,
          tolerance: curingParameters.pressureTolerance || '',
          requirement: 'Measured',
          measurementType: 'pressure'
        });
      }
      if (curingParameters.rampRate) {
        qcStandards.push({
          standardName: 'Ramp Rate',
          specification: curingParameters.rampRate,
          tolerance: '',
          requirement: 'Measured',
          measurementType: 'rate'
        });
      }
    }

    // Build custom fields from dataFields and layupSchedule
    const customFields: any[] = [];
    const dataFields = Array.isArray(aiContent?.dataFields) ? aiContent.dataFields : [];
    for (const field of dataFields) {
      customFields.push({
        fieldName: (field.fieldName || field.name || 'field').replace(/\s+/g, '_').toLowerCase(),
        fieldLabel: field.fieldName || field.name || field.label || 'Custom Field',
        fieldType: field.fieldType || field.type || 'text',
        isRequired: field.isRequired ?? field.required ?? false,
        options: field.options || [],
        defaultValue: field.defaultValue || field.value || ''
      });
    }

    // Add layup schedule as a structured custom field and also into department config
    const layupSchedule = Array.isArray(aiContent?.layupSchedule) ? aiContent.layupSchedule : [];
    if (layupSchedule.length > 0) {
      customFields.push({
        fieldName: 'layup_schedule',
        fieldLabel: 'Layup Schedule (Ply Sequence)',
        fieldType: 'json',
        isRequired: true,
        options: [],
        defaultValue: JSON.stringify(layupSchedule)
      });

      const layupDept = departmentSequence.find(d => d.toLowerCase().includes('layup')) || 'Layup';
      if (!departmentSequence.includes(layupDept)) {
        departmentSequence.push(layupDept);
        departmentConfig[layupDept] = { operations: [], qcStandards: [], technicianRequired: true, materials: [] };
        traceabilityConfig[layupDept] = ['operator', 'timestamp', 'lot_number', 'batch_number'];
      }
      departmentConfig[layupDept].layupSchedule = layupSchedule;
    }
    
    // Build materials config from materialRequirements
    const materialsConfig: any[] = [];
    const materialRequirements = Array.isArray(aiContent?.materialRequirements) ? aiContent.materialRequirements : [];
    for (const mat of materialRequirements) {
      materialsConfig.push({
        partNumber: mat.partNumber || mat.materialPartNumber || '',
        partName: mat.name || mat.materialName || mat.description || '',
        quantity: mat.quantity || '',
        unit: mat.unit || '',
        requiresLotNumber: true,
        requiresExpiration: mat.requiresExpiration ?? true,
        entryMethod: 'manual'
      });
      
      // Also add materials to the relevant department config
      const matDept = mat.department || departmentSequence[0] || 'General';
      if (departmentConfig[matDept]) {
        departmentConfig[matDept].materials.push({
          partNumber: mat.partNumber || mat.materialPartNumber || '',
          partName: mat.name || mat.materialName || mat.description || '',
          quantity: mat.quantity || '',
          unit: mat.unit || ''
        });
      }
    }

    // Build special process config from curing parameters
    const specialProcessConfig: Record<string, any> = {};
    if (curingParameters && typeof curingParameters === 'object') {
      specialProcessConfig['Curing'] = {
        materials: [],
        qcStandards: qcStandards.filter(s => s.measurementType !== 'visual'),
        customFields: [
          { fieldName: 'cure_temperature', fieldType: 'number', isRequired: true, label: 'Temperature' },
          { fieldName: 'cure_duration', fieldType: 'number', isRequired: true, label: 'Duration' },
          ...(curingParameters.pressure ? [{ fieldName: 'cure_pressure', fieldType: 'number', isRequired: true, label: 'Pressure' }] : []),
        ],
        parameters: curingParameters
      };
    }
    
    // Create the part routing using storage interface
    const { storage } = await import('../../storage');
    
    const newRouting = await storage.createPartRouting({
      inventoryItemId,
      partNumber,
      partName,
      routingName: routingName || document.title || 'Generated from Document',
      routingRevision: 1,
      departmentSequence,
      traceabilityConfig,
      departmentConfig,
      qcStandards: qcStandards.length > 0 ? qcStandards : undefined,
      customFields: customFields.length > 0 ? customFields : undefined,
      materialsConfig: materialsConfig.length > 0 ? materialsConfig : undefined,
      specialProcessConfig: Object.keys(specialProcessConfig).length > 0 ? specialProcessConfig : undefined,
      isActive: true,
      createdBy: (req as any).user?.username || 'system',
    });
    
    // Link the document to the new routing
    await db.insert(routingDocumentLinks).values({
      partRoutingId: newRouting.id,
      departmentName: departmentSequence[0] || 'General',
      documentType: document.documentType,
      documentId: document.id,
      isPrimary: true,
      sortOrder: 0,
      createdBy: (req as any).user?.username || 'system',
    });
    
    // Count certification requirements for summary (not linked - requires existing certification IDs)
    const certifications = Array.isArray(aiContent?.certificationRequirements) ? aiContent.certificationRequirements : [];
    
    res.status(201).json({
      message: 'Part routing generated successfully from document',
      routing: newRouting,
      summary: {
        departmentsCreated: departmentSequence.length,
        operationsExtracted: routingSteps.length,
        qualityCheckpointsLinked: qualityCheckpoints.length,
        qcStandardsCreated: qcStandards.length,
        customFieldsCreated: customFields.length,
        layupScheduleEntries: layupSchedule.length,
        materialsConfigured: materialsConfig.length,
        specialProcesses: Object.keys(specialProcessConfig).length,
        certificationRequirementsFound: certifications.length
      }
    });
  } catch (error: any) {
    console.error('Error generating routing from document:', error);
    res.status(500).json({ 
      error: 'Failed to generate routing from document',
      message: error.message 
    });
  }
});

// ============================================
// FULL CRUD OPERATIONS FOR SPEC SHEETS
// (Must be defined before /:id catch-all routes)
// ============================================

// Create spec sheet
router.post('/spec-sheets', async (req: Request, res: Response) => {
  try {
    const { partNumber, title, version, description, specifications, sourceType } = req.body;
    const user = (req as any).user;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const [specSheet] = await db.insert(specSheets).values({
      partNumber: partNumber || null,
      title,
      version: version || 1,
      description: description || null,
      specifications: specifications || null,
      sourceType: sourceType || 'uploaded',
      createdBy: user?.username || 'system',
    }).returning();

    res.status(201).json(specSheet);
  } catch (error) {
    console.error('Error creating spec sheet:', error);
    res.status(500).json({ error: 'Failed to create spec sheet' });
  }
});

// Convert an existing spec sheet into a reusable fillable template
router.post('/spec-sheets/:id/create-template', async (req: Request, res: Response) => {
  try {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid spec sheet ID format' });
    }

    const sheetResult = await db.execute(sql`SELECT * FROM spec_sheets WHERE id = ${req.params.id} AND is_active = true LIMIT 1`);
    const sheetRows = ((sheetResult as any)?.rows || sheetResult || []) as any[];
    const sheet = sheetRows[0];
    if (!sheet) {
      return res.status(404).json({ error: 'Spec sheet not found' });
    }

    const templateName = `${sheet.title} Template`;
    const existingTemplateResult = await db.execute(sql`
      SELECT *
      FROM document_templates
      WHERE template_name = ${templateName}
        AND template_type = 'spec_sheet'
        AND COALESCE(is_active, true) = true
      ORDER BY created_at DESC NULLS LAST
      LIMIT 1
    `);
    const existingTemplateRows = ((existingTemplateResult as any)?.rows || existingTemplateResult || []) as any[];
    const existingTemplate = existingTemplateRows[0];
    if (existingTemplate) {
      const existingFieldsResult = await db.execute(sql`
        SELECT *
        FROM template_fields
        WHERE template_id = ${existingTemplate.id}
        ORDER BY sort_order ASC
      `);
      const existingFields = ((existingFieldsResult as any)?.rows || existingFieldsResult || []) as any[];
      await db.update(specSheets)
        .set({ isTemplate: true, updatedAt: new Date() })
        .where(eq(specSheets.id, req.params.id));
      return res.status(200).json({ template: existingTemplate, fields: existingFields });
    }

    const templateFieldsForSheet = buildSpecSheetTemplateFields(sheet);
    const sections = Array.from(new Set(templateFieldsForSheet.map((field) => field.sectionName).filter(Boolean)))
      .map((name, index) => ({
        name,
        description: name === 'Header' ? 'Spec sheet identity fields' : 'Reusable spec sheet fields',
        order: index + 1,
      }));
    const createdBy = (req as any).user?.username || 'system';
    const template = await insertPublicRowReturning('document_templates', {
      id: randomUUID(),
      template_name: templateName,
      template_type: 'spec_sheet',
      description: `Reusable template created from spec sheet ${sheet.title}`,
      source_document_ids: [sheet.id],
      learned_from_count: 1,
      structure: {
        source: 'spec_sheet',
        sourceSpecSheetId: sheet.id,
        sourceFileName: sheet.file_name ?? sheet.fileName ?? null,
        sourceFileUrl: sheet.file_url ?? sheet.fileUrl ?? null,
      },
      sections,
      default_fields: templateFieldsForSheet,
      is_active: true,
      created_by: createdBy,
      created_at: new Date(),
      updated_at: new Date(),
    }, ['template_name', 'template_type']);

    for (const field of templateFieldsForSheet) {
      await insertPublicRowReturning('template_fields', {
        id: randomUUID(),
        template_id: template.id,
        field_name: field.fieldName,
        field_label: field.fieldLabel,
        field_type: field.fieldType || 'text',
        is_required: field.isRequired || false,
        is_unique_per_serial: field.isUniquePerSerial || false,
        default_value: field.defaultValue || null,
        validation_rules: field.validationRules || null,
        options: field.options || null,
        section_name: field.sectionName || null,
        sort_order: field.sortOrder ?? 0,
        ai_suggested: false,
        created_at: new Date(),
      }, ['template_id', 'field_name', 'field_label', 'field_type']);
    }

    await db.update(specSheets)
      .set({ isTemplate: true, updatedAt: new Date() })
      .where(eq(specSheets.id, req.params.id));

    res.status(201).json({ template, fields: templateFieldsForSheet });
  } catch (error) {
    console.error('Error creating template from spec sheet:', error);
    res.status(500).json({ error: 'Failed to create template from spec sheet' });
  }
});

// Get single spec sheet
router.get('/spec-sheets/:id', async (req: Request, res: Response) => {
  try {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid spec sheet ID format' });
    }

    const results = await db.execute(sql`SELECT * FROM spec_sheets WHERE id = ${req.params.id} AND is_active = true LIMIT 1`);
    const rows = (results as any)?.rows || results || [];

    if (!rows[0]) {
      return res.status(404).json({ error: 'Spec sheet not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching spec sheet:', error);
    res.status(500).json({ error: 'Failed to fetch spec sheet' });
  }
});

// Update spec sheet
router.put('/spec-sheets/:id', async (req: Request, res: Response) => {
  try {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid spec sheet ID format' });
    }

    const { partNumber, title, version, description, specifications, isTemplate, isActive } = req.body;
    
    const updateData: any = { updatedAt: new Date() };
    if (partNumber !== undefined) updateData.partNumber = partNumber;
    if (title !== undefined) updateData.title = title;
    if (version !== undefined) updateData.version = version;
    if (description !== undefined) updateData.description = description;
    if (specifications !== undefined) updateData.specifications = specifications;
    if (isTemplate !== undefined) updateData.isTemplate = isTemplate === true || isTemplate === 'true';
    if (isActive !== undefined) updateData.isActive = isActive === true || isActive === 'true';

    const [updated] = await db.update(specSheets)
      .set(updateData)
      .where(eq(specSheets.id, req.params.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Spec sheet not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error('Error updating spec sheet:', error);
    res.status(500).json({ error: 'Failed to update spec sheet' });
  }
});

// Delete spec sheet (soft delete)
router.delete('/spec-sheets/:id', async (req: Request, res: Response) => {
  try {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid spec sheet ID format' });
    }

    const [deleted] = await db.update(specSheets)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(specSheets.id, req.params.id))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Spec sheet not found' });
    }

    res.json({ message: 'Spec sheet deleted successfully', specSheet: deleted });
  } catch (error) {
    console.error('Error deleting spec sheet:', error);
    res.status(500).json({ error: 'Failed to delete spec sheet' });
  }
});

// ============================================
// FULL CRUD OPERATIONS FOR DOCUMENT TEMPLATES
// (Must be defined before /:id catch-all routes)
// ============================================

// Create template
router.post('/templates', async (req: Request, res: Response) => {
  try {
    const { templateName, templateType, description, structure, sections, defaultFields, fields } = req.body;
    const user = (req as any).user;

    if (!templateName || !templateType) {
      return res.status(400).json({ error: 'Template name and type are required' });
    }

    const normalizedFields = Array.isArray(fields)
      ? fields.map(normalizeTemplateField)
      : [];
    const template = await insertPublicRowReturning('document_templates', {
      id: randomUUID(),
      template_name: String(templateName).trim(),
      template_type: String(templateType).trim(),
      description: description || null,
      source_document_ids: [],
      learned_from_count: 0,
      structure: structure || { source: 'manual_builder' },
      sections: sections || null,
      default_fields: defaultFields || normalizedFields,
      is_active: true,
      created_by: user?.username || 'system',
      created_at: new Date(),
      updated_at: new Date(),
    }, ['id', 'template_name', 'template_type']);

    for (const field of normalizedFields) {
      await insertPublicRowReturning('template_fields', {
        id: randomUUID(),
        template_id: template.id,
        field_name: field.fieldName,
        field_label: field.fieldLabel,
        field_type: field.fieldType,
        is_required: field.isRequired,
        is_unique_per_serial: field.isUniquePerSerial,
        default_value: field.defaultValue,
        validation_rules: field.validationRules,
        options: field.options,
        section_name: field.sectionName || 'General',
        sort_order: field.sortOrder,
        ai_suggested: false,
        created_at: new Date(),
      }, ['id', 'template_id', 'field_name', 'field_label', 'field_type']);
    }

    res.status(201).json({ template, fields: normalizedFields });
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({
      error: 'Failed to create template',
      detail: error instanceof Error ? error.message : 'Unknown database error',
    });
  }
});

// Update template
router.put('/templates/:templateId', async (req: Request, res: Response) => {
  try {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(req.params.templateId)) {
      return res.status(400).json({ error: 'Invalid template ID format' });
    }

    const { templateName, templateType, description, structure, sections, defaultFields, isActive, fields } = req.body;
    
    const updateData: any = { updatedAt: new Date() };
    if (templateName !== undefined) updateData.templateName = templateName;
    if (templateType !== undefined) updateData.templateType = templateType;
    if (description !== undefined) updateData.description = description;
    if (structure !== undefined) updateData.structure = structure;
    if (sections !== undefined) updateData.sections = sections;
    if (defaultFields !== undefined) updateData.defaultFields = defaultFields;
    if (isActive !== undefined) updateData.isActive = isActive === true || isActive === 'true';

    const [updated] = await db.update(documentTemplates)
      .set(updateData)
      .where(eq(documentTemplates.id, req.params.templateId))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Template not found' });
    }

    if (fields && Array.isArray(fields)) {
      await db.delete(templateFields).where(eq(templateFields.templateId, req.params.templateId));
      
      if (fields.length > 0) {
        const fieldValues = fields.map((field: any, index: number) => ({
          templateId: req.params.templateId,
          fieldName: field.fieldName,
          fieldLabel: field.fieldLabel || field.fieldName,
          fieldType: field.fieldType || 'text',
          isRequired: field.isRequired || false,
          defaultValue: field.defaultValue || null,
          sectionName: field.sectionName || 'General',
          sortOrder: field.sortOrder ?? index,
        }));
        
        await db.insert(templateFields).values(fieldValues);
      }
    }

    res.json(updated);
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// Delete template (soft delete)
router.delete('/templates/:templateId', async (req: Request, res: Response) => {
  try {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(req.params.templateId)) {
      return res.status(400).json({ error: 'Invalid template ID format' });
    }

    const [deleted] = await db.update(documentTemplates)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(documentTemplates.id, req.params.templateId))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ message: 'Template deleted successfully', template: deleted });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// ============================================
// CRUD OPERATIONS FOR ROUTING DOCUMENT LINKS
// (Must be defined before /:id catch-all routes)
// ============================================

// Create routing document link (early definition)
router.post('/routing-links', async (req: Request, res: Response) => {
  try {
    const { partRoutingId, departmentName, documentType, documentId, isPrimary, sortOrder } = req.body;
    const user = (req as any).user;

    if (!partRoutingId || !documentId) {
      return res.status(400).json({ error: 'Part routing ID and document ID are required' });
    }

    const [link] = await db.insert(routingDocumentLinks).values({
      partRoutingId,
      departmentName: departmentName || 'General',
      documentType: documentType || 'work_instruction',
      documentId,
      isPrimary: isPrimary || false,
      sortOrder: sortOrder ?? 0,
      createdBy: user?.username || 'system',
    }).returning();

    res.status(201).json(link);
  } catch (error) {
    console.error('Error creating routing document link:', error);
    res.status(500).json({ error: 'Failed to create routing document link' });
  }
});

// Delete routing document link
router.delete('/routing-links/:id', async (req: Request, res: Response) => {
  try {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid link ID format' });
    }

    const result = await db.delete(routingDocumentLinks).where(eq(routingDocumentLinks.id, req.params.id));

    res.json({ message: 'Link deleted successfully' });
  } catch (error) {
    console.error('Error deleting routing document link:', error);
    res.status(500).json({ error: 'Failed to delete routing document link' });
  }
});

// ============================================
// CRUD OPERATIONS FOR CERTIFICATION TASK LINKS
// (Must be defined before /:id catch-all routes)
// ============================================

// Create certification task link (early definition)
router.post('/certification-links', async (req: Request, res: Response) => {
  try {
    const { certificationId, partRoutingId, departmentName, routingDocumentId, travelerStepId, travelerTaskId, taskDescription, isRequired } = req.body;
    const user = (req as any).user;

    if (certificationId === undefined || certificationId === null) {
      return res.status(400).json({ error: 'Certification ID is required' });
    }

    const [link] = await db.insert(certificationTaskLinks).values({
      certificationId: Number(certificationId),
      partRoutingId: partRoutingId || null,
      departmentName: departmentName || null,
      routingDocumentId: routingDocumentId || null,
      travelerStepId: travelerStepId || null,
      travelerTaskId: travelerTaskId || null,
      taskDescription: taskDescription || null,
      isRequired: isRequired !== false,
      createdBy: user?.username || 'system',
    }).returning();

    res.status(201).json(link);
  } catch (error) {
    console.error('Error creating certification task link:', error);
    res.status(500).json({ error: 'Failed to create certification task link' });
  }
});

// Delete certification task link (uses UUID)
router.delete('/certification-links/:id', async (req: Request, res: Response) => {
  try {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid link ID format' });
    }

    await db.delete(certificationTaskLinks).where(eq(certificationTaskLinks.id, req.params.id));

    res.json({ message: 'Certification link deleted successfully' });
  } catch (error) {
    console.error('Error deleting certification task link:', error);
    res.status(500).json({ error: 'Failed to delete certification task link' });
  }
});

// ============================================
// FULL CRUD OPERATIONS FOR ROUTING DOCUMENTS
// (Catch-all /:id routes - MUST be last)
// ============================================

// Update routing document
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid document ID format' });
    }

    const { title, partNumber, departmentName, documentType, description, isTemplate, isActive } = req.body;
    
    const updateData: any = { updatedAt: new Date() };
    if (title !== undefined) updateData.title = title;
    if (partNumber !== undefined) updateData.partNumber = partNumber;
    if (departmentName !== undefined) updateData.departmentName = departmentName;
    if (documentType !== undefined) updateData.documentType = documentType;
    if (description !== undefined) updateData.description = description;
    if (isTemplate !== undefined) updateData.isTemplate = isTemplate === true || isTemplate === 'true';
    if (isActive !== undefined) updateData.isActive = isActive === true || isActive === 'true';

    const [updated] = await db.update(routingDocuments)
      .set(updateData)
      .where(eq(routingDocuments.id, req.params.id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error('Error updating routing document:', error);
    res.status(500).json({ error: 'Failed to update routing document' });
  }
});

// Delete routing document (soft delete)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid document ID format' });
    }

    const [deleted] = await db.update(routingDocuments)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(routingDocuments.id, req.params.id))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({ message: 'Document deleted successfully', document: deleted });
  } catch (error) {
    console.error('Error deleting routing document:', error);
    res.status(500).json({ error: 'Failed to delete routing document' });
  }
});

// Hard delete routing document (permanent)
router.delete('/:id/permanent', async (req: Request, res: Response) => {
  try {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid document ID format' });
    }

    // First delete related links
    await db.delete(routingDocumentLinks).where(eq(routingDocumentLinks.documentId, req.params.id));
    
    // Then delete the document
    const result = await db.delete(routingDocuments).where(eq(routingDocuments.id, req.params.id));

    res.json({ message: 'Document permanently deleted' });
  } catch (error) {
    console.error('Error permanently deleting routing document:', error);
    res.status(500).json({ error: 'Failed to permanently delete routing document' });
  }
});

router.post('/:id/generate-snippets', async (req: Request, res: Response) => {
  try {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid document ID format' });
    }

    const results = await db.execute(sql`SELECT * FROM routing_documents WHERE id = ${req.params.id} LIMIT 1`);
    const rows = (results as any)?.rows || results || [];
    const document = rows[0];

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    let textContent = '';

    if (document.ai_extracted_content) {
      textContent = JSON.stringify(document.ai_extracted_content);
    }

    if (!textContent && document.file_url) {
      try {
        const fileBuffer = await getFileStorageProviderForObjectPath(document.file_url).downloadBuffer(document.file_url);
        if (fileBuffer && (document.file_type === 'application/pdf' || document.file_name?.endsWith('.pdf'))) {
          textContent = await extractPdfText(fileBuffer);
        } else if (fileBuffer) {
          textContent = fileBuffer.toString('utf-8');
        }
      } catch (fileErr) {
        console.error('Error reading document file for snippet generation:', fileErr);
      }
    }

    if (req.body.textContent) {
      textContent = req.body.textContent;
    }

    if (!textContent || textContent.trim().length < 10) {
      return res.status(400).json({
        error: 'Not enough document content available to generate snippets. Upload and analyze the document first.',
      });
    }

    const { departmentName, operationName } = req.body;

    const systemPrompt = `You are an expert composite manufacturing quality engineer reviewing work instructions for composite layup, mold creation, curing, and fabrication processes. Generate structured shop-floor reference snippets that operators will see during production.

You deeply understand composite manufacturing: ply layup sequences, fiber orientations, prepreg handling, vacuum bagging, autoclave/oven curing, mold prep, surface prep, bonding, trimming, and NDI/NDT inspection.

Return a JSON object with this exact structure:
{
  "snippets": [
    {
      "title": "Critical Points",
      "bullets": ["bullet 1", "bullet 2", ...],
      "confidence": 0.0-1.0
    },
    {
      "title": "Common Defects",
      "bullets": ["bullet 1", "bullet 2", ...],
      "confidence": 0.0-1.0
    },
    {
      "title": "Acceptance Criteria",
      "bullets": ["bullet 1", "bullet 2", ...],
      "confidence": 0.0-1.0
    },
    {
      "title": "Material Handling",
      "bullets": ["bullet 1", "bullet 2", ...],
      "confidence": 0.0-1.0
    },
    {
      "title": "Do Not Do",
      "bullets": ["bullet 1", "bullet 2", ...],
      "confidence": 0.0-1.0
    }
  ]
}

Rules:
- Each bullet should be a concise, actionable statement (max 15 words).
- Only include categories that have relevant content — omit empty categories.
- Set confidence to reflect how explicitly the document supports each snippet (1.0 = directly stated, 0.5 = inferred).
- Focus on practical shop-floor relevance for composite manufacturing, not general theory.
- For layup: emphasize ply orientation, stacking sequence, debulk requirements, and prepreg out-time limits.
- For curing: emphasize temperature/time parameters, vacuum requirements, ramp rates, and thermocouple placement.
- For quality: emphasize dimensional tolerances, surface finish criteria, void limits, and inspection methods.
- If a department or operation context is given, tailor snippets to that context.`;

    const userMessage = `Generate shop-floor instruction snippets from this work instruction document.${departmentName ? `\nDepartment: ${departmentName}` : ''}${operationName ? `\nOperation: ${operationName}` : ''}\n\nDocument content:\n${textContent.substring(0, 40000)}`;

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 2048,
    });

    const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
    const snippets = (parsed.snippets || []).map((s: any) => ({
      title: s.title || 'Tip',
      bullets: Array.isArray(s.bullets) ? s.bullets : [],
      sourceDocumentId: req.params.id,
      confidence: typeof s.confidence === 'number' ? s.confidence : 0.7,
    }));

    res.json({ snippets, documentId: req.params.id, documentTitle: document.title || document.file_name });
  } catch (error) {
    console.error('Error generating AI snippets:', error);
    res.status(500).json({ error: 'Failed to generate AI snippets' });
  }
});

export default router;
