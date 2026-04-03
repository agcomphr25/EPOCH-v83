import { Router } from 'express';
import { db } from '../../db';
import { storage } from '../../storage';
import { allocationRequirements } from '../../schema';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { allocateInventory } from '../services/inventoryAllocationService';
import { evaluateQueueReadiness } from '../services/queueReadinessService';

const router = Router();

// GET /api/allocation-control/queue/:queueId — fetch all requirements for a queue item
router.get('/queue/:queueId', async (req, res) => {
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
    console.error('[allocationControl] GET /queue error:', error);
    res.status(500).json({ error: 'Failed to fetch requirements', message: error.message });
  }
});

const allocateSchema = z.object({
  requirementId: z.string().uuid(),
  queueId: z.number().int(),
  agPartNumber: z.string(),
  quantity: z.number().positive(),
  locationId: z.string().optional().default('WAREHOUSE-MAIN'),
  performedBy: z.string().optional().default('operator'),
  notes: z.string().optional(),
});

// POST /api/allocation-control/allocate — allocate from general inventory balance
router.post('/allocate', async (req, res) => {
  try {
    const body = allocateSchema.parse(req.body);

    // allocateInventory increments allocatedQty on the requirement via its internal hook.
    // We also call evaluateQueueReadiness explicitly here to guarantee the readiness badge
    // updates even if the internal hook fails silently.
    const result = await allocateInventory({
      agPartNumber: body.agPartNumber,
      quantity: body.quantity,
      locationId: body.locationId,
      referenceType: 'MANUFACTURING_QUEUE',
      referenceId: body.queueId,
      performedBy: body.performedBy,
      notes: body.notes,
      requirementId: body.requirementId,
      allowPartial: false,
    });

    const readiness = await evaluateQueueReadiness(body.queueId).catch(err => {
      console.warn(`[allocationControl] readiness eval failed for queue ${body.queueId}:`, err.message);
      return null;
    });

    res.json({ allocation: result, readiness });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('[allocationControl] POST /allocate error:', error);
    res.status(500).json({ error: 'Failed to allocate inventory', message: error.message });
  }
});

const reserveLotSchema = z.object({
  requirementId: z.string().uuid(),
  queueId: z.number().int(),
  materialLotId: z.string().uuid(),
  quantity: z.number().positive(),
  performedBy: z.string().optional().default('operator'),
  notes: z.string().optional(),
});

// POST /api/allocation-control/reserve-lot
// Reserves a specific material lot against an allocation requirement using the
// existing material_lot_reservations flow, then increments the requirement's
// stagedQty and re-evaluates queue readiness.
router.post('/reserve-lot', async (req, res) => {
  try {
    const body = reserveLotSchema.parse(req.body);

    // 1. Look up requirement
    const [requirement] = await db
      .select()
      .from(allocationRequirements)
      .where(eq(allocationRequirements.id, body.requirementId));

    if (!requirement) {
      return res.status(404).json({ error: 'Allocation requirement not found' });
    }

    // 2. Look up the material lot
    const lot = await storage.getMaterialLot(body.materialLotId);
    if (!lot) {
      return res.status(404).json({ error: 'Material lot not found' });
    }

    // 3. Verify requirement belongs to the stated queue (prevent cross-queue manipulation)
    if (requirement.manufacturingQueueId !== body.queueId) {
      return res.status(409).json({
        error: 'QUEUE_MISMATCH',
        message: `Requirement ${body.requirementId} belongs to queue ${requirement.manufacturingQueueId}, not ${body.queueId}`,
      });
    }

    // 4a. Validate lot status
    if (lot.status !== 'ACCEPTED' && lot.status !== 'ISSUED') {
      return res.status(409).json({
        error: 'LOT_NOT_AVAILABLE',
        message: `Lot status is ${lot.status} — only ACCEPTED or ISSUED lots can be reserved`,
      });
    }

    // 4b. Verify lot part number matches requirement (if lot has a part number recorded)
    if (lot.materialPartNumber && lot.materialPartNumber !== requirement.requiredPartNumber) {
      return res.status(409).json({
        error: 'PART_NUMBER_MISMATCH',
        message: `Lot part number ${lot.materialPartNumber} does not match requirement part number ${requirement.requiredPartNumber}`,
        lotPartNumber: lot.materialPartNumber,
        requiredPartNumber: requirement.requiredPartNumber,
      });
    }

    // 5. Validate available quantity
    const remaining = parseFloat(lot.remainingQty);
    const alreadyReserved = await storage.getReservedQtyForLot(body.materialLotId);
    const available = Math.max(0, remaining - alreadyReserved);

    if (body.quantity > available) {
      return res.status(409).json({
        error: 'OVER_COMMITTED',
        message: `Cannot reserve ${body.quantity} ${lot.unitOfMeasure} — only ${available} available (${remaining} remaining, ${alreadyReserved} already reserved)`,
        remaining,
        alreadyReserved,
        available,
        requested: body.quantity,
      });
    }

    // 6. Create the reservation through the existing lot reservation path
    const reservation = await storage.createLotReservation({
      materialLotId: body.materialLotId,
      quantityReserved: String(body.quantity),
      unitOfMeasure: lot.unitOfMeasure,
      status: 'active',
      notes: body.notes ?? `Reserved for manufacturing queue #${body.queueId}, requirement ${body.requirementId}`,
      createdBy: body.performedBy,
    });

    // 7. Update the matched requirement: increment stagedQty, link lot and reservation
    const [updatedRequirement] = await db
      .update(allocationRequirements)
      .set({
        stagedQty: sql`COALESCE(${allocationRequirements.stagedQty}, 0) + ${body.quantity}`,
        materialLotId: body.materialLotId,
        materialLotReservationId: reservation.id,
        allocationStatus: 'STAGED',
        updatedAt: new Date(),
      })
      .where(eq(allocationRequirements.id, body.requirementId))
      .returning();

    console.log(
      `[allocationControl] reserve-lot: lot ${body.materialLotId} (ICN: ${lot.internalControlNumber ?? 'N/A'}) ` +
        `reserved ${body.quantity} ${lot.unitOfMeasure} → reservation #${reservation.id}, ` +
        `requirement ${body.requirementId}, queue ${body.queueId}`
    );

    // 8. Re-evaluate queue readiness
    const readiness = await evaluateQueueReadiness(body.queueId).catch(err => {
      console.warn(`[allocationControl] readiness eval failed for queue ${body.queueId}:`, err.message);
      return null;
    });

    res.json({ reservation, requirement: updatedRequirement, readiness });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('[allocationControl] POST /reserve-lot error:', error);
    res.status(500).json({ error: 'Failed to reserve lot', message: error.message });
  }
});

export default router;
