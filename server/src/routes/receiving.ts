import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../../db';
import { sql, eq, desc, and } from 'drizzle-orm';
import {
  receipts,
  receiptLines,
  receivedUnits,
  receiptDocuments,
  receiptAuditLog,
  receivingInspectionPlans,
  insertReceiptSchema,
  insertReceiptLineSchema,
  insertReceivedUnitSchema,
  insertReceiptDocumentSchema,
  insertReceivingInspectionPlanSchema,
  updateReceivingInspectionPlanSchema,
  materialLots,
  materialLotTransactions,
  mediaLibrary,
  vendorPOs,
  vendorPOItems,
  inventoryItems,
  cuttingFabricInventory,
  cuttingFabricInventoryTransactions,
  insertMaterialLotSchema,
  insertMaterialLotTransactionSchema,
  insertMediaLibrarySchema,
  type InsertMaterialLot,
  type InsertMaterialLotTransaction,
  type InsertMediaLibrary,
  type Receipt,
  type ReceiptLine,
  type ReceivedUnit,
} from '../../schema';
import { z } from 'zod';
import multer from 'multer';
import { generateBarcodeImage, generateReceivingUnitBarcodeValue } from '../utils/barcodeGenerator';
import { requireRole } from '../../middleware/auth';
import { getFileStorageProvider, getStorageErrorResponse } from '../services/fileStorageProvider';
import { createInventoryEvent } from '../services/inventoryEventService';
import { recordInventoryLedgerEntry } from '../services/inventoryTransactionLedgerService';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

function uploadReceiptDocument(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err) => {
    if (!err) {
      next();
      return;
    }

    const message = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
      ? 'Document uploads are limited to 20 MB.'
      : err.message || 'Failed to read uploaded document.';
    const status = err instanceof multer.MulterError ? 413 : 400;
    res.status(status).json({ error: message });
  });
}

// All authenticated employees (ADMIN, EMPLOYEE, OWNER) may perform receiving operations.
// Applied to all mutating endpoints at the route level for defence-in-depth beyond global auth.
const requireReceivingAccess = requireRole('ADMIN', 'EMPLOYEE', 'OWNER');

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Type-safe row extractor for raw SQL results (Drizzle returns { rows: unknown[] } or the rows directly) */
function sqlRows<T = Record<string, unknown>>(result: unknown): T[] {
  if (result && typeof result === 'object' && 'rows' in result) {
    return (result as { rows: T[] }).rows;
  }
  return result as T[];
}

function nonZeroInventoryDelta(quantity: number): number {
  if (quantity === 0) return 0;
  const magnitude = Math.max(1, Math.round(Math.abs(quantity)));
  return quantity < 0 ? -magnitude : magnitude;
}

type AuthUser = Express.Request['user'];

async function generateReceiptNumber(): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `RCV-${dateStr}-`;
  const result = await db.execute(
    sql`SELECT receipt_number FROM receipts WHERE receipt_number LIKE ${prefix + '%'} ORDER BY receipt_number DESC LIMIT 1`
  );
  const rows = sqlRows<{ receipt_number: string }>(result);
  if (rows.length === 0) return `${prefix}001`;
  const seq = parseInt(rows[0].receipt_number.slice(-3), 10) + 1;
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

// Unit barcode: delegate to shared utility for consistency across barcode generation routes
const generateUnitBarcode = generateReceivingUnitBarcodeValue;

async function getNextUnitSequence(receiptId: number): Promise<number> {
  const result = await db.execute(
    sql`SELECT COALESCE(MAX(unit_sequence), 0) + 1 AS next_seq FROM received_units WHERE receipt_id = ${receiptId}`
  );
  const rows = sqlRows<{ next_seq: string }>(result);
  return parseInt(rows[0]?.next_seq ?? '1', 10) || 1;
}

function actorName(user: AuthUser): string {
  if (!user) return 'Unknown';
  return user.username ?? 'Unknown';
}

function parseInspectionBoolean(value: unknown): boolean | null {
  if (value == null || value === '') return null;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  return null;
}

const inspectionPlanContextSchema = z.object({
  inventoryItemId: z.coerce.number().int().positive().optional().nullable(),
  agPartNumber: z.string().trim().optional().nullable(),
  materialType: z.string().trim().optional().nullable(),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional().nullable(),
  supplierName: z.string().trim().optional().nullable(),
  supplierStatus: z.enum(['APPROVED', 'PROBATION', 'CONDITIONAL', 'BLOCKED']).optional().nullable(),
  flightCritical: z.boolean().optional().nullable(),
});

type InspectionPlanContext = z.infer<typeof inspectionPlanContextSchema>;

async function findMatchingInspectionPlan(context: InspectionPlanContext) {
  const result = await db.execute(sql`
    SELECT
      *,
      (
        CASE WHEN inventory_item_id IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN ag_part_number IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN material_type IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN risk_level IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN supplier_name IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN supplier_status IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN flight_critical IS NOT NULL THEN 1 ELSE 0 END
      ) AS specificity
    FROM receiving_inspection_plans
    WHERE is_active = true
      AND (inventory_item_id IS NULL OR inventory_item_id = ${context.inventoryItemId ?? null})
      AND (ag_part_number IS NULL OR LOWER(ag_part_number) = LOWER(${context.agPartNumber ?? null}))
      AND (material_type IS NULL OR LOWER(material_type) = LOWER(${context.materialType ?? null}))
      AND (risk_level IS NULL OR risk_level = ${context.riskLevel ?? null})
      AND (supplier_name IS NULL OR LOWER(supplier_name) = LOWER(${context.supplierName ?? null}))
      AND (supplier_status IS NULL OR supplier_status = ${context.supplierStatus ?? null})
      AND (flight_critical IS NULL OR flight_critical = ${context.flightCritical ?? null})
    ORDER BY priority DESC, specificity DESC, created_at DESC
    LIMIT 1
  `);
  return sqlRows(result)[0] ?? null;
}

async function logAudit(
  receiptId: number,
  action: string,
  actorUserId: number | null | undefined,
  actorDisplayName: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await db.insert(receiptAuditLog).values({
    receiptId,
    action,
    actorUserId: actorUserId ?? undefined,
    actorDisplayName,
    metadata: metadata ?? null,
  });
}

// Verify a receipt_line belongs to the given receipt (IDOR protection)
async function assertLineOwnership(receiptId: number, lineId: number): Promise<ReceiptLine | null> {
  const [line] = await db.select().from(receiptLines).where(
    and(eq(receiptLines.id, lineId), eq(receiptLines.receiptId, receiptId))
  );
  return line ?? null;
}

// Verify a received_unit belongs to the given receipt (IDOR protection)
async function assertUnitOwnership(receiptId: number, unitId: number): Promise<ReceivedUnit | null> {
  const [unit] = await db.select().from(receivedUnits).where(
    and(eq(receivedUnits.id, unitId), eq(receivedUnits.receiptId, receiptId))
  );
  return unit ?? null;
}

// Auto-import PO lines into the receipt as receipt_lines
async function importPoLines(receiptId: number, vendorPoId: number): Promise<void> {
  const poItems = await db.select().from(vendorPOItems).where(eq(vendorPOItems.vendorPoId, vendorPoId));
  if (!poItems.length) return;
  for (const item of poItems) {
    const exists = await db.execute(
      sql`SELECT id FROM receipt_lines WHERE receipt_id = ${receiptId} AND vendor_po_item_id = ${item.id} LIMIT 1`
    );
    const existRows = sqlRows<{ id: number }>(exists);
    if (existRows.length > 0) continue;
    await db.insert(receiptLines).values({
      receiptId,
      vendorPoItemId: item.id,
      agPartNumber: item.agPartNumber ?? null,
      description: item.description ?? null,
      orderedQty: String(item.quantity ?? item.purchaseQty ?? 0),
      receivedQty: '0',
      uom: item.vendorUnit ?? item.purchaseUnit ?? 'EA',
      isPartial: false,
      isOver: false,
    });
  }
}

// ── GET /api/receipts/pending-by-po ───────────────────────────────────────────
// Returns { poId → { count, latestStatus } } for all POs with in-progress receipts
router.get('/inspection-plans', requireReceivingAccess, async (_req: Request, res: Response) => {
  try {
    const plans = await db
      .select()
      .from(receivingInspectionPlans)
      .orderBy(desc(receivingInspectionPlans.priority), desc(receivingInspectionPlans.createdAt));
    res.json(plans);
  } catch (err: any) {
    console.error('GET /api/receipts/inspection-plans:', err);
    res.status(500).json({ error: 'Failed to fetch receiving inspection plans' });
  }
});

router.post('/inspection-plans', requireReceivingAccess, async (req: Request, res: Response) => {
  try {
    const parsed = insertReceivingInspectionPlanSchema.parse({
      ...req.body,
      createdByUserId: req.user?.id ?? null,
      createdByDisplayName: actorName(req.user),
      updatedByUserId: req.user?.id ?? null,
      updatedByDisplayName: actorName(req.user),
    });
    const [plan] = await db.insert(receivingInspectionPlans).values(parsed).returning();
    res.status(201).json(plan);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: err.errors });
    }
    console.error('POST /api/receipts/inspection-plans:', err);
    res.status(500).json({ error: 'Failed to create receiving inspection plan' });
  }
});

router.patch('/inspection-plans/:id', requireReceivingAccess, async (req: Request, res: Response) => {
  try {
    const parsed = updateReceivingInspectionPlanSchema.parse({
      ...req.body,
      updatedByUserId: req.user?.id ?? null,
      updatedByDisplayName: actorName(req.user),
      updatedAt: new Date(),
    });
    const [plan] = await db
      .update(receivingInspectionPlans)
      .set(parsed)
      .where(eq(receivingInspectionPlans.id, req.params.id))
      .returning();
    if (!plan) return res.status(404).json({ error: 'Receiving inspection plan not found' });
    res.json(plan);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: err.errors });
    }
    console.error('PATCH /api/receipts/inspection-plans/:id:', err);
    res.status(500).json({ error: 'Failed to update receiving inspection plan' });
  }
});

router.get('/inspection-plans/evaluate', requireReceivingAccess, async (req: Request, res: Response) => {
  try {
    const context = inspectionPlanContextSchema.parse({
      inventoryItemId: req.query.inventoryItemId,
      agPartNumber: req.query.agPartNumber,
      materialType: req.query.materialType,
      riskLevel: req.query.riskLevel ? String(req.query.riskLevel).toUpperCase() : undefined,
      supplierName: req.query.supplierName,
      supplierStatus: req.query.supplierStatus ? String(req.query.supplierStatus).toUpperCase() : undefined,
      flightCritical: parseInspectionBoolean(req.query.flightCritical),
    });
    const plan = await findMatchingInspectionPlan(context);
    res.json({
      context,
      plan,
      action: plan
        ? {
            disposition: plan.auto_disposition,
            sampleSizePercent: plan.sample_size_percent,
            requiredCheckpoints: plan.required_checkpoints ?? [],
            requiredDocuments: plan.required_documents ?? [],
            requiresQualitySignature: plan.requires_quality_signature,
          }
        : {
            disposition: 'pending_inspection',
            sampleSizePercent: 100,
            requiredCheckpoints: [],
            requiredDocuments: [],
            requiresQualitySignature: false,
          },
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: err.errors });
    }
    console.error('GET /api/receipts/inspection-plans/evaluate:', err);
    res.status(500).json({ error: 'Failed to evaluate receiving inspection plan' });
  }
});

router.get('/pending-by-po', requireReceivingAccess, async (req: Request, res: Response) => {
  try {
    const result = await db.execute(
      sql`SELECT vendor_po_id, COUNT(*) AS cnt, MAX(status) AS latest_status
          FROM receipts
          WHERE vendor_po_id IS NOT NULL AND status = 'in_progress'
          GROUP BY vendor_po_id`
    );
    const rows = sqlRows<{ vendor_po_id: number; cnt: string; latest_status: string }>(result);
    const map: Record<number, { count: number; latestStatus: string }> = {};
    for (const row of rows) {
      map[row.vendor_po_id] = { count: Number(row.cnt), latestStatus: row.latest_status };
    }
    res.json(map);
  } catch (err: any) {
    console.error('GET /api/receipts/pending-by-po:', err);
    res.status(500).json({ error: 'Failed to fetch pending receipt counts' });
  }
});

// ── GET /api/receipts ──────────────────────────────────────────────────────────
// Supervisor queue: department-owned units that still need disposition or putaway.
router.get('/department-actions', requireReceivingAccess, async (req: Request, res: Response) => {
  try {
    const departmentId = req.query.departmentId ? parseInt(req.query.departmentId as string, 10) : null;
    const result = await db.execute(sql`
      SELECT
        r.id AS receipt_id,
        r.receipt_number,
        r.vendor_name,
        r.vendor_po_number,
        r.department_id,
        d.name AS department_name,
        rl.id AS receipt_line_id,
        rl.ag_part_number,
        rl.description,
        ru.id AS unit_id,
        ru.barcode,
        ru.quantity::text AS quantity,
        ru.uom,
        ru.disposition,
        ru.location,
        ru.freezer_number,
        CASE
          WHEN ru.disposition IN ('pending_inspection', 'document_hold') THEN 'disposition_required'
          WHEN ru.disposition = 'accepted'
            AND COALESCE(NULLIF(TRIM(ru.location), ''), '') = ''
            AND ru.freezer_number IS NULL THEN 'putaway_required'
          ELSE NULL
        END AS action_required
      FROM received_units ru
      INNER JOIN receipts r ON r.id = ru.receipt_id
      INNER JOIN receipt_lines rl ON rl.id = ru.receipt_line_id
      LEFT JOIN inventory_departments d ON d.id = r.department_id
      WHERE r.status = 'in_progress'
        AND r.department_id IS NOT NULL
        AND (${departmentId}::int IS NULL OR r.department_id = ${departmentId})
        AND (
          ru.disposition IN ('pending_inspection', 'document_hold')
          OR (
            ru.disposition = 'accepted'
            AND COALESCE(NULLIF(TRIM(ru.location), ''), '') = ''
            AND ru.freezer_number IS NULL
          )
        )
      ORDER BY r.receipt_date DESC, r.id DESC, ru.unit_sequence ASC
    `);
    res.json(sqlRows(result));
  } catch (err: any) {
    console.error('GET /api/receipts/department-actions:', err);
    res.status(500).json({ error: 'Failed to fetch department receiving actions' });
  }
});

router.get('/', requireReceivingAccess, async (req: Request, res: Response) => {
  try {
    const { status, vendorId, vendorPoId, from, to } = req.query;
    const conditions = [];
    if (status && status !== 'all') conditions.push(eq(receipts.status, status as string));
    if (vendorId) conditions.push(eq(receipts.vendorId, parseInt(vendorId as string)));
    if (vendorPoId) conditions.push(eq(receipts.vendorPoId, parseInt(vendorPoId as string)));
    if (from) conditions.push(sql`receipt_date >= ${from}`);
    if (to) conditions.push(sql`receipt_date <= ${to}`);
    const rows = await db.select().from(receipts)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(receipts.receiptDate));
    res.json(rows);
  } catch (err: any) {
    console.error('GET /api/receipts:', err);
    res.status(500).json({ error: 'Failed to fetch receipts' });
  }
});

// ── POST /api/receipts ─────────────────────────────────────────────────────────
// Supports resume: if vendorPoId provided and in_progress receipt exists, returns it
router.post('/', requireReceivingAccess, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const { vendorPoId } = req.body;

    // Resume behavior
    if (vendorPoId) {
      const existing = await db.execute(
        sql`SELECT id FROM receipts WHERE vendor_po_id = ${parseInt(vendorPoId)} AND status = 'in_progress' ORDER BY created_at DESC LIMIT 1`
      );
      const existRows = sqlRows<{ id: number }>(existing);
      if (existRows.length > 0) {
        const existingId = existRows[0].id;
        const [existingReceipt] = await db.select().from(receipts).where(eq(receipts.id, existingId));
        const lines = await db.select().from(receiptLines).where(eq(receiptLines.receiptId, existingId));
        const units = await db.select().from(receivedUnits).where(eq(receivedUnits.receiptId, existingId));
        const documents = await db.select().from(receiptDocuments).where(eq(receiptDocuments.receiptId, existingId));
        const auditLogs = await db.select().from(receiptAuditLog)
          .where(eq(receiptAuditLog.receiptId, existingId)).orderBy(desc(receiptAuditLog.createdAt));
        await logAudit(existingId, 'receipt_resumed', user?.employeeId, actorName(user), { vendorPoId });
        return res.json({ ...existingReceipt, lines, units, documents, auditLog: auditLogs, _resumed: true });
      }
    }

    const receiptNumber = await generateReceiptNumber();
    const rawBody = { ...req.body };
    if (rawBody.receivedAt && typeof rawBody.receivedAt === 'string') {
      rawBody.receivedAt = new Date(rawBody.receivedAt);
    }
    const body = insertReceiptSchema.parse({
      ...rawBody,
      receiptNumber,
      receiverUserId: user?.employeeId ?? null,
      receiverDisplayName: actorName(user),
    });
    const [receipt] = await db.insert(receipts).values(body).returning();

    await logAudit(receipt.id, 'receipt_created', user?.employeeId, body.receiverDisplayName ?? 'Unknown', {
      receiptNumber, vendorPoId: body.vendorPoId ?? null,
    });

    if (body.vendorPoId) {
      await importPoLines(receipt.id, body.vendorPoId);
      await logAudit(receipt.id, 'po_lines_imported', user?.employeeId, actorName(user), { vendorPoId: body.vendorPoId });
    }

    const lines = await db.select().from(receiptLines).where(eq(receiptLines.receiptId, receipt.id));
    res.status(201).json({ ...receipt, lines, units: [], documents: [], auditLog: [] });
  } catch (err: any) {
    console.error('POST /api/receipts:', err);
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    res.status(500).json({ error: 'Failed to create receipt' });
  }
});

// ── GET /api/receipts/:id ──────────────────────────────────────────────────────
router.get('/:id', requireReceivingAccess, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [receipt] = await db.select().from(receipts).where(eq(receipts.id, id));
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
    const lines = await db.select().from(receiptLines).where(eq(receiptLines.receiptId, id));
    const units = await db.select().from(receivedUnits).where(eq(receivedUnits.receiptId, id));
    const documents = await db.select().from(receiptDocuments).where(eq(receiptDocuments.receiptId, id));
    const auditLogs = await db.select().from(receiptAuditLog)
      .where(eq(receiptAuditLog.receiptId, id)).orderBy(desc(receiptAuditLog.createdAt));
    res.json({ ...receipt, lines, units, documents, auditLog: auditLogs });
  } catch (err: any) {
    console.error('GET /api/receipts/:id:', err);
    res.status(500).json({ error: 'Failed to fetch receipt' });
  }
});

// ── PATCH /api/receipts/:id ────────────────────────────────────────────────────
router.patch('/:id', requireReceivingAccess, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const user = req.user;
    const rawPatch = { ...req.body };
    const reopenReason = typeof rawPatch.reopenReason === 'string' ? rawPatch.reopenReason.trim() : '';
    delete rawPatch.reopenReason;
    if (rawPatch.receivedAt && typeof rawPatch.receivedAt === 'string') {
      rawPatch.receivedAt = new Date(rawPatch.receivedAt);
    }
    const updates = insertReceiptSchema.partial().parse(rawPatch);

    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(receipts).where(eq(receipts.id, id));
      if (!existing) return { updated: null as Receipt | null, parentPoStatus: null as string | null, reopened: false };

      const [updated] = await tx.update(receipts).set({ ...updates, updatedAt: new Date() }).where(eq(receipts.id, id)).returning();
      if (!updated) return { updated: null as Receipt | null, parentPoStatus: null as string | null, reopened: false };

      // Receiving closeout gate: receipt completion is the handoff to invoice
      // match / closeout retention. Do not allow it while inspection or
      // document-hold inventory is still unresolved.
      if (updates.status === 'complete') {
        const blockingUnits = sqlRows<{
          id: number;
          barcode: string;
          disposition: string;
          missing_putaway: boolean;
        }>(
          await tx.execute(sql`
            SELECT id, barcode, disposition,
                   (
                     disposition = 'accepted'
                     AND COALESCE(NULLIF(TRIM(location), ''), '') = ''
                     AND freezer_number IS NULL
                   ) AS missing_putaway
            FROM ${receivedUnits}
            WHERE receipt_id = ${id}
              AND (
                disposition IN ('pending_inspection', 'document_hold')
                OR (
                  disposition = 'accepted'
                  AND COALESCE(NULLIF(TRIM(location), ''), '') = ''
                  AND freezer_number IS NULL
                )
              )
            ORDER BY unit_sequence ASC
          `)
        );
        if (blockingUnits.length > 0) {
          const blockers = blockingUnits.map(unit => ({
            unitId: unit.id,
            barcode: unit.barcode,
            reason: unit.disposition === 'document_hold'
              ? 'document_hold_release_required'
              : unit.missing_putaway
                ? 'putaway_required'
                : 'inspection_disposition_required',
          }));
          const error: any = new Error('Receipt cannot be completed until all units are inspected, released from document hold, and put away.');
          error.status = 422;
          error.blockers = blockers;
          throw error;
        }
      }

      // Auto-close parent vendor PO when receipt is marked complete and all
      // ordered quantities have been received across this PO's receipts.
      let parentPoStatus: string | null = null;
      const reopened = existing.status === 'complete' && updates.status === 'in_progress';
      if (reopened && updated.vendorPoId) {
        await tx.update(vendorPOs)
          .set({ status: 'Partially Received', updatedAt: new Date() })
          .where(eq(vendorPOs.id, updated.vendorPoId));
        parentPoStatus = 'Partially Received';
      }

      if (updates.status === 'complete' && updated.vendorPoId) {
        const vendorPoId = updated.vendorPoId;

        // Sum received_qty per vendor_po_item across ALL receipts for this PO
        const recvRows = sqlRows<{ vendor_po_item_id: number | null; total_received: string | null }>(
          await tx.execute(sql`
            SELECT rl.vendor_po_item_id, SUM(rl.received_qty)::text AS total_received
            FROM ${receiptLines} rl
            INNER JOIN ${receipts} r ON r.id = rl.receipt_id
            WHERE r.vendor_po_id = ${vendorPoId}
              AND rl.vendor_po_item_id IS NOT NULL
            GROUP BY rl.vendor_po_item_id
          `)
        );
        const receivedByItem = new Map<number, number>();
        for (const row of recvRows) {
          if (row.vendor_po_item_id != null) {
            receivedByItem.set(row.vendor_po_item_id, parseFloat(row.total_received ?? '0') || 0);
          }
        }

        const poItems = await tx.select({
          id: vendorPOItems.id,
          quantity: vendorPOItems.quantity,
        }).from(vendorPOItems).where(eq(vendorPOItems.vendorPoId, vendorPoId));

        if (poItems.length > 0) {
          const allFullyReceived = poItems.every(item => {
            const ordered = item.quantity ?? 0;
            const received = receivedByItem.get(item.id) ?? 0;
            return received >= ordered;
          });

          if (allFullyReceived) {
            await tx.update(vendorPOs)
              .set({ status: 'Fully Received', updatedAt: new Date() })
              .where(eq(vendorPOs.id, vendorPoId));
            parentPoStatus = 'Fully Received';
          }
        }
      }

      return { updated, parentPoStatus, reopened };
    });

    if (!result.updated) return res.status(404).json({ error: 'Receipt not found' });

    await logAudit(id, 'receipt_updated', user?.employeeId, actorName(user), updates as Record<string, unknown>);
    if (result.reopened) {
      await logAudit(id, 'receipt_reopened_for_adjustment', user?.employeeId, actorName(user), {
        reason: reopenReason || 'Correction needed',
        vendorPoStatus: result.parentPoStatus,
      });
    }
    if (result.parentPoStatus === 'Fully Received' && result.updated.vendorPoId) {
      await logAudit(id, 'po_auto_closed', user?.employeeId, actorName(user), {
        vendorPoId: result.updated.vendorPoId,
        newStatus: 'Fully Received',
      });
    } else if (result.parentPoStatus === 'Partially Received' && result.updated.vendorPoId) {
      await logAudit(id, 'po_reopened_for_receipt_adjustment', user?.employeeId, actorName(user), {
        vendorPoId: result.updated.vendorPoId,
        newStatus: 'Partially Received',
      });
    }
    res.json(result.updated);
  } catch (err: any) {
    console.error('PATCH /api/receipts/:id:', err);
    if (err?.status === 422) {
      return res.status(422).json({ error: err.message, blockers: err.blockers ?? [] });
    }
    res.status(500).json({ error: 'Failed to update receipt' });
  }
});

// ── POST /api/receipts/:id/lines ───────────────────────────────────────────────
router.post('/:id/lines', requireReceivingAccess, async (req: Request, res: Response) => {
  try {
    const receiptId = parseInt(req.params.id);
    const user = req.user;
    const body = insertReceiptLineSchema.parse({ ...req.body, receiptId });
    const [line] = await db.insert(receiptLines).values(body).returning();
    await logAudit(receiptId, 'line_added', user?.employeeId, actorName(user), {
      lineId: line.id, agPartNumber: line.agPartNumber ?? null, receivedQty: line.receivedQty,
    });
    res.status(201).json(line);
  } catch (err: any) {
    console.error('POST /api/receipts/:id/lines:', err);
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    res.status(500).json({ error: 'Failed to add receipt line' });
  }
});

// ── PATCH /api/receipts/:id/lines/:lineId ─────────────────────────────────────
router.patch('/:id/lines/:lineId', requireReceivingAccess, async (req: Request, res: Response) => {
  try {
    const receiptId = parseInt(req.params.id);
    const lineId = parseInt(req.params.lineId);
    const user = req.user;
    const line = await assertLineOwnership(receiptId, lineId);
    if (!line) return res.status(404).json({ error: 'Receipt line not found or does not belong to this receipt' });
    const updates = insertReceiptLineSchema.partial().parse(req.body);
    const [updated] = await db.update(receiptLines).set({ ...updates, updatedAt: new Date() }).where(eq(receiptLines.id, lineId)).returning();
    await logAudit(receiptId, 'line_updated', user?.employeeId, actorName(user), { lineId });
    res.json(updated);
  } catch (err: any) {
    console.error('PATCH receipt line:', err);
    res.status(500).json({ error: 'Failed to update receipt line' });
  }
});

// ── POST /api/receipts/:id/lines/:lineId/units ────────────────────────────────
router.post('/:id/lines/:lineId/units', requireReceivingAccess, async (req: Request, res: Response) => {
  try {
    const receiptId = parseInt(req.params.id);
    const lineId = parseInt(req.params.lineId);
    const user = req.user;

    const [receipt] = await db.select().from(receipts).where(eq(receipts.id, receiptId));
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });

    const line = await assertLineOwnership(receiptId, lineId);
    if (!line) return res.status(404).json({ error: 'Receipt line not found or does not belong to this receipt' });

    // Server-side traceability field config enforcement
    const TRACE_FIELDS = ['lotNumber','batchNumber','serialNumber','expirationDate','manufactureDate','heatLot','rollNumber','certReference'] as const;
    // Roll-split traceability relaxation: these four fields are always treated
    // as optional from receiving even when the part config marks them required.
    // Roll Number + Quantity remain the only enforced fields.
    const ALWAYS_OPTIONAL_TRACE_FIELDS = new Set(['manufactureDate', 'expirationDate', 'batchNumber', 'lotNumber']);
    if (line.agPartNumber) {
      const [invItem] = await db.select({ traceabilityFieldConfig: inventoryItems.traceabilityFieldConfig })
        .from(inventoryItems)
        .where(eq(inventoryItems.agPartNumber, line.agPartNumber))
        .limit(1);
      const fieldConfig = invItem?.traceabilityFieldConfig as Record<string, string> | null | undefined;
      if (fieldConfig && Object.keys(fieldConfig).length > 0) {
        // Validate required fields (excluding the always-optional set)
        const missingRequired = TRACE_FIELDS.filter(
          f => !ALWAYS_OPTIONAL_TRACE_FIELDS.has(f)
            && (fieldConfig[f] ?? 'optional') === 'required'
            && !req.body[f]?.toString().trim()
        );
        if (missingRequired.length > 0) {
          return res.status(422).json({ error: `Required traceability fields missing: ${missingRequired.join(', ')}` });
        }
        // Strip hidden fields from payload before saving
        for (const f of TRACE_FIELDS) {
          if ((fieldConfig[f] ?? 'optional') === 'hidden') {
            delete req.body[f];
          }
        }
      }
    }

    const unitSequence = await getNextUnitSequence(receiptId);
    const barcode = generateUnitBarcode(receipt.receiptNumber, unitSequence);

    const body = insertReceivedUnitSchema.parse({
      ...req.body,
      receiptId,
      receiptLineId: lineId,
      unitSequence,
      barcode,
    });
    const [unit] = await db.insert(receivedUnits).values(body).returning();

    await logAudit(receiptId, 'unit_added', user?.employeeId, actorName(user), {
      unitId: unit.id, barcode, unitSequence, disposition: unit.disposition,
    });

    if (body.disposition === 'accepted') {
      if (line.agPartNumber) {
        const missingDocs = await checkRequiredDocs(line.agPartNumber, receiptId);
        if (missingDocs.length > 0) {
          const displayName = actorName(user);
          await db.update(receivedUnits).set({
            disposition: 'document_hold',
            dispositionNotes: `Document hold: missing ${missingDocs.join(', ')}`,
            dispositionByUserId: user?.employeeId ?? null,
            dispositionByDisplayName: displayName,
            dispositionAt: new Date(),
            updatedAt: new Date(),
          }).where(eq(receivedUnits.id, unit.id));
          await logAudit(receiptId, 'document_hold_set', user?.employeeId, displayName, {
            unitId: unit.id,
            barcode,
            agPartNumber: line.agPartNumber,
            missingDocuments: missingDocs,
          });
          return res.status(422).json({
            error: 'Unit placed on document hold because required documents are missing for this part.',
            missingDocuments: missingDocs,
            disposition: 'document_hold',
          });
        }
      }
      try {
        await handleAcceptedUnit(unit, receipt, user);
      } catch (lotErr: any) {
        // Roll back all disposition metadata so the clerk can retry after fixing catalog data
        await db.update(receivedUnits).set({
          disposition: 'pending_inspection',
          dispositionNotes: null,
          dispositionByUserId: null,
          dispositionByDisplayName: null,
          dispositionAt: null,
          updatedAt: new Date(),
        }).where(eq(receivedUnits.id, unit.id));
        return res.status(422).json({ error: lotErr.message });
      }
    }

    res.status(201).json(unit);
  } catch (err: any) {
    console.error('POST unit:', err);
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    res.status(500).json({ error: 'Failed to add received unit' });
  }
});

// ── DELETE /api/receipts/:id/units/:unitId ────────────────────────────────────
// Only pending_inspection units may be deleted; accepted/quarantine/rejected are locked.
router.delete('/:id/units/:unitId', requireReceivingAccess, async (req: Request, res: Response) => {
  try {
    const receiptId = parseInt(req.params.id);
    const unitId = parseInt(req.params.unitId);
    const user = req.user;

    const unit = await assertUnitOwnership(receiptId, unitId);
    if (!unit) return res.status(404).json({ error: 'Unit not found or does not belong to this receipt' });

    if (unit.disposition !== 'pending_inspection') {
      return res.status(422).json({
        error: `Cannot remove a unit that has already been dispositioned as "${unit.disposition}". Only pending_inspection units can be deleted.`,
      });
    }

    await db.delete(receivedUnits).where(eq(receivedUnits.id, unitId));

    await logAudit(receiptId, 'unit_deleted', user?.employeeId, actorName(user), {
      unitId, barcode: unit.barcode, unitSequence: unit.unitSequence,
    });

    res.status(204).end();
  } catch (err: any) {
    console.error('DELETE unit:', err);
    res.status(500).json({ error: 'Failed to delete unit' });
  }
});

// ── PATCH /api/receipts/:id/units/:unitId ─────────────────────────────────────
router.patch('/:id/units/:unitId', requireReceivingAccess, async (req: Request, res: Response) => {
  try {
    const receiptId = parseInt(req.params.id);
    const unitId = parseInt(req.params.unitId);
    const user = req.user;
    const unit = await assertUnitOwnership(receiptId, unitId);
    if (!unit) return res.status(404).json({ error: 'Unit not found or does not belong to this receipt' });
    const updates = insertReceivedUnitSchema.partial().parse(req.body);

    // Audit traceability-affecting changes (location, freezer, allocation, disposition fields)
    const auditableKeys: (keyof typeof updates)[] = ['quantity', 'uom', 'unitType', 'location', 'freezerNumber', 'allocatedToType', 'allocatedToId', 'lotNumber', 'batchNumber', 'serialNumber', 'internalControlNumber', 'rollNumber', 'heatLot', 'manufactureDate', 'expirationDate', 'certReference'];
    const auditableChanges: Record<string, unknown> = {};
    for (const key of auditableKeys) {
      if (key in updates) auditableChanges[key] = updates[key];
    }

    const [updated] = await db.transaction(async (tx) => {
      let quantityAdjustment:
        | { materialLotId: string; internalControlNumber: string; before: number; delta: number; after: number }
        | null = null;

      if (unit.materialLotId) {
        const [lot] = await tx.select().from(materialLots).where(eq(materialLots.id, unit.materialLotId)).limit(1);
        if (lot) {
          const lotUpdates: Partial<typeof materialLots.$inferInsert> = { updatedAt: new Date() };

          if ('quantity' in updates && updates.quantity != null) {
            const oldQty = Number(unit.quantity);
            const newQty = Number(updates.quantity);
            const currentRemaining = Number(lot.remainingQty);
            if (!Number.isFinite(newQty) || newQty <= 0) {
              const error: any = new Error('Unit quantity must be greater than zero.');
              error.status = 422;
              throw error;
            }
            const delta = newQty - oldQty;
            const nextRemaining = currentRemaining + delta;
            if (nextRemaining < 0) {
              const error: any = new Error('Cannot reduce this accepted unit below material already issued or consumed.');
              error.status = 422;
              throw error;
            }
            if (delta !== 0) {
              lotUpdates.receivedQty = String(newQty);
              lotUpdates.remainingQty = String(nextRemaining);
              quantityAdjustment = {
                materialLotId: String(unit.materialLotId),
                internalControlNumber: lot.internalControlNumber,
                before: currentRemaining,
                delta,
                after: nextRemaining,
              };
            }
          }

          // materialLots.manufactureDate / expirationDate are timestamp columns,
          // so Drizzle expects Date | null (not the YYYY-MM-DD strings produced
          // by the receivedUnits date columns). Convert before assigning.
          const toTimestamp = (v: unknown): Date | null => {
            if (v == null || v === '') return null;
            if (v instanceof Date) return v;
            const d = new Date(v as string);
            return Number.isNaN(d.getTime()) ? null : d;
          };

          if ('uom' in updates && updates.uom != null) lotUpdates.unitOfMeasure = updates.uom;
          if ('lotNumber' in updates) lotUpdates.supplierLotNumber = updates.lotNumber ?? null;
          if ('manufactureDate' in updates) lotUpdates.manufactureDate = toTimestamp(updates.manufactureDate);
          if ('expirationDate' in updates) lotUpdates.expirationDate = toTimestamp(updates.expirationDate);
          if ('location' in updates) lotUpdates.storageLocation = updates.location ?? null;

          if (Object.keys(lotUpdates).length > 1) {
            await tx.update(materialLots).set(lotUpdates).where(eq(materialLots.id, unit.materialLotId));
          }

          // Only sync cutting_fabric_inventory if a row actually exists for this
          // unit's barcode — otherwise we waste a roundtrip on every adjustment
          // for non-fabric units.
          const [fabricRow] = await tx
            .select({ id: cuttingFabricInventory.id })
            .from(cuttingFabricInventory)
            .where(eq(cuttingFabricInventory.barcode, unit.barcode))
            .limit(1);
          if (fabricRow) {
            const cuttingUpdates: Partial<typeof cuttingFabricInventory.$inferInsert> = { updatedAt: new Date() };
            if ('quantity' in updates && updates.quantity != null) {
              const qty = Number(updates.quantity);
              cuttingUpdates.quantityInStock = qty;
              cuttingUpdates.squareMeters = String(qty);
            }
            if ('lotNumber' in updates) cuttingUpdates.lotNumber = updates.lotNumber ?? null;
            if ('batchNumber' in updates || 'heatLot' in updates) cuttingUpdates.batchNumber = updates.batchNumber ?? updates.heatLot ?? null;
            if ('rollNumber' in updates) cuttingUpdates.rollNumber = updates.rollNumber ?? null;
            if ('manufactureDate' in updates) cuttingUpdates.manufactureDate = updates.manufactureDate ?? null;
            if ('expirationDate' in updates) cuttingUpdates.expirationDate = updates.expirationDate ?? null;
            if ('location' in updates) cuttingUpdates.location = updates.location ?? null;
            if ('freezerNumber' in updates) cuttingUpdates.freezerNumber = updates.freezerNumber ?? null;

            if (Object.keys(cuttingUpdates).length > 1) {
              await tx.update(cuttingFabricInventory).set(cuttingUpdates).where(eq(cuttingFabricInventory.id, fabricRow.id));
            }
          }
        }
      }

      const [saved] = await tx.update(receivedUnits).set({ ...updates, updatedAt: new Date() }).where(eq(receivedUnits.id, unitId)).returning();

      if (quantityAdjustment) {
        const txValues: InsertMaterialLotTransaction = insertMaterialLotTransactionSchema.parse({
          materialLotId: quantityAdjustment.materialLotId,
          internalControlNumber: quantityAdjustment.internalControlNumber,
          transactionType: 'ADJUST',
          qtyBefore: String(quantityAdjustment.before),
          qtyChange: String(quantityAdjustment.delta),
          qtyAfter: String(quantityAdjustment.after),
          referenceType: 'received_unit_adjustment',
          referenceId: String(unitId),
          receiptId,
          performedBy: actorName(user),
          notes: `Receiving correction for unit ${saved.barcode}`,
        });
        await tx.insert(materialLotTransactions).values(txValues);
      }

      return [saved];
    });

    if (Object.keys(auditableChanges).length > 0) {
      await logAudit(receiptId, 'unit_updated', user?.employeeId, actorName(user), { unitId, changes: auditableChanges });
    }

    res.json(updated);
  } catch (err: any) {
    console.error('PATCH unit:', err);
    if (err?.status === 422) {
      return res.status(422).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to update unit' });
  }
});

// ── POST /api/receipts/:id/units/:unitId/disposition ─────────────────────────
router.post('/:id/units/:unitId/disposition', requireReceivingAccess, async (req: Request, res: Response) => {
  try {
    const receiptId = parseInt(req.params.id);
    const unitId = parseInt(req.params.unitId);
    const user = req.user;
    const { disposition, notes } = req.body as { disposition: string; notes?: string };

    const allowedDispositions = [
      'pending_inspection',
      'document_hold',
      'accepted',
      'quarantine',
      'rejected',
      'rejected_returned',
      'rejected_scrapped',
      'rejected_reallocated',
    ];
    if (!allowedDispositions.includes(disposition)) {
      return res.status(400).json({ error: 'Invalid disposition value' });
    }

    // Server-side enforcement: holds, quarantine, and rejected dispositions require notes
    if ((disposition === 'document_hold' || disposition === 'quarantine' || disposition.startsWith('rejected')) && !notes?.trim()) {
      return res.status(422).json({ error: `Notes are required when setting disposition to "${disposition}"` });
    }

    const unitCheck = await assertUnitOwnership(receiptId, unitId);
    if (!unitCheck) return res.status(404).json({ error: 'Unit not found or does not belong to this receipt' });

    // Expiration gate: cannot accept or issue expired material
    if (disposition === 'accepted') {
      const expStatus = receivedUnitExpirationStatus(unitCheck.expirationDate ?? undefined);
      if (expStatus === 'expired') {
        return res.status(422).json({
          error: 'Cannot accept an expired unit. Update the expiration date or reject/quarantine this unit.',
          expirationStatus: 'expired',
          expirationDate: unitCheck.expirationDate,
        });
      }

      // Required document enforcement
      const [receipt] = await db.select().from(receipts).where(eq(receipts.id, receiptId));
      const [line] = await db.select().from(receiptLines).where(eq(receiptLines.id, unitCheck.receiptLineId));
      if (line?.agPartNumber) {
        const missingDocs = await checkRequiredDocs(line.agPartNumber, receiptId);
        if (missingDocs.length > 0) {
          const displayName = actorName(user);
          await db.update(receivedUnits).set({
            disposition: 'document_hold',
            dispositionNotes: `Document hold: missing ${missingDocs.join(', ')}`,
            dispositionByUserId: user?.employeeId ?? null,
            dispositionByDisplayName: displayName,
            dispositionAt: new Date(),
            updatedAt: new Date(),
          }).where(eq(receivedUnits.id, unitId));
          await logAudit(receiptId, 'document_hold_set', user?.employeeId, displayName, {
            unitId,
            barcode: unitCheck.barcode,
            agPartNumber: line.agPartNumber,
            missingDocuments: missingDocs,
            disposition: 'document_hold',
          });
          return res.status(422).json({
            error: 'Unit placed on document hold because required documents are missing for this part.',
            missingDocuments: missingDocs,
          });
        }
      }
    }

    const displayName = actorName(user);
    const [unit] = await db.update(receivedUnits).set({
      disposition,
      dispositionNotes: notes ?? null,
      dispositionByUserId: user?.employeeId ?? null,
      dispositionByDisplayName: displayName,
      dispositionAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(receivedUnits.id, unitId)).returning();

    await logAudit(receiptId, 'disposition_set', user?.employeeId, displayName, {
      unitId, disposition, barcode: unit.barcode, notes: notes ?? null,
    });

    if (disposition === 'accepted') {
      const [receipt] = await db.select().from(receipts).where(eq(receipts.id, receiptId));
      if (receipt) {
        try {
          await handleAcceptedUnit(unit, receipt, user);
        } catch (lotErr: any) {
          // Roll back all disposition metadata so the clerk can retry after fixing catalog data
          await db.update(receivedUnits).set({
            disposition: 'pending_inspection',
            dispositionNotes: null,
            dispositionByUserId: null,
            dispositionByDisplayName: null,
            dispositionAt: null,
            updatedAt: new Date(),
          }).where(eq(receivedUnits.id, unitId));
          return res.status(422).json({ error: lotErr.message });
        }
      }
    }

    res.json(unit);
  } catch (err: any) {
    console.error('POST disposition:', err);
    res.status(500).json({ error: 'Failed to set disposition' });
  }
});

// ── POST /api/receipts/:id/documents ─────────────────────────────────────────
// Uploads to configured file storage, creates media_library record, links in receipt_documents
router.post('/:id/documents', requireReceivingAccess, uploadReceiptDocument, async (req: Request, res: Response) => {
  try {
    const receiptId = parseInt(req.params.id);
    const user = req.user;
    const displayName = actorName(user);
    const { docType, notes, receivedUnitId } = req.body as { docType?: string; notes?: string; receivedUnitId?: string };

    // Validate receivedUnitId ownership if provided
    if (receivedUnitId) {
      const unitCheck = await assertUnitOwnership(receiptId, parseInt(receivedUnitId));
      if (!unitCheck) return res.status(400).json({ error: 'Unit does not belong to this receipt' });
    }

    let storagePath: string | null = null;
    let filename: string | null = null;
    let mimeType: string | null = null;
    let fileSize: number | null = null;
    let mediaLibraryId: string | null = null;

    if (req.file) {
      filename = req.file.originalname;
      mimeType = req.file.mimetype;
      fileSize = req.file.size;

      const storageProvider = getFileStorageProvider();
      storagePath = await storageProvider.uploadBuffer({
        buffer: req.file.buffer,
        fileName: filename,
        contentType: mimeType,
        scope: 'receiving-documents',
        entityId: String(receiptId),
      });

      // Create media_library record for cross-system traceability
      const mediaValues: InsertMediaLibrary = {
        filename,
        storagePath: storagePath ?? filename,
        mimeType,
        fileSize: fileSize ?? undefined,
        capturedById: user?.employeeId ?? null,
        capturedByName: displayName,
        category: docType ?? 'other',
        tags: ['receiving', `receipt-${receiptId}`],
        title: `Receipt ${receiptId} — ${docType ?? 'document'}`,
        notes: notes ?? null,
      };
      try {
        const parsed = insertMediaLibrarySchema.parse(mediaValues);
        const [mediaRecord] = await db.insert(mediaLibrary).values(parsed).returning();
        mediaLibraryId = mediaRecord?.id ?? null;
      } catch (mediaErr: any) {
        console.warn('media_library insert failed:', mediaErr.message);
      }
    }

    const docValues = insertReceiptDocumentSchema.parse({
      receiptId,
      receivedUnitId: receivedUnitId ? parseInt(receivedUnitId) : null,
      mediaId: mediaLibraryId,
      docType: docType || 'other',
      filename,
      storagePath,
      mimeType,
      notes: notes || null,
      uploadedByUserId: user?.employeeId ?? null,
      uploadedByDisplayName: displayName,
    });
    const [doc] = await db.insert(receiptDocuments).values(docValues).returning();

    await logAudit(receiptId, 'document_uploaded', user?.employeeId, displayName, {
      docId: doc.id, docType: docType ?? null, filename: filename ?? null, mediaLibraryId,
    });

    res.status(201).json(doc);
  } catch (err: any) {
    console.error('POST document:', err);
    const { status, reason, message } = getStorageErrorResponse(err);
    if (reason !== 'storage_error') {
      return res.status(status).json({ error: message, reason });
    }
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// ── DELETE /api/receipts/:id/documents/:docId ─────────────────────────────────
router.delete('/:id/documents/:docId', requireReceivingAccess, async (req: Request, res: Response) => {
  try {
    const receiptId = parseInt(req.params.id);
    const docId = parseInt(req.params.docId);
    const user = req.user;

    // IDOR: validate document belongs to this receipt
    const [doc] = await db.select().from(receiptDocuments).where(
      and(eq(receiptDocuments.id, docId), eq(receiptDocuments.receiptId, receiptId))
    );
    if (!doc) return res.status(404).json({ error: 'Document not found or does not belong to this receipt' });

    await db.delete(receiptDocuments).where(eq(receiptDocuments.id, docId));
    await logAudit(receiptId, 'document_deleted', user?.employeeId, actorName(user), { docId });
    res.status(204).end();
  } catch (err: any) {
    console.error('DELETE document:', err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// ── GET /api/receipts/:id/units/:unitId/label ─────────────────────────────────
// Returns label data + CODE128 barcode image (via bwip-js)
router.get('/:id/units/:unitId/label', requireReceivingAccess, async (req: Request, res: Response) => {
  try {
    const receiptId = parseInt(req.params.id);
    const unitId = parseInt(req.params.unitId);

    const [receipt] = await db.select().from(receipts).where(eq(receipts.id, receiptId));
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });

    const unit = await assertUnitOwnership(receiptId, unitId);
    if (!unit) return res.status(404).json({ error: 'Unit not found or does not belong to this receipt' });

    const [line] = await db.select().from(receiptLines).where(eq(receiptLines.id, unit.receiptLineId));

    const user = req.user;
    await logAudit(receiptId, 'label_printed', user?.employeeId, actorName(user), { unitId, barcode: unit.barcode });

    let barcodeImage: string | null = null;
    try {
      barcodeImage = await generateBarcodeImage(unit.barcode, { format: 'CODE128', width: 3, height: 12 });
    } catch (barcodeErr) {
      console.warn('Barcode image generation failed:', barcodeErr);
    }

    res.json({
      barcode: unit.barcode,
      barcodeImage,
      agPartNumber: line?.agPartNumber ?? '',
      description: line?.description ?? '',
      quantity: unit.quantity,
      uom: unit.uom,
      lotNumber: unit.lotNumber,
      batchNumber: unit.batchNumber,
      serialNumber: unit.serialNumber,
      internalControlNumber: unit.internalControlNumber,
      rollNumber: unit.rollNumber,
      heatLot: unit.heatLot,
      certReference: unit.certReference,
      manufactureDate: unit.manufactureDate,
      expirationDate: unit.expirationDate,
      poNumber: receipt.vendorPoNumber,
      receiptDate: receipt.receiptDate,
      receiptNumber: receipt.receiptNumber,
      vendorName: receipt.vendorName,
      disposition: unit.disposition,
      location: unit.location,
    });
  } catch (err: any) {
    console.error('GET label:', err);
    res.status(500).json({ error: 'Failed to fetch label data' });
  }
});

// ── POST /api/receipts/:id/labels/batch ──────────────────────────────────────
// Returns array of label data with barcodeImage for batch PDF printing on the client
router.post('/:id/labels/batch', requireReceivingAccess, async (req: Request, res: Response) => {
  try {
    const receiptId = parseInt(req.params.id);
    const user = req.user;

    const [receipt] = await db.select().from(receipts).where(eq(receipts.id, receiptId));
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });

    const units = await db.select().from(receivedUnits).where(eq(receivedUnits.receiptId, receiptId));
    const lines = await db.select().from(receiptLines).where(eq(receiptLines.receiptId, receiptId));
    const lineMap = new Map(lines.map(l => [l.id, l]));

    await logAudit(receiptId, 'batch_labels_printed', user?.employeeId, actorName(user), { unitCount: units.length });

    const labels = await Promise.all(units.map(async unit => {
      const line = lineMap.get(unit.receiptLineId);
      let barcodeImage: string | null = null;
      try {
        barcodeImage = await generateBarcodeImage(unit.barcode, { format: 'CODE128', width: 3, height: 12 });
      } catch (_) {}
      return {
        barcode: unit.barcode,
        barcodeImage,
        agPartNumber: line?.agPartNumber ?? '',
        description: line?.description ?? '',
        quantity: unit.quantity,
        uom: unit.uom,
        lotNumber: unit.lotNumber,
        batchNumber: unit.batchNumber,
        serialNumber: unit.serialNumber,
        internalControlNumber: unit.internalControlNumber,
        rollNumber: unit.rollNumber,
        heatLot: unit.heatLot,
        certReference: unit.certReference,
        manufactureDate: unit.manufactureDate,
        expirationDate: unit.expirationDate,
        poNumber: receipt.vendorPoNumber,
        receiptDate: receipt.receiptDate,
        receiptNumber: receipt.receiptNumber,
        vendorName: receipt.vendorName,
        disposition: unit.disposition,
        location: unit.location,
      };
    }));

    res.json(labels);
  } catch (err: any) {
    console.error('POST batch labels:', err);
    res.status(500).json({ error: 'Failed to fetch batch label data' });
  }
});

// ── GET /api/receipts/:id/audit ───────────────────────────────────────────────
router.get('/:id/audit', requireReceivingAccess, async (req: Request, res: Response) => {
  try {
    const receiptId = parseInt(req.params.id);
    const logs = await db.select().from(receiptAuditLog)
      .where(eq(receiptAuditLog.receiptId, receiptId))
      .orderBy(desc(receiptAuditLog.createdAt));
    res.json(logs);
  } catch (err: any) {
    console.error('GET audit log:', err);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// ── Helper: required-document checker ────────────────────────────────────────
// Returns array of missing doc types, or empty array if all required docs present.
async function checkRequiredDocs(agPartNumber: string, receiptId: number): Promise<string[]> {
  if (!agPartNumber) return [];

  // Fetch doc requirements for this inventory item
  const invResult = await db.execute(
    sql`SELECT requires_sds, requires_tds, requires_coc, requires_test_report, requires_packing_slip_photo,
               has_sds, sds_file_path, has_tds, tds_file_path, has_other_docs, other_docs_file_path
        FROM inventory_items WHERE ag_part_number = ${agPartNumber} LIMIT 1`
  );
  const invRows = sqlRows<{
    requires_sds: boolean;
    requires_tds: boolean;
    requires_coc: boolean;
    requires_test_report: boolean;
    requires_packing_slip_photo: boolean;
    has_sds: boolean | null;
    sds_file_path: string | null;
    has_tds: boolean | null;
    tds_file_path: string | null;
    has_other_docs: boolean | null;
    other_docs_file_path: string | null;
  }>(invResult);

  if (!invRows.length) return []; // Item not found — no requirements

  const req = invRows[0];
  const requiredTypes: Array<{
    flag: boolean;
    label: string;
    receiptDocAliases: string[];
    itemLinked: boolean;
  }> = [
    {
      flag: req.requires_sds,
      label: 'Safety Data Sheet (SDS)',
      receiptDocAliases: ['SDS'],
      itemLinked: Boolean(req.has_sds || req.sds_file_path),
    },
    {
      flag: req.requires_tds,
      label: 'Technical Data Sheet (TDS)',
      receiptDocAliases: ['TDS'],
      itemLinked: Boolean(req.has_tds || req.tds_file_path),
    },
    {
      flag: req.requires_coc,
      label: 'Certificate of Conformance (CoC)',
      receiptDocAliases: ['COC', 'COFC', 'CERTIFICATE_OF_CONFORMANCE'],
      itemLinked: false,
    },
    {
      flag: req.requires_test_report,
      label: 'Certificate / Test Report',
      receiptDocAliases: ['CERT', 'CERTIFICATE', 'TEST_REPORT', 'CALIBRATION_CERT'],
      itemLinked: Boolean(req.has_other_docs || req.other_docs_file_path),
    },
    {
      flag: req.requires_packing_slip_photo,
      label: 'Packing Slip Photo',
      receiptDocAliases: ['PACKING_SLIP', 'PACKING_SLIP_PHOTO'],
      itemLinked: false,
    },
  ].filter(r => r.flag);

  if (!requiredTypes.length) return [];

  // Fetch uploaded docs for this receipt
  const docResult = await db.execute(
    sql`SELECT doc_type FROM receipt_documents WHERE receipt_id = ${receiptId}`
  );
  const docRows = sqlRows<{ doc_type: string }>(docResult);
  const uploaded = new Set(docRows.map(d => normalizeReceiptDocType(d.doc_type)));

  return requiredTypes
    .filter(required => !required.itemLinked && !required.receiptDocAliases.some(alias => uploaded.has(alias)))
    .map(required => required.label);
}

function normalizeReceiptDocType(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

// ── Helper: expiration status for a received unit ────────────────────────────
function receivedUnitExpirationStatus(expirationDate: string | null | undefined): 'ok' | 'near_expiry' | 'expired' {
  if (!expirationDate) return 'ok';
  const exp = new Date(expirationDate);
  const now = new Date();
  if (exp < now) return 'expired';
  const daysUntil = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (daysUntil <= 30) return 'near_expiry';
  return 'ok';
}

// ── Helper: auto-create material_lot for accepted units ───────────────────────
async function handleAcceptedUnit(unit: ReceivedUnit, receipt: Receipt, user: AuthUser): Promise<void> {
  try {
    // Idempotency guard: if this unit already has a material lot, do not create another
    if (unit.materialLotId) {
      return;
    }

    const displayName = actorName(user);

    const [line] = await db.select().from(receiptLines).where(eq(receiptLines.id, unit.receiptLineId));
    if (!line?.agPartNumber) {
      throw new Error(`Receipt line ${unit.receiptLineId} has no AG part number — cannot create material lot`);
    }

    // Find inventory item — required for material lot linkage; fail-fast if missing
    const invResult = await db.execute(
      sql`SELECT id, name, ag_part_number, is_fabric, utilized_in_pl1, utilized_in_pl2, supplier_part_number,
                 shelf_life_controlled, frozen_shelf_life_days, room_temp_shelf_life_days, default_max_out_time_minutes
          FROM inventory_items WHERE ag_part_number = ${line.agPartNumber} LIMIT 1`
    );
    const invRows = sqlRows<{
      id: number;
      name: string;
      ag_part_number: string;
      is_fabric: boolean | null;
      utilized_in_pl1: boolean | null;
      utilized_in_pl2: boolean | null;
      supplier_part_number: string | null;
      shelf_life_controlled: boolean | null;
      frozen_shelf_life_days: number | null;
      room_temp_shelf_life_days: number | null;
      default_max_out_time_minutes: number | null;
    }>(invResult);
    if (!invRows.length) {
      throw new Error(`No inventory_items record found for ag_part_number="${line.agPartNumber}" — create the inventory item before accepting units for this part`);
    }
    const invItem = invRows[0];
    const receivedQty = Number(unit.quantity);
    if (!Number.isFinite(receivedQty) || receivedQty <= 0) {
      throw new Error(`Received unit ${unit.id} has invalid quantity "${unit.quantity}"`);
    }

    // Shelf-life prefill (Task #165) — only when the part is shelf-life-controlled
    // and the receiving unit didn't already supply a value. Uses frozen days as
    // the conservative default; falls back to room-temp days when frozen is unset.
    let prefilledExpiration: Date | null = unit.expirationDate ?? null;
    let prefilledMaxOutTime: number | null = invItem.default_max_out_time_minutes ?? null;
    if (invItem.shelf_life_controlled && !prefilledExpiration) {
      const days = invItem.frozen_shelf_life_days ?? invItem.room_temp_shelf_life_days;
      if (days != null && days > 0) {
        const base = unit.manufactureDate ? new Date(unit.manufactureDate) : new Date();
        const exp = new Date(base);
        exp.setDate(exp.getDate() + days);
        prefilledExpiration = exp;
      }
    }

    // Atomic block: ICN reservation, material_lot insert, received_unit link,
    // material_lot_transactions insert, and inventory_transaction_ledger write
    // succeed or fail together. If any step throws, none of them persist.
    const { lot, icn } = await db.transaction(async (tx) => {
      // Generate ICN inside the transaction to reduce race-condition window
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
      const icnPrefix = `ICN-MAT-${dateStr}-`;
      const icnResult = await tx.execute(
        sql`SELECT internal_control_number FROM material_lots WHERE internal_control_number LIKE ${icnPrefix + '%'} ORDER BY internal_control_number DESC LIMIT 1`
      );
      const icnRows = sqlRows<{ internal_control_number: string }>(icnResult);
      const lastSeq = icnRows.length > 0
        ? parseInt((icnRows[0].internal_control_number).split('-').pop() ?? '0', 10)
        : 0;
      const icn = `${icnPrefix}${String(lastSeq + 1).padStart(6, '0')}`;

      // Type-safe material lot insert
      const lotValues: InsertMaterialLot = insertMaterialLotSchema.parse({
        inventoryItemId: invItem.id,
        materialPartNumber: line.agPartNumber,
        materialName: invItem.name ?? line.description ?? '',
        internalControlNumber: icn,
        supplier: receipt.vendorName ?? 'Unknown',
        supplierLotNumber: unit.lotNumber ?? null,
        supplierPartNumber: null,
        purchaseOrderNumber: receipt.vendorPoNumber ?? null,
        receivingRecordNumber: receipt.receiptNumber,
        receivedQty: String(unit.quantity),
        remainingQty: String(unit.quantity),
        unitOfMeasure: unit.uom ?? 'EA',
        expirationDate: prefilledExpiration,
        manufactureDate: unit.manufactureDate ?? null,
        storageLocation: unit.location ?? null,
        maxOutTimeMinutes: prefilledMaxOutTime,
        status: 'ACCEPTED',
        receivedBy: displayName,
        notes: `Auto-created from receipt ${receipt.receiptNumber} unit ${unit.barcode}`,
      });

      const [lot] = await tx.insert(materialLots).values(lotValues).returning();
      if (!lot?.id) throw new Error('material_lots insert returned no row');

      // Link UUID back to received_unit
      await tx.update(receivedUnits).set({
        materialLotId: lot.id,
        updatedAt: new Date(),
      }).where(eq(receivedUnits.id, unit.id));

      // Type-safe transaction insert — referenceId = received_unit.id, receiptId = receipt.id (explicit FK)
      const txValues: InsertMaterialLotTransaction = insertMaterialLotTransactionSchema.parse({
        materialLotId: lot.id,
        internalControlNumber: icn,
        transactionType: 'RECEIVE',
        qtyBefore: '0',
        qtyChange: String(unit.quantity),
        qtyAfter: String(unit.quantity),
        performedBy: displayName,
        referenceType: 'received_unit',
        referenceId: String(unit.id),
        receiptId: receipt.id,
        notes: `Receipt ${receipt.receiptNumber} · unit barcode ${unit.barcode}`,
      });
      await tx.insert(materialLotTransactions).values(txValues);

      // Task #216 — Live ITL write so receipts show in Material Traceability Viewer.
      // Must succeed inside the same transaction as the MLT insert.
      await recordInventoryLedgerEntry({
        transactionType: 'RECEIVE',
        inventoryItemId: invItem.id,
        agPartNumber: line.agPartNumber,
        lotId: lot.id,
        unitOfMeasure: unit.uom ?? 'EA',
        quantityBefore: 0,
        quantityDelta: receivedQty,
        quantityAfter: receivedQty,
        performedByUserId: user?.id ?? null,
        performedByDisplayName: displayName,
        reasonCode: 'RECEIPT_ACCEPTED',
        notes: `Receipt ${receipt.receiptNumber}: accepted unit ${unit.barcode}`,
        sourceModule: 'receiving',
        sourceRecordId: unit.id,
        metadata: {
          receiptId: receipt.id,
          receiptNumber: receipt.receiptNumber,
          receivedUnitId: unit.id,
          unitBarcode: unit.barcode,
          materialLotId: lot.id,
          internalControlNumber: icn,
        },
      }, tx);

      return { lot, icn };
    });

    await createInventoryEvent({
      agPartNumber: line.agPartNumber,
      eventType: 'receipt',
      quantity: receivedQty,
      lotId: lot.id,
      unitOfMeasure: unit.uom ?? 'EA',
      toLocation: unit.location?.trim() || 'WAREHOUSE-MAIN',
      referenceType: 'RECEIVED_UNIT',
      referenceId: unit.id,
      performedBy: displayName,
      notes: `Receipt ${receipt.receiptNumber}: accepted unit ${unit.barcode}`,
      metadata: {
        receiptId: receipt.id,
        receiptNumber: receipt.receiptNumber,
        receivedUnitId: unit.id,
        unitBarcode: unit.barcode,
        materialLotId: lot.id,
        internalControlNumber: icn,
      },
    });

    const isCuttingFabric = Boolean(invItem.is_fabric && (invItem.utilized_in_pl1 || invItem.utilized_in_pl2));
    if (isCuttingFabric) {
      const toDateOnly = (value: Date | string | null | undefined): string | undefined => {
        if (!value) return undefined;
        if (typeof value === 'string') return value.slice(0, 10);
        return value.toISOString().slice(0, 10);
      };
      const qty = Number(unit.quantity);
      const qtyForFabric = Number.isFinite(qty) && qty > 0 ? qty : 0;
      const receivedDate = toDateOnly(receipt.receivedAt ?? receipt.receiptDate ?? new Date());
      const [fabricInventory] = await db.insert(cuttingFabricInventory).values({
        inventoryItemId: invItem.id,
        source: receipt.vendorName ?? null,
        fabric: invItem.name ?? line.description ?? line.agPartNumber,
        fabricPartNumber: line.agPartNumber,
        nickname: invItem.name ?? line.description ?? null,
        supplierPartNumber: invItem.supplier_part_number ?? null,
        supplierPoNumber: receipt.vendorPoNumber ?? null,
        internalControlNumber: icn,
        barcode: unit.barcode,
        lotNumber: unit.lotNumber ?? null,
        batchNumber: unit.batchNumber ?? unit.heatLot ?? null,
        rollNumber: unit.rollNumber ?? null,
        manufactureDate: toDateOnly(unit.manufactureDate) ?? null,
        receivedDate,
        expirationDate: toDateOnly(prefilledExpiration ?? unit.expirationDate) ?? null,
        location: unit.location ?? null,
        quantityInStock: qtyForFabric,
        squareMeters: qtyForFabric > 0 ? String(qtyForFabric) : undefined,
        notes: `Auto-created from Receiving Control Center receipt ${receipt.receiptNumber} unit ${unit.barcode}. Freezer assignment pending in Cutting Fabric Receiving.`,
        status: 'active',
      }).returning();

      if (fabricInventory?.id && qtyForFabric > 0) {
        await db.insert(cuttingFabricInventoryTransactions).values({
          fabricInventoryId: fabricInventory.id,
          changeType: 'RECEIPT',
          quantityDelta: nonZeroInventoryDelta(qtyForFabric),
          performedBy: displayName,
          notes: `Receipt ${receipt.receiptNumber}: received unit ${unit.barcode} into cutting fabric inventory`,
        });
      }
    }

  } catch (err: any) {
    // Re-throw so callers can return a 422 to the client with the exact reason
    throw new Error(`handleAcceptedUnit: ${err.message}`);
  }
}

// ── Helper: determine whether a receipt line strictly requires per-unit traceability ──
// Lines whose part config marks serial / roll / lot as "required" must be explicitly
// split by the receiver — they cannot be auto-promoted to a single bulk unit because
// each physical unit needs its own serial / roll / lot identifier.
async function lineRequiresStrictSplit(line: ReceiptLine): Promise<{ requires: boolean; fields: string[] }> {
  if (!line.agPartNumber) return { requires: false, fields: [] };
  const [invItem] = await db.select({ traceabilityFieldConfig: inventoryItems.traceabilityFieldConfig })
    .from(inventoryItems)
    .where(eq(inventoryItems.agPartNumber, line.agPartNumber))
    .limit(1);
  const cfg = invItem?.traceabilityFieldConfig as Record<string, string> | null | undefined;
  if (!cfg) return { requires: false, fields: [] };
  const STRICT_KEYS = ['serialNumber', 'rollNumber', 'lotNumber'] as const;
  const fields = STRICT_KEYS.filter(f => (cfg[f] ?? 'optional') === 'required');
  return { requires: fields.length > 0, fields };
}

// ── POST /api/receipts/:id/ensure-units ──────────────────────────────────────
// Idempotently promote each receipt line that has receivedQty > 0 and zero existing
// units into a single default received_units record so it shows up in Disposition.
// Lines whose part config strictly requires per-unit traceability (serial / roll / lot)
// are skipped and reported back so the UI can prompt the receiver to split them.
router.post('/:id/ensure-units', requireReceivingAccess, async (req: Request, res: Response) => {
  try {
    const receiptId = parseInt(req.params.id);
    const user = req.user;

    const [receipt] = await db.select().from(receipts).where(eq(receipts.id, receiptId));
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });

    const lines = await db.select().from(receiptLines).where(eq(receiptLines.receiptId, receiptId));
    const created: ReceivedUnit[] = [];
    const skipped: Array<{
      lineId: number;
      agPartNumber: string | null;
      reason: 'strict_traceability_required';
      requiredFields: string[];
    }> = [];

    for (const line of lines) {
      const receivedQty = parseFloat(String(line.receivedQty ?? '0'));
      if (!Number.isFinite(receivedQty) || receivedQty <= 0) continue;

      const existing = await db.select({ id: receivedUnits.id })
        .from(receivedUnits)
        .where(eq(receivedUnits.receiptLineId, line.id))
        .limit(1);
      if (existing.length > 0) continue;

      const strict = await lineRequiresStrictSplit(line);
      if (strict.requires) {
        skipped.push({
          lineId: line.id,
          agPartNumber: line.agPartNumber ?? null,
          reason: 'strict_traceability_required',
          requiredFields: strict.fields,
        });
        continue;
      }

      const unitSequence = await getNextUnitSequence(receiptId);
      const barcode = generateUnitBarcode(receipt.receiptNumber, unitSequence);
      const body = insertReceivedUnitSchema.parse({
        receiptId,
        receiptLineId: line.id,
        unitSequence,
        barcode,
        unitType: 'other',
        quantity: String(receivedQty),
        uom: line.uom ?? 'EA',
      });
      const [unit] = await db.insert(receivedUnits).values(body).returning();
      created.push(unit);

      await logAudit(receiptId, 'unit_auto_created', user?.employeeId, actorName(user), {
        lineId: line.id,
        unitId: unit.id,
        barcode,
        unitSequence,
        quantity: String(receivedQty),
        reason: 'non_split_line_promoted_to_disposition',
      });
    }

    res.json({ created, skipped, createdCount: created.length, skippedCount: skipped.length });
  } catch (err: any) {
    console.error('POST ensure-units:', err);
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    res.status(500).json({ error: 'Failed to ensure units for receipt' });
  }
});

// ── POST /api/receipts/:id/lines/:lineId/split ────────────────────────────────
// Split a receipt line into N units.
// Equal-split mode (default): Body: { count: number, templateFields?: Partial<InsertReceivedUnit> }
// Roll-based mode (array): Body: { count: number, sqmPerRollArray: number[], rollNumbers: string[], templateFields?: Partial<InsertReceivedUnit> }
//   Each unit gets the corresponding sqmPerRollArray[i] as its quantity and rollNumbers[i] as its exact roll number;
//   receivedQty is updated to the array sum.
// Roll-based mode (legacy scalar): Body: { count: number, sqmPerRoll: number, templateFields?: Partial<InsertReceivedUnit> }
//   All units share the same quantity; receivedQty updated to count × sqmPerRoll.
router.post('/:id/lines/:lineId/split', requireReceivingAccess, async (req: Request, res: Response) => {
  try {
    const receiptId = parseInt(req.params.id);
    const lineId = parseInt(req.params.lineId);
    const user = req.user;
    const { count, sqmPerRoll, sqmPerRollArray, rollNumbers, templateFields } = req.body as {
      count: number;
      sqmPerRoll?: number;
      sqmPerRollArray?: number[];
      rollNumbers?: string[];
      templateFields?: Record<string, unknown>;
    };

    if (!count || count < 2 || count > 200) {
      return res.status(400).json({ error: 'count must be between 2 and 200' });
    }

    let normalizedRollNumbers: string[] | undefined;
    if (sqmPerRollArray !== undefined) {
      if (!Array.isArray(sqmPerRollArray) || sqmPerRollArray.length !== count) {
        return res.status(400).json({ error: `sqmPerRollArray must have exactly ${count} entries` });
      }
      if (sqmPerRollArray.some(v => typeof v !== 'number' || !Number.isFinite(v) || v <= 0)) {
        return res.status(400).json({ error: 'Every entry in sqmPerRollArray must be a finite positive number' });
      }
      if (!Array.isArray(rollNumbers) || rollNumbers.length !== count) {
        return res.status(400).json({ error: `rollNumbers must have exactly ${count} entries` });
      }
      if (rollNumbers.some(v => typeof v !== 'string' || v.trim().length === 0)) {
        return res.status(400).json({ error: 'Every roll number must be provided for roll-based splits' });
      }
      normalizedRollNumbers = rollNumbers.map(v => v.trim());
    } else if (sqmPerRoll !== undefined && (typeof sqmPerRoll !== 'number' || !Number.isFinite(sqmPerRoll) || sqmPerRoll <= 0)) {
      return res.status(400).json({ error: 'sqmPerRoll must be a positive number' });
    }

    const [receipt] = await db.select().from(receipts).where(eq(receipts.id, receiptId));
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });

    const line = await assertLineOwnership(receiptId, lineId);
    if (!line) return res.status(404).json({ error: 'Receipt line not found' });

    const isRollArray = sqmPerRollArray !== undefined;
    const isRollScalar = !isRollArray && sqmPerRoll !== undefined;
    const isRollBased = isRollArray || isRollScalar;

    // Build unit rows first so we can validate before writing
    const unitBodies = [];
    // Fetch the starting sequence once so every unit in the batch gets a unique value.
    // Calling getNextUnitSequence inside the loop would return the same MAX+1 every
    // iteration because no units are inserted until the transaction below.
    let nextSequence = await getNextUnitSequence(receiptId);
    for (let i = 0; i < count; i++) {
      let qtyForUnit: number;
      if (isRollArray) {
        qtyForUnit = sqmPerRollArray![i];
      } else if (isRollScalar) {
        qtyForUnit = sqmPerRoll!;
      } else {
        const totalQty = parseFloat(String(line.receivedQty ?? '0')) || parseFloat(String(line.orderedQty ?? '1'));
        qtyForUnit = totalQty / count;
      }
      const unitSequence = nextSequence++;
      const barcode = generateUnitBarcode(receipt.receiptNumber, unitSequence);
      const body = insertReceivedUnitSchema.parse({
        ...(templateFields ?? {}),
        receiptId,
        receiptLineId: lineId,
        unitSequence,
        barcode,
        quantity: String(qtyForUnit),
        uom: line.uom ?? 'EA',
        ...(isRollArray && normalizedRollNumbers ? { rollNumber: normalizedRollNumbers[i] } : {}),
      });
      unitBodies.push(body);
    }

    // Wrap line-qty update + all unit inserts in a single transaction for roll mode
    // so a partial failure never leaves the line quantity updated without units
    const units: ReceivedUnit[] = await db.transaction(async (tx) => {
      if (isRollBased) {
        const newReceivedQty = isRollArray
          ? sqmPerRollArray!.reduce((s, v) => s + v, 0)
          : count * sqmPerRoll!;
        await tx.update(receiptLines).set({
          receivedQty: String(newReceivedQty),
          updatedAt: new Date(),
        }).where(eq(receiptLines.id, lineId));
      }
      const inserted: ReceivedUnit[] = [];
      for (const body of unitBodies) {
        const [unit] = await tx.insert(receivedUnits).values(body).returning();
        inserted.push(unit);
      }
      return inserted;
    });

    const totalQtyForAudit = isRollArray
      ? sqmPerRollArray!.reduce((s, v) => s + v, 0)
      : isRollScalar
        ? count * sqmPerRoll!
        : undefined;

    await logAudit(receiptId, 'line_split', user?.employeeId, actorName(user), {
      lineId,
      count,
      mode: isRollBased ? 'by_rolls' : 'equal',
      ...(isRollArray ? {
        sqmPerRollArray: sqmPerRollArray!.map(String),
        rollNumbers: normalizedRollNumbers,
        totalQty: String(totalQtyForAudit),
      } : isRollScalar ? {
        sqmPerRoll: String(sqmPerRoll),
        totalQty: String(totalQtyForAudit),
      } : {
        qtyPerUnit: String(unitBodies[0]?.quantity),
      }),
      unitIds: units.map(u => u.id),
    });

    res.status(201).json(units);
  } catch (err: any) {
    console.error('POST split line:', err);
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    res.status(500).json({ error: 'Failed to split line' });
  }
});

// ── POST /api/receipts/:id/units/:unitId/clone ────────────────────────────────
// Clone a unit (same traceability + line, fresh barcode + sequence, disposition reset)
router.post('/:id/units/:unitId/clone', requireReceivingAccess, async (req: Request, res: Response) => {
  try {
    const receiptId = parseInt(req.params.id);
    const unitId = parseInt(req.params.unitId);
    const user = req.user;

    const [receipt] = await db.select().from(receipts).where(eq(receipts.id, receiptId));
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });

    const source = await assertUnitOwnership(receiptId, unitId);
    if (!source) return res.status(404).json({ error: 'Unit not found or does not belong to this receipt' });

    const unitSequence = await getNextUnitSequence(receiptId);
    const barcode = generateUnitBarcode(receipt.receiptNumber, unitSequence);

    // Carry forward all traceability fields; reset disposition + material lot link
    const body = insertReceivedUnitSchema.parse({
      receiptId,
      receiptLineId: source.receiptLineId,
      unitSequence,
      barcode,
      unitType: source.unitType,
      quantity: source.quantity,
      uom: source.uom,
      lotNumber: source.lotNumber,
      batchNumber: source.batchNumber,
      serialNumber: null, // serial numbers are unique — do not clone
      internalControlNumber: null,
      rollNumber: source.rollNumber,
      heatLot: source.heatLot,
      manufactureDate: source.manufactureDate,
      expirationDate: source.expirationDate,
      shelfLifeDays: source.shelfLifeDays,
      certReference: source.certReference,
      location: source.location,
      freezerNumber: source.freezerNumber,
      allocatedToType: source.allocatedToType,
      allocatedToId: source.allocatedToId,
      disposition: 'pending_inspection',
    });
    const [cloned] = await db.insert(receivedUnits).values(body).returning();

    await logAudit(receiptId, 'unit_cloned', user?.employeeId, actorName(user), {
      sourceUnitId: unitId, clonedUnitId: cloned.id, barcode: cloned.barcode,
    });

    res.status(201).json(cloned);
  } catch (err: any) {
    console.error('POST clone unit:', err);
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    res.status(500).json({ error: 'Failed to clone unit' });
  }
});

// ── POST /api/receipts/:id/units/batch-update ─────────────────────────────────
// Apply the same traceability/location/allocation values to a set of units
// Body: { unitIds: number[], updates: Partial<InsertReceivedUnit> }
router.post('/:id/units/batch-update', requireReceivingAccess, async (req: Request, res: Response) => {
  try {
    const receiptId = parseInt(req.params.id);
    const user = req.user;
    const { unitIds, updates } = req.body as { unitIds: number[]; updates: Record<string, unknown> };

    if (!Array.isArray(unitIds) || unitIds.length === 0) {
      return res.status(400).json({ error: 'unitIds must be a non-empty array' });
    }
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'updates must be an object' });
    }

    const safeUpdates = insertReceivedUnitSchema.partial().parse(updates);
    const results: ReceivedUnit[] = [];
    for (const uid of unitIds) {
      const owns = await assertUnitOwnership(receiptId, uid);
      if (!owns) continue;
      const [updated] = await db.update(receivedUnits)
        .set({ ...safeUpdates, updatedAt: new Date() })
        .where(eq(receivedUnits.id, uid))
        .returning();
      if (updated) results.push(updated);
    }

    await logAudit(receiptId, 'batch_unit_update', user?.employeeId, actorName(user), {
      unitIds, updatedCount: results.length, changes: safeUpdates,
    });

    res.json({ updated: results.length, units: results });
  } catch (err: any) {
    console.error('POST batch-update units:', err);
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    res.status(500).json({ error: 'Failed to batch-update units' });
  }
});

// ── GET /api/receipts/:id/genealogy ───────────────────────────────────────────
// Receipt-level genealogy: receipt → lines → units → material lots → transactions → traveler usage
router.get('/:id/genealogy', requireReceivingAccess, async (req: Request, res: Response) => {
  try {
    const receiptId = parseInt(req.params.id);
    const [receipt] = await db.select().from(receipts).where(eq(receipts.id, receiptId));
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });

    const lines = await db.select().from(receiptLines).where(eq(receiptLines.receiptId, receiptId));
    const units = await db.select().from(receivedUnits).where(eq(receivedUnits.receiptId, receiptId));

    // For each unit with a materialLotId, pull lot + transactions + traveler usage
    const unitGenealogy = await Promise.all(units.map(async unit => {
      const expStatus = receivedUnitExpirationStatus(unit.expirationDate ?? undefined);
      if (!unit.materialLotId) {
        return { ...unit, expirationStatus: expStatus, lot: null, transactions: [], travelerUsage: [] };
      }

      // Coerce to plain JS string so pg sends it as text (not uuid OID),
      // preventing "operator does not exist: character varying = uuid" errors
      const matLotIdStr = String(unit.materialLotId);

      const lotResult = await db.execute(
        sql`SELECT id, internal_control_number, status, remaining_qty, received_qty, unit_of_measure, expiration_date
            FROM material_lots WHERE id::text = ${matLotIdStr} LIMIT 1`
      );
      const lot = sqlRows<Record<string, unknown>>(lotResult)[0] ?? null;

      const txResult = await db.execute(
        sql`SELECT transaction_type, qty_change, performed_by, reference_type, reference_id, created_at
            FROM material_lot_transactions WHERE material_lot_id::text = ${matLotIdStr}
            ORDER BY created_at ASC`
      );
      const transactions = sqlRows<Record<string, unknown>>(txResult);

      const travelerResult = await db.execute(
        sql`SELECT tmc.id, tmc.traveler_id, tmc.traveler_step_id, tmc.qty_used, tmc.unit_of_measure,
                   tmc.scanned_by, tmc.created_at, tmc.received_unit_id,
                   t.part_number, t.status AS traveler_status
            FROM traveler_material_consumption tmc
            LEFT JOIN travelers t ON t.id = tmc.traveler_id::text
            WHERE tmc.material_lot_id::text = ${matLotIdStr}
            ORDER BY tmc.created_at ASC`
      );
      const travelerUsage = sqlRows<Record<string, unknown>>(travelerResult);

      return { ...unit, expirationStatus: expStatus, lot, transactions, travelerUsage };
    }));

    res.json({
      receipt,
      lines,
      units: unitGenealogy,
      summary: {
        totalUnits: units.length,
        accepted: units.filter(u => u.disposition === 'accepted').length,
        quarantined: units.filter(u => u.disposition === 'quarantine').length,
        rejected: units.filter(u => u.disposition === 'rejected').length,
        pendingInspection: units.filter(u => u.disposition === 'pending_inspection').length,
      },
    });
  } catch (err: any) {
    console.error('GET genealogy:', err);
    res.status(500).json({ error: 'Failed to fetch genealogy' });
  }
});

// ── GET /api/receipts/units/:unitId/genealogy ─────────────────────────────────
// Unit-level reverse genealogy: unit → lot → all downstream traveler/work-order usage
router.get('/units/:unitId/genealogy', requireReceivingAccess, async (req: Request, res: Response) => {
  try {
    const unitId = parseInt(req.params.unitId);
    const [unit] = await db.select().from(receivedUnits).where(eq(receivedUnits.id, unitId));
    if (!unit) return res.status(404).json({ error: 'Received unit not found' });

    const [receipt] = await db.select().from(receipts).where(eq(receipts.id, unit.receiptId));
    const [line] = await db.select().from(receiptLines).where(eq(receiptLines.id, unit.receiptLineId));
    const expStatus = receivedUnitExpirationStatus(unit.expirationDate ?? undefined);

    let lot: Record<string, unknown> | null = null;
    let transactions: Record<string, unknown>[] = [];
    let travelerUsage: Record<string, unknown>[] = [];
    const seenTmcIds = new Set<string>();

    if (unit.materialLotId) {
      const matLotIdStr = String(unit.materialLotId);

      const lotResult = await db.execute(
        sql`SELECT * FROM material_lots WHERE id::text = ${matLotIdStr} LIMIT 1`
      );
      lot = sqlRows<Record<string, unknown>>(lotResult)[0] ?? null;

      const txResult = await db.execute(
        sql`SELECT * FROM material_lot_transactions WHERE material_lot_id::text = ${matLotIdStr} ORDER BY created_at ASC`
      );
      transactions = sqlRows<Record<string, unknown>>(txResult);

      const travelerResult = await db.execute(
        sql`SELECT tmc.*, t.part_number, t.status AS traveler_status, t.part_name AS traveler_part_name
            FROM traveler_material_consumption tmc
            LEFT JOIN travelers t ON t.id = tmc.traveler_id::text
            WHERE tmc.material_lot_id::text = ${matLotIdStr}
            ORDER BY tmc.created_at ASC`
      );
      const lotBased = sqlRows<Record<string, unknown>>(travelerResult);
      for (const row of lotBased) {
        seenTmcIds.add(String(row.id));
        travelerUsage.push(row);
      }
    }

    // Also query directly by received_unit_id (Phase 2 forward-trace)
    // This captures consumption records linked directly to this physical unit,
    // even if the lot linkage is missing or the unit has no material_lot_id.
    try {
      const directResult = await db.execute(
        sql`SELECT tmc.*, t.part_number, t.status AS traveler_status, t.part_name AS traveler_part_name
            FROM traveler_material_consumption tmc
            LEFT JOIN travelers t ON t.id = tmc.traveler_id::text
            WHERE tmc.received_unit_id = ${unitId}
            ORDER BY tmc.created_at ASC`
      );
      const directRows = sqlRows<Record<string, unknown>>(directResult);
      for (const row of directRows) {
        if (!seenTmcIds.has(String(row.id))) {
          seenTmcIds.add(String(row.id));
          travelerUsage.push(row);
        }
      }
      // Sort merged results by created_at ascending
      travelerUsage.sort((a, b) =>
        new Date(String(a.created_at)).getTime() - new Date(String(b.created_at)).getTime()
      );
    } catch (_) { /* non-fatal: column may not exist in older deployments */ }

    res.json({
      unit: { ...unit, expirationStatus: expStatus },
      receipt: receipt ?? null,
      line: line ?? null,
      lot,
      transactions,
      travelerUsage,
    });
  } catch (err: any) {
    console.error('GET unit genealogy:', err);
    res.status(500).json({ error: 'Failed to fetch unit genealogy' });
  }
});

// ── GET /api/receipts/:id/required-docs ───────────────────────────────────────
// Returns missing-doc list for every unit in a receipt (for Step 4 UI warnings)
router.get('/:id/required-docs', requireReceivingAccess, async (req: Request, res: Response) => {
  try {
    const receiptId = parseInt(req.params.id);
    const lines = await db.select().from(receiptLines).where(eq(receiptLines.receiptId, receiptId));
    const result: Record<string, string[]> = {};
    for (const line of lines) {
      if (line.agPartNumber) {
        const missing = await checkRequiredDocs(line.agPartNumber, receiptId);
        if (missing.length > 0) result[line.agPartNumber] = missing;
      }
    }
    res.json({ receiptId, missingByPartNumber: result, hasMissing: Object.keys(result).length > 0 });
  } catch (err: any) {
    console.error('GET required-docs:', err);
    res.status(500).json({ error: 'Failed to check required documents' });
  }
});

export default router;
