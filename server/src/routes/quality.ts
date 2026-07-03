import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
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
  calibrationUseLogs,
  controlledDocuments,
  insertCapaRecordSchema,
  insertCalibrationAssetSchema,
  insertCalibrationEventSchema,
  maintenanceLogs,
  maintenanceSchedules,
  nonconformanceRecords,
} from '../../schema';
import { storage } from '../../storage';
import { requirePermission } from '../../middleware/requirePermission';

const router = Router();
const qmsEvidenceUploadDir = path.join(process.cwd(), 'uploads', 'qms-calibration-evidence');

type UploadedFile = {
  originalname: string;
  filename: string;
  mimetype: string;
  size: number;
  path: string;
};

if (!fs.existsSync(qmsEvidenceUploadDir)) {
  fs.mkdirSync(qmsEvidenceUploadDir, { recursive: true });
}

const qmsEvidenceUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, qmsEvidenceUploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeBase = path
        .basename(file.originalname, ext)
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 80);
      cb(null, `${Date.now()}_${crypto.randomBytes(8).toString('hex')}_${safeBase}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowedOfficeFiles = [
      'application/pdf',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (file.mimetype.startsWith('image/') || allowedOfficeFiles.includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Evidence uploads must be PDF, image, CSV, Excel, or Word files.'));
  },
});

const qmsPartsEquipmentTabs = [
  {
    key: 'equipment',
    sheetName: 'Equipment TAB 1',
    label: 'Equipment',
    assetType: 'equipment',
    aliases: ['Equipment', 'Equipment TAB 1', 'Equipment Tab 1'],
    tagFields: ['Serial #', 'Serial', 'Serial Number', 'Serial No', 'Asset ID', 'Asset Tag', 'ID'],
    nameFields: ['Item', 'Description', 'Type', 'Equipment', 'Name'],
    dateFields: ['Annual Maintenance Date', 'Inventory Date', 'Maintenance Date', 'Date'],
  },
  {
    key: 'measuring-devices',
    sheetName: 'Measuring Device List',
    label: 'Measuring Devices',
    assetType: 'measuring_device',
    aliases: ['Measuring Devices', 'Measuring Device List', 'Measuring Device'],
    tagFields: ['Serial #', 'Serial', 'Serial Number', 'Serial No', 'Asset ID', 'Asset Tag', 'ID'],
    nameFields: ['Type', 'Item', 'Description', 'Name', 'Gage Description'],
    dateFields: ['Next Inspection Date', 'Inspection Date', 'Next Due Date', 'Due Date', 'Date'],
  },
  {
    key: 'as9100-calibration',
    sheetName: 'AS9100 Calibration TAB 2',
    label: 'AS9100 Calibration',
    assetType: 'calibration_gage',
    aliases: ['AS9100 Calibration', 'AS9100 Calibration TAB 2', 'Calibration TAB 2', 'Calibration'],
    tagFields: ['Serial #', 'Serial', 'Serial Number', 'Serial No', 'Asset ID', 'Asset Tag', 'ID'],
    nameFields: ['Type', 'Item', 'Description', 'Name', 'Gage Description'],
    dateFields: ['Next Calibration Date (1 year)', 'Next Calibration Date', 'Calibration Due Date', 'Next Due Date', 'Due Date', 'Date'],
  },
  {
    key: 'as9100-validation',
    sheetName: 'AS9100 Validation TAB 3',
    label: 'AS9100 Validation',
    assetType: 'validation_asset',
    aliases: ['AS9100 Validation', 'AS9100 Validation TAB 3', 'Validation TAB 3', 'Validation'],
    tagFields: ['Asset ID', 'Asset Tag', 'Serial #', 'Serial', 'Serial Number', 'Serial No', 'ID'],
    nameFields: ['Description', 'Type', 'Item', 'Name'],
    dateFields: ['Maintenance Date', 'Validation Date', 'Next Validation Date', 'Next Due Date', 'Due Date', 'Date'],
  },
  {
    key: 'customer-property',
    sheetName: 'Customer Property TAB 4',
    label: 'Customer Property',
    assetType: 'customer_property',
    aliases: ['Customer Property', 'Customer Property TAB 4'],
    tagFields: ['Serial #', 'Serial', 'Serial Number', 'Serial No', 'Asset ID', 'Asset Tag', 'ID'],
    nameFields: ['Description', 'Item', 'Type', 'Name'],
    dateFields: ['Validation Date', 'Inventory Date', 'Date'],
  },
  {
    key: 'serialized-items',
    sheetName: 'Serialized Items TAB 5',
    label: 'Serialized Items',
    assetType: 'serialized_item',
    aliases: ['Serialized Items', 'Serialized Items TAB 5', 'Serialized Item'],
    tagFields: ['Serial #', 'Serial', 'Serial Number', 'Serial No', 'Asset ID', 'Asset Tag', 'ID'],
    nameFields: ['Item', 'Description', 'Type', 'Name'],
    dateFields: ['Inventory Date', 'Inventory Date (qtrly)', 'Quarterly Inventory Date', 'Date'],
  },
  {
    key: 'returned-items',
    sheetName: 'Returned Items TAB 6',
    label: 'Returned Items',
    assetType: 'returned_item',
    aliases: ['Returned Items', 'Returned Items TAB 6', 'Returned Item'],
    tagFields: ['Serial #', 'Serial', 'Serial Number', 'Serial No', 'Asset ID', 'Asset Tag', 'ID'],
    nameFields: ['Item', 'Description', 'Type', 'Name'],
    dateFields: ['Return Date'],
  },
  {
    key: 'calibration-archive',
    sheetName: 'Calibration Register (ARCHIVE)',
    label: 'Calibration Archive',
    assetType: 'calibration_archive',
    aliases: ['Calibration Register (ARCHIVE)', 'Calibration Register ARCHIVE', 'Calibration Archive', 'Archive'],
    tagFields: ['Serial #', 'Serial', 'Serial Number', 'Serial No', 'Asset ID', 'Asset Tag', 'ID'],
    nameFields: ['Type', 'Description', 'Item', 'Name', 'Gage Description'],
    dateFields: ['Date', 'Calibration Date', 'Last Calibration Date'],
  },
] as const;

type QmsImportRow = Record<string, unknown>;

function compactString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeImportKey(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/#/g, 'number')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\btab\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedRowValue(row: QmsImportRow, fields: readonly string[]): string | null {
  const entries = Object.entries(row).map(([key, value]) => [normalizeImportKey(key), value] as const);
  for (const field of fields) {
    const target = normalizeImportKey(field);
    const match = entries.find(([key]) => key === target);
    const value = compactString(match?.[1]);
    if (value) return value;
  }
  return null;
}

function firstValue(row: QmsImportRow, fields: readonly string[]): string | null {
  for (const field of fields) {
    const value = compactString(row[field]);
    if (value) return value;
  }
  return normalizedRowValue(row, fields);
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
  for (const field of fields) {
    const dateValue = parseDateValue(normalizedRowValue(row, [field]));
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
  const normalized = normalizeImportKey(sheetName);
  return qmsPartsEquipmentTabs.find((tab) => {
    const candidates = [tab.sheetName, tab.label, tab.key, ...tab.aliases].map(normalizeImportKey);
    return candidates.some((candidate) => normalized === candidate || normalized.includes(candidate) || candidate.includes(normalized));
  });
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function appendMetadataList(metadata: Record<string, unknown>, key: string, item: Record<string, unknown>) {
  const current = Array.isArray(metadata[key]) ? metadata[key] as unknown[] : [];
  return {
    ...metadata,
    [key]: [...current, item],
  };
}

function metadataList(value: unknown, key: string): Record<string, unknown>[] {
  const metadata = metadataRecord(value);
  return Array.isArray(metadata[key])
    ? (metadata[key] as unknown[]).filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function sourceTabsForAsset(value: unknown): string[] {
  const metadata = metadataRecord(value);
  if (Array.isArray(metadata.qmsSourceTabs)) {
    return metadata.qmsSourceTabs
      .map((item) => compactString(item))
      .filter((item): item is string => Boolean(item));
  }
  const source = compactString(metadata.qmsSheetName);
  return source ? [source] : [];
}

function assetHasEvidence(asset: { evidenceUrl?: string | null; metadata?: unknown }) {
  return Boolean(compactString(asset.evidenceUrl) || metadataList(asset.metadata, 'evidenceItems').length > 0);
}

function qmsTextMatch(values: unknown[], terms: string[]) {
  const haystack = values
    .map((value) => compactString(value))
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function reviewStatusFromAction(action: string) {
  if (action === 'approve') return 'active';
  if (action === 'limited_use') return 'due_soon';
  if (action === 'retire') return 'retired';
  return 'locked_out';
}

function reviewResultFromAction(action: string): 'pass' | 'fail' | 'limited_use' {
  if (action === 'approve') return 'pass';
  if (action === 'limited_use') return 'limited_use';
  return 'fail';
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
    const calibrationScopedAssets = assets.filter((asset) => (
      ['measuring_device', 'calibration_gage', 'validation_asset', 'calibration_archive'].includes(asset.assetType)
    ));
    const missingEvidence = calibrationScopedAssets.filter((asset) => !assetHasEvidence(asset));
    const multiSourceAssets = assets.filter((asset) => sourceTabsForAsset(asset.metadata).length > 1);
    const needsReview = assets.filter((asset) => (
      asset.status === 'expired' ||
      asset.status === 'locked_out' ||
      missingEvidence.some((missing) => missing.id === asset.id)
    ));
    const cleanup = {
      missingEvidence: missingEvidence.slice(0, 25),
      needsReview: needsReview.slice(0, 25),
      multiSourceAssets: multiSourceAssets.slice(0, 25),
    };

    res.json({
      tabs: byTab,
      assets,
      events: events.slice(0, 200),
      upcoming,
      overdue,
      cleanup,
      stats: {
        totalAssets: assets.length,
        dueSoon: upcoming.length,
        overdue: overdue.length,
        lockedOut: assets.filter((asset) => asset.status === 'locked_out').length,
        missingEvidence: missingEvidence.length,
        needsReview: needsReview.length,
        multiSourceRecords: multiSourceAssets.length,
      },
    });
  } catch (error) {
    console.error('QMS parts/equipment summary error:', error);
    res.status(500).json({ error: 'Failed to fetch QMS parts and equipment summary' });
  }
});

router.get('/qms/parts-equipment/integration', async (_req: Request, res: Response) => {
  try {
    const assets = await db
      .select()
      .from(calibrationAssets)
      .orderBy(calibrationAssets.assetTag);
    const assetTags = new Set(assets.map((asset) => asset.assetTag));
    const assetNames = new Set(assets.map((asset) => asset.name.toLowerCase()));
    const qmsTerms = ['qms', 'calibration', 'calibrate', 'gage', 'gauge', 'equipment', 'measuring device', 'validation'];

    const useLogs = await db
      .select()
      .from(calibrationUseLogs)
      .orderBy(desc(calibrationUseLogs.usedAt))
      .limit(100);
    const linkedUseLogs = useLogs.filter((log) => assetTags.has(log.assetTag));

    const schedules = await db
      .select()
      .from(maintenanceSchedules)
      .orderBy(desc(maintenanceSchedules.createdAt));
    const relatedSchedules = schedules.filter((schedule) => {
      const equipment = schedule.equipment.toLowerCase();
      return assetTags.has(schedule.equipment) || assetNames.has(equipment) || qmsTextMatch([schedule.equipment, schedule.description], qmsTerms);
    });

    const logs = await db
      .select()
      .from(maintenanceLogs)
      .orderBy(desc(maintenanceLogs.completedAt))
      .limit(100);
    const relatedScheduleIds = new Set(relatedSchedules.map((schedule) => schedule.id));
    const relatedMaintenanceLogs = logs.filter((log) => relatedScheduleIds.has(log.scheduleId));

    const ncrs = await db
      .select({
        id: nonconformanceRecords.id,
        rmaNumber: nonconformanceRecords.rmaNumber,
        status: nonconformanceRecords.status,
        issueCause: nonconformanceRecords.issueCause,
        disposition: nonconformanceRecords.disposition,
        notes: nonconformanceRecords.notes,
        containmentAction: nonconformanceRecords.containmentAction,
        rootCause: nonconformanceRecords.rootCause,
        correctiveAction: nonconformanceRecords.correctiveAction,
        createdAt: nonconformanceRecords.createdAt,
      })
      .from(nonconformanceRecords)
      .orderBy(desc(nonconformanceRecords.createdAt))
      .limit(250);
    const relatedNcrs = ncrs.filter((record) => qmsTextMatch([
      record.rmaNumber,
      record.issueCause,
      record.disposition,
      record.notes,
      record.containmentAction,
      record.rootCause,
      record.correctiveAction,
    ], qmsTerms));

    const capas = await db
      .select({
        id: capaRecords.id,
        capaNumber: capaRecords.capaNumber,
        sourceType: capaRecords.sourceType,
        status: capaRecords.status,
        title: capaRecords.title,
        problemStatement: capaRecords.problemStatement,
        dueDate: capaRecords.dueDate,
        ownerDisplayName: capaRecords.ownerDisplayName,
        createdAt: capaRecords.createdAt,
      })
      .from(capaRecords)
      .orderBy(desc(capaRecords.createdAt))
      .limit(250);
    const relatedCapas = capas.filter((record) => qmsTextMatch([
      record.sourceType,
      record.title,
      record.problemStatement,
    ], qmsTerms));

    const docs = await db
      .select({
        id: controlledDocuments.id,
        documentNumber: controlledDocuments.documentNumber,
        documentName: controlledDocuments.documentName,
        documentType: controlledDocuments.documentType,
        department: controlledDocuments.department,
        category: controlledDocuments.category,
        status: controlledDocuments.status,
        expirationDate: controlledDocuments.expirationDate,
        documentOwner: controlledDocuments.documentOwner,
        description: controlledDocuments.description,
      })
      .from(controlledDocuments)
      .orderBy(desc(controlledDocuments.updatedAt))
      .limit(250);
    const relatedDocuments = docs.filter((doc) => qmsTextMatch([
      doc.documentNumber,
      doc.documentName,
      doc.documentType,
      doc.department,
      doc.category,
      doc.description,
    ], qmsTerms));

    const acceptedUse = linkedUseLogs.filter((log) => log.useStatus === 'accepted');
    const blockedUse = linkedUseLogs.filter((log) => log.useStatus === 'blocked');
    const openNcrs = relatedNcrs.filter((record) => String(record.status ?? '').toLowerCase() !== 'resolved');
    const openCapas = relatedCapas.filter((record) => !['closed', 'complete', 'completed'].includes(String(record.status ?? '').toLowerCase()));

    res.json({
      stats: {
        productionUses: acceptedUse.length,
        productionBlocks: blockedUse.length,
        maintenanceSchedules: relatedSchedules.filter((schedule) => schedule.isActive !== false).length,
        maintenanceLogs: relatedMaintenanceLogs.length,
        openNcrs: openNcrs.length,
        openCapas: openCapas.length,
        controlledDocuments: relatedDocuments.length,
      },
      production: {
        latestUseLogs: linkedUseLogs.slice(0, 25),
        blockedUse: blockedUse.slice(0, 10),
      },
      maintenance: {
        schedules: relatedSchedules.slice(0, 25),
        latestLogs: relatedMaintenanceLogs.slice(0, 25),
      },
      quality: {
        ncrs: relatedNcrs.slice(0, 25),
        capas: relatedCapas.slice(0, 25),
        documents: relatedDocuments.slice(0, 25),
      },
      links: {
        assets: '/assets',
        assetDashboard: '/asset-dashboard',
        maintenance: '/maintenance',
        maintenanceEvents: '/maintenance-events',
        nonconformance: '/nonconformance',
        controlledDocuments: '/master-document-register',
        p2Travelers: '/p2-traveler-viewer',
      },
    });
  } catch (error) {
    console.error('QMS parts/equipment integration error:', error);
    res.status(500).json({ error: 'Failed to fetch QMS integration summary' });
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
      const sourceSheetName = compactString(tab.sourceSheetName) ?? sheetName;
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
        const canonicalSheetName = config.sheetName;
        const qmsSourceTabs = Array.from(new Set([
          ...(
            Array.isArray(existingMetadata.qmsSourceTabs)
              ? existingMetadata.qmsSourceTabs.map((value) => compactString(value)).filter(Boolean)
              : []
          ),
          canonicalSheetName,
        ]));
        const latestRowsBySheet = {
          ...((existingMetadata.latestRowsBySheet as Record<string, unknown> | undefined) ?? {}),
          [canonicalSheetName]: row,
        };
        const metadata = {
          ...existingMetadata,
          qmsSourceName: sourceName,
          qmsSheetName: existingMetadata.qmsSheetName ?? canonicalSheetName,
          qmsTabKey: existingMetadata.qmsTabKey ?? config.key,
          qmsOriginalSheetName: sourceSheetName,
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
          const notes = `Imported from ${sourceSheetName ?? canonicalSheetName}: ${compactString(row.Notes) ?? sourceName}`;
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

      summary.tabs.push({ sheetName: config.sheetName, imported, skipped });
    }

    res.status(201).json(summary);
  } catch (error) {
    console.error('QMS parts/equipment import error:', error);
    if (error instanceof Error) return res.status(400).json({ error: error.message });
    res.status(500).json({ error: 'Failed to import QMS parts and equipment' });
  }
});

router.post('/qms/parts-equipment/assets/:id/evidence', requirePermission('quality.manage_calibration'), async (req: Request, res: Response) => {
  try {
    const [existing] = await db
      .select()
      .from(calibrationAssets)
      .where(eq(calibrationAssets.id, req.params.id))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Calibration asset not found' });

    const evidenceUrl = compactString(req.body?.evidenceUrl);
    if (!evidenceUrl) return res.status(400).json({ error: 'Evidence URL or reference is required' });

    const evidenceItem = {
      id: crypto.randomUUID(),
      label: compactString(req.body?.label) ?? 'Evidence',
      evidenceUrl,
      notes: compactString(req.body?.notes),
      attachedBy: compactString(req.body?.attachedBy),
      attachedAt: new Date().toISOString(),
    };
    const metadata = appendMetadataList(metadataRecord(existing.metadata), 'evidenceItems', evidenceItem);

    const [asset] = await db
      .update(calibrationAssets)
      .set({
        evidenceUrl,
        metadata,
        updatedAt: new Date(),
      })
      .where(eq(calibrationAssets.id, existing.id))
      .returning();

    await db
      .insert(calibrationEvents)
      .values({
        assetId: existing.id,
        eventType: 'evidence_attached',
        eventDate: new Date().toISOString().slice(0, 10),
        result: 'pass',
        performedBy: compactString(req.body?.attachedBy),
        evidenceUrl,
        notes: compactString(req.body?.notes) ?? `Evidence attached: ${evidenceItem.label}`,
      });

    res.status(201).json(asset);
  } catch (error) {
    console.error('Attach QMS evidence error:', error);
    if (error instanceof Error) return res.status(400).json({ error: error.message });
    res.status(500).json({ error: 'Failed to attach evidence' });
  }
});

router.post('/qms/parts-equipment/assets/:id/evidence/upload', requirePermission('quality.manage_calibration'), qmsEvidenceUpload.single('file'), async (req: Request, res: Response) => {
  const file = req.file as UploadedFile | undefined;
  try {
    if (!file) return res.status(400).json({ error: 'Evidence file is required' });

    const [existing] = await db
      .select()
      .from(calibrationAssets)
      .where(eq(calibrationAssets.id, req.params.id))
      .limit(1);
    if (!existing) {
      fs.unlink(file.path, () => undefined);
      return res.status(404).json({ error: 'Calibration asset not found' });
    }

    const evidenceItem = {
      id: crypto.randomUUID(),
      label: compactString(req.body?.label) ?? path.basename(file.originalname),
      evidenceUrl: '',
      originalFileName: file.originalname,
      storedFileName: file.filename,
      mimeType: file.mimetype,
      fileSizeBytes: file.size,
      filePath: file.path,
      notes: compactString(req.body?.notes),
      attachedBy: compactString(req.body?.attachedBy),
      attachedAt: new Date().toISOString(),
    };
    evidenceItem.evidenceUrl = `/api/quality/qms/parts-equipment/assets/${existing.id}/evidence/${evidenceItem.id}/download`;

    const metadata = appendMetadataList(metadataRecord(existing.metadata), 'evidenceItems', evidenceItem);

    const [asset] = await db
      .update(calibrationAssets)
      .set({
        evidenceUrl: evidenceItem.evidenceUrl,
        metadata,
        updatedAt: new Date(),
      })
      .where(eq(calibrationAssets.id, existing.id))
      .returning();

    await db
      .insert(calibrationEvents)
      .values({
        assetId: existing.id,
        eventType: 'evidence_uploaded',
        eventDate: new Date().toISOString().slice(0, 10),
        result: 'pass',
        performedBy: compactString(req.body?.attachedBy),
        evidenceUrl: evidenceItem.evidenceUrl,
        notes: compactString(req.body?.notes) ?? `Evidence uploaded: ${evidenceItem.label}`,
      });

    res.status(201).json({ asset, evidenceItem });
  } catch (error) {
    if (file) fs.unlink(file.path, () => undefined);
    console.error('Upload QMS evidence error:', error);
    if (error instanceof Error) return res.status(400).json({ error: error.message });
    res.status(500).json({ error: 'Failed to upload evidence' });
  }
});

router.get('/qms/parts-equipment/assets/:id/evidence/:evidenceId/download', requirePermission('quality.manage_calibration'), async (req: Request, res: Response) => {
  try {
    const [existing] = await db
      .select()
      .from(calibrationAssets)
      .where(eq(calibrationAssets.id, req.params.id))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Calibration asset not found' });

    const evidenceItem = metadataList(existing.metadata, 'evidenceItems')
      .find((item) => item.id === req.params.evidenceId);
    const storedPath = compactString(evidenceItem?.filePath);
    if (!evidenceItem || !storedPath) return res.status(404).json({ error: 'Evidence file not found' });

    const resolvedBase = path.resolve(qmsEvidenceUploadDir);
    const resolvedPath = path.resolve(storedPath);
    if (!resolvedPath.startsWith(`${resolvedBase}${path.sep}`) && resolvedPath !== resolvedBase) {
      return res.status(400).json({ error: 'Invalid evidence file path' });
    }
    if (!fs.existsSync(resolvedPath)) return res.status(404).json({ error: 'Evidence file is missing from storage' });

    res.download(resolvedPath, compactString(evidenceItem.originalFileName) ?? path.basename(resolvedPath));
  } catch (error) {
    console.error('Download QMS evidence error:', error);
    res.status(500).json({ error: 'Failed to download evidence' });
  }
});

router.post('/qms/parts-equipment/assets/:id/review', requirePermission('quality.manage_calibration'), async (req: Request, res: Response) => {
  try {
    const action = compactString(req.body?.action) ?? '';
    if (!['approve', 'limited_use', 'lock_out', 'retire'].includes(action)) {
      return res.status(400).json({ error: 'Review action must be approve, limited_use, lock_out, or retire' });
    }

    const [existing] = await db
      .select()
      .from(calibrationAssets)
      .where(eq(calibrationAssets.id, req.params.id))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Calibration asset not found' });

    const result = reviewResultFromAction(action);
    const status = reviewStatusFromAction(action);
    const reviewedAt = new Date();
    const reviewItem = {
      id: crypto.randomUUID(),
      action,
      result,
      status,
      reviewedBy: compactString(req.body?.reviewedBy),
      reason: compactString(req.body?.reason),
      evidenceUrl: compactString(req.body?.evidenceUrl),
      nextDueDate: parseDateValue(req.body?.nextDueDate),
      reviewedAt: reviewedAt.toISOString(),
    };
    const metadata = appendMetadataList(metadataRecord(existing.metadata), 'reviewActions', reviewItem);

    const [asset] = await db
      .update(calibrationAssets)
      .set({
        status,
        lockoutReason: status === 'locked_out' ? reviewItem.reason ?? 'Quality review lockout' : null,
        lockedOutAt: status === 'locked_out' ? reviewedAt : null,
        calibrationDueDate: reviewItem.nextDueDate ?? existing.calibrationDueDate,
        evidenceUrl: reviewItem.evidenceUrl ?? existing.evidenceUrl,
        metadata,
        updatedAt: reviewedAt,
      })
      .where(eq(calibrationAssets.id, existing.id))
      .returning();

    await db
      .insert(calibrationEvents)
      .values({
        assetId: existing.id,
        eventType: `review_${action}`,
        eventDate: reviewedAt.toISOString().slice(0, 10),
        result,
        performedBy: reviewItem.reviewedBy as string | undefined,
        evidenceUrl: reviewItem.evidenceUrl as string | undefined,
        nextDueDate: reviewItem.nextDueDate as string | undefined,
        notes: reviewItem.reason as string | undefined,
      });

    res.status(201).json(asset);
  } catch (error) {
    console.error('QMS review action error:', error);
    if (error instanceof Error) return res.status(400).json({ error: error.message });
    res.status(500).json({ error: 'Failed to record review action' });
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
