import { Router } from 'express';
import { z } from 'zod';
import { storage } from '../../storage';
import { insertDailyActivityCountSchema } from '../../schema';

const router = Router();

// Get all daily activity counts
router.get('/', async (req, res) => {
  try {
    const activities = await storage.getAllDailyActivityCounts();
    res.json(activities);
  } catch (error) {
    console.error('Error fetching daily activity counts:', error);
    res.status(500).json({ error: 'Failed to fetch daily activity counts' });
  }
});

// Get daily activity counts by date
router.get('/date/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const activities = await storage.getDailyActivityCountsByDate(date);
    res.json(activities);
  } catch (error) {
    console.error('Error fetching daily activity counts by date:', error);
    res.status(500).json({ error: 'Failed to fetch daily activity counts by date' });
  }
});

// Get daily activity counts by date range
router.get('/range/:startDate/:endDate', async (req, res) => {
  try {
    const { startDate, endDate } = req.params;
    const activities = await storage.getDailyActivityCountsByDateRange(startDate, endDate);
    res.json(activities);
  } catch (error) {
    console.error('Error fetching daily activity counts by date range:', error);
    res.status(500).json({ error: 'Failed to fetch daily activity counts by date range' });
  }
});

// Get single daily activity count by ID
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    const activity = await storage.getDailyActivityCount(id);
    if (!activity) {
      return res.status(404).json({ error: 'Daily activity count not found' });
    }

    res.json(activity);
  } catch (error) {
    console.error('Error fetching daily activity count:', error);
    res.status(500).json({ error: 'Failed to fetch daily activity count' });
  }
});

// Create new daily activity count
router.post('/', async (req, res) => {
  try {
    const validatedData = insertDailyActivityCountSchema.parse(req.body);
    const activity = await storage.createDailyActivityCount(validatedData);
    res.status(201).json(activity);
  } catch (error) {
    console.error('Error creating daily activity count:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create daily activity count' });
  }
});

// Update daily activity count
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    const validatedData = insertDailyActivityCountSchema.partial().parse(req.body);
    const activity = await storage.updateDailyActivityCount(id, validatedData);
    res.json(activity);
  } catch (error) {
    console.error('Error updating daily activity count:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: 'Daily activity count not found' });
    }
    res.status(500).json({ error: 'Failed to update daily activity count' });
  }
});

// Delete daily activity count
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    await storage.deleteDailyActivityCount(id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting daily activity count:', error);
    res.status(500).json({ error: 'Failed to delete daily activity count' });
  }
});

// Upsert daily activity count (create or update based on date + activity type)
router.post('/upsert', async (req, res) => {
  try {
    const { date, activityType, count, enteredBy, notes } = req.body;

    // Validate required fields
    if (!date || !activityType || count === undefined || count === null) {
      return res.status(400).json({ 
        error: 'Missing required fields: date, activityType, and count are required' 
      });
    }

    // Validate activityType
    const validActivityTypes = ['Buttpads', 'Duratec', 'Texture', 'Sandblaster'];
    if (!validActivityTypes.includes(activityType)) {
      return res.status(400).json({ 
        error: `Invalid activity type. Must be one of: ${validActivityTypes.join(', ')}` 
      });
    }

    // Validate count is non-negative integer
    const numCount = parseInt(count);
    if (isNaN(numCount) || numCount < 0) {
      return res.status(400).json({ 
        error: 'Count must be a non-negative integer' 
      });
    }

    const activity = await storage.upsertDailyActivityCount(date, activityType, numCount, enteredBy, notes);
    res.json(activity);
  } catch (error) {
    console.error('Error upserting daily activity count:', error);
    res.status(500).json({ error: 'Failed to save daily activity count' });
  }
});

export default router;