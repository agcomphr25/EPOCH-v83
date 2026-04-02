-- Migration 0023: Traveler component associations for scan-to-parent enforcement
CREATE TABLE IF NOT EXISTS traveler_component_associations (
  id                         SERIAL PRIMARY KEY,
  parent_traveler_id         VARCHAR(255) NOT NULL REFERENCES travelers(id) ON DELETE CASCADE,
  parent_traveler_step_id    INTEGER,
  child_traveler_id          VARCHAR(255),
  child_inventory_item_id    INTEGER,
  child_part_number          TEXT,
  child_serial_number        TEXT,
  child_lot_number           TEXT,
  child_internal_control_number TEXT,
  association_type           TEXT NOT NULL DEFAULT 'TRAVELER',
  quantity                   INTEGER NOT NULL DEFAULT 1,
  scanned_at                 TIMESTAMP NOT NULL DEFAULT NOW(),
  scanned_by                 TEXT,
  notes                      TEXT,
  created_at                 TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tca_parent_traveler_id_idx
  ON traveler_component_associations (parent_traveler_id);
CREATE INDEX IF NOT EXISTS tca_parent_step_id_idx
  ON traveler_component_associations (parent_traveler_step_id);
CREATE INDEX IF NOT EXISTS tca_child_traveler_id_idx
  ON traveler_component_associations (child_traveler_id);
CREATE INDEX IF NOT EXISTS tca_child_inventory_item_id_idx
  ON traveler_component_associations (child_inventory_item_id);
CREATE INDEX IF NOT EXISTS tca_child_part_number_idx
  ON traveler_component_associations (child_part_number);
CREATE INDEX IF NOT EXISTS tca_child_serial_number_idx
  ON traveler_component_associations (child_serial_number);
CREATE INDEX IF NOT EXISTS tca_child_icn_idx
  ON traveler_component_associations (child_internal_control_number);
