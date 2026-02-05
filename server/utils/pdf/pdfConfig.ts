import { PDFDocument, PDFPage, PDFFont, rgb, RGB } from 'pdf-lib';
import * as fs from 'fs';
import { resolveAssetPath } from '../../src/utils/assetPaths';
import { db } from '../../db';
import { pdfConfigSettings } from '../../schema';

/**
 * Centralized PDF Configuration Module
 * 
 * This module provides standardized settings for all PDF generation functions
 * to ensure consistency in spacing, layout, fonts, and visual appearance.
 * 
 * Settings can be customized via the database (pdf_config_settings table).
 * If no custom settings exist, defaults are used.
 * 
 * Based on the standards established in the Sales Order PDF.
 */

// ============================================
// DATABASE SETTINGS LOADER
// ============================================

interface DBSettings {
  margins?: Record<string, number>;
  fontSizes?: Record<string, number>;
  lineHeights?: Record<string, number>;
  spacing?: Record<string, number>;
  colors?: Record<string, { r: number; g: number; b: number }>;
}

let cachedSettings: DBSettings | null = null;
let lastFetch: number = 0;
const CACHE_TTL = 60000; // Cache for 1 minute

/**
 * Clear the PDF settings cache
 * Call this after updating settings in the database
 */
export function clearSettingsCache() {
  cachedSettings = null;
  lastFetch = 0;
}

/**
 * Load PDF configuration from database with caching
 * Falls back to hard-coded defaults if database is unavailable
 */
async function loadSettings(): Promise<DBSettings> {
  const now = Date.now();
  
  // Return cached settings if still valid
  if (cachedSettings && (now - lastFetch) < CACHE_TTL) {
    return cachedSettings;
  }
  
  try {
    const settings = await db.select().from(pdfConfigSettings).limit(1);
    
    if (settings.length > 0) {
      cachedSettings = {
        margins: settings[0].margins as Record<string, number>,
        fontSizes: settings[0].fontSizes as Record<string, number>,
        lineHeights: settings[0].lineHeights as Record<string, number>,
        spacing: settings[0].spacing as Record<string, number>,
        colors: settings[0].colors as Record<string, { r: number; g: number; b: number }>,
      };
      lastFetch = now;
      return cachedSettings;
    }
  } catch (error) {
    console.warn('⚠️ [PDF Config] Failed to load settings from database, using defaults:', error);
  }
  
  // Return empty object to trigger fallback to defaults
  return {};
}

// ============================================
// DYNAMIC CONFIGURATION GETTERS
// ============================================

/**
 * Get margins with database override or defaults
 */
export async function getMargins() {
  const settings = await loadSettings();
  return settings.margins || {
    STANDARD: 40,
    COMPACT: 30,
    WIDE: 50,
  };
}

/**
 * Get font sizes with database override or defaults
 */
export async function getFontSizes() {
  const settings = await loadSettings();
  return settings.fontSizes || {
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
 * Get line heights with database override or defaults
 */
export async function getLineHeights() {
  const settings = await loadSettings();
  return settings.lineHeights || {
    TITLE: 25,
    SECTION: 20,
    BODY: 15,
    COMPACT: 12,
    DENSE: 10,
  };
}

/**
 * Get spacing with database override or defaults
 */
export async function getSpacing() {
  const settings = await loadSettings();
  return settings.spacing || {
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
 * Get colors with database override or defaults
 * Converts color objects to RGB instances
 */
export async function getColors() {
  const settings = await loadSettings();
  const colorData = settings.colors || {
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
  
  // Convert color objects to RGB instances
  const colors: Record<string, RGB> = {};
  for (const [key, value] of Object.entries(colorData)) {
    colors[key] = rgb(value.r, value.g, value.b);
  }
  return colors;
}

// ============================================
// PAGE LAYOUT CONFIGURATION
// ============================================

export const PAGE_SIZES = {
  LETTER_PORTRAIT: [612, 792] as [number, number],
  LETTER_LANDSCAPE: [792, 612] as [number, number],
};

// Legacy exports for backward compatibility (use get functions above for database-aware settings)
export const MARGINS = {
  STANDARD: 40,
  COMPACT: 30,
  WIDE: 50,
};

// Default margin for all documents
export const DEFAULT_MARGIN = MARGINS.STANDARD;

// Calculate printable width/height
export function getPrintableArea(pageWidth: number, pageHeight: number, margin: number = DEFAULT_MARGIN) {
  return {
    width: pageWidth - margin * 2,
    height: pageHeight - margin * 2,
    margin,
  };
}

// ============================================
// TYPOGRAPHY CONFIGURATION
// ============================================

export const FONT_SIZES = {
  // Headers
  TITLE_LARGE: 18,
  TITLE_MEDIUM: 16,
  TITLE_SMALL: 14,
  SECTION_HEADER: 12,
  
  // Body text
  BODY_LARGE: 10,
  BODY_MEDIUM: 9,
  BODY_SMALL: 8,
  
  // Special
  TINY: 7,
};

export const LINE_HEIGHTS = {
  TITLE: 25,
  SECTION: 20,
  BODY: 15,
  COMPACT: 12,
  DENSE: 10,
};

// ============================================
// SPACING CONFIGURATION
// ============================================

export const SPACING = {
  // Vertical spacing between sections
  SECTION_GAP_LARGE: 40,
  SECTION_GAP_MEDIUM: 30,
  SECTION_GAP_SMALL: 20,
  SECTION_GAP_TINY: 15,
  
  // Horizontal spacing
  COLUMN_GAP: 20,
  
  // Padding inside elements
  BOX_PADDING: 8,
  BOX_PADDING_SMALL: 5,
  
  // Line spacing
  LINE_SPACING_LARGE: 15,
  LINE_SPACING_MEDIUM: 13,
  LINE_SPACING_SMALL: 11,
  LINE_SPACING_COMPACT: 9,
};

// ============================================
// COLOR CONFIGURATION
// ============================================

export const COLORS = {
  // Text colors
  TEXT_PRIMARY: rgb(0, 0, 0),
  TEXT_SECONDARY: rgb(0.3, 0.3, 0.3),
  TEXT_TERTIARY: rgb(0.5, 0.5, 0.5),
  TEXT_LIGHT: rgb(0.6, 0.6, 0.6),
  
  // Background colors
  BG_TABLE_HEADER: rgb(0.9, 0.9, 0.9),
  BG_WHITE: rgb(1, 1, 1),
  BG_LIGHT_GRAY: rgb(0.95, 0.95, 0.95),
  
  // Border colors
  BORDER_BLACK: rgb(0, 0, 0),
  BORDER_GRAY: rgb(0.7, 0.7, 0.7),
  BORDER_LIGHT: rgb(0.85, 0.85, 0.85),
  
  // Accent colors
  ACCENT_RED: rgb(0.8, 0, 0),
  ACCENT_BLUE: rgb(0, 0, 0.8),
  ACCENT_GREEN: rgb(0, 0.6, 0),
  ACCENT_ORANGE: rgb(0.85, 0.55, 0.15), // Amber/orange for Stiller badge
};

// ============================================
// LOGO CONFIGURATION
// ============================================

export const LOGO_CONFIG = {
  WIDTH: 150,
  // Height is calculated based on aspect ratio
  VERTICAL_SPACING: 15, // Space after logo
};

/**
 * Load and embed company logo in PDF
 * @param pdfDoc - The PDF document
 * @returns The embedded logo or null if not found
 */
export async function embedCompanyLogo(pdfDoc: PDFDocument) {
  try {
    console.log('🖼️ [PDF] Attempting to embed company logo...');
    const logoPath = resolveAssetPath('logo_updated.png');
    console.log(`🖼️ [PDF] Logo path resolved to: ${logoPath}`);
    
    if (fs.existsSync(logoPath)) {
      console.log('✅ [PDF] Logo file exists, reading...');
      const logoImageBytes = fs.readFileSync(logoPath);
      console.log(`✅ [PDF] Logo loaded (${logoImageBytes.length} bytes), embedding in PDF...`);
      const embeddedLogo = await pdfDoc.embedPng(logoImageBytes);
      console.log('✅ [PDF] Logo successfully embedded');
      return embeddedLogo;
    } else {
      console.warn('⚠️ [PDF] Logo file not found at:', logoPath);
    }
  } catch (error) {
    console.error('❌ [PDF] Error loading company logo:', error);
  }
  console.log('⚠️ [PDF] Continuing without logo');
  return null;
}

/**
 * Get logo dimensions maintaining aspect ratio
 */
export function getLogoDimensions(logo: any) {
  const logoWidth = LOGO_CONFIG.WIDTH;
  const logoHeight = logoWidth * (logo.height / logo.width);
  return { width: logoWidth, height: logoHeight };
}

// ============================================
// COMPANY INFORMATION
// ============================================

export const COMPANY_INFO = {
  NAME: 'AG COMPOSITES',
  ADDRESS: '230 Hamer Rd, Owens Cross Roads, AL 35763',
  PHONE: '(256) 723-8381',
  EMAIL: 'sales@agcomposites.com',
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Draw a standard document header with logo and company info
 */
export async function drawStandardHeader(
  page: PDFPage,
  pdfDoc: PDFDocument,
  regularFont: PDFFont,
  boldFont: PDFFont,
  startY: number,
  margin: number = DEFAULT_MARGIN
): Promise<number> {
  let currentY = startY;
  
  const logo = await embedCompanyLogo(pdfDoc);
  
  if (logo) {
    const { width: logoWidth, height: logoHeight } = getLogoDimensions(logo);
    
    page.drawImage(logo, {
      x: margin,
      y: currentY - logoHeight,
      width: logoWidth,
      height: logoHeight,
    });
    
    currentY -= logoHeight + LOGO_CONFIG.VERTICAL_SPACING;
    
    // Company address
    page.drawText(COMPANY_INFO.ADDRESS, {
      x: margin,
      y: currentY,
      size: FONT_SIZES.BODY_SMALL,
      font: regularFont,
      color: COLORS.TEXT_SECONDARY,
    });
    
    currentY -= LINE_HEIGHTS.COMPACT;
    
    // Company contact info
    page.drawText(`Phone: ${COMPANY_INFO.PHONE} | Email: ${COMPANY_INFO.EMAIL}`, {
      x: margin,
      y: currentY,
      size: FONT_SIZES.BODY_SMALL,
      font: regularFont,
      color: COLORS.TEXT_SECONDARY,
    });
    
    currentY -= SPACING.SECTION_GAP_SMALL;
  } else {
    // Fallback to text header if logo fails
    page.drawText(COMPANY_INFO.NAME, {
      x: margin,
      y: currentY,
      size: FONT_SIZES.TITLE_LARGE,
      font: boldFont,
      color: COLORS.TEXT_PRIMARY,
    });
    
    currentY -= SPACING.SECTION_GAP_SMALL;
  }
  
  return currentY;
}

/**
 * Draw a table header row with gray background
 */
export function drawTableHeader(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  columns: Array<{ text: string; x: number }>,
  boldFont: PDFFont
) {
  // Draw header background
  page.drawRectangle({
    x,
    y: y - height,
    width,
    height,
    color: COLORS.BG_TABLE_HEADER,
    borderColor: COLORS.BORDER_BLACK,
    borderWidth: 1,
  });
  
  // Draw column headers
  columns.forEach(column => {
    page.drawText(column.text, {
      x: column.x,
      y: y - height + SPACING.BOX_PADDING,
      size: FONT_SIZES.BODY_SMALL,
      font: boldFont,
    });
  });
}

/**
 * Draw a standard info box (like order details box)
 */
export function drawInfoBox(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  title?: string,
  boldFont?: PDFFont
) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: COLORS.BORDER_BLACK,
    borderWidth: 1,
  });
  
  // Draw title above box if provided
  if (title && boldFont) {
    page.drawText(title, {
      x,
      y: y + height + SPACING.LINE_SPACING_SMALL,
      size: FONT_SIZES.TITLE_MEDIUM,
      font: boldFont,
      color: COLORS.TEXT_PRIMARY,
    });
  }
}

/**
 * Wrap text to fit within a specified width
 */
export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  font: PDFFont
): string[] {
  const paragraphs = text.split(/\r?\n/);
  const allLines: string[] = [];

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      allLines.push('');
      continue;
    }

    const words = paragraph.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);
      
      if (testWidth > maxWidth && currentLine) {
        allLines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine) {
      allLines.push(currentLine);
    }
  }
  
  return allLines;
}

/**
 * Calculate centered X position for text
 */
export function getCenteredX(text: string, pageWidth: number, fontSize: number, font: PDFFont): number {
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  return (pageWidth - textWidth) / 2;
}

/**
 * Draw a section header and return consumed height
 */
export function drawSectionHeader(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  boldFont: PDFFont
): number {
  page.drawText(text, {
    x,
    y,
    size: FONT_SIZES.SECTION_HEADER,
    font: boldFont,
    color: COLORS.TEXT_PRIMARY,
  });
  
  return LINE_HEIGHTS.SECTION;
}

/**
 * Draw a key-value pair and return consumed height
 */
export function drawKeyValuePair(
  page: PDFPage,
  key: string,
  value: string,
  x: number,
  y: number,
  regularFont: PDFFont,
  boldFont?: PDFFont
): number {
  const keyText = `${key}: ${value}`;
  page.drawText(keyText, {
    x,
    y,
    size: FONT_SIZES.BODY_MEDIUM,
    font: boldFont || regularFont,
  });
  
  return LINE_HEIGHTS.BODY;
}

/**
 * Draw a simple table with key-value rows
 * Returns total consumed height
 */
export function drawSimpleTable(
  page: PDFPage,
  rows: Array<{ label: string; value: string }>,
  x: number,
  startY: number,
  regularFont: PDFFont,
  indentLevel: number = 0
): number {
  let currentY = startY;
  const indent = indentLevel * 20;
  
  rows.forEach(row => {
    page.drawText(`${row.label}: ${row.value}`, {
      x: x + indent,
      y: currentY,
      size: FONT_SIZES.BODY_MEDIUM,
      font: regularFont,
    });
    currentY -= LINE_HEIGHTS.BODY;
  });
  
  return startY - currentY;
}

export type TermsType = 'initial' | 'warranty';

export interface TermsContent {
  title: string;
  lines: string[];
}

export const INITIAL_TERMS: TermsContent = {
  title: 'Initial Terms and Conditions',
  lines: [
    '1. Please review the specs indicated and make sure they match your intent.',
    '2. Any changes to specs requested after 30 days from Order Date may result in additional',
    '   charges.',
    '3. Remington "clones" are not made by Remington and may not fit as exactly as Remington',
    '   models do.',
    '4. The Estimated Completion Date is an estimation based on our current capacity and the',
    '   specs of your order. We make every effort to ship stocks by the Estimated Completion Date',
    '5. Please sign and return a copy of this form, or reply to the email that you are in agreement',
    '   with the specs of your order and these terms and conditions. We are not able to place any',
    '   order into production without a confirmation.',
  ],
};

export const WARRANTY_TERMS: TermsContent = {
  title: 'Stocks Warranty & Shipping Terms',
  lines: [
    'STOCKS WARRANTY: 100% Guaranteed Satisfaction',
    '',
    'Every AG Composites stock carries a Lifetime Warranty against cracking, warping, splitting,',
    'breaking or becoming unserviceable. If a problem occurs, the stock will be repaired, replaced',
    'or the purchase price will be refunded at our option. Paint defects caused through normal use',
    'of the stock by the consumer are not warrantied. Contact us to return a product.',
    '',
    'The warranty is voided if the end user modifies the stock or uses the stock for a purpose for',
    'which it was not designed. All AGC stocks have been extensively tested and carry a warranty',
    'up to 300 RUM caliber. Using a more energetic caliber voids the warranty and AGC is not',
    'responsible for any damage or injury as a result of using the stock outside its tested capabilities.',
    '',
    'AGC only warranties products we produce. No warranty is applied to accessories or products we',
    'purchase from other manufacturers.',
    '',
    'If for any reason you are not 100% satisfied with your AG stock, return it within 30 days in',
    'good condition for a full refund or exchange. Shipping and handling charges are non-refundable.',
    'In addition, due to credit card transaction fees you will receive your refund minus 4%.',
    '',
    'We only guarantee the fitment for the actions, barrel channels and bottom metals we offer. If you',
    'order a stock with one of our options and try to put a different brand hardware in the stock, we',
    'DO NOT GUARANTEE that it will fit. Even though manufacturers say their hardware is a "Rem Clone"',
    'there is a high probability that there will be subtle differences resulting in fitment issues. In this',
    'case you can return the stock in good condition with no modifications. We will assess a 15%',
    'restocking fee and your return shipping charges will not be refunded.',
  ],
};

export function getTermsContent(termsType: TermsType): TermsContent {
  return termsType === 'warranty' ? WARRANTY_TERMS : INITIAL_TERMS;
}
