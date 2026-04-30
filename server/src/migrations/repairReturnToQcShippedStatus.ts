/**
 * One-time idempotent data repair: clear stuck SHIPPED stock_status on metal-accessory
 * purchase_order_items that were left behind after a return-to-QC action.
 *
 * Background:
 *   The return-to-QC endpoint contained a guard that refused to clear stock_status when
 *   it was already 'SHIPPED'. Metal accessories (bottom metal, rails, etc.) have no
 *   production order, so the Shipping QC PO tab determines their visibility entirely from
 *   purchase_order_items.stock_status. With the guard in place those items remained
 *   'SHIPPED' and disappeared from the queue even after an explicit return-to-QC.
 *
 *   Affected shipments touched POs 58631218 (16 units), 58636476 (1 unit), and
 *   58641595 (9 units) — 26 units in total.
 *
 * How "stuck" is determined (safe, non-destructive criteria):
 *   When return-to-QC runs it deletes all shipment_items rows for that shipment.
 *   A legitimately-shipped item still has an active shipment_items record with an
 *   order_id matching "PO-{poItemId}-{unitNumber}". A stuck item was returned to QC
 *   (so those shipment_items were deleted) but stock_status was never cleared by the
 *   buggy guard. We therefore only clear rows where NO current shipment_items record
 *   references the PO item — which means the return-to-QC deletion already happened
 *   but the status update did not.
 *
 * Safe to re-run: only rows that are both SHIPPED and absent from shipment_items are
 * touched. Once cleared to NULL they no longer match the filter.
 */

import { pool } from '../../db';

const AFFECTED_PO_NUMBERS = ['58631218', '58636476', '58641595'];

export interface RepairResult {
  poNumber: string;
  rowsFound: number;
  rowsCleared: number;
  ids: number[];
}

export interface MigrationResult {
  results: RepairResult[];
  totalCleared: number;
  dryRun: boolean;
}

/**
 * Preview which rows would be changed without modifying anything.
 */
export async function dryRun(): Promise<MigrationResult> {
  return run(true);
}

/**
 * Apply the repair — clear stock_status to NULL for all stuck rows.
 */
export async function apply(): Promise<MigrationResult> {
  return run(false);
}

async function run(isDryRun: boolean): Promise<MigrationResult> {
  const results: RepairResult[] = [];
  let totalCleared = 0;

  for (const poNumber of AFFECTED_PO_NUMBERS) {
    // A "stuck" row is one that:
    //   1. Belongs to the affected PO
    //   2. Has stock_status = 'SHIPPED'
    //   3. Has NO active shipment_items record referencing it
    //      (shipment_items.order_id format is "PO-{poItemId}-{unitNumber}")
    // Rows that ARE still in shipment_items are legitimately shipped and must be left alone.
    const preview = (await pool.query(
      `SELECT poi.id
       FROM purchase_order_items poi
       JOIN purchase_orders po ON po.id = poi.po_id
       WHERE po.po_number = $1
         AND poi.stock_status = 'SHIPPED'
         AND NOT EXISTS (
           SELECT 1
           FROM shipment_items si
           WHERE si.order_id ~ ('^PO-' || poi.id::text || '-[0-9]+$')
         )`,
      [poNumber]
    )) as Array<{ id: number }>;

    const stuckIds = preview.map((r) => r.id);
    const rowsFound = stuckIds.length;

    if (!isDryRun && rowsFound > 0) {
      const updated = (await pool.query(
        `UPDATE purchase_order_items
         SET stock_status = NULL,
             updated_at   = NOW()
         WHERE id = ANY($1::int[])
           AND stock_status = 'SHIPPED'
           AND NOT EXISTS (
             SELECT 1
             FROM shipment_items si
             WHERE si.order_id ~ ('^PO-' || purchase_order_items.id::text || '-[0-9]+$')
           )
         RETURNING id`,
        [stuckIds]
      )) as Array<{ id: number }>;

      const clearedIds = updated.map((r) => r.id);
      const rowsCleared = clearedIds.length;
      totalCleared += rowsCleared;

      console.log(
        `[repairReturnToQcShippedStatus] PO ${poNumber}: found ${rowsFound} stuck rows, cleared ${rowsCleared} (ids: ${clearedIds.join(', ')})`
      );
      results.push({ poNumber, rowsFound, rowsCleared, ids: clearedIds });
    } else {
      console.log(
        isDryRun
          ? `[repairReturnToQcShippedStatus] DRY-RUN PO ${poNumber}: would clear ${rowsFound} stuck rows (ids: ${stuckIds.join(', ')})`
          : `[repairReturnToQcShippedStatus] PO ${poNumber}: no stuck rows found, nothing to do`
      );
      results.push({ poNumber, rowsFound, rowsCleared: 0, ids: [] });
    }
  }

  return { results, totalCleared, dryRun: isDryRun };
}
