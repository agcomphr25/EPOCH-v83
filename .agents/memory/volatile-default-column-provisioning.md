---
name: Volatile-default column provisioning hang
description: Drizzle schema diff generates a slow ALTER TABLE ADD COLUMN with volatile DEFAULT + NOT NULL that hangs Replit provisioning on busy tables. Fix and recovery procedure.
---

# Volatile-default column provisioning hang

## The rule
When a dev DB column has `DEFAULT volatile_func() NOT NULL` (e.g. `DEFAULT gen_random_uuid() NOT NULL`), Drizzle's schema diff generates:
```sql
ALTER TABLE t ADD COLUMN c uuid DEFAULT gen_random_uuid() NOT NULL;
```
PostgreSQL must rewrite the entire table to fill in the volatile default. On a busy production table the required exclusive lock can never be acquired — the ALTER TABLE waits indefinitely while the app keeps serving requests. Provisioning hangs until manually cancelled.

**Why:** Constant defaults are fast in PG 11+ (metadata-only). Volatile function defaults (gen_random_uuid(), now(), etc.) are never fast — they require a full table rewrite in all PG versions.

## Safe migration pattern (already in migration 0262)
```sql
ALTER TABLE t ADD COLUMN IF NOT EXISTS c uuid;          -- fast, nullable, no default
UPDATE t SET c = gen_random_uuid() WHERE c IS NULL;     -- backfill, no lock held during scan
ALTER TABLE t ALTER COLUMN c SET DEFAULT gen_random_uuid(),
             ALTER COLUMN c SET NOT NULL;                -- fast metadata-only once all rows filled
```

## Recovery procedure (when provisioning hangs)
1. Cancel the in-progress publish from the Replit UI.
2. On the **dev DB**, strip the volatile default and NOT NULL from the problem column:
   ```sql
   ALTER TABLE t ALTER COLUMN c DROP DEFAULT,
                 ALTER COLUMN c DROP NOT NULL;
   ```
3. Run `explainSchemaDiff()` — confirm the ADD COLUMN statement is now `ADD COLUMN c uuid` (no DEFAULT, no NOT NULL).
4. Verify tests still pass.
5. Tell the user to publish again. Provisioning now applies the fast nullable column.
6. The safe-boot migration (e.g. 0262) runs at first boot and does the 3-step backfill + NOT NULL.
7. **Immediately after** the publish succeeds, restore the dev DB column:
   ```sql
   ALTER TABLE t ALTER COLUMN c SET DEFAULT gen_random_uuid(),
                 ALTER COLUMN c SET NOT NULL;
   ```
   This keeps dev in sync with production (which migration 0262 set to NOT NULL + DEFAULT).

**How to apply:** Any time a new migration adds a column to an existing table using a volatile function default. Check the explainSchemaDiff output before every publish if a recent migration touched column definitions on large tables.
