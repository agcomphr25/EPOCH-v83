import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { storage } from '../../storage';
import {
  insertMaterialLotSchema,
  insertMaterialLotTransactionSchema,
  insertTravelerMaterialConsumptionSchema,
  insertMaterialLotReservationSchema,
  type InsertMaterialLotTransaction,
  cuttingBuiltPackets,
  cuttingBuiltPacketFabricSources,
  cuttingFabricInventory,
  manufacturingQueue,
  allocationRequirements,
  materialLots,
  materialLotTransactions,
  travelerMaterialConsumption,
  materialLotReservations,
  inventoryTransactions,
  inventoryBalances,
} from '../../schema';
import { db } from '../../db';
import { eq, sql, and } from 'drizzle-orm';
import { evaluateQueueReadiness } from '../services/queueReadinessService';

const router = Router();

type TransactionType = 'RECEIVE' | 'MOVE' | 'ISSUE' | 'ADJUST' | 'SCRAP' | 'RETURN' | 'SPLIT' | 'OUT_START' | 'OUT_END' | 'ACCEPT' | 'REJECT' | 'QUARANTINE';
type MaterialLotStatus = 'RECEIVED' | 'ACCEPTED' | 'ISSUED' | 'EXPIRED' | 'QUARANTINE' | 'REJECTED' | 'CONSUMED' | 'SCRAPPED';

function createTransaction(data: Omit<InsertMaterialLotTransaction, 'wasOverride'> & { wasOverride?: boolean }): InsertMaterialLotTransaction {
  return { ...data, wasOverride: data.wasOverride ?? false };
}

router.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[MaterialLots] ${req.method} ${req.path}`);
  next();
});

// Get all material lots
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, inventoryItemId, expiringSoon, nearingOutTime } = req.query;

    let lots;
    if (status && typeof status === 'string') {
      lots = await storage.getMaterialLotsByStatus(status);
    } else if (inventoryItemId && typeof inventoryItemId === 'string') {
      lots = await storage.getMaterialLotsByInventoryItem(parseInt(inventoryItemId, 10));
    } else if (expiringSoon && typeof expiringSoon === 'string') {
      const days = parseInt(expiringSoon, 10) || 30;
      lots = await storage.getMaterialLotsExpiringSoon(days);
    } else if (nearingOutTime && typeof nearingOutTime === 'string') {
      const threshold = parseFloat(nearingOutTime) || 75;
      lots = await storage.getMaterialLotsNearingOutTime(threshold);
    } else {
      lots = await storage.getAllMaterialLots();
    }

    res.json(lots);
  } catch (error: any) {
    console.error('Error fetching material lots:', error);
    res.status(500).json({ error: 'Failed to fetch material lots', message: error.message });
  }
});

// Generate next ICN
router.get('/next-icn', async (req: Request, res: Response) => {
  try {
    const icn = await storage.generateNextICN();
    res.json({ icn });
  } catch (error: any) {
    console.error('Error generating ICN:', error);
    res.status(500).json({ error: 'Failed to generate ICN', message: error.message });
  }
});

// Get material lot by ICN (barcode scan)
router.get('/by-icn/:icn', async (req: Request, res: Response) => {
  try {
    const { icn } = req.params;
    const lot = await storage.getMaterialLotByICN(icn);

    if (!lot) {
      return res.status(404).json({ error: 'Material lot not found' });
    }
    res.json(lot);
  } catch (error: any) {
    console.error('Error fetching material lot by ICN:', error);
    res.status(500).json({ error: 'Failed to fetch material lot', message: error.message });
  }
});

// Validate material lot for consumption
router.get('/validate/:icn', async (req: Request, res: Response) => {
  try {
    const { icn } = req.params;
    const { qtyNeeded, partNumber } = req.query;

    const lot = await storage.getMaterialLotByICN(icn);

    if (!lot) {
      // Fallback: try looking up as a built packet barcode
      const [packet] = await db
        .select()
        .from(cuttingBuiltPackets)
        .where(eq(cuttingBuiltPackets.barcode, icn))
        .limit(1);

      if (packet) {
        // Get all fabric sources for this packet, joined with fabric inventory details
        const sources = await db
          .select({
            sourceId: cuttingBuiltPacketFabricSources.id,
            fabricInventoryId: cuttingBuiltPacketFabricSources.fabricInventoryId,
            fabricType: cuttingBuiltPacketFabricSources.fabricType,
            lotNumber: cuttingBuiltPacketFabricSources.lotNumber,
            batchNumber: cuttingBuiltPacketFabricSources.batchNumber,
            rollNumber: cuttingBuiltPacketFabricSources.rollNumber,
            supplierPartNumber: cuttingBuiltPacketFabricSources.supplierPartNumber,
            internalControlNumber: cuttingBuiltPacketFabricSources.internalControlNumber,
            expirationDate: cuttingBuiltPacketFabricSources.expirationDate,
            quantityUsed: cuttingBuiltPacketFabricSources.quantityUsed,
            isPrimary: cuttingBuiltPacketFabricSources.isPrimary,
            // Fabric inventory details (may be null if not linked)
            invId: cuttingFabricInventory.id,
            invSource: cuttingFabricInventory.source,
            invFabric: cuttingFabricInventory.fabric,
            invFabricPartNumber: cuttingFabricInventory.fabricPartNumber,
            invSupplierPartNumber: cuttingFabricInventory.supplierPartNumber,
            invInternalControlNumber: cuttingFabricInventory.internalControlNumber,
            invLotNumber: cuttingFabricInventory.lotNumber,
            invBatchNumber: cuttingFabricInventory.batchNumber,
            invRollNumber: cuttingFabricInventory.rollNumber,
            invExpirationDate: cuttingFabricInventory.expirationDate,
            invReceivedDate: cuttingFabricInventory.receivedDate,
            invSquareMeters: cuttingFabricInventory.squareMeters,
            invLocation: cuttingFabricInventory.location,
          })
          .from(cuttingBuiltPacketFabricSources)
          .leftJoin(
            cuttingFabricInventory,
            eq(cuttingBuiltPacketFabricSources.fabricInventoryId, cuttingFabricInventory.id)
          )
          .where(eq(cuttingBuiltPacketFabricSources.builtPacketId, packet.id));

        const fabricRolls = sources.map(s => ({
          fabricInventoryId: s.fabricInventoryId,
          fabricType: s.fabricType || s.invFabric,
          lotNumber: s.lotNumber || s.invLotNumber,
          batchNumber: s.batchNumber || s.invBatchNumber,
          rollNumber: s.rollNumber || s.invRollNumber,
          supplierPartNumber: s.supplierPartNumber || s.invSupplierPartNumber || s.invFabricPartNumber,
          internalControlNumber: s.internalControlNumber || s.invInternalControlNumber,
          expirationDate: s.expirationDate || s.invExpirationDate,
          quantityUsed: s.quantityUsed,
          isPrimary: s.isPrimary,
          source: s.invSource,
          location: s.invLocation,
          squareMeters: s.invSquareMeters,
          receivedDate: s.invReceivedDate,
        }));

        return res.json({
          valid: true,
          status: 'PACKET',
          message: `Packet ${packet.barcode} found with ${fabricRolls.length} fabric roll(s)`,
          packet: {
            id: packet.id,
            barcode: packet.barcode,
            packetNumber: packet.packetNumber,
            buildDate: packet.buildDate,
            status: packet.status,
            isMixedFabric: packet.isMixedFabric,
          },
          fabricRolls,
        });
      }

      // Fallback 2: parse MFG-{queue_id}-{partNumber}-{seq} barcode format
      const mfgMatch = icn.match(/^MFG-(\d+)-([^-]+)(?:-(\d+))?$/);
      if (mfgMatch) {
        const queueId = parseInt(mfgMatch[1], 10);
        const [queueItem] = await db
          .select()
          .from(manufacturingQueue)
          .where(eq(manufacturingQueue.id, queueId))
          .limit(1);

        if (queueItem) {
          let fabricRolls: any[] = [];

          // Parse stored fabric sources from materialDetails JSON
          if (queueItem.materialDetails) {
            try {
              const stored = JSON.parse(queueItem.materialDetails);
              if (Array.isArray(stored) && stored.length > 0) {
                fabricRolls = stored.map((s: any) => ({
                  fabricInventoryId: s.fabricInventoryId,
                  fabricType: s.fabricType,
                  lotNumber: s.lotNumber,
                  batchNumber: s.batchNumber,
                  rollNumber: s.rollNumber,
                  supplierPartNumber: s.supplierPartNumber,
                  internalControlNumber: s.internalControlNumber,
                  expirationDate: s.expirationDate,
                  quantityUsed: s.quantityUsed,
                  isPrimary: s.isPrimary ?? true,
                  source: s.source || s.supplier,
                  squareMeters: s.squareMeters,
                  receivedDate: s.receivedDate,
                }));
              }
            } catch { /* ignore JSON parse errors */ }
          }

          // Fallback: use top-level fabric fields if no materialDetails
          if (fabricRolls.length === 0 && (queueItem.fabricLot || queueItem.fabricBatch || queueItem.fabricRoll)) {
            fabricRolls = [{
              lotNumber: queueItem.fabricLot,
              batchNumber: queueItem.fabricBatch,
              rollNumber: queueItem.fabricRoll,
              internalControlNumber: queueItem.fabricLot || queueItem.fabricBatch,
              isPrimary: true,
            }];
          }

          return res.json({
            valid: true,
            status: 'PACKET',
            message: `Manufacturing packet ${icn} linked — ${fabricRolls.length} fabric roll(s)`,
            packet: {
              id: queueItem.id,
              barcode: icn,
              packetNumber: parseInt(mfgMatch[3] || '1', 10),
              buildDate: queueItem.completedAt || queueItem.startedAt || new Date().toISOString(),
              status: queueItem.status,
              isMixedFabric: fabricRolls.length > 1,
            },
            fabricRolls,
          });
        }
      }

      return res.json({
        valid: false,
        status: 'NOT_FOUND',
        message: 'Material lot not found in system',
      });
    }

    type ReceivedUnitSummary = { id: number; quantity: number; barcode: string | null; disposition: string } | null;
    const validationResults: {
      valid: boolean;
      status: string;
      message: string;
      warnings: string[];
      errors: string[];
      requiresOverride: boolean;
      lot: typeof lot;
      receivedUnit: ReceivedUnitSummary;
      reservedQty: number;
      availableQty: number;
    } = {
      valid: true,
      status: 'OK',
      message: 'Material lot is valid for use',
      warnings: [],
      errors: [],
      requiresOverride: false,
      lot,
      receivedUnit: null,
      reservedQty: 0,
      availableQty: parseFloat(lot.remainingQty),
    };

    // Check lot status
    if (lot.status !== 'ACCEPTED' && lot.status !== 'ISSUED') {
      validationResults.valid = false;
      validationResults.status = 'INVALID_STATUS';
      validationResults.message = `Material lot status is ${lot.status}. Only ACCEPTED or ISSUED lots can be consumed.`;
      validationResults.errors.push(`Lot status is ${lot.status} - only ACCEPTED or ISSUED lots can be consumed`);
      return res.json(validationResults);
    }

    // Cross-check linked received_unit disposition, expiration, and quantity (Receiving Control Center gate)
    try {
      const ruRows = await db.execute(
        sql`SELECT id, quantity, barcode, disposition, expiration_date FROM received_units WHERE material_lot_id::text = ${String(lot.id)} LIMIT 1`
      ) as { rows?: Array<{ id: number; quantity: number; barcode: string | null; disposition: string; expiration_date: string | null }> } | Array<{ id: number; quantity: number; barcode: string | null; disposition: string; expiration_date: string | null }>;
      const ruArr: Array<{ id: number; quantity: number; barcode: string | null; disposition: string; expiration_date: string | null }> =
        (ruRows && typeof ruRows === 'object' && 'rows' in ruRows)
          ? (ruRows as { rows: Array<{ id: number; quantity: number; barcode: string | null; disposition: string; expiration_date: string | null }> }).rows
          : (ruRows as Array<{ id: number; quantity: number; barcode: string | null; disposition: string; expiration_date: string | null }>);
      if (ruArr.length > 0) {
        const ru = ruArr[0];
        // Expose receivedUnit summary so the scanner can forward receivedUnitId in the consume payload
        validationResults.receivedUnit = { id: ru.id, quantity: Number(ru.quantity), barcode: ru.barcode, disposition: ru.disposition };
        const blockedDispositions = ['pending_inspection', 'quarantine', 'rejected'];
        if (blockedDispositions.includes(ru.disposition)) {
          validationResults.valid = false;
          validationResults.status = 'RECEIVING_DISPOSITION_BLOCKED';
          validationResults.message = `Receiving unit disposition is "${ru.disposition}". Only ACCEPTED units can be consumed.`;
          validationResults.errors.push(`Receiving unit is ${ru.disposition} — not cleared for production use`);
          return res.json(validationResults);
        }
        if (ru.expiration_date) {
          const expDate = new Date(ru.expiration_date);
          if (expDate < new Date()) {
            validationResults.valid = false;
            validationResults.status = 'RECEIVING_UNIT_EXPIRED';
            validationResults.message = `Receiving unit expired on ${expDate.toLocaleDateString()}. Material cannot be used.`;
            validationResults.errors.push(`Receiving unit expired on ${expDate.toLocaleDateString()}`);
            validationResults.requiresOverride = true;
            return res.json(validationResults);
          }
          const daysUntil = Math.floor((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          if (daysUntil <= 30) {
            validationResults.warnings.push(`Receiving unit expires in ${daysUntil} day(s) — ${expDate.toLocaleDateString()}`);
          }
        }
      }
    } catch (_) { /* non-fatal: received_units table may not exist in older deployments */ }

    // Check expiration date
    if (lot.expirationDate) {
      const expDate = new Date(lot.expirationDate);
      const now = new Date();
      if (expDate < now) {
        validationResults.valid = false;
        validationResults.status = 'EXPIRED';
        validationResults.message = `Material lot expired on ${expDate.toLocaleDateString()}. Override required.`;
        validationResults.errors.push(`Material expired on ${expDate.toLocaleDateString()}`);
        validationResults.requiresOverride = true;
        return res.json(validationResults);
      }
      
      // Warn if expiring soon (within 7 days)
      const daysUntilExpiry = Math.floor((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilExpiry <= 7) {
        validationResults.warnings.push(`Material lot expires in ${daysUntilExpiry} days`);
      }
    }

    // Check quantity
    if (qtyNeeded && typeof qtyNeeded === 'string') {
      const needed = parseFloat(qtyNeeded);
      const remaining = parseFloat(lot.remainingQty);
      if (needed > remaining) {
        validationResults.valid = false;
        validationResults.status = 'INSUFFICIENT_QTY';
        validationResults.message = `Insufficient quantity. Need ${needed}, have ${remaining} ${lot.unitOfMeasure}`;
        validationResults.errors.push(`Insufficient quantity: need ${needed}, available ${remaining} ${lot.unitOfMeasure}`);
        return res.json(validationResults);
      }
    }

    // Check out-time limits for time-sensitive materials
    if (lot.maxOutTimeMinutes && lot.maxOutTimeMinutes > 0) {
      const usedPercent = (lot.totalOutTimeMinutes || 0) / lot.maxOutTimeMinutes * 100;
      
      if (usedPercent >= 100) {
        validationResults.valid = false;
        validationResults.status = 'OUT_TIME_EXCEEDED';
        validationResults.message = `Material has exceeded maximum out-time. ${lot.totalOutTimeMinutes} of ${lot.maxOutTimeMinutes} minutes used.`;
        validationResults.errors.push(`Out-time exceeded: ${lot.totalOutTimeMinutes} of ${lot.maxOutTimeMinutes} minutes used`);
        validationResults.requiresOverride = true;
        return res.json(validationResults);
      }
      
      if (usedPercent >= 75) {
        validationResults.warnings.push(`Material is at ${usedPercent.toFixed(1)}% of maximum out-time`);
      }
    }

    // Check part number match if provided
    if (partNumber && typeof partNumber === 'string') {
      if (lot.materialPartNumber !== partNumber) {
        validationResults.warnings.push(`Part number mismatch: Expected ${partNumber}, got ${lot.materialPartNumber}`);
      }
    }

    // Compute reservedQty and availableQty from active reservations
    try {
      const reservedQty = await storage.getReservedQtyForLot(lot.id);
      const remaining = parseFloat(lot.remainingQty);
      const available = Math.max(0, remaining - reservedQty);
      validationResults.reservedQty = reservedQty;
      validationResults.availableQty = available;
      if (reservedQty > 0) {
        validationResults.warnings.push(`${reservedQty} ${lot.unitOfMeasure} already reserved — only ${available} ${lot.unitOfMeasure} available`);
      }
    } catch (_) { /* non-fatal */ }

    res.json(validationResults);
  } catch (error: any) {
    console.error('Error validating material lot:', error);
    res.status(500).json({ error: 'Failed to validate material lot', message: error.message });
  }
});

// Get full transaction history for a material lot
router.get('/:id/history', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const MAX_LIMIT = 500;

    const rawLimit = req.query.limit as string | undefined;
    const rawOffset = req.query.offset as string | undefined;

    const limitParam = rawLimit !== undefined ? Number(rawLimit) : 100;
    const offsetParam = rawOffset !== undefined ? Number(rawOffset) : 0;

    if (!Number.isInteger(limitParam) || limitParam < 1) {
      return res.status(400).json({ error: 'Invalid limit parameter: must be a positive integer' });
    }
    if (limitParam > MAX_LIMIT) {
      return res.status(400).json({ error: `Invalid limit parameter: must not exceed ${MAX_LIMIT}` });
    }
    if (!Number.isInteger(offsetParam) || offsetParam < 0) {
      return res.status(400).json({ error: 'Invalid offset parameter: must be a non-negative integer' });
    }

    const result = await storage.getMaterialLotHistory(id, { limit: limitParam, offset: offsetParam });

    if (result === null) {
      return res.status(404).json({ error: 'Material lot not found' });
    }

    const { events, total } = result;

    const normalizedEvents = events.map(event => ({
      ...event,
      timestamp: event.timestamp != null ? new Date(event.timestamp).toISOString() : null,
    }));

    res.json({
      data: normalizedEvents,
      pagination: {
        total,
        limit: limitParam,
        offset: offsetParam,
        hasMore: offsetParam + limitParam < total,
      },
    });
  } catch (error: any) {
    console.error('Error fetching material lot history:', error);
    res.status(500).json({ error: 'Failed to fetch material lot history', message: error.message });
  }
});

// Get material lot by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const lot = await storage.getMaterialLot(id);

    if (!lot) {
      return res.status(404).json({ error: 'Material lot not found' });
    }
    res.json(lot);
  } catch (error: any) {
    console.error('Error fetching material lot:', error);
    res.status(500).json({ error: 'Failed to fetch material lot', message: error.message });
  }
});

// Create a new material lot (receiving)
router.post('/', async (req: Request, res: Response) => {
  try {
    const validatedData = insertMaterialLotSchema.parse(req.body);
    const lot = await storage.createMaterialLot(validatedData);

    // Create initial transaction record
    await storage.createMaterialLotTransaction(createTransaction({
      materialLotId: lot.id,
      internalControlNumber: lot.internalControlNumber,
      transactionType: 'RECEIVE',
      qtyBefore: '0',
      qtyChange: lot.receivedQty,
      qtyAfter: lot.receivedQty,
      toLocation: lot.storageLocation || undefined,
      performedBy: lot.receivedBy,
      notes: `Initial receiving from ${lot.supplier}. PO: ${lot.purchaseOrderNumber || 'N/A'}`,
    }));

    res.status(201).json(lot);
  } catch (error: any) {
    console.error('Error creating material lot:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }
    res.status(500).json({ error: 'Failed to create material lot', message: error.message });
  }
});

// Update material lot
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existingLot = await storage.getMaterialLot(id);
    
    if (!existingLot) {
      return res.status(404).json({ error: 'Material lot not found' });
    }

    const lot = await storage.updateMaterialLot(id, req.body);
    res.json(lot);
  } catch (error: any) {
    console.error('Error updating material lot:', error);
    res.status(500).json({ error: 'Failed to update material lot', message: error.message });
  }
});

// Change material lot status (accept, reject, quarantine)
router.post('/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { newStatus, performedBy, reason, notes } = req.body;

    const lot = await storage.getMaterialLot(id);
    if (!lot) {
      return res.status(404).json({ error: 'Material lot not found' });
    }

    const validTransitions: Record<string, string[]> = {
      'RECEIVED': ['QUARANTINE', 'ACCEPTED', 'REJECTED'],
      'QUARANTINE': ['ACCEPTED', 'REJECTED'],
      'ACCEPTED': ['ISSUED', 'QUARANTINE', 'REJECTED'],
      'ISSUED': ['ACCEPTED', 'CONSUMED', 'QUARANTINE'],
    };

    if (!validTransitions[lot.status]?.includes(newStatus)) {
      return res.status(400).json({
        error: 'Invalid status transition',
        message: `Cannot transition from ${lot.status} to ${newStatus}`,
      });
    }

    const updateData: Record<string, any> = { status: newStatus };
    
    if (newStatus === 'ACCEPTED') {
      updateData.acceptedBy = performedBy;
      updateData.acceptedAt = new Date();
    }

    const updatedLot = await storage.updateMaterialLot(id, updateData);

    // Record transaction
    await storage.createMaterialLotTransaction(createTransaction({
      materialLotId: id,
      internalControlNumber: lot.internalControlNumber,
      transactionType: newStatus as TransactionType,
      qtyBefore: lot.remainingQty,
      qtyAfter: lot.remainingQty,
      performedBy,
      reason,
      notes,
    }));

    res.json(updatedLot);
  } catch (error: any) {
    console.error('Error changing material lot status:', error);
    res.status(500).json({ error: 'Failed to change status', message: error.message });
  }
});

// Move material to new location
router.post('/:id/move', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { toLocation, performedBy, notes } = req.body;

    const lot = await storage.getMaterialLot(id);
    if (!lot) {
      return res.status(404).json({ error: 'Material lot not found' });
    }

    const fromLocation = lot.storageLocation;
    const updatedLot = await storage.updateMaterialLot(id, { storageLocation: toLocation });

    await storage.createMaterialLotTransaction(createTransaction({
      materialLotId: id,
      internalControlNumber: lot.internalControlNumber,
      transactionType: 'MOVE',
      qtyBefore: lot.remainingQty,
      qtyAfter: lot.remainingQty,
      fromLocation: fromLocation || undefined,
      toLocation,
      performedBy,
      notes,
    }));

    res.json(updatedLot);
  } catch (error: any) {
    console.error('Error moving material lot:', error);
    res.status(500).json({ error: 'Failed to move material lot', message: error.message });
  }
});

// Issue material from storage (start out-time tracking)
router.post('/:id/issue', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { performedBy, toLocation, notes } = req.body;

    const lot = await storage.getMaterialLot(id);
    if (!lot) {
      return res.status(404).json({ error: 'Material lot not found' });
    }

    if (lot.status !== 'ACCEPTED') {
      return res.status(400).json({ error: 'Only ACCEPTED lots can be issued' });
    }

    const updatedLot = await storage.updateMaterialLot(id, {
      status: 'ISSUED',
      currentlyOutOfStorage: true,
      lastOutAt: new Date(),
      storageLocation: toLocation || lot.storageLocation,
    });

    await storage.createMaterialLotTransaction(createTransaction({
      materialLotId: id,
      internalControlNumber: lot.internalControlNumber,
      transactionType: 'ISSUE',
      qtyBefore: lot.remainingQty,
      qtyAfter: lot.remainingQty,
      fromLocation: lot.storageLocation || undefined,
      toLocation,
      performedBy,
      notes,
    }));

    // Also record OUT_START for out-time tracking
    await storage.createMaterialLotTransaction(createTransaction({
      materialLotId: id,
      internalControlNumber: lot.internalControlNumber,
      transactionType: 'OUT_START',
      performedBy,
      notes: 'Material removed from controlled storage',
    }));

    res.json(updatedLot);
  } catch (error: any) {
    console.error('Error issuing material lot:', error);
    res.status(500).json({ error: 'Failed to issue material lot', message: error.message });
  }
});

// Return unused issued material to inventory stock
const returnSchema = z.object({
  qty: z.number().positive('qty must be a positive number'),
  reason: z.string().min(1, 'reason is required'),
  performedBy: z.string().min(1, 'performedBy is required'),
});

router.post('/:id/return', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const parseResult = returnSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation error',
        details: parseResult.error.errors,
      });
    }

    const { qty, reason, performedBy } = parseResult.data;

    const lot = await storage.getMaterialLot(id);
    if (!lot) {
      return res.status(404).json({ error: 'Material lot not found' });
    }

    const blockedStatuses: MaterialLotStatus[] = ['SCRAPPED', 'CONSUMED'];
    if (blockedStatuses.includes(lot.status as MaterialLotStatus)) {
      return res.status(400).json({
        error: 'INVALID_LOT_STATUS',
        message: `Cannot return a lot with status ${lot.status}`,
      });
    }

    const result = await storage.returnMaterialLot(id, { qty, reason, performedBy });

    res.json(result);
  } catch (error: any) {
    console.error('Error returning material lot:', error);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ error: 'Failed to return material lot', message: error.message });
  }
});

// Scrap material lot (partial or full)
const scrapBodySchema = z.object({
  qty: z.number().positive('qty must be a positive number'),
  reason: z.string().min(1, 'reason is required'),
  performedBy: z.string().min(1, 'performedBy is required'),
});

router.post('/:id/scrap', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const parsed = scrapBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation error', details: parsed.error.errors });
    }

    const { qty, reason, performedBy } = parsed.data;

    const lot = await storage.getMaterialLot(id);
    if (!lot) {
      return res.status(404).json({ error: 'Material lot not found' });
    }

    const remaining = parseFloat(lot.remainingQty);

    if (lot.status === 'SCRAPPED' || remaining <= 0) {
      return res.status(400).json({
        error: 'LOT_NOT_SCRAPPABLE',
        message: `Lot cannot be scrapped — current status is ${lot.status} with ${remaining} remaining`,
      });
    }

    if (qty > remaining) {
      return res.status(400).json({
        error: 'EXCESS_SCRAP_QTY',
        message: `Scrap quantity ${qty} exceeds remaining quantity ${remaining} ${lot.unitOfMeasure}`,
        remaining,
        requested: qty,
      });
    }

    const result = await storage.scrapMaterialLot(id, { qty, reason, performedBy });

    res.json({
      lot: result.lot,
      transaction: result.transaction,
    });
  } catch (error: any) {
    console.error('Error scrapping material lot:', error);
    const statusCode = [400, 404, 409].includes(error.statusCode) ? error.statusCode : 500;
    res.status(statusCode).json({ error: 'Failed to scrap material lot', message: error.message });
  }
});

// Adjust material lot quantity (cycle count correction)
const adjustBodySchema = z.object({
  delta: z.number({ required_error: 'delta is required' }).refine(v => v !== 0, { message: 'delta must be non-zero' }),
  reasonCode: z.string().min(1, 'reasonCode is required'),
  notes: z.string().optional(),
  performedBy: z.string().min(1, 'performedBy is required'),
  allowNegative: z.boolean().optional().default(false),
});

router.post('/:id/adjust', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const parsed = adjustBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation error', details: parsed.error.errors });
    }

    const { delta, reasonCode, notes, performedBy, allowNegative } = parsed.data;

    const lot = await storage.getMaterialLot(id);
    if (!lot) {
      return res.status(404).json({ error: 'Material lot not found' });
    }

    const remaining = parseFloat(lot.remainingQty);
    if (remaining + delta < 0 && !allowNegative) {
      return res.status(400).json({
        error: 'NEGATIVE_QTY',
        message: `Adjustment of ${delta} would drive remainingQty to ${remaining + delta} (below zero). Set allowNegative: true to override.`,
        remainingQty: remaining,
        delta,
        projectedQty: remaining + delta,
      });
    }

    const result = await storage.adjustMaterialLot(id, { delta, reasonCode, notes, performedBy, allowNegative });

    res.json({
      lot: result.lot,
      transaction: result.transaction,
    });
  } catch (error: any) {
    console.error('Error adjusting material lot:', error);
    const statusCode = [400, 404, 409].includes(error.statusCode) ? error.statusCode : 500;
    res.status(statusCode).json({ error: 'Failed to adjust material lot', message: error.message });
  }
});

// Split material lot
router.post('/:id/split', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { splitQty, performedBy, notes, newLocation } = req.body;

    const parentLot = await storage.getMaterialLot(id);
    if (!parentLot) {
      return res.status(404).json({ error: 'Material lot not found' });
    }

    const parentRemaining = parseFloat(parentLot.remainingQty);
    const splitAmount = parseFloat(splitQty);

    if (splitAmount >= parentRemaining || splitAmount <= 0) {
      return res.status(400).json({
        error: 'Invalid split quantity',
        message: `Split quantity must be between 0 and ${parentRemaining}`,
      });
    }

    // Generate new ICN for child lot
    const newICN = await storage.generateNextICN();
    const newRemaining = (parentRemaining - splitAmount).toString();

    // Create child lot
    const childLot = await storage.createMaterialLot({
      inventoryItemId: parentLot.inventoryItemId,
      materialPartNumber: parentLot.materialPartNumber,
      materialName: parentLot.materialName,
      internalControlNumber: newICN,
      supplier: parentLot.supplier,
      supplierLotNumber: parentLot.supplierLotNumber,
      supplierPartNumber: parentLot.supplierPartNumber,
      purchaseOrderNumber: parentLot.purchaseOrderNumber,
      receivingRecordNumber: parentLot.receivingRecordNumber,
      receivedQty: splitQty.toString(),
      remainingQty: splitQty.toString(),
      unitOfMeasure: parentLot.unitOfMeasure,
      expirationDate: parentLot.expirationDate,
      cureDate: parentLot.cureDate,
      manufactureDate: parentLot.manufactureDate,
      storageLocation: newLocation || parentLot.storageLocation,
      storageRequirements: parentLot.storageRequirements,
      status: parentLot.status as 'RECEIVED' | 'ACCEPTED' | 'ISSUED' | 'EXPIRED' | 'QUARANTINE' | 'REJECTED' | 'CONSUMED' | 'SCRAPPED',
      totalOutTimeMinutes: parentLot.totalOutTimeMinutes ?? 0,
      maxOutTimeMinutes: parentLot.maxOutTimeMinutes,
      currentlyOutOfStorage: parentLot.currentlyOutOfStorage ?? false,
      parentLotId: id,
      receivedBy: performedBy,
    });

    // Update parent lot quantity
    await storage.updateMaterialLot(id, { remainingQty: newRemaining });

    // Record transactions
    await storage.createMaterialLotTransaction(createTransaction({
      materialLotId: id,
      internalControlNumber: parentLot.internalControlNumber,
      transactionType: 'SPLIT',
      qtyBefore: parentLot.remainingQty,
      qtyChange: (-splitAmount).toString(),
      qtyAfter: newRemaining,
      performedBy,
      notes: `Split ${splitAmount} ${parentLot.unitOfMeasure} to new lot ${newICN}. ${notes || ''}`,
    }));

    await storage.createMaterialLotTransaction(createTransaction({
      materialLotId: childLot.id,
      internalControlNumber: newICN,
      transactionType: 'RECEIVE',
      qtyBefore: '0',
      qtyChange: splitQty.toString(),
      qtyAfter: splitQty.toString(),
      performedBy,
      notes: `Split from parent lot ${parentLot.internalControlNumber}. ${notes || ''}`,
    }));

    res.status(201).json({
      parentLot: { ...parentLot, remainingQty: newRemaining },
      childLot,
    });
  } catch (error: any) {
    console.error('Error splitting material lot:', error);
    res.status(500).json({ error: 'Failed to split material lot', message: error.message });
  }
});

// Get transaction history for a lot
router.get('/:id/transactions', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const lot = await storage.getMaterialLot(id);
    
    if (!lot) {
      return res.status(404).json({ error: 'Material lot not found' });
    }

    const transactions = await storage.getMaterialLotTransactions(id);
    res.json(transactions);
  } catch (error: any) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions', message: error.message });
  }
});

// Record material consumption for a traveler step
router.post('/consume', async (req: Request, res: Response) => {
  try {
    const validatedData = insertTravelerMaterialConsumptionSchema.parse(req.body);

    // Get the lot and verify it
    const lot = await storage.getMaterialLot(validatedData.materialLotId);
    if (!lot) {
      return res.status(404).json({ error: 'Material lot not found' });
    }

    // ── Guard 1: Lot status ────────────────────────────────────────────────────
    const blockedStatuses: MaterialLotStatus[] = ['QUARANTINE', 'REJECTED', 'EXPIRED'];
    if (blockedStatuses.includes(lot.status as MaterialLotStatus)) {
      return res.status(400).json({
        error: 'LOT_NOT_USABLE',
        message: `Lot cannot be consumed — current status is ${lot.status}`,
        status: lot.status,
      });
    }

    // ── Guard 2: Expiration date ───────────────────────────────────────────────
    if (lot.expirationDate && new Date(lot.expirationDate) < new Date()) {
      return res.status(400).json({
        error: 'LOT_EXPIRED',
        message: `Lot expired on ${new Date(lot.expirationDate).toISOString()}`,
        expirationDate: lot.expirationDate,
      });
    }

    const remaining = parseFloat(lot.remainingQty);
    const consumed = parseFloat(validatedData.qtyUsed);

    // Enforce available qty (remaining minus active reservations).
    // The consuming traveler may draw against their own reservation — only
    // reservations held by OTHER travelers reduce the available quantity.
    const reservedQty = await storage.getReservedQtyForLot(lot.id).catch(() => 0);
    const availableQty = Math.max(0, remaining - reservedQty); // for external callers

    let effectiveAvailableQty = availableQty;
    if (validatedData.travelerId) {
      // Re-compute excluding this traveler's own reservations
      let ownReserved = 0;
      try {
        const allRes = await storage.getLotReservations(lot.id);
        ownReserved = allRes
          .filter(r => r.status === 'active' && r.travelerId === validatedData.travelerId)
          .reduce((s, r) => s + parseFloat(String(r.quantityReserved)), 0);
      } catch (_) { /* non-fatal */ }
      effectiveAvailableQty = Math.max(0, remaining - (reservedQty - ownReserved));
    }

    if (consumed > remaining) {
      return res.status(400).json({
        error: 'INSUFFICIENT_LOT_QTY',
        message: `Only ${remaining} ${lot.unitOfMeasure} remain on this lot`,
        remaining,
        reservedQty,
        availableQty,
      });
    }

    if (consumed > effectiveAvailableQty) {
      return res.status(409).json({
        error: 'OVER_COMMITTED',
        message: `Lot over-committed — only ${effectiveAvailableQty} ${lot.unitOfMeasure} available (${remaining} remaining, ${reservedQty} reserved by all work orders)`,
        remaining,
        reservedQty,
        availableQty: effectiveAvailableQty,
        requested: consumed,
      });
    }

    // ── Received unit integration (Phase 2) ───────────────────────────────────
    // Resolve the physical receiving unit linked to this lot.
    // Priority: (1) caller-supplied receivedUnitId, (2) auto-lookup by material_lot_id.
    type RuRow = { id: number; quantity: number; barcode: string | null };
    let resolvedRuId: number | null = validatedData.receivedUnitId ?? null;
    let resolvedRuQty: number | null = null;

    try {
      let ruRow: RuRow | null = null;

      if (resolvedRuId !== null) {
        // Caller supplied the id — verify it and fetch current quantity
        const rows = await db.execute(
          sql`SELECT id, quantity, barcode FROM received_units WHERE id = ${resolvedRuId} LIMIT 1`
        ) as { rows?: RuRow[] } | RuRow[];
        const arr: RuRow[] = (rows && 'rows' in rows) ? (rows as { rows: RuRow[] }).rows : (rows as RuRow[]);
        ruRow = arr[0] ?? null;
      } else {
        // Auto-discover by material_lot_id FK
        const rows = await db.execute(
          sql`SELECT id, quantity, barcode FROM received_units WHERE material_lot_id::text = ${String(lot.id)} LIMIT 1`
        ) as { rows?: RuRow[] } | RuRow[];
        const arr: RuRow[] = (rows && 'rows' in rows) ? (rows as { rows: RuRow[] }).rows : (rows as RuRow[]);
        ruRow = arr[0] ?? null;
        if (ruRow) resolvedRuId = ruRow.id;
      }

      if (ruRow) {
        resolvedRuQty = Number(ruRow.quantity);
        // Hard gate: physical unit must have enough remaining quantity
        if (consumed > resolvedRuQty) {
          return res.status(409).json({
            error: 'INSUFFICIENT_PHYSICAL_QTY',
            message: `Physical receiving unit only has ${resolvedRuQty} ${lot.unitOfMeasure} remaining. Cannot consume ${consumed}.`,
            receivedUnitId: ruRow.id,
            available: resolvedRuQty,
            requested: consumed,
          });
        }
      }
    } catch (ruErr: any) {
      // Non-fatal: received_units table may not exist in older deployments
      // Log the error but allow consumption to proceed without unit linkage
      console.warn('[consume] received_unit lookup failed (non-fatal):', ruErr.message);
      resolvedRuId = null;
    }

    // Build insertion data with receivedUnitId linkage
    const consumptionData = resolvedRuId !== null
      ? { ...validatedData, receivedUnitId: resolvedRuId }
      : validatedData;

    // Computed values needed inside and outside the transaction
    const newRemaining = (remaining - consumed).toString();
    const newStatus: MaterialLotStatus = parseFloat(newRemaining) <= 0 ? 'CONSUMED' : lot.status as MaterialLotStatus;
    const lotTxNotes = `Consumed for traveler step ${validatedData.travelerStepId}${resolvedRuId ? ` (received_unit #${resolvedRuId})` : ''}`;

    // ── Atomic transaction: all six writes succeed or fail together ─────────
    const { consumption, fulfilledReservationId, reservationUpdatedId } = await db.transaction(async (tx) => {

      // 1. Consumption record
      const [consumption] = await tx
        .insert(travelerMaterialConsumption)
        .values(consumptionData)
        .returning();

      // 2. Update lot remaining qty and status
      await tx
        .update(materialLots)
        .set({ remainingQty: newRemaining, status: newStatus, updatedAt: new Date() })
        .where(eq(materialLots.id, lot.id));

      // 3. Lot ISSUE transaction
      await tx.insert(materialLotTransactions).values(createTransaction({
        materialLotId: lot.id,
        internalControlNumber: lot.internalControlNumber,
        transactionType: 'ISSUE',
        qtyBefore: lot.remainingQty,
        qtyChange: (-consumed).toString(),
        qtyAfter: newRemaining,
        referenceType: 'TRAVELER',
        referenceId: validatedData.travelerId,
        performedBy: validatedData.scannedBy,
        notes: lotTxNotes,
      }));

      // 4. Reservation update — partial or full fulfillment
      // Track how much of the consumed qty comes from the reservation (may be
      // less than consumed if the traveler is also drawing unreserved stock).
      let reservationUpdatedId: number | null = null;
      let fulfilledReservationId: number | null = null;
      let reservedPortionConsumed = 0;
      if (validatedData.travelerId) {
        const activeReservations = await tx
          .select()
          .from(materialLotReservations)
          .where(
            and(
              eq(materialLotReservations.materialLotId, lot.id),
              eq(materialLotReservations.status, 'active'),
              eq(materialLotReservations.travelerId, validatedData.travelerId)
            )
          )
          .limit(1);
        const match = activeReservations[0] ?? null;
        if (match) {
          const reservedQtyMatch = parseFloat(String(match.quantityReserved));
          // The reserved portion consumed is at most the full reservation amount
          reservedPortionConsumed = Math.min(consumed, reservedQtyMatch);
          reservationUpdatedId = match.id;
          if (consumed >= reservedQtyMatch) {
            // Full fulfillment — reservation is fully consumed
            await tx
              .update(materialLotReservations)
              .set({ status: 'fulfilled', updatedAt: new Date() })
              .where(eq(materialLotReservations.id, match.id));
            fulfilledReservationId = match.id;
          } else {
            // Partial — reduce reserved qty only by what was consumed, keep active
            const newReservedQty = (reservedQtyMatch - consumed).toString();
            await tx
              .update(materialLotReservations)
              .set({ quantityReserved: newReservedQty, updatedAt: new Date() })
              .where(eq(materialLotReservations.id, match.id));
          }
        }
      }

      // 5. Inventory transaction (consumption type, negative qty)
      await tx.insert(inventoryTransactions).values({
        agPartNumber: lot.materialPartNumber,
        transactionType: 'consumption',
        quantity: -consumed,
        unitOfMeasure: lot.unitOfMeasure,
        referenceType: 'TRAVELER',
        referenceId: validatedData.travelerId ?? null,
        performedBy: validatedData.scannedBy,
      });

      // 6. Inventory balance update
      // quantityAllocated decrements only by the reserved portion that was consumed
      // (not by the full consumed amount, which may include unreserved stock).
      const [balance] = await tx
        .select()
        .from(inventoryBalances)
        .where(eq(inventoryBalances.agPartNumber, lot.materialPartNumber))
        .limit(1);
      if (balance) {
        const newOnHand = Math.max(0, balance.quantityOnHand - consumed);
        const newAllocated = reservationUpdatedId !== null
          ? Math.max(0, balance.quantityAllocated - reservedPortionConsumed)
          : balance.quantityAllocated;
        const newAvailable = Math.max(0, newOnHand - newAllocated);
        await tx
          .update(inventoryBalances)
          .set({ quantityOnHand: newOnHand, quantityAllocated: newAllocated, quantityAvailable: newAvailable, updatedAt: new Date() })
          .where(eq(inventoryBalances.id, balance.id));
      }

      return { consumption, fulfilledReservationId, reservationUpdatedId };
    });

    // Decrement physical received_unit quantity (best-effort, outside transaction)
    if (resolvedRuId !== null) {
      try {
        await db.execute(
          sql`UPDATE received_units SET quantity = GREATEST(0, quantity - ${consumed}) WHERE id = ${resolvedRuId}`
        );
      } catch (decrErr: any) {
        console.warn('[consume] received_unit quantity decrement failed (non-fatal):', decrErr.message);
      }
    }

    res.status(201).json({
      consumption,
      updatedLot: { ...lot, remainingQty: newRemaining, status: newStatus },
      receivedUnitId: resolvedRuId,
      fulfilledReservationId,
      reservationUpdatedId,
    });
  } catch (error: any) {
    console.error('Error recording consumption:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors,
      });
    }
    res.status(500).json({ error: 'Failed to record consumption', message: error.message });
  }
});

// Get consumption records for a traveler
router.get('/consumption/traveler/:travelerId', async (req: Request, res: Response) => {
  try {
    const { travelerId } = req.params;
    const consumptions = await storage.getTravelerMaterialConsumption(travelerId);
    res.json(consumptions);
  } catch (error: any) {
    console.error('Error fetching traveler consumption:', error);
    res.status(500).json({ error: 'Failed to fetch consumption records', message: error.message });
  }
});

// Get consumption records for a traveler step
router.get('/consumption/step/:stepId', async (req: Request, res: Response) => {
  try {
    const { stepId } = req.params;
    const consumptions = await storage.getTravelerStepMaterialConsumption(stepId);
    res.json(consumptions);
  } catch (error: any) {
    console.error('Error fetching step consumption:', error);
    res.status(500).json({ error: 'Failed to fetch consumption records', message: error.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// RESERVATION ENDPOINTS (Phase 2B)
// ──────────────────────────────────────────────────────────────────────────────

// GET /lots/:lotId/reservations — list all reservations for a lot
router.get('/:lotId/reservations', async (req: Request, res: Response) => {
  try {
    const { lotId } = req.params;
    const lot = await storage.getMaterialLot(lotId);
    if (!lot) return res.status(404).json({ error: 'Material lot not found' });

    const reservations = await storage.getLotReservations(lotId);
    const reservedQty = await storage.getReservedQtyForLot(lotId);
    const availableQty = Math.max(0, parseFloat(lot.remainingQty) - reservedQty);

    res.json({ reservations, reservedQty, availableQty, remaining: parseFloat(lot.remainingQty) });
  } catch (error: any) {
    console.error('Error fetching lot reservations:', error);
    res.status(500).json({ error: 'Failed to fetch reservations', message: error.message });
  }
});

// POST /lots/:lotId/reserve — create a reservation
router.post('/:lotId/reserve', async (req: Request, res: Response) => {
  try {
    const { lotId } = req.params;
    const lot = await storage.getMaterialLot(lotId);
    if (!lot) return res.status(404).json({ error: 'Material lot not found' });

    if (lot.status !== 'ACCEPTED' && lot.status !== 'ISSUED') {
      return res.status(409).json({
        error: 'LOT_NOT_AVAILABLE',
        message: `Lot status is ${lot.status} — only ACCEPTED or ISSUED lots can be reserved`,
      });
    }

    const body = insertMaterialLotReservationSchema.parse({
      ...req.body,
      materialLotId: lotId,
      unitOfMeasure: req.body.unitOfMeasure ?? lot.unitOfMeasure,
      quantityReserved: String(req.body.quantityReserved),
    });

    const quantityRequested = parseFloat(String(body.quantityReserved));
    const remaining = parseFloat(lot.remainingQty);
    const reservedQty = await storage.getReservedQtyForLot(lotId);
    const availableQty = Math.max(0, remaining - reservedQty);

    if (quantityRequested > availableQty) {
      return res.status(409).json({
        error: 'OVER_COMMITTED',
        message: `Cannot reserve ${quantityRequested} ${lot.unitOfMeasure} — only ${availableQty} available (${remaining} remaining, ${reservedQty} already reserved)`,
        remaining,
        reservedQty,
        availableQty,
        requested: quantityRequested,
      });
    }

    const reservation = await storage.createLotReservation(body);

    // ── Allocation requirements staging hook ──────────────────────────────────
    // After inserting a materialLotReservation, increment stagedQty on the
    // best-matching allocationRequirements row when a queueId is provided.
    // Matching priority: explicit requirementId > part number match > first OPEN row.
    // Best-effort, non-blocking.
    const reqQueueId = req.body.queueId ? parseInt(String(req.body.queueId), 10) : null;
    const reqRequirementId: string | null = req.body.requirementId ?? null;
    if (reqQueueId && !isNaN(reqQueueId)) {
      try {
        // Fetch all requirements for this queue item
        const reqs = await db
          .select()
          .from(allocationRequirements)
          .where(eq(allocationRequirements.manufacturingQueueId, reqQueueId));

        let targetReq = reqs.find(r => reqRequirementId && r.id === reqRequirementId);
        if (!targetReq) {
          // Match by part number — lot.materialPartNumber against requirement.requiredPartNumber
          targetReq = reqs.find(r => r.requiredPartNumber === lot.materialPartNumber);
        }
        if (!targetReq) {
          // Fallback: first OPEN requirement
          targetReq = reqs.find(r => r.allocationStatus === 'OPEN');
        }

        if (targetReq) {
          await db
            .update(allocationRequirements)
            .set({
              stagedQty: sql`COALESCE(${allocationRequirements.stagedQty}, 0) + ${quantityRequested}`,
              materialLotId: lotId,
              materialLotReservationId: reservation.id,
              updatedAt: new Date(),
            })
            .where(eq(allocationRequirements.id, targetReq.id));
        }

        await evaluateQueueReadiness(reqQueueId);
      } catch (hookErr: any) {
        console.warn('[reserve] allocation requirements staging hook failed (non-fatal):', hookErr.message);
      }
    }

    res.status(201).json({ reservation, remaining, reservedQty: reservedQty + quantityRequested, availableQty: availableQty - quantityRequested });
  } catch (error: any) {
    console.error('Error creating reservation:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create reservation', message: error.message });
  }
});

// DELETE /lots/:lotId/reservations/:reservationId — cancel a reservation
router.delete('/:lotId/reservations/:reservationId', async (req: Request, res: Response) => {
  try {
    const { lotId, reservationId } = req.params;
    const lot = await storage.getMaterialLot(lotId);
    if (!lot) return res.status(404).json({ error: 'Material lot not found' });

    const id = parseInt(reservationId, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid reservation ID' });

    const reservation = await storage.getLotReservation(id);
    if (!reservation) return res.status(404).json({ error: 'Reservation not found' });
    if (reservation.materialLotId !== lotId) return res.status(403).json({ error: 'Reservation does not belong to this lot' });
    if (reservation.status !== 'active') return res.status(409).json({ error: 'Reservation is already ' + reservation.status });

    const cancelled = await storage.cancelLotReservation(id);
    res.json({ reservation: cancelled });
  } catch (error: any) {
    console.error('Error cancelling reservation:', error);
    res.status(500).json({ error: 'Failed to cancel reservation', message: error.message });
  }
});

export default router;
