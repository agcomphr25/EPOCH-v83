-- Migration: Add FK constraints to receiving tables (NOT VALID to handle existing data)
-- NOT VALID means: enforce future inserts/updates but don't validate existing rows.
-- receipts.vendor_po_id → vendor_pos.id
-- receipts.receiver_user_id → employees.id
-- received_units.disposition_by_user_id → employees.id
-- received_units.material_lot_id → material_lots.id
-- receipt_lines.vendor_po_item_id → vendor_po_items.id

DO $$ BEGIN

  -- receipts.vendor_po_id → vendor_pos(id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'receipts_vendor_po_id_fk'
  ) THEN
    ALTER TABLE receipts
      ADD CONSTRAINT receipts_vendor_po_id_fk
      FOREIGN KEY (vendor_po_id) REFERENCES vendor_pos(id) ON DELETE SET NULL
      NOT VALID;
  END IF;

  -- receipts.receiver_user_id → employees(id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'receipts_receiver_user_id_fk'
  ) THEN
    ALTER TABLE receipts
      ADD CONSTRAINT receipts_receiver_user_id_fk
      FOREIGN KEY (receiver_user_id) REFERENCES employees(id) ON DELETE SET NULL
      NOT VALID;
  END IF;

  -- received_units.disposition_by_user_id → employees(id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'received_units_disposition_by_user_id_fk'
  ) THEN
    ALTER TABLE received_units
      ADD CONSTRAINT received_units_disposition_by_user_id_fk
      FOREIGN KEY (disposition_by_user_id) REFERENCES employees(id) ON DELETE SET NULL
      NOT VALID;
  END IF;

  -- received_units.material_lot_id → material_lots(id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'received_units_material_lot_id_fk'
  ) THEN
    ALTER TABLE received_units
      ADD CONSTRAINT received_units_material_lot_id_fk
      FOREIGN KEY (material_lot_id) REFERENCES material_lots(id) ON DELETE SET NULL
      NOT VALID;
  END IF;

  -- receipt_lines.vendor_po_item_id → vendor_po_items(id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'receipt_lines_vendor_po_item_id_fk'
  ) THEN
    ALTER TABLE receipt_lines
      ADD CONSTRAINT receipt_lines_vendor_po_item_id_fk
      FOREIGN KEY (vendor_po_item_id) REFERENCES vendor_po_items(id) ON DELETE SET NULL
      NOT VALID;
  END IF;

  -- receipt_documents.uploaded_by_user_id → employees(id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'receipt_documents_uploaded_by_user_id_fk'
  ) THEN
    ALTER TABLE receipt_documents
      ADD CONSTRAINT receipt_documents_uploaded_by_user_id_fk
      FOREIGN KEY (uploaded_by_user_id) REFERENCES employees(id) ON DELETE SET NULL
      NOT VALID;
  END IF;

  -- receipt_audit_log.actor_user_id → employees(id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'receipt_audit_log_actor_user_id_fk'
  ) THEN
    ALTER TABLE receipt_audit_log
      ADD CONSTRAINT receipt_audit_log_actor_user_id_fk
      FOREIGN KEY (actor_user_id) REFERENCES employees(id) ON DELETE SET NULL
      NOT VALID;
  END IF;

END $$;
