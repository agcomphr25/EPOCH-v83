import { Router } from 'express';
import { z } from 'zod';
import { db, pool } from '../../db';
import { p2SerializedItems, p2SerializedItemEvents } from '../../schema';
import { and, eq, inArray, or, ilike, isNotNull } from 'drizzle-orm';

const router = Router();

const FINALIZATION_DEPARTMENTS = ['Final QC', 'Shipping QC', 'Shipping', 'COMPLETED'];

type P2PoFamilyDisplay = {
  po_id: number;
  display_po_id: number;
  display_po_number: string;
  current_po_id: number;
  current_po_number: string;
};

router.get('/', async (req, res) => {
  try {
    const poItemIdRaw = req.query.poItemId;
    if (!poItemIdRaw) return res.status(400).json({ error: 'poItemId is required' });

    const poItemId = Number(poItemIdRaw);
    if (!Number.isFinite(poItemId)) return res.status(400).json({ error: 'poItemId must be a number' });

    const units = await db.query.p2SerializedItems.findMany({
      where: and(eq(p2SerializedItems.poItemId, poItemId), eq(p2SerializedItems.status, 'ACTIVE')),
      orderBy: (t, { asc }) => [asc(t.sequenceNumber)],
    });

    res.json({ units });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to fetch serialized units' });
  }
});

router.get('/scrapped', async (req, res) => {
  try {
    const units = await db.query.p2SerializedItems.findMany({
      where: eq(p2SerializedItems.status, 'SCRAPPED'),
      orderBy: (t, { desc }) => [desc(t.scrapAt)],
    });

    res.json(units);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to fetch scrapped items' });
  }
});

router.get('/shipping-queue', async (req, res) => {
  try {
    const SHIPPING_PIPELINE_DEPTS = ['Final QC', 'Shipping QC', 'Shipping', 'COMPLETED', 'Quality Control'];

    // Fetch all pipeline-eligible serials (Drizzle gives us camelCase fields)
    const units = await db.query.p2SerializedItems.findMany({
      where: or(
        and(
          or(...SHIPPING_PIPELINE_DEPTS.map(d => eq(p2SerializedItems.currentDepartment, d))),
          eq(p2SerializedItems.status, 'ACTIVE')
        ),
        eq(p2SerializedItems.status, 'COMPLETED'),
        and(
          isNotNull(p2SerializedItems.completedAt),
          or(eq(p2SerializedItems.status, 'ACTIVE'), eq(p2SerializedItems.status, 'COMPLETED'))
        )
      ),
      orderBy: (t, { asc }) => [asc(t.poNumber), asc(t.sequenceNumber)],
    });

    // Build a set of all serial IDs already assigned to a lot.
    // pg automatically parses the JSONB column into a JS array of strings.
    const lotRows = await pool.query<{ serialized_item_ids: string[] | null }>(
      `SELECT serialized_item_ids
         FROM p2_lot_numbers
        WHERE serialized_item_ids IS NOT NULL
          AND COALESCE(status, '') <> 'VOID'`
    );
    const shippedIds = new Set<string>(
      lotRows.flatMap((r) => r.serialized_item_ids ?? [])
    );

    // Exclude any serial already in a lot — prevents re-shipment
    const unshipped = units.filter((u) => !shippedIds.has(u.id));

    const poIds = Array.from(new Set(unshipped.map((u) => u.poId).filter(Boolean)));
    const familyRows = poIds.length > 0
      ? await pool.query<P2PoFamilyDisplay>(
        `SELECT
           po.id AS po_id,
           COALESCE(root.id, po.id) AS display_po_id,
           COALESCE(root.po_number, po.po_number) AS display_po_number,
           COALESCE(current_po.id, po.id) AS current_po_id,
           COALESCE(current_po.po_number, po.po_number) AS current_po_number
         FROM p2_purchase_orders po
         LEFT JOIN p2_purchase_orders root ON root.id = po.parent_po_id
         LEFT JOIN LATERAL (
           SELECT family.id, family.po_number
             FROM p2_purchase_orders family
            WHERE COALESCE(family.parent_po_id, family.id) = COALESCE(po.parent_po_id, po.id)
            ORDER BY family.is_current_revision DESC, family.revision_number DESC, family.id DESC
            LIMIT 1
         ) current_po ON true
         WHERE po.id = ANY($1::int[])`,
        [poIds],
      )
      : [];
    const familyByPoId = new Map(familyRows.map((row) => [Number(row.po_id), row]));

    res.json(unshipped.map((unit) => {
      const family = familyByPoId.get(Number(unit.poId));
      return {
        ...unit,
        rawPoNumber: unit.poNumber,
        rawPoId: unit.poId,
        displayPoNumber: family?.display_po_number ?? unit.poNumber,
        displayPoId: family?.display_po_id ?? unit.poId,
        currentRevisionPoNumber: family?.current_po_number ?? unit.poNumber,
        currentRevisionPoId: family?.current_po_id ?? unit.poId,
        poNumber: family?.display_po_number ?? unit.poNumber,
      };
    }));
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to fetch shipping queue' });
  }
});

if (process.env.NODE_ENV !== 'production') {
router.get('/shipping-queue-debug', async (req, res) => {
  try {
    const rows = await pool.query(`
      SELECT status, current_department, 
        COUNT(*) as cnt,
        COUNT(*) FILTER (WHERE completed_at IS NOT NULL) as completed_count,
        COUNT(*) FILTER (WHERE finalized_at IS NOT NULL) as finalized_count
      FROM p2_serialized_items
      GROUP BY status, current_department
      ORDER BY cnt DESC
    `);
    res.json({ groups: rows, total: rows.reduce((s: number, r: any) => s + parseInt(r.cnt), 0) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Debug query failed' });
  }
});
} // end NODE_ENV !== 'production'

router.get('/scan/:barcode', async (req, res) => {
  try {
    const { barcode } = req.params;

    const item = await db.query.p2SerializedItems.findFirst({
      where: or(
        ilike(p2SerializedItems.barcode, barcode),
        ilike(p2SerializedItems.travelerBarcode, barcode),
        ilike(p2SerializedItems.serialNumber, barcode)
      ),
    });

    if (!item) {
      return res.status(404).json({ error: 'No serialized item found for this barcode' });
    }

    const warnings: string[] = [];

    if (item.status === 'SCRAPPED') {
      return res.status(403).json({
        error: 'This unit has been scrapped and cannot be finalized',
        guard: 'SCRAPPED',
        barcode: item.barcode,
        serializedItemId: item.id,
      });
    }

    if (item.status === 'HOLD') {
      warnings.push('Unit is currently on HOLD — finalization allowed but review hold reason before shipping');
    }

    if (!FINALIZATION_DEPARTMENTS.includes(item.currentDepartment)) {
      warnings.push(`Unit is in ${item.currentDepartment} — typically finalized at Final QC or Shipping QC`);
    }

    if ((item as any).finalizedAt) {
      warnings.push('Unit has already been finalized');
    }

    return res.json({
      id: item.id,
      barcode: item.barcode,
      serialNumber: item.serialNumber,
      sequenceNumber: item.sequenceNumber,
      partNumber: item.partNumber,
      partName: item.partName,
      poNumber: item.poNumber,
      poId: item.poId,
      poItemId: item.poItemId,
      customerName: item.customerName,
      status: item.status,
      currentDepartment: item.currentDepartment,
      buildFamilyKey: (item as any).buildFamilyKey ?? null,
      sku: (item as any).sku ?? null,
      drawingName: (item as any).drawingName ?? null,
      customerSerialNumber: (item as any).customerSerialNumber ?? null,
      finalizedAt: (item as any).finalizedAt ?? null,
      finalizedBy: (item as any).finalizedBy ?? null,
      holdReason: item.holdReason ?? null,
      warnings,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to look up barcode' });
  }
});

const finalizeSchema = z.object({
  serializedItemIds: z.array(z.string().uuid()).min(1),
  sku: z.string().min(1),
  drawingName: z.string().min(1),
  customerSerialNumber: z.string().min(1).optional(),
  performedBy: z.string().min(1),
});

const unfinalizeSchema = z.object({
  serializedItemIds: z.array(z.string().uuid()).min(1),
  reason: z.string().trim().min(1).optional(),
  performedBy: z.string().min(1),
});

const correctFinalizedIdentitySchema = z.object({
  serializedItemIds: z.array(z.string().uuid()).min(1),
  sku: z.string().trim().min(1),
  drawingName: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  performedBy: z.string().min(1),
});

router.post('/finalize', async (req, res) => {
  try {
    const input = finalizeSchema.parse(req.body);

    const items = await db.query.p2SerializedItems.findMany({
      where: inArray(p2SerializedItems.id, input.serializedItemIds),
    });

    if (items.length !== input.serializedItemIds.length) {
      return res.status(404).json({ error: 'One or more serialized items not found' });
    }

    const scrapped = items.filter(i => i.status === 'SCRAPPED');
    if (scrapped.length > 0) {
      return res.status(403).json({
        error: 'Cannot finalize scrapped units',
        guard: 'SCRAPPED',
        items: scrapped.map(i => ({ id: i.id, barcode: i.barcode })),
      });
    }

    const onHold = items.filter(i => i.status === 'HOLD');
    if (onHold.length > 0) {
      const overrideHold = req.body.overrideHold === true;
      if (!overrideHold) {
        return res.status(403).json({
          error: 'Some units are on HOLD — send overrideHold: true to finalize anyway',
          guard: 'HOLD',
          items: onHold.map(i => ({ id: i.id, barcode: i.barcode, holdReason: i.holdReason })),
        });
      }
    }

    const wrongDept = items.filter(i => !FINALIZATION_DEPARTMENTS.includes(i.currentDepartment) && i.status !== 'COMPLETED');
    if (wrongDept.length > 0) {
      const overrideDept = req.body.overrideDepartment === true;
      if (!overrideDept) {
        return res.status(403).json({
          error: 'Some units have not reached Final QC / Shipping QC yet — send overrideDepartment: true to finalize anyway',
          guard: 'WRONG_DEPARTMENT',
          items: wrongDept.map(i => ({ id: i.id, barcode: i.barcode, currentDepartment: i.currentDepartment })),
        });
      }
    }

    await db
      .update(p2SerializedItems)
      .set({
        sku: input.sku,
        drawingName: input.drawingName,
        customerSerialNumber: input.customerSerialNumber ?? null,
        customerSerialAssignedAt: input.customerSerialNumber ? new Date() : null,
        customerSerialAssignedBy: input.customerSerialNumber ? input.performedBy : null,
        finalizedAt: new Date(),
        finalizedBy: input.performedBy,
        updatedAt: new Date(),
      })
      .where(inArray(p2SerializedItems.id, input.serializedItemIds));

    for (const item of items) {
      await db.insert(p2SerializedItemEvents).values({
        serializedItemId: item.id,
        barcode: item.barcode,
        eventType: 'NOTE',
        performedBy: input.performedBy,
        notes: `Finalized identity for shipment`,
        metadata: {
          sku: input.sku,
          drawingName: input.drawingName,
          customerSerialNumber: input.customerSerialNumber ?? null,
        },
      });
    }

    return res.json({ success: true, updatedCount: items.length });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to finalize serialized items' });
  }
});

router.post('/unfinalize', async (req, res) => {
  try {
    const input = unfinalizeSchema.parse(req.body);

    const items = await db.query.p2SerializedItems.findMany({
      where: inArray(p2SerializedItems.id, input.serializedItemIds),
    });

    if (items.length !== input.serializedItemIds.length) {
      return res.status(404).json({ error: 'One or more serialized items not found' });
    }

    const alreadyShippedRows = await pool.query<{ serialized_item_ids: string[] | null }>(
      `SELECT serialized_item_ids
         FROM p2_lot_numbers
        WHERE serialized_item_ids IS NOT NULL
          AND COALESCE(status, '') <> 'VOID'`
    );
    const alreadyShippedIds = new Set<string>(
      alreadyShippedRows.flatMap((row) => row.serialized_item_ids ?? [])
    );
    const alreadyShipped = items.filter((item) => alreadyShippedIds.has(item.id));
    if (alreadyShipped.length > 0) {
      return res.status(409).json({
        error: 'Cannot unfinalize units that are already assigned to a P2 shipment lot',
        items: alreadyShipped.map((item) => ({ id: item.id, barcode: item.barcode, serialNumber: item.serialNumber })),
      });
    }

    const finalizedItems = items.filter((item) => (item as any).finalizedAt);
    if (finalizedItems.length === 0) {
      return res.json({ success: true, updatedCount: 0 });
    }

    await db
      .update(p2SerializedItems)
      .set({
        finalizedAt: null,
        finalizedBy: null,
        updatedAt: new Date(),
      })
      .where(inArray(p2SerializedItems.id, finalizedItems.map((item) => item.id)));

    for (const item of finalizedItems) {
      await db.insert(p2SerializedItemEvents).values({
        serializedItemId: item.id,
        barcode: item.barcode,
        eventType: 'NOTE',
        performedBy: input.performedBy,
        notes: `Unfinalized identity for correction${input.reason ? `: ${input.reason}` : ''}`,
        metadata: {
          previousSku: (item as any).sku ?? null,
          previousDrawingName: (item as any).drawingName ?? null,
          previousCustomerSerialNumber: (item as any).customerSerialNumber ?? null,
          previousFinalizedAt: (item as any).finalizedAt ?? null,
          previousFinalizedBy: (item as any).finalizedBy ?? null,
          reason: input.reason ?? null,
        },
      });
    }

    return res.json({ success: true, updatedCount: finalizedItems.length });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to unfinalize serialized items' });
  }
});

router.post('/correct-finalized-identity', async (req, res) => {
  try {
    const input = correctFinalizedIdentitySchema.parse(req.body);

    const items = await db.query.p2SerializedItems.findMany({
      where: inArray(p2SerializedItems.id, input.serializedItemIds),
    });

    if (items.length !== input.serializedItemIds.length) {
      return res.status(404).json({ error: 'One or more serialized items not found' });
    }

    const alreadyShippedRows = await pool.query<{ serialized_item_ids: string[] | null }>(
      `SELECT serialized_item_ids
         FROM p2_lot_numbers
        WHERE serialized_item_ids IS NOT NULL
          AND COALESCE(status, '') <> 'VOID'`
    );
    const alreadyShippedIds = new Set<string>(
      alreadyShippedRows.flatMap((row) => row.serialized_item_ids ?? [])
    );
    const alreadyShipped = items.filter((item) => alreadyShippedIds.has(item.id));
    if (alreadyShipped.length > 0) {
      return res.status(409).json({
        error: 'Cannot correct SKU/drawing for units that are already assigned to a P2 shipment lot',
        items: alreadyShipped.map((item) => ({ id: item.id, barcode: item.barcode, serialNumber: item.serialNumber })),
      });
    }

    const notFinalized = items.filter((item) => !(item as any).finalizedAt);
    if (notFinalized.length > 0) {
      return res.status(409).json({
        error: 'Only finalized units can be corrected here. Finalize unfinished units first.',
        items: notFinalized.map((item) => ({ id: item.id, barcode: item.barcode, serialNumber: item.serialNumber })),
      });
    }

    await db
      .update(p2SerializedItems)
      .set({
        sku: input.sku,
        drawingName: input.drawingName,
        updatedAt: new Date(),
      })
      .where(inArray(p2SerializedItems.id, items.map((item) => item.id)));

    for (const item of items) {
      await db.insert(p2SerializedItemEvents).values({
        serializedItemId: item.id,
        barcode: item.barcode,
        eventType: 'NOTE',
        performedBy: input.performedBy,
        notes: `Corrected finalized SKU/drawing: ${input.reason}`,
        metadata: {
          previousSku: (item as any).sku ?? null,
          previousDrawingName: (item as any).drawingName ?? null,
          newSku: input.sku,
          newDrawingName: input.drawingName,
          reason: input.reason,
          finalizedAt: (item as any).finalizedAt ?? null,
          finalizedBy: (item as any).finalizedBy ?? null,
        },
      });
    }

    return res.json({ success: true, updatedCount: items.length });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Failed to correct finalized SKU/drawing' });
  }
});

export default router;
