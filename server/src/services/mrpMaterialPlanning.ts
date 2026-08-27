/**
 * MRP Material Planning Engine
 *
 * Three composable planning functions:
 *
 *   calculateMaterialDemand()   — total material required from open orders (FINALIZED + IN_PROGRESS)
 *   calculateMaterialShortages() — compares demand to on-hand inventory
 *   calculateBuildCapacity()    — max buildable units given current available stock
 *
 * BOM linkage strategy:
 *   Primary:  all_orders.bom_definition_id (integer FK) when populated.
 *   Fallback: bom_definitions.sku = all_orders.model_id (for orders without a direct FK).
 *
 * Order quantity assumption:
 *   all_orders has no explicit unit-quantity column. Each order represents
 *   one (1) finished unit (custom gun stock).  Adjust ORDER_QTY_EXPR if
 *   a quantity column is added in the future.
 */

import { pool } from '../../db';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MaterialDemandRow {
  agPartNumber: string;
  totalRequired: number;
  orderCount: number;
  contributingSkus: string[];
}

export interface MaterialShortageRow {
  agPartNumber: string;
  totalRequired: number;
  quantityOnHand: number;
  quantityAllocated: number;
  quantityAvailable: number;
  netShortage: number;
  isShort: boolean;
}

export interface BuildCapacityRow {
  agPartNumber: string;
  bomQty: number;
  quantityAvailable: number;
  maxBuildable: number;
}

export interface MrpResult {
  materials: MaterialDemandRow[];
  shortages: MaterialShortageRow[];
  maxBuildable: number;
  buildCapacityByMaterial: BuildCapacityRow[];
  generatedAt: string;
}

// ── SQL helpers ────────────────────────────────────────────────────────────────

/**
 * Returns the SQL fragment that resolves BOM definitions for all_orders rows.
 * Matches bom_definitions.sku to all_orders.model_id.
 * Wrapped as a CTE alias "resolved_bom".
 */
const RESOLVED_BOM_CTE = `
  resolved_bom AS (
    SELECT
      ao.order_id,
      ao.model_id,
      bd.id   AS bom_def_id,
      bd.sku  AS bom_sku
    FROM all_orders ao
    JOIN bom_definitions bd
      ON  bd.is_active = true
      AND bd.sku = ao.model_id
    WHERE ao.status IN ('FINALIZED', 'IN_PROGRESS')
  )
`;

// ── calculateMaterialDemand ────────────────────────────────────────────────────
/**
 * Aggregates total material required across all FINALIZED and IN_PROGRESS orders.
 *
 * Each order counts as 1 unit.  If multiple BOMs cover the same material
 * they are summed together.
 *
 * @param skuFilter  Optional — restrict to a single model SKU.
 */
export async function calculateMaterialDemand(
  skuFilter?: string
): Promise<MaterialDemandRow[]> {
  const params: any[] = [];
  let skuWhere = '';
  if (skuFilter) {
    params.push(skuFilter);
    skuWhere = `AND rb.bom_sku = $${params.length}`;
  }

  const sql = `
    WITH ${RESOLVED_BOM_CTE}
    SELECT
      bi.part_name                                        AS ag_part_number,
      SUM(bi.quantity * 1)                                AS total_required,
      COUNT(DISTINCT rb.order_id)                         AS order_count,
      array_agg(DISTINCT rb.bom_sku ORDER BY rb.bom_sku) AS contributing_skus
    FROM resolved_bom rb
    JOIN bom_items bi
      ON  bi.bom_id   = rb.bom_def_id
      AND bi.is_active = true
      AND bi.item_type = 'material'
      AND bi.quantity  > 0
    JOIN inventory_items ii
      ON ii.ag_part_number = bi.part_name
      AND COALESCE(ii.utilized_in_non_inventory, false) = false
      AND COALESCE(ii.utilized_in_services, false) = false
      AND lower(trim(COALESCE(ii.type, ''))) NOT IN ('service', 'services')
    WHERE 1=1 ${skuWhere}
    GROUP BY bi.part_name
    ORDER BY total_required DESC, bi.part_name
  `;

  const rows = (await pool.query(sql, params)) as any[];

  return rows.map((r: any) => ({
    agPartNumber: String(r.ag_part_number),
    totalRequired: Number(r.total_required),
    orderCount: Number(r.order_count),
    contributingSkus: Array.isArray(r.contributing_skus) ? r.contributing_skus : [],
  }));
}

// ── calculateMaterialShortages ─────────────────────────────────────────────────
/**
 * Compares calculated demand to current inventory balances.
 *
 * Shortage formula:
 *   net_shortage = total_required - quantity_on_hand
 *
 * quantity_allocated is returned for visibility (shows how much of on_hand
 * is already reserved).  quantity_available (= on_hand - allocated) shows
 * the truly uncommitted stock.
 *
 * Rows where on_hand >= total_required are still returned (isShort = false)
 * so callers get the full picture.  Filter on isShort = true for shortage-only.
 *
 * @param demands  Output of calculateMaterialDemand().  If omitted, the
 *                 function calls calculateMaterialDemand() automatically.
 * @param skuFilter  Optional — passed through to calculateMaterialDemand().
 */
export async function calculateMaterialShortages(
  demands?: MaterialDemandRow[],
  skuFilter?: string
): Promise<MaterialShortageRow[]> {
  const materialDemands = demands ?? (await calculateMaterialDemand(skuFilter));

  if (materialDemands.length === 0) return [];

  const partNumbers = materialDemands.map((d) => d.agPartNumber);

  const inventorySql = `
    SELECT
      ag_part_number,
      quantity_on_hand,
      quantity_allocated,
      quantity_available
    FROM inventory_balances
    WHERE ag_part_number = ANY($1)
  `;

  const balanceRows = (await pool.query(inventorySql, [partNumbers])) as any[];

  const balanceMap = new Map<
    string,
    { onHand: number; allocated: number; available: number }
  >();
  for (const row of balanceRows) {
    balanceMap.set(String(row.ag_part_number), {
      onHand: Number(row.quantity_on_hand ?? 0),
      allocated: Number(row.quantity_allocated ?? 0),
      available: Number(row.quantity_available ?? 0),
    });
  }

  return materialDemands.map((demand) => {
    const balance = balanceMap.get(demand.agPartNumber) ?? {
      onHand: 0,
      allocated: 0,
      available: 0,
    };

    const netShortage = demand.totalRequired - balance.onHand;

    return {
      agPartNumber: demand.agPartNumber,
      totalRequired: demand.totalRequired,
      quantityOnHand: balance.onHand,
      quantityAllocated: balance.allocated,
      quantityAvailable: balance.available,
      netShortage: Math.max(0, netShortage),
      isShort: netShortage > 0,
    };
  });
}

// ── calculateBuildCapacity ─────────────────────────────────────────────────────
/**
 * Given a BOM SKU, computes how many units can currently be built with
 * available (uncommitted) stock.
 *
 *   max_buildable_per_material = floor(quantity_available / bom_qty)
 *   maxBuildable               = min(max_buildable_per_material across all materials)
 *
 * Materials with no inventory_balances record are treated as 0 available
 * (limiting factor).
 *
 * @param sku  The bom_definitions.sku (e.g. "711", "T500") to evaluate.
 */
export async function calculateBuildCapacity(sku: string): Promise<{
  sku: string;
  maxBuildable: number;
  limitingMaterial: string | null;
  byMaterial: BuildCapacityRow[];
}> {
  const sql = `
    SELECT
      bi.part_name          AS ag_part_number,
      bi.quantity           AS bom_qty,
      COALESCE(ib.quantity_available, 0) AS quantity_available
    FROM bom_definitions bd
    JOIN bom_items bi
      ON  bi.bom_id    = bd.id
      AND bi.is_active = true
      AND bi.item_type = 'material'
      AND bi.quantity  > 0
    JOIN inventory_items ii
      ON ii.ag_part_number = bi.part_name
      AND COALESCE(ii.utilized_in_non_inventory, false) = false
      AND COALESCE(ii.utilized_in_services, false) = false
      AND lower(trim(COALESCE(ii.type, ''))) NOT IN ('service', 'services')
    LEFT JOIN inventory_balances ib
      ON ib.ag_part_number = bi.part_name
    WHERE bd.sku       = $1
      AND bd.is_active = true
    ORDER BY bi.part_name
  `;

  const rows = (await pool.query(sql, [sku])) as any[];

  if (rows.length === 0) {
    return { sku, maxBuildable: 0, limitingMaterial: null, byMaterial: [] };
  }

  const byMaterial: BuildCapacityRow[] = rows.map((r: any) => {
    const bomQty = Number(r.bom_qty);
    const available = Number(r.quantity_available);
    const maxBuildable = bomQty > 0 ? Math.floor(available / bomQty) : 0;
    return {
      agPartNumber: String(r.ag_part_number),
      bomQty,
      quantityAvailable: available,
      maxBuildable,
    };
  });

  const minRow = byMaterial.reduce(
    (min, row) => (row.maxBuildable < min.maxBuildable ? row : min),
    byMaterial[0]
  );

  return {
    sku,
    maxBuildable: minRow.maxBuildable,
    limitingMaterial: minRow.agPartNumber,
    byMaterial,
  };
}

// ── runMrp ─────────────────────────────────────────────────────────────────────
/**
 * Top-level orchestrator.  Runs all three planning functions and returns a
 * combined MRP result.
 *
 * When skuFilter is supplied, demand and shortage calculations are scoped to
 * that SKU.  calculateBuildCapacity() always requires an explicit SKU — pass
 * capacitySku to include it in the result (defaults to skuFilter if set).
 *
 * @param skuFilter    Optional model SKU filter for demand/shortage queries.
 * @param capacitySku  SKU to evaluate build capacity for. Defaults to skuFilter.
 */
export async function runMrp(options?: {
  skuFilter?: string;
  capacitySku?: string;
}): Promise<MrpResult> {
  const { skuFilter, capacitySku } = options ?? {};

  const [materials, shortages] = await Promise.all([
    calculateMaterialDemand(skuFilter),
    calculateMaterialShortages(undefined, skuFilter),
  ]);

  const effectiveSku = capacitySku ?? skuFilter;

  let maxBuildable = 0;
  let buildCapacityByMaterial: BuildCapacityRow[] = [];

  if (effectiveSku) {
    const capacity = await calculateBuildCapacity(effectiveSku);
    maxBuildable = capacity.maxBuildable;
    buildCapacityByMaterial = capacity.byMaterial;
  }

  return {
    materials,
    shortages,
    maxBuildable,
    buildCapacityByMaterial,
    generatedAt: new Date().toISOString(),
  };
}
