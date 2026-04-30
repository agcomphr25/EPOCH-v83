# BLOCKER 2 PHASE A — IMPLEMENTATION RECORD
## Seed Charge Codes + Reconcile Salaried Timesheet Schema

**Date:** April 25, 2026  
**Status:** COMPLETE — all validations pass  
**Tests:** 425/425 client tests passing, 0 failures  
**Feature flag:** `salariedTimesheetEnabled = false` (unchanged)

---

## Exact Files Changed

| File | Change |
|------|--------|
| `server/index.ts` | Added Blocker 2 Phase A migration block (lines 1479–1574) — idempotent, runs at server startup |
| `server/src/schema/timekeeping.ts` | Added `chargeCodeId` to `indirectCodesTable`; added `indirectCodeLegacy` to `salariedTimesheetLinesTable` |
| `server/src/services/timekeeping/salariedTimesheet.service.ts` | Rewrote `injectHolidayLines`, `injectApprovedPTO`, added `loadIndirectCodeMap`, `requireIndirectCode`, `LEAVE_TYPE_TO_INDIRECT_CODE` |

**Files NOT changed (strict scope):**

```
server/src/services/laborPostingService.ts      — untouched
server/src/services/laborCostingService.ts      — untouched
server/src/lib/resolveChargeCode.ts             — untouched
server/src/lib/punchLedger.ts                   — untouched
server/src/routes/costAccounting.ts             — untouched
server/src/services/timekeeping/leave.service.ts — untouched
server/src/services/timekeeping/timeoff.service.ts — untouched
server/schema.ts (public schema)                — untouched
```

---

## Charge Codes Seeded

15 rows inserted into `public.charge_codes` (`ON CONFLICT (code) DO NOTHING`):

| Code | Description | Type | Billable | Requires Approval |
|------|-------------|------|----------|-------------------|
| IND-HOLIDAY | Company Holiday — Overhead Pool | OVERHEAD | false | false |
| IND-PTO | Paid Time Off — Overhead Pool | OVERHEAD | false | **true** |
| IND-SICK | Sick Leave — Overhead Pool | OVERHEAD | false | **true** |
| IND-TRAINING | Training & Development — Overhead Pool | OVERHEAD | false | false |
| IND-INDIRECT | General Indirect — Overhead Pool | OVERHEAD | false | false |
| IND-UNALLOC | Unallocated — Overhead Pool | OVERHEAD | false | false |
| IND-SUPERVISION | Supervision/Management — Overhead Pool | OVERHEAD | false | false |
| IND-MAINT | Machine Maintenance — Overhead Pool | OVERHEAD | false | false |
| IND-SAFETY | Safety Meeting — Overhead Pool | OVERHEAD | false | false |
| IND-QUALITY_REVIEW | Quality Review — Overhead Pool | OVERHEAD | false | false |
| IND-INTERNAL_ENG | Internal Engineering — Overhead Pool | OVERHEAD | false | false |
| IND-FACILITY | Facility/Shop Support — Overhead Pool | OVERHEAD | false | false |
| IND-ADMIN | Administrative — G&A Pool | G_AND_A | false | false |
| IND-G_AND_A | General & Administrative — G&A Pool | G_AND_A | false | false |
| IND-PROPOSAL | Proposal/Estimating B&P — G&A Pool | G_AND_A | false | **true** |

**Naming convention:** `IND-<INDIRECT_CODE>` — uniquely namespaced to avoid collision with any future WAD direct labor charge codes.

---

## Indirect Code → Charge Code Mapping (Live DB Confirmed)

All 15 active indirect codes mapped to a charge code. Zero unmapped rows.

| indirect_codes.code | charge_codes.code | charge_codes.type |
|--------------------|--------------------|-------------------|
| HOLIDAY | IND-HOLIDAY | OVERHEAD |
| PTO | IND-PTO | OVERHEAD |
| SICK | IND-SICK | OVERHEAD |
| TRAINING | IND-TRAINING | OVERHEAD |
| ADMIN | IND-ADMIN | G_AND_A |
| INDIRECT | IND-INDIRECT | OVERHEAD |
| UNALLOC | IND-UNALLOC | OVERHEAD |
| G_AND_A | IND-G_AND_A | G_AND_A |
| SUPERVISION | IND-SUPERVISION | OVERHEAD |
| MAINT | IND-MAINT | OVERHEAD |
| SAFETY | IND-SAFETY | OVERHEAD |
| QUALITY_REVIEW | IND-QUALITY_REVIEW | OVERHEAD |
| PROPOSAL | IND-PROPOSAL | G_AND_A |
| INTERNAL_ENG | IND-INTERNAL_ENG | OVERHEAD |
| FACILITY | IND-FACILITY | OVERHEAD |

`timekeeping.indirect_codes.charge_code_id` is `NOT NULL` — enforced at the DB level. Any future indirect code inserted without a charge code mapping will be rejected.

---

## Schema Columns Added

### `timekeeping.indirect_codes` (1 column added)

| Column | Type | Constraint | Notes |
|--------|------|-----------|-------|
| `charge_code_id` | INTEGER | NOT NULL, FK → public.charge_codes(id) | Authoritative accounting mapping |

### `timekeeping.salaried_timesheet_lines` (10 columns added)

| Column | Type | Notes |
|--------|------|-------|
| `indirect_code_legacy` | TEXT, nullable | Renamed from old `indirect_code TEXT` — preserves any future legacy data for audit |
| `indirect_code_id` | INTEGER, nullable, FK → indirect_codes(id) | FK-backed label reference |
| `charge_code_id` | INTEGER, nullable, FK → charge_codes(id) | Authoritative accounting classification |
| `project_id` | INTEGER, nullable | Future WAD linkage |
| `traveler_id` | INTEGER, nullable | Future WAD linkage |
| `leave_entry_id` | INTEGER, nullable | Links injected PTO lines to source leave_entries |
| `source` | TEXT, NOT NULL, DEFAULT 'MANUAL' | Injection source: MANUAL, HOLIDAY_AUTO, PTO_IMPORT |
| `created_by` | INTEGER, nullable | Actor audit trail |
| `updated_by` | INTEGER, nullable | Actor audit trail |
| `updated_at` | TIMESTAMPTZ, NOT NULL, DEFAULT NOW() | Update timestamp |

**Live DB column list after reconciliation (confirmed):**

```
id, timesheet_id, date, line_type, indirect_code_legacy, hours, note, is_locked,
created_at, indirect_code_id, charge_code_id, project_id, traveler_id,
leave_entry_id, source, created_by, updated_by, updated_at
```

18 columns total. Row count: 0 (no data at risk).

---

## Drizzle Schema Changes

### `indirectCodesTable` (`server/src/schema/timekeeping.ts`)

Added:
```typescript
chargeCodeId: integer("charge_code_id").notNull(),
```

### `salariedTimesheetLinesTable`

Added:
```typescript
indirectCodeLegacy: text("indirect_code_legacy"),
```

All other columns (`chargeCodeId`, `indirectCodeId`, `projectId`, `travelerId`, `leaveEntryId`, `source`, `createdBy`, `updatedBy`, `updatedAt`) were already defined in the Drizzle schema — they simply didn't exist in the live DB until this migration. They are now in sync.

---

## Service Logic Changes

### `server/src/services/timekeeping/salariedTimesheet.service.ts`

#### New: `LEAVE_TYPE_TO_INDIRECT_CODE` constant

```typescript
const LEAVE_TYPE_TO_INDIRECT_CODE: Record<string, string> = {
  pto:         "PTO",
  sick:        "SICK",
  holiday:     "HOLIDAY",
  bereavement: "SICK",    // no BEREAVEMENT code yet; closest pool is SICK overhead
  other:       "INDIRECT",
};
```

Maps `leave_entries.leaveType` → `indirect_codes.code`. This is the single canonical table for leave-type → accounting pool routing.

#### New: `loadIndirectCodeMap()` — fail-closed loader

Loads all active indirect codes into a `Map<code, {id, chargeCodeId}>`. Throws immediately if **any** active indirect code is missing its `chargeCodeId` — prevents the timesheet service from running in a misconfigured state.

#### New: `requireIndirectCode()` — fail-closed resolver

Throws a descriptive error if the requested indirect code is not in the loaded map. No silent fallback to text labels.

#### Updated: `injectHolidayLines()`

- Calls `loadIndirectCodeMap()` at the start
- Resolves HOLIDAY indirect code via `requireIndirectCode(map, "HOLIDAY", ...)`
- Every new HOLIDAY line written includes:
  - `indirectCodeId: holidayCode.id`
  - `chargeCodeId: holidayCode.chargeCodeId`
  - `source: "HOLIDAY_AUTO"`
- Existing lines that already exist are returned without re-writing (idempotent check)

#### Updated: `injectApprovedPTO()`

- Calls `loadIndirectCodeMap()` at the start (one DB round-trip for all leave entries)
- For each leave entry, derives the indirect code via `LEAVE_TYPE_TO_INDIRECT_CODE[leaveType]`
- Calls `requireIndirectCode()` — throws if not found
- Every new line written includes:
  - `indirectCodeId: resolved.id`
  - `chargeCodeId: resolved.chargeCodeId`
  - `source: "PTO_IMPORT"`
  - `leaveEntryId: entry.id`
  - `lineType: "HOLIDAY"` for holiday leave, `"PTO"` for all others
- Sick leave correctly routes to `IND-SICK` (OVERHEAD) — no more PTO misclassification

#### Unchanged: `getIndirectCodes()`

Returns the full `indirectCodesTable.$inferSelect` shape, which now includes `chargeCodeId` automatically. No query change needed — the column is now present in both DB and Drizzle schema.

---

## Fail-Closed Protections

Three independent layers are now in place:

**Layer 1 — DB constraint:** `timekeeping.indirect_codes.charge_code_id NOT NULL` + FK → `public.charge_codes(id)`. An indirect code without a valid charge code mapping cannot be inserted at the DB level.

**Layer 2 — Service guard (`loadIndirectCodeMap`):** If any active indirect code is returned without a `chargeCodeId` at runtime (impossible given layer 1, but defensive), `loadIndirectCodeMap` throws before any injection begins. No partial injection possible.

**Layer 3 — Service guard (`requireIndirectCode`):** If a leave type maps to an indirect code that doesn't exist in the loaded map (e.g., a newly added leave type with no mapping in `LEAVE_TYPE_TO_INDIRECT_CODE`), injection fails with a descriptive error naming the missing code and the affected leave entry. No silent fallback to INDIRECT or any other code.

**Effect:** Any salaried timesheet line that goes through the injection path is guaranteed to have both `indirectCodeId` and `chargeCodeId` set. A line that cannot resolve these fields does not get written.

---

## Validation Results

| # | Check | Result |
|---|-------|--------|
| 1 | public.charge_codes seeded correctly | ✅ 15 IND-* rows, correct types and billable flags |
| 2 | All 15 indirect codes resolve to chargeCodeId | ✅ 15/15 mapped, 0 NULL |
| 3 | salaried_timesheet_lines live DB matches Drizzle schema | ✅ 18 columns confirmed |
| 4 | injectHolidayLines writes indirectCodeId + chargeCodeId | ✅ Code confirmed; DB write path verified |
| 5 | injectApprovedPTO writes indirectCodeId + chargeCodeId per leave type | ✅ Code confirmed; leave type map verified |
| 6 | Feature flag remains false | ✅ salaried_timesheet_enabled = false |
| 7 | No existing traveler/timeclock/direct labor behavior changed | ✅ 0 GL posting files touched |
| 8 | Server starts clean | ✅ No migration errors |
| 9 | Client tests pass | ✅ 425/425 passing, 0 failures |
| 10 | charge_code_id NOT NULL enforced | ✅ is_nullable = NO confirmed |

---

## Remaining Risks

| Risk | Severity | Notes |
|------|----------|-------|
| Salaried timesheets still have no GL posting path | HIGH | By design for Phase 1. The charge code mapping is now in place as a prerequisite for the future salaried → GL pipeline. |
| BEREAVEMENT leave maps to IND-SICK (OVERHEAD) | LOW | No BEREAVEMENT indirect code exists. SICK is the closest correct pool per FAR 31.203. Can be separated later by adding an IND-BEREAVEMENT charge code and updating the constant. |
| `leave_entries` still has no charge code — only text leaveType | LOW | The mapping happens at injection time in the service. The leave entry itself does not need a charge code; the line does, and the line gets it. |
| Admin UI for indirect codes has no charge code display | LOW | GET /indirect-codes returns chargeCodeId in the response (it's now in the schema). UI update is a Phase 2 concern. |
| `salaried_timesheet_lines.date` is DATE in DB, text in Drizzle | LOW | Pre-existing. Drizzle coerces DATE to string at read time — no runtime issue. Can be aligned in a future migration. |
| No uniqueness constraint on (timesheetId, date, lineType) | LOW | Pre-existing. Injection checks for existing lines before inserting. |

---

## Whether Phase B Can Begin

**Phase B can begin on instruction.**

Phase A prerequisites are fully satisfied:
- Every indirect code has an authoritative `chargeCodeId` mapping
- Every auto-injected HOLIDAY and PTO line will carry `chargeCodeId`
- The `salaried_timesheet_lines` schema is reconciled and all expected columns exist
- The Drizzle schema is in sync with the live DB
- The feature flag is off — no traffic exposure

Phase B (manual line editing, salaried certification, GL posting pipeline) should not begin until explicitly instructed.
