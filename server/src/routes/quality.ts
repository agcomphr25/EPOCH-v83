import { Router, Request, Response } from 'express';
import {
  insertQcDefinitionSchema,
  insertQcSubmissionSchema,
  insertMaintenanceScheduleSchema,
  insertMaintenanceLogSchema,
} from '@shared/schema';
import { desc, eq, sql } from 'drizzle-orm';

import { db } from '../../db';
import {
  capaRecords,
  calibrationAssets,
  calibrationEvents,
  insertCapaRecordSchema,
  insertCalibrationAssetSchema,
  insertCalibrationEventSchema,
} from '../../schema';
import { storage } from '../../storage';
import { requirePermission } from '../../middleware/requirePermission';

const router = Router();

async function nextCapaNumber(): Promise<string> {
  const prefix = `CAPA-${new Date().getFullYear()}-`;
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(capaRecords)
    .where(sql`${capaRecords.capaNumber} LIKE ${`${prefix}%`}`);

  return `${prefix}${String(Number(row?.count ?? 0) + 1).padStart(4, '0')}`;
}

// Quality Control Definitions
router.get('/definitions', async (req: Request, res: Response) => {
  try {
    const definitions = await storage.getAllQcDefinitions();
    res.json(definitions);
  } catch (error) {
    console.error('Get QC definitions error:', error);
    res.status(500).json({ error: 'Failed to fetch QC definitions' });
  }
});

router.get('/definitions/:id', async (req: Request, res: Response) => {
  try {
    const definitionId = parseInt(req.params.id);
    const definition = await storage.getQcDefinition(definitionId);

    if (!definition) {
      return res.status(404).json({ error: 'QC definition not found' });
    }

    res.json(definition);
  } catch (error) {
    console.error('Get QC definition error:', error);
    res.status(500).json({ error: 'Failed to fetch QC definition' });
  }
});

router.post('/definitions', requirePermission('quality.manage_definitions'), async (req: Request, res: Response) => {
  try {
    const definitionData = insertQcDefinitionSchema.parse(req.body);
    const newDefinition = await storage.createQcDefinition(definitionData);
    res.status(201).json(newDefinition);
  } catch (error) {
    console.error('Create QC definition error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create QC definition' });
  }
});

router.put('/definitions/:id', requirePermission('quality.manage_definitions'), async (req: Request, res: Response) => {
  try {
    const definitionId = parseInt(req.params.id);
    const updates = req.body;
    const updatedDefinition = await storage.updateQcDefinition(
      definitionId,
      updates
    );
    res.json(updatedDefinition);
  } catch (error) {
    console.error('Update QC definition error:', error);
    res.status(500).json({ error: 'Failed to update QC definition' });
  }
});

router.delete('/definitions/:id', requirePermission('quality.manage_definitions'), async (req: Request, res: Response) => {
  try {
    const definitionId = parseInt(req.params.id);
    await storage.deleteQcDefinition(definitionId);
    res.status(204).end();
  } catch (error) {
    console.error('Delete QC definition error:', error);
    res.status(500).json({ error: 'Failed to delete QC definition' });
  }
});

// Quality Control Submissions
router.get('/submissions', async (req: Request, res: Response) => {
  try {
    const submissions = await storage.getAllQcSubmissions();
    res.json(submissions);
  } catch (error) {
    console.error('Get QC submissions error:', error);
    res.status(500).json({ error: 'Failed to fetch QC submissions' });
  }
});

router.get('/submissions/:id', async (req: Request, res: Response) => {
  try {
    const submissionId = parseInt(req.params.id);
    const submission = await storage.getQcSubmission(submissionId);

    if (!submission) {
      return res.status(404).json({ error: 'QC submission not found' });
    }

    res.json(submission);
  } catch (error) {
    console.error('Get QC submission error:', error);
    res.status(500).json({ error: 'Failed to fetch QC submission' });
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
    res.status(500).json({ error: 'Failed to create QC submission' });
  }
});

// Maintenance Schedules
router.get('/maintenance/schedules', async (req: Request, res: Response) => {
  try {
    const schedules = await storage.getAllMaintenanceSchedules();
    res.json(schedules);
  } catch (error) {
    console.error('Get maintenance schedules error:', error);
    res.status(500).json({ error: 'Failed to fetch maintenance schedules' });
  }
});

router.post('/maintenance/schedules', async (req: Request, res: Response) => {
  try {
    const scheduleData = insertMaintenanceScheduleSchema.parse(req.body);
    const newSchedule = await storage.createMaintenanceSchedule(scheduleData);
    res.status(201).json(newSchedule);
  } catch (error) {
    console.error('Create maintenance schedule error:', error);
    res.status(500).json({ error: 'Failed to create maintenance schedule' });
  }
});

router.put(
  '/maintenance/schedules/:id',
  async (req: Request, res: Response) => {
    try {
      const scheduleId = parseInt(req.params.id);
      const updates = req.body;
      const updatedSchedule = await storage.updateMaintenanceSchedule(
        scheduleId,
        updates
      );
      res.json(updatedSchedule);
    } catch (error) {
      console.error('Update maintenance schedule error:', error);
      res.status(500).json({ error: 'Failed to update maintenance schedule' });
    }
  }
);

router.delete(
  '/maintenance/schedules/:id',
  async (req: Request, res: Response) => {
    try {
      const scheduleId = parseInt(req.params.id);
      await storage.deleteMaintenanceSchedule(scheduleId);
      res.status(204).end();
    } catch (error) {
      console.error('Delete maintenance schedule error:', error);
      res.status(500).json({ error: 'Failed to delete maintenance schedule' });
    }
  }
);

// Maintenance Logs
router.get('/maintenance/logs', async (req: Request, res: Response) => {
  try {
    const logs = await storage.getAllMaintenanceLogs();
    res.json(logs);
  } catch (error) {
    console.error('Get maintenance logs error:', error);
    res.status(500).json({ error: 'Failed to fetch maintenance logs' });
  }
});

router.post('/maintenance/logs', async (req: Request, res: Response) => {
  try {
    const logData = insertMaintenanceLogSchema.parse(req.body);
    const newLog = await storage.createMaintenanceLog(logData);
    res.status(201).json(newLog);
  } catch (error) {
    console.error('Create maintenance log error:', error);
    res.status(500).json({ error: 'Failed to create maintenance log' });
  }
});

// Section 9 CAPA records
router.get('/capa', async (_req: Request, res: Response) => {
  try {
    const records = await db
      .select()
      .from(capaRecords)
      .orderBy(desc(capaRecords.createdAt));
    res.json(records);
  } catch (error) {
    console.error('Get CAPA records error:', error);
    res.status(500).json({ error: 'Failed to fetch CAPA records' });
  }
});

router.post('/capa', requirePermission('quality.manage_capa'), async (req: Request, res: Response) => {
  try {
    const data = insertCapaRecordSchema.parse(req.body);
    const capaNumber = await nextCapaNumber();
    const [record] = await db
      .insert(capaRecords)
      .values({ ...data, capaNumber, updatedAt: new Date() })
      .returning();
    res.status(201).json(record);
  } catch (error) {
    console.error('Create CAPA record error:', error);
    if (error instanceof Error) return res.status(400).json({ error: error.message });
    res.status(500).json({ error: 'Failed to create CAPA record' });
  }
});

router.put('/capa/:id', requirePermission('quality.manage_capa'), async (req: Request, res: Response) => {
  try {
    const updateData = {
      ...req.body,
      updatedAt: new Date(),
      closedAt: req.body.status === 'closed' ? new Date() : req.body.closedAt ?? null,
    };
    const [record] = await db
      .update(capaRecords)
      .set(updateData)
      .where(eq(capaRecords.id, req.params.id))
      .returning();
    if (!record) return res.status(404).json({ error: 'CAPA record not found' });
    res.json(record);
  } catch (error) {
    console.error('Update CAPA record error:', error);
    res.status(500).json({ error: 'Failed to update CAPA record' });
  }
});

// Section 9 calibration asset, evidence, and lockout management
router.get('/calibration/assets', async (_req: Request, res: Response) => {
  try {
    const assets = await db
      .select()
      .from(calibrationAssets)
      .orderBy(calibrationAssets.assetTag);
    res.json(assets);
  } catch (error) {
    console.error('Get calibration assets error:', error);
    res.status(500).json({ error: 'Failed to fetch calibration assets' });
  }
});

router.post('/calibration/assets', requirePermission('quality.manage_calibration'), async (req: Request, res: Response) => {
  try {
    const data = insertCalibrationAssetSchema.parse(req.body);
    const [asset] = await db
      .insert(calibrationAssets)
      .values({ ...data, updatedAt: new Date() })
      .returning();
    res.status(201).json(asset);
  } catch (error) {
    console.error('Create calibration asset error:', error);
    if (error instanceof Error) return res.status(400).json({ error: error.message });
    res.status(500).json({ error: 'Failed to create calibration asset' });
  }
});

router.put('/calibration/assets/:id', requirePermission('quality.manage_calibration'), async (req: Request, res: Response) => {
  try {
    const status = req.body.status;
    const updateData = {
      ...req.body,
      lockedOutAt: status === 'locked_out' || status === 'expired' ? new Date() : null,
      updatedAt: new Date(),
    };
    const [asset] = await db
      .update(calibrationAssets)
      .set(updateData)
      .where(eq(calibrationAssets.id, req.params.id))
      .returning();
    if (!asset) return res.status(404).json({ error: 'Calibration asset not found' });
    res.json(asset);
  } catch (error) {
    console.error('Update calibration asset error:', error);
    res.status(500).json({ error: 'Failed to update calibration asset' });
  }
});

router.post('/calibration/assets/:id/events', requirePermission('quality.manage_calibration'), async (req: Request, res: Response) => {
  try {
    const data = insertCalibrationEventSchema.parse({ ...req.body, assetId: req.params.id });
    const [event] = await db
      .insert(calibrationEvents)
      .values(data)
      .returning();

    await db
      .update(calibrationAssets)
      .set({
        lastCalibrationDate: data.eventDate,
        calibrationDueDate: data.nextDueDate ?? null,
        evidenceUrl: data.evidenceUrl ?? null,
        status: data.result === 'pass' ? 'active' : 'locked_out',
        lockoutReason: data.result === 'pass' ? null : `Calibration ${data.result}`,
        lockedOutAt: data.result === 'pass' ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(eq(calibrationAssets.id, req.params.id));

    res.status(201).json(event);
  } catch (error) {
    console.error('Create calibration event error:', error);
    if (error instanceof Error) return res.status(400).json({ error: error.message });
    res.status(500).json({ error: 'Failed to create calibration event' });
  }
});

export default router;
