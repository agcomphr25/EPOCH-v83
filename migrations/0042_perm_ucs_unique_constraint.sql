-- Migration: Add unique constraint to perm_user_capability_scopes
-- Prevents duplicate scoped grants for the same (user, capability, scope_type, department, project_id)
-- NULLIF trick: PostgreSQL treats NULLs as distinct in unique indexes, so we use a partial
-- expression index approach with COALESCE to treat NULL as an empty string sentinel.

CREATE UNIQUE INDEX IF NOT EXISTS perm_ucs_unique_grant_idx
  ON perm_user_capability_scopes (
    user_id,
    capability_id,
    scope_type,
    COALESCE(department, ''),
    COALESCE(project_id, '')
  );
