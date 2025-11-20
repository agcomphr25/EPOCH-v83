import { Router } from 'express';
import { storage } from '../../storage';
import { insertGatewayReportSchema } from '../../schema';

const router = Router();

// Get report for a specific week
router.get('/week/:weekStartDate', async (req, res) => {
  try {
    const { weekStartDate } = req.params;
    const report = await storage.getGatewayReportByWeek(weekStartDate);
    
    res.json(report || {});
  } catch (error) {
    console.error('Error fetching gateway report:', error);
    res.status(500).json({ error: 'Failed to fetch gateway report' });
  }
});

// Get trends data (6 months by default)
router.get('/trends', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Default to 6 months of data if not specified
    const end = endDate as string || new Date().toISOString().split('T')[0];
    const start = startDate as string || new Date(new Date().setMonth(new Date().getMonth() - 6)).toISOString().split('T')[0];
    
    const reports = await storage.getGatewayReportsTrends(start, end);
    
    res.json(reports);
  } catch (error) {
    console.error('Error fetching gateway reports trends:', error);
    res.status(500).json({ error: 'Failed to fetch trends data' });
  }
});

// Create or update a weekly report
router.post('/', async (req, res) => {
  try {
    const validatedData = insertGatewayReportSchema.parse(req.body);
    const report = await storage.createOrUpdateGatewayReport(validatedData);
    
    res.json(report);
  } catch (error) {
    console.error('Error saving gateway report:', error);
    res.status(500).json({ error: 'Failed to save gateway report' });
  }
});

export default router;
