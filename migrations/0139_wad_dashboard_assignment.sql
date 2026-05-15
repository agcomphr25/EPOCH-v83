ALTER TABLE production_work_orders
  ADD COLUMN IF NOT EXISTS dashboard_type text,
  ADD COLUMN IF NOT EXISTS queue_type text,
  ADD COLUMN IF NOT EXISTS assigned_department text,
  ADD COLUMN IF NOT EXISTS assigned_dashboard_route text,
  ADD COLUMN IF NOT EXISTS manufacturing_queue_id integer REFERENCES manufacturing_queue(id) ON DELETE SET NULL;
