import express from 'express';
import { db } from '../../db';
import { pdfConfigSettings, insertPdfConfigSettingsSchema } from '../../schema';
import { eq } from 'drizzle-orm';

const router = express.Router();

// Get PDF configuration settings (singleton - returns first record or defaults)
router.get('/api/pdf-settings', async (req, res) => {
  try {
    const settings = await db.select().from(pdfConfigSettings).limit(1);
    
    if (settings.length === 0) {
      // Return default settings if none exist
      const defaultSettings = {
        margins: {
          STANDARD: 40,
          COMPACT: 30,
          WIDE: 50,
        },
        fontSizes: {
          TITLE_LARGE: 18,
          TITLE_MEDIUM: 16,
          TITLE_SMALL: 14,
          SECTION_HEADER: 12,
          BODY_LARGE: 10,
          BODY_MEDIUM: 9,
          BODY_SMALL: 8,
          TINY: 7,
        },
        lineHeights: {
          TITLE: 25,
          SECTION: 20,
          BODY: 15,
          COMPACT: 12,
          DENSE: 10,
        },
        spacing: {
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
        },
        colors: {
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
        },
      };
      
      return res.json(defaultSettings);
    }
    
    res.json(settings[0]);
  } catch (error) {
    console.error('Get PDF settings error:', error);
    res.status(500).json({ 
      error: 'Failed to get PDF settings',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Update PDF configuration settings (upsert - update if exists, create if not)
router.post('/api/pdf-settings', async (req, res) => {
  try {
    const validatedData = insertPdfConfigSettingsSchema.parse({
      ...req.body,
      updatedBy: req.user?.username || 'system',
    });

    // Check if a record exists
    const existing = await db.select().from(pdfConfigSettings).limit(1);
    
    let result;
    if (existing.length === 0) {
      // Insert new record
      [result] = await db.insert(pdfConfigSettings).values({
        ...validatedData,
      }).returning();
    } else {
      // Update existing record
      [result] = await db
        .update(pdfConfigSettings)
        .set({
          ...validatedData,
          updatedAt: new Date(),
        })
        .where(eq(pdfConfigSettings.id, existing[0].id))
        .returning();
    }
    
    res.json(result);
  } catch (error) {
    console.error('Update PDF settings error:', error);
    res.status(500).json({ 
      error: 'Failed to update PDF settings',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Reset PDF configuration settings to defaults
router.post('/api/pdf-settings/reset', async (req, res) => {
  try {
    const defaultSettings = {
      margins: {
        STANDARD: 40,
        COMPACT: 30,
        WIDE: 50,
      },
      fontSizes: {
        TITLE_LARGE: 18,
        TITLE_MEDIUM: 16,
        TITLE_SMALL: 14,
        SECTION_HEADER: 12,
        BODY_LARGE: 10,
        BODY_MEDIUM: 9,
        BODY_SMALL: 8,
        TINY: 7,
      },
      lineHeights: {
        TITLE: 25,
        SECTION: 20,
        BODY: 15,
        COMPACT: 12,
        DENSE: 10,
      },
      spacing: {
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
      },
      colors: {
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
      },
      updatedBy: req.user?.username || 'system',
    };

    const existing = await db.select().from(pdfConfigSettings).limit(1);
    
    let result;
    if (existing.length === 0) {
      [result] = await db.insert(pdfConfigSettings).values(defaultSettings).returning();
    } else {
      [result] = await db
        .update(pdfConfigSettings)
        .set({
          ...defaultSettings,
          updatedAt: new Date(),
        })
        .where(eq(pdfConfigSettings.id, existing[0].id))
        .returning();
    }
    
    res.json(result);
  } catch (error) {
    console.error('Reset PDF settings error:', error);
    res.status(500).json({ 
      error: 'Failed to reset PDF settings',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
