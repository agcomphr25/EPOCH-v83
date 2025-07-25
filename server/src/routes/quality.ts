import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { authenticateToken } from '../../middleware/auth';
import {
  insertQcDefinitionSchema,
  insertQcSubmissionSchema,
  insertMaintenanceScheduleSchema,
  insertMaintenanceLogSchema
} from '@shared/schema';

const router = Router();

// Quality Control Definitions
router.get('/definitions', async (req: Request, res: Response) => {
  try {
    const definitions = await storage.getAllQcDefinitions();
    res.json(definitions);
  } catch (error) {
    console.error('Get QC definitions error:', error);
    res.status(500).json({ error: "Failed to fetch QC definitions" });
  }
});

router.get('/definitions/:id', async (req: Request, res: Response) => {
  try {
    const definitionId = parseInt(req.params.id);
    const definition = await storage.getQcDefinition(definitionId);
    
    if (!definition) {
      return res.status(404).json({ error: "QC definition not found" });
    }
    
    res.json(definition);
  } catch (error) {
    console.error('Get QC definition error:', error);
    res.status(500).json({ error: "Failed to fetch QC definition" });
  }
});

router.post('/definitions', authenticateToken, async (req: Request, res: Response) => {
  try {
    const definitionData = insertQcDefinitionSchema.parse(req.body);
    const newDefinition = await storage.createQcDefinition(definitionData);
    res.status(201).json(newDefinition);
  } catch (error) {
    console.error('Create QC definition error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to create QC definition" });
  }
});

router.put('/definitions/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const definitionId = parseInt(req.params.id);
    const updates = req.body;
    const updatedDefinition = await storage.updateQcDefinition(definitionId, updates);
    res.json(updatedDefinition);
  } catch (error) {
    console.error('Update QC definition error:', error);
    res.status(500).json({ error: "Failed to update QC definition" });
  }
});

router.delete('/definitions/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const definitionId = parseInt(req.params.id);
    await storage.deleteQcDefinition(definitionId);
    res.status(204).end();
  } catch (error) {
    console.error('Delete QC definition error:', error);
    res.status(500).json({ error: "Failed to delete QC definition" });
  }
});

// Quality Control Submissions
router.get('/submissions', async (req: Request, res: Response) => {
  try {
    const submissions = await storage.getAllQcSubmissions();
    res.json(submissions);
  } catch (error) {
    console.error('Get QC submissions error:', error);
    res.status(500).json({ error: "Failed to fetch QC submissions" });
  }
});

router.get('/submissions/:id', async (req: Request, res: Response) => {
  try {
    const submissionId = parseInt(req.params.id);
    const submission = await storage.getQcSubmission(submissionId);
    
    if (!submission) {
      return res.status(404).json({ error: "QC submission not found" });
    }
    
    res.json(submission);
  } catch (error) {
    console.error('Get QC submission error:', error);
    res.status(500).json({ error: "Failed to fetch QC submission" });
  }
});

router.post('/submissions', async (req: Request, res: Response) => {
  try {
    const submissionData = insertQcSubmissionSchema.parse(req.body);
    const newSubmission = await storage.createQcSubmission(submissionData);
    res.status(201).json(newSubmission);
  } catch (error) {
    console.error('Create QC submission error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to create QC submission" });
  }
});

// Maintenance Schedules
router.get('/maintenance/schedules', async (req: Request, res: Response) => {
  try {
    const schedules = await storage.getAllMaintenanceSchedules();
    res.json(schedules);
  } catch (error) {
    console.error('Get maintenance schedules error:', error);
    res.status(500).json({ error: "Failed to fetch maintenance schedules" });
  }
});

router.post('/maintenance/schedules', authenticateToken, async (req: Request, res: Response) => {
  try {
    const scheduleData = insertMaintenanceScheduleSchema.parse(req.body);
    const newSchedule = await storage.createMaintenanceSchedule(scheduleData);
    res.status(201).json(newSchedule);
  } catch (error) {
    console.error('Create maintenance schedule error:', error);
    res.status(500).json({ error: "Failed to create maintenance schedule" });
  }
});

router.put('/maintenance/schedules/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const scheduleId = parseInt(req.params.id);
    const updates = req.body;
    const updatedSchedule = await storage.updateMaintenanceSchedule(scheduleId, updates);
    res.json(updatedSchedule);
  } catch (error) {
    console.error('Update maintenance schedule error:', error);
    res.status(500).json({ error: "Failed to update maintenance schedule" });
  }
});

router.delete('/maintenance/schedules/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const scheduleId = parseInt(req.params.id);
    await storage.deleteMaintenanceSchedule(scheduleId);
    res.status(204).end();
  } catch (error) {
    console.error('Delete maintenance schedule error:', error);
    res.status(500).json({ error: "Failed to delete maintenance schedule" });
  }
});

// Maintenance Logs
router.get('/maintenance/logs', async (req: Request, res: Response) => {
  try {
    const logs = await storage.getAllMaintenanceLogs();
    res.json(logs);
  } catch (error) {
    console.error('Get maintenance logs error:', error);
    res.status(500).json({ error: "Failed to fetch maintenance logs" });
  }
});

router.post('/maintenance/logs', async (req: Request, res: Response) => {
  try {
    const logData = insertMaintenanceLogSchema.parse(req.body);
    const newLog = await storage.createMaintenanceLog(logData);
    res.status(201).json(newLog);
  } catch (error) {
    console.error('Create maintenance log error:', error);
    res.status(500).json({ error: "Failed to create maintenance log" });
  }
});

export default router;