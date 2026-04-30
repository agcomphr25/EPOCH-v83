-- Migration: Replace COALESCE-expression unique index with three partial unique indexes
-- Reason: The expression-based index (COALESCE) causes Replit's deployment migration
-- generator to emit incorrect operator class annotations (int4_ops on text columns),
-- which fails on PostgreSQL with "operator class int4_ops does not accept data type text".
--
-- Fix: Three clean partial unique indexes — one per scope_type — cover the same invariant
-- without any expression columns, so no operator class inference is needed.

-- 1. Drop the problematic expression-based index (safe: IF EXISTS)
DROP INDEX IF EXISTS perm_ucs_unique_grant_idx;

-- 2a. GLOBAL scope: only one grant per (user, capability) globally
CREATE UNIQUE INDEX IF NOT EXISTS perm_ucs_unique_global_idx
  ON perm_user_capability_scopes (user_id, capability_id)
  WHERE scope_type = 'GLOBAL';

-- 2b. DEPARTMENT scope: only one grant per (user, capability, department)
CREATE UNIQUE INDEX IF NOT EXISTS perm_ucs_unique_dept_idx
  ON perm_user_capability_scopes (user_id, capability_id, department)
  WHERE scope_type = 'DEPARTMENT';

-- 2c. PROJECT scope: only one grant per (user, capability, project_id)
CREATE UNIQUE INDEX IF NOT EXISTS perm_ucs_unique_project_idx
  ON perm_user_capability_scopes (user_id, capability_id, project_id)
  WHERE scope_type = 'PROJECT';
