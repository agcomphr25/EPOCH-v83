-- Phase 1 CNC operation batches.
-- Supports partial CNC operation quantities against a production work order
-- and a specific traveler/routing step without changing the CNC Dashboard UI.

CREATE TABLE IF NOT EXISTS cnc_operation_batches (
  id SERIAL PRIMARY KEY,
  work_order_id UUID NOT NULL REFERENCES production_work_orders(id) ON DELETE CASCADE,
  traveler_step_id VARCHAR(255) NOT NULL REFERENCES traveler_steps(id) ON DELETE CASCADE,
  operation_id INTEGER REFERENCES cnc_job_operations(id) ON DELETE SET NULL,
  batch_code TEXT NOT NULL UNIQUE,
  batch_number INTEGER NOT NULL,
  batch_qty INTEGER NOT NULL CHECK (batch_qty > 0),
  qty_completed INTEGER NOT NULL DEFAULT 0 CHECK (qty_completed >= 0),
  qty_scrapped INTEGER NOT NULL DEFAULT 0 CHECK (qty_scrapped >= 0),
  assigned_machine_id INTEGER REFERENCES cnc_machines(id) ON DELETE SET NULL,
  assigned_machine_name TEXT,
  assigned_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  assigned_employee_display_name TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  barcode_value TEXT NOT NULL UNIQUE,
  priority TEXT NOT NULL DEFAULT 'medium',
  due_date DATE,
  notes TEXT,
  created_by_user_id INTEGER,
  created_by_display_name TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT cnc_operation_batches_counts_chk
    CHECK (qty_completed + qty_scrapped <= batch_qty)
);

CREATE INDEX IF NOT EXISTS cnc_operation_batches_work_order_step_idx
  ON cnc_operation_batches(work_order_id, traveler_step_id);

CREATE INDEX IF NOT EXISTS cnc_operation_batches_status_idx
  ON cnc_operation_batches(status);

CREATE UNIQUE INDEX IF NOT EXISTS cnc_operation_batches_barcode_idx
  ON cnc_operation_batches(barcode_value);

CREATE UNIQUE INDEX IF NOT EXISTS cnc_operation_batches_batch_code_idx
  ON cnc_operation_batches(batch_code);
