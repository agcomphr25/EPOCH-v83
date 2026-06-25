import express, { Request, Response } from 'express';
import { storage } from '../../storage';
import { db } from '../../db';
import { manufacturingQueue, inventoryItems, p2ProductionOrders, p2PurchaseOrders, cuttingPacketBOMs, cuttingPacketBOMMaterials, cuttingPacketBOMParts, cuttingFabricInventory, cuttingFabricInventoryTransactions, cuttingBuiltPackets, cuttingBuiltPacketFabricSources, cuttingProductCategories, getDashboardCategories, supplySourceDashboardToLegacyDept } from '../../schema';
import { eq, and, or, asc, desc, inArray, like, count } from 'drizzle-orm';
import { adjustPacketInventoryItem } from '../utils/p1PacketInventory';

const router = express.Router();

function parseFabricStockQuantity(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function nonZeroInventoryDelta(quantity: number): number {
  if (quantity === 0) return 0;
  const magnitude = Math.max(1, Math.round(Math.abs(quantity)));
  return quantity < 0 ? -magnitude : magnitude;
}

function parseQueueIdFromBuiltPacketBarcode(barcode: string | null | undefined): number | null {
  const parsed = parseBuiltPacketBarcode(barcode);
  return parsed?.queueId ?? null;
}

function parseBuiltPacketBarcode(barcode: string | null | undefined): { sku: string; queueId: number; packetNumber: number } | null {
  if (!barcode) return null;
  const parts = barcode.split('-');
  if (parts.length < 5 || parts[0] !== 'PKT') return null;

  const maybeRepairIndex = parts[parts.length - 1];
  const maybeTimestamp = parts[parts.length - 2];
  const hasRepairIndex = /^\d+$/.test(maybeRepairIndex) && /^\d{10,}$/.test(maybeTimestamp);
  const queueIndex = hasRepairIndex ? parts.length - 4 : parts.length - 3;
  const packetNumberIndex = hasRepairIndex ? parts.length - 3 : parts.length - 2;

  const queueId = Number(parts[queueIndex]);
  const packetNumber = Number(parts[packetNumberIndex]);
  const sku = parts.slice(1, queueIndex).join('-');

  if (!sku || !Number.isInteger(queueId) || !Number.isInteger(packetNumber)) return null;
  return { sku, queueId, packetNumber };
}

function parseManufacturingPacketBarcode(barcode: string | null | undefined): { queueId: number; sku: string; sequence: number | null; builtPacketBarcode?: string } | null {
  if (!barcode) return null;
  const trimmed = barcode.trim();
  const builtPacket = parseBuiltPacketBarcode(trimmed);
  if (builtPacket) {
    return {
      queueId: builtPacket.queueId,
      sku: builtPacket.sku,
      sequence: builtPacket.packetNumber,
      builtPacketBarcode: trimmed,
    };
  }

  const parts = trimmed.split('-');
  if (parts.length < 3 || parts[0] !== 'MFG') return null;

  const queueId = Number(parts[1]);
  if (!Number.isInteger(queueId)) return null;

  const maybeSequence = parts[parts.length - 1];
  const hasSequence = parts.length > 3 && /^\d+$/.test(maybeSequence);
  const skuParts = hasSequence ? parts.slice(2, -1) : parts.slice(2);
  const sku = skuParts.join('-').trim();

  if (!sku) return null;
  return {
    queueId,
    sku,
    sequence: hasSequence ? Number(maybeSequence) : null,
  };
}

function parseQueueNotes(notes: string | null): Record<string, any> {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return { rawNotes: notes };
  }
}

function isP1PacketInventoryQueueItem(notes: Record<string, any>): boolean {
  const source = String(notes.source || '').toUpperCase();
  const materialType = String(notes.materialType || '').toLowerCase();
  return notes.isP2Packet !== true
    && source !== 'P2'
    && source !== 'P2_SYNC'
    && !materialType.startsWith('p2_');
}

type QueueBomMatch = {
  bom: any | null;
  reason: 'notes_bom_id' | 'inventory_item' | 'part_number' | 'material_type' | 'packet_name' | 'item_name' | null;
  confidence: 'strong' | 'medium' | 'fallback' | 'none';
};

function resolveQueueBomMatch(params: {
  allActiveBoms: Array<{ id: string; partNumber: string; inventoryItemId: number | null; packetType?: string | null }>;
  bomId?: string | null;
  inventoryItemId?: number | null;
  itemPartNumber?: string | null;
  materialType?: string | null;
  packetName?: string | null;
  itemName?: string | null;
}): QueueBomMatch {
  const { allActiveBoms, bomId, inventoryItemId, itemPartNumber, materialType, packetName, itemName } = params;

  const byBomId = bomId ? allActiveBoms.find((b) => b.id === bomId) : null;
  if (byBomId) return { bom: byBomId, reason: 'notes_bom_id', confidence: 'strong' };

  const byInventoryItem = inventoryItemId
    ? allActiveBoms.find((b) => b.inventoryItemId != null && b.inventoryItemId === inventoryItemId)
    : null;
  if (byInventoryItem) return { bom: byInventoryItem, reason: 'inventory_item', confidence: 'strong' };

  const byPartNumber = itemPartNumber ? allActiveBoms.find((b) => b.partNumber === itemPartNumber) : null;
  if (byPartNumber) return { bom: byPartNumber, reason: 'part_number', confidence: 'medium' };

  const materialToPacketType: Record<string, string> = {
    carbon_fiber: 'carbon fiber packet',
    fiberglass: 'fiberglass packet',
    mesa: 'mesa packet',
    p2_disruptor: 'disruptor',
    p2_disruptor_packet: 'disruptor packet',
    p2_antenna: 'antenna cover',
    p2_antenna_cover: 'antenna cover packet',
  };

  const materialTarget = materialType ? materialToPacketType[materialType] : null;
  const byMaterialType = materialTarget
    ? allActiveBoms.find((b) => {
        const packetType = String(b.packetType || '').toLowerCase();
        return packetType === materialTarget || packetType.includes(materialTarget) || materialTarget.includes(packetType);
      })
    : null;
  if (byMaterialType) return { bom: byMaterialType, reason: 'material_type', confidence: 'fallback' };

  const normalizedPacketName = packetName ? packetName.toLowerCase() : null;
  const byPacketName = normalizedPacketName
    ? allActiveBoms.find((b) => {
        const packetType = String(b.packetType || '').toLowerCase();
        return packetType === normalizedPacketName || packetType.includes(normalizedPacketName) || normalizedPacketName.includes(packetType);
      })
    : null;
  if (byPacketName) return { bom: byPacketName, reason: 'packet_name', confidence: 'fallback' };

  const normalizedItemName = itemName ? itemName.toLowerCase() : null;
  const byItemName = normalizedItemName
    ? allActiveBoms.find((b) => {
        const packetType = String(b.packetType || '').toLowerCase();
        return packetType === normalizedItemName || packetType.includes(normalizedItemName) || normalizedItemName.includes(packetType);
      })
    : null;
  if (byItemName) return { bom: byItemName, reason: 'item_name', confidence: 'fallback' };

  return { bom: null, reason: null, confidence: 'none' };
}

async function ensureBuiltPacketsForCompletedQueueRows(): Promise<void> {
  const cuttingTableDept = supplySourceDashboardToLegacyDept('CUTTING_TABLE')!;
  const cuttingTableCategories = getDashboardCategories('CUTTING_TABLE');
  const routingSignal = or(
    eq(manufacturingQueue.department, cuttingTableDept),
    inArray(inventoryItems.manufacturedCategory, cuttingTableCategories)
  );

  const completedRows = await db
    .select({
      queue: manufacturingQueue,
      item: inventoryItems,
    })
    .from(manufacturingQueue)
    .leftJoin(inventoryItems, eq(manufacturingQueue.inventoryItemId, inventoryItems.id))
    .where(and(
      routingSignal,
      or(
        eq(manufacturingQueue.status, 'COMPLETED'),
        eq(manufacturingQueue.status, 'IN_PROGRESS')
      )
    ))
    .orderBy(desc(manufacturingQueue.completedAt), desc(manufacturingQueue.updatedAt))
    .limit(250);

  for (const row of completedRows) {
    const completedQuantity = row.queue.quantityCompleted || 0;
    if (completedQuantity <= 0 || !row.item) continue;
    if (isP1PacketInventoryQueueItem(parseQueueNotes(row.queue.notes))) continue;

    const partNumber = row.item.agPartNumber || 'UNK';
    const barcodePrefix = `PKT-${partNumber}-${row.queue.id}-%`;
    const [{ existingCount }] = await db
      .select({ existingCount: count() })
      .from(cuttingBuiltPackets)
      .where(like(cuttingBuiltPackets.barcode, barcodePrefix));

    const missingCount = completedQuantity - existingCount;
    if (missingCount <= 0) continue;

    let productCategory = await db.query.cuttingProductCategories.findFirst({
      where: eq(cuttingProductCategories.categoryName, row.item.name || 'Unknown'),
    });

    if (!productCategory) {
      const [newCategory] = await db
        .insert(cuttingProductCategories)
        .values({
          categoryName: row.item.name || 'Unknown Packet Type',
          isActive: true,
        })
        .returning();
      productCategory = newCategory;
    }

    if (!productCategory) continue;

    const productCategoryId = productCategory.id;
    const buildDate = row.queue.completedAt || row.queue.updatedAt || new Date();
    const createdBy = row.queue.completedBy || row.queue.assignedTo || null;

    for (let i = 0; i < missingCount; i++) {
      const packetNumber = existingCount + i + 1;
      const barcode = `PKT-${partNumber}-${row.queue.id}-${packetNumber}-${buildDate.getTime()}-${i}`;

      await db
        .insert(cuttingBuiltPackets)
        .values({
          productCategoryId,
          barcode,
          packetNumber,
          buildDate,
          status: 'AVAILABLE',
          isMixedFabric: false,
          fabricSourceCount: 0,
          notes: row.queue.completionNotes || 'Backfilled from completed cutting queue row',
          createdBy,
        })
        .onConflictDoNothing();
    }
  }
}

// Get manufacturing queue items for cutting table.
// DEMAND ROUTING: A record belongs to the Cutting Table dashboard when:
//   (a) manufacturing_queue.department = 'Cutting Table'  — legacy + BOM-exploded records
//   (b) OR inventoryItems.manufacturedCategory IN ('PACKET','KIT') — additive category signal
//       (these map to supplySourceDashboard=CUTTING_TABLE via getSupplySourceDashboard)
// Using both conditions means records created before item classification (legacy dept filter)
// and records created after classification (category-driven BOM explosion) both appear.
router.get('/cutting-table', async (req: Request, res: Response) => {
  try {
    const { status } = req.query;

    // Routing signal via shared helper — additive: legacy dept OR mapped categories
    const cuttingTableDept = supplySourceDashboardToLegacyDept('CUTTING_TABLE')!;
    const cuttingTableCategories = getDashboardCategories('CUTTING_TABLE');
    const routingSignal = or(
      eq(manufacturingQueue.department, cuttingTableDept),
      inArray(inventoryItems.manufacturedCategory, cuttingTableCategories)
    );

    let whereClause;

    if (status === 'ACTIVE') {
      whereClause = and(
        routingSignal,
        or(
          eq(manufacturingQueue.status, 'PENDING'),
          eq(manufacturingQueue.status, 'IN_PROGRESS'),
          eq(manufacturingQueue.status, 'LOCKED'),
          eq(manufacturingQueue.status, 'locked')
        )
      );
    } else if (status && status !== 'ALL') {
      whereClause = and(
        routingSignal,
        eq(manufacturingQueue.status, status as string)
      );
    } else {
      whereClause = routingSignal;
    }
    
    // Bound the result set so a runaway queue cannot starve memory and trip the
    // routes-ready gate (task #178). 5,000 rows is well above expected steady
    // state but small enough to keep response payloads in line.
    const CUTTING_QUEUE_MAX_ROWS = 5000;
    const queueItems = await db
      .select({
        queue: manufacturingQueue,
        item: inventoryItems,
      })
      .from(manufacturingQueue)
      .leftJoin(inventoryItems, eq(manufacturingQueue.inventoryItemId, inventoryItems.id))
      .where(whereClause)
      .orderBy(manufacturingQueue.priority, manufacturingQueue.createdAt)
      .limit(CUTTING_QUEUE_MAX_ROWS);

    // Fetch all active BOMs once for efficient lookup. Selecting only the
    // columns we use downstream so the BOM
    // table doesn't have to be fully materialised in memory.
    const allActiveBoms = await db
      .select({
        id: cuttingPacketBOMs.id,
        partNumber: cuttingPacketBOMs.partNumber,
        inventoryItemId: cuttingPacketBOMs.inventoryItemId,
        packetType: cuttingPacketBOMs.packetType,
      })
      .from(cuttingPacketBOMs)
      .where(eq(cuttingPacketBOMs.isActive, true));

    const builtPacketCounts = new Map<number, number>();
    const builtPacketRows = await db
      .select({ barcode: cuttingBuiltPackets.barcode })
      .from(cuttingBuiltPackets);

    for (const packet of builtPacketRows) {
      const queueId = parseQueueIdFromBuiltPacketBarcode(packet.barcode);
      if (queueId === null) continue;
      builtPacketCounts.set(queueId, (builtPacketCounts.get(queueId) || 0) + 1);
    }

    const formattedItems = queueItems.map(row => {
      // Extract bomId and other data from notes JSON if present
      let packetBomId = null;
      let materialType = null;
      let source = null;
      let orderId = null;
      let packetName = null;
      let userNotes = null;
      let poNumbers: Array<{ poNumber: string; quantity: number; p2PoItemId?: number | null; p2PoId?: number | null }> = [];

      try {
        if (row.queue.notes) {
          const parsedNotes = JSON.parse(row.queue.notes);
          packetBomId = parsedNotes.bomId || null;
          materialType = parsedNotes.materialType || null;
          source = parsedNotes.source || null;
          orderId = parsedNotes.orderId || null;
          packetName = parsedNotes.packetName || null;
          userNotes = parsedNotes.userNotes || null;
          if (Array.isArray(parsedNotes.poNumbers)) {
            poNumbers = parsedNotes.poNumbers
              .filter((p: any) => p && (p.poNumber || p.p2PoItemId || p.p2PoId))
              .map((p: any) => ({
                poNumber: String(p.poNumber || ''),
                quantity: Number(p.quantity) || 0,
                p2PoItemId: p.p2PoItemId ?? null,
                p2PoId: p.p2PoId ?? null,
              }));
          }
        }
      } catch (e) {
        // Notes might not be JSON, that's ok
      }

      const bomMatch = resolveQueueBomMatch({
        allActiveBoms,
        bomId: packetBomId,
        inventoryItemId: row.queue.inventoryItemId,
        itemPartNumber: row.item?.agPartNumber ?? null,
        materialType,
        packetName,
        itemName: row.item?.name ?? null,
      });
      const linkedBom = bomMatch.bom;

      const displayName = packetName || userNotes || row.item?.name || orderId || null;
      const quantityRequested = row.queue.quantityRequested || 0;
      const completedQuantity = row.queue.quantityCompleted || 0;
      const builtPacketCount = builtPacketCounts.get(row.queue.id) || 0;
      const allocatedPacketCount = Math.max(completedQuantity, builtPacketCount);
      const printableBarcodeCount = Math.max(0, quantityRequested - allocatedPacketCount);
      const productionProtected = completedQuantity > 0 || builtPacketCount > 0;
      const productionProtectionReason = builtPacketCount > 0
        ? 'built_packets_exist'
        : completedQuantity > 0
          ? 'quantity_completed'
          : null;
      
      return {
        ...row.queue,
        // Show BOM's part number when a BOM is linked; fall back to inventory item's part number
        partNumber: linkedBom?.partNumber || row.item?.agPartNumber,
        partName: row.item?.name,
        displayName,
        inventoryItem: row.item,
        packetBomId: linkedBom?.id || packetBomId,
        bomPartNumber: linkedBom?.partNumber || null,
        bomMatchReason: bomMatch.reason,
        bomMatchConfidence: bomMatch.confidence,
        materialType,
        source,
        orderId,
        packetName,
        poNumbers,
        builtPacketCount,
        allocatedPacketCount,
        printableBarcodeCount,
        productionProtected,
        productionProtectionReason,
      };
    });
    
    res.json(formattedItems);
  } catch (error: any) {
    console.error('[cutting-table-mfg-queue] DB error:', {
      route: '/api/cutting-table-mfg-queue/cutting-table',
      status: req.query?.status ?? null,
      message: error?.message,
      code: error?.code,
    });
    res.status(500).json({ error: 'Failed to fetch cutting table queue' });
  }
});

// Normalized trace view for a cutting-table work order. This gathers the
// lineage spread across manufacturing_queue.notes, BOM records, built packets,
// and fabric source rows into one payload for the control center drawer.
router.get('/:id/trace', async (req: Request, res: Response) => {
  try {
    const parsedId = parseInt(req.params.id, 10);
    if (isNaN(parsedId)) {
      return res.status(400).json({ error: 'Invalid queue item ID' });
    }

    const [row] = await db
      .select({
        queue: manufacturingQueue,
        item: inventoryItems,
      })
      .from(manufacturingQueue)
      .leftJoin(inventoryItems, eq(manufacturingQueue.inventoryItemId, inventoryItems.id))
      .where(eq(manufacturingQueue.id, parsedId))
      .limit(1);

    if (!row) {
      return res.status(404).json({ error: 'Cutting table queue item not found' });
    }

    const cuttingTableDept = supplySourceDashboardToLegacyDept('CUTTING_TABLE')!;
    const cuttingTableCategories = getDashboardCategories('CUTTING_TABLE');
    const itemCategory = row.item?.manufacturedCategory ?? null;
    const isCuttingQueueItem =
      row.queue.department === cuttingTableDept ||
      (itemCategory ? cuttingTableCategories.includes(itemCategory as any) : false);

    if (!isCuttingQueueItem) {
      return res.status(404).json({ error: 'Cutting table queue item not found' });
    }

    const notes = parseQueueNotes(row.queue.notes);
    const poNumbers = Array.isArray(notes.poNumbers)
      ? notes.poNumbers
          .filter((p: any) => p && (p.poNumber || p.p2PoItemId || p.p2PoId))
          .map((p: any) => ({
            poNumber: String(p.poNumber || ''),
            quantity: Number(p.quantity) || 0,
            p2PoItemId: p.p2PoItemId ?? null,
            p2PoId: p.p2PoId ?? null,
          }))
      : [];

    const allActiveBoms = await db
      .select()
      .from(cuttingPacketBOMs)
      .where(eq(cuttingPacketBOMs.isActive, true));

    const bomMatch = resolveQueueBomMatch({
      allActiveBoms,
      bomId: notes.bomId || null,
      inventoryItemId: row.queue.inventoryItemId,
      itemPartNumber: row.item?.agPartNumber ?? null,
      materialType: notes.materialType || null,
      packetName: notes.packetName || null,
      itemName: row.item?.name ?? null,
    });
    const packetBom = bomMatch.bom;

    const bomMaterials = packetBom
      ? await db.select().from(cuttingPacketBOMMaterials).where(eq(cuttingPacketBOMMaterials.packetBomId, packetBom.id))
      : [];
    const bomParts = packetBom
      ? await db.select().from(cuttingPacketBOMParts).where(eq(cuttingPacketBOMParts.packetBomId, packetBom.id)).orderBy(asc(cuttingPacketBOMParts.sortOrder))
      : [];

    const allBuiltPackets = await db
      .select({
        id: cuttingBuiltPackets.id,
        barcode: cuttingBuiltPackets.barcode,
        packetNumber: cuttingBuiltPackets.packetNumber,
        buildDate: cuttingBuiltPackets.buildDate,
        status: cuttingBuiltPackets.status,
        isMixedFabric: cuttingBuiltPackets.isMixedFabric,
        fabricSourceCount: cuttingBuiltPackets.fabricSourceCount,
        notes: cuttingBuiltPackets.notes,
        createdBy: cuttingBuiltPackets.createdBy,
        allocatedToOrder: cuttingBuiltPackets.allocatedToOrder,
        categoryName: cuttingProductCategories.categoryName,
      })
      .from(cuttingBuiltPackets)
      .leftJoin(cuttingProductCategories, eq(cuttingProductCategories.id, cuttingBuiltPackets.productCategoryId))
      .orderBy(asc(cuttingBuiltPackets.id));

    const builtPackets = allBuiltPackets.filter((packet) => parseQueueIdFromBuiltPacketBarcode(packet.barcode) === parsedId);

    const builtPacketIds = builtPackets.map((p) => p.id);
    const fabricSources = builtPacketIds.length > 0
      ? await db
          .select()
          .from(cuttingBuiltPacketFabricSources)
          .where(inArray(cuttingBuiltPacketFabricSources.builtPacketId, builtPacketIds))
      : [];

    const packetsWithSources = builtPackets.map((packet) => ({
      ...packet,
      fabricSources: fabricSources.filter((source) => source.builtPacketId === packet.id),
    }));

    const quantityRequested = row.queue.quantityRequested || 0;
    const quantityCompleted = row.queue.quantityCompleted || 0;
    const remainingQuantity = Math.max(0, quantityRequested - quantityCompleted);
    const sourceLabel = notes.source || row.queue.sourceType || 'UNKNOWN';

    res.json({
      queueItem: {
        id: row.queue.id,
        department: row.queue.department,
        status: row.queue.status,
        priority: row.queue.priority,
        quantityRequested,
        quantityCompleted,
        remainingQuantity,
        dueDate: row.queue.dueDate,
        requestedBy: row.queue.requestedBy,
        assignedTo: row.queue.assignedTo,
        startedAt: row.queue.startedAt,
        completedAt: row.queue.completedAt,
        completedBy: row.queue.completedBy,
        completionNotes: row.queue.completionNotes,
        fabricLot: row.queue.fabricLot,
        fabricBatch: row.queue.fabricBatch,
        fabricRoll: row.queue.fabricRoll,
        materialDetails: row.queue.materialDetails,
        createdAt: row.queue.createdAt,
        updatedAt: row.queue.updatedAt,
      },
      inventoryItem: row.item ? {
        id: row.item.id,
        agPartNumber: row.item.agPartNumber,
        name: row.item.name,
        manufacturedCategory: row.item.manufacturedCategory,
        category: row.item.category,
        quantityInStock: row.item.quantityInStock,
        onHand: (row.item as any).onHand,
      } : null,
      demand: {
        source: sourceLabel,
        orderId: notes.orderId || row.queue.sourceId || null,
        packetName: notes.packetName || row.item?.name || null,
        materialType: notes.materialType || null,
        userNotes: notes.userNotes || notes.rawNotes || null,
        grouped: poNumbers.length > 0,
        contributors: poNumbers,
        contributorCount: poNumbers.length,
        contributorQuantity: poNumbers.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0), 0),
      },
      bom: packetBom ? {
        id: packetBom.id,
        partNumber: packetBom.partNumber,
        packetType: packetBom.packetType,
        yieldPerCut: packetBom.yieldPerCut,
        squareMetersPerCut: packetBom.squareMetersPerCut,
        wasteFactor: packetBom.wasteFactor,
        noPlySchedule: packetBom.noPlySchedule,
        matchReason: bomMatch.reason,
        matchConfidence: bomMatch.confidence,
        materials: bomMaterials,
        parts: bomParts,
      } : null,
      builtPackets: packetsWithSources,
      traceSummary: {
        bomConfigured: Boolean(packetBom),
        builtPacketCount: packetsWithSources.length,
        fabricSourceCount: fabricSources.length,
        mixedFabricCount: packetsWithSources.filter((p) => p.isMixedFabric).length,
        availablePacketCount: packetsWithSources.filter((p) => p.status === 'AVAILABLE').length,
        allocatedPacketCount: packetsWithSources.filter((p) => p.status === 'ALLOCATED').length,
        completed: row.queue.status === 'COMPLETED',
      },
    });
  } catch (error) {
    console.error('Error fetching cutting table trace:', error);
    res.status(500).json({ error: 'Failed to fetch cutting table trace' });
  }
});

// Complete manufacturing queue item with traceability data (supports partial completion)
router.post('/:id/complete', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      quantityCompleted,
      fabricLot,
      fabricBatch,
      fabricRoll,
      materialDetails,
      completionNotes,
      completedBy,
    } = req.body;
    
    if (!quantityCompleted || quantityCompleted <= 0) {
      return res.status(400).json({ error: 'Quantity completed must be greater than 0' });
    }
    
    // Get the current queue item to check requested quantity
    const currentItem = await db.query.manufacturingQueue.findFirst({
      where: eq(manufacturingQueue.id, parseInt(id)),
    });
    
    if (!currentItem) {
      return res.status(404).json({ error: 'Manufacturing queue item not found' });
    }

    const inventoryItem = await db.query.inventoryItems.findFirst({
      where: eq(inventoryItems.id, currentItem.inventoryItemId),
    });

    if (!inventoryItem) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    let productCategory = await db.query.cuttingProductCategories.findFirst({
      where: eq(cuttingProductCategories.categoryName, inventoryItem.name || 'Unknown'),
    });

    if (!productCategory) {
      const [newCategory] = await db
        .insert(cuttingProductCategories)
        .values({
          categoryName: inventoryItem.name || 'Unknown Packet Type',
          isActive: true,
        })
        .returning();
      productCategory = newCategory;
    }

    if (!productCategory) {
      return res.status(500).json({ error: 'Failed to resolve packet category' });
    }

    const productCategoryId = productCategory.id;
    const barcodePrefix = `PKT-${inventoryItem.agPartNumber}-${id}-%`;
    const queueNotes = parseQueueNotes(currentItem.notes);
    const shouldAddToP1PacketInventory = isP1PacketInventoryQueueItem(queueNotes);

    const { updated, createdPackets, isFullyCompleted, newTotalCompleted } = await db.transaction(async (tx) => {
      const [lockedItem] = await tx
        .select({
          quantityCompleted: manufacturingQueue.quantityCompleted,
          quantityRequested: manufacturingQueue.quantityRequested,
        })
        .from(manufacturingQueue)
        .where(eq(manufacturingQueue.id, parseInt(id)))
        .for('update');

      if (!lockedItem) {
        throw new Error(`Manufacturing queue item ${id} disappeared inside transaction`);
      }

      const previousCompleted = lockedItem.quantityCompleted || 0;
      const newTotalCompleted = previousCompleted + quantityCompleted;
      const isFullyCompleted = newTotalCompleted >= lockedItem.quantityRequested;

      const [{ existingCount }] = await tx
        .select({ existingCount: count() })
        .from(cuttingBuiltPackets)
        .where(like(cuttingBuiltPackets.barcode, barcodePrefix));

      const createdPackets = [];
      if (!shouldAddToP1PacketInventory) {
        for (let i = 0; i < quantityCompleted; i++) {
          const packetNumber = existingCount + i + 1;
          const barcode = `PKT-${inventoryItem.agPartNumber}-${id}-${packetNumber}-${Date.now()}`;

          const [builtPacket] = await tx
            .insert(cuttingBuiltPackets)
            .values({
              productCategoryId,
              barcode,
              packetNumber,
              buildDate: new Date(),
              status: 'AVAILABLE',
              isMixedFabric: false,
              fabricSourceCount: 0,
              notes: completionNotes || null,
              createdBy: completedBy || null,
            })
            .returning();

          createdPackets.push(builtPacket);
        }
      }

      if (shouldAddToP1PacketInventory && currentItem.inventoryItemId) {
        await adjustPacketInventoryItem(tx, currentItem.inventoryItemId, quantityCompleted);
      }

      const [updated] = await tx
        .update(manufacturingQueue)
        .set({
          quantityCompleted: newTotalCompleted,
          status: isFullyCompleted ? 'COMPLETED' : 'IN_PROGRESS',
          completedAt: isFullyCompleted ? new Date() : null,
          fabricLot,
          fabricBatch,
          fabricRoll,
          materialDetails,
          completionNotes,
          completedBy,
          updatedAt: new Date(),
        })
        .where(eq(manufacturingQueue.id, parseInt(id)))
        .returning();

      if (!updated) {
        throw new Error(`Manufacturing queue item ${id} was not updated`);
      }

      return { updated, createdPackets, isFullyCompleted, newTotalCompleted };
    });
    
    // Return additional info for partial completions
    res.json({
      ...updated,
      createdPackets,
      batchInventoryAdded: shouldAddToP1PacketInventory ? quantityCompleted : 0,
      isPartialCompletion: !isFullyCompleted,
      remainingQuantity: isFullyCompleted ? 0 : currentItem.quantityRequested - newTotalCompleted,
    });
  } catch (error) {
    console.error('Error completing manufacturing queue item:', error);
    res.status(500).json({ error: 'Failed to complete manufacturing queue item' });
  }
});

// Start working on a manufacturing queue item
router.post('/:id/start', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { assignedTo } = req.body;
    
    const [updated] = await db
      .update(manufacturingQueue)
      .set({
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        assignedTo,
        updatedAt: new Date(),
      })
      .where(eq(manufacturingQueue.id, parseInt(id)))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ error: 'Manufacturing queue item not found' });
    }
    
    res.json(updated);
  } catch (error) {
    console.error('Error starting manufacturing queue item:', error);
    res.status(500).json({ error: 'Failed to start manufacturing queue item' });
  }
});

// Generate barcode labels for completed manufactured items
router.post('/:id/generate-labels', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { quantityToLabel } = req.body;
    
    // Get the manufacturing queue item
    const queueItem = await db.query.manufacturingQueue.findFirst({
      where: eq(manufacturingQueue.id, parseInt(id)),
      with: {
        // We'll need to add relations in schema later
      },
    });
    
    if (!queueItem) {
      return res.status(404).json({ error: 'Manufacturing queue item not found' });
    }
    
    // Get the inventory item details
    const inventoryItem = await db.query.inventoryItems.findFirst({
      where: eq(inventoryItems.id, queueItem.inventoryItemId),
    });
    
    if (!inventoryItem) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    
    // Generate label data with barcode images
    const labels = [];
    const quantity = quantityToLabel || queueItem.quantityCompleted || 1;
    
    for (let i = 1; i <= quantity; i++) {
      const barcodeValue = `${inventoryItem.agPartNumber}-Q${queueItem.id}-${i}`;
      
      // Generate barcode image (dynamic import to avoid startup failure)
      let barcodeImage;
      try {
        const { generateBarcodeImage } = await import('../utils/barcodeGenerator');
        barcodeImage = await generateBarcodeImage(barcodeValue, {
          width: 2,
          height: 50,
          displayValue: true,
          fontSize: 12,
          margin: 5,
        });
      } catch (error) {
        console.error(`Error generating barcode for ${barcodeValue}:`, error);
        barcodeImage = null;
      }
      
      labels.push({
        itemId: i,
        partNumber: inventoryItem.agPartNumber,
        partName: inventoryItem.name,
        queueId: queueItem.id,
        fabricLot: queueItem.fabricLot,
        fabricBatch: queueItem.fabricBatch,
        fabricRoll: queueItem.fabricRoll,
        completedBy: queueItem.completedBy,
        completedAt: queueItem.completedAt,
        barcodeValue,
        barcodeImage, // Base64-encoded PNG image
      });
    }
    
    res.json({ labels, count: labels.length });
  } catch (error) {
    console.error('Error generating labels:', error);
    res.status(500).json({ error: 'Failed to generate labels' });
  }
});

// Schedule a packet item to the cutting table manufacturing queue
router.post('/schedule-packet', async (req: Request, res: Response) => {
  try {
    const { inventoryItemId, quantity, priority, dueDate, notes, requestedBy } = req.body;
    
    if (!inventoryItemId) {
      return res.status(400).json({ error: 'Inventory item ID is required' });
    }
    
    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Quantity must be greater than 0' });
    }
    
    // Verify the inventory item exists and is a packet item
    const inventoryItem = await db.query.inventoryItems.findFirst({
      where: eq(inventoryItems.id, inventoryItemId),
    });
    
    if (!inventoryItem) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    
    if (inventoryItem.manufacturedCategory !== 'PACKET') {
      return res.status(400).json({ error: 'This item is not a packet item. Set the manufactured category to "Packet" in the inventory item settings.' });
    }
    
    // Create the manufacturing queue entry
    const [newQueueItem] = await db
      .insert(manufacturingQueue)
      .values({
        inventoryItemId,
        department: 'Cutting Table',
        quantityRequested: quantity,
        quantityCompleted: 0,
        priority: priority || 50,
        status: 'PENDING',
        dueDate: dueDate ? new Date(dueDate) : null,
        notes,
        requestedBy,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    
    res.status(201).json({
      ...newQueueItem,
      partNumber: inventoryItem.agPartNumber,
      partName: inventoryItem.name,
    });
  } catch (error) {
    console.error('Error scheduling packet to cutting table:', error);
    res.status(500).json({ error: 'Failed to schedule packet' });
  }
});

// Get all packet items that can be scheduled (manufacturedCategory = 'PACKET')
router.get('/available-packets', async (req: Request, res: Response) => {
  try {
    const packetItems = await db
      .select({
        id: inventoryItems.id,
        agPartNumber: inventoryItems.agPartNumber,
        name: inventoryItems.name,
        description: inventoryItems.description,
        quantityInStock: inventoryItems.quantityInStock,
        onHand: inventoryItems.onHand,
      })
      .from(inventoryItems)
      .where(eq(inventoryItems.manufacturedCategory, 'PACKET'))
      .orderBy(inventoryItems.agPartNumber);
    
    res.json(packetItems);
  } catch (error) {
    console.error('Error fetching available packets:', error);
    res.status(500).json({ error: 'Failed to fetch available packets' });
  }
});

// Complete packet build with full AS9100 traceability (supports mixed-fabric packets)
router.post('/:id/complete-with-traceability', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      quantityCompleted,
      fabricSources, // Array of fabric traceability data
      completedBy,
      completionNotes,
    } = req.body;
    
    if (!quantityCompleted || quantityCompleted <= 0) {
      return res.status(400).json({ error: 'Quantity completed must be greater than 0' });
    }
    
    if (!fabricSources || !Array.isArray(fabricSources) || fabricSources.length === 0) {
      return res.status(400).json({ error: 'At least one fabric source is required for traceability' });
    }
    
    // Get the current queue item
    const currentItem = await db.query.manufacturingQueue.findFirst({
      where: eq(manufacturingQueue.id, parseInt(id)),
    });
    
    if (!currentItem) {
      return res.status(404).json({ error: 'Manufacturing queue item not found' });
    }
    
    // Get inventory item for barcode generation
    const inventoryItem = await db.query.inventoryItems.findFirst({
      where: eq(inventoryItems.id, currentItem.inventoryItemId),
    });
    
    if (!inventoryItem) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    
    // Import built packet tables
    const { cuttingBuiltPackets, cuttingBuiltPacketFabricSources, cuttingProductCategories } = await import('../../schema');
    
    // Find or create a product category for this packet type
    let productCategory = await db.query.cuttingProductCategories.findFirst({
      where: eq(cuttingProductCategories.categoryName, inventoryItem.name || 'Unknown'),
    });
    
    // If no category exists, create one
    if (!productCategory) {
      const [newCategory] = await db
        .insert(cuttingProductCategories)
        .values({
          categoryName: inventoryItem.name || 'Unknown Packet Type',
          isActive: true,
        })
        .returning();
      productCategory = newCategory;
    }
    
    // Barcodes follow the pattern PKT-{agPartNumber}-{id}-{packetNumber}-{timestamp}.
    // We match the prefix PKT-{agPartNumber}-{id}-% to count packets for this queue item.
    //
    // Back-fill decision: existing packets created before this fix all have
    // packetNumber = 1. We intentionally skip back-filling them because:
    // 1. Their barcodes already embed the old packet numbers (changing packetNumber
    //    would create a mismatch between the barcode string and the stored field).
    // 2. Operators may have physically labelled or scanned those barcodes, so
    //    renumbering historical records could cause confusion on the floor.
    // Going forward, all new packets created via this endpoint will be numbered
    // sequentially from the correct offset.
    const barcodePrefix = `PKT-${inventoryItem.agPartNumber}-${id}-%`;
    const isMixedFabric = fabricSources.length > 1;
    const queueNotes = parseQueueNotes(currentItem.notes);
    const shouldAddToP1PacketInventory = isP1PacketInventoryQueueItem(queueNotes);

    // Wrap count + inserts + queue update in a transaction, using a row-level
    // lock on the queue item to prevent concurrent submissions from reading the
    // same existingCount and producing duplicate packet numbers.
    const { createdPackets, updated, isFullyCompleted, newTotalCompleted } = await db.transaction(async (tx) => {
      // Lock this queue item row for the duration of the transaction and
      // re-read its latest values atomically. Using .for('update') issues a
      // SELECT … FOR UPDATE so any other concurrent request for the same queue
      // item will block here until we commit, preventing both duplicate packet
      // numbers and a lost-update on quantityCompleted.
      const [lockedItem] = await tx
        .select({
          quantityCompleted: manufacturingQueue.quantityCompleted,
          quantityRequested: manufacturingQueue.quantityRequested,
        })
        .from(manufacturingQueue)
        .where(eq(manufacturingQueue.id, parseInt(id)))
        .for('update');

      if (!lockedItem) {
        throw new Error(`Manufacturing queue item ${id} disappeared inside transaction`);
      }

      const lockedPreviousCompleted = lockedItem.quantityCompleted ?? 0;
      const lockedQuantityRequested = lockedItem.quantityRequested;

      const [{ existingCount }] = await tx
        .select({ existingCount: count() })
        .from(cuttingBuiltPackets)
        .where(like(cuttingBuiltPackets.barcode, barcodePrefix));

      const createdPackets = [];

      if (!shouldAddToP1PacketInventory) {
        for (let i = 0; i < quantityCompleted; i++) {
          // Offset by existing packet count so each packet receives its true sequential
          // position across all submissions (not just within this submission).
          const packetNumber = existingCount + i + 1;
          const timestamp = Date.now();
          const barcode = `PKT-${inventoryItem.agPartNumber}-${id}-${packetNumber}-${timestamp}`;

          // Create the built packet record
          const [builtPacket] = await tx
            .insert(cuttingBuiltPackets)
            .values({
              productCategoryId: productCategory.id,
              barcode,
              packetNumber,
              buildDate: new Date(),
              status: 'AVAILABLE',
              isMixedFabric,
              fabricSourceCount: fabricSources.length,
              notes: completionNotes || null,
              createdBy: completedBy || null,
            })
            .returning();

          // Create fabric source records for each fabric used
          for (let j = 0; j < fabricSources.length; j++) {
            const source = fabricSources[j];
            await tx
              .insert(cuttingBuiltPacketFabricSources)
              .values({
                builtPacketId: builtPacket.id,
                fabricInventoryId: source.fabricInventoryId || null,
                fabricType: source.fabricType || null,
                lotNumber: source.lotNumber || null,
                batchNumber: source.batchNumber || null,
                rollNumber: source.rollNumber || null,
                supplierPartNumber: source.supplierPartNumber || null,
                internalControlNumber: source.internalControlNumber || null,
                expirationDate: source.expirationDate || null,
                quantityUsed: source.quantityUsed || 1,
                isPrimary: j === 0, // First source is primary
              });
          }

          createdPackets.push({
            ...builtPacket,
            fabricSources,
          });
        }
      }

      const fabricUsageByRoll = new Map<string, { quantityUsed: number; rollNumber: string | null }>();
      for (const source of fabricSources) {
        if (!source.fabricInventoryId) continue;
        const perPacketQty = parseFabricStockQuantity(source.quantityUsed || 1);
        const totalUsed = perPacketQty * quantityCompleted;
        if (totalUsed <= 0) continue;
        const existingUsage = fabricUsageByRoll.get(source.fabricInventoryId);
        fabricUsageByRoll.set(source.fabricInventoryId, {
          quantityUsed: (existingUsage?.quantityUsed ?? 0) + totalUsed,
          rollNumber: source.rollNumber || existingUsage?.rollNumber || null,
        });
      }

      for (const [fabricInventoryId, usage] of fabricUsageByRoll.entries()) {
        const [roll] = await tx
          .select()
          .from(cuttingFabricInventory)
          .where(eq(cuttingFabricInventory.id, fabricInventoryId))
          .for('update');

        if (!roll) continue;

        const currentSquareMeters = parseFabricStockQuantity(roll.squareMeters);
        const currentQuantityInStock = parseFabricStockQuantity(roll.quantityInStock);
        const newSquareMeters = Math.max(0, currentSquareMeters - usage.quantityUsed);
        const newQuantityInStock = Math.max(0, currentQuantityInStock - usage.quantityUsed);
        const isDepleted = newSquareMeters <= 0 && newQuantityInStock <= 0;

        await tx
          .update(cuttingFabricInventory)
          .set({
            squareMeters: newSquareMeters.toString(),
            quantityInStock: newQuantityInStock,
            status: isDepleted ? 'depleted' : roll.status,
            depletedAt: isDepleted ? new Date() : roll.depletedAt,
            depletedBy: isDepleted ? (completedBy || 'unknown') : roll.depletedBy,
            updatedAt: new Date(),
          })
          .where(eq(cuttingFabricInventory.id, fabricInventoryId));

        await tx.insert(cuttingFabricInventoryTransactions).values({
          fabricInventoryId,
          changeType: 'ISSUE',
          quantityDelta: nonZeroInventoryDelta(-usage.quantityUsed),
          performedBy: completedBy || 'unknown',
          notes: `Cutting table completion ${id}: ${usage.quantityUsed} used for ${quantityCompleted} packet(s)${usage.rollNumber ? ` from roll ${usage.rollNumber}` : ''}`,
        });
      }

      if (shouldAddToP1PacketInventory && currentItem.inventoryItemId) {
        await adjustPacketInventoryItem(tx, currentItem.inventoryItemId, quantityCompleted);
      }

      // Update the manufacturing queue item inside the same transaction.
      // Use values from the locked row to prevent a lost-update when concurrent
      // submissions race on quantityCompleted.
      const newTotalCompleted = lockedPreviousCompleted + quantityCompleted;
      const isFullyCompleted = newTotalCompleted >= lockedQuantityRequested;

      const fabricLotSummary = fabricSources.map((s: any) => s.lotNumber || s.batchNumber).filter(Boolean).join(', ');

      const [updated] = await tx
        .update(manufacturingQueue)
        .set({
          quantityCompleted: newTotalCompleted,
          status: isFullyCompleted ? 'COMPLETED' : 'IN_PROGRESS',
          completedAt: isFullyCompleted ? new Date() : null,
          fabricLot: fabricLotSummary,
          fabricBatch: fabricSources[0]?.batchNumber || null,
          fabricRoll: fabricSources[0]?.rollNumber || null,
          materialDetails: JSON.stringify(fabricSources),
          completionNotes,
          completedBy,
          updatedAt: new Date(),
        })
        .where(eq(manufacturingQueue.id, parseInt(id)))
        .returning();

      return { createdPackets, updated, isFullyCompleted, newTotalCompleted };
    });

    const quantityRequested = currentItem.quantityRequested;

    res.json({
      queueItem: updated,
      createdPackets,
      batchInventoryAdded: shouldAddToP1PacketInventory ? quantityCompleted : 0,
      isPartialCompletion: !isFullyCompleted,
      remainingQuantity: isFullyCompleted ? 0 : quantityRequested - newTotalCompleted,
      isMixedFabric,
      fabricSourceCount: fabricSources.length,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Error completing packet with traceability:', errMsg, error);
    res.status(500).json({ error: 'Failed to complete packet with traceability' });
  }
});

// Generate labels for built packets (includes all fabric lot info for mixed packets)
router.post('/:id/generate-packet-labels', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { packetIds } = req.body; // Optional: specific packet IDs to label
    
    const { cuttingBuiltPackets, cuttingBuiltPacketFabricSources, manufacturingQueue: mfgQueue } = await import('../../schema');
    
    // Get the queue item to find associated packets
    const queueItem = await db.query.manufacturingQueue.findFirst({
      where: eq(manufacturingQueue.id, parseInt(id)),
    });
    
    if (!queueItem) {
      return res.status(404).json({ error: 'Manufacturing queue item not found' });
    }
    
    // Get inventory item for part info
    const inventoryItem = await db.query.inventoryItems.findFirst({
      where: eq(inventoryItems.id, queueItem.inventoryItemId),
    });
    
    // Get packets created from this queue item (using barcode pattern match)
    let packets;
    if (packetIds && Array.isArray(packetIds) && packetIds.length > 0) {
      // Get specific packets by ID
      const { inArray } = await import('drizzle-orm');
      packets = await db
        .select()
        .from(cuttingBuiltPackets)
        .where(inArray(cuttingBuiltPackets.id, packetIds));
    } else {
      // Get all packets that match this queue item pattern
      const { like } = await import('drizzle-orm');
      packets = await db
        .select()
        .from(cuttingBuiltPackets)
        .where(like(cuttingBuiltPackets.barcode, `PKT-${inventoryItem?.agPartNumber}-${id}-%`));
    }
    
    // Get fabric sources for each packet
    const labels = await Promise.all(
      packets.map(async (packet) => {
        const sources = await db
          .select()
          .from(cuttingBuiltPacketFabricSources)
          .where(eq(cuttingBuiltPacketFabricSources.builtPacketId, packet.id));
        
        // Generate barcode image (dynamic import to avoid startup failure)
        let barcodeImage;
        try {
          const { generateBarcodeImage } = await import('../utils/barcodeGenerator');
          barcodeImage = await generateBarcodeImage(packet.barcode, {
            width: 2,
            height: 50,
            displayValue: true,
            fontSize: 10,
            margin: 5,
          });
        } catch (err) {
          console.error(`Error generating barcode for ${packet.barcode}:`, err);
          barcodeImage = null;
        }
        
        // Format fabric lot info for label (show all lots for mixed-fabric packets)
        const fabricLotLines = sources.map((s) => {
          const parts = [];
          if (s.fabricType) parts.push(s.fabricType);
          if (s.lotNumber) parts.push(`Lot: ${s.lotNumber}`);
          if (s.batchNumber) parts.push(`Batch: ${s.batchNumber}`);
          if (s.rollNumber) parts.push(`Roll: ${s.rollNumber}`);
          return parts.join(' | ');
        });
        
        return {
          packetId: packet.id,
          barcode: packet.barcode,
          barcodeImage,
          packetNumber: packet.packetNumber,
          partNumber: inventoryItem?.agPartNumber,
          partName: inventoryItem?.name,
          buildDate: packet.buildDate,
          status: packet.status,
          isMixedFabric: packet.isMixedFabric,
          fabricSourceCount: packet.fabricSourceCount,
          fabricSources: sources,
          fabricLotLines, // Pre-formatted lines for label display
          expirationDates: sources.map((s) => s.expirationDate).filter(Boolean),
        };
      })
    );
    
    res.json({
      labels,
      count: labels.length,
      queueItemId: id,
    });
  } catch (error) {
    console.error('Error generating packet labels:', error);
    res.status(500).json({ error: 'Failed to generate packet labels' });
  }
});

// Sync P2 production orders into manufacturing queue entries
router.post('/sync-p2-demands', async (req: Request, res: Response) => {
  try {
    const { p2PoId } = req.body;

    // Build query for P2 production orders needing cutting
    let whereConditions: any[];
    if (p2PoId) {
      whereConditions = [
        eq(p2ProductionOrders.department, 'Cutting Table'),
        eq(p2ProductionOrders.status, 'PENDING'),
        eq(p2ProductionOrders.p2PoId, p2PoId),
      ];
    } else {
      whereConditions = [
        eq(p2ProductionOrders.department, 'Cutting Table'),
        eq(p2ProductionOrders.status, 'PENDING'),
      ];
    }

    // Get all P2 production orders for cutting table
    const p2Orders = await db
      .select()
      .from(p2ProductionOrders)
      .where(and(...whereConditions));

    if (p2Orders.length === 0) {
      return res.json({ message: 'No pending P2 cutting table demands found', created: 0, merged: 0 });
    }

    // Cache PO numbers
    const poNumberCache: Record<number, string> = {};
    const fetchPoNumber = async (id: number): Promise<string> => {
      if (poNumberCache[id]) return poNumberCache[id];
      const [po] = await db.select().from(p2PurchaseOrders).where(eq(p2PurchaseOrders.id, id)).limit(1);
      poNumberCache[id] = po?.poNumber || `PO-${id}`;
      return poNumberCache[id];
    };

    // Group all P2 orders by SKU + due-date day. Each SKU = one packet type.
    type Bucket = {
      sku: string;
      partName: string;
      dueDate: Date | null;
      items: { poNumber: string; quantity: number; p2PoItemId: number | null; p2PoId: number }[];
    };
    const buckets = new Map<string, Bucket>();

    for (const order of p2Orders) {
      const dueDate = order.dueDate ? new Date(order.dueDate) : null;
      const dayKey = dueDate ? new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).toISOString().slice(0, 10) : 'null';
      const bucketKey = `${order.sku}|${dayKey}`;

      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, {
          sku: order.sku,
          partName: order.partName,
          dueDate,
          items: [],
        });
      }

      const poNumber = await fetchPoNumber(order.p2PoId);
      buckets.get(bucketKey)!.items.push({
        poNumber,
        quantity: order.quantity || 1,
        p2PoItemId: order.p2PoItemId,
        p2PoId: order.p2PoId,
      });
    }

    const { upsertGroupedCuttingQueueEntry } = await import('../utils/cuttingQueueGroupingHelper');

    let created = 0;
    let merged = 0;
    let skipped = 0;
    const results: any[] = [];

    for (const bucket of buckets.values()) {
      // Find inventory item by part number (SKU)
      const [inventoryItem] = await db.select().from(inventoryItems).where(eq(inventoryItems.agPartNumber, bucket.sku)).limit(1);

      if (!inventoryItem) {
        results.push({ sku: bucket.sku, status: 'skipped', reason: 'No matching inventory item' });
        skipped++;
        continue;
      }

      // Find matching packet BOM
      const [matchingBom] = await db.select().from(cuttingPacketBOMs).where(eq(cuttingPacketBOMs.partNumber, bucket.sku)).limit(1);

      const upsertResult = await upsertGroupedCuttingQueueEntry({
        packetName: inventoryItem.name || bucket.partName || bucket.sku,
        materialType: null,
        dueDate: bucket.dueDate,
        items: bucket.items,
        source: 'P2_SYNC',
        inventoryItemId: inventoryItem.id,
        bomId: matchingBom?.id || null,
      });

      if (!upsertResult) {
        results.push({ sku: bucket.sku, status: 'skipped', reason: 'Upsert returned null' });
        skipped++;
        continue;
      }

      if (upsertResult.created) {
        created++;
        results.push({
          sku: bucket.sku,
          partName: bucket.partName,
          status: 'created',
          queueId: upsertResult.queueItem.id,
          qty: upsertResult.addedQuantity,
          bomLinked: !!matchingBom,
          contributors: upsertResult.totalContributors,
        });
      } else if (upsertResult.addedQuantity > 0) {
        merged++;
        results.push({
          sku: bucket.sku,
          partName: bucket.partName,
          status: 'merged',
          queueId: upsertResult.queueItem.id,
          addedQty: upsertResult.addedQuantity,
          duplicates: upsertResult.duplicateCount,
          contributors: upsertResult.totalContributors,
        });
      } else {
        skipped++;
        results.push({
          sku: bucket.sku,
          status: 'idempotent',
          queueId: upsertResult.queueItem.id,
          duplicates: upsertResult.duplicateCount,
        });
      }
    }

    res.json({
      message: `Synced P2 demands: ${created} created, ${merged} merged, ${skipped} skipped`,
      created,
      merged,
      skipped,
      results,
    });
  } catch (error) {
    console.error('Error syncing P2 demands:', error);
    res.status(500).json({ error: 'Failed to sync P2 demands to cutting table' });
  }
});

// Bulk print barcodes for scheduled packet queue items
router.post('/bulk-print-barcodes', async (req: Request, res: Response) => {
  try {
    const { queueIds, quantities } = req.body;
    
    if (!queueIds || !Array.isArray(queueIds) || queueIds.length === 0) {
      return res.status(400).json({ error: 'At least one queue ID is required' });
    }

    const parsedQueueIds = queueIds
      .map((id: unknown) => Number(id))
      .filter((id: number) => Number.isInteger(id));

    if (parsedQueueIds.length === 0) {
      return res.status(400).json({ error: 'At least one valid queue ID is required' });
    }
    
    const printQuantities: Record<number, number> = quantities || {};
    
    const queueItems = await db
      .select({
        queue: manufacturingQueue,
        item: inventoryItems,
      })
      .from(manufacturingQueue)
      .leftJoin(inventoryItems, eq(manufacturingQueue.inventoryItemId, inventoryItems.id))
      .where(inArray(manufacturingQueue.id, parsedQueueIds));
    
    if (queueItems.length === 0) {
      return res.status(404).json({ error: 'No matching queue items found' });
    }
    
    const { generateBarcodeImage } = await import('../utils/barcodeGenerator');
    
    const builtPacketCounts = new Map<number, number>();
    const builtPacketRows = await db
      .select({ barcode: cuttingBuiltPackets.barcode })
      .from(cuttingBuiltPackets);

    for (const packet of builtPacketRows) {
      const queueId = parseQueueIdFromBuiltPacketBarcode(packet.barcode);
      if (queueId === null || !parsedQueueIds.includes(queueId)) continue;
      builtPacketCounts.set(queueId, (builtPacketCounts.get(queueId) || 0) + 1);
    }

    const allLabels: any[] = [];
    const skippedAllocated: any[] = [];
    
    for (const row of queueItems) {
      const partNumber = row.item?.agPartNumber || 'UNK';
      const maxQty = row.queue.quantityRequested || 1;
      const completedQuantity = row.queue.quantityCompleted || 0;
      const allocatedPacketCount = Math.max(completedQuantity, builtPacketCounts.get(row.queue.id) || 0);
      const availableToPrint = Math.max(0, maxQty - allocatedPacketCount);
      const requestedQty = printQuantities[row.queue.id] ? Math.max(0, printQuantities[row.queue.id]) : availableToPrint;
      const qty = Math.min(requestedQty, availableToPrint);

      if (qty <= 0) {
        skippedAllocated.push({
          queueId: row.queue.id,
          partNumber,
          quantityRequested: maxQty,
          allocatedPacketCount,
        });
        continue;
      }
      
      for (let offset = 0; offset < qty; offset++) {
        const seq = allocatedPacketCount + offset + 1;
        const barcodeValue = `MFG-${row.queue.id}-${partNumber}-${seq}`;
        
        let barcodeImage;
        try {
          barcodeImage = await generateBarcodeImage(barcodeValue, {
            width: 2,
            height: 50,
            displayValue: true,
            fontSize: 10,
            margin: 5,
          });
        } catch (err) {
          console.error(`Error generating barcode for ${barcodeValue}:`, err);
          barcodeImage = null;
        }
        
        allLabels.push({
          queueId: row.queue.id,
          barcodeValue,
          barcodeImage,
          partNumber,
          partName: row.item?.name || 'Unknown',
          quantityRequested: maxQty,
          sequenceNumber: seq,
          quantityCompleted: row.queue.quantityCompleted || 0,
          allocatedPacketCount,
          printableBarcodeCount: availableToPrint,
          priority: row.queue.priority,
          dueDate: row.queue.dueDate,
          status: row.queue.status,
        });
      }
    }
    
    if (allLabels.length === 0) {
      return res.status(409).json({
        error: 'No unallocated packet barcodes available to print',
        skippedAllocated,
      });
    }

    res.json({ labels: allLabels, count: allLabels.length, skippedAllocated });
  } catch (error) {
    console.error('Error generating bulk barcodes:', error);
    res.status(500).json({ error: 'Failed to generate bulk barcodes' });
  }
});

// Scan a packet barcode to start working on it - returns BOM details, FIFO inventory, ply schedule, cuts
router.post('/scan-start', async (req: Request, res: Response) => {
  try {
    const { barcode, username } = req.body;
    
    if (!barcode) {
      return res.status(400).json({ error: 'Barcode is required' });
    }
    
    // Parse packet barcodes. New labels use MFG-{id}-{partNumber}-{seq};
    // existing production packet labels may still use PKT-{partNumber}-{id}-{packetNumber}-{timestamp}.
    // Part numbers can contain hyphens, so split from stable id/sequence positions.
    const parsedBarcode = parseManufacturingPacketBarcode(barcode);
    if (!parsedBarcode) {
      return res.status(400).json({ error: 'Invalid packet barcode format. Expected: MFG-{id}-{partNumber}-{seq} or existing PKT-{partNumber}-{id}-{packetNumber}-{timestamp}' });
    }
    
    const printedQueueId = parsedBarcode.queueId;
    
    if (isNaN(printedQueueId)) {
      return res.status(400).json({ error: 'Invalid queue ID in barcode' });
    }
    
    // Get the queue item - enforce Cutting Table department
    let queueItem = await db.query.manufacturingQueue.findFirst({
      where: and(
        eq(manufacturingQueue.id, printedQueueId),
        eq(manufacturingQueue.department, 'Cutting Table')
      ),
    });
    let queueId = printedQueueId;
    let aliasNotice: string | null = null;

    if (!queueItem) {
      // The printed barcode references a queue id that no longer exists. Try
      // resolving via the alias map (populated by the duplicate-grouping
      // backfill, the unschedule endpoint, and new-row creation).
      const { resolveAliasedQueueRow } = await import('../utils/cuttingPacketBarcodeAlias');
      const resolution = await resolveAliasedQueueRow(printedQueueId);
      if (!resolution) {
        return res.status(404).json({
          error: 'Cutting table queue item not found',
          message: 'This packet barcode is not recognized. Please reprint the label or escalate to a supervisor.',
        });
      }
      if (!resolution.successorRow) {
        return res.status(409).json({
          error: 'Packet has been unscheduled',
          message: 'This packet has been unscheduled from the cutting queue. Please reprint a fresh label or escalate to a supervisor.',
          aliasReason: resolution.alias.reason,
        });
      }
      queueItem = resolution.successorRow;
      queueId = queueItem.id;
      aliasNotice = `Original printed queue #${printedQueueId} was ${resolution.alias.reason}; routed to current queue #${queueId}.`;
      console.log(`[scan-start] Resolved aliased barcode ${barcode}: printed queue #${printedQueueId} → current queue #${queueId} (${resolution.alias.reason})`);
    }
    
    if (queueItem.status === 'COMPLETED') {
      return res.status(400).json({ error: 'This packet has already been completed' });
    }
    
    if (queueItem.status === 'CANCELLED') {
      return res.status(400).json({ error: 'This packet has been cancelled' });
    }
    
    // Get inventory item
    const inventoryItem = await db.query.inventoryItems.findFirst({
      where: eq(inventoryItems.id, queueItem.inventoryItemId),
    });
    
    // Transition to IN_PROGRESS if PENDING
    if (queueItem.status === 'PENDING') {
      await db
        .update(manufacturingQueue)
        .set({
          status: 'IN_PROGRESS',
          startedAt: new Date(),
          assignedTo: username || 'scanner',
          updatedAt: new Date(),
        })
        .where(eq(manufacturingQueue.id, queueId));
    }
    
    let bomId: string | null = null;
    let notesMaterialType: string | null = null;
    let notesPacketName: string | null = null;
    try {
      if (queueItem.notes) {
        const parsedNotes = JSON.parse(queueItem.notes);
        bomId = parsedNotes.bomId || null;
        notesMaterialType = parsedNotes.materialType || null;
        notesPacketName = parsedNotes.packetName || null;
      }
    } catch {}
    
    let packetBom = null;
    const allActiveBoms = await db.select().from(cuttingPacketBOMs).where(eq(cuttingPacketBOMs.isActive, true));
    
    // Strategy 1: Direct bomId lookup (most specific)
    if (bomId) {
      packetBom = allActiveBoms.find(b => b.id === bomId) || null;
      if (!packetBom) {
        packetBom = await db.query.cuttingPacketBOMs.findFirst({
          where: eq(cuttingPacketBOMs.id, bomId),
        });
      }
    }
    
    // Strategy 2: Match by material type from notes (reliable - material type describes the actual packet)
    if (!packetBom && notesMaterialType) {
      const materialToPacketType: Record<string, string> = {
        'carbon_fiber': 'carbon fiber packet',
        'fiberglass': 'fiberglass packet',
        'mesa': 'mesa packet',
        'p2_disruptor': 'disruptor',
        'p2_disruptor_packet': 'disruptor packet',
        'p2_antenna': 'antenna cover',
        'p2_antenna_cover': 'antenna cover packet',
      };
      const targetType = materialToPacketType[notesMaterialType];
      if (targetType) {
        packetBom = allActiveBoms.find(b => 
          b.packetType.toLowerCase() === targetType ||
          b.packetType.toLowerCase().includes(targetType) ||
          targetType.includes(b.packetType.toLowerCase())
        ) || null;
      }
    }
    
    // Strategy 3: Match by packet name from notes (reliable - describes the actual packet)
    if (!packetBom && notesPacketName) {
      packetBom = allActiveBoms.find(b => 
        b.packetType.toLowerCase() === notesPacketName!.toLowerCase() ||
        b.packetType.toLowerCase().includes(notesPacketName!.toLowerCase()) ||
        notesPacketName!.toLowerCase().includes(b.packetType.toLowerCase())
      ) || null;
    }
    
    // Strategy 3.5: Match by inventory item ID (direct FK link — most reliable static match)
    if (!packetBom && queueItem.inventoryItemId) {
      packetBom = allActiveBoms.find(b => b.inventoryItemId != null && b.inventoryItemId === queueItem.inventoryItemId) || null;
    }

    // Strategy 4: Match by inventory item part number (less reliable - inventory linkage may be wrong)
    if (!packetBom && inventoryItem?.agPartNumber) {
      packetBom = allActiveBoms.find(b => b.partNumber === inventoryItem!.agPartNumber) || null;
    }
    
    // Strategy 5: Match by inventory item name (least reliable fallback)
    if (!packetBom && inventoryItem?.name) {
      packetBom = allActiveBoms.find(b => 
        b.packetType.toLowerCase() === inventoryItem!.name.toLowerCase() ||
        b.packetType.toLowerCase().includes(inventoryItem!.name.toLowerCase()) ||
        inventoryItem!.name.toLowerCase().includes(b.packetType.toLowerCase())
      ) || null;
    }
    
    // Get BOM materials and parts
    let bomMaterials: any[] = [];
    let bomParts: any[] = [];
    if (packetBom) {
      bomMaterials = await db
        .select()
        .from(cuttingPacketBOMMaterials)
        .where(eq(cuttingPacketBOMMaterials.packetBomId, packetBom.id));
      
      bomParts = await db
        .select()
        .from(cuttingPacketBOMParts)
        .where(eq(cuttingPacketBOMParts.packetBomId, packetBom.id))
        .orderBy(asc(cuttingPacketBOMParts.sortOrder));
    }
    
    // Get FIFO-ordered fabric inventory matching BOM materials
    // Collect fabricType, commonName, and fallback to part number base from BOM materials and parts
    const allRequiredFabricTypes = new Set<string>();
    bomMaterials.forEach((m: any) => {
      if (m.fabricType?.trim()) allRequiredFabricTypes.add(m.fabricType.trim().toLowerCase());
      if (m.commonName?.trim()) allRequiredFabricTypes.add(m.commonName.trim().toLowerCase());
    });
    bomParts.forEach((p: any) => {
      if (p.fabricType?.trim()) allRequiredFabricTypes.add(p.fabricType.trim().toLowerCase());
      if (p.commonName?.trim()) allRequiredFabricTypes.add(p.commonName.trim().toLowerCase());
      if (!p.fabricType?.trim() && !p.commonName?.trim() && p.partNumber?.trim()) {
        const basePartNum = p.partNumber.trim().replace(/[a-zA-Z]+$/, '');
        if (basePartNum) allRequiredFabricTypes.add(basePartNum.toLowerCase());
      }
    });
    const requiredTypes = Array.from(allRequiredFabricTypes);
    
    let fifoInventory: any[] = [];
    const activeFabric = await db
      .select()
      .from(cuttingFabricInventory)
      .where(eq(cuttingFabricInventory.status, 'active'))
      .orderBy(asc(cuttingFabricInventory.receivedDate), asc(cuttingFabricInventory.expirationDate));
    
    // Stricter fabric matching: require significant overlap, not just substring containment
    // Minimum match length of 4 chars prevents short strings from matching everything
    // Also supports numeric part number prefix matching (e.g., required "301" matches roll "301" or "301g")
    const strictFabricMatch = (fabricFields: string[], requiredTypes: string[]): boolean => {
      const validFields = fabricFields.filter(f => f.length > 0);
      if (validFields.length === 0) return false;
      return requiredTypes.some(req => 
        validFields.some(field => {
          if (field === req) return true;
          if (req.length >= 4 && field.includes(req)) return true;
          if (field.length >= 4 && req.includes(field)) return true;
          if (/^\d+$/.test(req) && req.length >= 3) {
            if (field.startsWith(req) || field === req) return true;
          }
          if (/^\d+$/.test(field) && field.length >= 3) {
            if (req.startsWith(field) || req === field) return true;
          }
          return false;
        })
      );
    };
    
    if (requiredTypes.length > 0) {
      fifoInventory = activeFabric.filter(f => {
        const ft = (f.fabric || '').trim().toLowerCase();
        const nickname = (f.nickname || '').trim().toLowerCase();
        const partNum = (f.fabricPartNumber || '').trim().toLowerCase();
        return strictFabricMatch([ft, nickname, partNum], requiredTypes);
      });
      console.log(`[scan-start FIFO] Required fabric types: [${requiredTypes.join(', ')}], matched ${fifoInventory.length} of ${activeFabric.length} active rolls`);
    } else {
      // No BOM fabric requirements found - don't show random rolls
      fifoInventory = [];
      console.log(`[scan-start FIFO] No BOM fabric types found for packet. BOM: ${packetBom?.id || 'none'}, materials: ${bomMaterials.length}, parts: ${bomParts.length}`);
    }
    
    let plySchedule = null;
    let cutsConfig = null;
    let cutPrograms = null;
    if (packetBom) {
      plySchedule = packetBom.plyScheduleConfig || null;
      cutsConfig = packetBom.cutsConfig || null;
      cutPrograms = packetBom.cutProgramsConfig || null;
    }
    
    const remaining = queueItem.quantityRequested - (queueItem.quantityCompleted || 0);
    const yieldPerCut = packetBom?.yieldPerCut || 4;
    const estimatedCuts = Math.ceil(remaining / yieldPerCut);
    
    let packetName = null;
    let userNotes = null;
    try {
      if (queueItem.notes) {
        const parsedNotes = JSON.parse(queueItem.notes);
        packetName = parsedNotes.packetName || null;
        userNotes = parsedNotes.userNotes || null;
      }
    } catch {}
    const displayName = packetName || userNotes || inventoryItem?.name || null;

    // Set the scanned built packet to ALLOCATED if it is currently AVAILABLE.
    // The optional seq segment in the MFG barcode identifies which packet (by
    // display rank = id-ascending order within this queue item) was physically scanned.
    const scannedSeq = parsedBarcode.sequence;
    try {
      // Fetch all built packets for this queue item ordered by id ascending
      // so we can derive the same display rank used in the built-packets endpoint.
      const builtPacketsForQueue = await db
        .select({ id: cuttingBuiltPackets.id, status: cuttingBuiltPackets.status })
        .from(cuttingBuiltPackets)
        .where(like(cuttingBuiltPackets.barcode, `PKT-%-${queueId}-%-%`))
        .orderBy(asc(cuttingBuiltPackets.id));

      let targetPacket: { id: number; status: string } | null = null;
      if (parsedBarcode.builtPacketBarcode) {
        targetPacket = await db.query.cuttingBuiltPackets.findFirst({
          where: eq(cuttingBuiltPackets.barcode, parsedBarcode.builtPacketBarcode),
        }) ?? null;
      }
      if (!targetPacket && scannedSeq !== null && scannedSeq >= 1 && scannedSeq <= builtPacketsForQueue.length) {
        // Use rank-based lookup (1-indexed)
        targetPacket = builtPacketsForQueue[scannedSeq - 1];
      }
      if (!targetPacket) {
        // No sequence info — update the first AVAILABLE packet for this queue item
        targetPacket = builtPacketsForQueue.find(p => p.status === 'AVAILABLE') ?? null;
      }

      if (targetPacket && targetPacket.status === 'AVAILABLE') {
        await db
          .update(cuttingBuiltPackets)
          .set({ status: 'ALLOCATED' })
          .where(eq(cuttingBuiltPackets.id, targetPacket.id));
      }
    } catch (allocErr) {
      // Non-fatal — log but don't fail the scan-start response
      console.error('[scan-start] Failed to set ALLOCATED status:', allocErr);
    }
    
    res.json({
      queueItem: {
        ...queueItem,
        status: queueItem.status === 'PENDING' ? 'IN_PROGRESS' : queueItem.status,
        partNumber: inventoryItem?.agPartNumber,
        partName: inventoryItem?.name,
        displayName,
        remaining,
        estimatedCuts,
      },
      aliasNotice,
      printedQueueId,
      resolvedQueueId: queueId,
      bom: packetBom ? {
        id: packetBom.id,
        packetType: packetBom.packetType,
        partNumber: packetBom.partNumber,
        yieldPerCut: packetBom.yieldPerCut,
        squareMetersPerCut: packetBom.squareMetersPerCut,
        wasteFactor: packetBom.wasteFactor,
        noPlySchedule: packetBom.noPlySchedule,
      } : null,
      bomMaterials,
      bomParts,
      plySchedule,
      cutsConfig,
      cutPrograms,
      requiredFabricTypes: requiredTypes,
      fifoInventory: fifoInventory.map(f => ({
        id: f.id,
        fabric: f.fabric,
        fabricPartNumber: f.fabricPartNumber,
        nickname: f.nickname,
        lotNumber: f.lotNumber,
        batchNumber: f.batchNumber,
        rollNumber: f.rollNumber,
        internalControlNumber: f.internalControlNumber,
        squareMeters: f.squareMeters,
        receivedDate: f.receivedDate,
        expirationDate: f.expirationDate,
        location: f.location,
        freezerNumber: f.freezerNumber,
        barcode: f.barcode,
        status: f.status,
      })),
    });
  } catch (error) {
    console.error('Error processing scan-start:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Failed to process packet scan', message });
  }
});

// Unschedule (delete) a cutting table queue item - blocked for completed or partially completed items
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parsedId = parseInt(id);
    if (isNaN(parsedId)) {
      return res.status(400).json({ error: 'Invalid queue item ID' });
    }

    const queueItem = await db.query.manufacturingQueue.findFirst({
      where: and(
        eq(manufacturingQueue.id, parsedId),
        eq(manufacturingQueue.department, 'Cutting Table')
      ),
    });

    if (!queueItem) {
      return res.status(404).json({ error: 'Cutting table queue item not found' });
    }

    if (queueItem.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Cannot unschedule a completed item' });
    }

    if (queueItem.status === 'IN_PROGRESS' && (queueItem.quantityCompleted || 0) > 0) {
      return res.status(400).json({ error: 'Cannot unschedule an item that has partially completed work' });
    }

    const builtPackets = await db
      .select({ barcode: cuttingBuiltPackets.barcode })
      .from(cuttingBuiltPackets);
    const builtPacketCount = builtPackets.filter((packet) => parseQueueIdFromBuiltPacketBarcode(packet.barcode) === parsedId).length;

    if ((queueItem.quantityCompleted || 0) > 0 || builtPacketCount > 0) {
      return res.status(409).json({
        error: 'Cannot unschedule a packet that is already in production',
        productionProtected: true,
        productionProtectionReason: builtPacketCount > 0 ? 'built_packets_exist' : 'quantity_completed',
      });
    }

    // Capture the packet identity BEFORE deleting so we can preserve barcode→packet
    // mapping for any labels printed against this row. A future sync that creates a
    // fresh queue row for the same packet+due-date+inventory_item will backfill
    // the successor pointer; until then, scanned old labels will surface the
    // "this packet was unscheduled" message instead of a generic 404.
    let packetName: string | null = null;
    try {
      if (queueItem.notes) {
        const parsedNotes = JSON.parse(queueItem.notes);
        if (typeof parsedNotes?.packetName === 'string') packetName = parsedNotes.packetName;
      }
    } catch {}
    const { recordAlias, dueDateBucket } = await import('../utils/cuttingPacketBarcodeAlias');

    await db.delete(manufacturingQueue).where(eq(manufacturingQueue.id, parsedId));

    await recordAlias(parsedId, null, {
      inventoryItemId: queueItem.inventoryItemId,
      packetName,
      dueDateBucket: dueDateBucket(queueItem.dueDate),
    }, 'unscheduled');

    res.json({ success: true, message: 'Queue item unscheduled successfully' });
  } catch (error) {
    console.error('Error unscheduling queue item:', error);
    res.status(500).json({ error: 'Failed to unschedule queue item' });
  }
});

// Validate a scanned material roll against the BOM for the active queue item
router.post('/:id/validate-material', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { barcode } = req.body;
    
    if (!barcode) {
      return res.status(400).json({ error: 'Material barcode is required' });
    }
    
    const parsedId = parseInt(id);
    if (isNaN(parsedId)) {
      return res.status(400).json({ error: 'Invalid queue item ID' });
    }
    
    // Get the queue item - enforce Cutting Table department
    const queueItem = await db.query.manufacturingQueue.findFirst({
      where: and(
        eq(manufacturingQueue.id, parsedId),
        eq(manufacturingQueue.department, 'Cutting Table')
      ),
    });
    
    if (!queueItem) {
      return res.status(404).json({ error: 'Cutting table queue item not found' });
    }
    
    // Get inventory item for part number
    const inventoryItem = await db.query.inventoryItems.findFirst({
      where: eq(inventoryItems.id, queueItem.inventoryItemId),
    });
    
    // Find the fabric roll by barcode, ICN, roll number, or ID
    const allFabric = await db
      .select()
      .from(cuttingFabricInventory)
      .where(eq(cuttingFabricInventory.status, 'active'));
    
    const barcodeNorm = barcode.trim();
    
    // Try exact match first on barcode, ICN, or roll number
    let matchedRoll = allFabric.find(f => 
      f.barcode === barcodeNorm ||
      f.internalControlNumber === barcodeNorm ||
      f.rollNumber === barcodeNorm
    );
    
    // Try case-insensitive match
    if (!matchedRoll) {
      const barcodeLower = barcodeNorm.toLowerCase();
      matchedRoll = allFabric.find(f => 
        (f.barcode && f.barcode.toLowerCase() === barcodeLower) ||
        (f.internalControlNumber && f.internalControlNumber.toLowerCase() === barcodeLower) ||
        (f.rollNumber && f.rollNumber.toLowerCase() === barcodeLower)
      );
    }
    
    // Try matching by fabric inventory ID (UUID)
    if (!matchedRoll) {
      matchedRoll = allFabric.find(f => f.id === barcodeNorm);
    }
    
    // Try parsing synthetic barcode format: FAB-{ICN}-{id_prefix}
    if (!matchedRoll && barcodeNorm.startsWith('FAB-')) {
      const parts = barcodeNorm.split('-');
      if (parts.length >= 3) {
        const icnPart = parts.slice(1, -1).join('-');
        const idPrefix = parts[parts.length - 1];
        matchedRoll = allFabric.find(f =>
          (f.internalControlNumber && f.internalControlNumber === icnPart) ||
          (f.id && f.id.startsWith(idPrefix))
        );
      }
    }
    
    // Try matching by fabric part number directly
    if (!matchedRoll) {
      matchedRoll = allFabric.find(f =>
        f.fabricPartNumber && f.fabricPartNumber === barcodeNorm
      );
    }
    
    if (!matchedRoll) {
      console.log(`[validate-material] Roll not found. Scanned: "${barcodeNorm}". Active rolls: ${allFabric.length}. Sample barcodes: ${allFabric.slice(0, 5).map(f => `barcode=${f.barcode}, ICN=${f.internalControlNumber}, roll=${f.rollNumber}`).join(' | ')}`);
      return res.status(404).json({ 
        valid: false,
        error: 'Material roll not found in inventory',
        scannedBarcode: barcode,
      });
    }
    
    // Find matching BOM to validate material (mirrors scan-start BOM matching strategies)
    let bomId: string | null = null;
    let notesMaterialType: string | null = null;
    let notesPacketName: string | null = null;
    try {
      if (queueItem.notes) {
        const parsedNotes = JSON.parse(queueItem.notes);
        bomId = parsedNotes.bomId || null;
        notesMaterialType = parsedNotes.materialType || null;
        notesPacketName = parsedNotes.packetName || null;
      }
    } catch {}
    
    let packetBom = null;
    const allActiveBoms = await db.select().from(cuttingPacketBOMs).where(eq(cuttingPacketBOMs.isActive, true));
    
    if (bomId) {
      packetBom = allActiveBoms.find(b => b.id === bomId) || null;
      if (!packetBom) {
        packetBom = await db.query.cuttingPacketBOMs.findFirst({
          where: eq(cuttingPacketBOMs.id, bomId),
        });
      }
    }
    if (!packetBom && notesMaterialType) {
      const materialToPacketType: Record<string, string> = {
        'carbon_fiber': 'carbon fiber packet',
        'fiberglass': 'fiberglass packet',
        'mesa': 'mesa packet',
        'p2_disruptor': 'disruptor',
        'p2_disruptor_packet': 'disruptor packet',
        'p2_antenna': 'antenna cover',
        'p2_antenna_cover': 'antenna cover packet',
      };
      const targetType = materialToPacketType[notesMaterialType];
      if (targetType) {
        packetBom = allActiveBoms.find(b =>
          b.packetType.toLowerCase() === targetType ||
          b.packetType.toLowerCase().includes(targetType) ||
          targetType.includes(b.packetType.toLowerCase())
        ) || null;
      }
    }
    if (!packetBom && notesPacketName) {
      packetBom = allActiveBoms.find(b =>
        b.packetType.toLowerCase() === notesPacketName!.toLowerCase() ||
        b.packetType.toLowerCase().includes(notesPacketName!.toLowerCase()) ||
        notesPacketName!.toLowerCase().includes(b.packetType.toLowerCase())
      ) || null;
    }
    if (!packetBom && queueItem.inventoryItemId) {
      packetBom = allActiveBoms.find(b => b.inventoryItemId != null && b.inventoryItemId === queueItem.inventoryItemId) || null;
    }
    if (!packetBom && inventoryItem?.agPartNumber) {
      packetBom = allActiveBoms.find(b => b.partNumber === inventoryItem!.agPartNumber) || null;
    }
    if (!packetBom && inventoryItem?.name) {
      packetBom = allActiveBoms.find(b =>
        b.packetType.toLowerCase() === inventoryItem!.name.toLowerCase() ||
        b.packetType.toLowerCase().includes(inventoryItem!.name.toLowerCase()) ||
        inventoryItem!.name.toLowerCase().includes(b.packetType.toLowerCase())
      ) || null;
    }
    
    // If no BOM exists, allow any material (no validation possible)
    if (!packetBom) {
      return res.json({
        valid: true,
        warning: 'No BOM configured for this packet - material accepted without validation',
        roll: {
          id: matchedRoll.id,
          fabric: matchedRoll.fabric,
          fabricPartNumber: matchedRoll.fabricPartNumber,
          nickname: matchedRoll.nickname,
          lotNumber: matchedRoll.lotNumber,
          batchNumber: matchedRoll.batchNumber,
          rollNumber: matchedRoll.rollNumber,
          internalControlNumber: matchedRoll.internalControlNumber,
          squareMeters: matchedRoll.squareMeters,
          expirationDate: matchedRoll.expirationDate,
          location: matchedRoll.location,
          freezerNumber: matchedRoll.freezerNumber,
          barcode: matchedRoll.barcode,
        },
      });
    }
    
    // Get BOM materials and parts to check fabric types
    const bomMaterials = await db
      .select()
      .from(cuttingPacketBOMMaterials)
      .where(eq(cuttingPacketBOMMaterials.packetBomId, packetBom.id));
    
    const bomParts = await db
      .select()
      .from(cuttingPacketBOMParts)
      .where(eq(cuttingPacketBOMParts.packetBomId, packetBom.id));
    
    // Collect all allowed fabric types from BOM (filter out empty strings)
    // Also fall back to base part number when fabricType/commonName are empty
    const allowedFabricTypes = new Set<string>();
    bomMaterials.forEach(m => {
      if (m.fabricType?.trim()) allowedFabricTypes.add(m.fabricType.trim().toLowerCase());
      if (m.commonName?.trim()) allowedFabricTypes.add(m.commonName.trim().toLowerCase());
    });
    bomParts.forEach(p => {
      if (p.fabricType?.trim()) allowedFabricTypes.add(p.fabricType.trim().toLowerCase());
      if (p.commonName?.trim()) allowedFabricTypes.add(p.commonName.trim().toLowerCase());
      if (!p.fabricType?.trim() && !p.commonName?.trim() && p.partNumber?.trim()) {
        const basePartNum = p.partNumber.trim().replace(/[a-zA-Z]+$/, '');
        if (basePartNum) allowedFabricTypes.add(basePartNum.toLowerCase());
      }
    });
    
    // Check if the scanned roll's fabric type matches any allowed type
    // Only compare non-empty fields to prevent false matches
    const rollFields = [
      (matchedRoll.fabric || '').trim().toLowerCase(),
      (matchedRoll.nickname || '').trim().toLowerCase(),
      (matchedRoll.fabricPartNumber || '').trim().toLowerCase(),
    ].filter(f => f.length > 0);
    
    if (rollFields.length === 0) {
      return res.status(400).json({
        valid: false,
        error: 'Scanned roll has no identifiable fabric type',
        scannedBarcode: barcode,
      });
    }
    
    const isMatch = Array.from(allowedFabricTypes).some(allowed => 
      rollFields.some(field => {
        if (field === allowed) return true;
        if (allowed.length >= 4 && field.includes(allowed)) return true;
        if (field.length >= 4 && allowed.includes(field)) return true;
        if (/^\d+$/.test(allowed) && allowed.length >= 3) {
          if (field.startsWith(allowed) || field === allowed) return true;
        }
        if (/^\d+$/.test(field) && field.length >= 3) {
          if (allowed.startsWith(field) || allowed === field) return true;
        }
        return false;
      })
    );
    
    if (!isMatch) {
      console.log(`[validate-material] REJECTED: roll partNum="${matchedRoll.fabricPartNumber}", fabric="${(matchedRoll.fabric||'').substring(0,40)}", allowedTypes=[${Array.from(allowedFabricTypes).join(', ')}], rollFields=[${rollFields.join(', ')}], BOM=${packetBom.id}`);
      return res.status(400).json({
        valid: false,
        error: `Material "${matchedRoll.fabric || matchedRoll.nickname || barcode}" does not match the BOM requirements for this packet`,
        scannedFabric: matchedRoll.fabric || matchedRoll.nickname,
        allowedTypes: Array.from(allowedFabricTypes),
        roll: {
          id: matchedRoll.id,
          fabric: matchedRoll.fabric,
          rollNumber: matchedRoll.rollNumber,
        },
      });
    }
    
    res.json({
      valid: true,
      roll: {
        id: matchedRoll.id,
        fabric: matchedRoll.fabric,
        fabricPartNumber: matchedRoll.fabricPartNumber,
        nickname: matchedRoll.nickname,
        lotNumber: matchedRoll.lotNumber,
        batchNumber: matchedRoll.batchNumber,
        rollNumber: matchedRoll.rollNumber,
        internalControlNumber: matchedRoll.internalControlNumber,
        squareMeters: matchedRoll.squareMeters,
        expirationDate: matchedRoll.expirationDate,
        location: matchedRoll.location,
        freezerNumber: matchedRoll.freezerNumber,
        barcode: matchedRoll.barcode,
      },
    });
  } catch (error) {
    console.error('Error validating material:', error);
    res.status(500).json({ error: 'Failed to validate material' });
  }
});

// Get built packets with their fabric sources (for operator review/edit)
router.get('/built-packets', async (req: Request, res: Response) => {
  try {
    const { limit = '50', offset = '0', status } = req.query;
    const parsedLimit = parseInt(limit as string);
    const parsedOffset = parseInt(offset as string);

    await ensureBuiltPacketsForCompletedQueueRows();

    const packets = await db
      .select({
        id: cuttingBuiltPackets.id,
        barcode: cuttingBuiltPackets.barcode,
        packetNumber: cuttingBuiltPackets.packetNumber,
        buildDate: cuttingBuiltPackets.buildDate,
        status: cuttingBuiltPackets.status,
        isMixedFabric: cuttingBuiltPackets.isMixedFabric,
        fabricSourceCount: cuttingBuiltPackets.fabricSourceCount,
        notes: cuttingBuiltPackets.notes,
        createdBy: cuttingBuiltPackets.createdBy,
        allocatedToOrder: cuttingBuiltPackets.allocatedToOrder,
        categoryName: cuttingProductCategories.categoryName,
      })
      .from(cuttingBuiltPackets)
      .leftJoin(cuttingProductCategories, eq(cuttingProductCategories.id, cuttingBuiltPackets.productCategoryId))
      .where(status ? eq(cuttingBuiltPackets.status, status as string) : undefined)
      .orderBy(desc(cuttingBuiltPackets.buildDate))
      .limit(parsedLimit)
      .offset(parsedOffset);

    const packetIds = packets.map(p => p.id);
    let fabricSources: any[] = [];
    if (packetIds.length > 0) {
      const sources = await db
        .select()
        .from(cuttingBuiltPacketFabricSources)
        .where(inArray(cuttingBuiltPacketFabricSources.builtPacketId, packetIds));
      fabricSources = sources;
    }

    const parsedPackets = packets.map(packet => {
      const parsedBarcode = parseBuiltPacketBarcode(packet.barcode);
      let sku: string | null = parsedBarcode?.sku ?? null;
      let queueId: string | null = parsedBarcode ? String(parsedBarcode.queueId) : null;
      try {
        const parts = packet.barcode.split('-');
        if (parts.length >= 5 && parts[0] === 'PKT') {
          queueId = queueId ?? parts[parts.length - 3];
          sku = sku ?? parts.slice(1, parts.length - 3).join('-');
        }
      } catch {
        // non-standard barcode — leave sku and queueId as null
      }
      return { ...packet, sku, queueId, printedPacketNumber: parsedBarcode?.packetNumber ?? packet.packetNumber };
    });

    // Batch-fetch quantityRequested for all referenced queue items so the
    // frontend can show an accurate "Packet X of Y" without relying on a
    // filtered mfgQueueItems list.
    const uniqueQueueIds = [...new Set(
      parsedPackets.map(p => p.queueId).filter((id): id is string => id !== null)
    )].map(id => parseInt(id)).filter(id => !isNaN(id));

    const queueTotals: Record<string, number> = {};
    if (uniqueQueueIds.length > 0) {
      const queueRows = await db
        .select({ id: manufacturingQueue.id, quantityRequested: manufacturingQueue.quantityRequested })
        .from(manufacturingQueue)
        .where(inArray(manufacturingQueue.id, uniqueQueueIds));
      queueRows.forEach(row => {
        queueTotals[String(row.id)] = row.quantityRequested;
      });
    }

    // Compute displayPacketNumber: rank each packet within its queueId group,
    // sorted by id ascending. This must be computed against ALL packets for the
    // relevant queue IDs — not just the current page — so ranks remain correct
    // even when earlier packets are outside the paginated window.
    const relevantQueueIds = [...new Set(
      parsedPackets.map(p => p.queueId).filter((id): id is string => id !== null)
    )];

    const displayPacketNumberMap: Record<number, number> = {};
    if (relevantQueueIds.length > 0) {
      // Fetch id + barcode for ALL packets whose barcode references one of the
      // relevant queue IDs. We do this with a single query and reconstruct
      // queueId from the barcode to avoid a schema join.
      const allPacketsForQueues = await db
        .select({ id: cuttingBuiltPackets.id, barcode: cuttingBuiltPackets.barcode })
        .from(cuttingBuiltPackets)
        .orderBy(asc(cuttingBuiltPackets.id));

      // Group by derived queueId and assign rank
      const groupedById: Record<string, number[]> = {};
      for (const row of allPacketsForQueues) {
        let qId: string | null = parseBuiltPacketBarcode(row.barcode)?.queueId.toString() ?? null;
        try {
          const parts = row.barcode.split('-');
          if (parts.length >= 5 && parts[0] === 'PKT') {
            qId = qId ?? parts[parts.length - 3];
          }
        } catch {}
        if (qId !== null && relevantQueueIds.includes(qId)) {
          if (!groupedById[qId]) groupedById[qId] = [];
          groupedById[qId].push(row.id);
        }
      }
      for (const ids of Object.values(groupedById)) {
        // ids are already in id-ascending order (ordered by asc(id) above)
        ids.forEach((id, idx) => {
          displayPacketNumberMap[id] = idx + 1;
        });
      }
    }

    const result = parsedPackets.map(packet => ({
      ...packet,
      displayPacketNumber: displayPacketNumberMap[packet.id] ?? packet.packetNumber,
      quantityOrdered: packet.queueId ? (queueTotals[packet.queueId] ?? null) : null,
      fabricSources: fabricSources.filter(s => s.builtPacketId === packet.id),
    }));

    let batchRows: any[] = [];
    if (!status) {
      const cuttingTableDept = supplySourceDashboardToLegacyDept('CUTTING_TABLE')!;
      const cuttingTableCategories = getDashboardCategories('CUTTING_TABLE');
      const completedStockRows = await db
        .select({
          queue: manufacturingQueue,
          item: inventoryItems,
        })
        .from(manufacturingQueue)
        .leftJoin(inventoryItems, eq(manufacturingQueue.inventoryItemId, inventoryItems.id))
        .where(and(
          or(
            eq(manufacturingQueue.department, cuttingTableDept),
            inArray(inventoryItems.manufacturedCategory, cuttingTableCategories)
          ),
          eq(manufacturingQueue.status, 'COMPLETED')
        ))
        .orderBy(desc(manufacturingQueue.completedAt), desc(manufacturingQueue.updatedAt))
        .limit(parsedLimit);

      batchRows = completedStockRows
        .filter((row) => row.item && isP1PacketInventoryQueueItem(parseQueueNotes(row.queue.notes)))
        .map((row) => ({
          id: -row.queue.id,
          barcode: `BATCH-${row.queue.id}`,
          packetNumber: 1,
          displayPacketNumber: null,
          buildDate: row.queue.completedAt || row.queue.updatedAt || row.queue.createdAt,
          status: 'BATCH',
          isMixedFabric: false,
          fabricSourceCount: 0,
          notes: row.queue.completionNotes || row.queue.notes,
          createdBy: row.queue.completedBy,
          allocatedToOrder: null,
          categoryName: row.item?.name || 'P1 Stock Packet',
          sku: row.item?.agPartNumber || null,
          queueId: String(row.queue.id),
          quantityOrdered: row.queue.quantityCompleted || row.queue.quantityRequested || 0,
          batchQuantity: row.queue.quantityCompleted || row.queue.quantityRequested || 0,
          isBatchEntry: true,
          fabricSources: [],
        }));
    }

    const combined = [...result, ...batchRows]
      .sort((a, b) => new Date(b.buildDate).getTime() - new Date(a.buildDate).getTime())
      .slice(0, parsedLimit);

    res.json(combined);
  } catch (error) {
    console.error('Error fetching built packets:', error);
    res.status(500).json({ error: 'Failed to fetch built packets' });
  }
});

// Add a fabric source to a built packet by scanning a material roll barcode.
router.post('/built-packets/:packetId/fabric-sources/scan', async (req: Request, res: Response) => {
  try {
    const { packetId } = req.params;
    const { barcode, quantityUsed = 1 } = req.body;
    const scannedBarcode = String(barcode || '').trim();

    if (!scannedBarcode) {
      return res.status(400).json({ error: 'Material barcode is required' });
    }

    const packet = await db.query.cuttingBuiltPackets.findFirst({
      where: eq(cuttingBuiltPackets.id, parseInt(packetId)),
    });

    if (!packet) {
      return res.status(404).json({ error: 'Built packet not found' });
    }

    const matchedRoll = await db.query.cuttingFabricInventory.findFirst({
      where: or(
        eq(cuttingFabricInventory.barcode, scannedBarcode),
        eq(cuttingFabricInventory.internalControlNumber, scannedBarcode),
        eq(cuttingFabricInventory.rollNumber, scannedBarcode)
      ),
    });

    if (!matchedRoll) {
      return res.status(404).json({
        error: 'Material roll not found',
        scannedBarcode,
      });
    }

    const existingSource = await db.query.cuttingBuiltPacketFabricSources.findFirst({
      where: and(
        eq(cuttingBuiltPacketFabricSources.builtPacketId, packet.id),
        eq(cuttingBuiltPacketFabricSources.fabricInventoryId, matchedRoll.id)
      ),
    });

    if (existingSource) {
      return res.status(409).json({ error: 'This material roll is already attached to the packet' });
    }

    const currentSourceCount = await db
      .select({ sourceCount: count() })
      .from(cuttingBuiltPacketFabricSources)
      .where(eq(cuttingBuiltPacketFabricSources.builtPacketId, packet.id));

    const [createdSource] = await db
      .insert(cuttingBuiltPacketFabricSources)
      .values({
        builtPacketId: packet.id,
        fabricInventoryId: matchedRoll.id,
        fabricType: matchedRoll.fabric || matchedRoll.nickname || null,
        lotNumber: matchedRoll.lotNumber || null,
        batchNumber: matchedRoll.batchNumber || null,
        rollNumber: matchedRoll.rollNumber || null,
        supplierPartNumber: matchedRoll.supplierPartNumber || null,
        internalControlNumber: matchedRoll.internalControlNumber || null,
        expirationDate: matchedRoll.expirationDate || null,
        quantityUsed: parseInt(String(quantityUsed)) || 1,
        isPrimary: (currentSourceCount[0]?.sourceCount || 0) === 0,
      })
      .returning();

    const newSourceCount = (currentSourceCount[0]?.sourceCount || 0) + 1;
    await db
      .update(cuttingBuiltPackets)
      .set({
        fabricSourceCount: newSourceCount,
        isMixedFabric: newSourceCount > 1,
        updatedAt: new Date(),
      })
      .where(eq(cuttingBuiltPackets.id, packet.id));

    res.status(201).json({
      source: createdSource,
      roll: {
        id: matchedRoll.id,
        barcode: matchedRoll.barcode,
        fabric: matchedRoll.fabric,
        nickname: matchedRoll.nickname,
        lotNumber: matchedRoll.lotNumber,
        batchNumber: matchedRoll.batchNumber,
        rollNumber: matchedRoll.rollNumber,
        internalControlNumber: matchedRoll.internalControlNumber,
      },
    });
  } catch (error) {
    console.error('Error scanning fabric source for built packet:', error);
    res.status(500).json({ error: 'Failed to add fabric source from scan' });
  }
});

// Update a fabric source for a built packet (e.g. correct lot/roll/batch number)
router.patch('/built-packets/:packetId/fabric-sources/:sourceId', async (req: Request, res: Response) => {
  try {
    const { packetId, sourceId } = req.params;
    const {
      fabricType,
      lotNumber,
      batchNumber,
      rollNumber,
      supplierPartNumber,
      internalControlNumber,
      expirationDate,
      quantityUsed,
    } = req.body;

    const existing = await db.query.cuttingBuiltPacketFabricSources.findFirst({
      where: and(
        eq(cuttingBuiltPacketFabricSources.id, parseInt(sourceId)),
        eq(cuttingBuiltPacketFabricSources.builtPacketId, parseInt(packetId))
      ),
    });

    if (!existing) {
      return res.status(404).json({ error: 'Fabric source not found' });
    }

    const updateData: Partial<typeof existing> = {};
    if (fabricType !== undefined) updateData.fabricType = fabricType;
    if (lotNumber !== undefined) updateData.lotNumber = lotNumber;
    if (batchNumber !== undefined) updateData.batchNumber = batchNumber;
    if (rollNumber !== undefined) updateData.rollNumber = rollNumber;
    if (supplierPartNumber !== undefined) updateData.supplierPartNumber = supplierPartNumber;
    if (internalControlNumber !== undefined) updateData.internalControlNumber = internalControlNumber;
    if (expirationDate !== undefined) updateData.expirationDate = expirationDate;
    if (quantityUsed !== undefined) updateData.quantityUsed = parseInt(quantityUsed);

    const [updated] = await db
      .update(cuttingBuiltPacketFabricSources)
      .set(updateData)
      .where(eq(cuttingBuiltPacketFabricSources.id, parseInt(sourceId)))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error('Error updating fabric source:', error);
    res.status(500).json({ error: 'Failed to update fabric source' });
  }
});

// Delete a fabric source for a built packet (admin only)
router.delete('/built-packets/:packetId/fabric-sources/:sourceId', async (req: Request, res: Response) => {
  try {
    const userRole = ((req as any).user?.role || '').toUpperCase();
    if (userRole !== 'ADMIN' && userRole !== 'OWNER') {
      return res.status(403).json({ error: 'Admin access required to delete fabric sources' });
    }

    const { packetId, sourceId } = req.params;

    const existing = await db.query.cuttingBuiltPacketFabricSources.findFirst({
      where: and(
        eq(cuttingBuiltPacketFabricSources.id, parseInt(sourceId)),
        eq(cuttingBuiltPacketFabricSources.builtPacketId, parseInt(packetId))
      ),
    });

    if (!existing) {
      return res.status(404).json({ error: 'Fabric source not found' });
    }

    await db
      .delete(cuttingBuiltPacketFabricSources)
      .where(eq(cuttingBuiltPacketFabricSources.id, parseInt(sourceId)));

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting fabric source:', error);
    res.status(500).json({ error: 'Failed to delete fabric source' });
  }
});

export default router;
