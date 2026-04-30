# Production vs Development DCAA Score Audit
**Date:** 2026-04-25  
**Type:** Read-only forensic audit  
**Question:** Why did production DCAA / EDRI score not improve after successful remediation in development?

---

## TL;DR

Production is running the correct scorer code (all 3 bug fixes are deployed), but
**three DB seed operations never reached the production Neon database**. The startup migration
block that applies those seeds is blocked by a pre-existing Phase A error that fires before
the DCAA Pass 1 block can execute. Additionally, no EDRI recompute has been triggered in
production since the deployment, so the dashboard still displays the stale 04:00 AM snapshot.

| Root cause | Detail |
|-----------|--------|
| **Missing DB seeds** | `labor_burden_rates` has 0 rows; IND-IRD/IND-BNP codes absent; FRINGE cost center absent |
| **Migration block never ran** | Phase A error at line 1527 throws before DCAA Pass 1 block (~line 1615) |
| **Stale snapshot** | Latest prod snapshot is #75, computed 14 hours before deployment; no recompute since |
| **Score difference is structural** | Prod baseline was 58.63 vs dev 62.38 — explained by `EMPLOYEE_CERTIFICATION = 0` in prod data |

---

## Environment Facts

| Property | Development | Production |
|----------|-------------|-----------|
| Database host | `helium` (local PostgreSQL) | `ep-wispy-sun-adm062ft.c-2.us-east-1.aws.neon.tech` (Neon) |
| Database name | `heliumdb` | `neondb` |
| Latest EDRI snapshot | #78, **82.38**, 2026-04-25 17:40 (fresh) | #75, **58.63**, 2026-04-25 04:00 (stale) |
| Scoring band | HIGH_RISK | MATERIAL_DEFICIENCY |
| Snapshots since Pass 1 deployment | 3 recomputes (#76, #77, #78) | 0 recomputes |

The two databases are completely independent. Changes applied via `executeSql` in dev apply
to the dev local database only. The Neon production database receives changes only via:
(a) the startup migration chain when the server boots, or
(b) direct SQL applied to the Neon connection string.

---

## Score Comparison — Baseline (pre-Pass-1)

| Domain | Weight | Dev baseline | Prod baseline | Delta |
|--------|--------|-------------|--------------|-------|
| TIMEKEEPING | 30% | 93.75 | **81.25** | −12.50 |
| CHARGE_CODE | 20% | 20.00 | 20.00 | 0 |
| ACCOUNTING | 20% | 60.00 | 60.00 | 0 |
| PROCUREMENT | 10% | 50.00 | 50.00 | 0 |
| INVENTORY | 10% | 62.50 | 62.50 | 0 |
| POLICY | 10% | 70.00 | 70.00 | 0 |
| **Composite** | — | **62.38** | **58.63** | **−3.75** |

The 3.75-point gap is entirely explained by `EMPLOYEE_CERTIFICATION`:
- Dev: `1` (dev employee data includes certification records)
- Prod: `0` (production employees have no certification entries)
This is a pre-existing data difference, not a Pass 1 issue.

---

## Score Comparison — Current (post-Pass-1 changes deployed)

| Domain | Weight | Dev (post-restart) | Prod (stale snapshot) |
|--------|--------|-------------------|----------------------|
| TIMEKEEPING | 30% | 93.75 | 81.25 |
| CHARGE_CODE | 20% | 80.00 | 20.00 |
| ACCOUNTING | 20% | 90.00 | 60.00 |
| PROCUREMENT | 10% | 50.00 | 50.00 |
| INVENTORY | 10% | 62.50 | 62.50 |
| POLICY | 10% | 90.00 | 70.00 |
| **Composite** | — | **82.38** | **58.63** |

---

## DB Object Verification (live queries)

### 1. `labor_burden_rates` table

| | Dev | Prod |
|-|-----|------|
| Table exists | ✅ | ✅ (structure present) |
| Row count | **1** (1 active row) | **0** (table empty) |
| BURDEN_RATES check result | **1** (pass) | **0** (fail — count = 0) |

The production table structure was created but the seed INSERT never executed. The DCAA Pass 1
migration block (`CREATE TABLE IF NOT EXISTS labor_burden_rates ... INSERT INTO labor_burden_rates
... WHERE NOT EXISTS ...`) never ran because Phase A throws at startup line 1527 before reaching
the DCAA Pass 1 block at line ~1615.

### 2. IR_AND_D and B_AND_P charge codes

| Code | Dev | Prod |
|------|-----|------|
| `IND-IRD` (type=IR_AND_D) | ✅ exists | ❌ absent |
| `IND-BNP` (type=B_AND_P) | ✅ exists | ❌ absent |
| IRD_BP_CATEGORIES check result | **1** (pass) | **0** (fail) |

15 `IND-*` codes with G_AND_A and OVERHEAD types DO exist in production (seeded by Phase A), but
the two new IR_AND_D / B_AND_P codes were not applied.

### 3. FRINGE cost center

| | Dev | Prod |
|-|-----|------|
| Cost center with type='FRINGE' | ✅ exists | ❌ absent |
| FRINGE_POOL check result | **1** (pass) | **0** (fail) |

---

## Scorer Code Verification (deployed code)

All 3 scorer bug fixes ARE present in the deployed production code.
The production server is running the same TypeScript that dev runs post-restart.

### Fix B1: NO_PERIOD_LOCKING — `posting_date` → `effective_date`

**Status in prod: DEPLOYED ✅**

- Column `journal_entries.effective_date` confirmed present in prod:
  `effective_date` appears in prod `information_schema.columns` for `journal_entries`
- Column `journal_entries.posting_date` confirmed absent (old broken reference)
- Prod has **0** prior-period DRAFT journal entries (unlike dev which has 5)
- When prod score is recomputed: `PERIOD_LOCKING = 1` (full credit, no open prior periods)

### Fix B2: NO_DELETION_PROTECTION — `action` → `change_type`

**Status in prod: DEPLOYED ✅**

- Column `admin_audit_log.change_type` confirmed present in prod
- Column `admin_audit_log.action` confirmed absent (old broken reference)
- Prod has **0** rows with `change_type ILIKE '%DELETE%'` → vacuously 100% justified
- When prod score is recomputed: `DELETION_PROTECTION = 1` (full credit)

### Fix B3: NO_GA_OVERHEAD_POOL — `cost_centers` → `charge_codes`

**Status in prod: DEPLOYED ✅**

- Prod has **15** active charge codes with `type IN ('G_AND_A','OVERHEAD')`
- When prod score is recomputed: `CODE_TYPE_RESTRICTIONS = 1` (full credit)

---

## Startup Migration Analysis (production)

The production server startup log shows:

```
✅ Pre-deploy migrations: 67/74 applied (or already correct)
✅ Salaried timesheet Phase 1 tables ensured (timekeeping schema)
❌ Blocker 2 Phase A migration failed: Cannot read properties of undefined (reading 'length')
Error initializing background services: TypeError: Cannot read properties of undefined
    at initializeBackgroundServices (server/index.ts:1527:27)
```

The DCAA Pass 1 migration block is at line **~1615** in `server/index.ts`.
Phase A throws at line **1527**, 88 lines before the DCAA Pass 1 block.
**The DCAA Pass 1 block is never reached during production startup.**

This explains all three missing DB seeds:
- `labor_burden_rates` seed INSERT: never executed in prod
- IND-IRD / IND-BNP INSERT: never executed in prod
- FRINGE cost center INSERT: never executed in prod

The table structure of `labor_burden_rates` exists in prod (exact creation mechanism unclear —
likely the table DDL was applied via an earlier code path or migration that ran before Phase A
failed). The INSERT seed was not applied.

### Dev vs Prod startup difference

| Step | Dev | Prod |
|------|-----|------|
| Pre-deploy migrations | 66/74 | 67/74 |
| Salaried timesheet Phase 1 | ❌ failed | ✅ succeeded |
| Phase A (Blocker 2) | ❌ failed | ❌ failed |
| DCAA Pass 1 block | ❌ never reached | ❌ never reached |

In dev, salaried timesheet Phase 1 failed earlier (charge_code_id NOT NULL constraint violation).
In prod it succeeded, suggesting prod has different (or pre-applied) data for that migration.
Both environments fail at Phase A before reaching the DCAA Pass 1 block.

---

## Snapshot Recency

| | Dev | Prod |
|-|-----|------|
| Latest snapshot ID | 78 | 75 |
| Latest snapshot computed | 2026-04-25 17:40 | 2026-04-25 04:00 |
| Deployment time | — | 2026-04-25 ~18:03 |
| Recomputes since deployment | 2 (#77 pre-restart, #78 post-restart) | **0** |
| EDRI auto-schedule | every 4 hours | `0 */4 * * *` (same) |

Production has had no recompute since the new scorer code deployed. The dashboard shows
snapshot #75, which was computed with the OLD (buggy) scorer code hours before deployment.

Even if a recompute ran now with no DB changes, it would use the new scorer code and improve
the score from 58.63 to approximately **68.63** (3 scorer fixes, no new DB seeds).

---

## Projected Prod Score — After Recompute (no DB changes)

Using deployed scorer code against current prod DB state:

| Domain | Current (stale) | After recompute | Change |
|--------|----------------|----------------|--------|
| TIMEKEEPING | 81.25 | 81.25 | ±0 |
| CHARGE_CODE | 20.00 | **40.00** | +20 (CODE_TYPE_RESTRICTIONS: 0→1) |
| ACCOUNTING | 60.00 | **80.00** | +20 (PERIOD_LOCKING: 0→1, no open DRAFT in prod) |
| PROCUREMENT | 50.00 | 50.00 | ±0 |
| INVENTORY | 62.50 | 62.50 | ±0 |
| POLICY | 70.00 | **90.00** | +20 (DELETION_PROTECTION: 0→1) |
| **Composite** | **58.63** | **~68.63** | **+10.00** |

This recompute requires no DB changes — only triggering POST /api/edri/recompute in production.

---

## Projected Prod Score — After Recompute + 3 DB Seeds

After seeding `labor_burden_rates` (1 row), IND-IRD, IND-BNP, FRINGE into production Neon DB:

| Domain | After 3 seeds + recompute |
|--------|--------------------------|
| TIMEKEEPING | 81.25 |
| CHARGE_CODE | **80.00** |
| ACCOUNTING | **100.00** |
| PROCUREMENT | 50.00 |
| INVENTORY | 62.50 |
| POLICY | **90.00** |
| **Composite** | **~80.63** |

Note: Prod will not reach dev's 82.38 even with all seeds, because prod EMPLOYEE_CERTIFICATION=0
reduces TIMEKEEPING by 3.75 composite points. This is a data difference, not a code difference.

---

## Exact Missing Objects in Production

```sql
-- 1. labor_burden_rates needs 1 active seed row (table already exists)
INSERT INTO labor_burden_rates (name, rate_type, rate, effective_date, is_active, notes)
SELECT
  'Preliminary Overhead Burden Rate', 'OVERHEAD', 0.2500, '2025-01-01', TRUE,
  'PRELIMINARY — configuration-only placeholder.'
WHERE NOT EXISTS (SELECT 1 FROM labor_burden_rates WHERE rate_type = 'OVERHEAD' AND is_active = TRUE);

-- 2. IR_AND_D charge code (code column has unique constraint)
INSERT INTO charge_codes (code, description, type, billable, requires_approval, active)
VALUES ('IND-IRD', 'Internal Research & Development — DCAA indirect cost pool', 'IR_AND_D', FALSE, TRUE, TRUE)
ON CONFLICT (code) DO NOTHING;

-- 3. B_AND_P charge code
INSERT INTO charge_codes (code, description, type, billable, requires_approval, active)
VALUES ('IND-BNP', 'Bid & Proposal — DCAA indirect cost pool', 'B_AND_P', FALSE, TRUE, TRUE)
ON CONFLICT (code) DO NOTHING;

-- 4. FRINGE cost center
INSERT INTO cost_centers (id, code, name, type, status, description)
SELECT gen_random_uuid(), 'FRINGE', 'Fringe Benefits Pool', 'FRINGE', 'ACTIVE',
  'PRELIMINARY — DCAA-required fringe benefit indirect cost pool.'
WHERE NOT EXISTS (SELECT 1 FROM cost_centers WHERE type = 'FRINGE');
```

---

## Safest Correction Path

Ordered by risk and dependency:

### Option 1 — Fix the Phase A startup error (recommended, durable)

Fix the `Cannot read properties of undefined (reading 'length')` error at `server/index.ts:1527`
so the startup migration chain can reach Phase B and the DCAA Pass 1 block. This is the durable
solution: once the DCAA Pass 1 block can run, the 4 idempotent statements execute automatically
on every startup, and future deployments will self-heal.

After fixing Phase A:
1. Deploy to production
2. The DCAA Pass 1 block runs, applying all 4 SQL statements idempotently
3. Trigger EDRI recompute via `POST /api/edri/recompute`
4. Prod score reaches ~80.63

### Option 2 — Apply seeds directly to Neon (immediate, bypasses Phase A)

Execute the 4 SQL statements above directly against the production Neon connection string.
This produces the same result immediately without touching the startup migration chain.
After applying:
1. Trigger EDRI recompute via `POST /api/edri/recompute` in prod
2. Prod score reaches ~80.63

**Important:** Option 2 cannot be done via `executeSql({ environment: "production" })` — that
interface is read-only. It requires direct connection to Neon using the DATABASE_URL secret, or
the Neon console.

### Option 3 — Trigger recompute only (partial, immediate)

Without any DB seeds, simply triggering a production recompute would use the deployed scorer
code and recover ~10 points (58.63 → ~68.63) from the 3 scorer bug fixes alone. This requires
no DB changes and no code changes — just an authenticated POST to production.

---

## Summary of Exact Differences

| Item | Dev | Prod | Impact |
|------|-----|------|--------|
| `labor_burden_rates` rows | 1 | **0** | BURDEN_RATES fails → −12 recovery |
| `IND-IRD` charge code | ✅ | ❌ | IRD_BP_CATEGORIES fails → −6 recovery |
| `IND-BNP` charge code | ✅ | ❌ | (same check) |
| FRINGE cost center | ✅ | ❌ | FRINGE_POOL fails → −5 recovery |
| Scorer: `effective_date` | ✅ deployed | ✅ deployed | No gap |
| Scorer: `change_type` | ✅ deployed | ✅ deployed | No gap |
| Scorer: `charge_codes` GA query | ✅ deployed | ✅ deployed | No gap |
| Latest snapshot age | 45 min | **14+ hours** | Displayed score is stale |
| EMPLOYEE_CERTIFICATION data | 1 | **0** | −3.75 composite (pre-existing data gap, not Pass 1) |
