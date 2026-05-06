import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db, pool, pgPool } from '../../db';
import { createInvoiceFromPackingSlip } from '../services/invoiceFromPackingSlip';
import {
  p2SerializedItems,
  p2Customers,
  p2LotNumbers,
  p2PackingSlips,
  p2CertificatesOfConformance,
} from '../../schema';
import { eq, inArray, desc } from 'drizzle-orm';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { generatePackingSlipPdf } from '../../utils/pdf/packingSlipPdf';
import type { PackingSlipData, PackingSlipItem } from '../../utils/pdf/types';
import { COMPANY_INFO } from '../../utils/pdf/pdfConfig';
import multer from 'multer';
import { ObjectStorageService } from '../../replit_integrations/object_storage/objectStorage';

const upload = multer({ storage: multer.memoryStorage() });
const objectStorageService = new ObjectStorageService();

const router = Router();

// ─── Session auth helper (for PDF routes that use cookie-based sessions) ─────
async function getUserFromSession(req: Request): Promise<{ username: string; role: string } | null> {
  const sessionToken = req.cookies?.sessionToken || req.headers.authorization?.replace('Bearer ', '');
  if (!sessionToken) return null;
  try {
    const result = await pool.query<{ username: string; expires_at: Date }>(
      'SELECT username, expires_at FROM user_sessions WHERE session_token = $1',
      [sessionToken]
    );
    if (!result || result.length === 0) return null;
    const session = result[0];
    if (new Date(session.expires_at) < new Date()) {
      await pool.query('DELETE FROM user_sessions WHERE session_token = $1', [sessionToken]);
      return null;
    }
    const userRows = await pool.query<{ username: string; role: string }>(
      'SELECT username, role FROM users WHERE username = $1 AND is_active = true',
      [session.username.toLowerCase()]
    );
    return userRows?.length > 0 ? userRows[0] : null;
  } catch {
    return null;
  }
}

// ─── P2 document access logger ─────────────────────────────────────────────
// Logs PDF download events to p2_shipping_audit_log for audit trail
async function logP2DocumentAccess(
  entityType: string,
  entityId: string,
  actor: string,
  ipAddress: string
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO p2_shipping_audit_log (entity_type, entity_id, field_name, old_value, new_value, changed_by, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [entityType, entityId, 'pdf_download', null, null, actor, `PDF downloaded from IP ${ipAddress}`]
    );
  } catch (err) {
    console.error('[P2Shipping] Failed to write document access log:', { entityType, entityId, actor, err });
    throw err;
  }
}

// Ensure lot_validation_report_url column exists (idempotent migration)
;(async () => {
  try {
    await pool.query(
      `ALTER TABLE p2_lot_numbers ADD COLUMN IF NOT EXISTS lot_validation_report_url text`
    );
  } catch (err) {
    console.error('Migration: lot_validation_report_url column error:', err);
  }
})();

function buildCustomerAddress(customer: {
  customerName: string;
  shippingCompanyName?: string | null;
  shippingContactName?: string | null;
  shippingAddress?: string | null;
  shippingAddress2?: string | null;
  shippingCity?: string | null;
  shippingState?: string | null;
  shippingZip?: string | null;
}): string {
  return [
    customer.shippingCompanyName || customer.customerName,
    customer.shippingContactName,
    customer.shippingAddress,
    customer.shippingAddress2,
    [customer.shippingCity, customer.shippingState, customer.shippingZip]
      .filter(Boolean)
      .join(', '),
  ]
    .filter(Boolean)
    .join('\n');
}

async function generateSequentialId(
  _prefix: string,
  table: string,
  column: string
): Promise<string> {
  const today = new Date();
  // Format: YYMMDD-XX  (e.g. 260318-01)
  const iso = today.toISOString(); // 2026-03-18T...
  const dateStr = iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10); // YYMMDD
  const pattern = `${dateStr}-%`;
  const rows = await pool.query(
    `SELECT COUNT(*) as count FROM ${table} WHERE ${column} LIKE $1`,
    [pattern]
  );
  const seq = (parseInt(rows[0].count) + 1).toString().padStart(2, '0');
  return `${dateStr}-${seq}`;
}

// ============================================================
// POST /api/p2/lots — Create lot from selected finalized serials
// ============================================================
const createLotSchema = z.object({
  serialIds: z.array(z.string().uuid()).min(1, 'At least one serial required'),
  createdBy: z.string().min(1).default('system'),
});

router.post('/lots', async (req: Request, res: Response) => {
  try {
    const input = createLotSchema.parse(req.body);

    const serials = await db
      .select()
      .from(p2SerializedItems)
      .where(inArray(p2SerializedItems.id, input.serialIds));

    if (serials.length !== input.serialIds.length) {
      return res.status(400).json({ error: 'Some serial IDs not found' });
    }

    // Guard: all serials must be COMPLETED and finalized
    const notReady = serials.filter((s) => s.status !== 'COMPLETED' || !s.finalizedAt);
    if (notReady.length > 0) {
      return res.status(400).json({
        error: 'All selected serials must be completed and finalized before shipment',
        items: notReady.map((s) => s.serialNumber),
      });
    }

    const poNumbers = [...new Set(serials.map((s) => s.poNumber))];
    if (poNumbers.length > 1) {
      return res.status(400).json({
        error: 'All serials must belong to the same PO',
        found: poNumbers,
      });
    }

    // Guard: serial reuse — reject if any serial already exists in another lot
    const existingLots = await pool.query<{ id: string; lot_number: string }>(
      `SELECT id, lot_number FROM p2_lot_numbers WHERE serialized_item_ids ?| $1::text[]`,
      [input.serialIds]
    );
    if (existingLots.length > 0) {
      return res.status(409).json({
        error: 'One or more serial numbers already assigned to an existing shipment lot',
        lots: existingLots.map((r) => r.lot_number),
      });
    }

    const first = serials[0];
    const lotNumber = await generateSequentialId('LOT', 'p2_lot_numbers', 'lot_number');

    const manufacturingDate =
      (serials.map((s) => s.completedAt).filter(Boolean).sort().pop() as Date | null) ||
      new Date();

    const [lot] = await db
      .insert(p2LotNumbers)
      .values({
        lotNumber,
        lotType: 'SHIPPING',
        partNumber: first.partNumber,
        partName: first.partName,
        customerId: first.customerId,
        customerName: first.customerName,
        poNumber: first.poNumber, // kept for display/legacy
        poId: first.poId,         // hard FK — serial already carries the integer po_id
        quantity: serials.length,
        serializedItemIds: input.serialIds,
        barcodes: serials.map((s) => s.barcode),
        manufacturingDate,
        status: 'OPEN',
        createdBy: input.createdBy,
      })
      .returning();

    return res.status(201).json(lot);
  } catch (err: any) {
    if (err instanceof z.ZodError)
      return res.status(400).json({ error: err.errors[0].message });
    console.error('Create lot error:', err);
    return res.status(500).json({ error: 'Failed to create lot' });
  }
});

// ============================================================
// GET /api/p2/lots/existing-shipments — all lots that have packing slips
// Returns map-friendly array: [{ poId, lotId, lotNumber, slipId, slipNumber, certId?, certNumber? }]
// Must appear BEFORE /lots/:id so Express doesn't match 'existing-shipments' as an :id param
// ============================================================
router.get('/lots/existing-shipments', async (req: Request, res: Response) => {
  try {
    const rows = await pool.query<{
      po_id: number;
      lot_id: string;
      lot_number: string;
      slip_id: string;
      slip_number: string;
      cert_id: string | null;
      cert_number: string | null;
    }>(`
      SELECT
        l.po_id,
        l.id           AS lot_id,
        l.lot_number,
        ps.id          AS slip_id,
        ps.packing_slip_number AS slip_number,
        cc.id          AS cert_id,
        cc.certificate_number  AS cert_number
      FROM p2_lot_numbers l
      JOIN p2_packing_slips ps ON ps.id = l.packing_slip_id
      LEFT JOIN p2_certificates_of_conformance cc ON cc.id = l.certificate_id
      WHERE l.po_id IS NOT NULL AND l.packing_slip_id IS NOT NULL
      ORDER BY l.created_at DESC
    `);
    return res.json(rows);
  } catch (err: any) {
    console.error('existing-shipments error:', err);
    return res.status(500).json({ error: 'Failed to fetch existing shipments' });
  }
});

// ============================================================
// GET /api/p2/lots/:id
// ============================================================
router.get('/lots/:id', async (req: Request, res: Response) => {
  try {
    const [lot] = await db
      .select()
      .from(p2LotNumbers)
      .where(eq(p2LotNumbers.id, req.params.id));
    if (!lot) return res.status(404).json({ error: 'Lot not found' });
    return res.json(lot);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch lot' });
  }
});

// ============================================================
// POST /api/p2/packing-slips — Create packing slip from lot
// RULE: All packing slips MUST be persisted to DB immediately after generation.
// This route inserts a record into p2_packing_slips and links it via p2_lot_numbers.packing_slip_id.
// TODO: unify P1 + P2 packing slip storage into single document system
// ============================================================
const createPackingSlipSchema = z.object({
  lotId: z.string().uuid(),
  createdBy: z.string().min(1).default('system'),
  // Optional replacement linkage fields (Phase 5C)
  replacesPackingSlipId: z.string().uuid().optional(),
  replacementReason: z.string().optional(),
  isNoChargeReplacement: z.boolean().optional(),
});

router.post('/packing-slips', async (req: Request, res: Response) => {
  try {
    const input = createPackingSlipSchema.parse(req.body);

    const [lot] = await db
      .select()
      .from(p2LotNumbers)
      .where(eq(p2LotNumbers.id, input.lotId));
    if (!lot) return res.status(404).json({ error: 'Lot not found' });

    // Guard: one packing slip per lot.
    // This guard checks whether the lot already has a packing slip assigned via
    // p2_lot_numbers.packing_slip_id. Replacement slips are always created for
    // NEW lots (the replacement items are repacked as a new lot with new serials),
    // so this guard does not conflict with replacements — each lot can only ever
    // have one packing slip regardless of whether the slip is a replacement.
    if (lot.packingSlipId) {
      return res.status(409).json({ error: 'Packing slip already exists for this lot' });
    }

    // Validate that replacesPackingSlipId references an existing slip
    if (input.replacesPackingSlipId) {
      const [originalSlip] = await db
        .select({ id: p2PackingSlips.id })
        .from(p2PackingSlips)
        .where(eq(p2PackingSlips.id, input.replacesPackingSlipId));
      if (!originalSlip) {
        return res.status(422).json({ error: `Original packing slip ${input.replacesPackingSlipId} not found — cannot create replacement` });
      }
    }

    const serialIds = (lot.serializedItemIds as string[]) || [];
    const serials = await db
      .select()
      .from(p2SerializedItems)
      .where(inArray(p2SerializedItems.id, serialIds));

    const byPart: Record<string, typeof serials> = {};
    for (const s of serials) {
      if (!byPart[s.partNumber]) byPart[s.partNumber] = [];
      byPart[s.partNumber].push(s);
    }

    const lineItems = Object.values(byPart).map((group) => ({
      partNumber: group[0].partNumber,
      partName: group[0].partName,
      quantity: group.length,
      serialNumbers: group.map((s) => s.serialNumber),
      lotNumber: lot.lotNumber,
    }));

    const [customer] = await db
      .select()
      .from(p2Customers)
      .where(eq(p2Customers.customerId, lot.customerId || ''));

    const customerAddress = customer ? buildCustomerAddress(customer) : '';

    const packingSlipNumber = await generateSequentialId(
      'PS',
      'p2_packing_slips',
      'packing_slip_number'
    );

    const [slip] = await db
      .insert(p2PackingSlips)
      .values({
        packingSlipNumber,
        lotNumberId: lot.id,
        lotNumber: lot.lotNumber,
        customerId: lot.customerId || '',
        customerName: lot.customerName || '',
        customerAddress,
        poNumber: lot.poNumber,
        lineItems,
        totalQuantity: serials.length,
        status: 'DRAFT',
        createdBy: input.createdBy,
        replacesPackingSlipId: input.replacesPackingSlipId ?? null,
        replacementReason: input.replacementReason ?? null,
        isNoChargeReplacement: input.isNoChargeReplacement ?? false,
      })
      .returning();

    if (input.replacesPackingSlipId) {
      console.log(`[P2Shipping] Replacement packing slip ${slip.packingSlipNumber} (${slip.id}) created, replacing original slip ${input.replacesPackingSlipId}`);
      console.log(`[P2Shipping] Original packing slip linked: ${input.replacesPackingSlipId} → replacement: ${slip.id}`);
    }
    if (input.isNoChargeReplacement) {
      console.log(`[P2Shipping] No-charge replacement flag active for packing slip ${slip.packingSlipNumber} (${slip.id}) — invoice will be zero-dollar`);
    }

    await db
      .update(p2LotNumbers)
      .set({ packingSlipId: slip.id })
      .where(eq(p2LotNumbers.id, lot.id));

    return res.status(201).json(slip);
  } catch (err: any) {
    if (err instanceof z.ZodError)
      return res.status(400).json({ error: err.errors[0].message });
    console.error('Create packing slip error:', err);
    return res.status(500).json({ error: 'Failed to create packing slip' });
  }
});

// ============================================================
// GET /api/p2/packing-slips/:id
// Returns the packing slip plus bi-directional replacement linkage:
//   - originalPackingSlip: the slip that this one replaces (populated when replacesPackingSlipId is set)
//   - replacementSlips: array of slips that reference this one as their original
// ============================================================
router.get('/packing-slips/:id', async (req: Request, res: Response) => {
  try {
    const [slip] = await db
      .select()
      .from(p2PackingSlips)
      .where(eq(p2PackingSlips.id, req.params.id));
    if (!slip) return res.status(404).json({ error: 'Packing slip not found' });

    // Fetch original slip (if this slip is a replacement)
    let originalPackingSlip: typeof slip | null = null;
    if (slip.replacesPackingSlipId) {
      const [original] = await db
        .select()
        .from(p2PackingSlips)
        .where(eq(p2PackingSlips.id, slip.replacesPackingSlipId));
      originalPackingSlip = original ?? null;
    }

    // Fetch any replacement slips that reference this one as the original
    const replacementSlips = await db
      .select()
      .from(p2PackingSlips)
      .where(eq(p2PackingSlips.replacesPackingSlipId, slip.id));

    return res.json({ ...slip, originalPackingSlip, replacementSlips });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch packing slip' });
  }
});

// ============================================================
// PATCH /api/p2/packing-slips/:id — Edit packing slip number and/or ship date
// Admin/Owner only. Writes audit log entries for each changed field.
// changedBy is derived from authenticated user — never trusted from request body.
// ============================================================
const editPackingSlipSchema = z.object({
  packingSlipNumber: z.string().trim().min(1).optional(),
  shipDate: z.string().datetime({ offset: true }).nullable().optional(),
  lotNumber: z.string().trim().min(1, 'Lot number cannot be empty').optional(),
  reason: z.string().trim().min(1, 'Reason is required'),
});

router.patch(
  '/packing-slips/:id',
  authenticateToken,
  requireRole('ADMIN', 'OWNER'),
  async (req: Request, res: Response) => {
    try {
      const input = editPackingSlipSchema.parse(req.body);
      const actor = req.user!.username;
      const slipId = req.params.id;

      // Fetch current slip (outside transaction — read-only pre-check)
      const slipRows = await pool.query<{
        id: string;
        packing_slip_number: string;
        ship_date: string | null;
        lot_number: string | null;
        lot_number_id: string | null;
      }>(
        `SELECT id, packing_slip_number, ship_date, lot_number, lot_number_id FROM p2_packing_slips WHERE id = $1`,
        [slipId]
      );
      if (slipRows.length === 0) {
        return res.status(404).json({ error: 'Packing slip not found' });
      }
      const slip = slipRows[0];

      const setClauses: string[] = ['updated_at = NOW()'];
      const params: any[] = [];
      const auditEntries: { fieldName: string; oldValue: string | null; newValue: string | null }[] = [];

      if (input.packingSlipNumber !== undefined && input.packingSlipNumber !== slip.packing_slip_number) {
        // Check uniqueness
        const dupRows = await pool.query<{ id: string }>(
          `SELECT id FROM p2_packing_slips WHERE packing_slip_number = $1 AND id != $2`,
          [input.packingSlipNumber, slipId]
        );
        if (dupRows.length > 0) {
          return res.status(409).json({ error: 'A packing slip with that number already exists' });
        }
        params.push(input.packingSlipNumber);
        setClauses.push(`packing_slip_number = $${params.length}`);
        auditEntries.push({
          fieldName: 'packing_slip_number',
          oldValue: slip.packing_slip_number,
          newValue: input.packingSlipNumber,
        });
      }

      if (input.shipDate !== undefined) {
        const oldVal = slip.ship_date ?? null;
        const newVal = input.shipDate;
        if (oldVal !== newVal) {
          params.push(newVal);
          setClauses.push(`ship_date = $${params.length}`);
          auditEntries.push({
            fieldName: 'ship_date',
            oldValue: oldVal,
            newValue: newVal,
          });
        }
      }

      let updateLotTable = false;
      if (input.lotNumber !== undefined && input.lotNumber !== (slip.lot_number ?? '')) {
        // Enforce uniqueness against p2_lot_numbers.lot_number, excluding this slip's own linked lot
        const dupLotRows = await pool.query<{ id: string }>(
          slip.lot_number_id
            ? `SELECT id FROM p2_lot_numbers WHERE lot_number = $1 AND id != $2`
            : `SELECT id FROM p2_lot_numbers WHERE lot_number = $1`,
          slip.lot_number_id ? [input.lotNumber, slip.lot_number_id] : [input.lotNumber]
        );
        if (dupLotRows.length > 0) {
          return res.status(409).json({ error: 'A lot with that number already exists' });
        }
        params.push(input.lotNumber);
        setClauses.push(`lot_number = $${params.length}`);
        auditEntries.push({
          fieldName: 'lot_number',
          oldValue: slip.lot_number,
          newValue: input.lotNumber,
        });
        updateLotTable = !!slip.lot_number_id;
      }

      if (auditEntries.length === 0) {
        // Nothing changed — return current record
        const currentRows = await pool.query(
          `SELECT * FROM p2_packing_slips WHERE id = $1`,
          [slipId]
        );
        return res.json(currentRows[0]);
      }

      // Execute update + audit log in a single transaction using one client connection
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');

        params.push(slipId);
        const updateSql = `UPDATE p2_packing_slips SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING *`;
        const updateResult = await client.query(updateSql, params);
        const updated = updateResult.rows[0];

        if (updateLotTable && input.lotNumber !== undefined) {
          await client.query(
            `UPDATE p2_lot_numbers SET lot_number = $1, updated_at = NOW() WHERE id = $2`,
            [input.lotNumber, slip.lot_number_id]
          );
        }

        for (const entry of auditEntries) {
          await client.query(
            `INSERT INTO p2_shipping_audit_log (entity_type, entity_id, field_name, old_value, new_value, changed_by, reason) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            ['packing_slip', slipId, entry.fieldName, entry.oldValue, entry.newValue, actor, input.reason]
          );
        }

        await client.query('COMMIT');
        return res.json(updated);
      } catch (txErr) {
        await client.query('ROLLBACK').catch(() => {});
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err: any) {
      if (err instanceof z.ZodError)
        return res.status(400).json({ error: err.errors[0].message });
      console.error('Edit packing slip error:', err);
      return res.status(500).json({ error: 'Failed to update packing slip' });
    }
  }
);

// ============================================================
// GET /api/p2/packing-slips/:id/pdf — Generate Packing Slip PDF
// NOTE: This route generates the PDF on-the-fly from the persisted p2_packing_slips record.
// The slip metadata is already stored in DB (created via POST /packing-slips); however,
// the rendered PDF bytes are NOT re-saved here — they are streamed directly to the client.
// RULE: All packing slips MUST be persisted to DB immediately after generation.
// If this route is ever refactored to generate slips outside of an existing DB record,
// a DB write MUST follow immediately — otherwise the console.error below must fire.
// TODO: unify P1 + P2 packing slip storage into single document system
// ============================================================
router.get('/packing-slips/:id/pdf', async (req: Request, res: Response) => {
  // ACL enforcement: require an authenticated session
  const sessionUser = await getUserFromSession(req);
  if (!sessionUser) {
    return res.status(401).json({ error: 'Authentication required to access P2 shipping documents' });
  }
  const ipAddress = (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );

  try {
    const [slip] = await db
      .select()
      .from(p2PackingSlips)
      .where(eq(p2PackingSlips.id, req.params.id));
    if (!slip) return res.status(404).json({ error: 'Packing slip not found' });

    // Map slip DB record to PackingSlipData
    const lineItems = (slip.lineItems as any[]) || [];
    const slipItems: PackingSlipItem[] = lineItems.map((item) => ({
      partNumber: item.partNumber || '',
      description: item.partName || item.partNumber || 'N/A',
      quantity: item.quantity ?? (Array.isArray(item.serialNumbers) ? item.serialNumbers.length : 1),
      serialNumbers: Array.isArray(item.serialNumbers) ? item.serialNumbers : [],
      lotNumber: item.lotNumber || slip.lotNumber || undefined,
    }));

    // Parse the stored customerAddress string into structured fields where possible,
    // preserving rawLines as a fallback for addresses that don't match a standard pattern.
    const rawAddress = slip.customerAddress || '';
    const addrLines = rawAddress.split('\n').filter((l: string) => l && l !== slip.customerName);
    let structuredAddress: PackingSlipData['customerAddress'];
    if (addrLines.length > 0) {
      const lastLine = addrLines[addrLines.length - 1];
      const cityStateZip = lastLine.match(/^(.+),\s+([A-Z]{2})\s+(\S+)$/);
      if (cityStateZip) {
        structuredAddress = {
          street: addrLines[0] || '',
          street2: addrLines.length > 2 ? addrLines[1] : undefined,
          city: cityStateZip[1].trim(),
          state: cityStateZip[2],
          zip: cityStateZip[3],
        };
      } else {
        structuredAddress = { rawLines: addrLines };
      }
    }

    const slipData: PackingSlipData = {
      packingSlipNumber: slip.packingSlipNumber,
      poNumber: slip.poNumber || undefined,
      lotNumber: slip.lotNumber || undefined,
      date: (slip.shipDate || slip.createdAt)
        ? new Date(slip.shipDate || slip.createdAt!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      customerName: slip.customerName,
      customerAddress: structuredAddress,
      trackingNumber: slip.trackingNumber || undefined,
      totalQuantity: slip.totalQuantity ?? 0,
      packedBy: slip.packedBy || undefined,
      verifiedBy: slip.verifiedBy || undefined,
      items: slipItems,
    };

    // LEGACY PACKING SLIP RENDERER — REPLACED BY generatePackingSlipPdf
    // const pdfDoc = await PDFDocument.create();
    // let page = pdfDoc.addPage([612, 792]);
    // const { width, height } = page.getSize();
    // const margin = 50;
    // const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    // const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    // const black = rgb(0, 0, 0);
    // const gray = rgb(0.45, 0.45, 0.45);
    // const lightGray = rgb(0.82, 0.82, 0.82);
    // const darkGray = rgb(0.2, 0.2, 0.2);
    // const tableHeaderBg = rgb(0.88, 0.88, 0.88);
    // const rowBg = rgb(0.96, 0.96, 0.96);
    // let y = height - margin;
    // const usableWidth = width - margin * 2;
    // // ── Header left ──
    // page.drawText(COMPANY_INFO.NAME, { x: margin, y, size: 13, font: boldFont, color: black });
    // y -= 14;
    // page.drawText(COMPANY_INFO.ADDRESS, { x: margin, y, size: 8.5, font, color: gray });
    // y -= 11;
    // page.drawText(`${COMPANY_INFO.PHONE}  |  ${COMPANY_INFO.EMAIL}`, { x: margin, y, size: 8.5, font, color: gray });
    // y -= 8;
    // page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: lightGray });
    // y -= 22;
    // // ── Header right ──
    // const rightX = width - margin - 150;
    // const headerTopY = height - margin;
    // page.drawText('PACKING SLIP', { x: rightX, y: headerTopY, size: 16, font: boldFont, color: black });
    // page.drawText(slip.packingSlipNumber, { x: rightX, y: headerTopY - 18, size: 10, font, color: gray });
    // const slipDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    // page.drawText(`Date: ${slipDate}`, { x: rightX, y: headerTopY - 30, size: 8.5, font, color: gray });
    // // ── Ship To ──
    // page.drawText('SHIP TO:', { x: margin, y, size: 8.5, font: boldFont, color: gray });
    // y -= 13;
    // page.drawText(slip.customerName, { x: margin, y, size: 10.5, font: boldFont, color: black });
    // y -= 13;
    // const addressLines = (slip.customerAddress || '').split('\n').filter(l => l && l !== slip.customerName);
    // for (const line of addressLines) { page.drawText(line, { x: margin, y, size: 9.5, font, color: darkGray }); y -= 12; }
    // y -= 4;
    // if (slip.poNumber) { page.drawText(`PO #: ${slip.poNumber}`, { x: margin, y, size: 9.5, font, color: darkGray }); y -= 12; }
    // if (slip.lotNumber) { page.drawText(`Lot #: ${slip.lotNumber}`, { x: margin, y, size: 9.5, font, color: darkGray }); y -= 12; }
    // y -= 10;
    // page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: lightGray });
    // y -= 16;
    // // ── Table ──
    // const colWidths = [90, 150, 40, 100, usableWidth - 90 - 150 - 40 - 100];
    // const colX: number[] = [margin];
    // for (let i = 0; i < colWidths.length - 1; i++) { colX.push(colX[i] + colWidths[i]); }
    // const hdrHeight = 16;
    // const headers = ['Part Number', 'Part Name', 'Qty', 'Lot Number', 'Serial Numbers'];
    // page.drawRectangle({ x: margin, y: y - hdrHeight, width: usableWidth, height: hdrHeight, color: tableHeaderBg });
    // headers.forEach((h, i) => { page.drawText(h, { x: colX[i] + 3, y: y - hdrHeight + 4, size: 8, font: boldFont, color: darkGray }); });
    // y -= hdrHeight;
    // const lineItems = (slip.lineItems as any[]) || [];
    // let rowAlt = false;
    // for (const item of lineItems) {
    //   const serialsArr: string[] = Array.isArray(item.serialNumbers) ? item.serialNumbers : [];
    //   const serialsPerRow = 2;
    //   const serialRows = Math.max(1, Math.ceil(serialsArr.length / serialsPerRow));
    //   const rowHeight = Math.max(16, serialRows * 11 + 6);
    //   if (y - rowHeight < margin + 70) { page = pdfDoc.addPage([612, 792]); y = 792 - margin; rowAlt = false; }
    //   if (rowAlt) { page.drawRectangle({ x: margin, y: y - rowHeight, width: usableWidth, height: rowHeight, color: rowBg }); }
    //   rowAlt = !rowAlt;
    //   const cellY = y - 11;
    //   page.drawText(item.partNumber || '', { x: colX[0] + 3, y: cellY, size: 8, font, color: darkGray });
    //   page.drawText((item.partName || '').slice(0, 26), { x: colX[1] + 3, y: cellY, size: 8, font, color: darkGray });
    //   page.drawText(String(item.quantity ?? serialsArr.length), { x: colX[2] + 3, y: cellY, size: 8, font, color: darkGray });
    //   page.drawText(item.lotNumber || slip.lotNumber || '', { x: colX[3] + 3, y: cellY, size: 8, font, color: darkGray });
    //   let sy = cellY;
    //   for (let r = 0; r < serialRows; r++) {
    //     const chunk = serialsArr.slice(r * serialsPerRow, (r + 1) * serialsPerRow).join('   ');
    //     page.drawText(chunk, { x: colX[4] + 3, y: sy, size: 7.5, font, color: darkGray }); sy -= 11;
    //   }
    //   page.drawLine({ start: { x: margin, y: y - rowHeight }, end: { x: width - margin, y: y - rowHeight }, thickness: 0.25, color: lightGray });
    //   y -= rowHeight;
    // }
    // // ── Totals ──
    // y -= 10;
    // page.drawText(`Total Quantity: ${slip.totalQuantity}`, { x: width - margin - 130, y, size: 9.5, font: boldFont, color: black });
    // // ── Footer ──
    // const footerY = margin + 40;
    // page.drawLine({ start: { x: margin, y: footerY + 20 }, end: { x: width - margin, y: footerY + 20 }, thickness: 0.5, color: lightGray });
    // page.drawText('Packed By: _______________________________', { x: margin, y: footerY, size: 8.5, font, color: darkGray });
    // page.drawText(`Tracking #: ${slip.trackingNumber || '_____________________________'}`, { x: margin + 260, y: footerY, size: 8.5, font, color: darkGray });
    // page.drawText('Verified By: _______________________________', { x: margin, y: footerY - 16, size: 8.5, font, color: darkGray });
    // const bytes = await pdfDoc.save();
    // res.set('Content-Type', 'application/pdf');
    // res.set('Content-Disposition', `inline; filename="packing-slip-${slip.packingSlipNumber}.pdf"`);
    // return res.send(Buffer.from(bytes));

    // The slip record is already persisted in p2_packing_slips (created via POST /packing-slips).
    // PDF bytes are rendered on-the-fly and streamed — they are NOT saved back to the DB.
    // The persistence invariant: a valid slip.id guarantees the slip metadata is in DB.
    // If this route is ever refactored to generate a slip outside a persisted record context
    // (i.e., slip.id is missing), the warning below acts as an explicit guardrail.
    const isPersistedContext = typeof slip.id === 'string' && slip.id.length > 0;
    if (!isPersistedContext) {
      console.error("WARNING: Packing slip generated without persistence");
    }
    const bytes = await generatePackingSlipPdf(slipData);
    res.set('Content-Type', 'application/pdf');
    res.set(
      'Content-Disposition',
      `inline; filename="packing-slip-${slip.packingSlipNumber}.pdf"`
    );
    // Log download access before streaming
    await logP2DocumentAccess('packing_slip', slip.id, sessionUser.username, ipAddress);
    return res.send(bytes);
  } catch (err: any) {
    console.error('Packing slip PDF error:', err);
    return res.status(500).json({ error: 'Failed to generate packing slip PDF' });
  }
});

// ============================================================
// POST /api/p2/packing-slips/:id/attach-pdf — Upload external PDF
// Accepts a multipart/form-data file field named "file" (PDF only).
// Stores the file in object storage and saves the path to external_pdf_url.
// ============================================================
router.post('/packing-slips/:id/attach-pdf', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const [slip] = await db
      .select()
      .from(p2PackingSlips)
      .where(eq(p2PackingSlips.id, req.params.id));
    if (!slip) return res.status(404).json({ error: 'Packing slip not found' });

    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Only PDF files are accepted' });
    }

    const storagePath = await objectStorageService.uploadBuffer(
      req.file.buffer,
      `packing-slip-${slip.packingSlipNumber}-external.pdf`,
      'application/pdf'
    );

    const [updated] = await db
      .update(p2PackingSlips)
      .set({ externalPdfUrl: storagePath, updatedAt: new Date() })
      .where(eq(p2PackingSlips.id, req.params.id))
      .returning();

    return res.json(updated);
  } catch (err: any) {
    console.error('Attach external PDF error:', err);
    return res.status(500).json({ error: 'Failed to attach external PDF' });
  }
});

// ============================================================
// DELETE /api/p2/packing-slips/:id/attach-pdf — Remove external PDF
// ============================================================
router.delete('/packing-slips/:id/attach-pdf', async (req: Request, res: Response) => {
  try {
    const [slip] = await db
      .select()
      .from(p2PackingSlips)
      .where(eq(p2PackingSlips.id, req.params.id));
    if (!slip) return res.status(404).json({ error: 'Packing slip not found' });

    const [updated] = await db
      .update(p2PackingSlips)
      .set({ externalPdfUrl: null, updatedAt: new Date() })
      .where(eq(p2PackingSlips.id, req.params.id))
      .returning();

    return res.json(updated);
  } catch (err: any) {
    console.error('Remove external PDF error:', err);
    return res.status(500).json({ error: 'Failed to remove external PDF' });
  }
});

// ============================================================
// POST /api/p2/certificates — Create CoC from lot
// ============================================================
const createCertificateSchema = z.object({
  lotId: z.string().uuid(),
  createdBy: z.string().min(1).default('system'),
  certificationText: z.string().optional(),
});

router.post('/certificates', async (req: Request, res: Response) => {
  try {
    const input = createCertificateSchema.parse(req.body);

    const [lot] = await db
      .select()
      .from(p2LotNumbers)
      .where(eq(p2LotNumbers.id, input.lotId));
    if (!lot) return res.status(404).json({ error: 'Lot not found' });

    // Guard: one certificate per lot
    if (lot.certificateId) {
      return res.status(409).json({ error: 'Certificate already exists for this lot' });
    }

    const serialIds = (lot.serializedItemIds as string[]) || [];
    const serials = await db
      .select()
      .from(p2SerializedItems)
      .where(inArray(p2SerializedItems.id, serialIds));

    const [customer] = await db
      .select()
      .from(p2Customers)
      .where(eq(p2Customers.customerId, lot.customerId || ''));

    const customerAddress = customer ? buildCustomerAddress(customer) : '';

    const manufacturingDate =
      (serials.map((s) => s.completedAt).filter(Boolean).sort().pop() as Date | null) ||
      lot.manufacturingDate ||
      new Date();

    const certNumber = await generateSequentialId(
      'COC',
      'p2_certificates_of_conformance',
      'certificate_number'
    );

    const defaultText =
      'AG Composites certifies that the items listed herein have been manufactured, inspected, and tested in accordance with the applicable drawings, specifications, and purchase order requirements. All materials used in manufacture conform to applicable specifications. Records are on file and available for review.';

    const [cert] = await db
      .insert(p2CertificatesOfConformance)
      .values({
        certificateNumber: certNumber,
        lotNumberId: lot.id,
        lotNumber: lot.lotNumber,
        customerId: lot.customerId || '',
        customerName: lot.customerName || '',
        customerAddress,
        poNumber: lot.poNumber,
        partNumber: lot.partNumber,
        partName: lot.partName,
        quantity: serials.length,
        serialNumbers: serials.map((s) => s.serialNumber),
        manufacturingDate: manufacturingDate as Date,
        shipDate: new Date(),
        certificationText: input.certificationText || defaultText,
        status: 'DRAFT',
        createdBy: input.createdBy,
      })
      .returning();

    await db
      .update(p2LotNumbers)
      .set({ certificateId: cert.id })
      .where(eq(p2LotNumbers.id, lot.id));

    return res.status(201).json(cert);
  } catch (err: any) {
    if (err instanceof z.ZodError)
      return res.status(400).json({ error: err.errors[0].message });
    console.error('Create certificate error:', err);
    return res.status(500).json({ error: 'Failed to create certificate' });
  }
});

// ============================================================
// GET /api/p2/certificates/:id
// ============================================================
router.get('/certificates/:id', async (req: Request, res: Response) => {
  try {
    const [cert] = await db
      .select()
      .from(p2CertificatesOfConformance)
      .where(eq(p2CertificatesOfConformance.id, req.params.id));
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });
    return res.json(cert);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch certificate' });
  }
});

// ============================================================
// GET /api/p2/certificates/:id/pdf — Generate CoC PDF
// ============================================================
router.get('/certificates/:id/pdf', async (req: Request, res: Response) => {
  // ACL enforcement: require an authenticated session
  const sessionUser = await getUserFromSession(req);
  if (!sessionUser) {
    return res.status(401).json({ error: 'Authentication required to access P2 shipping documents' });
  }
  const ipAddress = (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );

  try {
    const [cert] = await db
      .select()
      .from(p2CertificatesOfConformance)
      .where(eq(p2CertificatesOfConformance.id, req.params.id));
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();
    const margin = 50;
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const black = rgb(0, 0, 0);
    const gray = rgb(0.45, 0.45, 0.45);
    const lightGray = rgb(0.82, 0.82, 0.82);
    const darkGray = rgb(0.2, 0.2, 0.2);

    let y = height - margin;
    const usableWidth = width - margin * 2;

    // ── Header ──
    page.drawText(COMPANY_INFO.NAME, { x: margin, y, size: 13, font: boldFont, color: black });
    y -= 14;
    page.drawText(COMPANY_INFO.ADDRESS, { x: margin, y, size: 8.5, font, color: gray });
    y -= 11;
    page.drawText(`${COMPANY_INFO.PHONE}  |  ${COMPANY_INFO.EMAIL}`, {
      x: margin,
      y,
      size: 8.5,
      font,
      color: gray,
    });
    y -= 8;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.5,
      color: lightGray,
    });
    y -= 26;

    // Date top-right (cert number is used for association only, not displayed)
    const certDate = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    page.drawText(`Date: ${certDate}`, {
      x: width - margin - 160,
      y: height - margin,
      size: 8.5,
      font,
      color: gray,
    });

    // ── Title ──
    const titleText = 'CERTIFICATE OF CONFORMANCE';
    const titleW = boldFont.widthOfTextAtSize(titleText, 15);
    page.drawText(titleText, {
      x: (width - titleW) / 2,
      y,
      size: 15,
      font: boldFont,
      color: black,
    });
    y -= 6;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 1,
      color: black,
    });
    y -= 24;

    // ── Info rows ──
    const labelX = margin;
    const valueX = margin + 130;
    const rowGap = 16;

    const infoRows: [string, string][] = [
      ['Customer:', cert.customerName],
      ['Ship-To Address:', (cert.customerAddress || '').replace(/\n/g, ', ')],
      ['Purchase Order #:', cert.poNumber || '—'],
      ['Part Number:', cert.partNumber || '—'],
      ['Part Description:', cert.partName || '—'],
      ['Lot Number:', cert.lotNumber || '—'],
      ['Quantity:', String(cert.quantity)],
    ];

    if (cert.manufacturingDate) {
      infoRows.push([
        'Date Manufactured:',
        new Date(cert.manufacturingDate).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
      ]);
    }
    if (cert.shipDate) {
      infoRows.push([
        'Date Shipped:',
        new Date(cert.shipDate).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
      ]);
    }

    for (const [label, value] of infoRows) {
      page.drawText(label, { x: labelX, y, size: 9, font: boldFont, color: darkGray });
      page.drawText(value, { x: valueX, y, size: 9, font, color: black });
      y -= rowGap;
    }

    y -= 6;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.3,
      color: lightGray,
    });
    y -= 16;

    // ── Serial Numbers ──
    page.drawText('Serial Numbers:', { x: margin, y, size: 9, font: boldFont, color: darkGray });
    y -= 14;

    const serialNums = (cert.serialNumbers as string[]) || [];
    const serialsPerRow = 4;
    const serialColW = usableWidth / serialsPerRow;
    for (let i = 0; i < serialNums.length; i += serialsPerRow) {
      const chunk = serialNums.slice(i, i + serialsPerRow);
      chunk.forEach((s, j) => {
        page.drawText(s, { x: margin + j * serialColW, y, size: 8.5, font, color: black });
      });
      y -= 13;
    }

    y -= 12;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.3,
      color: lightGray,
    });
    y -= 20;

    // ── Certification Statement ──
    page.drawText('CERTIFICATION STATEMENT', {
      x: margin,
      y,
      size: 9.5,
      font: boldFont,
      color: black,
    });
    y -= 14;

    const certText = cert.certificationText || '';
    const words = certText.split(' ');
    let line = '';
    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(testLine, 9) > usableWidth && line) {
        page.drawText(line, { x: margin, y, size: 9, font, color: darkGray });
        y -= 13;
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) {
      page.drawText(line, { x: margin, y, size: 9, font, color: darkGray });
      y -= 13;
    }

    // ── Signature Block ──
    const sigY = Math.min(y - 30, margin + 80);
    page.drawLine({
      start: { x: margin, y: sigY + 20 },
      end: { x: width - margin, y: sigY + 20 },
      thickness: 0.5,
      color: lightGray,
    });
    page.drawText('Quality Assurance Authorization', {
      x: margin,
      y: sigY + 4,
      size: 8.5,
      font: boldFont,
      color: darkGray,
    });
    page.drawLine({
      start: { x: margin, y: sigY - 20 },
      end: { x: margin + 210, y: sigY - 20 },
      thickness: 0.5,
      color: darkGray,
    });
    page.drawLine({
      start: { x: margin + 260, y: sigY - 20 },
      end: { x: margin + 360, y: sigY - 20 },
      thickness: 0.5,
      color: darkGray,
    });
    page.drawText('Signature', { x: margin, y: sigY - 32, size: 8, font, color: gray });
    page.drawText('Date', { x: margin + 260, y: sigY - 32, size: 8, font, color: gray });

    const bytes = await pdfDoc.save();
    res.set('Content-Type', 'application/pdf');
    res.set(
      'Content-Disposition',
      `inline; filename="coc-${cert.certificateNumber}.pdf"`
    );
    // Log download access before streaming
    await logP2DocumentAccess('certificate', cert.id, sessionUser.username, ipAddress);
    return res.send(Buffer.from(bytes));
  } catch (err: any) {
    console.error('CoC PDF error:', err);
    return res.status(500).json({ error: 'Failed to generate CoC PDF' });
  }
});

// ─── Shipment History / Detail endpoints ───────────────────────────────────

// GET /api/p2/shipments — all lots with packing slip link, newest first
router.get('/shipments', async (req: Request, res: Response) => {
  try {
    const rows = await pool.query(
      `SELECT
         l.id,
         l.lot_number,
         l.po_number,
         l.po_id,
         l.customer_name,
         l.part_number,
         l.part_name,
         l.quantity,
         l.status,
         l.tracking_number,
         l.carrier,
         l.shipped_at,
         l.created_at,
         ps.id AS packing_slip_id,
         ps.packing_slip_number
       FROM p2_lot_numbers l
       LEFT JOIN p2_packing_slips ps ON ps.lot_number_id = l.id
       ORDER BY l.created_at DESC
       LIMIT 500`
    );
    return res.json(rows);
  } catch (err: any) {
    console.error('Shipment history error:', err);
    return res.status(500).json({ error: 'Failed to load shipment history' });
  }
});

// GET /api/p2/shipments/:lotId — full shipment detail record
router.get('/shipments/:lotId', async (req: Request, res: Response) => {
  try {
    const { lotId } = req.params;

    const lotRows = await pool.query<{
      id: string; lot_number: string; lot_type: string;
      part_number: string | null; part_name: string | null;
      customer_id: string | null; customer_name: string | null;
      po_number: string | null; po_id: number | null;
      quantity: number | null;
      serialized_item_ids: any;
      status: string;
      closed_at: string | null; closed_by: string | null;
      shipped_at: string | null; shipped_by: string | null;
      packing_slip_id: string | null; certificate_id: string | null;
      notes: string | null;
      tracking_number: string | null; carrier: string | null;
      bill_of_lading_url: string | null;
      lot_validation_report_url: string | null;
      packing_slip_upload_url: string | null;
      certificate_upload_url: string | null;
      created_by: string; created_at: string;
    }>(
      `SELECT id, lot_number, lot_type, part_number, part_name,
              customer_id, customer_name, po_number, po_id, quantity,
              serialized_item_ids, status, closed_at, closed_by,
              shipped_at, shipped_by, packing_slip_id, certificate_id, notes,
              tracking_number, carrier, bill_of_lading_url,
              lot_validation_report_url,
              packing_slip_upload_url, certificate_upload_url,
              created_by, created_at
       FROM p2_lot_numbers WHERE id = $1`,
      [lotId]
    );

    if (lotRows.length === 0) return res.status(404).json({ error: 'Lot not found' });
    const lot = lotRows[0];

    // Fetch packing slip if linked
    let packingSlip: any = null;
    if (lot.packing_slip_id) {
      const psRows = await pool.query(
        `SELECT id, packing_slip_number, lot_number, customer_id, customer_name,
                po_number, invoice_number, ship_date, shipment_number, carrier,
                tracking_number, line_items, total_quantity, packed_by,
                verified_by, status, notes, created_at
         FROM p2_packing_slips WHERE id = $1`,
        [lot.packing_slip_id]
      );
      if (psRows.length) packingSlip = psRows[0];
    }

    // Fetch certificate if linked
    let certificate: any = null;
    if (lot.certificate_id) {
      const certRows = await pool.query(
        `SELECT id, certificate_number, lot_number, customer_id, customer_name,
                po_number, part_number, part_name, quantity, serial_numbers,
                manufacturing_date, ship_date, status, approved_by, approved_at,
                issued_at, created_at
         FROM p2_certificates_of_conformance WHERE id = $1`,
        [lot.certificate_id]
      );
      if (certRows.length) certificate = certRows[0];
    }

    // Fetch serialized items in this lot
    let serializedItems: any[] = [];
    const itemIds = Array.isArray(lot.serialized_item_ids) ? lot.serialized_item_ids : [];
    if (itemIds.length > 0) {
      const placeholders = itemIds.map((_: any, i: number) => `$${i + 1}`).join(', ');
      serializedItems = await pool.query(
        `SELECT id, serial_number, part_number, part_name, status, barcode,
                completed_at, po_id
         FROM p2_serialized_items WHERE id IN (${placeholders})
         ORDER BY serial_number`,
        itemIds
      );
    }

    // Fetch invoice if linked to this lot
    const invoiceRows = await pool.query(
      `SELECT id, invoice_number, invoice_date, due_date, total_amount, status
       FROM ar_invoices WHERE lot_id = $1 LIMIT 1`,
      [lotId]
    );
    const invoice = invoiceRows.length ? invoiceRows[0] : null;

    return res.json({ lot, packingSlip, certificate, serializedItems, invoice });
  } catch (err: any) {
    console.error('Shipment detail error:', err);
    return res.status(500).json({ error: 'Failed to load shipment detail' });
  }
});

// PATCH /api/p2/shipments/:lotId — update tracking, carrier, notes; optionally mark shipped
router.patch('/shipments/:lotId', async (req: Request, res: Response) => {
  try {
    const { lotId } = req.params;
    const { trackingNumber, carrier, notes, markShipped, shippedBy } = req.body;

    const setClauses: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    if (trackingNumber !== undefined) { setClauses.push(`tracking_number = $${idx++}`); vals.push(trackingNumber || null); }
    if (carrier !== undefined) { setClauses.push(`carrier = $${idx++}`); vals.push(carrier || null); }
    if (notes !== undefined) { setClauses.push(`notes = $${idx++}`); vals.push(notes || null); }
    if (markShipped) {
      setClauses.push(`status = $${idx++}`); vals.push('SHIPPED');
      setClauses.push(`shipped_at = $${idx++}`); vals.push(new Date().toISOString());
      setClauses.push(`shipped_by = $${idx++}`); vals.push(shippedBy || 'system');
    }
    setClauses.push(`updated_at = NOW()`);

    if (setClauses.length === 1) return res.status(400).json({ error: 'No fields to update' });

    vals.push(lotId);
    await pool.query(
      `UPDATE p2_lot_numbers SET ${setClauses.join(', ')} WHERE id = $${idx}`,
      vals
    );

    // Also update packing slip tracking/carrier/status if it exists
    if (trackingNumber !== undefined || carrier !== undefined || markShipped) {
      const lotRow = await pool.query<{ packing_slip_id: string | null }>(
        `SELECT packing_slip_id FROM p2_lot_numbers WHERE id = $1`, [lotId]
      );
      if (lotRow[0]?.packing_slip_id) {
        const psUpdates: string[] = [];
        const psVals: any[] = [];
        let psIdx = 1;
        if (trackingNumber !== undefined) { psUpdates.push(`tracking_number = $${psIdx++}`); psVals.push(trackingNumber || null); }
        if (carrier !== undefined) { psUpdates.push(`carrier = $${psIdx++}`); psVals.push(carrier || null); }
        if (markShipped) {
          psUpdates.push(`status = $${psIdx++}`); psVals.push('SHIPPED');
          psUpdates.push(`ship_date = $${psIdx++}`); psVals.push(new Date().toISOString());
        }
        if (psUpdates.length) {
          psVals.push(lotRow[0].packing_slip_id);
          await pool.query(
            `UPDATE p2_packing_slips SET ${psUpdates.join(', ')} WHERE id = $${psIdx}`,
            psVals
          );
        }

        if (markShipped) {
          try {
            await createInvoiceFromPackingSlip(lotRow[0].packing_slip_id, lotId);
          } catch (invoiceErr: any) {
            console.error('Auto-invoice creation failed (shipment still succeeds):', invoiceErr);
          }
        }
      }
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Shipment update error:', err);
    return res.status(500).json({ error: 'Failed to update shipment' });
  }
});

// POST /api/p2/shipments/:lotId/upload-bol — upload Bill of Lading PDF/image
router.post('/shipments/:lotId/upload-bol', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { lotId } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const storagePath = await objectStorageService.uploadBuffer(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    await pool.query(
      `UPDATE p2_lot_numbers SET bill_of_lading_url = $1, updated_at = NOW() WHERE id = $2`,
      [storagePath, lotId]
    );

    return res.json({ success: true, billOfLadingUrl: storagePath });
  } catch (err: any) {
    console.error('BoL upload error:', err);
    return res.status(500).json({ error: 'Failed to upload bill of lading' });
  }
});

// GET /api/p2/shipments/:lotId/bill-of-lading — stream BoL file back to client
router.get('/shipments/:lotId/bill-of-lading', async (req: Request, res: Response) => {
  try {
    const { lotId } = req.params;
    const rows = await pool.query<{ bill_of_lading_url: string | null }>(
      `SELECT bill_of_lading_url FROM p2_lot_numbers WHERE id = $1`, [lotId]
    );
    const bolUrl = rows[0]?.bill_of_lading_url;
    if (!bolUrl) return res.status(404).json({ error: 'No bill of lading attached' });

    const buffer = await objectStorageService.downloadAsBuffer(bolUrl);
    const ext = bolUrl.split('.').pop()?.toLowerCase();
    const contentType = ext === 'pdf' ? 'application/pdf'
      : (ext === 'png' ? 'image/png' : (ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'application/octet-stream'));
    res.set('Content-Type', contentType);
    res.set('Content-Disposition', `inline; filename="bill-of-lading"`);
    return res.send(buffer);
  } catch (err: any) {
    console.error('BoL download error:', err);
    return res.status(500).json({ error: 'Failed to retrieve bill of lading' });
  }
});

// POST /api/p2/shipments/:lotId/upload-lot-validation-report — upload Lot Validation Report PDF/image
router.post('/shipments/:lotId/upload-lot-validation-report', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { lotId } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const storagePath = await objectStorageService.uploadBuffer(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    await pool.query(
      `UPDATE p2_lot_numbers SET lot_validation_report_url = $1, updated_at = NOW() WHERE id = $2`,
      [storagePath, lotId]
    );

    return res.json({ success: true, lotValidationReportUrl: storagePath });
  } catch (err: any) {
    console.error('Lot validation report upload error:', err);
    return res.status(500).json({ error: 'Failed to upload lot validation report' });
  }
});

// GET /api/p2/shipments/:lotId/lot-validation-report — stream Lot Validation Report back to client
router.get('/shipments/:lotId/lot-validation-report', async (req: Request, res: Response) => {
  try {
    const { lotId } = req.params;
    const rows = await pool.query<{ lot_validation_report_url: string | null }>(
      `SELECT lot_validation_report_url FROM p2_lot_numbers WHERE id = $1`, [lotId]
    );
    const fileUrl = rows[0]?.lot_validation_report_url;
    if (!fileUrl) return res.status(404).json({ error: 'No lot validation report attached' });

    const buffer = await objectStorageService.downloadAsBuffer(fileUrl);
    const ext = fileUrl.split('.').pop()?.toLowerCase();
    const contentType = ext === 'pdf' ? 'application/pdf'
      : (ext === 'png' ? 'image/png' : (ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'application/octet-stream'));
    res.set('Content-Type', contentType);
    res.set('Content-Disposition', `inline; filename="lot-validation-report"`);
    return res.send(buffer);
  } catch (err: any) {
    console.error('Lot validation report download error:', err);
    return res.status(500).json({ error: 'Failed to retrieve lot validation report' });
  }
});

// POST /api/p2/shipments/:lotId/upload-packing-slip — upload external packing slip PDF
router.post('/shipments/:lotId/upload-packing-slip', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { lotId } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const storagePath = await objectStorageService.uploadBuffer(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    await pool.query(
      `UPDATE p2_lot_numbers SET packing_slip_upload_url = $1, updated_at = NOW() WHERE id = $2`,
      [storagePath, lotId]
    );

    return res.json({ success: true, packingSlipUploadUrl: storagePath });
  } catch (err: any) {
    console.error('Packing slip upload error:', err);
    return res.status(500).json({ error: 'Failed to upload packing slip' });
  }
});

// GET /api/p2/shipments/:lotId/packing-slip-upload — download uploaded packing slip PDF
router.get('/shipments/:lotId/packing-slip-upload', async (req: Request, res: Response) => {
  try {
    const { lotId } = req.params;
    const rows = await pool.query<{ packing_slip_upload_url: string | null }>(
      `SELECT packing_slip_upload_url FROM p2_lot_numbers WHERE id = $1`, [lotId]
    );
    const fileUrl = rows[0]?.packing_slip_upload_url;
    if (!fileUrl) return res.status(404).json({ error: 'No packing slip upload attached' });

    const buffer = await objectStorageService.downloadAsBuffer(fileUrl);
    const ext = fileUrl.split('.').pop()?.toLowerCase();
    const contentType = ext === 'pdf' ? 'application/pdf'
      : (ext === 'png' ? 'image/png' : (ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'application/octet-stream'));
    res.set('Content-Type', contentType);
    res.set('Content-Disposition', `inline; filename="packing-slip-upload"`);
    return res.send(buffer);
  } catch (err: any) {
    console.error('Packing slip download error:', err);
    return res.status(500).json({ error: 'Failed to retrieve packing slip' });
  }
});

// POST /api/p2/shipments/:lotId/upload-certificate — upload external certificate PDF
router.post('/shipments/:lotId/upload-certificate', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { lotId } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const storagePath = await objectStorageService.uploadBuffer(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    await pool.query(
      `UPDATE p2_lot_numbers SET certificate_upload_url = $1, updated_at = NOW() WHERE id = $2`,
      [storagePath, lotId]
    );

    return res.json({ success: true, certificateUploadUrl: storagePath });
  } catch (err: any) {
    console.error('Certificate upload error:', err);
    return res.status(500).json({ error: 'Failed to upload certificate' });
  }
});

// GET /api/p2/shipments/:lotId/certificate-upload — download uploaded certificate PDF
router.get('/shipments/:lotId/certificate-upload', async (req: Request, res: Response) => {
  try {
    const { lotId } = req.params;
    const rows = await pool.query<{ certificate_upload_url: string | null }>(
      `SELECT certificate_upload_url FROM p2_lot_numbers WHERE id = $1`, [lotId]
    );
    const fileUrl = rows[0]?.certificate_upload_url;
    if (!fileUrl) return res.status(404).json({ error: 'No certificate upload attached' });

    const buffer = await objectStorageService.downloadAsBuffer(fileUrl);
    const ext = fileUrl.split('.').pop()?.toLowerCase();
    const contentType = ext === 'pdf' ? 'application/pdf'
      : (ext === 'png' ? 'image/png' : (ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'application/octet-stream'));
    res.set('Content-Type', contentType);
    res.set('Content-Disposition', `inline; filename="certificate-upload"`);
    return res.send(buffer);
  } catch (err: any) {
    console.error('Certificate download error:', err);
    return res.status(500).json({ error: 'Failed to retrieve certificate' });
  }
});

// ── Override Shipping Data endpoints (CMMC/DCAA compliant) ─────────────────

const OVERRIDE_ALLOWED_ROLES = ['ADMIN', 'OWNER'];

const overrideShippingSchema = z.object({
  shipped_date: z.string().optional(),
  lot_number: z.string().optional(),
  reason: z.string().min(1, 'Reason is required'),
}).refine(
  (d) => d.shipped_date !== undefined || d.lot_number !== undefined,
  { message: 'At least one of shipped_date or lot_number must be provided' }
);

// PATCH /api/p2/lots/:id/override — override shipped_at and/or lot_number with audit trail
router.patch(
  '/lots/:id/override',
  authenticateToken,
  requireRole(...OVERRIDE_ALLOWED_ROLES),
  async (req: Request, res: Response) => {
    try {
      const { id: lotId } = req.params;
      const input = overrideShippingSchema.parse(req.body);
      const actor = req.user!.username;

      // Validate shipped_date format up front
      let parsedDate: Date | undefined;
      if (input.shipped_date !== undefined) {
        parsedDate = new Date(input.shipped_date);
        if (isNaN(parsedDate.getTime())) {
          return res.status(400).json({ error: 'Invalid shipped_date format. Use ISO 8601 or YYYY-MM-DD.' });
        }
      }

      // Fetch current lot values
      const lotRows = await pool.query<{
        id: string;
        lot_number: string;
        shipped_at: string | null;
        packing_slip_id: string | null;
      }>(
        `SELECT id, lot_number, shipped_at, packing_slip_id FROM p2_lot_numbers WHERE id = $1`,
        [lotId]
      );
      if (lotRows.length === 0) return res.status(404).json({ error: 'Lot not found' });
      const lot = lotRows[0];

      // Collect changes (before touching the DB) so we can detect no-ops
      type AuditEntry = { entityType: string; entityId: string; fieldName: string; oldValue: string | null; newValue: string | null };
      const auditInserts: AuditEntry[] = [];

      const lotUpdates: string[] = [];
      const lotVals: any[] = [];
      let lotIdx = 1;

      if (input.lot_number !== undefined && input.lot_number !== lot.lot_number) {
        auditInserts.push({ entityType: 'lot_number', entityId: lotId, fieldName: 'lot_number', oldValue: lot.lot_number, newValue: input.lot_number });
        lotUpdates.push(`lot_number = $${lotIdx++}`);
        lotVals.push(input.lot_number);
      }

      if (parsedDate !== undefined) {
        const oldVal = lot.shipped_at ? new Date(lot.shipped_at).toISOString() : null;
        const newVal = parsedDate.toISOString();
        if (oldVal !== newVal) {
          auditInserts.push({ entityType: 'lot_number', entityId: lotId, fieldName: 'shipped_at', oldValue: oldVal, newValue: newVal });
          lotUpdates.push(`shipped_at = $${lotIdx++}`);
          lotVals.push(parsedDate.toISOString());
        }
      }

      // Packing slip preamble (needed to detect changes before transaction)
      let psShipDateChange: { oldPsDate: string | null; newDateIso: string } | null = null;
      let psLotNumberChange: { oldPsLotNumber: string | null } | null = null;

      if (lot.packing_slip_id) {
        if (parsedDate !== undefined) {
          const psRows = await pool.query<{ ship_date: string | null }>(
            `SELECT ship_date FROM p2_packing_slips WHERE id = $1`,
            [lot.packing_slip_id]
          );
          const oldPsDate = psRows[0]?.ship_date ? new Date(psRows[0].ship_date).toISOString() : null;
          const newDateIso = parsedDate.toISOString();
          if (oldPsDate !== newDateIso) {
            psShipDateChange = { oldPsDate, newDateIso };
            auditInserts.push({ entityType: 'packing_slip', entityId: lot.packing_slip_id, fieldName: 'ship_date', oldValue: oldPsDate, newValue: newDateIso });
          }
        }
        if (input.lot_number !== undefined && input.lot_number !== lot.lot_number) {
          const psLotRows = await pool.query<{ lot_number: string | null }>(
            `SELECT lot_number FROM p2_packing_slips WHERE id = $1`,
            [lot.packing_slip_id]
          );
          psLotNumberChange = { oldPsLotNumber: psLotRows[0]?.lot_number ?? null };
          auditInserts.push({ entityType: 'packing_slip', entityId: lot.packing_slip_id, fieldName: 'lot_number', oldValue: psLotRows[0]?.lot_number ?? null, newValue: input.lot_number });
        }
      }

      // Server-side no-op guard — reject if nothing would actually change
      if (auditInserts.length === 0) {
        return res.status(400).json({ error: 'No changes detected. The provided values are identical to the current values.' });
      }

      // Execute all writes atomically
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');

        if (lotUpdates.length > 0) {
          lotUpdates.push(`updated_at = NOW()`);
          lotVals.push(lotId);
          await client.query(
            `UPDATE p2_lot_numbers SET ${lotUpdates.join(', ')} WHERE id = $${lotIdx}`,
            lotVals
          );
        }

        if (lot.packing_slip_id) {
          if (psShipDateChange) {
            await client.query(
              `UPDATE p2_packing_slips SET ship_date = $1, updated_at = NOW() WHERE id = $2`,
              [psShipDateChange.newDateIso, lot.packing_slip_id]
            );
          }
          if (psLotNumberChange && input.lot_number) {
            await client.query(
              `UPDATE p2_packing_slips SET lot_number = $1, updated_at = NOW() WHERE id = $2`,
              [input.lot_number, lot.packing_slip_id]
            );
          }
        }

        for (const entry of auditInserts) {
          await client.query(
            `INSERT INTO p2_shipping_audit_log (entity_type, entity_id, field_name, old_value, new_value, changed_by, reason) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [entry.entityType, entry.entityId, entry.fieldName, entry.oldValue, entry.newValue, actor, input.reason]
          );
        }

        await client.query('COMMIT');
      } catch (txErr: any) {
        await client.query('ROLLBACK');
        console.error('Override shipping data transaction error:', {
          message: txErr?.message,
          code: txErr?.code,
          detail: txErr?.detail,
          table: txErr?.table,
          lotId,
          actor,
        });
        throw txErr;
      } finally {
        client.release();
      }

      return res.json({ success: true, auditRowsWritten: auditInserts.length });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      console.error('Override shipping data error:', { message: err?.message, code: err?.code });
      return res.status(500).json({ error: 'Failed to override shipping data' });
    }
  }
);

// GET /api/p2/packing-slips/:id/audit-log — retrieve audit log for a packing slip (admin/owner only)
router.get(
  '/packing-slips/:id/audit-log',
  authenticateToken,
  requireRole(...OVERRIDE_ALLOWED_ROLES),
  async (req: Request, res: Response) => {
    try {
      const { id: slipId } = req.params;

      // Verify slip exists and pull linked lot id so we can include lot-scoped entries
      const slipCheck = await pool.query<{ id: string; lot_number_id: string | null }>(
        `SELECT id, lot_number_id FROM p2_packing_slips WHERE id = $1`,
        [slipId]
      );
      if (slipCheck.length === 0) return res.status(404).json({ error: 'Packing slip not found' });

      const entityIds = [slipId];
      if (slipCheck[0].lot_number_id) entityIds.push(slipCheck[0].lot_number_id);

      const placeholders = entityIds.map((_, i) => `$${i + 1}`).join(', ');
      const rows = await pool.query(
        `SELECT * FROM p2_shipping_audit_log WHERE entity_id IN (${placeholders}) ORDER BY changed_at DESC`,
        entityIds
      );
      return res.json(rows);
    } catch (err: any) {
      console.error('Packing slip audit log fetch error:', err);
      return res.status(500).json({ error: 'Failed to fetch audit log' });
    }
  }
);

// GET /api/p2/lots/:id/audit-log — retrieve audit log for a lot (admin/owner only)
router.get(
  '/lots/:id/audit-log',
  authenticateToken,
  requireRole(...OVERRIDE_ALLOWED_ROLES),
  async (req: Request, res: Response) => {
    try {
      const { id: lotId } = req.params;

      // Verify lot exists
      const lotCheck = await pool.query<{ id: string; packing_slip_id: string | null }>(
        `SELECT id, packing_slip_id FROM p2_lot_numbers WHERE id = $1`,
        [lotId]
      );
      if (lotCheck.length === 0) return res.status(404).json({ error: 'Lot not found' });

      const entityIds = [lotId];
      if (lotCheck[0].packing_slip_id) entityIds.push(lotCheck[0].packing_slip_id);

      const placeholders = entityIds.map((_, i) => `$${i + 1}`).join(', ');
      const rows = await pool.query(
        `SELECT * FROM p2_shipping_audit_log WHERE entity_id IN (${placeholders}) ORDER BY changed_at DESC`,
        entityIds
      );
      return res.json(rows);
    } catch (err: any) {
      console.error('Audit log fetch error:', err);
      return res.status(500).json({ error: 'Failed to fetch audit log' });
    }
  }
);

// GET /api/p2/serial-search?q=XXXX — partial serial number search with project linkage
router.get('/serial-search', async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string || '').trim();
    if (!q) return res.json([]);

    const rows = await pool.query<{
      serial_number: string;
      part_number: string;
      part_name: string;
      po_id: number;
      po_number: string;
      project_id: string | null;
      project_code: string | null;
      project_name: string | null;
    }>(
      `SELECT
         si.serial_number,
         si.part_number,
         si.part_name,
         si.po_id,
         po.po_number,
         p.id        AS project_id,
         p.project_code,
         p.project_name
       FROM p2_serialized_items si
       JOIN p2_purchase_orders po ON po.id = si.po_id
       LEFT JOIN projects p ON p.po_id = po.id
       WHERE si.serial_number ILIKE '%' || $1 || '%'
       ORDER BY si.serial_number
       LIMIT 10`,
      [q]
    );

    return res.json(rows);
  } catch (err: any) {
    console.error('Serial search error:', err);
    return res.status(500).json({ error: 'Serial search failed' });
  }
});

export default router;
