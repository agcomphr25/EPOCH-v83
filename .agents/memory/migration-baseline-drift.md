---
name: Migration baseline drift
description: When BASELINE_APPLIED_THROUGH jumps past migrations that weren't actually on production, those schema changes are silently missing until a new IF NOT EXISTS migration re-applies them
---

## Rule
When `BASELINE_APPLIED_THROUGH` is advanced, verify every migration between the old and new baseline was actually applied to the production DB. Any that weren't must be re-delivered as a new safe `IF NOT EXISTS` migration with a higher number.

## Why
`pre-deploy-migrate.ts` treats all migrations ≤ `BASELINE_APPLIED_THROUGH` as already applied and skips them. If the baseline jumped from `0094` to `0154`, migrations `0095`–`0154` are assumed applied. If any weren't (e.g., they came in after the last working deploy), their columns/tables silently don't exist in production. This caused `column "project_id" does not exist` errors on the P2 Control Center.

## How to apply
- After any baseline advancement, check critical new columns/tables in the production DB before republishing.
- Deliver missing schema as a new migration using `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — fully idempotent.
- The production DB connection is `DATABASE_URL` (secret) pointing to `ep-wispy-sun-adm062ft.c-2.us-east-1.aws.neon.tech`. `EPOCH_V83_DATABASE_URL` (`ep-sweet-smoke-adiyfj99`) is a different DB — do not use it to verify production state.
- Add every new migration to `safeFiles` in `runSafeBootMigrations.ts` AND advance `BASELINE_APPLIED_THROUGH` in `pre-deploy-migrate.ts` once the migration is confirmed applied.
