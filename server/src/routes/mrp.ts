import { Router, Request, Response } from 'express';
import { pool } from '../../db';
import {
  calculateMaterialDemand,
  calculateMaterialShortages,
  calculateBuildCapacity,
} from '../services/mrpMaterialPlanning';

const router = Router();

// ── GET /api/mrp/material-readiness ───────────────────────────────────────────
//
// Query params:
//   sku  (optional) — model SKU to scope demand and compute build capacity
//
// Response:
//   max_buildable_units  — max units buildable with current available stock.
//                          Requires ?sku= for a BOM-specific answer.
//                          Returns 0 when no sku provided or BOM not found.
//   materials            — per-material breakdown including inventory name
//   blocking_materials   — subset of materials where shortage > 0

router.get('/material-readiness', async (req: Request, res: Response) => {
  try {
    const sku = req.query.sku as string | undefined;

    // ── 1. Run demand + shortage calculations in parallel ─────────────────────
    const [demands, shortages] = await Promise.all([
      calculateMaterialDemand(sku),
      calculateMaterialShortages(undefined, sku),
    ]);

    // ── 2. Build capacity (requires a specific SKU) ───────────────────────────
    let maxBuildableUnits = 0;

    if (sku) {
      const capacity = await calculateBuildCapacity(sku);
      maxBuildableUnits = capacity.maxBuildable;
    }

    // ── 3. Batch-fetch inventory item names for all part numbers ──────────────
    const allPartNumbers = [...new Set(shortages.map((s) => s.agPartNumber))];

    let nameMap = new Map<string, string>();

    if (allPartNumbers.length > 0) {
      const nameRows = (await pool.query(
        `SELECT ag_part_number, name
         FROM inventory_items
         WHERE ag_part_number = ANY($1)
           AND is_active = true`,
        [allPartNumbers]
      )) as any[];

      for (const row of nameRows) {
        nameMap.set(String(row.ag_part_number), String(row.name ?? ''));
      }
    }

    // ── 4. Build demand lookup for required qty ───────────────────────────────
    const demandMap = new Map<string, number>();
    for (const d of demands) {
      demandMap.set(d.agPartNumber, d.totalRequired);
    }

    // ── 5. Assemble materials array ───────────────────────────────────────────
    const materials = shortages.map((s) => ({
      ag_part_number: s.agPartNumber,
      name: nameMap.get(s.agPartNumber) ?? s.agPartNumber,
      on_hand: s.quantityOnHand,
      allocated: s.quantityAllocated,
      available: s.quantityAvailable,
      required: s.totalRequired,
      shortage: s.netShortage,
    }));

    const blockingMaterials = materials.filter((m) => m.shortage > 0);

    res.json({
      max_buildable_units: maxBuildableUnits,
      materials,
      blocking_materials: blockingMaterials,
      meta: {
        sku: sku ?? null,
        totalMaterials: materials.length,
        blockingCount: blockingMaterials.length,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Material readiness error:', error);
    res.status(500).json({
      error: 'Failed to compute material readiness',
      message: error.message,
    });
  }
});

export default router;
