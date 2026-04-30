# Migration Authoring Guide

This guide explains how to write migration files safely so they work on both
production databases (which contain real seed data) and schema-only baseline
databases (which contain no rows at all).

---

## The Core Rule

> **Any `INSERT` or `UPDATE` that depends on a parent row existing must be
> wrapped in an `EXISTS` guard so the statement is a no-op on an empty
> database.**

Violating this rule causes the migration to fail during the automated
schema-baseline replay test (`migrationSafety.test.ts` — Test Suite 4), which
replays all migrations against a fresh `pg_dump --schema-only` database.  That
replay database has the full schema but **zero rows**, so any unguarded
reference to a specific row (e.g. `WHERE id = 18`) will either silently insert
an orphan child row or raise a foreign-key violation.

---

## Why This Matters

Migrations 0025 and 0027 originally inserted rows that referenced specific
parent rows (`checklist_templates.id = 1`, `employees.id = 18`).  Those rows
exist in production but not on a schema-only baseline, so the migrations failed
during automated safety checks and had to be patched retroactively.

The fix in both cases was to add `EXISTS` guards that turn the migration into a
no-op when the expected parent data is absent.

---

## Pattern 1 — Simple `INSERT … SELECT … WHERE EXISTS`

Use this for inserting a child row that references a specific parent by ID.

```sql
-- Insert child_row only when parent_row(id=42) exists,
-- and only when the child row is not already present (idempotent).
INSERT INTO child_table (parent_id, label, is_active)
SELECT 42, 'My label', true
WHERE EXISTS (
  SELECT 1 FROM parent_table WHERE id = 42
) AND NOT EXISTS (
  SELECT 1 FROM child_table
  WHERE parent_id = 42 AND label = 'My label'
);
```

**Key points:**
- `INSERT … SELECT` (not `INSERT … VALUES`) is required to attach a `WHERE`
  clause that references other tables.
- The outer `EXISTS` checks that the parent row is present.
- The `NOT EXISTS` makes the migration idempotent — re-running it is harmless.

---

## Pattern 2 — `DO $$` block with `IF NOT EXISTS` guard

Use this when you need verification logic, multiple dependent steps, or a
`RAISE NOTICE` when the parent row is absent.

```sql
-- Step N: Perform work only when the expected parent row exists.
-- On a schema-only baseline the IF-block is skipped and the migration
-- succeeds without error.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM parent_table WHERE id = 42) THEN
    RAISE NOTICE 'Skipped: parent_table(id=42) not found — schema-only baseline or row not yet seeded';
    RETURN;
  END IF;

  -- safe to reference the parent row from here on
  INSERT INTO child_table (parent_id, label, is_active)
  VALUES (42, 'My label', true)
  ON CONFLICT DO NOTHING;
END $$;
```

**Key points:**
- `RAISE NOTICE` (not `RAISE EXCEPTION`) keeps the migration from aborting —
  it simply logs and continues.
- `RETURN` inside a `DO` block exits the anonymous function; subsequent
  statements in the same `DO` block are skipped.
- Include a short explanation in the notice so developers know the skip was
  intentional.

---

## Pattern 3 — `INSERT … SELECT … FROM source_table ON CONFLICT DO NOTHING`

Use this when seeding a table from another table that may be empty.

```sql
-- Promote all rows from source_table; safe if source_table has no rows.
-- ON CONFLICT DO NOTHING makes it fully idempotent.
INSERT INTO dest_table (col_a, col_b, col_c)
SELECT
  src.col_a,
  src.col_b,
  'default_value' AS col_c
FROM source_table src
ON CONFLICT (col_a) DO NOTHING;
```

**Key points:**
- `SELECT … FROM source_table` returns zero rows when the table is empty, so
  the `INSERT` is naturally a no-op.
- `ON CONFLICT DO NOTHING` handles the case where the migration is re-run
  after the data is already present.

---

## Checklist Before Committing a Migration

- [ ] Does any `INSERT` hard-code a parent row ID (e.g. `WHERE id = 5`)?  
      → Wrap it in `WHERE EXISTS (SELECT 1 FROM parent_table WHERE id = 5)`.
- [ ] Does any `UPDATE` depend on a row that may not exist?  
      → An `UPDATE … WHERE id = 5` that matches zero rows is silently a no-op,
      but add a comment explaining the intent.
- [ ] Is every `INSERT` idempotent?  
      → Use `ON CONFLICT DO NOTHING` or `NOT EXISTS (…)` to prevent duplicate
      inserts if the migration is replayed.
- [ ] Does the migration have a comment block explaining what it does and what
      guard strategy was chosen?  
      → See the header comments in `0025_fix_production_daily_checklist_seed.sql`
      and `0027_brian_ramirez_account_fix.sql` as examples.
- [ ] Did the automated safety test pass locally?  
      → Run `npx vitest run --config vitest.config.server.ts
      server/__tests__/migrationSafety.test.ts` to confirm.

---

## Real-World Examples in This Codebase

| File | Guard strategy |
|------|----------------|
| `0025_fix_production_daily_checklist_seed.sql` | `INSERT … SELECT … WHERE EXISTS (parent) AND NOT EXISTS (duplicate)` |
| `0027_brian_ramirez_account_fix.sql` | `INSERT … SELECT … WHERE EXISTS (parent)` + `DO $$ … IF NOT EXISTS … RAISE NOTICE … RETURN` for verification |
| `0053_seed_labor_charge_codes.sql` | `INSERT … SELECT … FROM source_table ON CONFLICT (code) DO NOTHING` |

---

## What Happens if You Skip the Guard

The migration safety test suite (`server/__tests__/migrationSafety.test.ts`)
runs all migrations against a `pg_dump --schema-only` baseline.  An unguarded
`INSERT` that references a missing parent row will either:

1. **Violate a foreign-key constraint** — the migration aborts with an error
   and is added to `KNOWN_BROKEN_ON_SCHEMA_BASELINE` as a known failure.
2. **Insert a phantom row with a hard-coded ID** — succeeds on the baseline but
   leaves the database in an inconsistent state, masking a real data dependency.

Either outcome requires a retroactive fix migration, which adds noise to the
migration history and blocks other developers.
