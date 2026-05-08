-- Task #164 — Inventory high-risk transaction approvals
--
-- Adds the `inventory.approve_high_risk` capability and seeds 5 escalation
-- policies for the high-risk inventory request types routed through the
-- generic approval inbox / escalation engine (Task #148):
--
--   INV_MANUAL_ADJUSTMENT     — manual material lot qty adjustment
--   INV_NEGATIVE_INVENTORY    — adjustment that drives remainingQty < 0
--   INV_ALLOCATION_OVERRIDE   — bypass of reservation / over-allocation
--   INV_EXPIRED_USE           — consume past-expiration material
--   INV_QUARANTINE_RELEASE    — QUARANTINE → ACCEPTED/RELEASED status change
--
-- Idempotent.

INSERT INTO perm_capabilities (key, description, category)
VALUES (
  'inventory.approve_high_risk',
  'Approve or reject high-risk inventory transactions (manual adjustments, negative inventory, allocation overrides, expired use, quarantine release)',
  'inventory'
)
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description,
  category    = EXCLUDED.category;

WITH cap AS (
  SELECT id FROM perm_capabilities WHERE key = 'inventory.approve_high_risk'
)
INSERT INTO perm_role_capabilities (role_id, capability_id)
SELECT r.id, cap.id
FROM perm_roles r, cap
WHERE r.name IN (
  'ADMIN', 'OWNER',
  'PRODUCTION_SUPERVISOR', 'PRODUCTION_MANAGER',
  'DIRECTOR_OF_OPERATIONS', 'VP_OPERATIONS',
  'QUALITY_MANAGER', 'QUALITY'
)
ON CONFLICT (role_id, capability_id) DO NOTHING;

INSERT INTO escalation_policies (request_type, display_name, description, chain, requires_signature, reason_codes)
VALUES
  ('INV_MANUAL_ADJUSTMENT', 'Inventory: Manual Qty Adjustment',
   'Operator-initiated manual quantity adjustment on a material lot.',
   '[{"role":"Production Supervisor","slaSeconds":14400},{"role":"Production Manager","slaSeconds":28800},{"role":"Director of Operations","slaSeconds":86400,"isBackstop":true}]'::jsonb,
   true,
   '["CYCLE_COUNT","DAMAGE","CORRECTION","WRITE_OFF","OTHER"]'::jsonb),
  ('INV_NEGATIVE_INVENTORY', 'Inventory: Negative Quantity Override',
   'Adjustment that would drive remaining lot quantity below zero.',
   '[{"role":"Production Manager","slaSeconds":7200},{"role":"Director of Operations","slaSeconds":28800},{"role":"VP Operations","slaSeconds":86400,"isBackstop":true}]'::jsonb,
   true,
   '["EMERGENCY","RECONCILIATION","CORRECTION","OTHER"]'::jsonb),
  ('INV_ALLOCATION_OVERRIDE', 'Inventory: Allocation Override',
   'Bypass an active material reservation / consume against another work order''s allocation.',
   '[{"role":"Production Supervisor","slaSeconds":14400},{"role":"Production Manager","slaSeconds":28800},{"role":"Director of Operations","slaSeconds":86400,"isBackstop":true}]'::jsonb,
   true,
   '["URGENT_PRODUCTION","CUSTOMER_HOT","SUPPLY_SHORTAGE","OTHER"]'::jsonb),
  ('INV_EXPIRED_USE', 'Inventory: Expired Material Use',
   'Authorize consumption of a material lot past its expiration date.',
   '[{"role":"Quality Manager","slaSeconds":14400},{"role":"Director of Operations","slaSeconds":86400,"isBackstop":true}]'::jsonb,
   true,
   '["MIL_SPEC_RETEST","ENGINEERING_DEVIATION","NON_FLIGHT","OTHER"]'::jsonb),
  ('INV_QUARANTINE_RELEASE', 'Inventory: Quarantine Release',
   'Release a quarantined material lot to ACCEPTED status.',
   '[{"role":"Quality Manager","slaSeconds":14400},{"role":"Director of Operations","slaSeconds":86400,"isBackstop":true}]'::jsonb,
   true,
   '["RECEIVING_RESOLVED","NCR_DISPOSITION_COMPLETE","CONDITIONAL_USE","OTHER"]'::jsonb)
ON CONFLICT (request_type) DO NOTHING;
