# Burden Rates Engine — Methodology (Task #80)

## Purpose

Apply indirect cost burden (fringe / overhead / G&A) to direct labor cost
records **before** they are posted to the general ledger.  This makes every
direct labor charge "fully loaded" with its proportional share of indirect
expenses, satisfying CAS-style cost accumulation and DCAA fully-burdened-rate
expectations.

> Constitution reference: §5.6 mandates that indirect burden be applied prior
> to GL posting.  The Burden Rates Engine is the authorized implementation.

## Scope

In scope (this engine):

* Pool / base / rate **schema** (effective-dated, insert-only).
* **Idempotent** application engine that writes immutable burden rows.
* **Pre-post gate** in `laborPostingService` that refuses to post a period
  with missing burden.
* **Rate-change / true-up** workflow (insert-only rates, TRUE_UP runs that
  reference the INITIAL run they correct).
* Admin **UI** for pools, rates, runs, verify, and rate-change preview.

Out of scope (deferred):

* Sourcing / loading actual indirect pool **expenses** (fringe expense feed,
  overhead expense feed) — required for true rate computation; placeholder
  rates are entered manually until then.
* Applying burden to non-labor cost objects (the schema is generic enough to
  support this — the source table is recorded per-row — but only labor is
  wired today).
* Year-end **Incurred Cost Submission** (ICS) reporting.

## Schema

| Table | Purpose |
| --- | --- |
| `allocation_bases` | Definition of bases (DIRECT_LABOR_DOLLARS, DIRECT_LABOR_HOURS, TOTAL_COST_INPUT). |
| `indirect_cost_pools` | One row per pool (FRINGE / OVERHEAD / G_AND_A); references a base; has an `apply_order`. |
| `indirect_rates` | **Insert-only** rate history.  PK on `(pool_id, rate_type, effective_from)`. |
| `burden_application_runs` | One row per apply call.  Run type INITIAL or TRUE_UP. |
| `applied_burden_amounts` | **Immutable** per source-record × pool burden line.  Unique on `(run_id, source_record_id, pool_id)`. |

Bases are evaluated by `resolver_kind`:

* `DIRECT_LABOR_DOLLARS` — `dollarCost` of DIRECT records (zero for indirect).
* `DIRECT_LABOR_HOURS` — `hoursWorked` of DIRECT records.
* `TOTAL_COST_INPUT` — `dollarCost` + sum of burden already applied to the
  same record earlier in the same run.  Pools using TCI **must** have a higher
  `apply_order` than their inputs (e.g. G&A applies after FRINGE / OVERHEAD).

## Idempotence and re-runs

* **INITIAL run**: a re-apply for the same `(period_year, period_month, run_type=INITIAL)`
  deletes any prior INITIAL run + its rows in a single transaction, then
  re-inserts.  Safe to run repeatedly.
* **TRUE_UP run**: requires a COMPLETED INITIAL run.  The new run's
  `supersedes_run_id` points at the INITIAL run.  Each row stores
  `prior_amount` (the INITIAL amount) and `burden_amount` as the **delta**
  (so the GL impact equals exactly the amount moving between provisional
  and final/billing).
* Rate types: a TRUE_UP defaults to FINAL; an INITIAL defaults to PROVISIONAL.

## GL pre-post gate

`laborPostingService.postLaborToGL` calls
`verifyPeriodBurdenComplete(year, month)` immediately after WAD attribution
checks (step 6b).  If any DIRECT cost record is missing burden for **any
active pool**, the post is aborted with HTTP 422 (`code: 'MISSING_BURDEN'`)
and a list of offending records.  Indirect (OVERHEAD / G_AND_A) records do
not require burden, since they *are* the indirect costs being collected.

## Rate-change workflow

1. Open **Burden Rates → Rates** tab, select pool, enter the new rate with
   its effective date.  The row is appended to the rate history.
2. (Optional) Use the **Rate Change Preview** tab to see the dollar delta
   against any prior period.
3. For closed periods, run a **TRUE_UP** to write delta rows.  Open periods
   simply re-run **INITIAL**.

## Reproducibility

`recomputeBurdenForApplied(appliedId)` re-derives the burden for a single row
using the rate stack effective at that source record's clock-in date and
returns both the stored value and the recomputed value.  Useful for audit.

## Files

* Schema: `server/schema.ts` (search for `allocationBases`).
* Service: `server/src/services/burdenRatesService.ts`.
* Routes: `server/src/routes/burdenRates.ts` (mounted at `/api/burden-rates`).
* GL gate: `server/src/services/laborPostingService.ts` step 6b.
* UI: `client/src/pages/BurdenRatesAdmin.tsx` (`/finance/burden-rates`).
* Migration: `migrations/0100_burden_rates_engine.sql`.
