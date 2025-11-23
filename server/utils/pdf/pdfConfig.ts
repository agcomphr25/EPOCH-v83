import { PDFDocument, PDFPage, PDFFont, rgb, RGB } from 'pdf-lib';
import * as fs from 'fs';
import { resolveAssetPath } from '../../src/utils/assetPaths';

/**
 * Centralized PDF Configuration Module
 * 
 * This module provides standardized settings for all PDF generation functions
 * to ensure consistency in spacing, layout, fonts, and visual appearance.
 * 
 * Based on the standards established in the Sales Order PDF.
 */

// ============================================
// PAGE LAYOUT CONFIGURATION
// ============================================

export const PAGE_SIZES = {
  LETTER_PORTRAIT: [612, 792] as [number, number],
  LETTER_LANDSCAPE: [792, 612] as [number, number],
};

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
