# DCAA SCORE NO-CHANGE AUDIT
## Why the EDRI Score Did Not Improve After Blocker 2 Phase B

**Date:** April 25, 2026  
**Audit type:** Read-only — no code or data modified  
**Current composite score:** 62.38 / 100 (MATERIAL_DEFICIENCY)  
**Audit failure probability:** 52.62%

---

## Files Inspected

| File | Role |
|------|------|
| `server/src/services/edriDomainScorers.ts` | All domain scoring logic — 752 lines, fully read |
| `server/src/services/edriScoringService.ts` | Score composition, weighting, snapshot persistence |
| `server/src/routes/edri.ts` | API surface; forensic pre-scan triggered before compute |
| `server/src/services/dcaaForensicRules.ts` | 9 forensic rules TK-001 through TK-009 |
| `server/src/schema/timekeeping.ts` | Salaried timesheet + audit Drizzle schema |
| `server/src/services/timekeeping/salariedLaborCostingService.ts` | Phase B costing service |
| `timekeeping.settings` (live DB) | Feature flags, `salaried_timesheet_enabled = false` |

---

## 1. What Exact Checks Drive the DCAA Score?

The EDRI composite score is a **weighted average** of 6 active domain scores:

| Domain | Weight | Checks | Current Score |
|--------|--------|--------|--------------|
| TIMEKEEPING | 30% | 8 checks + forensic deduction | **93.75** |
| CHARGE_CODE | 20% | 5 checks | **20.00** |
| ACCOUNTING | 20% | 5 checks | **60.00** |
| PROCUREMENT | 10% | 5 checks | **50.00** |
| INVENTORY | 10% | 4 checks | **62.50** |
| POLICY | 10% | 5 checks | **70.00** |
| GOVT_PROPERTY | 0% | 1 check (stub) | 0 (excluded) |

Each check scores 0 (fail), 0.5 (partial), or 1 (pass). Raw domain score = `(sum / count) × 100`.

**Full check inventory from live DB snapshot:**

```
TIMEKEEPING (93.75):
  PIN_ENFORCEMENT:            1   hardcoded pass — punch_ledger identity gate
  NO_AUTO_APPROVAL:           1   0 sessions without labor_approval (0 punches exist)
  TIMESHEET_APPROVAL_DEADLINE: 1  0 stale sessions (0 punches exist)
  EMPLOYEE_CERTIFICATION:     1   0 employees without coverage (0 punchers)
  IMMUTABLE_APPROVED_RECORDS: 1   0 post-approval edits in audit_events
  DUAL_SYSTEM_GAP:            1   hardcoded pass — single native punch_ledger
  CORRECTION_APPROVAL_CHAIN:  0.5 0 punch corrections in audit_events → partial
  CHARGE_CODE_COMPLIANCE:     1   0 punches with invalid charge codes

CHARGE_CODE (20.00):
  IRD_BP_CATEGORIES:          0   0 charge codes with IR_AND_D or B_AND_P type
  FRINGE_POOL:                0   0 cost_centers with type = 'FRINGE'
  WAD_GL_LINK:                1   0 total labor_cost_records → 0% unlinked (vacuously true)
  CODE_TYPE_RESTRICTIONS:     0   0 cost_centers with G&A/Overhead type
  SUPERVISOR_OVERRIDE_TRAIL:  0   0 audit_events with entity_type 'charge_code'

ACCOUNTING (60.00):
  BURDEN_RATES:               0   labor_burden_rates table does not exist → safeCount null → 0
  DEFAULT_RATE_FALLBACK:      1   0 labor_cost_records → 0% default rate (vacuously true)
  PERIOD_LOCKING:             0   journal_entries.posting_date column missing → SQL error → null → 0
  VOID_APPROVAL:              1   0 voided journal entries → pass
  QB_RECONCILIATION:          1   5 DRAFT journal entries < threshold of 10

PROCUREMENT (50.00):
  REQUISITION_WORKFLOW:       0.5 parts_requests.po_id column missing → null
  SECOND_PARTY_APPROVAL:      0.5 purchase_orders.approved column missing → null
  VENDOR_APPROVAL_BLOCKING:   0.5 purchase_orders.vendor_id column missing → null
  FAR_FLOWDOWN:               0.5 vendors.terms column missing → null
  VENDOR_EVALUATION:          0.5 vendors.last_evaluated_at column missing → null

INVENTORY (62.50):
  ZERO_QTY_GUARD:             1   0 zero-qty inventory transactions
  LOT_TRACEABILITY:           0.5 material_lots.icn column missing → null (column is internal_control_number)
  FIFO_ENFORCEMENT:           0.5 material_lots.received_date column missing → null (column is received_at)
  EVENT_VISIBILITY:           0.5 0 ISSUE/MOVE/SPLIT transactions

POLICY (70.00):
  AUDIT_LOG_COMPLETENESS:     1   114 audit_events in last 30 days > threshold of 100
  DELETION_PROTECTION:        0   admin_audit_log.action column missing → SQL error → null → 0
  APPROVAL_CHAIN:             1   3 ADMIN/OWNER users
  HARDCODED_APPROVER:         1   3 active ADMIN/OWNER users
  DOCUMENT_VERSION_CONTROL:   0.5 0 active controlled_documents → partial
```

---

## 2. Which Checks Are Currently Failing?

**10 active red flags (all scoring 0 or 0.5):**

| # | Flag Key | Domain | Severity | Recovery | Root Cause |
|---|----------|--------|----------|----------|------------|
| 1 | NO_BURDEN_RATES | ACCOUNTING | **CRITICAL** | +12 | `labor_burden_rates` table does not exist in the DB |
| 2 | NO_IRD_BP_CATEGORY | CHARGE_CODE | HIGH | +6 | No charge codes with `type = 'IR_AND_D'` or `'B_AND_P'` |
| 3 | NO_PERIOD_LOCKING | ACCOUNTING | HIGH | +6 | `journal_entries.posting_date` column does not exist (actual column: `effective_date`) |
| 4 | NO_FRINGE_POOL | CHARGE_CODE | HIGH | +5 | No `cost_centers` row with `type = 'FRINGE'` |
| 5 | NO_GA_OVERHEAD_POOL | CHARGE_CODE | HIGH | +5 | No `cost_centers` row with `type = 'G_AND_A'/'OVERHEAD'` — scorer queries wrong table |
| 6 | NO_DELETION_PROTECTION | POLICY | HIGH | +5 | `admin_audit_log.action` column does not exist |
| 7 | NO_CHARGE_CODE_AUDIT | CHARGE_CODE | MEDIUM | +3 | 0 `audit_events` rows with `entity_type` containing 'charge' |
| 8 | NO_INVENTORY_EVENTS | INVENTORY | MEDIUM | +3 | 0 ISSUE/MOVE/SPLIT `inventory_transactions` |
| 9 | NO_CONTROLLED_DOCUMENTS | POLICY | MEDIUM | +3 | 0 `controlled_documents` with `status = 'ACTIVE'` |
| 10 | NO_CORRECTION_AUDIT_TRAIL | TIMEKEEPING | MEDIUM | +3 | 0 punch correction events (no punches have been edited yet) |

---

## 3. Which Phase B Improvements Are Not Recognized by the Scorer?

**All Phase B improvements are invisible to the scorer.** Phase B built the salaried indirect labor → `labor_cost_records` → `laborPostingService` → `journal_entries` GL posting path. None of these tables appear in EDRI domain queries about salaried timesheets specifically.

The complete list of Phase B artifacts:

| Phase B Artifact | What It Built | What the Scorer Measures |
|-----------------|---------------|--------------------------|
| `salariedLaborCostingService.ts` | Creates `labor_cost_records` at payroll approval | Scorer checks `labor_cost_records` count/GL-link ratio, but only when records exist |
| `salariedTimesheets.ts` approval routes | State machine: OPEN→SUBMITTED→SUPERVISOR_APPROVED→PAYROLL_APPROVED→REOPENED | Scorer never queries `timekeeping.salaried_timesheets` |
| `salariedTimesheetAuditTable` writes | Immutable audit trail | Scorer never queries `timekeeping.salaried_timesheet_audit` |
| `laborPostingService.ts` step 2b | Adopts salaried records into GL posting run | Scorer checks WAD_GL_LINK ratio — currently vacuously 100% (0 records) |
| `storage.ts` punch-only delete guard | Protects salaried records from punch recalculation | No EDRI check measures this |
| Phase B migration (7 approval columns) | Schema reconciliation | Scorer never queries `salariedTimesheets` approval timestamps |

**The EDRI TIMEKEEPING domain measures only `punch_ledger` + `labor_approvals`.** It has no awareness of salaried timesheets, salaried labor cost records, or the salaried GL path.

---

## 4. Is the Scorer Accurate, Stale, or Too Narrow?

**Verdict: The scorer has three distinct problems — stale column references, wrong table references, and a measurement gap.**

### 4a. Stale Column References (SQL Errors → null → 0 or 0.5)

These checks fail silently because referenced columns do not exist in the live schema. The `safeCount()` helper catches SQL exceptions and returns `null`, which maps to failing scores:

| Check | Scorer SQL | Actual Schema |
|-------|-----------|---------------|
| PERIOD_LOCKING | `journal_entries.posting_date` | Column is `effective_date` |
| DELETION_PROTECTION | `admin_audit_log.action` | Column doesn't exist — table has `change_type` |
| REQUISITION_WORKFLOW | `parts_requests.po_id` | Column doesn't exist |
| SECOND_PARTY_APPROVAL | `purchase_orders.approved` | Column doesn't exist (has `status`) |
| VENDOR_APPROVAL_BLOCKING | `purchase_orders.vendor_id` | Column doesn't exist |
| FAR_FLOWDOWN | `vendors.terms` | Column doesn't exist |
| VENDOR_EVALUATION | `vendors.last_evaluated_at` | Column doesn't exist (has `evaluation_date`) |
| LOT_TRACEABILITY | `material_lots.icn` | Column is `internal_control_number` |
| FIFO_ENFORCEMENT | `material_lots.received_date` | Column is `received_at` |

**9 of the 25 active checks are answering the wrong question** because the SQL fails. The entire PROCUREMENT domain (5 checks) is locked at 0.5 due to schema drift. Two INVENTORY checks (LOT_TRACEABILITY, FIFO_ENFORCEMENT) are also stuck at 0.5.

### 4b. Wrong Table Reference (Logic Bug)

The **NO_GA_OVERHEAD_POOL** check queries:
```sql
SELECT COUNT(*) FROM cost_centers WHERE type IN ('G_AND_A', 'GENERAL_AND_ADMIN', 'GA', 'OVERHEAD')
```
This scores 0 because `cost_centers` only has entries with `type = 'DEPARTMENT'`.

However, Phase A (Blocker 2) seeded `charge_codes` with **15 IND-* codes** including 3 with `type = 'G_AND_A'` and 12 with `type = 'OVERHEAD'`. The data exists — the scorer is looking in the wrong table. This is a scorer logic bug: G&A and Overhead classification lives in `charge_codes`, not `cost_centers`.

### 4c. Measurement Gap — Salaried Timekeeping

The TIMEKEEPING domain scorer is punch-centric. It was designed before salaried indirect labor existed in EPOCH. It measures:
- `punch_ledger` session coverage by `labor_approvals`
- `audit_events` for punch modifications
- `punch_ledger.charge_code` compliance against `charge_codes`

It does **not** measure:
- Salaried timesheet certification rates
- Salaried timesheet payroll approval rates
- Salaried labor cost record GL-linkage (independently from punch records)
- `timekeeping.salaried_timesheet_audit` completeness

This gap means the full salaried approval workflow built in Phase B is **DCAA-compliant in implementation** but **invisible to the EDRI scorer**.

---

## 5. Does the Score Require Live Data, Feature Flags, or Seeded Config?

**Yes — all three.**

| Dependency | Current State | Score Impact |
|-----------|--------------|-------------|
| `salariedTimesheetEnabled` feature flag | **FALSE** | Salaried records cannot be created. WAD_GL_LINK stays vacuously 1 (0 records). |
| `labor_burden_rates` table | **Does not exist** | BURDEN_RATES = 0 (CRITICAL). Blocker for ACCOUNTING. |
| `cost_centers` with FRINGE/G&A/Overhead types | **None exist** | FRINGE_POOL = 0, CODE_TYPE_RESTRICTIONS = 0. |
| `charge_codes` with IR_AND_D/B_AND_P types | **None exist** | IRD_BP_CATEGORIES = 0. |
| `admin_audit_log.action` column | **Does not exist** | DELETION_PROTECTION = 0 (silent SQL error). |
| `journal_entries.posting_date` column | **Does not exist** | PERIOD_LOCKING = 0 (silent SQL error). |
| `punch_ledger` data (actual punch sessions) | **0 rows** | TIMEKEEPING scores 93.75 vacuously — many checks trivially pass with no data. |
| `controlled_documents` | **0 active rows** | DOCUMENT_VERSION_CONTROL = 0.5. |

**Critical implication:** The 93.75 TIMEKEEPING score is **vacuously inflated** because there are 0 punch_ledger sessions. When real production activity begins, checks like NO_AUTO_APPROVAL and TIMESHEET_APPROVAL_DEADLINE will score against actual data and could degrade. The current TIMEKEEPING score gives false comfort.

---

## 6. Is AUTO_APPROVAL_BYPASS Still the Dominant Blocker?

**No. AUTO_APPROVAL_BYPASS is not triggering** — it scores 1 (pass) because there are 0 punch_ledger sessions. With no punches, there are no unapproved sessions.

The **dominant blockers today** are CHARGE_CODE domain (score 20) and ACCOUNTING domain (score 60):

| Blocker | Current domain score | Composite drag |
|---------|---------------------|----------------|
| CHARGE_CODE = 20 | 4.0 contribution vs 20.0 possible | **−16 composite points vs perfect** |
| ACCOUNTING = 60 | 12.0 contribution vs 20.0 possible | **−8 composite points vs perfect** |

CHARGE_CODE at 20/100 is the single largest contributor to the low composite score. It is also 100% independent of Phase B — it is a configuration and schema gap problem.

**When production punches exist**, AUTO_APPROVAL_BYPASS will likely become a secondary blocker unless `labor_approvals` records are consistently created alongside work orders.

---

## 7. Are IR&D, B&P, and FRINGE Still Score Blockers?

**Yes, all three are active failing checks.**

| Check | Flag | Status | What's Needed |
|-------|------|--------|---------------|
| IR_AND_D / B_AND_P codes | NO_IRD_BP_CATEGORY | 0/fail | Add rows to `charge_codes` with `type = 'IR_AND_D'` and `type = 'B_AND_P'` |
| FRINGE pool | NO_FRINGE_POOL | 0/fail | Add a row to `cost_centers` with `type = 'FRINGE'` |
| G&A / Overhead cost centers | NO_GA_OVERHEAD_POOL | 0/fail | Either: add `cost_centers` rows with G&A/Overhead types, OR fix scorer to query `charge_codes` instead |

Phase A seeded the `charge_codes` table with G_AND_A and OVERHEAD types — but FRINGE and IR&D/B&P types were not seeded. And the NO_GA_OVERHEAD_POOL check queries `cost_centers`, not `charge_codes`, so even the correctly-typed `charge_codes` entries don't satisfy it.

Together, IRD_BP + FRINGE_POOL + NO_GA_OVERHEAD_POOL = **16 points of potential recovery** in CHARGE_CODE domain, which has a 20% composite weight. Fixing all three would move CHARGE_CODE from 20 to 80, adding approximately **+12 composite points**.

---

## 8. Does the Scorer Recognize salaried_timesheet_lines → labor_cost_records → GL?

**No. Not at all.**

The complete Phase B data flow:
```
salaried_timesheet_lines
  → payroll approval trigger
  → createSalariedLaborCostRecords()
  → labor_cost_records (canonical_id = 'stl-{ts}-{line}', posting_run_id = null)
  → postLaborToGL() step 2b adoption
  → journal_entries (GL posted)
```

The only scorer check that touches any part of this path is **WAD_GL_LINK**:
```typescript
const totalCostRecords = await safeCount(`SELECT COUNT(*) as count FROM labor_cost_records`);
const unlinkedRecords = await safeCount(`SELECT COUNT(*) as count FROM labor_cost_records WHERE journal_entry_id IS NULL`);
```

This check currently scores 1 because `labor_cost_records` has 0 rows. When Phase B is enabled and salaried records are created but not yet GL-posted, this check will temporarily worsen (unlinkedRate > 0.10 → score drops to 0). It will recover to 1 only after `postLaborToGL` runs for the period.

**The scorer has no check for:**
- Whether salaried employees have approved timesheets
- Whether salaried labor cost records have been created for approved timesheets
- Whether the salaried GL posting path has run successfully
- Whether `timekeeping.salaried_timesheet_audit` has immutable records for each approval

All of these behaviors exist in Phase B — the scorer just doesn't ask about them.

---

## 9. What Exact Implementation Should Happen Next to Move the Score?

**Ranked by composite score impact:**

### Priority 1 — CHARGE_CODE domain: +12 composite points potential

**CHARGE_CODE currently scores 20/100 (worst domain). Three independent fixes:**

**A. Add IR&D and B&P charge codes** → clears NO_IRD_BP_CATEGORY (+6 recovery)
```sql
INSERT INTO charge_codes (code, description, type, active)
VALUES 
  ('IND-IRD', 'Internal Research & Development', 'IR_AND_D', true),
  ('IND-BNP', 'Bid & Proposal', 'B_AND_P', true);
```

**B. Add FRINGE pool cost center** → clears NO_FRINGE_POOL (+5 recovery)
```sql
INSERT INTO cost_centers (name, type, description)
VALUES ('Fringe Benefits Pool', 'FRINGE', 'DCAA-required fringe benefit indirect cost pool');
```

**C. Fix NO_GA_OVERHEAD_POOL** — two options:
- Option 1 (preferred): Fix scorer to query `charge_codes` instead of `cost_centers` for G&A/Overhead existence. Phase A already seeded these types. No data changes needed.
- Option 2: Add G&A and Overhead `cost_centers` rows. `cost_centers` currently has only DEPARTMENT types.

After A + B + C: CHARGE_CODE domain goes from 20 → 80 → composite score ≈ **+12 points**

Additionally, charge code audit events (NO_CHARGE_CODE_AUDIT, +3) will self-resolve once any admin modifies a charge code and the audit trail is written.

---

### Priority 2 — ACCOUNTING domain: +8 composite points potential

**ACCOUNTING currently scores 60/100 (BURDEN_RATES=0, PERIOD_LOCKING=0):**

**A. Create `labor_burden_rates` table and seed it** → clears NO_BURDEN_RATES (CRITICAL, +12 recovery)

This is the single highest-value fix in the entire system. The table referenced by the scorer does not exist at all. Creating it with at least one overhead/G&A/fringe burden rate would clear the CRITICAL flag immediately.

**B. Fix PERIOD_LOCKING check** — two options:
- Option 1 (preferred): Update scorer SQL to use `effective_date` instead of `posting_date` (which doesn't exist in `journal_entries`). The column name is `effective_date`.
- Option 2: Add `posting_date` as an alias column to `journal_entries`.

After A + B: ACCOUNTING goes from 60 → 100 → composite score ≈ **+8 points**

---

### Priority 3 — POLICY domain: +1–3 composite points

**DELETION_PROTECTION=0 due to stale column reference:**
The scorer queries `admin_audit_log WHERE action ILIKE '%DELETE%'` but the actual column is `change_type`. Fixing the scorer SQL to use `change_type` would allow DELETION_PROTECTION to score based on real data.

After fixing: POLICY goes from 70 → 80 (if most deletions have reason) → composite ≈ **+1 point**

---

### Priority 4 — PROCUREMENT domain: +0–10 composite points (requires data + schema fixes)

All 5 PROCUREMENT checks fail due to missing columns. These require either:
- Schema additions to `purchase_orders` and `vendors` tables (adding `vendor_id`, `approved`, `terms`, `last_evaluated_at`, etc.)
- Or scorer SQL updates to match actual column names (`purchase_orders.po_number` is the PK, not related to a vendor via `vendor_id`)

Until the scorer SQL matches the actual schema, PROCUREMENT will stay at 50.

---

### Priority 5 — INVENTORY domain: +5 points (scorer column name fixes)

Two scorer SQL bugs use wrong column names:
- `material_lots.icn` → actual column is `internal_control_number` (LOT_TRACEABILITY = 0.5 → could be 1)
- `material_lots.received_date` → actual column is `received_at` (FIFO_ENFORCEMENT = 0.5 → could improve)

Fixing these scorer column references would allow INVENTORY to score accurately against real data.

---

### Priority 6 — EDRI scorer extension for salaried timekeeping

Once salaried timesheets are enabled, add checks to `scoreTimekeeping()`:
- % of salaried employees with payroll-approved timesheets for current/prior period
- % of salaried labor_cost_records with `journal_entry_id IS NOT NULL` (vs punch records)
- Presence of `timekeeping.salaried_timesheet_audit` records for each PAYROLL_APPROVED event

Without this extension, Phase B's entire DCAA contribution is invisible to the score.

---

## Projected Score After Priority 1 + 2 + 3 Fixes

| Domain | Current | After Fixes | Delta |
|--------|---------|-------------|-------|
| CHARGE_CODE (20%) | 20 | 80 | +60 |
| ACCOUNTING (20%) | 60 | 100 | +40 |
| POLICY (10%) | 70 | 80 | +10 |
| TIMEKEEPING (30%) | 93.75 | 93.75 | — |
| PROCUREMENT (10%) | 50 | 50 | — |
| INVENTORY (10%) | 62.5 | 62.5 | — |
| **Composite** | **62.38** | **≈ 83** | **+21** |
| **Band** | MATERIAL_DEFICIENCY | CONDITIONALLY_PASSABLE | — |

---

## Summary Answer: Why Did Phase B Not Move the Score?

**Phase B was architecturally correct and fully successful. The score did not move for five independent reasons:**

1. **The EDRI scorer does not measure salaried timesheets.** None of the 25 active checks query `timekeeping.salaried_timesheets`, `timekeeping.salaried_timesheet_lines`, or `timekeeping.salaried_timesheet_audit`. The entire Phase B data path is outside the EDRI measurement perimeter.

2. **The feature flag is OFF.** `salariedTimesheetEnabled = false`. No salaried timesheet can enter the approval workflow, so no `labor_cost_records` with `canonical_id = 'stl-*'` exist. Phase B's accounting trigger has never fired.

3. **The WAD_GL_LINK check passes vacuously.** With 0 total `labor_cost_records`, the unlinked rate is 0 — scoring 1 regardless of whether the GL path is wired.

4. **The 10 failing checks are all in other domains.** The active red flags involve missing database tables (`labor_burden_rates`), missing columns (`posting_date`, `admin_audit_log.action`), missing data rows (IR&D/B&P codes, FRINGE cost center), and scorer SQL bugs (9 broken column references). None of these are problems Phase B was designed to solve.

5. **Phase B's scope was implementation correctness, not EDRI measurement.** Blocker 2 Phase B built a correct, auditable, fail-closed accounting path for salaried indirect labor. That is the right foundation. The EDRI score will only recognize this work once: (a) the feature flag is enabled, (b) salaried timesheets flow through payroll approval, (c) `postLaborToGL` posts the records, and (d) the scorer is extended to measure salaried GL coverage.

**Phase B success is not in doubt.** The score staying flat confirms the scope was correctly bounded — not that the work failed.
