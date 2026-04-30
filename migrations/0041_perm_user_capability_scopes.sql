-- Migration: Add perm_user_capability_scopes table for scope-aware permissions
-- This table links users to capabilities with an optional department and/or project
-- constraint, enabling scoped approval authority.

CREATE TABLE IF NOT EXISTS perm_user_capability_scopes (
  id          serial PRIMARY KEY,
  user_id     integer NOT NULL,
  capability_id integer NOT NULL REFERENCES perm_capabilities(id) ON DELETE CASCADE,
  scope_type  text NOT NULL CHECK (scope_type IN ('GLOBAL', 'DEPARTMENT', 'PROJECT')),
  department  text,
  project_id  text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS perm_ucs_user_id_idx ON perm_user_capability_scopes (user_id);
CREATE INDEX IF NOT EXISTS perm_ucs_capability_id_idx ON perm_user_capability_scopes (capability_id);
