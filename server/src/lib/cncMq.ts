/**
 * Shared helper: create a manufacturing_queue row for a CNC job.
 *
 * Looks up the inventory item by ag_part_number. If found, inserts a
 * PENDING CNC row. If not found, logs a warning and skips silently.
 *
 * The UNIQUE constraint on (source_type, source_id) means
 * ON CONFLICT DO NOTHING is a true dedup — safe to call multiple times.
 */

import { pool } from '../../db';
import type { CncJob } from '../../schema';

export async function createManufacturingQueueEntryForCncJob(job: CncJob): Promise<void> {
  try {
    const invResult = await pool.query(
      `SELECT id FROM inventory_items WHERE ag_part_number = $1 LIMIT 1`,
      [job.partNumber],
    );
    const invRows = Array.isArray(invResult) ? invResult : (invResult.rows ?? []);

    if (invRows.length === 0) {
      console.log(
        `[CNC MQ] Part ${job.partNumber} not in inventory_items — skipping manufacturing queue (job ${job.id})`,
      );
      return;
    }

    await pool.query(
      `INSERT INTO manufacturing_queue
         (inventory_item_id, department, quantity_requested, priority, status, due_date,
          source_id, source_type, notes, created_at, updated_at)
       VALUES ($1, 'CNC', $2, 50, 'PENDING', $3, $4, 'cnc_job', $5, NOW(), NOW())
       ON CONFLICT (source_type, source_id) DO NOTHING`,
      [
        invRows[0].id,
        job.qty,
        job.dueDate ?? null,
        String(job.id),
        `CNC job ${job.id} — ${job.partNumber} (${job.partName})`,
      ],
    );

    console.log(`[CNC MQ] Queued job ${job.id} (${job.partNumber}) in manufacturing_queue`);
  } catch (err: any) {
    console.warn(`[CNC MQ] Failed to insert manufacturing_queue for CNC job ${job.id}:`, err?.message);
  }
}
