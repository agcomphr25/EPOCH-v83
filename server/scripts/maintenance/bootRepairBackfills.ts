type BootRepairContext = {
  db: any;
  pool: any;
};

export async function runEarlyBootRepairBackfills({ db, pool }: BootRepairContext) {
  // Backfill: ensure all customers have a customer_key derived from their name
  try {
    const result = await pool.query(
      `UPDATE customers SET customer_key = UPPER(REPLACE(TRIM(name), ' ', '_')) WHERE customer_key IS NULL`
    );
    const updated: number = result.rowCount ?? 0;
    if (updated > 0) {
      console.log(`✅ Backfilled customer_key for ${updated} customer(s) with NULL value`);
    }
  } catch (bfErr: unknown) {
    const msg = bfErr instanceof Error ? bfErr.message : String(bfErr);
    console.warn('⚠️ customer_key backfill skipped:', msg);
  }

  // Normalize pay_type casing: ensure all existing employees have uppercase pay_type values
  try {
    const payTypeResult = await pool.query(
      `UPDATE employees SET pay_type = UPPER(pay_type) WHERE pay_type IS NOT NULL AND pay_type != UPPER(pay_type)`
    );
    const payTypeUpdated: number = payTypeResult.rowCount ?? 0;
    if (payTypeUpdated > 0) {
      console.log(`✅ Normalized pay_type casing for ${payTypeUpdated} employee(s) to uppercase`);
    }
  } catch (payTypeErr: unknown) {
    const msg = payTypeErr instanceof Error ? payTypeErr.message : String(payTypeErr);
    console.warn('⚠️ pay_type normalization skipped:', msg);
  }

  // One-time migration: Reassign Red Hawk Rifles LLC POs from inactive customer 698 to active customer 547
  try {
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`UPDATE purchase_orders SET customer_id = '547' WHERE customer_id = '698'`);
    console.log('✅ One-time migration: Red Hawk Rifles LLC POs reassigned from customer 698 → 547');
  } catch (migError: any) {
    console.warn('⚠️ One-time migration skipped or already applied:', migError.message);
  }

  // Fix: Orders in Shipping Management should always be FULFILLED, not FINALIZED
  try {
    const { pool: fixPool } = await import('../../db');
    const { auditUpdateOrders } = await import('../../src/services/orderAuditWrapper');
    const eligibleRows = await fixPool.query(
      `SELECT order_id FROM all_orders
       WHERE current_department = 'Shipping Management' AND status = 'FINALIZED'`
    ) as any[];
    const eligibleIds = eligibleRows.map((r: any) => r.order_id);
    if (eligibleIds.length > 0) {
      await auditUpdateOrders({
        db: fixPool as any,
        orderIds: eligibleIds,
        changes: { status: 'FULFILLED' },
        source: 'BOOT_MIGRATION',
        user: null,
        reason: 'Boot migration: Shipping Management FINALIZED → FULFILLED',
        ip: null,
        userAgent: null,
      });
    }
    console.log(`✅ Fixed Shipping Management status: ${eligibleIds.length} orders updated from FINALIZED → FULFILLED`);
  } catch (fixErr: any) {
    console.warn('⚠️ Shipping Management status fix skipped:', fixErr.message);
  }

  // Sync serialized item part numbers to match their PO items
  try {
    const { sql: sqlSync } = await import('drizzle-orm');
    await db.execute(sqlSync`
      UPDATE p2_serialized_items si
      SET part_number = poi.part_number,
          part_name = poi.part_name,
          updated_at = NOW()
      FROM p2_purchase_order_items poi
      WHERE si.po_item_id = poi.id
        AND (si.part_number != poi.part_number OR si.part_name != poi.part_name)
    `);
    console.log('✅ Synced serialized item part numbers to match PO items');
  } catch (syncErr: any) {
    console.warn('⚠️ Serialized item sync skipped:', syncErr.message);
  }

  // Historical backfill: reconcile P2 manufacturing_queue entries to their source production orders
  // Guard: only run when there are both P2 queue entries AND pending P2 production orders,
  // so this is a no-op on clean databases and skips on subsequent restarts after the fix is applied.
  try {
    const p2GuardResult = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM manufacturing_queue
         WHERE department = 'Cutting Table'
           AND notes IS NOT NULL
           AND notes::text LIKE '%"isP2Packet":true%'
           AND notes::text NOT LIKE '%"p2BackfillApplied":true%') AS queue_count,
        (SELECT COUNT(*) FROM p2_production_orders
         WHERE status IN ('pending', 'PENDING', 'in_progress', 'queued')) AS pending_count
    `);
    const guardRow = (p2GuardResult as any).rows?.[0] || (p2GuardResult as any[])[0] || {};
    const queueCount = parseInt(guardRow.queue_count ?? '0', 10);
    const pendingCount = parseInt(guardRow.pending_count ?? '0', 10);
    if (queueCount > 0 && pendingCount > 0) {
      console.log(`🔄 P2 backfill: ${queueCount} P2 queue entries found, ${pendingCount} pending P2 orders — running historical backfill`);
      const { runP2ScheduledBackfill } = await import('../../src/routes/cuttingTable');
      const bfSummary = await runP2ScheduledBackfill(pool);
      console.log(`✅ P2 boot backfill complete: ${JSON.stringify(bfSummary)}`);
    } else {
      console.log(`✅ P2 boot backfill: guard check passed (queue_count=${queueCount}, pending_count=${pendingCount}) — skipping`);
    }
  } catch (p2BfErr: any) {
    console.warn('⚠️ P2 boot backfill skipped:', p2BfErr.message);
  }

  // Historical backfill: consolidate pre-task duplicate PENDING P2 cutting rows into the new
  // grouped shape (one row per packet type per due-date bucket, with contributing POs merged
  // into notes.poNumbers). Guard: only run when there is at least one PENDING P2 cutting row
  // in the legacy un-grouped shape (singular poNumber, OR missing poNumbers[], OR missing the
  // p2BackfillApplied:true stamp). Once consolidated, the guard finds no candidates and the
  // backfill becomes a no-op on subsequent restarts.
  try {
    const dupGuardResult = await pool.query(`
      SELECT COUNT(*) AS legacy_count
      FROM manufacturing_queue
      WHERE department = 'Cutting Table'
        AND status = 'PENDING'
        AND inventory_item_id IS NOT NULL
        AND notes IS NOT NULL
        AND (
          notes::text LIKE '%"isP2Packet":true%'
          OR notes::text LIKE '%"materialType":"p2_%'
        )
        AND (
          notes::text LIKE '%"poNumber":%'
          OR notes::text NOT LIKE '%"poNumbers":%'
          OR notes::text NOT LIKE '%"p2BackfillApplied":true%'
        )
    `);
    const dupGuardRow = (dupGuardResult as any).rows?.[0] || (dupGuardResult as any[])[0] || {};
    const legacyCount = parseInt(dupGuardRow.legacy_count ?? '0', 10);

    // CRITICAL: ensure cutting_packet_barcode_aliases exists BEFORE the
    // duplicate-grouping backfill runs. The backfill deletes merged rows
    // and writes alias mappings so previously printed `MFG-{queueId}-...`
    // labels still resolve. If the alias table is missing, those inserts
    // are silently skipped and we permanently lose the mapping.
    try {
      const { sql: sqlAlias } = await import('drizzle-orm');
      await db.execute(sqlAlias`
        CREATE TABLE IF NOT EXISTS cutting_packet_barcode_aliases (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          original_queue_id INTEGER NOT NULL UNIQUE,
          successor_queue_id INTEGER,
          inventory_item_id INTEGER,
          packet_name TEXT,
          due_date_bucket TEXT,
          reason TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await db.execute(sqlAlias`CREATE INDEX IF NOT EXISTS cutting_packet_barcode_aliases_successor_idx ON cutting_packet_barcode_aliases(successor_queue_id)`);
      await db.execute(sqlAlias`CREATE INDEX IF NOT EXISTS cutting_packet_barcode_aliases_packet_idx ON cutting_packet_barcode_aliases(inventory_item_id, due_date_bucket)`);
      console.log('✅ cutting_packet_barcode_aliases table ensured (pre-dup-backfill)');
    } catch (aliasTableErr: any) {
      // HARD FAIL: do not run the consolidation if we can't preserve aliases.
      // Surface a loud error so the operator knows barcode continuity is at
      // risk — silent degradation is worse than a noisy boot.
      console.error('❌ cutting_packet_barcode_aliases table creation FAILED — skipping duplicate-grouping backfill to preserve barcode continuity:', aliasTableErr?.message || aliasTableErr);
      throw aliasTableErr;
    }

    if (legacyCount > 0) {
      console.log(`🔄 P2 duplicate-grouping backfill: ${legacyCount} legacy PENDING P2 cutting rows found — running consolidation`);
      const { runP2DuplicateCuttingBackfill } = await import('../../src/routes/cuttingTable');
      const dupSummary = await runP2DuplicateCuttingBackfill(pool);
      console.log(`✅ P2 duplicate-grouping boot backfill complete: ${JSON.stringify(dupSummary)}`);
    } else {
      console.log('✅ P2 duplicate-grouping boot backfill: no legacy PENDING P2 cutting rows — skipping');
    }
  } catch (dupBfErr: any) {
    console.warn('⚠️ P2 duplicate-grouping boot backfill skipped:', dupBfErr.message);
  }

  // One-shot historical alias backfill — picks up labels printed before
  // the alias table existed by mining cutting_built_packets barcodes for
  // orphan queue ids. Runs AFTER the duplicate-grouping consolidation so
  // it sees the final canonical rows.
  try {
    const { backfillHistoricalAliases } = await import('../../src/utils/cuttingPacketBarcodeAlias');
    const aliasSummary = await backfillHistoricalAliases(pool);
    if (aliasSummary.candidatesScanned > 0) {
      console.log(`✅ Cutting packet barcode aliases — historical backfill: ${JSON.stringify(aliasSummary)}`);
    } else {
      console.log('✅ Cutting packet barcode aliases — no historical orphan barcodes detected');
    }
  } catch (aliasBootErr: any) {
    console.warn('⚠️ cutting_packet_barcode_aliases historical backfill skipped:', aliasBootErr.message);
  }

  // Data correction: PO 037517 item 225 (Grace Engineering) — fix cf_privateer → cf_beartooth
  // The specifications snapshot was frozen with the wrong stock model at creation time.
  // This correction updates stockModelId, stockModelName, and specifications.stockModel atomically.
  // Also corrects any production_orders spawned from item 225 that have the same bad snapshot.
  try {
    const { pgPool: corrPgPool } = await import('../../db');
    const checkResult = await corrPgPool.query(
      `SELECT id FROM purchase_order_items WHERE id = 225 AND stock_model_id = 'cf_privateer'`
    );
    if (checkResult.rows.length > 0) {
      await corrPgPool.query(`
        UPDATE purchase_order_items
        SET stock_model_id   = 'cf_beartooth',
            stock_model_name = 'Carbon Fiber Beartooth',
            specifications   = jsonb_set(
              specifications::jsonb,
              '{stockModel}',
              '"cf_beartooth"'
            ),
            updated_at = NOW()
        WHERE id = 225 AND stock_model_id = 'cf_privateer'
      `);
      console.log('✅ Data correction: PO item 225 stock model corrected cf_privateer → cf_beartooth');
    } else {
      console.log('✅ Data correction: PO item 225 already correct or not found, skipping');
    }
    // Also fix production_orders that were spawned from PO item 225 with the bad snapshot
    const prodCheckResult = await corrPgPool.query(
      `SELECT id FROM production_orders WHERE po_item_id = 225 AND specifications->>'stockModel' = 'cf_privateer'`
    );
    if (prodCheckResult.rows.length > 0) {
      await corrPgPool.query(`
        UPDATE production_orders
        SET specifications = jsonb_set(
              specifications::jsonb,
              '{stockModel}',
              '"cf_beartooth"'
            ),
            updated_at = NOW()
        WHERE po_item_id = 225 AND specifications->>'stockModel' = 'cf_privateer'
      `);
      console.log(`✅ Data correction: ${prodCheckResult.rows.length} production_orders for PO item 225 corrected cf_privateer → cf_beartooth`);
    }
  } catch (corrErr: any) {
    console.warn('⚠️ PO item 225 data correction skipped:', corrErr.message);
  }

  // Data correction: PO P18665 item 82 — fix duplicate AG-FG-ADJ-AHV105-CDN → AG-FG-AHV105-CDN
  // Item 82 was entered as AG-FG-ADJ-AHV105-CDN (same as item 78) but should be
  // AG-FG-AHV105-CDN (non-adjustable, fg_alpine_hunter, $489). Three-part fix:
  //   1. Correct item_name / item_id on purchase_order_items row (if not yet done)
  //   2. Correct item_name on any production_orders still carrying the old ADJ name
  //   3. Reactivate the newest cancelled order if no active/pending order exists
  try {
    const { pgPool: p18665Pool } = await import('../../db');

    // Part 1 - fix item_name if still wrong
    const p18665NameCheck = await p18665Pool.query(
      `SELECT id FROM purchase_order_items WHERE id = 82 AND item_name = 'AG-FG-ADJ-AHV105-CDN'`
    );
    if (p18665NameCheck.rows.length > 0) {
      await p18665Pool.query(`
        UPDATE purchase_order_items
        SET item_name   = 'AG-FG-AHV105-CDN',
            item_id     = '36',
            unit_price  = 489.00,
            total_price = 489.00,
            updated_at  = NOW()
        WHERE id = 82 AND item_name = 'AG-FG-ADJ-AHV105-CDN'
      `);
      console.log('✅ Data correction: PO P18665 item 82 item_name corrected ADJ-AHV105-CDN → AHV105-CDN');
    }

    // Part 2 - fix item_id if it was only partially corrected (name fixed but id still 72)
    const p18665IdCheck = await p18665Pool.query(
      `SELECT id FROM purchase_order_items WHERE id = 82 AND item_id = '72' AND item_name = 'AG-FG-AHV105-CDN'`
    );
    if (p18665IdCheck.rows.length > 0) {
      await p18665Pool.query(`
        UPDATE purchase_order_items
        SET item_id = '36', updated_at = NOW()
        WHERE id = 82 AND item_id = '72'
      `);
      console.log('✅ Data correction: PO P18665 item 82 item_id corrected 72 → 36');
    }

    // Part 3 - fix production_orders still carrying the ADJ item name for po_item_id=82
    const p18665ProdCheck = await p18665Pool.query(
      `SELECT id FROM production_orders WHERE po_item_id = 82 AND item_name = 'AG-FG-ADJ-AHV105-CDN'`
    );
    if (p18665ProdCheck.rows.length > 0) {
      await p18665Pool.query(`
        UPDATE production_orders
        SET item_name  = 'AG-FG-AHV105-CDN',
            item_id    = '36',
            item_code  = 'AG-FG-AHV105-CDN',
            specifications = specifications || '{"stockModel": "fg_alpine_hunter"}'::jsonb,
            updated_at = NOW()
        WHERE po_item_id = 82 AND item_name = 'AG-FG-ADJ-AHV105-CDN'
      `);
      console.log(`✅ Data correction: ${p18665ProdCheck.rows.length} production_order(s) for PO item 82 renamed ADJ-AHV105-CDN → AHV105-CDN`);
    }

    // Part 4 - if every production order for item 82 is CANCELLED, reactivate the newest one
    const p18665ActiveCheck = await p18665Pool.query(`
      SELECT COUNT(*) AS cnt
      FROM production_orders
      WHERE po_item_id = 82 AND production_status NOT IN ('CANCELLED', 'SHIPPED')
    `);
    const activeCnt = parseInt(p18665ActiveCheck.rows[0]?.cnt ?? '0', 10);
    if (activeCnt === 0) {
      const newestCancelled = await p18665Pool.query(`
        SELECT id, order_id FROM production_orders
        WHERE po_item_id = 82 AND production_status = 'CANCELLED'
        ORDER BY id DESC LIMIT 1
      `);
      if (newestCancelled.rows.length > 0) {
        const { id: ncId, order_id: ncOrderId } = newestCancelled.rows[0];
        await p18665Pool.query(`
          UPDATE production_orders
          SET production_status = 'PENDING',
              item_name  = 'AG-FG-AHV105-CDN',
              item_id    = '36',
              item_code  = 'AG-FG-AHV105-CDN',
              specifications = specifications || '{"stockModel": "fg_alpine_hunter"}'::jsonb,
              updated_at = NOW()
          WHERE id = ${ncId}
        `);
        console.log(`✅ Data correction: Reactivated production order ${ncOrderId} (id ${ncId}) for PO P18665 item 82 — set to PENDING`);
      }
    } else {
      console.log(`✅ Data correction: PO P18665 item 82 already has ${activeCnt} active/pending production order(s), no reactivation needed`);
    }
  } catch (corrErr: any) {
    console.warn('⚠️ PO P18665 item 82 data correction skipped:', corrErr.message);
  }

  // Data correction: PO P19802 (Red Hawk) — remove 14 duplicate line items created by
  // multi-click on "Add to Order". User entered 7 items but they were submitted 3 times
  // resulting in 21 rows. Keep the first instance of each unique item_name (IDs 273-278, 284)
  // and delete the 14 extras (IDs 279-293 except 284).
  try {
    const { pgPool: p19802Pool } = await import('../../db');
    const dupeCheck = await p19802Pool.query(
      `SELECT COUNT(*) AS cnt FROM purchase_order_items WHERE id IN (279,280,281,282,283,285,286,287,288,289,290,291,292,293)`
    );
    const dupeCount = parseInt(dupeCheck.rows[0]?.cnt ?? '0', 10);
    if (dupeCount > 0) {
      await p19802Pool.query(
        `DELETE FROM purchase_order_items WHERE id IN (279,280,281,282,283,285,286,287,288,289,290,291,292,293)`
      );
      console.log(`✅ Data correction: Removed ${dupeCount} duplicate line items from PO P19802 (Red Hawk)`);
    } else {
      console.log('✅ Data correction: PO P19802 duplicates already cleaned up, skipping');
    }
  } catch (corrErr: any) {
    console.warn('⚠️ PO P19802 duplicate cleanup skipped:', corrErr.message);
  }

  // Data correction (global): production orders where item_name = item_id (e.g. "81", "Alpine Hunter")
  // instead of the real SKU from purchase_order_items. Affects 15 POs (P18321, P18666, P18918, etc.)
  // created before the order-creation bug was fixed. Uses po_item_id FK to find the correct name.
  // Idempotent: only runs when affected rows exist. Also corrects item_id for display-name cases.
  try {
    const { pgPool: itemNamePool } = await import('../../db');
    const itemNameCheck = await itemNamePool.query(
      `SELECT COUNT(*) AS cnt
       FROM production_orders po
       JOIN purchase_order_items poi ON po.po_item_id = poi.id
       WHERE po.item_name = po.item_id
         AND poi.item_name LIKE 'AG-%'`
    );
    const itemNameBadCount = parseInt(itemNameCheck.rows[0]?.cnt ?? '0', 10);
    if (itemNameBadCount > 0) {
      const itemNameFix = await itemNamePool.query(
        `UPDATE production_orders po
         SET item_name = poi.item_name,
             item_id   = poi.item_id
         FROM purchase_order_items poi
         WHERE po.po_item_id = poi.id
           AND po.item_name = po.item_id
           AND poi.item_name LIKE 'AG-%'`
      );
      console.log(`✅ Data correction: Fixed ${itemNameFix.rowCount} production order(s) across all POs — replaced stub item names with correct SKUs`);
    } else {
      console.log('✅ Data correction: All production order item names already correct, skipping');
    }
  } catch (corrErr: any) {
    console.warn('⚠️ Global production order item name correction skipped:', corrErr.message);
  }

  // Data correction: fix production orders where item_id, item_name, item_code, or specifications
  // don't match the linked purchase_order_items row (via po_item_id). Excludes SHIPPED orders.
  // Also cancels excess duplicate production orders for PO lines that have more active orders
  // than the line's quantity (keeping the earliest-created one per PO line, excluding SHIPPED).
  // Idempotent: checks before updating.
  try {
    const { pgPool: mismatchPool } = await import('../../db');

    // Step 1: fix item_id / item_name / item_code / specifications mismatches
    const mismatchCheck = await mismatchPool.query(
      `SELECT COUNT(*) AS cnt
       FROM production_orders po
       JOIN purchase_order_items poi ON po.po_item_id = poi.id
       WHERE po.production_status != 'SHIPPED'
         AND (
           po.item_id       IS DISTINCT FROM poi.item_id
           OR po.item_name  IS DISTINCT FROM poi.item_name
           OR po.item_code  IS DISTINCT FROM UPPER(TRIM(COALESCE(NULLIF(TRIM(poi.item_name), ''), NULLIF(TRIM(poi.item_id), ''))))
           OR po.specifications IS DISTINCT FROM poi.specifications::jsonb
         )`
    );
    const mismatchCount = parseInt(mismatchCheck.rows[0]?.cnt ?? '0', 10);
    if (mismatchCount > 0) {
      const mismatchFix = await mismatchPool.query(
        `UPDATE production_orders po
         SET item_id        = poi.item_id,
             item_name      = poi.item_name,
             item_code      = UPPER(TRIM(COALESCE(NULLIF(TRIM(poi.item_name), ''), NULLIF(TRIM(poi.item_id), '')))),
             specifications = poi.specifications::jsonb,
             updated_at     = NOW()
         FROM purchase_order_items poi
         WHERE po.po_item_id = poi.id
           AND po.production_status != 'SHIPPED'
           AND (
             po.item_id       IS DISTINCT FROM poi.item_id
             OR po.item_name  IS DISTINCT FROM poi.item_name
             OR po.item_code  IS DISTINCT FROM UPPER(TRIM(COALESCE(NULLIF(TRIM(poi.item_name), ''), NULLIF(TRIM(poi.item_id), ''))))
             OR po.specifications IS DISTINCT FROM poi.specifications::jsonb
           )`
      );
      console.log(`✅ Data correction: Fixed ${mismatchFix.rowCount} production order(s) with mismatched item_id/item_name/specifications`);
    } else {
      console.log('✅ Data correction: All production order item data matches PO lines, skipping');
    }

    // RC-1 FIX: The excess duplicate cancellation migration has been intentionally removed
    // from boot-time. Running it on every restart silently cancelled orders that were
    // legitimately re-released by operators after partial failures. The pre-release guard
    // in the scheduling route now queries real-time counts from production_orders to prevent
    // new duplicates, making this boot-time cleanup both redundant and dangerous.
    console.log('✅ Data correction: Boot-time excess duplicate cancellation skipped (moved to pre-release guard)');
  } catch (mismatchErr: any) {
    console.warn('⚠️ Production order mismatch correction skipped:', mismatchErr.message);
  }

  // Auto-close OPEN POs where every non-cancelled production order is SHIPPED
  // Fixes POs like SWS2501/SWS2502 that show "6/6 Shipped" but remain in Active tab
  try {
    const { pgPool: autoClosePool } = await import('../../db');
    const autoCloseResult = await autoClosePool.query(`
      UPDATE purchase_orders po
      SET status = 'CLOSED'
      WHERE po.status = 'OPEN'
        AND EXISTS (
          SELECT 1 FROM production_orders pr WHERE pr.po_id = po.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM production_orders pr
          WHERE pr.po_id = po.id
            AND pr.production_status <> 'SHIPPED'
            AND pr.production_status <> 'CANCELLED'
            AND pr.production_status <> 'COMPLETED'
        )
    `);
    if (autoCloseResult.rowCount && autoCloseResult.rowCount > 0) {
      console.log(`✅ Auto-closed ${autoCloseResult.rowCount} OPEN PO(s) where all production orders are SHIPPED`);
    } else {
      console.log('✅ Auto-close POs: no newly eligible POs found');
    }
  } catch (acErr: any) {
    console.warn('⚠️ Auto-close fully-shipped POs migration skipped:', acErr.message);
  }

  // Sync serialized items stuck at "Pending Layup" with their actual work task progress
  try {
    const { sql: sqlDeptSync } = await import('drizzle-orm');
    await db.execute(sqlDeptSync`
      UPDATE p2_serialized_items si
      SET current_department = latest.department,
          updated_at = NOW()
      FROM (
        SELECT wt.serialized_item_id,
               wt.department,
               wt.completed_at,
               wt.status as task_status
        FROM p2_work_tasks wt
        WHERE wt.started_at IS NOT NULL
          AND wt.status IN ('IN_PROGRESS', 'COMPLETED')
          AND wt.id = (
          SELECT wt2.id FROM p2_work_tasks wt2
          WHERE wt2.serialized_item_id = wt.serialized_item_id
            AND wt2.started_at IS NOT NULL
            AND wt2.status IN ('IN_PROGRESS', 'COMPLETED')
          ORDER BY wt2.started_at DESC NULLS LAST
          LIMIT 1
        )
      ) latest
      WHERE si.id = latest.serialized_item_id
        AND (si.current_department = 'Pending Layup' OR si.current_department IS NULL OR si.current_department = '')
        AND latest.department IS NOT NULL
        AND latest.department != 'Pending Layup'
    `);
    console.log('✅ Synced stuck "Pending Layup" items with actual work task progress');
  } catch (deptSyncErr: any) {
    console.warn('⚠️ Department sync skipped:', deptSyncErr.message);
  }

  // Also mark items as COMPLETED if all their routing steps have completed work tasks
  try {
    const { sql: sqlComplete } = await import('drizzle-orm');
    await db.execute(sqlComplete`
      UPDATE p2_serialized_items si
      SET status = 'COMPLETED',
          current_department = 'COMPLETED',
          completed_at = latest_completed.completed_at,
          updated_at = NOW()
      FROM (
        SELECT wt.serialized_item_id,
               MAX(wt.completed_at) as completed_at
        FROM p2_work_tasks wt
        WHERE wt.status = 'COMPLETED'
          AND wt.department IN ('Final QC', 'Quality Control')
        GROUP BY wt.serialized_item_id
      ) latest_completed
      WHERE si.id = latest_completed.serialized_item_id
        AND si.status != 'COMPLETED'
        AND NOT EXISTS (
          SELECT 1 FROM p2_work_tasks wt3
          WHERE wt3.serialized_item_id = si.id
            AND wt3.status != 'COMPLETED'
        )
    `);
    console.log('✅ Marked fully-completed travelers as COMPLETED');
  } catch (completeErr: any) {
    console.warn('⚠️ Completion sync skipped:', completeErr.message);
  }

  // Clean up resolved RMAs still showing in shipping queue
  try {
    const { sql: sqlCleanup } = await import('drizzle-orm');
    await db.execute(sqlCleanup`UPDATE nonconformance_records SET shipping_status = 'Shipped', updated_at = NOW() WHERE status = 'Resolved' AND shipping_status = 'Ready to Ship' AND tracking_number IS NOT NULL`);
    await db.execute(sqlCleanup`UPDATE nonconformance_records SET shipping_status = 'Shipped', updated_at = NOW() WHERE status = 'Resolved' AND shipping_status = 'Ready to Ship' AND resolved_at < NOW() - INTERVAL '1 day'`);
    console.log('✅ Cleaned up resolved RMAs from shipping queue');
  } catch (cleanupErr: any) {
    console.warn('⚠️ RMA cleanup skipped:', cleanupErr.message);
  }
}

export async function runReturnToQcShippedStatusRepair() {
  // Data repair: clear stuck SHIPPED stock_status on metal-accessory purchase_order_items
  // from POs 58631218, 58636476, and 58641595 that were left behind after return-to-QC.
  // The return-to-QC endpoint previously had a guard that refused to clear stock_status
  // for items already at 'SHIPPED', causing metal accessories to disappear from the
  // Shipping QC PO tab. This repair is idempotent — rows already cleared are untouched.
  try {
    const { apply: repairReturnToQcShippedStatus } = await import('../../src/migrations/repairReturnToQcShippedStatus');
    const repairResult = await repairReturnToQcShippedStatus();
    if (repairResult.totalCleared > 0) {
      console.log(`✅ Repair: cleared stuck SHIPPED stock_status on ${repairResult.totalCleared} purchase_order_items across POs 58631218, 58636476, 58641595`);
    } else {
      console.log('✅ Repair: no stuck SHIPPED stock_status rows found (already applied or data was clean)');
    }
  } catch (repairErr: any) {
    console.warn('⚠️ Return-to-QC stock_status repair skipped:', repairErr.message);
  }
}

export async function runPacketAllocationBackfill({ pool }: BootRepairContext) {
  // One-time backfill: restore allocatedToOrder on cutting_built_packets for historical Layup task completions.
  // Finds all traveler_task_fields with fieldKey IN ('packetBarcode','packet_barcode'), resolves the
  // traveler → P2 serialized item, and sets cutting_built_packets.allocated_to_order when it is currently NULL.
  // Idempotent: rows with an existing allocatedToOrder are never overwritten.
  // AS9100 evidence: each backfilled record is logged with the packet barcode and allocation target.
  try {
    const backfillResult = await pool.query(`
      WITH packet_fields AS (
        SELECT
          ttf.value               AS packet_barcode,
          t.id                    AS traveler_id,
          t.serial_number         AS serial_number
        FROM traveler_task_fields ttf
        JOIN traveler_tasks       tt  ON tt.id  = ttf.traveler_task_id
        JOIN traveler_steps       ts  ON ts.id  = tt.traveler_step_id
        JOIN travelers            t   ON t.id   = ts.traveler_id
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
      SET
        allocated_to_order = w.allocation_target,
        updated_at = NOW()
      FROM with_p2 w
      WHERE cbp.barcode = w.packet_barcode
        AND (cbp.allocated_to_order IS NULL OR cbp.allocated_to_order = '')
      RETURNING cbp.barcode, cbp.allocated_to_order
    `);
    const backfilledRows = backfillResult.rows || [];
    if (backfilledRows.length > 0) {
      console.log(`✅ Packet allocation backfill: restored ${backfilledRows.length} allocatedToOrder link(s) — AS9100 traceability restored`);
      backfilledRows.forEach((r: any) => {
        console.log(`  [Packet Allocation Backfill] "${r.barcode}" → "${r.allocated_to_order}"`);
      });
    } else {
      console.log('✅ Packet allocation backfill: no unallocated historical packet fields found — already up-to-date');
    }
  } catch (packetBfErr: any) {
    console.warn('⚠️ Packet allocation backfill skipped:', packetBfErr.message);
  }
}
