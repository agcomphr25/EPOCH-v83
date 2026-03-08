/**
 * Material Intelligence Service
 *
 * Provides purchasing radar analysis built on top of the existing
 * MRP planning engine (calculateMaterialDemand / calculateMaterialShortages).
 *
 * All operations are READ-ONLY — no INSERT / UPDATE / DELETE.
 */

import { pool } from '../../db';
import {
  calculateMaterialDemand,
  calculateMaterialShortages,
  MaterialDemandRow,
  MaterialShortageRow,
} from './mrpMaterialPlanning';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PurchasingRadarRow {
  agPartNumber: string;
  name: string;
  daysRemaining: number;
  averageDailyDemand: number;
  quantityAvailable: number;
  totalRequired: number;
  recommendedOrderQuantity: number;
}

export interface BuildCapacitySummary {
  ordersQueued: number;
  ordersBuildable: number;
  limitingMaterial: string | null;
  limitingMaterialName: string | null;
}

export interface InventoryPressureRow {
  agPartNumber: string;
  name: string;
  onHand: number;
  allocated: number;
  available: number;
  pressureLevel: 'green' | 'yellow' | 'red';
}

export interface MaterialIntelligenceDashboard {
  buildCapacity: BuildCapacitySummary;
  blockingMaterials: Array<{
    agPartNumber: string;
    name: string;
    required: number;
    onHand: number;
    allocated: number;
    available: number;
    shortage: number;
  }>;
  purchasingRadar: PurchasingRadarRow[];
  inventoryPressure: InventoryPressureRow[];
  meta: {
    totalMaterials: number;
    blockingCount: number;
    generatedAt: string;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function fetchActiveOrderCount(): Promise<number> {
  const rows = (await pool.query(
    `SELECT COUNT(*) AS cnt FROM all_orders WHERE status IN ('FINALIZED', 'IN_PROGRESS')`
  )) as any[];
  return Number(rows[0]?.cnt ?? 0);
}

async function fetchNameMap(agPartNumbers: string[]): Promise<Map<string, string>> {
  if (agPartNumbers.length === 0) return new Map();
  const rows = (await pool.query(
    `SELECT ag_part_number, name FROM inventory_items WHERE ag_part_number = ANY($1) AND is_active = true`,
    [agPartNumbers]
  )) as any[];
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(String(r.ag_part_number), String(r.name ?? r.ag_part_number));
  }
  return map;
}

// ── calculateBuildCapacitySummary ──────────────────────────────────────────────
/**
 * Derives a global build capacity summary from material shortages.
 *
 * For each material:
 *   orders_buildable = floor(quantity_available * active_orders / total_required)
 *
 * The minimum across all materials is the global bottleneck.
 */
async function calculateBuildCapacitySummary(
  shortages: MaterialShortageRow[],
  activeOrders: number,
  nameMap: Map<string, string>
): Promise<BuildCapacitySummary> {
  if (shortages.length === 0 || activeOrders === 0) {
    return {
      ordersQueued: activeOrders,
      ordersBuildable: activeOrders,
      limitingMaterial: null,
      limitingMaterialName: null,
    };
  }

  let minBuildable = activeOrders;
  let limitingMaterial: string | null = null;

  for (const s of shortages) {
    if (s.totalRequired <= 0) continue;
    const buildable = Math.floor((s.quantityAvailable * activeOrders) / s.totalRequired);
    const capped = Math.min(buildable, activeOrders);
    if (capped < minBuildable) {
      minBuildable = capped;
      limitingMaterial = s.agPartNumber;
    }
  }

  return {
    ordersQueued: activeOrders,
    ordersBuildable: Math.max(0, minBuildable),
    limitingMaterial,
    limitingMaterialName: limitingMaterial ? (nameMap.get(limitingMaterial) ?? limitingMaterial) : null,
  };
}

// ── calculatePurchasingRadar ───────────────────────────────────────────────────
/**
 * For each material in active demand:
 *   average_daily_demand = total_required / active_orders
 *   days_remaining       = available / average_daily_demand   (order-cycles remaining)
 *   recommended_order_quantity = max(0, total_required * 1.2 - quantity_on_hand)
 *
 * Returns materials sorted by days_remaining ascending (most urgent first).
 */
export async function calculatePurchasingRadar(
  shortages: MaterialShortageRow[],
  activeOrders: number,
  nameMap: Map<string, string>
): Promise<PurchasingRadarRow[]> {
  if (shortages.length === 0 || activeOrders === 0) return [];

  const rows: PurchasingRadarRow[] = shortages.map((s) => {
    const avgDailyDemand = s.totalRequired / Math.max(activeOrders, 1);
    const daysRemaining =
      avgDailyDemand > 0 ? s.quantityAvailable / avgDailyDemand : 9999;

    const targetStock = s.totalRequired * 1.2;
    const recommended = Math.max(0, Math.ceil(targetStock - s.quantityOnHand));

    return {
      agPartNumber: s.agPartNumber,
      name: nameMap.get(s.agPartNumber) ?? s.agPartNumber,
      daysRemaining: Math.max(0, Math.round(daysRemaining * 10) / 10),
      averageDailyDemand: Math.round(avgDailyDemand * 100) / 100,
      quantityAvailable: s.quantityAvailable,
      totalRequired: s.totalRequired,
      recommendedOrderQuantity: recommended,
    };
  });

  return rows.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

// ── calculateInventoryPressure ─────────────────────────────────────────────────
/**
 * Color-codes each material by how much of on-hand stock is available.
 *
 *   green  — available > 50 % of on_hand
 *   yellow — available <= 50 % (partially committed)
 *   red    — shortage (available < 0 or on_hand < required)
 */
function calculateInventoryPressure(
  shortages: MaterialShortageRow[],
  nameMap: Map<string, string>
): InventoryPressureRow[] {
  return shortages.map((s) => {
    let pressureLevel: 'green' | 'yellow' | 'red';
    if (s.isShort || s.quantityAvailable < 0) {
      pressureLevel = 'red';
    } else if (s.quantityOnHand > 0 && s.quantityAvailable / s.quantityOnHand < 0.5) {
      pressureLevel = 'yellow';
    } else {
      pressureLevel = 'green';
    }
    return {
      agPartNumber: s.agPartNumber,
      name: nameMap.get(s.agPartNumber) ?? s.agPartNumber,
      onHand: s.quantityOnHand,
      allocated: s.quantityAllocated,
      available: s.quantityAvailable,
      pressureLevel,
    };
  });
}

// ── getMaterialIntelligenceDashboard ───────────────────────────────────────────
/**
 * Main entry point — assembles all four panels in one batched pass.
 *
 * Query plan:
 *   1. calculateMaterialDemand()   — 1 SQL query
 *   2. calculateMaterialShortages() — 1 SQL query (batch, via ANY($1))
 *   3. fetchActiveOrderCount()      — 1 SQL query
 *   4. fetchNameMap()               — 1 SQL query (batch, via ANY($1))
 *
 * Total: 4 SQL queries regardless of material count.
 */
export async function getMaterialIntelligenceDashboard(): Promise<MaterialIntelligenceDashboard> {
  const demands = await calculateMaterialDemand();
  const [shortages, activeOrders] = await Promise.all([
    calculateMaterialShortages(demands),
    fetchActiveOrderCount(),
  ]);

  const allPartNumbers = shortages.map((s) => s.agPartNumber);
  const nameMap = await fetchNameMap(allPartNumbers);

  const [buildCapacity, purchasingRadar] = await Promise.all([
    calculateBuildCapacitySummary(shortages, activeOrders, nameMap),
    calculatePurchasingRadar(shortages, activeOrders, nameMap),
  ]);

  const inventoryPressure = calculateInventoryPressure(shortages, nameMap);

  const blockingMaterials = shortages
    .filter((s) => s.isShort)
    .map((s) => ({
      agPartNumber: s.agPartNumber,
      name: nameMap.get(s.agPartNumber) ?? s.agPartNumber,
      required: s.totalRequired,
      onHand: s.quantityOnHand,
      allocated: s.quantityAllocated,
      available: s.quantityAvailable,
      shortage: s.netShortage,
    }));

  return {
    buildCapacity,
    blockingMaterials,
    purchasingRadar,
    inventoryPressure,
    meta: {
      totalMaterials: shortages.length,
      blockingCount: blockingMaterials.length,
      generatedAt: new Date().toISOString(),
    },
  };
}
