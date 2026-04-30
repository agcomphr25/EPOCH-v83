# Task #305 — WAD + Charge Code + Department Attribution Bridge
## GL Posting Engine Implementation

**Date:** April 25, 2026  
**Scope:** Server-side only. No UI, traveler clock-in, payroll export, or legacy timekeeping routes were touched.

---

## Files Changed

| File | Change |
|------|--------|
| `server/schema.ts` | Added 4 nullable WAD attribution columns to `laborCostRecords` table |
| `server/src/services/laborCostingService.ts` | Carry forward 4 WAD fields from punch session into cost records |
| `server/src/services/laborPostingService.ts` | Compound-key WAD grouping, fail-closed validation, duplicate prevention |
| `server/src/routes/costAccounting.ts` | Expose `skippedAlreadyPosted` count in POST response |

---

## Schema Changes

### `labor_cost_records` — 4 nullable columns added

```sql
ALTER TABLE labor_cost_records
  ADD COLUMN IF NOT EXISTS production_work_order_id uuid,
  ADD COLUMN IF NOT EXISTS project_id              uuid,
  ADD COLUMN IF NOT EXISTS traveler_id             text,
  ADD COLUMN IF NOT EXISTS charge_code_id          integer;
```

All columns are nullable. Null means the punch session carried no WAD assignment (indirect / overhead time). Non-null `production_work_order_id` is the discriminating signal that a record is "WAD-linked".

### Drizzle schema (`server/schema.ts`)

```typescript
// WAD attribution — nullable; populated when punch session carries a work-order assignment
productionWorkOrderId: uuid('production_work_order_id'),
projectId:            uuid('project_id'),
travelerId:           text('traveler_id'),
chargeCodeId:         integer('charge_code_id'),
```

`insertLaborCostRecordSchema` and `InsertLaborCostRecord` are auto-regenerated from the table definition.

---

## Data Flow: Old vs New

### Old flow

```
punch_ledger
  └─ chargeCode (text snapshot)
  └─ department (text)
  └─ clockIn / clockOut
       │
       ▼
laborCostingService.processLaborCosts()
  └─ labor_cost_records
       • jobCode         ← chargeCode text snapshot
       • departmentCode  ← department
       • costType        ← DIRECT | OVERHEAD | G_AND_A
       (no WAD IDs preserved)
       │
       ▼
laborPostingService.postLaborToGL()
  └─ Group by costType only
  └─ 1 journal_entry per costType
  └─ journal_entry covers ALL DIRECT records regardless of WAD
```

### New flow

```
punch_ledger
  └─ chargeCode (text snapshot)    → jobCode
  └─ chargeCodeId (FK integer)     → charge_code_id  ← NEW
  └─ department (text)             → departmentCode
  └─ productionWorkOrderId (uuid)  → production_work_order_id  ← NEW
  └─ projectId (uuid)              → project_id  ← NEW
  └─ travelerId (text FK)          → traveler_id  ← NEW
  └─ clockIn / clockOut
       │
       ▼
laborCostingService.processLaborCosts()
  └─ labor_cost_records
       • jobCode / departmentCode / costType (unchanged)
       • productionWorkOrderId  ← copied from session
       • projectId              ← copied from session
       • travelerId             ← copied from session
       • chargeCodeId           ← copied from session
       │
       ▼
laborPostingService.postLaborToGL()
  └─ Split: WAD-linked (productionWorkOrderId IS NOT NULL)
  │         vs non-WAD  (productionWorkOrderId IS NULL)
  │
  ├─ Non-WAD path (unchanged):
  │    Group by costType
  │    1 journal_entry per cost type
  │
  └─ WAD path (new):
       Fail-closed: reject if chargeCodeId or projectId is null
       Group by compound key:
         (costType, chargeCodeId, productionWorkOrderId, projectId, departmentCode)
       1 journal_entry per unique combination
       Stamp UPDATE uses all 5 key conditions to avoid cross-bucket contamination
```

---

## Posting Grouping Logic

### Non-WAD records (indirect / overhead)

Groups by `costType` → one journal entry per type.  
Accounts used: `directLaborAccountId` / `overheadLaborAccountId` / `gaLaborAccountId`.  
Credit always goes to `accruedPayrollAccountId`.

Stamp condition:
```sql
WHERE posting_run_id = $runId
  AND cost_type      = $costType
  AND production_work_order_id IS NULL
  AND journal_entry_id IS NULL
```

### WAD-linked records (direct production hours)

Groups by the **full compound key** — five dimensions:

| Dimension | Rationale |
|-----------|-----------|
| `costType` | DIRECT (WAD hours) vs any edge-case classification |
| `chargeCodeId` | Different charge codes → separate GL lines |
| `productionWorkOrderId` | Same charge code on different work orders → separate lines |
| `projectId` | Same WAD across different projects is theoretically impossible but guarded |
| `departmentCode` | Labor carried to different departments must not be collapsed |

Journal entry memo format:
```
Labor cost posting: WAD | cc=<chargeCodeId> | wad=<wad-uuid> | proj=<project-uuid> | dept=<deptCode> | DIRECT | 2026-04
```

Stamp condition:
```sql
WHERE posting_run_id          = $runId
  AND production_work_order_id = $wad      -- IS NOT NULL guard implicit
  AND project_id               = $projectId
  AND charge_code_id           = $chargeCodeId
  AND cost_type                = $costType
  AND department_code          = $deptCode  -- or IS NULL if deptCode is null
  AND journal_entry_id IS NULL
```

---

## Fail-Closed Rules

### Rule 1 — WAD record missing chargeCodeId

A WAD-linked record (productionWorkOrderId non-null) with `chargeCodeId = null` cannot be attributed to a specific GL bucket. Posting is **aborted before any DB writes** with an error listing each offending record ID and punch canonical ID.

### Rule 2 — WAD record missing projectId

Same as Rule 1. `projectId = null` on a WAD-linked record means we cannot form the compound grouping key. Posting aborted with details.

### Rule 3 — productionWorkOrderId is implicitly non-null for WAD path

Records reach the WAD path only because `productionWorkOrderId IS NOT NULL`. No explicit check needed.

### Rule 4 — All three required fields or none at all

The error message identifies which field(s) are missing per record:
```
Cannot post labor for 2026-04: 2 WAD-linked cost record(s) have incomplete GL attribution.
Resolve the missing fields at punch-in time before posting:
  record 412 (punch pl-2918): missing chargeCodeId
  record 413 (punch pl-2919): missing chargeCodeId, projectId
```

---

## Duplicate Posting Prevention

Records already carrying a `journal_entry_id` are excluded from the current posting run at load time:

```typescript
const skippedAlreadyPosted = allRecords.filter((r) => r.journalEntryId != null).length;
const records = allRecords.filter((r) => r.journalEntryId == null);
```

Additionally, the stamp `UPDATE` includes `AND journal_entry_id IS NULL` so a concurrent process cannot double-stamp. If all records in a period are already stamped, posting aborts with a clear message rather than silently succeeding with no journal entries.

The primary guard remains the run-level `status = 'POSTED'` check (returns HTTP 409 before any queries). The record-level guard handles partial-run recovery scenarios.

---

## Validation / Tests Run

| Check | Result |
|-------|--------|
| DB `ALTER TABLE` applied (`production_work_order_id`, `project_id`, `traveler_id`, `charge_code_id`) | ✅ Confirmed via `information_schema.columns` |
| All 4 columns `IS_NULLABLE = YES` | ✅ |
| `punchLedger` source column types match `labor_cost_records` target types | ✅ (uuid↔uuid, integer↔integer, text↔text) |
| `isNull` / `isNotNull` imported from `drizzle-orm` | ✅ |
| Route caller backward-compatible (additive return field) | ✅ |
| No existing automated tests for labor posting (test gap filed as follow-up) | N/A |
| UI, traveler flow, payroll export, legacy timekeeping untouched | ✅ Verified by file scope |

---

## Remaining Risks

### 1. Charge code / project not assigned at punch-in
If operators punch into a WAD without selecting a charge code (or if the WAD is not linked to a project), the posting will be blocked for the whole period. Remediation: enforce charge code selection as mandatory for WAD punches at the kiosk/traveler clock-in layer (separate task).

### 2. No automated regression tests
The WAD grouping logic and fail-closed path have no unit tests. A future refactor could silently revert to costType-only grouping. A dedicated test suite (`server/__tests__/laborPostingWadGuard.test.ts`) should be written.

### 3. WAD records with mismatched cost type within a charge code
If two employees punch the same charge code / WAD, one classified as DIRECT and one as OVERHEAD (edge case from department fallback), they will produce two separate journal entries even though they share a WAD. This is correct GL behaviour but may surprise operators reviewing the journal.

### 4. Partial-run recovery not fully exercised
The `journal_entry_id IS NULL` record guard handles mid-transaction failures, but `voidLaborPosting` does not restore the run to `CALCULATED` — it moves to `VOIDED`. Recovery after a partial failure currently requires a void + recalculate cycle.

### 5. departmentCode NULL grouping
Records with no `departmentCode` group together under a shared `null` bucket. If different employees have no department code but different WADs, they are correctly separated by `productionWorkOrderId`. The null-department group only collapses records that share all other four key dimensions.
