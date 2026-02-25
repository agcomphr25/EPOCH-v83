import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db';
import { p2SerializedItems, p2SerializedItemEvents } from '../../schema';
import { and, eq, inArray } from 'drizzle-orm';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { poId, poItemId } = req.query;

    if (!poId || !poItemId) {
      return res.status(400).json({ error: 'poId and poItemId query parameters are required' });
    }

    const items = await db.query.p2SerializedItems.findMany({
      where: and(
        eq(p2SerializedItems.poId, Number(poId)),
        eq(p2SerializedItems.poItemId, Number(poItemId))
      ),
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
