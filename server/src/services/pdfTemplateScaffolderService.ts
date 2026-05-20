/**
 * PDF Template Scaffolder Service
 * 
 * Analyzes PDFs from Media Library and automatically generates
 * fillable PDF template configurations with detected fields.
 */

import * as fs from 'fs';
import * as path from 'path';
import { FillableFieldDef } from '../../schema';
import { getFileStorageProviderForObjectPath } from './fileStorageProvider';

interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  fontSize: number;
}

interface DetectedBlank {
  x: number;
  y: number;
  width: number;
  page: number;
  label?: string;
  inferredType?: string;
}

interface ScaffoldResult {
  success: boolean;
  templateName: string;
  pageCount: number;
  pageDimensions: { width: number; height: number }[];
  fieldDefsJson: FillableFieldDef[];
  signaturePlacement: {
    x: number;
    y: number;
    page: number;
    width: number;
    height: number;
  };
  warnings: string[];
  isImageOnly: boolean;
  textDensity: number;
  detectedBlanks: number;
}

const FIELD_TYPE_PATTERNS: { pattern: RegExp; type: FillableFieldDef['type']; name: string }[] = [
  { pattern: /\b(email|e-mail)\b/i, type: 'email', name: 'email' },
  { pattern: /\b(phone|tel|telephone|cell|mobile)\b/i, type: 'phone', name: 'phone' },
  { pattern: /\b(date|dob|birth\s*date|hire\s*date)\b/i, type: 'date', name: 'date' },
  { pattern: /\b(ssn|social\s*security|ss#|social#)\b/i, type: 'text', name: 'ssn' },
  { pattern: /\b(zip|zipcode|postal)\b/i, type: 'text', name: 'zip' },
  { pattern: /\b(state)\b/i, type: 'text', name: 'state' },
  { pattern: /\b(city)\b/i, type: 'text', name: 'city' },
  { pattern: /\b(address|street)\b/i, type: 'text', name: 'address' },
  { pattern: /\b(name|full\s*name|employee\s*name|applicant|print\s*name)\b/i, type: 'text', name: 'name' },
  { pattern: /\b(sign|signature|autograph)\b/i, type: 'text', name: 'signature' },
  { pattern: /\b(initial|initials)\b/i, type: 'text', name: 'initials' },
  { pattern: /\b(title|position|job\s*title)\b/i, type: 'text', name: 'title' },
  { pattern: /\b(department|dept)\b/i, type: 'text', name: 'department' },
  { pattern: /\b(supervisor|manager)\b/i, type: 'text', name: 'supervisor' },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 50);
}

function inferFieldTypeFromLabel(label: string): { type: FillableFieldDef['type']; baseName: string } {
  for (const { pattern, type, name } of FIELD_TYPE_PATTERNS) {
    if (pattern.test(label)) {
      return { type, baseName: name };
    }
  }
  return { type: 'text', baseName: 'text' };
}

function detectBlankPatterns(text: string): boolean {
  return /_{3,}/.test(text) || /\.{5,}/.test(text);
}

function findNearbyLabel(
  blank: DetectedBlank,
  textItems: TextItem[],
  pageHeight: number
): string | undefined {
  const candidates: { text: string; distance: number }[] = [];
  
  for (const item of textItems) {
    if (item.page !== blank.page) continue;
    if (detectBlankPatterns(item.text)) continue;
    if (item.text.trim().length < 2) continue;
    
    const itemRight = item.x + item.width;
    const blankLeft = blank.x;
    const horizontallyBefore = itemRight <= blankLeft + 20;
    const verticallyAligned = Math.abs(item.y - blank.y) < 15;
    
    if (horizontallyBefore && verticallyAligned && blankLeft - itemRight < 200) {
      const distance = blankLeft - itemRight;
      candidates.push({ text: item.text.trim(), distance });
    }
    
    const itemBottom = item.y - item.height;
    const aboveBlank = itemBottom > blank.y && itemBottom - blank.y < 30;
    const horizontalOverlap = item.x < blank.x + blank.width && itemRight > blank.x;
    
    if (aboveBlank && horizontalOverlap) {
      const distance = itemBottom - blank.y;
      candidates.push({ text: item.text.trim(), distance: distance + 100 });
    }
  }
  
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]?.text;
}

export async function scaffoldTemplateFromPdf(
  pdfBuffer: Buffer,
  originalFilename: string
): Promise<ScaffoldResult> {
  const warnings: string[] = [];
  const textItems: TextItem[] = [];
  const detectedBlanks: DetectedBlank[] = [];
  let pageCount = 0;
  const pageDimensions: { width: number; height: number }[] = [];
  
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(pdfBuffer),
      useSystemFonts: true,
      standardFontDataUrl: undefined,
    });
    
    const pdfDoc = await loadingTask.promise;
    pageCount = pdfDoc.numPages;
    
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });
      pageDimensions.push({ width: viewport.width, height: viewport.height });
      
      const textContent = await page.getTextContent();
      
      for (const item of textContent.items) {
        if ('str' in item && item.str.trim()) {
          const transform = item.transform;
          const x = transform[4];
          const y = transform[5];
          const fontSize = Math.sqrt(transform[0] * transform[0] + transform[1] * transform[1]);
          
          textItems.push({
            text: item.str,
            x,
            y,
            width: item.width || fontSize * item.str.length * 0.6,
            height: fontSize,
            page: pageNum - 1,
            fontSize,
          });
          
          if (detectBlankPatterns(item.str)) {
            const blankMatch = item.str.match(/_{3,}|\.{5,}/);
            if (blankMatch && blankMatch.index !== undefined) {
              const blankStartOffset = blankMatch.index * (fontSize * 0.6);
              detectedBlanks.push({
                x: x + blankStartOffset,
                y,
                width: blankMatch[0].length * (fontSize * 0.6),
                page: pageNum - 1,
              });
            }
          }
        }
      }
    }
    
    await pdfDoc.destroy();
  } catch (error: any) {
    console.error('[Scaffolder] PDF parsing error:', error);
    warnings.push(`PDF parsing error: ${error.message}`);
  }
  
  const totalChars = textItems.reduce((sum, item) => sum + item.text.length, 0);
  const textDensity = pageCount > 0 ? totalChars / pageCount : 0;
  const isImageOnly = textDensity < 50;
  
  if (isImageOnly) {
    warnings.push('PDF appears to be image-only or has very little extractable text. Manual field placement recommended.');
  }
  
  for (const blank of detectedBlanks) {
    const pageHeight = pageDimensions[blank.page]?.height || 792;
    blank.label = findNearbyLabel(blank, textItems, pageHeight);
    if (blank.label) {
      const inference = inferFieldTypeFromLabel(blank.label);
      blank.inferredType = inference.baseName;
    }
  }
  
  const fieldDefsJson: FillableFieldDef[] = [];
  const usedNames = new Set<string>();
  let genericCounter = 1;
  
  const sortedBlanks = [...detectedBlanks].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    return b.y - a.y;
  });
  
  for (const blank of sortedBlanks) {
    if (fieldDefsJson.length >= 8) {
      warnings.push('Maximum of 8 text fields reached. Additional blanks were ignored.');
      break;
    }
    
    let fieldName: string;
    let fieldLabel: string;
    let fieldType: FillableFieldDef['type'] = 'text';
    
    if (blank.label) {
      const inference = inferFieldTypeFromLabel(blank.label);
      fieldType = inference.type;
      const baseName = slugify(blank.label) || inference.baseName;
      
      let finalName = baseName;
      let counter = 1;
      while (usedNames.has(finalName)) {
        finalName = `${baseName}_${counter}`;
        counter++;
      }
      fieldName = finalName;
      fieldLabel = blank.label;
    } else {
      fieldName = `text_${genericCounter}`;
      fieldLabel = `Field ${genericCounter}`;
      genericCounter++;
    }
    
    usedNames.add(fieldName);
    
    fieldDefsJson.push({
      name: fieldName,
      label: fieldLabel,
      type: fieldType,
      required: false,
      x: Math.round(blank.x),
      y: Math.round(blank.y),
      page: blank.page,
      fontSize: 12,
    });
  }
  
  if (!fieldDefsJson.some(f => f.name.includes('name'))) {
    fieldDefsJson.unshift({
      name: 'employee_name',
      label: 'Employee Name',
      type: 'text',
      required: true,
      x: 100,
      y: 700,
      page: 0,
      fontSize: 12,
    });
  }
  
  fieldDefsJson.push({
    name: 'acknowledgment_checkbox',
    label: 'I agree to sign this document electronically.',
    type: 'checkbox',
    required: true,
    x: 50,
    y: 100,
    page: pageCount - 1,
    fontSize: 10,
  });
  
  fieldDefsJson.push({
    name: 'signed_date',
    label: 'Date Signed',
    type: 'date',
    required: true,
    x: 400,
    y: 60,
    page: pageCount - 1,
    fontSize: 12,
  });
  
  const lastPageDimensions = pageDimensions[pageCount - 1] || { width: 612, height: 792 };
  const signaturePlacement = {
    x: 100,
    y: 60,
    page: pageCount - 1,
    width: 200,
    height: 50,
  };
  
  const baseName = path.basename(originalFilename, path.extname(originalFilename));
  const templateName = `${baseName} (Fillable Template)`;
  
  if (detectedBlanks.length === 0 && !isImageOnly) {
    warnings.push('No fill-in blanks detected. The PDF may not have standard blank patterns (underscores or dots).');
  }
  
  return {
    success: true,
    templateName,
    pageCount,
    pageDimensions,
    fieldDefsJson,
    signaturePlacement,
    warnings,
    isImageOnly,
    textDensity: Math.round(textDensity),
    detectedBlanks: detectedBlanks.length,
  };
}

export async function scaffoldFromMediaItem(
  mediaId: string
): Promise<ScaffoldResult & { mediaItem: any }> {
  const { db } = await import('../../db');
  const { mediaLibrary } = await import('../../schema');
  const { eq } = await import('drizzle-orm');
  
  const [mediaItem] = await db
    .select()
    .from(mediaLibrary)
    .where(eq(mediaLibrary.id, mediaId))
    .limit(1);
  
  if (!mediaItem) {
    throw new Error(`Media item not found: ${mediaId}`);
  }
  
  if (mediaItem.mimeType !== 'application/pdf') {
    throw new Error(`Media item is not a PDF: ${mediaItem.mimeType}`);
  }
  
  let pdfBuffer: Buffer;
  
  // Normalize storagePath - handle both /objects/ and objects/ prefixes
  const storagePath = mediaItem.storagePath;
  const normalizedCloudPath = storagePath.startsWith('objects/') 
    ? `/${storagePath}` 
    : storagePath;
  
  // Try local file first (for development/legacy uploads)
  const localPath = path.join(process.cwd(), storagePath);
  if (fs.existsSync(localPath)) {
    console.log('[Scaffold] Reading PDF from local path:', localPath);
    pdfBuffer = fs.readFileSync(localPath);
  } else if (normalizedCloudPath.startsWith('/objects/')) {
    // Try object storage for cloud-stored files
    console.log('[Scaffold] Reading PDF from object storage:', normalizedCloudPath);
    pdfBuffer = await getFileStorageProviderForObjectPath(normalizedCloudPath).downloadBuffer(normalizedCloudPath);
  } else {
    throw new Error(`PDF file not found: ${storagePath}`);
  }
  
  if (!pdfBuffer || pdfBuffer.length === 0) {
    throw new Error('Failed to read PDF content');
  }
  
  const result = await scaffoldTemplateFromPdf(pdfBuffer, mediaItem.filename);
  
  return {
    ...result,
    mediaItem,
  };
}
