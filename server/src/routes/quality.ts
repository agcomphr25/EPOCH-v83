import { Router, Request, Response } from 'express';
import {
  insertQcDefinitionSchema,
  insertQcSubmissionSchema,
  insertMaintenanceScheduleSchema,
  insertMaintenanceLogSchema,
} from '@shared/schema';
import { and, desc, eq, sql } from 'drizzle-orm';

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

const qmsPartsEquipmentTabs = [
  {
    key: 'equipment',
    sheetName: 'Equipment TAB 1',
    label: 'Equipment',
    assetType: 'equipment',
    tagFields: ['Serial #', 'Serial'],
    nameFields: ['Item', 'Description', 'Type'],
    dateFields: ['Annual Maintenance Date', 'Inventory Date'],
  },
  {
    key: 'measuring-devices',
    sheetName: 'Measuring Device List',
    label: 'Measuring Devices',
    assetType: 'measuring_device',
    tagFields: ['Serial #', 'Serial'],
    nameFields: ['Type', 'Item', 'Description'],
    dateFields: ['Next Inspection Date', 'Date'],
  },
  {
    key: 'as9100-calibration',
    sheetName: 'AS9100 Calibration TAB 2',
    label: 'AS9100 Calibration',
    assetType: 'calibration_gage',
    tagFields: ['Serial #', 'Serial'],
    nameFields: ['Type', 'Item', 'Description'],
    dateFields: ['Next Calibration Date (1 year)', 'Date'],
  },
  {
    key: 'as9100-validation',
    sheetName: 'AS9100 Validation TAB 3',
    label: 'AS9100 Validation',
    assetType: 'validation_asset',
    tagFields: ['Asset ID', 'Serial #'],
    nameFields: ['Description', 'Type'],
    dateFields: ['Maintenance Date', 'Validation Date'],
  },
  {
    key: 'customer-property',
    sheetName: 'Customer Property TAB 4',
    label: 'Customer Property',
    assetType: 'customer_property',
    tagFields: ['Serial #', 'Asset ID'],
    nameFields: ['Description', 'Item'],
    dateFields: ['Validation Date', 'Inventory Date'],
  },
  {
    key: 'serialized-items',
    sheetName: 'Serialized Items TAB 5',
    label: 'Serialized Items',
    assetType: 'serialized_item',
    tagFields: ['Serial #', 'Asset ID'],
    nameFields: ['Item', 'Description'],
    dateFields: ['Inventory Date', 'Inventory Date (qtrly)'],
  },
  {
    key: 'returned-items',
    sheetName: 'Returned Items TAB 6',
    label: 'Returned Items',
    assetType: 'returned_item',
    tagFields: ['Serial #', 'Asset ID'],
    nameFields: ['Item', 'Description'],
    dateFields: ['Return Date'],
  },
  {
    key: 'calibration-archive',
    sheetName: 'Calibration Register (ARCHIVE)',
    label: 'Calibration Archive',
    assetType: 'calibration_archive',
    tagFields: ['Serial #', 'Asset ID'],
    nameFields: ['Type', 'Description'],
    dateFields: ['Date'],
  },
] as const;

type QmsImportRow = Record<string, unknown>;

function compactString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function firstValue(row: QmsImportRow, fields: readonly string[]): string | null {
  for (const field of fields) {
    const value = compactString(row[field]);
    if (value) return value;
  }
  return null;
}

function parseDateValue(value: unknown): string | null {
  const text = compactString(value);
  if (!text || /^n\/?a$/i.test(text) || /ongoing/i.test(text)) return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    const base = new Date(Date.UTC(1899, 11, 30));
    base.setUTCDate(base.getUTCDate() + value);
    return base.toISOString().slice(0, 10);
  }

  const normalized = text.replace(/^Returned\s+/i, '').replace(/'/g, '');
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function firstDate(row: QmsImportRow, fields: readonly string[]): string | null {
  for (const field of fields) {
    const dateValue = parseDateValue(row[field]);
    if (dateValue) return dateValue;
  }
  return null;
}

function statusFromDueDate(dueDate: string | null, result?: string | null): 'active' | 'due_soon' | 'expired' | 'locked_out' {
  if (result && !['y', 'yes', 'pass', 'passed'].includes(result.toLowerCase())) return 'locked_out';
  if (!dueDate) return 'active';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00`);
  const daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  if (daysUntilDue < 0) return 'expired';
  if (daysUntilDue <= 30) return 'due_soon';
  return 'active';
}

function eventResult(row: QmsImportRow): 'pass' | 'fail' | 'limited_use' {
  const raw = compactString(row['Pass Y/N'] ?? row['Pass/Fail'] ?? row['Fit For Purpose Y/N'] ?? row.Results);
  if (!raw) return 'pass';
  if (['y', 'yes', 'pass', 'passed'].includes(raw.toLowerCase())) return 'pass';
  if (raw.toLowerCase().includes('limited')) return 'limited_use';
  return 'fail';
}

function tabConfigForSheet(sheetName: string) {
  return qmsPartsEquipmentTabs.find((tab) => tab.sheetName === sheetName);
}

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
router.get('/qms/parts-equipment/tabs', async (_req: Request, res: Response) => {
  res.json(qmsPartsEquipmentTabs);
});

router.get('/qms/parts-equipment/summary', async (_req: Request, res: Response) => {
  try {
    const assets = await db
      .select()
      .from(calibrationAssets)
      .orderBy(calibrationAssets.assetTag);
    const events = await db
      .select()
      .from(calibrationEvents)
      .orderBy(desc(calibrationEvents.eventDate));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);

    const upcoming = assets
      .filter((asset) => {
        if (!asset.calibrationDueDate) return false;
        const due = new Date(`${asset.calibrationDueDate}T00:00:00`);
        return due >= today && due <= in30Days;
      })
      .sort((a, b) => String(a.calibrationDueDate ?? '').localeCompare(String(b.calibrationDueDate ?? '')));

    const overdue = assets
      .filter((asset) => {
        if (!asset.calibrationDueDate) return false;
        return new Date(`${asset.calibrationDueDate}T00:00:00`) < today;
      })
      .sort((a, b) => String(a.calibrationDueDate ?? '').localeCompare(String(b.calibrationDueDate ?? '')));

    const byTab = qmsPartsEquipmentTabs.map((tab) => ({
      ...tab,
      count: assets.filter((asset) => (asset.metadata as Record<string, unknown> | null)?.qmsSheetName === tab.sheetName || asset.assetType === tab.assetType).length,
    }));

    res.json({
      tabs: byTab,
      assets,
      events: events.slice(0, 200),
      upcoming,
      overdue,
      stats: {
        totalAssets: assets.length,
        dueSoon: upcoming.length,
        overdue: overdue.length,
        lockedOut: assets.filter((asset) => asset.status === 'locked_out').length,
      },
    });
  } catch (error) {
    console.error('QMS parts/equipment summary error:', error);
    res.status(500).json({ error: 'Failed to fetch QMS parts and equipment summary' });
  }
});

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

router.get('/calibration/assets/:id/events', async (req: Request, res: Response) => {
  try {
    const events = await db
      .select()
      .from(calibrationEvents)
      .where(eq(calibrationEvents.assetId, req.params.id))
      .orderBy(desc(calibrationEvents.eventDate));
    res.json(events);
  } catch (error) {
    console.error('Get calibration events error:', error);
    res.status(500).json({ error: 'Failed to fetch calibration events' });
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

router.post('/qms/parts-equipment/import', requirePermission('quality.manage_calibration'), async (req: Request, res: Response) => {
  try {
    const tabs = Array.isArray(req.body?.tabs) ? req.body.tabs : [];
    const sourceName = compactString(req.body?.sourceName) ?? 'Spreadsheet import';
    const summary = {
      created: 0,
      updated: 0,
      eventsCreated: 0,
      skipped: 0,
      tabs: [] as Array<{ sheetName: string; imported: number; skipped: number }>,
    };

    for (const tab of tabs) {
      const sheetName = compactString(tab.sheetName);
      const config = sheetName ? tabConfigForSheet(sheetName) : null;
      const rows: QmsImportRow[] = Array.isArray(tab.rows) ? tab.rows : [];
      let imported = 0;
      let skipped = 0;

      if (!sheetName || !config) {
        summary.skipped += rows.length;
        continue;
      }

      for (const row of rows) {
        const assetTag = firstValue(row, config.tagFields);
        const name = firstValue(row, config.nameFields);
        if (!assetTag || !name) {
          skipped += 1;
          summary.skipped += 1;
          continue;
        }

        const [existing] = await db
          .select()
          .from(calibrationAssets)
          .where(eq(calibrationAssets.assetTag, assetTag))
          .limit(1);

        const result = eventResult(row);
        const dueDate = firstDate(row, config.dateFields);
        const eventDate = firstDate(row, ['Date', 'Validation Date', 'Inventory Date', 'Annual Maintenance Date', 'Return Date']) ?? dueDate;
        const existingMetadata = (existing?.metadata ?? {}) as Record<string, unknown>;
        const qmsSourceTabs = Array.from(new Set([
          ...(
            Array.isArray(existingMetadata.qmsSourceTabs)
              ? existingMetadata.qmsSourceTabs.map((value) => compactString(value)).filter(Boolean)
              : []
          ),
          sheetName,
        ]));
        const latestRowsBySheet = {
          ...((existingMetadata.latestRowsBySheet as Record<string, unknown> | undefined) ?? {}),
          [sheetName]: row,
        };
        const metadata = {
          ...existingMetadata,
          qmsSourceName: sourceName,
          qmsSheetName: existingMetadata.qmsSheetName ?? sheetName,
          qmsTabKey: existingMetadata.qmsTabKey ?? config.key,
          qmsSourceTabs,
          latestRowsBySheet,
          importedAt: new Date().toISOString(),
        };
        const baseValues = {
          assetTag,
          name,
          assetType: config.assetType,
          serialNumber: firstValue(row, ['Serial #', 'Asset ID']) ?? assetTag,
          location: firstValue(row, ['Location', 'Depart/Building', 'Department', 'Component Location']),
          ownerDepartment: firstValue(row, ['Department', 'Owner']),
          status: statusFromDueDate(dueDate, result),
          lastCalibrationDate: eventDate,
          calibrationDueDate: dueDate,
          evidenceUrl: firstValue(row, ['AG Report #', 'Notes']),
          lockoutReason: result === 'pass' ? null : `Imported ${config.label} result: ${result}`,
          metadata,
          updatedAt: new Date(),
        };

        const [asset] = existing
          ? await db
              .update(calibrationAssets)
              .set(baseValues)
              .where(eq(calibrationAssets.id, existing.id))
              .returning()
          : await db
              .insert(calibrationAssets)
              .values(baseValues)
              .returning();

        summary[existing ? 'updated' : 'created'] += 1;
        imported += 1;

        if (eventDate) {
          const notes = `Imported from ${sheetName}: ${compactString(row.Notes) ?? sourceName}`;
          const [duplicateEvent] = await db
            .select({ id: calibrationEvents.id })
            .from(calibrationEvents)
            .where(and(
              eq(calibrationEvents.assetId, asset.id),
              eq(calibrationEvents.eventDate, eventDate),
              eq(calibrationEvents.eventType, config.key),
            ))
            .limit(1);

          if (!duplicateEvent) {
            await db
              .insert(calibrationEvents)
              .values({
                assetId: asset.id,
                eventType: config.key,
                eventDate,
                result,
                performedBy: firstValue(row, ['Technician', 'Validation Technician']),
                vendorName: firstValue(row, ['Brand', 'Brand Name', 'Owner']),
                certificateNumber: firstValue(row, ['AG Report #']),
                evidenceUrl: firstValue(row, ['AG Report #', 'Notes']),
                nextDueDate: dueDate,
                notes,
              });
            summary.eventsCreated += 1;
          }
        }
      }

      summary.tabs.push({ sheetName, imported, skipped });
    }

    res.status(201).json(summary);
  } catch (error) {
    console.error('QMS parts/equipment import error:', error);
    if (error instanceof Error) return res.status(400).json({ error: error.message });
    res.status(500).json({ error: 'Failed to import QMS parts and equipment' });
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
