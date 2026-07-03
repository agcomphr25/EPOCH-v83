-- Section 7: configurable receiving inspection plans.
-- Plans are matched at receipt time by item, material type, risk, supplier
-- status, and flight-critical flag. More-specific/high-priority plans win.

CREATE TABLE IF NOT EXISTS receiving_inspection_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  inventory_item_id integer REFERENCES inventory_items(id) ON DELETE SET NULL,
  ag_part_number text,
  material_type text,
  risk_level text CHECK (risk_level IS NULL OR risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  supplier_name text,
  supplier_status text CHECK (supplier_status IS NULL OR supplier_status IN ('APPROVED', 'PROBATION', 'CONDITIONAL', 'BLOCKED')),
  flight_critical boolean,
  sample_size_percent integer NOT NULL DEFAULT 100 CHECK (sample_size_percent BETWEEN 0 AND 100),
  required_checkpoints jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  auto_disposition text NOT NULL DEFAULT 'pending_inspection'
    CHECK (auto_disposition IN ('pending_inspection', 'document_hold', 'quarantine')),
  requires_quality_signature boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_by_display_name text,
  updated_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  updated_by_display_name text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS receiving_inspection_plans_active_idx
  ON receiving_inspection_plans(is_active);
CREATE INDEX IF NOT EXISTS receiving_inspection_plans_item_idx
  ON receiving_inspection_plans(inventory_item_id);
CREATE INDEX IF NOT EXISTS receiving_inspection_plans_part_idx
  ON receiving_inspection_plans(ag_part_number);
CREATE INDEX IF NOT EXISTS receiving_inspection_plans_supplier_idx
  ON receiving_inspection_plans(supplier_name);
CREATE INDEX IF NOT EXISTS receiving_inspection_plans_priority_idx
  ON receiving_inspection_plans(priority);
