-- Migration: Tighten perm_user_capability_scopes data integrity
-- 1. Add FK user_id -> users.id (with ON DELETE CASCADE to auto-remove grants when user deleted)
-- 2. Add CHECK constraints enforcing scope_type / department / project_id invariants

-- Add FK constraint if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'perm_ucs_user_id_fk'
       AND conrelid = 'perm_user_capability_scopes'::regclass
  ) THEN
    ALTER TABLE perm_user_capability_scopes
      ADD CONSTRAINT perm_ucs_user_id_fk
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END;
$$;

-- DEPARTMENT scope must have a non-null department; PROJECT scope must have a non-null project_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'perm_ucs_scope_fields_check'
       AND conrelid = 'perm_user_capability_scopes'::regclass
  ) THEN
    ALTER TABLE perm_user_capability_scopes
      ADD CONSTRAINT perm_ucs_scope_fields_check CHECK (
        (scope_type = 'GLOBAL')
        OR (scope_type = 'DEPARTMENT' AND department IS NOT NULL)
        OR (scope_type = 'PROJECT'    AND project_id  IS NOT NULL)
      );
  END IF;
END;
$$;
