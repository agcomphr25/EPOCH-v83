-- Task #147 — Material Traceability Viewer (Phase 3)
-- Seed the inventory.traceability.view capability and grant it to
-- ADMIN, OWNER, QUALITY, MATERIALS, and COMPLIANCE roles.

INSERT INTO perm_capabilities (key, description, category)
VALUES (
  'inventory.traceability.view',
  'View the read-only Material Traceability Viewer (chain reconstruction, integrity verification, signed export).',
  'inventory'
)
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description,
  category    = EXCLUDED.category;

WITH cap AS (
  SELECT id FROM perm_capabilities WHERE key = 'inventory.traceability.view'
)
INSERT INTO perm_role_capabilities (role_id, capability_id)
SELECT r.id, cap.id
FROM perm_roles r, cap
WHERE r.name IN ('ADMIN', 'OWNER', 'QUALITY', 'MATERIALS', 'COMPLIANCE',
                 'INVENTORY_MANAGER', 'QUALITY_INSPECTOR', 'MATERIALS_MANAGER')
ON CONFLICT (role_id, capability_id) DO NOTHING;
