-- 0148_darleneb_payment_permissions.sql
-- Give darleneb explicit payment access and accounting-period posting authority
-- for P1 cash/check/card payment entry during migration-period accounting.

BEGIN;

INSERT INTO perm_capabilities (key, description, category)
VALUES
  ('finance.accounting_admin', 'Post or adjust entries in migration or soft-closed accounting periods', 'finance')
ON CONFLICT (key) DO UPDATE
SET description = EXCLUDED.description,
    category = EXCLUDED.category;

INSERT INTO perm_user_overrides (user_id, capability_id, effect)
SELECT u.id, pc.id, 'allow'
FROM users u
JOIN perm_capabilities pc
  ON pc.key IN ('finance.manage_payments', 'finance.accounting_admin')
WHERE lower(u.username) = 'darleneb'
ON CONFLICT (user_id, capability_id) DO UPDATE
SET effect = 'allow';

INSERT INTO accounting_admin_users (username, active, granted_by)
VALUES ('darleneb', TRUE, 'migration_0148')
ON CONFLICT (username) DO UPDATE
SET active = TRUE,
    granted_by = EXCLUDED.granted_by;

COMMIT;
