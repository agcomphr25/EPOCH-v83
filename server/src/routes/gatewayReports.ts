import { Router } from 'express';
import { IStorage } from '../../storage';
import { insertGatewayReportSchema } from '../../schema';
import { z } from 'zod';

export function createGatewayReportsRoutes(storage: IStorage): Router {
  const router = Router();

  // Get gateway report for specific date
  router.get('/date/:date', async (req, res) => {
    try {
      const { date } = req.params;
      
      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      }

      const report = await storage.getGatewayReportByDate(date);
      
      if (!report) {
        // Return default values if no report exists
        return res.json({
          date,
          buttpads: 0,
          duratec: 0,
          sandblasting: 0,
          texture: 0
        });
      }
      
      res.json(report);
    } catch (error) {
      console.error('Error fetching gateway report by date:', error);
      res.status(500).json({ error: 'Failed to fetch gateway report' });
    }
  });

  // Get gateway reports for a specific week
  router.get('/week/:weekStart', async (req, res) => {
    try {
      const { weekStart } = req.params;
      
      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(weekStart)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      }

      const reports = await storage.getGatewayReportsByWeek(weekStart);
      res.json(reports);
    } catch (error) {
      console.error('Error fetching gateway reports by week:', error);
      res.status(500).json({ error: 'Failed to fetch gateway reports' });
    }
  });

  // Get weekly summary for a specific week
  router.get('/summary/:weekStart', async (req, res) => {
    try {
      const { weekStart } = req.params;
      
      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(weekStart)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      }

      const summary = await storage.getWeeklySummary(weekStart);
      res.json(summary);
    } catch (error) {
      console.error('Error fetching weekly summary:', error);
      res.status(500).json({ error: 'Failed to fetch weekly summary' });
    }
  });

  // Create or update gateway report
  router.post('/', async (req, res) => {
    try {
      // Validate request body
      const validatedData = insertGatewayReportSchema.parse(req.body);
      
      const report = await storage.createOrUpdateGatewayReport(validatedData);
      res.json(report);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      
      console.error('Error creating/updating gateway report:', error);
      res.status(500).json({ error: 'Failed to create/update gateway report' });
    }
  });

  return router;
}