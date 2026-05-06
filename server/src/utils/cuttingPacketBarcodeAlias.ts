import { db } from '../../db';
import { cuttingPacketBarcodeAliases, manufacturingQueue } from '../../schema';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

export type AliasReason = 'merged' | 'unscheduled' | 'replaced' | 'historical';

export interface AliasContext {
  inventoryItemId: number | null | undefined;
  packetName: string | null | undefined;
  dueDateBucket: string | null | undefined;
}

/**
 * Convert a Date / string / null due-date into the same calendar-day bucket
 * key the grouping helper uses ('YYYY-MM-DD' or 'null').
 */
export function dueDateBucket(d: Date | string | null | undefined): string {
  if (d === null || d === undefined) return 'null';
  const date = d instanceof Date ? d : new Date(d as string);
  if (isNaN(date.getTime())) return 'null';
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
    .toISOString()
    .slice(0, 10);
}

/**
 * Record (or refresh) an alias from a printed-and-now-removed/merged queue id
 * to a surviving successor queue id (which may be null when no successor
 * currently exists).
 */
export async function recordAlias(
  originalQueueId: number,
  successorQueueId: number | null,
  ctx: AliasContext,
  reason: AliasReason,
): Promise<void> {
  if (!Number.isFinite(originalQueueId)) return;
  if (successorQueueId !== null && originalQueueId === successorQueueId) return;
  try {
    await db.execute(sql`
      INSERT INTO cutting_packet_barcode_aliases
        (original_queue_id, successor_queue_id, inventory_item_id, packet_name, due_date_bucket, reason, created_at, updated_at)
      VALUES (${originalQueueId}, ${successorQueueId}, ${ctx.inventoryItemId ?? null}, ${ctx.packetName ?? null}, ${ctx.dueDateBucket ?? null}, ${reason}, NOW(), NOW())
      ON CONFLICT (original_queue_id) DO UPDATE
        SET successor_queue_id = EXCLUDED.successor_queue_id,
            inventory_item_id = COALESCE(EXCLUDED.inventory_item_id, cutting_packet_barcode_aliases.inventory_item_id),
            packet_name = COALESCE(EXCLUDED.packet_name, cutting_packet_barcode_aliases.packet_name),
            due_date_bucket = COALESCE(EXCLUDED.due_date_bucket, cutting_packet_barcode_aliases.due_date_bucket),
            reason = EXCLUDED.reason,
            updated_at = NOW()
    `);
  } catch (err: any) {
    console.warn('[cuttingPacketBarcodeAlias] recordAlias failed:', err?.message || err);
  }
}

/**
 * When a fresh queue row is created for a packet+due-date+inventory_item,
 * point any orphan aliases (successor IS NULL OR successor row no longer
 * exists) at it.
 */
export async function backfillAliasesForNewQueueRow(
  newQueueId: number,
  ctx: AliasContext,
): Promise<void> {
  if (!Number.isFinite(newQueueId) || ctx.inventoryItemId == null) return;
  try {
    await db.execute(sql`
      UPDATE cutting_packet_barcode_aliases
        SET successor_queue_id = ${newQueueId},
            reason = 'replaced',
            updated_at = NOW()
      WHERE inventory_item_id = ${ctx.inventoryItemId}
        AND COALESCE(due_date_bucket, 'null') = COALESCE(${ctx.dueDateBucket ?? null}, 'null')
        AND COALESCE(LOWER(packet_name), '') = COALESCE(LOWER(${ctx.packetName ?? null}), '')
        AND (
          successor_queue_id IS NULL
          OR successor_queue_id NOT IN (SELECT id FROM manufacturing_queue)
        )
        AND original_queue_id <> ${newQueueId}
    `);
  } catch (err: any) {
    console.warn('[cuttingPacketBarcodeAlias] backfillAliasesForNewQueueRow failed:', err?.message || err);
  }
}

export interface AliasResolution {
  alias: typeof cuttingPacketBarcodeAliases.$inferSelect;
  successorRow: typeof manufacturingQueue.$inferSelect | null;
}

/**
 * Resolve an aliased barcode to its current successor queue row (if any).
 * Follows the alias chain transitively in case the successor itself was
 * later merged/deleted. Returns the alias even when no live successor exists
 * so callers can produce an "unscheduled — please reprint" message instead
 * of a generic 404.
 */
export async function resolveAliasedQueueRow(originalQueueId: number): Promise<AliasResolution | null> {
  if (!Number.isFinite(originalQueueId)) return null;
  const seen = new Set<number>();
  let currentLookupId = originalQueueId;
  let firstAlias: typeof cuttingPacketBarcodeAliases.$inferSelect | null = null;

  while (!seen.has(currentLookupId)) {
    seen.add(currentLookupId);
    const [aliasRow] = await db
      .select()
      .from(cuttingPacketBarcodeAliases)
      .where(eq(cuttingPacketBarcodeAliases.originalQueueId, currentLookupId))
      .limit(1);
    if (!aliasRow) break;
    if (!firstAlias) firstAlias = aliasRow;
    if (aliasRow.successorQueueId == null) {
      // Dead-end alias (unscheduled, no successor yet)
      return { alias: firstAlias, successorRow: null };
    }
    // Try to load the successor queue row
    const [succRow] = await db
      .select()
      .from(manufacturingQueue)
      .where(and(
        eq(manufacturingQueue.id, aliasRow.successorQueueId),
        eq(manufacturingQueue.department, 'Cutting Table'),
      ))
      .limit(1);
    if (succRow) {
      return { alias: firstAlias, successorRow: succRow };
    }
    // Successor itself is gone — chain to its alias.
    currentLookupId = aliasRow.successorQueueId;
  }

  if (firstAlias) return { alias: firstAlias, successorRow: null };
  return null;
}

/**
 * Best-effort historical backfill: for every printed/old queue id that no
 * longer exists, find a current PENDING/IN_PROGRESS canonical row for the
 * same packet+bucket and record an alias pointing at it.
 *
 * Source of "old queue ids" is the existing cutting_built_packets table —
 * its barcode column embeds the original manufacturing_queue id in the form
 * `PKT-{date}-{queueId}-{partNumber}-{seq}`. Any built packet whose embedded
 * queue id is missing from manufacturing_queue is a candidate that the
 * operator may try to scan today.
 */
export async function backfillHistoricalAliases(pool: any): Promise<{
  candidatesScanned: number;
  aliasesCreated: number;
  unresolved: number;
  errors: number;
}> {
  let candidatesScanned = 0;
  let aliasesCreated = 0;
  let unresolved = 0;
  let errors = 0;

  try {
    // Pull every distinct queue id encoded in cutting_built_packets barcodes
    // whose row no longer exists in manufacturing_queue.
    const orphanRes = await pool.query(`
      WITH parsed AS (
        SELECT DISTINCT
          NULLIF((regexp_match(barcode, '^PKT-[^-]+-(\\d+)-'))[1], '')::int AS old_queue_id
        FROM cutting_built_packets
        WHERE barcode ~ '^PKT-[^-]+-\\d+-'
      )
      SELECT p.old_queue_id
      FROM parsed p
      LEFT JOIN manufacturing_queue mq ON mq.id = p.old_queue_id
      WHERE p.old_queue_id IS NOT NULL
        AND mq.id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM cutting_packet_barcode_aliases a
          WHERE a.original_queue_id = p.old_queue_id
        )
    `);
    const rows: Array<{ old_queue_id: number }> = (orphanRes as any).rows
      || (orphanRes as any[])
      || [];

    for (const { old_queue_id } of rows) {
      candidatesScanned++;
      try {
        // Recover packet identity from a built packet that references this id.
        const builtRes = await pool.query(
          `SELECT inventory_item_id, packet_type
             FROM cutting_built_packets
             WHERE barcode ~ ('^PKT-[^-]+-' || $1::text || '-')
             ORDER BY id ASC
             LIMIT 1`,
          [old_queue_id],
        );
        const built = (builtRes as any).rows?.[0] || (builtRes as any[])[0];
        const inventoryItemId: number | null = built?.inventory_item_id ?? null;
        const packetName: string | null = built?.packet_type ?? null;

        // Find a candidate canonical row for the same packet (any bucket — we
        // don't have a reliable due-date for the deleted row).
        let successorId: number | null = null;
        if (inventoryItemId != null) {
          const candRes = await pool.query(
            `SELECT id FROM manufacturing_queue
               WHERE department = 'Cutting Table'
                 AND inventory_item_id = $1
                 AND status IN ('PENDING','IN_PROGRESS')
               ORDER BY created_at DESC NULLS LAST, id DESC
               LIMIT 1`,
            [inventoryItemId],
          );
          successorId = (candRes as any).rows?.[0]?.id
            ?? (candRes as any[])[0]?.id
            ?? null;
        }

        await pool.query(
          `INSERT INTO cutting_packet_barcode_aliases
              (original_queue_id, successor_queue_id, inventory_item_id, packet_name, due_date_bucket, reason, created_at, updated_at)
            VALUES ($1, $2, $3, $4, NULL, 'historical', NOW(), NOW())
            ON CONFLICT (original_queue_id) DO NOTHING`,
          [old_queue_id, successorId, inventoryItemId, packetName],
        );
        if (successorId != null) aliasesCreated++;
        else unresolved++;
      } catch (rowErr: any) {
        console.warn('[cuttingPacketBarcodeAlias] backfillHistoricalAliases row failed:', rowErr?.message || rowErr);
        errors++;
      }
    }
  } catch (err: any) {
    console.warn('[cuttingPacketBarcodeAlias] backfillHistoricalAliases failed:', err?.message || err);
    errors++;
  }

  return { candidatesScanned, aliasesCreated, unresolved, errors };
}
