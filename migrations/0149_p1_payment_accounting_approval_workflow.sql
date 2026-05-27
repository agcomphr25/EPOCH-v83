-- 0149_p1_payment_accounting_approval_workflow.sql
-- Replace direct controlled-period posting by payment-entry users with an
-- accounting approval workflow.

BEGIN;

INSERT INTO perm_capabilities (key, description, category)
VALUES
  ('finance.accounting_admin', 'Approve or post entries in migration or soft-closed accounting periods', 'finance')
ON CONFLICT (key) DO UPDATE
SET description = EXCLUDED.description,
    category = EXCLUDED.category;

DELETE FROM perm_user_overrides puo
USING users u, perm_capabilities pc
WHERE puo.user_id = u.id
  AND puo.capability_id = pc.id
  AND lower(u.username) = 'darleneb'
  AND pc.key = 'finance.accounting_admin';

UPDATE accounting_admin_users
SET active = FALSE,
    granted_by = 'migration_0149_revoked_for_approval_workflow'
WHERE lower(username) = 'darleneb';

INSERT INTO perm_user_overrides (user_id, capability_id, effect)
SELECT u.id, pc.id, 'allow'
FROM users u
JOIN perm_capabilities pc ON pc.key = 'finance.manage_payments'
WHERE lower(u.username) = 'darleneb'
ON CONFLICT (user_id, capability_id) DO UPDATE
SET effect = 'allow';

COMMIT;
