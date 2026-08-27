# Migration Journal Repair Note

## Context

After the canonical `customer_key` migration (0032) landed, the Drizzle migration
journal (`_journal.json`) only contained entries for migrations 0000–0006.
Migrations 0007–0033 were applied directly via the boot-time SQL runner in
`server/index.ts` but never registered in the journal, creating a snapshot drift risk.

## What Was Fixed

`_journal.json` now contains entries for **all 34 migrations (idx 0–33)**,
including 0007–0033 that were previously missing. Each entry uses the correct
filename tag (without the `.sql` extension) and incremental timestamps.

## Destructive-Change Verification

`ar_invoice_id` on `credit_memos` is defined in `server/schema.ts` (line 10049)
as `arInvoiceId: uuid('ar_invoice_id')`. It was added by migration
`0030_p2_invoicing_phase1_schema.sql`. Because schema.ts contains the column,
`drizzle-kit generate` will NOT emit a `DROP COLUMN` for it. No migration file
in `migrations/` contains a `DROP ar_invoice_id` statement (verified via grep).

`drizzle-kit generate` was also run interactively against the live database to
confirm it only proposes `CREATE TABLE` additions for newer tables — no `DROP`
statements were observed in the output.

## Future Raw SQL Migrations

When adding a raw SQL migration file that bypasses `drizzle-kit generate`:

1. Create the SQL file as `migrations/<idx>_<description>.sql`.
2. Add the file path to the `safeFiles` list in `server/index.ts` (boot runner).
3. Add a corresponding journal entry to `migrations/meta/_journal.json` with the
   next sequential `idx`, a `when` timestamp in milliseconds, and the tag set to
   the filename without `.sql`.
4. Update `server/schema.ts` to reflect any new columns/tables so the Drizzle
   snapshot stays in sync.

Skipping step 3 causes `drizzle-kit generate` to see a diff between the latest
snapshot and the current schema and emit a potentially destructive migration.
