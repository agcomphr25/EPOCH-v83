import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db';
import { p2SerializedItems, p2SerializedItemEvents } from '../../schema';
import { and, eq, inArray, or, ilike } from 'drizzle-orm';

const router = Router();

const FINALIZATION_DEPARTMENTS = ['Final QC', 'Shipping QC', 'Shipping', 'COMPLETED'];

router.get('/', async (req, res) => {
  try {
    const { poId, poItemId, status } = req.query;

    if (!poItemId && !poId) {
      return res.status(400).json({ error: 'At least poItemId or poId query parameter is required' });
    }

    if (poId && isNaN(Number(poId))) {
      return res.status(400).json({ error: 'poId must be a valid number' });
    }
    if (poItemId && isNaN(Number(poItemId))) {
      return res.status(400).json({ error: 'poItemId must be a valid number' });
    }

    const conditions = [];
    if (poId) conditions.push(eq(p2SerializedItems.poId, Number(poId)));
    if (poItemId) conditions.push(eq(p2SerializedItems.poItemId, Number(poItemId)));
    if (status) conditions.push(eq(p2SerializedItems.status, String(status)));

    const items = await db.query.p2SerializedItems.findMany({
      where: conditions.length > 1 ? and(...conditions) : conditions[0],
    });

    return res.json(items.map(item => ({
      id: item.id,
      barcode: item.barcode,
      serialNumber: item.serialNumber,
      sequenceNumber: item.sequenceNumber,
      partNumber: item.partNumber,
      partName: item.partName,
      status: item.status,
      currentDepartment: item.currentDepartment,
      currentStageIndex: item.currentStageIndex,
      buildFamilyKey: (item as any).buildFamilyKey ?? null,
      sku: (item as any).sku ?? null,
      drawingName: (item as any).drawingName ?? null,
      customerSerialNumber: (item as any).customerSerialNumber ?? null,
      finalizedAt: (item as any).finalizedAt ?? null,
      finalizedBy: (item as any).finalizedBy ?? null,
    })));
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to fetch serialized items' });
  }
});

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

export default router;
