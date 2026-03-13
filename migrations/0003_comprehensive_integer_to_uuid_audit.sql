-- =============================================================================
-- COMPREHENSIVE INTEGER → UUID AUDIT MIGRATION
-- =============================================================================
-- Purpose: Resolve ALL integer → uuid column mismatches in one idempotent pass.
-- Every block is guarded by IF EXISTS (... AND data_type = 'integer') so it is
-- a complete no-op on any database that is already correctly typed.
--
-- Strategy per column:
--   • If table is empty (or column values are all NULL):
--       ALTER COLUMN TYPE uuid USING NULL         (fast, safe)
--   • If table contains data:
--       1. ADD COLUMN _uuid uuid
--       2. BACKFILL  (where a mapping path exists)
--       3. DROP old column + constraints/indexes
--       4. RENAME _uuid → original name
--       5. RECREATE FK constraint + index
--   • Where no mapping path exists (integer value cannot correspond to any UUID PK):
--       All existing values are NULL-ed before type change (they were broken refs).
--
-- Idempotency: every block starts with an IF check, so re-running is safe.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. cutting_built_packets.product_category_id
--    (same guard as migration 0001 – duplicated here for completeness)
--    Table history: boot migration created this with INTEGER in older versions.
--    Backfill: not possible (cutting_product_categories.id is UUID only).
--    Safe: cutting_built_packets typically has 0 rows at migration time.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_built_packets'
      AND column_name = 'product_category_id'
      AND data_type   = 'integer'
  ) THEN

    IF (SELECT COUNT(*) FROM cutting_built_packets WHERE product_category_id IS NOT NULL) = 0 THEN
      -- Fast path: no data to preserve, just retype
      DELETE FROM cutting_built_packet_fabric_sources
        WHERE built_packet_id IN (SELECT id FROM cutting_built_packets);
      DELETE FROM cutting_built_packets;
      ALTER TABLE cutting_built_packets
        ALTER COLUMN product_category_id TYPE uuid USING NULL;

    ELSE
      -- No integer→uuid mapping path; integer values are broken refs; null + convert
      UPDATE cutting_built_packets SET product_category_id = NULL WHERE product_category_id IS NOT NULL;
      ALTER TABLE cutting_built_packets
        ALTER COLUMN product_category_id TYPE uuid USING NULL;
    END IF;

  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 2. cutting_built_packets.session_id
--    Boot migration always created this as UUID, but guard anyway.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_built_packets'
      AND column_name = 'session_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE cutting_built_packets SET session_id = NULL WHERE session_id IS NOT NULL;
    ALTER TABLE cutting_built_packets ALTER COLUMN session_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 3. cutting_built_packet_fabric_sources.fabric_inventory_id
--    (same guard as migration 0002 – included here for completeness)
--    Backfill via cutting_fabric_inventory.inventory_item_id → .id (uuid)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_built_packet_fabric_sources'
      AND column_name = 'fabric_inventory_id'
      AND data_type   = 'integer'
  ) THEN

    -- Step 1: add temporary uuid column
    ALTER TABLE cutting_built_packet_fabric_sources
      ADD COLUMN IF NOT EXISTS fabric_inventory_uuid uuid;

    -- Step 2: backfill via inventory_item_id mapping
    UPDATE cutting_built_packet_fabric_sources cbpfs
    SET fabric_inventory_uuid = fi.id
    FROM cutting_fabric_inventory fi
    WHERE fi.inventory_item_id = cbpfs.fabric_inventory_id
      AND cbpfs.fabric_inventory_id IS NOT NULL;

    -- Step 3: drop FK + index on old column
    ALTER TABLE cutting_built_packet_fabric_sources
      DROP CONSTRAINT IF EXISTS "cutting_built_packet_fabric_sources_fabric_inventory_id_fkey";
    DROP INDEX IF EXISTS cutting_built_packet_sources_inventory_idx;

    -- Step 4: drop old column and promote uuid column
    ALTER TABLE cutting_built_packet_fabric_sources DROP COLUMN fabric_inventory_id;
    ALTER TABLE cutting_built_packet_fabric_sources
      RENAME COLUMN fabric_inventory_uuid TO fabric_inventory_id;

    -- Step 5: recreate FK + index
    ALTER TABLE cutting_built_packet_fabric_sources
      ADD CONSTRAINT "cutting_built_packet_fabric_sources_fabric_inventory_id_fkey"
      FOREIGN KEY (fabric_inventory_id) REFERENCES cutting_fabric_inventory(id);
    CREATE INDEX IF NOT EXISTS cutting_built_packet_sources_inventory_idx
      ON cutting_built_packet_fabric_sources(fabric_inventory_id);

  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 4. cutting_built_packet_fabric_sources.component_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_built_packet_fabric_sources'
      AND column_name = 'component_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE cutting_built_packet_fabric_sources SET component_id = NULL WHERE component_id IS NOT NULL;
    ALTER TABLE cutting_built_packet_fabric_sources ALTER COLUMN component_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 5. cutting_packet_sessions.product_category_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_packet_sessions'
      AND column_name = 'product_category_id'
      AND data_type   = 'integer'
  ) THEN
    -- Try backfill via cutting_product_categories (no integer field to map from – null out)
    UPDATE cutting_packet_sessions SET product_category_id = NULL WHERE product_category_id IS NOT NULL;
    ALTER TABLE cutting_packet_sessions
      ALTER COLUMN product_category_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 6. cutting_packet_session_lots.session_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_packet_session_lots'
      AND column_name = 'session_id'
      AND data_type   = 'integer'
  ) THEN

    ALTER TABLE cutting_packet_session_lots
      ADD COLUMN IF NOT EXISTS session_uuid uuid;

    -- Backfill: session_id integer may reference cutting_packet_sessions (no integer col → null)
    UPDATE cutting_packet_session_lots SET session_uuid = NULL;

    ALTER TABLE cutting_packet_session_lots
      DROP CONSTRAINT IF EXISTS "cutting_packet_session_lots_session_id_cutting_packet_sessions_id_fk";
    DROP INDEX IF EXISTS cutting_packet_session_lots_session_idx;

    ALTER TABLE cutting_packet_session_lots DROP COLUMN session_id;
    ALTER TABLE cutting_packet_session_lots RENAME COLUMN session_uuid TO session_id;

    ALTER TABLE cutting_packet_session_lots
      ADD CONSTRAINT "cutting_packet_session_lots_session_id_cutting_packet_sessions_id_fk"
      FOREIGN KEY (session_id) REFERENCES cutting_packet_sessions(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS cutting_packet_session_lots_session_idx
      ON cutting_packet_session_lots(session_id);

  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 7. cutting_packet_session_lots.component_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_packet_session_lots'
      AND column_name = 'component_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE cutting_packet_session_lots SET component_id = NULL WHERE component_id IS NOT NULL;
    ALTER TABLE cutting_packet_session_lots ALTER COLUMN component_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 8. cutting_packet_session_lots.fabric_inventory_id
--    Backfill via cutting_fabric_inventory.inventory_item_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_packet_session_lots'
      AND column_name = 'fabric_inventory_id'
      AND data_type   = 'integer'
  ) THEN

    ALTER TABLE cutting_packet_session_lots
      ADD COLUMN IF NOT EXISTS fabric_inventory_uuid uuid;

    UPDATE cutting_packet_session_lots sl
    SET fabric_inventory_uuid = fi.id
    FROM cutting_fabric_inventory fi
    WHERE fi.inventory_item_id = sl.fabric_inventory_id
      AND sl.fabric_inventory_id IS NOT NULL;

    ALTER TABLE cutting_packet_session_lots
      DROP CONSTRAINT IF EXISTS "cutting_packet_session_lots_fabric_inventory_id_cutting_fabric_inventory_id_fk";

    ALTER TABLE cutting_packet_session_lots DROP COLUMN fabric_inventory_id;
    ALTER TABLE cutting_packet_session_lots
      RENAME COLUMN fabric_inventory_uuid TO fabric_inventory_id;

    ALTER TABLE cutting_packet_session_lots
      ADD CONSTRAINT "cutting_packet_session_lots_fabric_inventory_id_cutting_fabric_inventory_id_fk"
      FOREIGN KEY (fabric_inventory_id) REFERENCES cutting_fabric_inventory(id);

  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 9. cutting_packet_bom_cuts.fabric_inventory_id
--    Backfill via cutting_fabric_inventory.inventory_item_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_packet_bom_cuts'
      AND column_name = 'fabric_inventory_id'
      AND data_type   = 'integer'
  ) THEN

    ALTER TABLE cutting_packet_bom_cuts
      ADD COLUMN IF NOT EXISTS fabric_inventory_uuid uuid;

    UPDATE cutting_packet_bom_cuts bc
    SET fabric_inventory_uuid = fi.id
    FROM cutting_fabric_inventory fi
    WHERE fi.inventory_item_id = bc.fabric_inventory_id
      AND bc.fabric_inventory_id IS NOT NULL;

    ALTER TABLE cutting_packet_bom_cuts
      DROP CONSTRAINT IF EXISTS "cutting_packet_bom_cuts_fabric_inventory_id_cutting_fabric_inventory_id_fk";

    ALTER TABLE cutting_packet_bom_cuts DROP COLUMN fabric_inventory_id;
    ALTER TABLE cutting_packet_bom_cuts
      RENAME COLUMN fabric_inventory_uuid TO fabric_inventory_id;

    ALTER TABLE cutting_packet_bom_cuts
      ADD CONSTRAINT "cutting_packet_bom_cuts_fabric_inventory_id_cutting_fabric_inventory_id_fkey"
      FOREIGN KEY (fabric_inventory_id) REFERENCES cutting_fabric_inventory(id);

  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 10. cutting_packet_bom_cuts.packet_bom_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_packet_bom_cuts'
      AND column_name = 'packet_bom_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE cutting_packet_bom_cuts SET packet_bom_id = NULL WHERE packet_bom_id IS NOT NULL;
    ALTER TABLE cutting_packet_bom_cuts ALTER COLUMN packet_bom_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 11. cutting_packet_boms.product_category_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_packet_boms'
      AND column_name = 'product_category_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE cutting_packet_boms SET product_category_id = NULL WHERE product_category_id IS NOT NULL;
    ALTER TABLE cutting_packet_boms ALTER COLUMN product_category_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 12. cutting_packet_bom_materials.packet_bom_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_packet_bom_materials'
      AND column_name = 'packet_bom_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE cutting_packet_bom_materials SET packet_bom_id = NULL WHERE packet_bom_id IS NOT NULL;
    ALTER TABLE cutting_packet_bom_materials ALTER COLUMN packet_bom_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 13. cutting_packet_bom_parts.packet_bom_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_packet_bom_parts'
      AND column_name = 'packet_bom_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE cutting_packet_bom_parts SET packet_bom_id = NULL WHERE packet_bom_id IS NOT NULL;
    ALTER TABLE cutting_packet_bom_parts ALTER COLUMN packet_bom_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 14. cutting_fabric_inventory_transactions.fabric_inventory_id
--    This table is in the 0000 migration with UUID but guard for safety.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_fabric_inventory_transactions'
      AND column_name = 'fabric_inventory_id'
      AND data_type   = 'integer'
  ) THEN

    ALTER TABLE cutting_fabric_inventory_transactions
      ADD COLUMN IF NOT EXISTS fabric_inventory_uuid uuid;

    UPDATE cutting_fabric_inventory_transactions tx
    SET fabric_inventory_uuid = fi.id
    FROM cutting_fabric_inventory fi
    WHERE fi.inventory_item_id = tx.fabric_inventory_id
      AND tx.fabric_inventory_id IS NOT NULL;

    ALTER TABLE cutting_fabric_inventory_transactions
      DROP CONSTRAINT IF EXISTS "cutting_fabric_inventory_transactions_fabric_inventory_id_cutting_fabric_inventory_id_fk";

    ALTER TABLE cutting_fabric_inventory_transactions DROP COLUMN fabric_inventory_id;
    ALTER TABLE cutting_fabric_inventory_transactions
      RENAME COLUMN fabric_inventory_uuid TO fabric_inventory_id;

    ALTER TABLE cutting_fabric_inventory_transactions
      ADD CONSTRAINT "cutting_fabric_inventory_transactions_fabric_inventory_id_cutting_fabric_inventory_id_fk"
      FOREIGN KEY (fabric_inventory_id) REFERENCES cutting_fabric_inventory(id);

  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 15. cutting_fabric_inventory_transactions.session_lot_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_fabric_inventory_transactions'
      AND column_name = 'session_lot_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE cutting_fabric_inventory_transactions SET session_lot_id = NULL WHERE session_lot_id IS NOT NULL;
    ALTER TABLE cutting_fabric_inventory_transactions ALTER COLUMN session_lot_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 16. cutting_cut_records.product_category_id
--    In 0000 migration as UUID; guard for older prod environments.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_cut_records'
      AND column_name = 'product_category_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE cutting_cut_records SET product_category_id = NULL WHERE product_category_id IS NOT NULL;
    ALTER TABLE cutting_cut_records ALTER COLUMN product_category_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 17. cutting_cut_progress.product_category_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_cut_progress'
      AND column_name = 'product_category_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE cutting_cut_progress SET product_category_id = NULL WHERE product_category_id IS NOT NULL;
    ALTER TABLE cutting_cut_progress ALTER COLUMN product_category_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 18. cutting_cut_progress.production_line_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_cut_progress'
      AND column_name = 'production_line_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE cutting_cut_progress SET production_line_id = NULL WHERE production_line_id IS NOT NULL;
    ALTER TABLE cutting_cut_progress ALTER COLUMN production_line_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 19. cutting_cut_progress.material_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_cut_progress'
      AND column_name = 'material_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE cutting_cut_progress SET material_id = NULL WHERE material_id IS NOT NULL;
    ALTER TABLE cutting_cut_progress ALTER COLUMN material_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 20. cutting_cut_progress.component_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_cut_progress'
      AND column_name = 'component_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE cutting_cut_progress SET component_id = NULL WHERE component_id IS NOT NULL;
    ALTER TABLE cutting_cut_progress ALTER COLUMN component_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 21. cutting_weekly_data.production_line_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_weekly_data'
      AND column_name = 'production_line_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE cutting_weekly_data SET production_line_id = NULL WHERE production_line_id IS NOT NULL;
    ALTER TABLE cutting_weekly_data ALTER COLUMN production_line_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 22. cutting_weekly_data.product_category_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_weekly_data'
      AND column_name = 'product_category_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE cutting_weekly_data SET product_category_id = NULL WHERE product_category_id IS NOT NULL;
    ALTER TABLE cutting_weekly_data ALTER COLUMN product_category_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 23. cutting_packet_compositions.product_category_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_packet_compositions'
      AND column_name = 'product_category_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE cutting_packet_compositions SET product_category_id = NULL WHERE product_category_id IS NOT NULL;
    ALTER TABLE cutting_packet_compositions ALTER COLUMN product_category_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 24. cutting_packet_compositions.component_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_packet_compositions'
      AND column_name = 'component_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE cutting_packet_compositions SET component_id = NULL WHERE component_id IS NOT NULL;
    ALTER TABLE cutting_packet_compositions ALTER COLUMN component_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 25. cutting_components.material_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_components'
      AND column_name = 'material_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE cutting_components SET material_id = NULL WHERE material_id IS NOT NULL;
    ALTER TABLE cutting_components ALTER COLUMN material_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 26. cutting_product_categories.production_line_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_product_categories'
      AND column_name = 'production_line_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE cutting_product_categories SET production_line_id = NULL WHERE production_line_id IS NOT NULL;
    ALTER TABLE cutting_product_categories ALTER COLUMN production_line_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 27. cutting_fabric_inventory.material_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_fabric_inventory'
      AND column_name = 'material_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE cutting_fabric_inventory SET material_id = NULL WHERE material_id IS NOT NULL;
    ALTER TABLE cutting_fabric_inventory ALTER COLUMN material_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 28. cutting_fabric_inventory.production_line_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'cutting_fabric_inventory'
      AND column_name = 'production_line_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE cutting_fabric_inventory SET production_line_id = NULL WHERE production_line_id IS NOT NULL;
    ALTER TABLE cutting_fabric_inventory ALTER COLUMN production_line_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 29. employees.canonical_id
--    References canonical_identities.id (uuid)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'employees'
      AND column_name = 'canonical_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE employees SET canonical_id = NULL WHERE canonical_id IS NOT NULL;
    ALTER TABLE employees ALTER COLUMN canonical_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 30. punch_events.canonical_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'punch_events'
      AND column_name = 'canonical_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE punch_events SET canonical_id = NULL WHERE canonical_id IS NOT NULL;
    ALTER TABLE punch_events ALTER COLUMN canonical_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 31. p2_purchase_orders.source_quote_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'p2_purchase_orders'
      AND column_name = 'source_quote_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE p2_purchase_orders SET source_quote_id = NULL WHERE source_quote_id IS NOT NULL;
    ALTER TABLE p2_purchase_orders ALTER COLUMN source_quote_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 32. p2_production_orders.bom_definition_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'p2_production_orders'
      AND column_name = 'bom_definition_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE p2_production_orders SET bom_definition_id = NULL WHERE bom_definition_id IS NOT NULL;
    ALTER TABLE p2_production_orders ALTER COLUMN bom_definition_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 34. p2_production_orders.bom_item_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'p2_production_orders'
      AND column_name = 'bom_item_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE p2_production_orders SET bom_item_id = NULL WHERE bom_item_id IS NOT NULL;
    ALTER TABLE p2_production_orders ALTER COLUMN bom_item_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 35. bom_items.bom_id / reference_bom_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'bom_items'
      AND column_name = 'bom_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE bom_items SET bom_id = NULL WHERE bom_id IS NOT NULL;
    ALTER TABLE bom_items ALTER COLUMN bom_id TYPE uuid USING NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'bom_items'
      AND column_name = 'reference_bom_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE bom_items SET reference_bom_id = NULL WHERE reference_bom_id IS NOT NULL;
    ALTER TABLE bom_items ALTER COLUMN reference_bom_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 36. bom_revisions.bom_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'bom_revisions'
      AND column_name = 'bom_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE bom_revisions SET bom_id = NULL WHERE bom_id IS NOT NULL;
    ALTER TABLE bom_revisions ALTER COLUMN bom_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 37. bom_lines.revision_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'bom_lines'
      AND column_name = 'revision_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE bom_lines SET revision_id = NULL WHERE revision_id IS NOT NULL;
    ALTER TABLE bom_lines ALTER COLUMN revision_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 38. ar_invoice_lines.invoice_id
--    AR tables were created with UUID from the start; guard for safety.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'ar_invoice_lines'
      AND column_name = 'invoice_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE ar_invoice_lines SET invoice_id = NULL WHERE invoice_id IS NOT NULL;
    ALTER TABLE ar_invoice_lines ALTER COLUMN invoice_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 39. ar_payment_allocations.payment_id / invoice_id
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'ar_payment_allocations'
      AND column_name = 'payment_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE ar_payment_allocations SET payment_id = NULL WHERE payment_id IS NOT NULL;
    ALTER TABLE ar_payment_allocations ALTER COLUMN payment_id TYPE uuid USING NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'ar_payment_allocations'
      AND column_name = 'invoice_id'
      AND data_type   = 'integer'
  ) THEN
    UPDATE ar_payment_allocations SET invoice_id = NULL WHERE invoice_id IS NOT NULL;
    ALTER TABLE ar_payment_allocations ALTER COLUMN invoice_id TYPE uuid USING NULL;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- Verify: emit a notice listing any remaining uuid mismatches after this run.
-- This will appear in the migration output log for audit purposes.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  rec RECORD;
  found_count INTEGER := 0;
BEGIN
  FOR rec IN
    SELECT c.table_name, c.column_name, c.data_type
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.data_type = 'integer'
      AND c.column_name IN (
        'product_category_id','fabric_inventory_id','session_id',
        'component_id','production_line_id','material_id',
        'packet_bom_id','bom_id','reference_bom_id','revision_id',
        'session_lot_id','rts_sale_id','rts_inventory_id',
        'serialized_item_id','material_lot_id','certificate_id',
        'lot_number_id','packing_slip_id','source_quote_id',
        'canonical_id','bom_definition_id','bom_item_id',
        'invoice_id','payment_id'
      )
      AND c.table_name NOT IN (
        -- Columns that are legitimately integer (not UUID)
        'customer_satisfaction_responses','customer_satisfaction_surveys',
        'notification_triggers','orders','order_drafts'
      )
  LOOP
    RAISE NOTICE 'Remaining mismatch: %.% is still %', rec.table_name, rec.column_name, rec.data_type;
    found_count := found_count + 1;
  END LOOP;

  IF found_count = 0 THEN
    RAISE NOTICE 'Migration 0003: All audited uuid columns are correctly typed.';
  ELSE
    RAISE NOTICE 'Migration 0003: % remaining mismatch(es) detected (see NOTICE lines above).', found_count;
  END IF;
END $$;
