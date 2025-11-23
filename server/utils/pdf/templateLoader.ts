import { db } from '../../db';
import { pdfTemplates } from '../../schema';
import { eq, and } from 'drizzle-orm';
import { PDFDocument, rgb, RGB } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

/**
 * PDF Template Loader Utility
 * 
 * Loads active PDF templates and their configuration for different business contexts
 */

export type TemplateType = 'p1_production' | 'p2_purchase_order' | 'rfq_risk_assessment' | 'sales_order' | 'commercial_invoice' | 'layup_schedule';

interface TemplateConfig {
  id: string;
  name: string;
  templateType: TemplateType;
  companyName: string | null;
  companyAddress: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  logoPath: string | null;
  margins: Record<string, number>;
  fontSizes: Record<string, number>;
  spacing: Record<string, number>;
  lineHeights: Record<string, number>;
  colors: Record<string, { r: number; g: number; b: number }>;
}

/**
 * Load the active template for a given type
 * Returns null if no active template found
 */
export async function loadActiveTemplate(templateType: TemplateType): Promise<TemplateConfig | null> {
  try {
    const [template] = await db
      .select()
      .from(pdfTemplates)
      .where(and(
        eq(pdfTemplates.templateType, templateType),
        eq(pdfTemplates.isActive, true)
      ))
      .limit(1);

    if (!template) {
      console.warn(`⚠️ [Template Loader] No active template found for type: ${templateType}`);
      return null;
    }

    return {
      id: template.id,
      name: template.name,
      templateType: template.templateType as TemplateType,
      companyName: template.companyName,
      companyAddress: template.companyAddress,
      companyPhone: template.companyPhone,
      companyEmail: template.companyEmail,
      logoPath: template.logoPath,
      margins: template.margins as Record<string, number>,
      fontSizes: template.fontSizes as Record<string, number>,
      spacing: template.spacing as Record<string, number>,
      lineHeights: template.lineHeights as Record<string, number>,
      colors: template.colors as Record<string, { r: number; g: number; b: number }>,
    };
  } catch (error) {
    console.error(`❌ [Template Loader] Error loading template for ${templateType}:`, error);
    return null;
  }
}

/**
 * Embed template logo in PDF document
 * Falls back to default behavior if template has no logo
 * SECURITY: Sanitizes logo path to prevent directory traversal attacks
 */
export async function embedTemplateLogo(pdfDoc: PDFDocument, template: TemplateConfig | null) {
  if (!template?.logoPath) {
    return null;
  }

  try {
    // SECURITY: Sanitize filename to prevent path traversal attacks
    const safeFilename = path.basename(template.logoPath);
    
    // Validate filename format: must start with alphanumeric, single extension only, no hidden files
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*\.(png|jpg|jpeg)$/i.test(safeFilename)) {
      console.warn(`⚠️ [Template Loader] Invalid logo filename format: ${template.logoPath}`);
      return null;
    }
    
    // Additional check: reject filenames with double extensions or suspicious patterns
    const parsed = path.parse(safeFilename);
    if (parsed.name.includes('.')) {
      console.warn(`⚠️ [Template Loader] Rejected filename with double extension: ${safeFilename}`);
      return null;
    }
    
    const logoPath = path.join(process.cwd(), 'attached_assets', 'pdf_logos', safeFilename);
    
    // Verify the resolved path is still within the pdf_logos directory
    const logoDir = path.join(process.cwd(), 'attached_assets', 'pdf_logos');
    if (!logoPath.startsWith(logoDir)) {
      console.error(`🚨 [Template Loader] Path traversal attempt detected: ${template.logoPath}`);
      return null;
    }
    
    if (!fs.existsSync(logoPath)) {
      console.warn(`⚠️ [Template Loader] Logo file not found: ${logoPath}`);
      return null;
    }

    const logoImageBytes = fs.readFileSync(logoPath);
    
    // Determine image type from extension
    const ext = path.extname(safeFilename).toLowerCase();
    let embeddedLogo;
    
    if (ext === '.png') {
      embeddedLogo = await pdfDoc.embedPng(logoImageBytes);
    } else if (ext === '.jpg' || ext === '.jpeg') {
      embeddedLogo = await pdfDoc.embedJpg(logoImageBytes);
    } else {
      console.warn(`⚠️ [Template Loader] Unsupported logo format: ${ext}`);
      return null;
    }

    console.log(`✅ [Template Loader] Logo embedded successfully: ${safeFilename}`);
    return embeddedLogo;
  } catch (error) {
    console.error('❌ [Template Loader] Error embedding logo:', error);
    return null;
  }
}

/**
 * Get template margins with fallback to defaults
 */
export function getTemplateMargins(template: TemplateConfig | null) {
  return template?.margins || {
    STANDARD: 40,
    COMPACT: 30,
    WIDE: 50,
  };
}

/**
 * Get template font sizes with fallback to defaults
 */
export function getTemplateFontSizes(template: TemplateConfig | null) {
  return template?.fontSizes || {
    TITLE_LARGE: 18,
    TITLE_MEDIUM: 16,
    TITLE_SMALL: 14,
    SECTION_HEADER: 12,
    BODY_LARGE: 10,
    BODY_MEDIUM: 9,
    BODY_SMALL: 8,
    TINY: 7,
  };
}

/**
 * Get template spacing with fallback to defaults
 */
export function getTemplateSpacing(template: TemplateConfig | null) {
  return template?.spacing || {
    SECTION_GAP_LARGE: 40,
    SECTION_GAP_MEDIUM: 30,
    SECTION_GAP_SMALL: 20,
    SECTION_GAP_TINY: 15,
    COLUMN_GAP: 20,
    BOX_PADDING: 8,
    BOX_PADDING_SMALL: 5,
    LINE_SPACING_LARGE: 15,
    LINE_SPACING_MEDIUM: 13,
    LINE_SPACING_SMALL: 11,
    LINE_SPACING_COMPACT: 9,
  };
}

/**
 * Get template line heights with fallback to defaults
 */
export function getTemplateLineHeights(template: TemplateConfig | null) {
  return template?.lineHeights || {
    TITLE: 25,
    SECTION: 20,
    BODY: 15,
    COMPACT: 12,
    DENSE: 10,
  };
}

/**
 * Get template colors as RGB instances with fallback to defaults
 */
export function getTemplateColors(template: TemplateConfig | null): Record<string, RGB> {
  const colorData = template?.colors || {
    TEXT_PRIMARY: { r: 0, g: 0, b: 0 },
    TEXT_SECONDARY: { r: 0.3, g: 0.3, b: 0.3 },
    TEXT_TERTIARY: { r: 0.5, g: 0.5, b: 0.5 },
    TEXT_LIGHT: { r: 0.6, g: 0.6, b: 0.6 },
    BG_TABLE_HEADER: { r: 0.9, g: 0.9, b: 0.9 },
    BG_WHITE: { r: 1, g: 1, b: 1 },
    BG_LIGHT_GRAY: { r: 0.95, g: 0.95, b: 0.95 },
    BORDER_BLACK: { r: 0, g: 0, b: 0 },
    BORDER_GRAY: { r: 0.7, g: 0.7, b: 0.7 },
    BORDER_LIGHT: { r: 0.85, g: 0.85, b: 0.85 },
    ACCENT_RED: { r: 0.8, g: 0, b: 0 },
    ACCENT_BLUE: { r: 0, g: 0, b: 0.8 },
    ACCENT_GREEN: { r: 0, g: 0.6, b: 0 },
  };

  const colors: Record<string, RGB> = {};
  for (const [key, value] of Object.entries(colorData)) {
    colors[key] = rgb(value.r, value.g, value.b);
  }
  return colors;
}

/**
 * Get template company info with fallback to defaults
 */
export function getTemplateCompanyInfo(template: TemplateConfig | null) {
  return {
    NAME: template?.companyName || 'AG COMPOSITES',
    ADDRESS: template?.companyAddress || '230 Hamer Rd, Owens Cross Roads, AL 35763',
    PHONE: template?.companyPhone || '(256) 723-8381',
    EMAIL: template?.companyEmail || 'sales@agcomposites.com',
  };
}
