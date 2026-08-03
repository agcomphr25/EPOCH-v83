-- Capability-bound authority for controlled ROM estimate approvals.

INSERT INTO perm_capabilities (key, description, category) VALUES
  ('estimating.approve.estimator', 'Record controlled estimator decisions for ROM estimates', 'estimating'),
  ('estimating.approve.engineering', 'Record controlled engineering decisions for ROM estimates', 'engineering'),
  ('estimating.approve.finance', 'Record controlled finance decisions for ROM estimates', 'finance'),
  ('estimating.approve.executive', 'Record controlled executive decisions for ROM estimates', 'executive')
ON CONFLICT (key) DO UPDATE
SET description = EXCLUDED.description, category = EXCLUDED.category;

INSERT INTO perm_role_capabilities (role_id, capability_id)
SELECT role.id, capability.id
FROM perm_roles role
JOIN perm_capabilities capability ON (
  (role.name IN ('ADMIN', 'OWNER') AND capability.key LIKE 'estimating.approve.%') OR
  (role.name IN ('ESTIMATOR', 'SALES', 'SALES_MANAGER', 'CONTRACTS', 'PROJECT_MANAGER', 'PROGRAM_MANAGER')
    AND capability.key = 'estimating.approve.estimator') OR
  (role.name IN ('ENGINEERING', 'ENGINEER', 'ENGINEERING_MANAGER', 'MANUFACTURING_ENGINEERING')
    AND capability.key = 'estimating.approve.engineering') OR
  (role.name IN ('FINANCE', 'FINANCE_MANAGER', 'ACCOUNTING', 'CONTROLLER')
    AND capability.key = 'estimating.approve.finance') OR
  (role.name = 'EXECUTIVE' AND capability.key = 'estimating.approve.executive')
)
ON CONFLICT (role_id, capability_id) DO NOTHING;
