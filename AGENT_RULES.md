# AGENT RULES — EPOCH Production System

This file defines mandatory constraints for all automated agents working on this
codebase. These rules exist to protect production data at AG Composites.

---

## MIGRATION SAFETY RULES

### 1. NEVER generate migrations that contain:
- `DROP COLUMN` on any table with existing rows
- `DROP TABLE` on any table with existing rows
- `DELETE FROM` without a `WHERE` clause
- `TRUNCATE` on any non-empty table
- Type-shrinking `ALTER COLUMN ... TYPE` (e.g. `text` → `integer`, `uuid` → `varchar`)

### 2. If a column is no longer needed:
- Rename it to `<column>_deprecated` using `ALTER TABLE ... RENAME COLUMN`
- **Do NOT remove it** — data must remain recoverable
- Use the helper in `server/utils/schemaEvolution.ts`:
  ```ts
  import { markColumnDeprecated } from '../utils/schemaEvolution';
  const { sql } = markColumnDeprecated('my_table', 'old_column');
  ```

### 3. Always assume:
- The database is the source of truth for existing data
- All columns in production tables contain data until proven otherwise
- Migrations are irreversible once applied to production

### 4. Any destructive change:
- MUST be approved by a human operator
- MUST be explicitly documented with a reason in the migration file
- MUST be gated behind `MIGRATION_SAFE_MODE=false` (set manually, never by an agent)

### 5. Forward-only schema evolution:
- Add new columns with defaults or nullable
- Rename columns to `*_deprecated` rather than dropping
- Use `CREATE TABLE IF NOT EXISTS` — never `DROP TABLE ... CREATE TABLE`
- If renaming a table: use `markTableDeprecated()` from `server/utils/schemaEvolution.ts`

---

## DEPLOYMENT RULES

### Pre-deploy gate
- `server/pre-deploy-migrate.ts` runs before every deployment
- It applies `migrations/*.sql` in lexicographic order
- It checks schema governance (drift + guard) and blocks on violations
- `server/utils/migrationSafetyCheck.ts` scans SQL before any DB contact

### MIGRATION_SAFE_MODE
```
MIGRATION_SAFE_MODE=true   (default) — ANY destructive statement throws and blocks deploy
MIGRATION_SAFE_MODE=false            — Warns and allows; requires human approval
```

Agents must NEVER set `MIGRATION_SAFE_MODE=false` autonomously.

### Boot migration runner
- `server/index.ts` runs `ADD COLUMN IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` idioms
- These must match constraint/index names in `server/schema.ts` exactly
- Any `CREATE UNIQUE INDEX name ON ...` in the boot runner → `uniqueIndex('name')` in schema.ts

---

## CODE RULES

### Primary key IDs
- Never change a primary key column type (serial ↔ varchar/uuid)
- If `id` is `serial` in production, keep it `serial('id').primaryKey()` in schema.ts
- If `id` is `varchar` + `gen_random_uuid()`, keep it as-is

### Pool query pattern
- `pool.query()` returns rows directly: use `result[0]` not `result.rows[0]`
- Exception: raw `pg.Pool` (named `pgPool`) uses `.rows[0]`

### req.user shape
```ts
{ id, username, role, employeeId, canOverridePrices, isActive }
// NO `canonicalId` field
```

### production_orders vs projects
- `production_orders.id` is `INTEGER` (serial)
- `projects.id` is `UUID`

---

## FILE GOVERNANCE

### schema.ts
- Single source of truth for all Drizzle table definitions
- Constraint names must exactly match what the boot runner creates in SQL
- Partial unique indexes: `uniqueIndex('name').on(...).where(sql\`...\`)`

### server/index.ts (boot runner)
- All `ADD COLUMN` / `CREATE INDEX` statements here are the source of truth for live DB
- New columns must be added here AND in `server/schema.ts`

### migrations/*.sql
- All files are scanned by `migrationSafetyCheck.ts` before execution
- Destructive statements in these files will block deployment when MIGRATION_SAFE_MODE=true

---

## CRITICAL TABLES (never drop or truncate)

| Table | Reason |
|---|---|
| `all_orders` | Core order ledger |
| `payments` | Financial records |
| `bulk_payment_batches` | Batch payment audit trail |
| `followup_orders` | Customer signature records |
| `schema_change_log` | Governance audit log |
| `nonconformance_records` | Quality/compliance records |
| `p2_customers` | P2 customer master |
| `p2_lot_numbers` | Lot traceability |
| `p2_final_inspection_results` | Final inspection records |
| `p2_serialized_items` | Serialized item traceability |

---

*Last updated: maintained automatically — do not delete this file.*
