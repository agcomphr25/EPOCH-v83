-- Migration: Strengthen scope_type field invariants on perm_user_capability_scopes
-- Replaces the looser check with a strict version that also ensures GLOBAL scope
-- has no department or project_id set, preventing ambiguous/malformed grant rows.

DO $$
BEGIN
  -- Drop the old constraint if it exists (replaced by the stricter version below)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'perm_ucs_scope_fields_check'
       AND conrelid = 'perm_user_capability_scopes'::regclass
  ) THEN
    ALTER TABLE perm_user_capability_scopes DROP CONSTRAINT perm_ucs_scope_fields_check;
  END IF;

  -- Add stricter constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'perm_ucs_scope_fields_strict_check'
       AND conrelid = 'perm_user_capability_scopes'::regclass
  ) THEN
    ALTER TABLE perm_user_capability_scopes
      ADD CONSTRAINT perm_ucs_scope_fields_strict_check CHECK (
        (scope_type = 'GLOBAL'     AND department IS NULL AND project_id IS NULL)
        OR (scope_type = 'DEPARTMENT' AND department IS NOT NULL AND project_id IS NULL)
        OR (scope_type = 'PROJECT'    AND project_id  IS NOT NULL AND department IS NULL)
      );
  END IF;
END;
$$;
