-- Controlled P2 manufacturing work-order management.
-- Additive and prospective: existing work orders receive the lowest operational priority.

ALTER TABLE production_work_orders
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'LOW';

ALTER TABLE production_work_orders
  DROP CONSTRAINT IF EXISTS production_work_orders_priority_check;
ALTER TABLE production_work_orders
  ADD CONSTRAINT production_work_orders_priority_check
  CHECK (priority IN ('LOW','URGENT','CRITICAL'));

ALTER TABLE p2_manufacturing_work_order_authorities
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'LOW';

ALTER TABLE p2_manufacturing_work_order_authorities
  DROP CONSTRAINT IF EXISTS p2_mwo_authority_priority_check;
ALTER TABLE p2_manufacturing_work_order_authorities
  ADD CONSTRAINT p2_mwo_authority_priority_check
  CHECK (priority IN ('LOW','URGENT','CRITICAL'));

CREATE INDEX IF NOT EXISTS p2_mwo_authority_department_priority_idx
  ON p2_manufacturing_work_order_authorities
  (current_department_id, priority, status, materialized_at);

INSERT INTO perm_capabilities(key,description,category) VALUES
 ('p2.work_orders.manage','Edit controlled P2 manufacturing work-order fields','projects')
ON CONFLICT (key) DO NOTHING;

INSERT INTO perm_role_capabilities(role_id,capability_id)
SELECT r.id,c.id FROM perm_roles r CROSS JOIN perm_capabilities c
WHERE r.name IN ('ADMIN','OWNER','PROJECT_MANAGER','PROGRAM_MANAGER')
  AND c.key='p2.work_orders.manage'
ON CONFLICT DO NOTHING;
