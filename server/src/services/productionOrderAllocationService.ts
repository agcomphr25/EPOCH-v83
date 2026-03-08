import { pool } from '../../db';
import { allocateInventory, deallocateInventory } from './inventoryAllocationService';

const WAREHOUSE_LOCATION = 'WAREHOUSE-01';

export interface BomShortage {
  agPartNumber: string;
  required: number;
  available: number;
}

export interface AllocationSummary {
  success: boolean;
  allocated: { agPartNumber: string; quantity: number }[];
  shortages: BomShortage[];
}

// ── resolveBomDefinitionId ─────────────────────────────────────────────────────
// Tries two strategies to find a bom_definition for an order:
//   1. Direct FK via all_orders.bom_definition_id (when populated)
//   2. Fallback: bom_definitions.sku matches the order's model_id
// Returns null when no BOM is found (no-op, transition is not blocked).

async function resolveBomDefinitionId(
  orderId: string,
  bomDefinitionId: string | null,
  modelId: string | null
): Promise<string | null> {
  if (bomDefinitionId) {
    const rows = await pool.query(
      `SELECT id FROM bom_definitions WHERE id = $1 AND is_active = true`,
      [bomDefinitionId]
    ) as any[];
    if (rows.length > 0) return bomDefinitionId;
  }

  if (modelId) {
    const rows = await pool.query(
      `SELECT id FROM bom_definitions WHERE sku = $1 AND is_active = true`,
      [modelId]
    ) as any[];
    if (rows.length > 0) return rows[0].id as string;
  }

  return null;
}

// ── getBomMaterials ────────────────────────────────────────────────────────────
// Fetches active material BOM items for a given bom_definition_id.

async function getBomMaterials(
  bomDefId: string
): Promise<{ agPartNumber: string; qtyPerUnit: number }[]> {
  const rows = await pool.query(
    `SELECT part_name AS ag_part_number, quantity AS qty_per_unit
     FROM bom_items
     WHERE bom_id = $1
       AND is_active = true
       AND item_type = 'material'
       AND quantity > 0`,
    [bomDefId]
  ) as any[];

  return rows.map((r: any) => ({
    agPartNumber: String(r.ag_part_number),
    qtyPerUnit: Number(r.qty_per_unit),
  }));
}

// ── getAvailableQty ───────────────────────────────────────────────────────────
// Returns quantity_available for a part at the warehouse, or null if no
// balance record exists (meaning inventory is not tracked for that part).

async function getAvailableQty(agPartNumber: string): Promise<number | null> {
  const rows = await pool.query(
    `SELECT quantity_available FROM inventory_balances
     WHERE ag_part_number = $1 AND location_id = $2`,
    [agPartNumber, WAREHOUSE_LOCATION]
  ) as any[];

  if (rows.length === 0) return null;
  return Number(rows[0].quantity_available ?? 0);
}

// ── allocateForOrder ──────────────────────────────────────────────────────────
// Main entry point. Called when an order transitions FINALIZED → IN_PROGRESS.
//
// Strategy:
//   1. Resolve BOM definition for the order (via FK or model_id).
//   2. If no BOM found → return success (allocation is not possible, don't block).
//   3. For each active material BOM item that has an inventory_balances record:
//      a. Calculate required_qty = qty_per_unit × orderQuantity.
//      b. Check available qty. Collect shortages without allocating yet.
//   4. If any shortages exist → return failure with MATERIAL_SHORTAGE details.
//   5. If all items have sufficient stock → run allocateInventory for each item.
//   6. If a race-condition allocation failure occurs mid-run → deallocate any
//      already-allocated items and return MATERIAL_SHORTAGE.

export async function allocateForOrder(
  orderId: string,
  bomDefinitionId: string | null,
  modelId: string | null,
  orderQuantity: number = 1,
  performedBy: string = 'system'
): Promise<AllocationSummary> {
  // Step 1: Resolve BOM
  const bomDefId = await resolveBomDefinitionId(orderId, bomDefinitionId, modelId);

  if (!bomDefId) {
    console.log(
      `ℹ️  allocateForOrder: No BOM found for order ${orderId} (model_id=${modelId}) — skipping allocation`
    );
    return { success: true, allocated: [], shortages: [] };
  }

  // Step 2: Fetch BOM material items
  const materials = await getBomMaterials(bomDefId);

  if (materials.length === 0) {
    console.log(
      `ℹ️  allocateForOrder: BOM ${bomDefId} has no active material items — skipping allocation`
    );
    return { success: true, allocated: [], shortages: [] };
  }

  // Step 3: Pre-flight availability check
  const shortages: BomShortage[] = [];
  const toAllocate: { agPartNumber: string; quantity: number }[] = [];

  for (const mat of materials) {
    const required = mat.qtyPerUnit * orderQuantity;
    const available = await getAvailableQty(mat.agPartNumber);

    if (available === null) {
      // No balance record → inventory is not tracked for this part → skip silently
      console.log(
        `ℹ️  allocateForOrder: No inventory balance for part ${mat.agPartNumber} — skipping`
      );
      continue;
    }

    if (available < required) {
      shortages.push({ agPartNumber: mat.agPartNumber, required, available });
    } else {
      toAllocate.push({ agPartNumber: mat.agPartNumber, quantity: required });
    }
  }

  // Step 4: Any shortages → abort without touching DB
  if (shortages.length > 0) {
    console.warn(
      `⚠️  allocateForOrder: MATERIAL_SHORTAGE for order ${orderId}:`,
      shortages.map((s) => `${s.agPartNumber} (need ${s.required}, have ${s.available})`).join(', ')
    );
    return { success: false, allocated: [], shortages };
  }

  if (toAllocate.length === 0) {
    console.log(
      `ℹ️  allocateForOrder: No tracked inventory items to allocate for order ${orderId}`
    );
    return { success: true, allocated: [], shortages: [] };
  }

  // Step 5: Execute allocations; track successful ones for rollback on failure
  const allocated: { agPartNumber: string; quantity: number }[] = [];

  for (const item of toAllocate) {
    try {
      await allocateInventory({
        agPartNumber: item.agPartNumber,
        quantity: item.quantity,
        locationId: WAREHOUSE_LOCATION,
        referenceType: 'PRODUCTION_ORDER',
        referenceId: orderId,
        performedBy,
        notes: `Auto-allocation on FINALIZED→IN_PROGRESS for order ${orderId}`,
      });
      allocated.push(item);
      console.log(
        `✅ allocateForOrder: Allocated ${item.quantity}× ${item.agPartNumber} for order ${orderId}`
      );
    } catch (allocErr: any) {
      // Step 6: Race-condition failure — roll back already-allocated items
      console.error(
        `❌ allocateForOrder: Allocation failed mid-run for ${item.agPartNumber}:`,
        allocErr.message
      );

      for (const done of allocated) {
        try {
          await deallocateInventory({
            agPartNumber: done.agPartNumber,
            quantity: done.quantity,
            locationId: WAREHOUSE_LOCATION,
            referenceType: 'PRODUCTION_ORDER',
            referenceId: orderId,
            performedBy,
            notes: `Rollback: allocation failed mid-run for order ${orderId}`,
          });
          console.log(`↩️  allocateForOrder: Rolled back ${done.quantity}× ${done.agPartNumber}`);
        } catch (rollbackErr: any) {
          console.error(
            `❌ allocateForOrder: Rollback failed for ${done.agPartNumber}:`,
            rollbackErr.message
          );
        }
      }

      return {
        success: false,
        allocated: [],
        shortages: [
          {
            agPartNumber: item.agPartNumber,
            required: item.quantity,
            available: 0,
          },
        ],
      };
    }
  }

  console.log(
    `✅ allocateForOrder: All ${allocated.length} material(s) allocated for order ${orderId}`
  );
  return { success: true, allocated, shortages: [] };
}
