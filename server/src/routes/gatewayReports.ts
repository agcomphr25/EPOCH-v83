import { Router } from 'express';
import { db } from '../../db';
import { gatewayReports, insertGatewayReportSchema } from '../../schema';
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm';

const router = Router();

// Get all gateway reports with optional date range filtering
router.get('/', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let query = db.select().from(gatewayReports);
    
    if (startDate && endDate) {
      query = query.where(
        and(
          gte(gatewayReports.weekStartDate, startDate as string),
          lte(gatewayReports.weekStartDate, endDate as string)
        )
      );
    }
    
    const reports = await query.orderBy(desc(gatewayReports.weekStartDate));
    
    res.json({ data: reports });
  } catch (error) {
    console.error('Error fetching gateway reports:', error);
    res.status(500).json({ error: 'Failed to fetch gateway reports' });
  }
});

// Get a specific gateway report by week start date
router.get('/week/:weekStartDate', async (req, res) => {
  try {
    const { weekStartDate } = req.params;
    
    const report = await db
      .select()
      .from(gatewayReports)
      .where(eq(gatewayReports.weekStartDate, weekStartDate))
      .limit(1);
    
    if (report.length === 0) {
      return res.status(404).json({ error: 'Report not found for this week' });
    }
    
    res.json(report[0]);
  } catch (error) {
    console.error('Error fetching gateway report:', error);
    res.status(500).json({ error: 'Failed to fetch gateway report' });
  }
});

// Create or update a gateway report
router.post('/', async (req, res) => {
  try {
    const username = req.session?.user?.username;
    
    const validated = insertGatewayReportSchema.parse({
      ...req.body,
      createdBy: username,
      updatedBy: username,
    });
    
    // Check if report already exists for this week
    const existing = await db
      .select()
      .from(gatewayReports)
      .where(eq(gatewayReports.weekStartDate, validated.weekStartDate))
      .limit(1);
    
    if (existing.length > 0) {
      // Update existing report
      const updated = await db
        .update(gatewayReports)
        .set({
          ...validated,
          updatedBy: username,
          updatedAt: new Date(),
        })
        .where(eq(gatewayReports.weekStartDate, validated.weekStartDate))
        .returning();
      
      return res.json(updated[0]);
    } else {
      // Create new report
      const created = await db
        .insert(gatewayReports)
        .values(validated)
        .returning();
      
      return res.status(201).json(created[0]);
    }
  } catch (error) {
    console.error('Error saving gateway report:', error);
    res.status(400).json({ error: 'Failed to save gateway report' });
  }
});

// Get summary statistics (weekly, monthly, YTD)
router.get('/stats', async (req, res) => {
  try {
    const { year } = req.query;
    const currentYear = year ? parseInt(year as string) : new Date().getFullYear();
    
    // Get all reports for the year
    const yearReports = await db
      .select()
      .from(gatewayReports)
      .where(eq(gatewayReports.year, currentYear))
      .orderBy(gatewayReports.weekStartDate);
    
    // Calculate totals by function
    const stats = {
      buttpads: {
        total: 0,
        byMonth: {} as Record<number, number>,
      },
      sandblasting: {
        total: 0,
        byMonth: {} as Record<number, number>,
      },
      duratec: {
        total: 0,
        byMonth: {} as Record<number, number>,
      },
      texture: {
        total: 0,
        byMonth: {} as Record<number, number>,
      },
    };
    
    yearReports.forEach((report) => {
      const month = new Date(report.weekStartDate).getMonth() + 1;
      
      // Buttpads
      const buttpadsTotal = 
        report.buttpadsMon + report.buttpadsTue + report.buttpadsWed + 
        report.buttpadsThu + report.buttpadsFri;
      stats.buttpads.total += buttpadsTotal;
      stats.buttpads.byMonth[month] = (stats.buttpads.byMonth[month] || 0) + buttpadsTotal;
      
      // Sandblasting
      const sandblastingTotal = 
        report.sandblastingMon + report.sandblastingTue + report.sandblastingWed + 
        report.sandblastingThu + report.sandblastingFri;
      stats.sandblasting.total += sandblastingTotal;
      stats.sandblasting.byMonth[month] = (stats.sandblasting.byMonth[month] || 0) + sandblastingTotal;
      
      // Duratec
      const duratecTotal = 
        report.duratecMon + report.duratecTue + report.duratecWed + 
        report.duratecThu + report.duratecFri;
      stats.duratec.total += duratecTotal;
      stats.duratec.byMonth[month] = (stats.duratec.byMonth[month] || 0) + duratecTotal;
      
      // Texture
      const textureTotal = 
        report.textureMon + report.textureTue + report.textureWed + 
        report.textureThu + report.textureFri;
      stats.texture.total += textureTotal;
      stats.texture.byMonth[month] = (stats.texture.byMonth[month] || 0) + textureTotal;
    });
    
    res.json({ year: currentYear, stats });
  } catch (error) {
    console.error('Error fetching gateway report stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

export default router;
