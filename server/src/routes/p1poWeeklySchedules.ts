import { Router } from 'express';
import { storage } from '../../storage';
import { insertP1POWeeklyScheduleSchema } from '../../schema';
import { z } from 'zod';

const router = Router();

// Get all weekly schedules for a specific purchase order
router.get('/:poId', async (req, res) => {
  try {
    const poId = parseInt(req.params.poId);
    if (isNaN(poId)) {
      return res.status(400).json({ error: 'Invalid purchase order ID' });
    }

    const schedules = await storage.getP1POWeeklySchedules(poId);
    res.json(schedules);
  } catch (error) {
    console.error('Error fetching P1PO weekly schedules:', error);
    res.status(500).json({ error: 'Failed to fetch weekly schedules' });
  }
});

// Get all active weekly schedules (for layup scheduler integration)
router.get('/', async (req, res) => {
  try {
    const schedules = await storage.getActiveP1POWeeklySchedules();
    res.json(schedules);
  } catch (error) {
    console.error('Error fetching active P1PO weekly schedules:', error);
    res.status(500).json({ error: 'Failed to fetch active weekly schedules' });
  }
});

// Create a new weekly schedule
router.post('/', async (req, res) => {
  try {
    const validatedData = insertP1POWeeklyScheduleSchema.parse(req.body);
    const schedule = await storage.createP1POWeeklySchedule(validatedData);
    res.status(201).json(schedule);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid data', details: error.errors });
    }
    console.error('Error creating P1PO weekly schedule:', error);
    res.status(500).json({ error: 'Failed to create weekly schedule' });
  }
});

// Calculate weekly schedules for a purchase order
router.post('/:poId/calculate', async (req, res) => {
  try {
    const poId = parseInt(req.params.poId);
    if (isNaN(poId)) {
      return res.status(400).json({ error: 'Invalid purchase order ID' });
    }

    const schedules = await storage.calculateP1POWeeklySchedule(poId);
    res.json({
      message: `Generated ${schedules.length} weekly schedules`,
      schedules
    });
  } catch (error) {
    console.error('Error calculating P1PO weekly schedules:', error);
    res.status(500).json({ 
      error: 'Failed to calculate weekly schedules',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update a weekly schedule
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid schedule ID' });
    }

    const validatedData = insertP1POWeeklyScheduleSchema.partial().parse(req.body);
    const schedule = await storage.updateP1POWeeklySchedule(id, validatedData);
    res.json(schedule);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid data', details: error.errors });
    }
    console.error('Error updating P1PO weekly schedule:', error);
    res.status(500).json({ error: 'Failed to update weekly schedule' });
  }
});

// Toggle active status of a weekly schedule
router.put('/:id/toggle', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { isActive } = req.body;
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid schedule ID' });
    }
    
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be a boolean' });
    }

    const schedule = await storage.toggleP1POWeeklyScheduleActive(id, isActive);
    res.json({
      message: `Weekly schedule ${isActive ? 'activated' : 'deactivated'}`,
      schedule
    });
  } catch (error) {
    console.error('Error toggling P1PO weekly schedule active status:', error);
    res.status(500).json({ error: 'Failed to toggle schedule active status' });
  }
});

// Delete a weekly schedule
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid schedule ID' });
    }

    await storage.deleteP1POWeeklySchedule(id);
    res.json({ message: 'Weekly schedule deleted successfully' });
  } catch (error) {
    console.error('Error deleting P1PO weekly schedule:', error);
    res.status(500).json({ error: 'Failed to delete weekly schedule' });
  }
});

export default router;