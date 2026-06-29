import { pool, pgPool } from '../../db';
import { pathToFileURL } from 'url';

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
};

async function runP2QueueAndBarcodeBackfills() {
  const guard = await pgPool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM p2_manufacturing_queue) AS queue_count,
      (SELECT COUNT(*)::int FROM p2_production_orders WHERE status = 'PENDING') AS pending_count
  `);
  const queueCount = Number(guard.rows?.[0]?.queue_count || 0);
  const pendingCount = Number(guard.rows?.[0]?.pending_count || 0);

  if (queueCount > 0 || pendingCount > 0) {
    console.log(`[historical-data-corrections] P2 scheduled backfill: queue=${queueCount}, pending=${pendingCount}`);
    const { runP2ScheduledBackfill } = await import('../../src/routes/cuttingTable');
    const summary = await runP2ScheduledBackfill(pool);
    console.log(`[historical-data-corrections] P2 scheduled backfill complete: ${JSON.stringify(summary)}`);
  } else {
    console.log('[historical-data-corrections] P2 scheduled backfill skipped: no queue/pending rows');
  }

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS cutting_packet_barcode_aliases (
      id SERIAL PRIMARY KEY,
      alias_barcode TEXT NOT NULL UNIQUE,
      canonical_queue_id INTEGER NOT NULL REFERENCES p2_cutting_queue(id) ON DELETE CASCADE,
      original_queue_id INTEGER,
      reason TEXT NOT NULL DEFAULT 'duplicate_grouping_backfill',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pgPool.query(`CREATE INDEX IF NOT EXISTS idx_cutting_packet_aliases_canonical ON cutting_packet_barcode_aliases(canonical_queue_id)`);

  const legacyDupCheck = await pgPool.query(`
    SELECT COUNT(*)::int AS legacy_count
    FROM (
      SELECT
        po.po_id,
        COALESCE(poi.inventory_item_id::text, po.item_id::text, po.item_name, po.item_code) AS item_key,
        COALESCE(poi.specifications::jsonb->>'stockModel', po.specifications::jsonb->>'stockModel', '') AS stock_model_id,
        COUNT(*) AS row_count,
        MAX(CASE WHEN COALESCE(array_length(cq.task_ids, 1), 0) > 1 THEN 1 ELSE 0 END) AS has_grouped_row
      FROM p2_cutting_queue cq
      JOIN p2_production_orders po ON po.id = cq.production_order_id
      LEFT JOIN p2_purchase_order_items poi ON poi.id = po.po_item_id
      WHERE cq.status = 'PENDING'
      GROUP BY po.po_id, item_key, stock_model_id
      HAVING COUNT(*) > 1
        AND MAX(CASE WHEN COALESCE(array_length(cq.task_ids, 1), 0) > 1 THEN 1 ELSE 0 END) = 0
    ) legacy_groups
  `);
  const legacyCount = Number(legacyDupCheck.rows?.[0]?.legacy_count || 0);
  if (legacyCount > 0) {
    console.log(`[historical-data-corrections] P2 duplicate-grouping backfill: ${legacyCount} legacy group(s)`);
    const { runP2DuplicateCuttingBackfill } = await import('../../src/routes/cuttingTable');
    const summary = await runP2DuplicateCuttingBackfill(pool);
    console.log(`[historical-data-corrections] P2 duplicate-grouping backfill complete: ${JSON.stringify(summary)}`);
  } else {
    console.log('[historical-data-corrections] P2 duplicate-grouping backfill skipped: no legacy rows');
  }

  const { backfillHistoricalAliases } = await import('../../src/utils/cuttingPacketBarcodeAlias');
  const aliasSummary = await backfillHistoricalAliases(pool);
  console.log(`[historical-data-corrections] Cutting packet alias backfill complete: ${JSON.stringify(aliasSummary)}`);
}

async function correctPoItem225(db: Queryable) {
  const itemResult = await db.query(`SELECT id FROM purchase_order_items WHERE id = 225 AND stock_model_id = 'cf_privateer'`);
  if (itemResult.rows.length > 0) {
    await db.query(`
      UPDATE purchase_order_items
      SET stock_model_id = 'cf_beartooth',
          stock_model_name = 'Carbon Fiber Beartooth',
          specifications = jsonb_set(specifications::jsonb, '{stockModel}', '"cf_beartooth"'),
          updated_at = NOW()
      WHERE id = 225 AND stock_model_id = 'cf_privateer'
    `);
    console.log('[historical-data-corrections] Corrected PO item 225 stock model');
  }

  const prodResult = await db.query(`
    SELECT id FROM production_orders
    WHERE po_item_id = 225 AND specifications->>'stockModel' = 'cf_privateer'
  `);
  if (prodResult.rows.length > 0) {
    await db.query(`
      UPDATE production_orders
      SET specifications = jsonb_set(specifications::jsonb, '{stockModel}', '"cf_beartooth"'),
          updated_at = NOW()
      WHERE po_item_id = 225 AND specifications->>'stockModel' = 'cf_privateer'
    `);
    console.log(`[historical-data-corrections] Corrected ${prodResult.rows.length} production order(s) for PO item 225`);
  }
}

async function correctP18665Item82(db: Queryable) {
  const wrongName = await db.query(`SELECT id FROM purchase_order_items WHERE id = 82 AND item_name = 'AG-FG-ADJ-AHV105-CDN'`);
  if (wrongName.rows.length > 0) {
    await db.query(`
      UPDATE purchase_order_items
      SET item_name = 'AG-FG-AHV105-CDN',
          item_id = '36',
          unit_price = 489.00,
          total_price = 489.00,
          updated_at = NOW()
      WHERE id = 82 AND item_name = 'AG-FG-ADJ-AHV105-CDN'
    `);
    console.log('[historical-data-corrections] Corrected PO P18665 item 82 name');
  }

  const wrongItemId = await db.query(`SELECT id FROM purchase_order_items WHERE id = 82 AND item_id = '72' AND item_name = 'AG-FG-AHV105-CDN'`);
  if (wrongItemId.rows.length > 0) {
    await db.query(`UPDATE purchase_order_items SET item_id = '36', updated_at = NOW() WHERE id = 82 AND item_id = '72'`);
    console.log('[historical-data-corrections] Corrected PO P18665 item 82 item_id');
  }

  const wrongProductionOrders = await db.query(`
    SELECT id FROM production_orders
    WHERE po_item_id = 82 AND item_name = 'AG-FG-ADJ-AHV105-CDN'
  `);
  if (wrongProductionOrders.rows.length > 0) {
    await db.query(`
      UPDATE production_orders
      SET item_name = 'AG-FG-AHV105-CDN',
          item_id = '36',
          item_code = 'AG-FG-AHV105-CDN',
          specifications = specifications || '{"stockModel": "fg_alpine_hunter"}'::jsonb,
          updated_at = NOW()
      WHERE po_item_id = 82 AND item_name = 'AG-FG-ADJ-AHV105-CDN'
    `);
    console.log(`[historical-data-corrections] Corrected ${wrongProductionOrders.rows.length} production order(s) for PO P18665 item 82`);
  }

  const activeCheck = await db.query(`
    SELECT COUNT(*) AS cnt
    FROM production_orders
    WHERE po_item_id = 82 AND production_status NOT IN ('CANCELLED', 'SHIPPED')
  `);
  if (Number(activeCheck.rows[0]?.cnt || 0) === 0) {
    const newestCancelled = await db.query(`
      SELECT id, order_id FROM production_orders
      WHERE po_item_id = 82 AND production_status = 'CANCELLED'
      ORDER BY id DESC
      LIMIT 1
    `);
    if (newestCancelled.rows.length > 0) {
      await db.query(`
        UPDATE production_orders
        SET production_status = 'PENDING',
            item_name = 'AG-FG-AHV105-CDN',
            item_id = '36',
            item_code = 'AG-FG-AHV105-CDN',
            specifications = specifications || '{"stockModel": "fg_alpine_hunter"}'::jsonb,
            updated_at = NOW()
        WHERE id = $1
      `, [newestCancelled.rows[0].id]);
      console.log(`[historical-data-corrections] Reactivated production order ${newestCancelled.rows[0].order_id} for PO P18665 item 82`);
    }
  }
}

async function correctP19802Duplicates(db: Queryable) {
  const duplicateIds = [279, 280, 281, 282, 283, 285, 286, 287, 288, 289, 290, 291, 292, 293];
  const dupeCheck = await db.query(
    `SELECT COUNT(*) AS cnt FROM purchase_order_items WHERE id = ANY($1::int[])`,
    [duplicateIds],
  );
  const dupeCount = Number(dupeCheck.rows[0]?.cnt || 0);
  if (dupeCount > 0) {
    await db.query(`DELETE FROM purchase_order_items WHERE id = ANY($1::int[])`, [duplicateIds]);
    console.log(`[historical-data-corrections] Removed ${dupeCount} duplicate PO P19802 line item(s)`);
  }
}

async function correctProductionOrderItemNames(db: Queryable) {
  const itemNameCheck = await db.query(`
    SELECT COUNT(*) AS cnt
    FROM production_orders po
    JOIN purchase_order_items poi ON po.po_item_id = poi.id
    WHERE po.item_name = po.item_id
      AND poi.item_name LIKE 'AG-%'
  `);
  if (Number(itemNameCheck.rows[0]?.cnt || 0) > 0) {
    const result = await db.query(`
      UPDATE production_orders po
      SET item_name = poi.item_name,
          item_id = poi.item_id
      FROM purchase_order_items poi
      WHERE po.po_item_id = poi.id
        AND po.item_name = po.item_id
        AND poi.item_name LIKE 'AG-%'
    `);
    console.log(`[historical-data-corrections] Corrected ${result.rowCount ?? 0} production order item name(s)`);
  }
}

async function correctProductionOrderMismatches(db: Queryable) {
  const mismatchCheck = await db.query(`
    SELECT COUNT(*) AS cnt
    FROM production_orders po
    JOIN purchase_order_items poi ON po.po_item_id = poi.id
    WHERE po.production_status != 'SHIPPED'
      AND (
        po.item_id IS DISTINCT FROM poi.item_id
        OR po.item_name IS DISTINCT FROM poi.item_name
        OR po.specifications IS DISTINCT FROM poi.specifications::jsonb
      )
  `);
  if (Number(mismatchCheck.rows[0]?.cnt || 0) > 0) {
    const result = await db.query(`
      UPDATE production_orders po
      SET item_id = poi.item_id,
          item_name = poi.item_name,
          specifications = poi.specifications::jsonb,
          updated_at = NOW()
      FROM purchase_order_items poi
      WHERE po.po_item_id = poi.id
        AND po.production_status != 'SHIPPED'
        AND (
          po.item_id IS DISTINCT FROM poi.item_id
          OR po.item_name IS DISTINCT FROM poi.item_name
          OR po.specifications IS DISTINCT FROM poi.specifications::jsonb
        )
    `);
    console.log(`[historical-data-corrections] Corrected ${result.rowCount ?? 0} production order mismatch(es)`);
  }
}

async function runPoAndProductionOrderCorrections() {
  await correctPoItem225(pgPool);
  await correctP18665Item82(pgPool);
  await correctP19802Duplicates(pgPool);
  await correctProductionOrderItemNames(pgPool);
  await correctProductionOrderMismatches(pgPool);
}

async function backfillHistoricalPacketAllocations() {
  const result = await pgPool.query(`
    WITH packet_fields AS (
      SELECT
        ttf.value AS packet_barcode,
        t.id AS traveler_id,
        t.serial_number AS serial_number
      FROM traveler_task_fields ttf
      JOIN traveler_tasks tt ON tt.id = ttf.traveler_task_id
      JOIN traveler_steps ts ON ts.id = tt.traveler_step_id
      JOIN travelers t ON t.id = ts.traveler_id
      WHERE ttf.field_key IN ('packetBarcode', 'packet_barcode')
        AND ttf.value IS NOT NULL
        AND ttf.value <> ''
    ),
    with_p2 AS (
      SELECT
        pf.packet_barcode,
        pf.traveler_id,
        COALESCE(p2.barcode, p2.serial_number) AS allocation_target
      FROM packet_fields pf
      JOIN p2_serialized_items p2
        ON (
          LOWER(p2.serial_number) = LOWER(pf.serial_number)
          OR LOWER(p2.traveler_barcode) = LOWER(pf.serial_number)
        )
      WHERE pf.serial_number IS NOT NULL
    )
    UPDATE cutting_built_packets cbp
    SET allocated_to_order = w.allocation_target,
        updated_at = NOW()
    FROM with_p2 w
    WHERE cbp.barcode = w.packet_barcode
      AND (cbp.allocated_to_order IS NULL OR cbp.allocated_to_order = '')
    RETURNING cbp.barcode, cbp.allocated_to_order
  `);
  console.log(`[historical-data-corrections] Restored ${result.rows.length} historical packet allocation link(s)`);
  for (const row of result.rows) {
    console.log(`[historical-data-corrections] Packet ${row.barcode} allocated to ${row.allocated_to_order}`);
  }
}

export async function runHistoricalDataCorrections() {
  console.log('[historical-data-corrections] Starting manual historical repair runner');
  await runP2QueueAndBarcodeBackfills();
  await runPoAndProductionOrderCorrections();
  await backfillHistoricalPacketAllocations();
  console.log('[historical-data-corrections] Complete');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runHistoricalDataCorrections()
    .catch((err) => {
      console.error('[historical-data-corrections] FAILED', err);
      process.exit(1);
    })
    .finally(async () => {
      await pgPool.end();
    });
}
