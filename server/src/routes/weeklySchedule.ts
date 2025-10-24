import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { insertWeeklyScheduleAssignmentSchema } from '@shared/schema';

const router = Router();

router.get('/:weekStartDate', async (req: Request, res: Response) => {
    try {
      const { weekStartDate } = req.params;
      const scheduleWithDetails = await storage.getWeeklyScheduleWithDetails(weekStartDate);
      res.json(scheduleWithDetails);
    } catch (error: any) {
      console.error('[WeeklySchedule] Error fetching schedule:', error);
      res.status(500).json({ error: 'Failed to fetch weekly schedule' });
    }
});

router.post('/', async (req: Request, res: Response) => {
    try {
      const validatedData = insertWeeklyScheduleAssignmentSchema.parse(req.body);
      const assignment = await storage.createWeeklyScheduleAssignment(validatedData);
      res.status(201).json(assignment);
    } catch (error: any) {
      console.error('[WeeklySchedule] Error creating assignment:', error);
      res.status(400).json({ error: error.message || 'Failed to create assignment' });
    }
});

router.post('/batch', async (req: Request, res: Response) => {
    try {
      const { assignments } = req.body;
      
      if (!Array.isArray(assignments) || assignments.length === 0) {
        return res.status(400).json({ error: 'Assignments array is required' });
      }

      const created = await Promise.all(
        assignments.map((assignment: any) => {
          const validatedData = insertWeeklyScheduleAssignmentSchema.parse(assignment);
          return storage.createWeeklyScheduleAssignment(validatedData);
        })
      );

      res.status(201).json({ count: created.length, assignments: created });
    } catch (error: any) {
      console.error('[WeeklySchedule] Error creating batch assignments:', error);
      res.status(400).json({ error: error.message || 'Failed to create batch assignments' });
    }
});

router.get('/:weekStartDate/mold-usage/:dayOfWeek', async (req: Request, res: Response) => {
    try {
      const { weekStartDate, dayOfWeek } = req.params;
      const moldUsage = await storage.getDailyMoldUsage(weekStartDate, dayOfWeek);
      
      const moldAvailability = await storage.getMoldAvailability();
      
      res.json({
        dayOfWeek,
        moldsUsed: moldUsage,
        totalCapacity: moldAvailability.totalCapacity,
        available: moldAvailability.totalCapacity - moldUsage,
      });
    } catch (error: any) {
      console.error('[WeeklySchedule] Error fetching mold usage:', error);
      res.status(500).json({ error: 'Failed to fetch mold usage' });
    }
});

router.patch('/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { moldCount } = req.body;

      if (!moldCount || moldCount < 1) {
        return res.status(400).json({ error: 'Valid mold count is required' });
      }

      const updated = await storage.updateScheduleAssignment(id, moldCount);
      res.json(updated);
    } catch (error: any) {
      console.error('[WeeklySchedule] Error updating assignment:', error);
      res.status(500).json({ error: 'Failed to update assignment' });
    }
});

router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteScheduleAssignment(id);
      res.status(204).send();
    } catch (error: any) {
      console.error('[WeeklySchedule] Error deleting assignment:', error);
      res.status(500).json({ error: 'Failed to delete assignment' });
    }
});

router.delete('/week/:weekStartDate', async (req: Request, res: Response) => {
    try {
      const { weekStartDate } = req.params;
      await storage.clearWeeklySchedule(weekStartDate);
      res.status(204).send();
    } catch (error: any) {
      console.error('[WeeklySchedule] Error clearing weekly schedule:', error);
      res.status(500).json({ error: 'Failed to clear weekly schedule' });
    }
});

export default router;
