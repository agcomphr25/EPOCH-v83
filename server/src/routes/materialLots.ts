import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { storage } from '../../storage';
import {
  insertMaterialLotSchema,
  insertMaterialLotTransactionSchema,
  insertTravelerMaterialConsumptionSchema,
  type InsertMaterialLotTransaction,
  cuttingBuiltPackets,
  cuttingBuiltPacketFabricSources,
  cuttingFabricInventory,
} from '../../schema';
import { db } from '../../db';
import { eq } from 'drizzle-orm';

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

      return res.json({
        valid: false,
        status: 'NOT_FOUND',
        message: 'Material lot not found in system',
      });
    }

    const validationResults: {
      valid: boolean;
      status: string;
      message: string;
      warnings: string[];
      errors: string[];
      requiresOverride: boolean;
      lot: typeof lot;
    } = {
      valid: true,
      status: 'OK',
      message: 'Material lot is valid for use',
      warnings: [],
      errors: [],
      requiresOverride: false,
      lot,
    };

    // Check lot status
    if (lot.status !== 'ACCEPTED' && lot.status !== 'ISSUED') {
      validationResults.valid = false;
      validationResults.status = 'INVALID_STATUS';
      validationResults.message = `Material lot status is ${lot.status}. Only ACCEPTED or ISSUED lots can be consumed.`;
      validationResults.errors.push(`Lot status is ${lot.status} - only ACCEPTED or ISSUED lots can be consumed`);
      return res.json(validationResults);
    }

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

    res.json(validationResults);
  } catch (error: any) {
    console.error('Error validating material lot:', error);
    res.status(500).json({ error: 'Failed to validate material lot', message: error.message });
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

// Return material to storage (end out-time tracking)
router.post('/:id/return', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { performedBy, toLocation, notes } = req.body;

    const lot = await storage.getMaterialLot(id);
    if (!lot) {
      return res.status(404).json({ error: 'Material lot not found' });
    }

    if (!lot.currentlyOutOfStorage) {
      return res.status(400).json({ error: 'Material is not currently out of storage' });
    }

    // Calculate out-time duration
    let additionalOutTime = 0;
    if (lot.lastOutAt) {
      const now = new Date();
      const outAt = new Date(lot.lastOutAt);
      additionalOutTime = Math.floor((now.getTime() - outAt.getTime()) / (1000 * 60));
    }

    const newTotalOutTime = (lot.totalOutTimeMinutes || 0) + additionalOutTime;

    const updatedLot = await storage.updateMaterialLot(id, {
      status: 'ACCEPTED',
      currentlyOutOfStorage: false,
      totalOutTimeMinutes: newTotalOutTime,
      storageLocation: toLocation || lot.storageLocation,
    });

    await storage.createMaterialLotTransaction(createTransaction({
      materialLotId: id,
      internalControlNumber: lot.internalControlNumber,
      transactionType: 'OUT_END',
      performedBy,
      notes: `Returned to storage. Out for ${additionalOutTime} minutes. Total out-time: ${newTotalOutTime} minutes`,
    }));

    await storage.createMaterialLotTransaction(createTransaction({
      materialLotId: id,
      internalControlNumber: lot.internalControlNumber,
      transactionType: 'RETURN',
      qtyBefore: lot.remainingQty,
      qtyAfter: lot.remainingQty,
      fromLocation: lot.storageLocation || undefined,
      toLocation: toLocation || lot.storageLocation,
      performedBy,
      notes,
    }));

    res.json(updatedLot);
  } catch (error: any) {
    console.error('Error returning material lot:', error);
    res.status(500).json({ error: 'Failed to return material lot', message: error.message });
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

    const remaining = parseFloat(lot.remainingQty);
    const consumed = parseFloat(validatedData.qtyUsed);

    if (consumed > remaining) {
      return res.status(400).json({
        error: 'Insufficient quantity',
        message: `Only ${remaining} ${lot.unitOfMeasure} available`,
      });
    }

    // Create consumption record
    const consumption = await storage.createTravelerMaterialConsumption(validatedData);

    // Update lot quantity
    const newRemaining = (remaining - consumed).toString();
    const newStatus: MaterialLotStatus = parseFloat(newRemaining) <= 0 ? 'CONSUMED' : lot.status as MaterialLotStatus;
    
    await storage.updateMaterialLot(lot.id, {
      remainingQty: newRemaining,
      status: newStatus,
    });

    // Record transaction
    await storage.createMaterialLotTransaction(createTransaction({
      materialLotId: lot.id,
      internalControlNumber: lot.internalControlNumber,
      transactionType: 'ISSUE',
      qtyBefore: lot.remainingQty,
      qtyChange: (-consumed).toString(),
      qtyAfter: newRemaining,
      referenceType: 'TRAVELER',
      referenceId: validatedData.travelerId,
      performedBy: validatedData.scannedBy,
      notes: `Consumed for traveler step ${validatedData.travelerStepId}`,
    }));

    res.status(201).json({
      consumption,
      updatedLot: { ...lot, remainingQty: newRemaining, status: newStatus },
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

export default router;
