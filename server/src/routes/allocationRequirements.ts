import { Router } from 'express';
import { db } from '../../db';
import {
  allocationRequirements,
  insertAllocationRequirementSchema,
  manufacturingQueue,
} from '../../schema';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { evaluateQueueReadiness } from '../services/queueReadinessService';

const router = Router();

// POST /api/allocation-requirements — create one or more requirements for a queue item
router.post('/', async (req, res) => {
  try {
    const body = req.body;
    const items = Array.isArray(body) ? body : [body];

    const validated = items.map(item => insertAllocationRequirementSchema.parse(item));

    const created = await db
      .insert(allocationRequirements)
      .values(validated)
      .returning();

    // Trigger readiness evaluation for all affected queue IDs
    const queueIds = [...new Set(validated.map(v => v.manufacturingQueueId))];
    for (const queueId of queueIds) {
      await evaluateQueueReadiness(queueId).catch(err =>
        console.warn(`[allocationRequirements] readiness eval failed for queue ${queueId}:`, err.message)
      );
    }

    res.status(201).json(created);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('[allocationRequirements] POST error:', error);
    res.status(500).json({ error: 'Failed to create allocation requirements', message: error.message });
  }
});

// GET /api/allocation-requirements/by-queue/:queueId — fetch all requirements for a queue item
router.get('/by-queue/:queueId', async (req, res) => {
  try {
    const queueId = parseInt(req.params.queueId, 10);
    if (isNaN(queueId)) {
      return res.status(400).json({ error: 'Invalid queue ID' });
    }

    const requirements = await db
      .select()
      .from(allocationRequirements)
      .where(eq(allocationRequirements.manufacturingQueueId, queueId));

    res.json(requirements);
  } catch (error: any) {
    console.error('[allocationRequirements] GET by-queue error:', error);
    res.status(500).json({ error: 'Failed to fetch allocation requirements', message: error.message });
  }
});

// PATCH /api/allocation-requirements/:id — update qty fields or status
const patchSchema = z.object({
  allocatedQty: z.union([z.string(), z.number()]).optional(),
  stagedQty: z.union([z.string(), z.number()]).optional(),
  consumedQty: z.union([z.string(), z.number()]).optional(),
  allocationStatus: z.string().optional(),
  notes: z.string().optional(),
  materialLotId: z.string().uuid().optional().nullable(),
  materialLotReservationId: z.number().int().optional().nullable(),
  internalControlNumber: z.string().optional().nullable(),
});

router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [existing] = await db
      .select()
      .from(allocationRequirements)
      .where(eq(allocationRequirements.id, id));

    if (!existing) {
      return res.status(404).json({ error: 'Allocation requirement not found' });
    }

    const patch = patchSchema.parse(req.body);
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (patch.allocatedQty !== undefined) updateData.allocatedQty = String(patch.allocatedQty);
    if (patch.stagedQty !== undefined) updateData.stagedQty = String(patch.stagedQty);
    if (patch.consumedQty !== undefined) updateData.consumedQty = String(patch.consumedQty);
    if (patch.allocationStatus !== undefined) updateData.allocationStatus = patch.allocationStatus;
    if (patch.notes !== undefined) updateData.notes = patch.notes;
    if (patch.materialLotId !== undefined) updateData.materialLotId = patch.materialLotId;
    if (patch.materialLotReservationId !== undefined) updateData.materialLotReservationId = patch.materialLotReservationId;
    if (patch.internalControlNumber !== undefined) updateData.internalControlNumber = patch.internalControlNumber;

    const [updated] = await db
      .update(allocationRequirements)
      .set(updateData)
      .where(eq(allocationRequirements.id, id))
      .returning();

    // Re-evaluate readiness after qty update
    await evaluateQueueReadiness(existing.manufacturingQueueId).catch(err =>
      console.warn(`[allocationRequirements] readiness eval failed for queue ${existing.manufacturingQueueId}:`, err.message)
    );

    res.json(updated);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('[allocationRequirements] PATCH error:', error);
    res.status(500).json({ error: 'Failed to update allocation requirement', message: error.message });
  }
});

// DELETE /api/allocation-requirements/:id — remove a requirement
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [existing] = await db
      .select()
      .from(allocationRequirements)
      .where(eq(allocationRequirements.id, id));

    if (!existing) {
      return res.status(404).json({ error: 'Allocation requirement not found' });
    }

    await db
      .delete(allocationRequirements)
      .where(eq(allocationRequirements.id, id));

    // Re-evaluate readiness after removal
    await evaluateQueueReadiness(existing.manufacturingQueueId).catch(err =>
      console.warn(`[allocationRequirements] readiness eval failed for queue ${existing.manufacturingQueueId}:`, err.message)
    );

    res.status(204).send();
  } catch (error: any) {
    console.error('[allocationRequirements] DELETE error:', error);
    res.status(500).json({ error: 'Failed to delete allocation requirement', message: error.message });
  }
});

export default router;
