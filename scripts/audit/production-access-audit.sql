\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

-- Query 1: schema and migration-history prerequisites. Review before interpreting later results.
SELECT current_database() AS database_name, current_user AS database_user,
       current_setting('transaction_read_only') AS transaction_read_only,
       to_regclass('drizzle.__drizzle_migrations') AS drizzle_history,
       to_regclass('public.certification_authorizations') AS authorization_matrix;

-- Query 2: feature-flag truth. An absent row is UNKNOWN, never equivalent to disabled.
SELECT key, enabled, updated_at, updated_by_user_id
FROM certification_authorization_feature_flags
WHERE key = 'prospective_enforcement';

-- Query 3: employee/user linkage and account status; deliberately excludes secrets and sensitive HR fields.
SELECT e.id AS employee_id, e.employee_code AS employee_number, e.name AS employee_name,
       e.employment_status, e.is_active AS employee_is_active, e.department, e.job_title,
       u.id AS user_id, u.username, u.is_active AS user_is_active, u.access_status, u.role AS legacy_system_role
FROM employees e
FULL OUTER JOIN users u ON u.employee_id = e.id
ORDER BY COALESCE(e.name, u.username), e.id, u.id;

-- Query 4: resolved global capabilities (role + allow - deny). ADMIN/OWNER runtime bypass is reported separately.
WITH role_caps AS (
  SELECT u.id AS user_id, pc.key
  FROM users u JOIN perm_roles pr ON pr.name = u.role
  JOIN perm_role_capabilities prc ON prc.role_id = pr.id
  JOIN perm_capabilities pc ON pc.id = prc.capability_id
), allowed AS (
  SELECT puo.user_id, pc.key FROM perm_user_overrides puo
  JOIN perm_capabilities pc ON pc.id=puo.capability_id WHERE puo.effect='allow'
), denied AS (
  SELECT puo.user_id, pc.key FROM perm_user_overrides puo
  JOIN perm_capabilities pc ON pc.id=puo.capability_id WHERE puo.effect='deny'
), combined AS (
  SELECT * FROM role_caps UNION SELECT * FROM allowed
)
SELECT u.id AS user_id, u.username, u.role,
       COALESCE(array_agg(c.key ORDER BY c.key) FILTER (WHERE d.key IS NULL AND c.key IS NOT NULL), '{}') AS resolved_capabilities,
       (u.role IN ('ADMIN','OWNER')) AS runtime_capability_bypass
FROM users u LEFT JOIN combined c ON c.user_id=u.id
LEFT JOIN denied d ON d.user_id=c.user_id AND d.key=c.key
GROUP BY u.id,u.username,u.role ORDER BY u.username;

-- Query 5: individual overrides and scopes.
SELECT u.id AS user_id, u.username, pc.key AS capability, puo.effect,
       NULL::text AS scope_type, NULL::text AS department, NULL::text AS project_id
FROM perm_user_overrides puo JOIN users u ON u.id=puo.user_id
JOIN perm_capabilities pc ON pc.id=puo.capability_id
UNION ALL
SELECT u.id, u.username, pc.key, 'scoped_grant', s.scope_type, s.department, s.project_id
FROM perm_user_capability_scopes s JOIN users u ON u.id=s.user_id
JOIN perm_capabilities pc ON pc.id=s.capability_id
ORDER BY 2,3,4;

-- Query 6: formal authorization register with approver linkage and status/scope.
SELECT a.id, a.revision, a.employee_id, e.employee_code, e.name AS employee_name,
       a.employee_user_id, eu.username AS employee_username, a.program, a.authorization_type, a.status,
       a.part_number, a.product_family, a.department, a.operation_scope,
       a.effective_date, a.expiration_date, a.qualification_method, a.evidence_reference,
       a.approved_by_user_id, au.username AS approver_username, a.approved_by_employee_id,
       a.approved_at, a.signature_meaning, a.limitations, a.legacy_p2_employee_certification_id
FROM certification_authorizations a JOIN employees e ON e.id=a.employee_id
LEFT JOIN users eu ON eu.id=a.employee_user_id LEFT JOIN users au ON au.id=a.approved_by_user_id
ORDER BY e.name,a.authorization_type,a.status,a.updated_at DESC;

-- Query 7: legacy P2 evidence. This is evidence only and must not be elevated to stronger authority.
SELECT pc.*, e.employee_code, e.name AS employee_name
FROM p2_employee_part_certifications pc JOIN employees e ON e.id=pc.employee_id
ORDER BY e.name,pc.part_number,pc.department;

-- Query 8: immutable event/use evidence counts and revision anomalies.
SELECT 'authorization_events' AS record_type, authorization_id::text AS subject,
       count(*) AS records, count(DISTINCT revision) AS distinct_revisions
FROM certification_authorization_events GROUP BY authorization_id
UNION ALL
SELECT 'authorization_use_snapshots', authorization_id::text, count(*), count(DISTINCT authorization_revision)
FROM certification_authorization_use_snapshots GROUP BY authorization_id
ORDER BY 1,2;

-- Query 9: linkage exceptions requiring management review.
SELECT 'ACTIVE_EMPLOYEE_WITHOUT_USER' AS finding, e.id::text AS employee_id, e.employee_code, e.name, NULL::text AS username
FROM employees e LEFT JOIN users u ON u.employee_id=e.id
WHERE e.is_active IS TRUE AND e.employment_status='ACTIVE' AND u.id IS NULL
UNION ALL
SELECT 'ACTIVE_USER_WITHOUT_EMPLOYEE', NULL, NULL, NULL, u.username
FROM users u LEFT JOIN employees e ON e.id=u.employee_id
WHERE u.is_active IS TRUE AND u.access_status='ACTIVE' AND e.id IS NULL;

ROLLBACK;
