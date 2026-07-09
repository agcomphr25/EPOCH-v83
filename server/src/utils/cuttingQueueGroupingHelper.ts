import { db, pool } from '../../db';
import {
  manufacturingQueue,
  inventoryItems,
  cuttingPacketBOMs,
  type ManufacturingQueue,
} from '../../schema';
import { and, eq, ilike } from 'drizzle-orm';

export interface GroupedCuttingItem {
  poNumber: string;
  quantity: number;
  p2PoItemId?: number | null;
  p2PoId?: number | null;
}

export interface UpsertGroupedCuttingQueueParams {
  packetName: string;
  materialType: string | null;
  dueDate: Date | null;
  items: GroupedCuttingItem[];
  source: 'P2' | 'P2_SYNC' | 'MANUAL';
  userNotes?: string | null;
  inventoryItemId?: number | null;
  bomId?: string | null;
  priority?: number;
  requestedBy?: string;
}

export interface UpsertGroupedCuttingQueueResult {
  queueItem: ManufacturingQueue;
  created: boolean;
  addedQuantity: number;
  duplicateCount: number;
  totalContributors: number;
}

function dueDateBucketKey(d: Date | null | undefined): string {
  if (!d) return 'null';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return 'null';
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
    .toISOString()
    .slice(0, 10);
}

function itemKey(item: GroupedCuttingItem): string {
  if (item.p2PoItemId != null) return `item:${item.p2PoItemId}`;
  return `po:${item.poNumber}`;
}

function parseQueueNotes(notes: string | null): Record<string, unknown> {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes);
    return parsed && typeof parsed === 'object'
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function isActiveGroupedP2CuttingRow(row: ManufacturingQueue): boolean {
  if (!['PENDING', 'IN_PROGRESS'].includes(row.status)) return false;
  const parsedNotes = parseQueueNotes(row.notes);
  return parsedNotes.isP2Packet === true;
}

function rowUpdatedTime(row: ManufacturingQueue): number {
  const updated = row.updatedAt ? new Date(row.updatedAt).getTime() : 0;
  if (updated) return updated;
  const created = row.createdAt ? new Date(row.createdAt).getTime() : 0;
  return created || 0;
}

function chooseNewestRow(rows: ManufacturingQueue[]): ManufacturingQueue | undefined {
  return rows.slice().sort((a, b) => {
    const timeDiff = rowUpdatedTime(b) - rowUpdatedTime(a);
    if (timeDiff !== 0) return timeDiff;
    return (b.id || 0) - (a.id || 0);
  })[0];
}

async function resolveBomIdForMaterialType(materialType: string | null): Promise<string | null> {
  if (!materialType) return null;
  const packetTypeName =
    materialType === 'carbon_fiber' ? 'Carbon Fiber Packet' :
    materialType === 'fiberglass' ? 'Fiberglass Packet' :
    materialType === 'mesa' ? 'Mesa Packet' :
    materialType === 'p2_disruptor' ? 'Disruptor' :
    materialType === 'p2_disruptor_packet' ? 'Disruptor' :
    materialType === 'p2_antenna' ? 'Antenna Cover' :
    materialType === 'p2_antenna_cover' ? 'Antenna Cover' :
    materialType === 'p2_carbon_fiber_packet' ? 'Carbon Fiber Packet' :
    materialType === 'p2_fiberglass_packet' ? 'Fiberglass Packet' :
    materialType === 'p2_mesa_packet' ? 'Mesa Packet' :
    null;

  if (!packetTypeName) return null;

  const [matchingBom] = await db.select()
    .from(cuttingPacketBOMs)
    .where(and(
      ilike(cuttingPacketBOMs.packetType, `%${packetTypeName}%`),
      eq(cuttingPacketBOMs.isActive, true)
    ))
    .limit(1);

  return matchingBom?.id || null;
}

async function resolveInventoryItemId(packetName: string, materialType: string | null): Promise<number | null> {
  let inventoryItemId: number | null = null;
  try {
    const exactResult = await pool.query(
      `SELECT id FROM inventory_items WHERE LOWER(name) = LOWER($1) LIMIT 1`,
      [packetName]
    );
    const exactRows = Array.isArray(exactResult) ? exactResult : (exactResult as { rows?: { id: number }[] }).rows || [];
    if (exactRows.length > 0) {
      inventoryItemId = exactRows[0].id;
    }

    if (!inventoryItemId) {
      const result = await pool.query(
        `SELECT id FROM inventory_items WHERE name ILIKE $1 LIMIT 1`,
        [`%${packetName}%`]
      );
      const rows = Array.isArray(result) ? result : (result as { rows?: { id: number }[] }).rows || [];
      if (rows.length > 0) {
        inventoryItemId = rows[0].id;
      }
    }
  } catch (e) {
    console.log('[upsertGroupedCuttingQueueEntry] Could not find inventory item:', e);
  }

  if (!inventoryItemId) {
    try {
      const result = await pool.query(
        `SELECT id FROM inventory_items WHERE name ILIKE '%packet%' LIMIT 1`
      );
      const rows = Array.isArray(result) ? result : (result as { rows?: { id: number }[] }).rows || [];
      if (rows.length > 0) {
        inventoryItemId = rows[0].id;
      }
    } catch (e) {
      console.log('[upsertGroupedCuttingQueueEntry] Could not find any packet inventory item:', e);
    }
  }

  if (!inventoryItemId) {
    const [newItem] = await db.insert(inventoryItems).values({
      name: packetName,
      agPartNumber: `PKT-${materialType?.toUpperCase() || 'STK'}`,
      category: 'packet',
      quantityInStock: 0,
    }).returning();
    inventoryItemId = newItem.id;
  }

  return inventoryItemId;
}

/**
 * Upsert a grouped cutting-table manufacturing queue row for a given packet type.
 *
 * Behavior:
 *   - Finds the newest active grouped manufacturing_queue row for the same
 *     inventory item (PENDING or IN_PROGRESS, notes.isP2Packet=true). Prefer
 *     the same packet-name/due-date bucket, but fall back to the newest active
 *     row for the same inventory item so P2 re-syncs cannot create a duplicate
 *     work order after operators have already started the prior one.
 *   - If found, merges the new items into notes.poNumbers (deduplicated by
 *     p2PoItemId, falling back to poNumber) and adds their quantity to
 *     quantityRequested. Re-runs with the same items are idempotent.
 *   - If not found, inserts a new row matching the shape that
 *     bulk-schedule-to-cutting historically produced (isP2Packet:true,
 *     p2BackfillApplied:true, poNumbers:[…]).
 *
 * Used by:
 *   - POST /api/cutting-table/bulk-schedule-to-cutting (Schedule All POs)
 *   - POST /api/cutting-table/schedule-to-cutting     (per-PO Schedule button)
 *   - POST /api/p2/schedule-items                     (P2 Production Scheduler auto-sync)
 *   - POST /api/cutting-table-mfg-queue/sync-p2-demands (manual sync)
 */
export async function upsertGroupedCuttingQueueEntry(
  params: UpsertGroupedCuttingQueueParams
): Promise<UpsertGroupedCuttingQueueResult | null> {
  const {
    packetName,
    materialType,
    dueDate,
    items,
    source,
    userNotes,
    priority = 50,
    requestedBy = 'system',
  } = params;

  if (!items || items.length === 0) return null;

  const bomId = params.bomId !== undefined
    ? params.bomId
    : await resolveBomIdForMaterialType(materialType);

  const inventoryItemId = params.inventoryItemId
    || await resolveInventoryItemId(packetName, materialType);

  if (!inventoryItemId) {
    console.warn(`[upsertGroupedCuttingQueueEntry] Could not resolve inventory item for "${packetName}"`);
    return null;
  }

  const targetBucket = dueDateBucketKey(dueDate);

  // Find active grouped rows for this packet inventory item. This intentionally
  // includes IN_PROGRESS rows so a P2/manual sync updates the live cutting job
  // instead of creating a duplicate beside work already on the table.
  const candidates = await db.select()
    .from(manufacturingQueue)
    .where(and(
      eq(manufacturingQueue.department, 'Cutting Table'),
      eq(manufacturingQueue.inventoryItemId, inventoryItemId),
    ));

  const activeGroupedRows = candidates.filter(isActiveGroupedP2CuttingRow);
  const exactRows = activeGroupedRows.filter(row => {
    if (dueDateBucketKey(row.dueDate) !== targetBucket) return false;
    const parsedNotes = parseQueueNotes(row.notes);
    const rowPacketName = typeof parsedNotes.packetName === 'string' ? parsedNotes.packetName : null;
    if (rowPacketName && rowPacketName.toLowerCase() !== packetName.toLowerCase()) return false;
    return true;
  });
  const existingRow = chooseNewestRow(exactRows) ?? chooseNewestRow(activeGroupedRows);

  if (existingRow) {
    const existingNotes = parseQueueNotes(existingRow.notes);

    const existingPos: GroupedCuttingItem[] = Array.isArray(existingNotes.poNumbers)
      ? (existingNotes.poNumbers as GroupedCuttingItem[])
      : [];

    const seen = new Set<string>(existingPos.map(itemKey));

    const merged: GroupedCuttingItem[] = [...existingPos];
    let addedQty = 0;
    let duplicateCount = 0;
    for (const item of items) {
      const key = itemKey(item);
      if (seen.has(key)) {
        duplicateCount++;
        continue;
      }
      seen.add(key);
      merged.push(item);
      addedQty += item.quantity || 0;
    }

    if (addedQty === 0 && duplicateCount === items.length) {
      // Nothing new to add — purely idempotent re-run
      return {
        queueItem: existingRow,
        created: false,
        addedQuantity: 0,
        duplicateCount,
        totalContributors: existingPos.length,
      };
    }

    const newQty = (existingRow.quantityRequested || 0) + addedQty;

    const updatedNotes = {
      ...existingNotes,
      source: existingNotes.source || source,
      materialType: existingNotes.materialType || materialType,
      bomId: (existingNotes.bomId as string | null | undefined) ?? bomId,
      packetName,
      isP2Packet: true,
      p2BackfillApplied: true,
      poNumbers: merged,
      userNotes: userNotes
        ?? existingNotes.userNotes
        ?? `Grouped ${merged.length} PO entr${merged.length === 1 ? 'y' : 'ies'} for ${packetName}`,
    };

    const [updated] = await db.update(manufacturingQueue)
      .set({
        quantityRequested: newQty,
        notes: JSON.stringify(updatedNotes),
        updatedAt: new Date(),
      })
      .where(eq(manufacturingQueue.id, existingRow.id))
      .returning();

    return {
      queueItem: updated,
      created: false,
      addedQuantity: addedQty,
      duplicateCount,
      totalContributors: merged.length,
    };
  }

  // No existing grouped row — insert a new one matching bulk-schedule-to-cutting shape
  const totalQty = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
  const orderId = `GROUP-${packetName.replace(/\s+/g, '_').toUpperCase()}-${Date.now()}`;

  const notesObj = {
    orderId,
    source,
    materialType,
    bomId,
    userNotes: userNotes
      ?? `Grouped ${items.length} PO entr${items.length === 1 ? 'y' : 'ies'} for ${packetName}`,
    isP2Packet: true,
    packetName,
    poNumbers: items,
    p2BackfillApplied: true,
  };

  const [newItem] = await db.insert(manufacturingQueue).values({
    inventoryItemId,
    department: 'Cutting Table',
    quantityRequested: totalQty,
    quantityCompleted: 0,
    priority,
    status: 'PENDING',
    dueDate: dueDate || null,
    notes: JSON.stringify(notesObj),
    requestedBy,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  // Point any orphan barcode aliases (whose successor was previously deleted
  // or never set) at this fresh queue row so labels printed against the
  // earlier row keep working.
  try {
    const { backfillAliasesForNewQueueRow, dueDateBucket } = await import('./cuttingPacketBarcodeAlias');
    await backfillAliasesForNewQueueRow(newItem.id, {
      inventoryItemId,
      packetName,
      dueDateBucket: dueDateBucket(dueDate),
    });
  } catch (aliasErr: any) {
    console.warn('[upsertGroupedCuttingQueueEntry] alias backfill failed:', aliasErr?.message || aliasErr);
  }

  return {
    queueItem: newItem,
    created: true,
    addedQuantity: totalQty,
    duplicateCount: 0,
    totalContributors: items.length,
  };
}
