/**
 * Seed Default PDF Templates
 * 
 * Creates default templates for P2 Purchase Orders and RFQ Risk Assessments
 * Run with: npm run seed-templates (or manually via tsx)
 */

import { db } from '../db';
import { pdfTemplates } from '../schema';
import { eq } from 'drizzle-orm';

const DEFAULT_MARGINS = {
  STANDARD: 40,
  COMPACT: 30,
  WIDE: 50,
};

const DEFAULT_FONT_SIZES = {
  TITLE_LARGE: 18,
  TITLE_MEDIUM: 16,
  TITLE_SMALL: 14,
  SECTION_HEADER: 12,
  BODY_LARGE: 10,
  BODY_MEDIUM: 9,
  BODY_SMALL: 8,
  TINY: 7,
};

const DEFAULT_SPACING = {
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

const DEFAULT_LINE_HEIGHTS = {
  TITLE: 25,
  SECTION: 20,
  BODY: 15,
  COMPACT: 12,
  DENSE: 10,
};

const DEFAULT_COLORS = {
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

const DEFAULT_COMPANY_INFO = {
  NAME: 'AG COMPOSITES',
  ADDRESS: '230 Hamer Rd, Owens Cross Roads, AL 35763',
  PHONE: '(256) 723-8381',
  EMAIL: 'sales@agcomposites.com',
};

async function seedTemplates() {
  console.log('🌱 Starting PDF Template Seeding...\n');

  try {
    // Check if templates already exist
    const existingP2 = await db
      .select()
      .from(pdfTemplates)
      .where(eq(pdfTemplates.templateType, 'p2_purchase_order'))
      .limit(1);

    const existingRFQ = await db
      .select()
      .from(pdfTemplates)
      .where(eq(pdfTemplates.templateType, 'rfq_risk_assessment'))
      .limit(1);

    // Seed P2 Purchase Order Template
    if (existingP2.length === 0) {
      console.log('📄 Creating default P2 Purchase Order template...');
      await db.insert(pdfTemplates).values({
        name: 'Default P2 Purchase Order',
        templateType: 'p2_purchase_order',
        description: 'Default template for P2 purchase order quotes with standard AG Composites branding',
        isActive: true,
        companyName: DEFAULT_COMPANY_INFO.NAME,
        companyAddress: DEFAULT_COMPANY_INFO.ADDRESS,
        companyPhone: DEFAULT_COMPANY_INFO.PHONE,
        companyEmail: DEFAULT_COMPANY_INFO.EMAIL,
        logoPath: null, // No logo by default, users can upload
        margins: DEFAULT_MARGINS,
        fontSizes: DEFAULT_FONT_SIZES,
        spacing: DEFAULT_SPACING,
        lineHeights: DEFAULT_LINE_HEIGHTS,
        colors: DEFAULT_COLORS,
        createdBy: 'system',
        updatedBy: 'system',
      });
      console.log('✅ P2 Purchase Order template created\n');
    } else {
      console.log('ℹ️  P2 Purchase Order template already exists, skipping...\n');
    }

    // Seed RFQ Risk Assessment Template
    if (existingRFQ.length === 0) {
      console.log('📄 Creating default RFQ Risk Assessment template...');
      await db.insert(pdfTemplates).values({
        name: 'Default RFQ Risk Assessment',
        templateType: 'rfq_risk_assessment',
        description: 'Default template for RFQ risk assessment reports with standard AG Composites branding',
        isActive: true,
        companyName: DEFAULT_COMPANY_INFO.NAME,
        companyAddress: DEFAULT_COMPANY_INFO.ADDRESS,
        companyPhone: DEFAULT_COMPANY_INFO.PHONE,
        companyEmail: DEFAULT_COMPANY_INFO.EMAIL,
        logoPath: null, // No logo by default, users can upload
        margins: DEFAULT_MARGINS,
        fontSizes: DEFAULT_FONT_SIZES,
        spacing: DEFAULT_SPACING,
        lineHeights: DEFAULT_LINE_HEIGHTS,
        colors: DEFAULT_COLORS,
        createdBy: 'system',
        updatedBy: 'system',
      });
      console.log('✅ RFQ Risk Assessment template created\n');
    } else {
      console.log('ℹ️  RFQ Risk Assessment template already exists, skipping...\n');
    }

    console.log('✅ PDF Template seeding completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Visit /pdf-templates to manage templates');
    console.log('2. Upload custom logos for each template');
    console.log('3. Customize styling as needed\n');

  } catch (error) {
    console.error('❌ Error seeding PDF templates:', error);
    throw error;
  }
}

// Run seeding if called directly
if (require.main === module) {
  seedTemplates()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { seedTemplates };
