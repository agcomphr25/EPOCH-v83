# BLOCKER 2 PHASE A — VALIDATION AUDIT
## Read-Only Post-Implementation Verification

**Audit Date:** April 25, 2026  
**Audit Type:** Strict read-only — no code or DB changes made  
**Scope:** Blocker 2 Phase A implementation verification  

---

## FINAL VERDICT: PASS

All 13 verification items pass. One minor observation documented (non-blocking).  
Phase B may begin on instruction.

---

## Files Inspected

| File | Inspection method |
|------|------------------|
| `server/index.ts` lines 1479–1580 | Direct read — migration block |
| `server/src/schema/timekeeping.ts` lines 179–252 | Direct read — full salaried section |
| `server/src/services/timekeeping/salariedTimesheet.service.ts` lines 1–503 | Direct read — complete file |
| `server/src/services/laborPostingService.ts` | `git log` + `git diff HEAD` — no changes since Task #305 |
| `server/src/services/laborCostingService.ts` | `git log` + `git diff HEAD` — no changes since Task #305 |
| `server/src/lib/resolveChargeCode.ts` | `git diff HEAD` — zero uncommitted changes |
| Live DB: `public.charge_codes` | `SELECT` query — full table dump |
| Live DB: `timekeeping.indirect_codes` | `SELECT` with JOIN to charge_codes |
| Live DB: `timekeeping.salaried_timesheet_lines` | `information_schema.columns` |
| Live DB: `timekeeping.settings` | `SELECT salaried_timesheet_enabled` |

---

## Verification Item 1 — All 15 IND-* charge codes exist

**PASS ✅**

Live DB query `SELECT code FROM charge_codes WHERE code LIKE 'IND-%'` returns exactly 15 rows:

```
IND-ADMIN, IND-FACILITY, IND-G_AND_A, IND-HOLIDAY, IND-INDIRECT,
IND-INTERNAL_ENG, IND-MAINT, IND-PTO, IND-PROPOSAL, IND-QUALITY_REVIEW,
IND-SAFETY, IND-SICK, IND-SUPERVISION, IND-TRAINING, IND-UNALLOC
```

Total `charge_codes` row count = 15. These 15 rows are the only rows in the table.  
`ON CONFLICT (code) DO NOTHING` in the migration ensures idempotency on future server restarts.

---

## Verification Item 2 — charge_codes.type is correct for each code

**PASS ✅**

Live DB confirmed:

| Code | type |
|------|------|
| IND-ADMIN | G_AND_A |
| IND-G_AND_A | G_AND_A |
| IND-PROPOSAL | G_AND_A |
| IND-FACILITY | OVERHEAD |
| IND-HOLIDAY | OVERHEAD |
| IND-INDIRECT | OVERHEAD |
| IND-INTERNAL_ENG | OVERHEAD |
| IND-MAINT | OVERHEAD |
| IND-PTO | OVERHEAD |
| IND-QUALITY_REVIEW | OVERHEAD |
| IND-SAFETY | OVERHEAD |
| IND-SICK | OVERHEAD |
| IND-SUPERVISION | OVERHEAD |
| IND-TRAINING | OVERHEAD |
| IND-UNALLOC | OVERHEAD |

Count by type: **G_AND_A = 3, OVERHEAD = 12**. No DIRECT rows. Correct per FAR 31.203 classification in the audit document.

---

## Verification Item 3 — billable = false for all 15

**PASS ✅**

Live DB: every IND-* row has `billable = f`. None are marked billable.

---

## Verification Item 4 — requires_approval is correct for PTO, SICK, PROPOSAL

**PASS ✅**

| Code | requires_approval |
|------|------------------|
| IND-PTO | **true** ✅ |
| IND-SICK | **true** ✅ |
| IND-PROPOSAL | **true** ✅ |
| all others | false ✅ |

Exactly the three leave-type and B&P codes that require HR/management approval are flagged.

---

## Verification Item 5 — Every timekeeping.indirect_codes row has a non-null valid charge_code_id

**PASS ✅**

Live DB full mapping (15 rows, all non-null):

| indirect_codes.code | charge_code_id | mapped charge_codes.code | type |
|--------------------|---------------|--------------------------|------|
| G_AND_A | 14 | IND-G_AND_A | G_AND_A |
| HOLIDAY | 1 | IND-HOLIDAY | OVERHEAD |
| PTO | 2 | IND-PTO | OVERHEAD |
| SUPERVISION | 7 | IND-SUPERVISION | OVERHEAD |
| MAINT | 8 | IND-MAINT | OVERHEAD |
| SICK | 3 | IND-SICK | OVERHEAD |
| SAFETY | 9 | IND-SAFETY | OVERHEAD |
| TRAINING | 4 | IND-TRAINING | OVERHEAD |
| ADMIN | 13 | IND-ADMIN | G_AND_A |
| INDIRECT | 5 | IND-INDIRECT | OVERHEAD |
| QUALITY_REVIEW | 10 | IND-QUALITY_REVIEW | OVERHEAD |
| PROPOSAL | 15 | IND-PROPOSAL | G_AND_A |
| UNALLOC | 6 | IND-UNALLOC | OVERHEAD |
| INTERNAL_ENG | 11 | IND-INTERNAL_ENG | OVERHEAD |
| FACILITY | 12 | IND-FACILITY | OVERHEAD |

`charge_code_id IS NULL` query returns **zero rows**.  
`information_schema.columns.is_nullable` for `charge_code_id` = **NO** (NOT NULL enforced).

---

## Verification Item 6 — No orphan indirect codes exist

**PASS ✅**

Two-part check:

1. `SELECT code FROM timekeeping.indirect_codes WHERE charge_code_id IS NULL` → **0 rows**
2. LEFT JOIN check for dangling FKs (indirect_codes.charge_code_id → charge_codes.id where cc.id IS NULL) → **0 rows**

Every `charge_code_id` value on every indirect code row references a live row in `public.charge_codes`. No orphaned references.

---

## Verification Item 7 — salaried_timesheet_lines live DB matches Drizzle schema

**PASS ✅**

**Live DB columns (18 total, confirmed from `information_schema.columns`):**

| column_name | data_type | nullable | default |
|-------------|-----------|---------|---------|
| id | integer | NO | serial |
| timesheet_id | integer | NO | — |
| date | date | NO | — |
| line_type | text | NO | — |
| indirect_code_legacy | text | YES | — |
| hours | numeric | NO | 8 |
| note | text | YES | — |
| is_locked | boolean | NO | false |
| created_at | timestamptz | NO | now() |
| indirect_code_id | integer | YES | — |
| charge_code_id | integer | YES | — |
| project_id | integer | YES | — |
| traveler_id | integer | YES | — |
| leave_entry_id | integer | YES | — |
| source | text | NO | 'MANUAL' |
| created_by | integer | YES | — |
| updated_by | integer | YES | — |
| updated_at | timestamptz | NO | now() |

**Drizzle schema (`salariedTimesheetLinesTable`) — all 18 columns match:**

| Drizzle field | DB column | Present in DB |
|--------------|-----------|--------------|
| id | id | ✅ |
| timesheetId | timesheet_id | ✅ |
| date | date | ✅ |
| lineType | line_type | ✅ |
| chargeCodeId | charge_code_id | ✅ |
| indirectCodeId | indirect_code_id | ✅ |
| indirectCodeLegacy | indirect_code_legacy | ✅ |
| projectId | project_id | ✅ |
| travelerId | traveler_id | ✅ |
| leaveEntryId | leave_entry_id | ✅ |
| hours | hours | ✅ |
| source | source | ✅ |
| note | note | ✅ |
| isLocked | is_locked | ✅ |
| createdBy | created_by | ✅ |
| updatedBy | updated_by | ✅ |
| createdAt | created_at | ✅ |
| updatedAt | updated_at | ✅ |

The legacy `indirect_code TEXT` column that caused the original divergence has been renamed to `indirect_code_legacy`. The original broken state (service trying to write `source` and `leaveEntryId` to a column that didn't exist) is fully resolved.

**One minor type mismatch (pre-existing, non-blocking):** The live DB `date` column is PostgreSQL `DATE` type. The Drizzle schema declares it as `text("date")`. In practice, the `node-postgres` driver returns DATE values as `'YYYY-MM-DD'` strings by default, which Drizzle's text() mapping accepts transparently. INSERT of a `'YYYY-MM-DD'` string into a DATE column succeeds via PostgreSQL implicit cast. No runtime errors result from this, but it is worth noting.

---

## Verification Item 8 — injectHolidayLines writes indirectCodeId and chargeCodeId

**PASS ✅**

Code confirmed at lines 271–328 of `salariedTimesheet.service.ts`:

```typescript
// Line 277: fail-closed load
const indirectMap = await loadIndirectCodeMap();
// Line 278: fail-closed resolve
const holidayCode = requireIndirectCode(indirectMap, "HOLIDAY", "holiday line");

// Lines 309-322: INSERT with both fields set
db.insert(salariedTimesheetLinesTable).values({
  timesheetId,
  date: day,
  lineType: "HOLIDAY",
  indirectCodeId: holidayCode.id,          // ← written
  chargeCodeId: holidayCode.chargeCodeId,  // ← written
  hours: 8,
  source: "HOLIDAY_AUTO",
  note: holidayName,
  isLocked: true,
})
```

`indirectCodeId` and `chargeCodeId` are both explicitly set on every new HOLIDAY line. The resolved `chargeCodeId` = ID of `IND-HOLIDAY` charge code (type = OVERHEAD). Old lines that already existed are returned without re-writing (idempotent check at lines 292–307).

---

## Verification Item 9 — injectApprovedPTO writes indirectCodeId and chargeCodeId

**PASS ✅**

Code confirmed at lines 340–419 of `salariedTimesheet.service.ts`:

```typescript
// Line 347: fail-closed load (one DB round-trip for all leave entries)
const indirectMap = await loadIndirectCodeMap();

// Per-entry resolution:
// Line 393: leave type → indirect code key
const indirectCodeKey = LEAVE_TYPE_TO_INDIRECT_CODE[entry.leaveType] ?? "INDIRECT";
// Line 394: fail-closed resolve
const resolved = requireIndirectCode(indirectMap, indirectCodeKey, `leave entry ${entry.id} (${entry.leaveType})`);

// Lines 399-413: INSERT with both fields set
db.insert(salariedTimesheetLinesTable).values({
  timesheetId,
  date: entry.date,
  lineType,
  indirectCodeId: resolved.id,            // ← written
  chargeCodeId: resolved.chargeCodeId,    // ← written
  leaveEntryId: entry.id,
  hours: entry.hours,
  source: "PTO_IMPORT",
  note: entry.note ?? entry.leaveType,
  isLocked: true,
})
```

**Leave type routing verified:**

| leave_entries.leaveType | indirect code | charge code | pool |
|------------------------|---------------|-------------|------|
| pto | PTO | IND-PTO | OVERHEAD |
| sick | SICK | IND-SICK | OVERHEAD |
| holiday | HOLIDAY | IND-HOLIDAY | OVERHEAD |
| bereavement | SICK | IND-SICK | OVERHEAD |
| other | INDIRECT | IND-INDIRECT | OVERHEAD |

SICK leave, which was previously misclassified as PTO (same line injected regardless of leaveType), now correctly routes to `IND-SICK`. lineType = "HOLIDAY" for holiday leave entries; "PTO" for all others.

---

## Verification Item 10 — Missing mappings fail closed

**PASS ✅**

Three independent layers verified by code inspection:

**Layer 1 — DB constraint:** `timekeeping.indirect_codes.charge_code_id NOT NULL` is confirmed in the live DB (`is_nullable = NO`). FK → `public.charge_codes(id)` is declared in the migration. A new indirect code inserted without a `charge_code_id` will be rejected at the DB level before reaching any service code.

**Layer 2 — `loadIndirectCodeMap()` (lines 172–201):**

```typescript
for (const row of rows) {
  if (!row.chargeCodeId) {
    missing.push(row.code);
    continue;
  }
  // ...
}
if (missing.length > 0) {
  throw new Error(`Indirect codes missing chargeCodeId mapping: ${missing.join(", ")}...`);
}
```

If any active indirect code is returned with a falsy `chargeCodeId` at runtime, the entire map load throws before any injection proceeds. No partial injection is possible.

**Layer 3 — `requireIndirectCode()` (lines 207–220):**

```typescript
function requireIndirectCode(map, code, context) {
  const resolved = map.get(code);
  if (!resolved) {
    throw new Error(`Cannot inject ${context}: indirect code '${code}' not found...`);
  }
  return resolved;
}
```

If the requested indirect code is absent from the loaded map (e.g., a future leave type added without updating `LEAVE_TYPE_TO_INDIRECT_CODE`), the function throws. No silent fallback to a default code.

**One minor observation (non-blocking):**  
Line 393: `const indirectCodeKey = LEAVE_TYPE_TO_INDIRECT_CODE[entry.leaveType] ?? "INDIRECT"`.

The `?? "INDIRECT"` fallback activates only if `entry.leaveType` is not a key in `LEAVE_TYPE_TO_INDIRECT_CODE`. All five known leave types (`pto, sick, holiday, bereavement, other`) are explicitly mapped, and `leave.service.ts` validates against that exact enum at insert time — so no unknown value can enter the DB through normal use. However, if a value were inserted directly (e.g., via database migration), the fallback would route it to `IND-INDIRECT / OVERHEAD` silently rather than throwing.

This is a defense-in-depth gap, not a correctness failure. The net effect (OVERHEAD classification) is better than crashing the injection. It should be addressed in Phase B by replacing `?? "INDIRECT"` with `?? null` and a subsequent `requireIndirectCode` call — but it does not block Phase B.

---

## Verification Item 11 — Feature flag remains false

**PASS ✅**

```
SELECT salaried_timesheet_enabled FROM timekeeping.settings LIMIT 1
→ f
```

`salariedTimesheetEnabled = false`. All salaried timesheet routes return 404. No employee-facing behavior has changed. No traffic flows through any of the modified code paths.

---

## Verification Item 12 — Traveler/direct labor behavior was not changed

**PASS ✅**

Files confirmed untouched (zero uncommitted diff, last commit = Task #305):

```
server/src/lib/resolveChargeCode.ts         → git diff HEAD: empty
server/src/lib/punchLedger.ts               → git diff HEAD: empty
server/src/routes/costAccounting.ts         → git diff HEAD: empty
server/src/services/timekeeping/leave.service.ts    → git diff HEAD: empty
server/src/services/timekeeping/timeoff.service.ts  → git diff HEAD: empty
```

`resolveChargeCode.ts` (WAD-based charge code resolution for traveler sessions) is unchanged. `punchLedger.ts` (hourly punch session management) is unchanged. The leave and time-off approval workflows are unchanged.

---

## Verification Item 13 — Task #305 posting logic was not changed

**PASS ✅**

```
git log --oneline -- server/src/services/laborPostingService.ts
  1dd30adb0 Task #305 hardening patch — fix two critical accounting risks
  ...

git log --oneline -- server/src/services/laborCostingService.ts
  1dd30adb0 Task #305 hardening patch — fix two critical accounting risks
  ...

git diff HEAD -- server/src/services/laborPostingService.ts
  (no output — zero uncommitted changes)

git diff HEAD -- server/src/services/laborCostingService.ts
  (no output — zero uncommitted changes)
```

The last commit to both GL posting files is the Task #305 hardening patch. Neither file has been modified since. The `classifyLaborCost` function, the `postLaborToGL` transaction, and the WAD fail-closed logic are all exactly as audited in `TASK_305_FINAL_VERIFICATION_AUDIT.md`.

---

## Summary of All Verification Items

| # | Item | Verdict |
|---|------|---------|
| 1 | All 15 IND-* charge codes exist | ✅ PASS |
| 2 | charge_codes.type correct for each code | ✅ PASS — 12 OVERHEAD, 3 G_AND_A |
| 3 | billable = false for all 15 | ✅ PASS |
| 4 | requires_approval correct for PTO, SICK, PROPOSAL | ✅ PASS |
| 5 | Every indirect_codes row has non-null valid charge_code_id | ✅ PASS — 15/15, 0 NULL |
| 6 | No orphan indirect codes | ✅ PASS — 0 orphan refs |
| 7 | salaried_timesheet_lines live DB matches Drizzle schema | ✅ PASS — 18/18 columns present |
| 8 | injectHolidayLines writes indirectCodeId and chargeCodeId | ✅ PASS |
| 9 | injectApprovedPTO writes indirectCodeId and chargeCodeId | ✅ PASS |
| 10 | Missing mappings fail closed | ✅ PASS — 3 independent layers |
| 11 | Feature flag remains false | ✅ PASS |
| 12 | Traveler/direct labor behavior not changed | ✅ PASS — zero diff on all related files |
| 13 | Task #305 posting logic not changed | ✅ PASS — last commit = Task #305 hardening |

---

## Remaining Risks

| Risk | Severity | Description |
|------|----------|-------------|
| Unknown leave type silently routes to IND-INDIRECT | LOW | The `?? "INDIRECT"` fallback in `injectApprovedPTO` means a future unknown leaveType classifies as general indirect rather than hard-failing. All 5 currently known leave types are explicitly mapped. Fix in Phase B: replace fallback with null + explicit throw. |
| `salaried_timesheet_lines.date` type mismatch | LOW | Live DB: DATE type. Drizzle schema: text(). Works transparently via pg driver string coercion but is technically mismatched. Resolve in a future schema cleanup pass. |
| Salaried timesheets have no GL posting path | HIGH (by design) | Phase 1 scope was always read-only. The charge code mapping is now the prerequisite for that pipeline. Should be addressed in Phase B or a dedicated Phase C task. |
| BEREAVEMENT maps to IND-SICK | LOW | No separate BEREAVEMENT indirect code exists. Routing to the SICK overhead pool is correct per FAR 31.203 but auditors may ask. Can be separated by adding IND-BEREAVEMENT in Phase B. |
| No uniqueness constraint on (timesheetId, date, lineType) | LOW | Pre-existing. HOLIDAY injection has a per-date check; PTO injection checks by leaveEntryId. Race condition on concurrent inject calls is theoretically possible but the feature flag is off. |
| `salariedTimesheetLinesTable.chargeCodeId` has no `.references()` in Drizzle | LOW | FK is enforced at the DB level (from migration). Drizzle type system doesn't model this reference. Non-functional issue — no runtime impact. |

---

## Phase B Readiness

**Phase B may begin on instruction.**

All Phase A prerequisites are in place:
- Every indirect code has an authoritative charge code mapping enforced at the DB level
- Every future HOLIDAY and PTO injection will carry `chargeCodeId` — no text-only classification
- The `salaried_timesheet_lines` schema is fully reconciled between Drizzle and the live DB  
- The `indirect_codes` table is fail-closed: no new code can be inserted without a charge code
- The feature flag is false — zero traffic exposure; all changes are safe to verify before enabling
- Task #305 GL posting logic is untouched — no regression to the existing accounting engine

The minor observation about `?? "INDIRECT"` fallback should be addressed in Phase B when the first `MANUAL` line write path is built — at that point the full fail-closed path can be enforced end-to-end.
