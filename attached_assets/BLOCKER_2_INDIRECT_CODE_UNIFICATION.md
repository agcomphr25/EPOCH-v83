# BLOCKER 2 — INDIRECT CODE UNIFICATION AUDIT
## timekeeping.indirect_codes → public.charge_codes

**Audit Date:** April 25, 2026  
**Audit Type:** Read-only investigation — NO code changes in this document  
**Architect Decision:** Option B — keep `indirect_codes` as UX labels, add authoritative `charge_code_id` FK mapping  
**Status:** AUDIT COMPLETE — Implementation cleared to begin

---

## Executive Summary

The "dangerous dual-classification system" described in the prompt is real and fully confirmed.  
The situation is worse than described: the salaried timesheet system currently has **no GL posting path at all**.  
Indirect labor hours are tracked in `timekeeping.salaried_timesheet_lines` but zero dollars flow to the GL.

Additionally, there is a **critical live DB / intended schema divergence** in `salaried_timesheet_lines`  
that must be corrected as part of this implementation.

The fix is safe. `salaried_timesheet_lines` has zero rows. No data is at risk.  
`public.charge_codes` is empty. Seeding is required before any mapping can be established.

---

## Files Inspected

| File | Purpose |
|------|---------|
| `server/src/schema/timekeeping.ts` | Drizzle schema — `indirect_codes`, `salaried_timesheet_lines`, `leave_entries`, `time_off_requests`, `settings` |
| `server/src/services/timekeeping/salariedTimesheet.service.ts` | `getOrCreateWeeklyTimesheet`, `injectHolidayLines`, `injectApprovedPTO`, `getIndirectCodes` |
| `server/src/services/timekeeping/leave.service.ts` | `createLeaveEntry`, `updateLeaveEntry`, `deleteLeaveEntry`, `getLeaveHoursForPeriod` |
| `server/src/services/timekeeping/timeoff.service.ts` | `createTimeOffRequest`, `reviewTimeOffRequest`, `getApprovedTimeOffForEmployee` |
| `server/src/services/timekeeping/settings.service.ts` | `getOrCreateSettings`, `updateSettings` — reads `dcaaChargeCodeEnforcement`, `salariedTimesheetEnabled` |
| `server/src/routes/timekeeping/salariedTimesheets.ts` | 4 routes — all feature-flag gated, read-only Phase 1 |
| `server/src/lib/resolveChargeCode.ts` | WAD charge code resolver — **unrelated to indirect codes** |
| `server/src/services/laborPostingService.ts` | GL posting — reads `labor_cost_records`, **no salaried line access** |
| `server/src/services/laborCostingService.ts` | Cost calculation — reads `punch_sessions`, **no salaried line access** |
| `server/index.ts` lines 1370–1472 | Migration block that created `indirect_codes` and `salaried_timesheet_lines` |
| Live DB: `timekeeping.indirect_codes` | 15 rows, no `charge_code_id` column |
| Live DB: `timekeeping.salaried_timesheet_lines` | 0 rows — diverged from Drizzle schema |
| Live DB: `public.charge_codes` | 0 rows — table exists, completely empty |

---

## Section 1 — What indirect_codes Is Today

### 1.1 Table Definition (live DB — confirmed)

```sql
CREATE TABLE timekeeping.indirect_codes (
  id          SERIAL PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

**No `charge_code_id` column. No FK to `public.charge_codes`. No accounting linkage.**

### 1.2 All 15 Active Indirect Codes (live DB)

| ID | Code | Label | Proposed charge_codes.type |
|----|------|-------|---------------------------|
| 1  | HOLIDAY | Company Holiday | OVERHEAD |
| 2  | PTO | Paid Time Off | OVERHEAD |
| 3  | SICK | Sick Leave | OVERHEAD |
| 4  | TRAINING | Training / Development | OVERHEAD |
| 5  | ADMIN | Administrative | G_AND_A |
| 6  | INDIRECT | Indirect – General | OVERHEAD |
| 7  | UNALLOC | Unallocated | OVERHEAD |
| 8  | G_AND_A | G&A/Admin | G_AND_A |
| 9  | SUPERVISION | Supervision/Management | OVERHEAD |
| 10 | MAINT | Machine Maintenance | OVERHEAD |
| 11 | SAFETY | Safety Meeting | OVERHEAD |
| 13 | QUALITY_REVIEW | Quality Review | OVERHEAD |
| 14 | PROPOSAL | Proposal/Estimating Support | G_AND_A |
| 15 | INTERNAL_ENG | Internal Engineering | OVERHEAD |
| 16 | FACILITY | Facility/Shop Support | OVERHEAD |

**DCAA Classification Rationale:**

- **OVERHEAD (11 codes):** All labor that supports manufacturing operations but is not directly attributable to a contract — holiday pay, PTO, sick leave, training, general indirect, unallocated time, supervision, machine maintenance, safety meetings, quality review, internal engineering, and facility/shop support. Per FAR 31.203 and CAS 418, these absorb into the manufacturing overhead pool and are allocated to contracts via an overhead rate.

- **G_AND_A (3 codes):** Administrative (ADMIN) and general & administrative support (G_AND_A) are business-sustaining activities that apply across all contracts — management overhead, HR, finance, legal, contract administration. Per FAR 31.203(b) and CAS 403, these belong in the G&A pool. Proposal/Estimating (PROPOSAL) belongs in G&A as bid-and-proposal (B&P) cost per FAR 31.205-18 unless separately tracked as IR&D.

- **DIRECT (0 codes):** Intentionally zero. No indirect code maps to DIRECT. Indirect codes by definition represent non-direct labor. If a salaried employee charges direct labor, they use a charge code from `public.charge_codes` via the WAD path directly, not through an indirect code.

### 1.3 Where indirect_codes Are Created

One place only: `server/index.ts` lines 1391–1406 — seeded via `INSERT ... ON CONFLICT DO NOTHING` at server startup.

**No admin UI for creating indirect codes exists yet.** All 15 codes are startup-seeded.

### 1.4 Where indirect_codes Are Referenced

```
server/src/schema/timekeeping.ts            — table definition + FK on salariedTimesheetLinesTable
server/src/services/timekeeping/salariedTimesheet.service.ts — getIndirectCodes() reads it
server/src/routes/timekeeping/salariedTimesheets.ts          — GET /indirect-codes route
server/index.ts                              — CREATE TABLE + seed INSERT
```

**No other files reference `indirect_codes`.**  
It is NOT referenced in `laborPostingService.ts`, `laborCostingService.ts`, `punchLedger.ts`, or any payroll/Gusto export code.

---

## Section 2 — What salaried_timesheet_lines Is Today

### 2.1 CRITICAL: Live DB vs. Intended Schema Divergence

**This is the most important finding in this audit.**

The live DB `salaried_timesheet_lines` was created by an earlier version of the `CREATE TABLE IF NOT EXISTS` migration in `server/index.ts`. When the intended schema was updated, `CREATE TABLE IF NOT EXISTS` did not re-apply — so the live DB is frozen at the older definition.

**Live DB (confirmed by `information_schema.columns`):**
```sql
id               INTEGER NOT NULL  -- serial PK
timesheet_id     INTEGER NOT NULL  -- FK → salaried_timesheets
date             DATE NOT NULL      -- ← DATE type (not TEXT)
line_type        TEXT NOT NULL
indirect_code    TEXT              -- ← FREE TEXT, no FK, nullable
hours            NUMERIC NOT NULL DEFAULT 8
note             TEXT
is_locked        BOOLEAN NOT NULL DEFAULT false
created_at       TIMESTAMPTZ NOT NULL
```

**Drizzle schema in `server/src/schema/timekeeping.ts` (NOT reflected in DB):**
```
chargeCodeId     integer (nullable)
indirectCodeId   integer FK → indirect_codes (nullable)
projectId        integer (nullable)
travelerId       integer (nullable)
leaveEntryId     integer (nullable)
source           text NOT NULL DEFAULT 'MANUAL'
createdBy        integer (nullable)
updatedBy        integer (nullable)
updatedAt        timestamptz
```

**Nine Drizzle columns do not exist in the live DB.**  
**One live DB column (`indirect_code TEXT`) does not appear in the Drizzle schema.**

This is a pre-existing divergence introduced when the Drizzle schema was updated without a corresponding DB migration. The Drizzle ORM will silently ignore this at SELECT time (extra DB columns are dropped) but will **fail at INSERT time** when the service tries to write columns like `leaveEntryId` or `source`.

### 2.2 Row Count (live DB)

```
COUNT(*) = 0
```

Zero rows. No existing data is at risk from any schema change.

### 2.3 How Lines Are Currently Written

`injectHolidayLines()` (salariedTimesheet.service.ts lines 224–237):
```typescript
db.insert(salariedTimesheetLinesTable).values({
  timesheetId,
  date: day,
  lineType: "HOLIDAY",
  hours: 8,
  source: "HOLIDAY_AUTO",     // ← column doesn't exist in live DB
  note: holidayName,
  isLocked: true,
  // chargeCodeId: NOT SET
  // indirectCodeId: NOT SET
})
```

`injectApprovedPTO()` (lines 297–309):
```typescript
db.insert(salariedTimesheetLinesTable).values({
  timesheetId,
  date: entry.date,
  lineType: "PTO",
  leaveEntryId: entry.id,     // ← column doesn't exist in live DB
  hours: entry.hours,
  source: "PTO_IMPORT",       // ← column doesn't exist in live DB
  note: entry.note ?? entry.leaveType,
  isLocked: true,
  // chargeCodeId: NOT SET
  // indirectCodeId: NOT SET
})
```

**Both injection functions will fail at runtime** because they attempt to write to columns that do not exist in the live DB (`source`, `leaveEntryId`). This is a latent bug that has not manifested only because `salariedTimesheetEnabled` is `false` by default.

---

## Section 3 — How PTO / Holiday / Sick Are Auto-Generated

### 3.1 Holiday Injection Flow

```
GET /api/timekeeping/salaried-timesheet/portal/:portalId/my/:weekStart
  → requireFeatureFlag() (salariedTimesheetEnabled = false → 404)
  → requireSalaryPayType()
  → getSalariedTimesheetView()
      → getOrCreateWeeklyTimesheet()     [writes salaried_timesheets header]
      → injectHolidayLines()             [idempotent; writes HOLIDAY lines]
      → injectApprovedPTO()              [idempotent; writes PTO lines]
      → SELECT all lines for this timesheet
```

Holiday detection: `usHolidaysForYear()` — static list of 9 US federal holidays per year.  
No database lookup. No admin-configurable holiday table (documented as Phase 3+).

**Current HOLIDAY line: no `chargeCodeId`, no `indirectCodeId`, `lineType = "HOLIDAY"` only.**

### 3.2 PTO Injection Flow

```
leave_entries.leaveType IN ('pto','sick','holiday','bereavement','other')
   → stored in timekeeping.leave_entries (via leave.service.ts createLeaveEntry)
   → injectApprovedPTO() reads leaveEntriesTable WHERE date IN [weekStart, weekEnd]
   → writes PTO line to salaried_timesheet_lines (lineType = "PTO")
```

Note: `leave_entries` does NOT filter on `leaveType`. All leave entries for the week are imported regardless of type. This means SICK leave entries are also imported as `lineType = "PTO"`. This is a pre-existing bug unrelated to Blocker 2.

**Current PTO line: no `chargeCodeId`, no `indirectCodeId`, `lineType = "PTO"` only.**

### 3.3 Sick Leave

Sick leave exists in `leave_entries` with `leaveType = "sick"`. It flows through `injectApprovedPTO` (misnamed — imports all leave types). No separate sick handling. No charge code.

### 3.4 Leave Approval Chain

`time_off_requests` → `reviewTimeOffRequest()` sets `status = "approved"` — the approval writes to `time_off_requests` only. There is NO automated bridge from an approved `time_off_request` to a `leave_entries` row. This bridge either doesn't exist yet or is handled by an admin manually creating `leave_entries`. This is a Phase 2+ concern. Not blocking Blocker 2.

---

## Section 4 — How Salaried Timesheet Lines Store Indirect Classification Today

**They don't — reliably.**

The live DB column is `indirect_code TEXT` (free text, nullable, no FK). The Drizzle schema has `indirectCodeId INTEGER FK` but this column does not exist in the live DB. Neither column is set by auto-injection functions.

The UI (if it existed — Phase 2) would let an employee pick an indirect code from the `getIndirectCodes()` dropdown. That selection would need to be written to the DB. Currently:

- If written via Drizzle ORM using `indirectCodeId` → **runtime error** (column doesn't exist in DB)  
- If written via the old `indirect_code TEXT` column → **possible but no FK enforcement, no charge code**

**Conclusion:** Salaried indirect classification is currently non-functional and has never been exercised in production (feature flag is off).

---

## Section 5 — Does Hourly Indirect Labor Exist?

**No.**

Hourly employees punch in/out via `timekeeping.punches`. The `punchesTable` has a `costCode TEXT` field, but there is no `indirectCodeId` or indirect classification on punches. Punch sessions flow through `processLaborCosts` using WAD `chargeCodeId` for direct labor, or a department/cost-type fallback for non-WAD overhead classification.

**Hourly indirect labor entry does not exist as a feature.** When hourly employees do indirect work (training, meetings), they either clock in with no WAD (classified as OVERHEAD via department lookup) or it is not captured at all.

The Blocker 2 architecture must leave room for future hourly indirect entry without another rewrite.

---

## Section 6 — Whether a Safe 1:1 Mapping Is Possible

**Yes. Confirmed.**

All 15 indirect codes map unambiguously to either `OVERHEAD` or `G_AND_A`. None map to `DIRECT`. The mapping table in Section 1.2 above is the authoritative assignment.

No indirect code is ambiguous. No indirect code has a business reason to map differently than shown. The mapping is based on FAR 31.203, CAS 418, and standard government contract indirect cost pool accounting.

---

## Section 7 — Current GL Posting Path for Salaried Employees

**There is no GL posting path for salaried employees.**

```
Hourly employees:
  punch → punch_ledger → processLaborCosts → labor_cost_records → postLaborToGL → journal_entries ✅

Salaried employees:
  salaried_timesheet_lines → ??? → NOTHING → GL never receives salaried labor costs ❌
```

`laborCostingService.ts` and `laborPostingService.ts` have zero references to `salariedTimesheetLinesTable` or any timekeeping salaried table. This is expected for Phase 1, which is documented as "read-only safe." But it is the accounting risk: salaried costs are being accrued in HR records with no accounting recognition.

Blocker 2 does not create the salaried → GL pipeline. That is a future phase.  
Blocker 2 creates the **prerequisite**: every salaried indirect line has a valid charge code, so when the pipeline is built, the accounting path is already determined.

---

## Section 8 — timekeeping.settings Flags

Two relevant flags in `timekeeping.settings`:

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `salariedTimesheetEnabled` | BOOLEAN | FALSE | Gates all salaried timesheet routes via `requireFeatureFlag()`. Currently FALSE — all salaried routes return 404. |
| `dcaaChargeCodeEnforcement` | BOOLEAN | FALSE | Read by `settings.service.ts` — not yet enforced anywhere in the codebase. When TRUE, it is intended to block posting of lines without a valid charge code. |

Neither flag is currently enforced in the GL posting pipeline. The `dcaaChargeCodeEnforcement` flag exists but is not read by `laborPostingService.ts` — it was likely added ahead of implementation.

---

## Section 9 — What Blocker 2 Must Implement

### 9.1 DB Changes Required (all additive — zero data at risk)

**Step 1 — Seed `public.charge_codes` with 15 indirect pool entries**

One charge code per indirect code (code prefix `IND-`), typed correctly:

```sql
INSERT INTO charge_codes (code, description, type, active) VALUES
  ('IND-HOLIDAY',        'Company Holiday — Overhead Pool',              'OVERHEAD', true),
  ('IND-PTO',            'Paid Time Off — Overhead Pool',                'OVERHEAD', true),
  ('IND-SICK',           'Sick Leave — Overhead Pool',                   'OVERHEAD', true),
  ('IND-TRAINING',       'Training & Development — Overhead Pool',       'OVERHEAD', true),
  ('IND-ADMIN',          'Administrative — G&A Pool',                    'G_AND_A',  true),
  ('IND-INDIRECT',       'General Indirect — Overhead Pool',             'OVERHEAD', true),
  ('IND-UNALLOC',        'Unallocated — Overhead Pool',                  'OVERHEAD', true),
  ('IND-G_AND_A',        'General & Administrative — G&A Pool',          'G_AND_A',  true),
  ('IND-SUPERVISION',    'Supervision/Management — Overhead Pool',       'OVERHEAD', true),
  ('IND-MAINT',          'Machine Maintenance — Overhead Pool',          'OVERHEAD', true),
  ('IND-SAFETY',         'Safety Meeting — Overhead Pool',               'OVERHEAD', true),
  ('IND-QUALITY_REVIEW', 'Quality Review — Overhead Pool',               'OVERHEAD', true),
  ('IND-PROPOSAL',       'Proposal/Estimating B&P — G&A Pool',          'G_AND_A',  true),
  ('IND-INTERNAL_ENG',   'Internal Engineering — Overhead Pool',         'OVERHEAD', true),
  ('IND-FACILITY',       'Facility/Shop Support — Overhead Pool',        'OVERHEAD', true)
ON CONFLICT (code) DO NOTHING;
```

**Step 2 — Add `charge_code_id` to `timekeeping.indirect_codes`**

```sql
ALTER TABLE timekeeping.indirect_codes
  ADD COLUMN IF NOT EXISTS charge_code_id INTEGER REFERENCES public.charge_codes(id);
```

This is nullable initially. Will be populated in Step 3. A NOT NULL constraint will be added after population.

**Step 3 — Populate the mapping**

```sql
UPDATE timekeeping.indirect_codes ic
SET charge_code_id = cc.id
FROM public.charge_codes cc
WHERE cc.code = 'IND-' || ic.code;
```

This JOIN works because every indirect code `X` maps to charge code `IND-X` exactly.

**Step 4 — Enforce NOT NULL after population**

```sql
ALTER TABLE timekeeping.indirect_codes
  ALTER COLUMN charge_code_id SET NOT NULL;
```

This is the fail-closed constraint. Any future indirect code inserted without a `charge_code_id` will be rejected at the DB level.

**Step 5 — Reconcile `salaried_timesheet_lines` live DB / schema divergence**

The live DB column `indirect_code TEXT` must be renamed and the missing columns added:

```sql
-- Rename the legacy free-text column (preserve for rollback)
ALTER TABLE timekeeping.salaried_timesheet_lines
  RENAME COLUMN indirect_code TO indirect_code_legacy;

-- Add the FK-backed columns
ALTER TABLE timekeeping.salaried_timesheet_lines
  ADD COLUMN IF NOT EXISTS indirect_code_id INTEGER REFERENCES timekeeping.indirect_codes(id),
  ADD COLUMN IF NOT EXISTS charge_code_id   INTEGER REFERENCES public.charge_codes(id),
  ADD COLUMN IF NOT EXISTS project_id       INTEGER,
  ADD COLUMN IF NOT EXISTS traveler_id      INTEGER,
  ADD COLUMN IF NOT EXISTS leave_entry_id   INTEGER,
  ADD COLUMN IF NOT EXISTS source           TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS created_by       INTEGER,
  ADD COLUMN IF NOT EXISTS updated_by       INTEGER,
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW();
```

Zero rows exist, so no data migration is needed.

### 9.2 Drizzle Schema Changes Required

`server/src/schema/timekeeping.ts` — `salariedTimesheetLinesTable`:
- Rename `indirectCodeId` → maps to `indirect_code_id` (already in Drizzle schema, now exists in DB)
- Add `indirectCodeLegacy: text("indirect_code_legacy")` to match the renamed column (nullable, for audit trail only)
- Add `chargeCodeId` mapping to `charge_code_id` (already in Drizzle schema, now exists in DB)
- Fix `date` column type: live DB has `date` (DATE type), Drizzle has `text`. Change to `date("date")` or keep `text("date")` — this is a display-only difference, Drizzle will coerce.

`server/src/schema/timekeeping.ts` — `indirectCodesTable`:
- Add `chargeCodeId: integer("charge_code_id").notNull().references(() => chargeCodes.id)`

### 9.3 Service Changes Required

**`salariedTimesheet.service.ts` — `injectHolidayLines()`:**
- Look up the HOLIDAY indirect code: `SELECT id, charge_code_id FROM indirect_codes WHERE code = 'HOLIDAY'`
- Write `indirectCodeId` and `chargeCodeId` to every injected HOLIDAY line
- Fail closed: if HOLIDAY indirect code is missing or its `charge_code_id` is null, throw an error

**`salariedTimesheet.service.ts` — `injectApprovedPTO()`:**
- Look up the PTO indirect code: `SELECT id, charge_code_id FROM indirect_codes WHERE code = 'PTO'`
- Write `indirectCodeId` and `chargeCodeId` to every injected PTO line
- Note: Currently imports all leave types as PTO lines. The charge code should reflect the leave type. For SICK and BEREAVEMENT, look up the SICK indirect code. This should be resolved per `leaveEntry.leaveType`.
- Leave type → indirect code mapping:
  - `pto` → INDIRECT CODE: `PTO`
  - `sick` → INDIRECT CODE: `SICK`
  - `holiday` → INDIRECT CODE: `HOLIDAY`
  - `bereavement` → INDIRECT CODE: `SICK` (closest existing code — or add BEREAVEMENT in future)
  - `other` → INDIRECT CODE: `INDIRECT`

**`salariedTimesheet.service.ts` — `getIndirectCodes()`:**
- Return `chargeCodeId` and the joined `chargeCode.type` in the response (for UI awareness)

### 9.4 Route / API Changes Required

`GET /salaried-timesheet/indirect-codes` — response shape expands to include `chargeCodeId` and `chargeCodeType`. No breaking change (additive fields).

### 9.5 Fail-Closed Requirements

At future Phase 2 (when manual line editing is built):
- A salaried timesheet line with `lineType = "INDIRECT"` that has `indirectCodeId = null` must be rejected at write time
- An indirect code with `charge_code_id = null` cannot be saved (DB NOT NULL constraint enforces this)
- At future salaried → GL posting time: any line without a resolved `chargeCodeId` must hard-fail the entire posting run

---

## Section 10 — What Is NOT Changing

| System | Status |
|--------|--------|
| Hourly punch → GL posting pipeline | Unchanged |
| WAD charge code resolution (`resolveChargeCode.ts`) | Unchanged |
| `processLaborCosts` / `classifyLaborCost` | Unchanged |
| `postLaborToGL` / fail-closed WAD logic | Unchanged |
| PTO approval workflow (`reviewTimeOffRequest`) | Unchanged |
| Leave entry create/update/delete | Unchanged |
| `leave.service.ts` validation logic | Unchanged |
| `time_off_requests` table | Unchanged |
| `salariedTimesheetEnabled` feature flag | Unchanged (stays FALSE until Phase 2) |
| `dcaaChargeCodeEnforcement` flag | Unchanged (wired in Phase 2) |
| Payroll / Gusto export | Unchanged |
| Hourly timesheet approval chain | Unchanged |
| `timekeeping.settings` | Unchanged |
| `timekeeping.employees` | Unchanged |
| Admin UI routes | Unchanged |

---

## Section 11 — Rollback Protection

Because the feature flag `salariedTimesheetEnabled = false` is the current state:

1. All salaried timesheet routes return 404 until the flag is enabled
2. DB changes are purely additive (ADD COLUMN, new rows in charge_codes)
3. The `indirect_code_legacy TEXT` column preserves any future data written to the old `indirect_code TEXT` column if the rollback window is needed
4. `charge_codes` rows seeded with `IND-` prefix are distinctly namespaced — no collision with WAD direct labor charge codes
5. The NOT NULL constraint on `indirect_codes.charge_code_id` is applied after the mapping is confirmed — no partial-mapping state is possible

**Rollback procedure (if needed):**

```sql
-- Revert indirect_codes
ALTER TABLE timekeeping.indirect_codes DROP COLUMN IF EXISTS charge_code_id;

-- Revert salaried_timesheet_lines (restore legacy column name)
ALTER TABLE timekeeping.salaried_timesheet_lines RENAME COLUMN indirect_code_legacy TO indirect_code;
ALTER TABLE timekeeping.salaried_timesheet_lines DROP COLUMN IF EXISTS indirect_code_id;
ALTER TABLE timekeeping.salaried_timesheet_lines DROP COLUMN IF EXISTS charge_code_id;
-- (etc. for other added columns)

-- Remove seeded charge_codes (safe — zero dependent rows)
DELETE FROM public.charge_codes WHERE code LIKE 'IND-%';
```

Because there are zero rows in `salaried_timesheet_lines` and zero rows in `charge_codes`, rollback is completely safe at any point before Phase 2 is enabled.

---

## Section 12 — Future Hourly Indirect Labor Readiness

The architecture chosen (Option B) is ready for hourly indirect entry without a rewrite:

1. `timekeeping.indirect_codes` with `charge_code_id` is the mapping table — hourly sessions can reference it the same way salaried lines do
2. When hourly indirect entry is built, the punches or sessions table gains an `indirect_code_id` column that references the same table
3. `classifyLaborCost` can be extended to accept `indirectCodeId` in addition to `chargeCodeId` — the `chargeCodeId` is resolved from `indirect_codes.charge_code_id` at processing time
4. The GL posting pipeline requires no structural change — it already uses `chargeCodeId` on `labor_cost_records`

---

## Section 13 — DCAA Auditability After Implementation

A DCAA auditor reviewing an indirect labor entry will be able to trace:

```
salaried_timesheet_lines.id = 42
  ↓
.indirect_code_id = 4  →  timekeeping.indirect_codes.code = "TRAINING"
  ↓
indirect_codes.charge_code_id = 8  →  public.charge_codes.code = "IND-TRAINING"
  ↓
charge_codes.type = "OVERHEAD"
  ↓
Overhead pool allocation rate
  ↓
journal_entries (future posting phase)
```

The auditor can answer:
- "Why was this training session charged to overhead?" → Because `indirect_codes.code = TRAINING` maps to `charge_codes.code = IND-TRAINING` with `type = OVERHEAD` per the authoritative mapping established in this implementation.
- "Which cost pool received it?" → OVERHEAD pool, per `charge_codes.type`.
- "Which journal entry posted it?" → (Phase 2+ — posted when salaried GL pipeline is built, using this charge code)

---

## Section 14 — Validation Checklist (to be confirmed after implementation)

| # | Validation Item | Method |
|---|----------------|--------|
| 1 | PTO injection still works | Feature flag on, create leave_entry, call portal endpoint, verify PTO line has chargeCodeId set |
| 2 | Holiday injection still works | Feature flag on, navigate to a week with a US holiday, verify HOLIDAY line has chargeCodeId set |
| 3 | Salaried certification still works | Status flow unchanged — no certification columns changed |
| 4 | Supervisor approval still works | No approval columns changed in salaried_timesheets |
| 5 | Payroll approval still works | No payroll approval columns changed |
| 6 | Every indirect_code has charge_code_id NOT NULL | `SELECT id, code FROM timekeeping.indirect_codes WHERE charge_code_id IS NULL` → 0 rows |
| 7 | Every IND-* charge_code has correct type | `SELECT code, type FROM charge_codes WHERE code LIKE 'IND-%' ORDER BY code` → verify types |
| 8 | No duplicate accounting path exists | Only path is: indirect_code → charge_code → (future) GL. No legacy bypass |
| 9 | getIndirectCodes() returns chargeCodeId | API call to GET /indirect-codes returns chargeCodeId in each row |
| 10 | Hourly punch → GL pipeline unaffected | Existing laborPostingService.ts tests pass unchanged |
| 11 | salaried_timesheet_lines schema reconciled | `\d timekeeping.salaried_timesheet_lines` shows all 17 expected columns |
| 12 | No rows lost in salaried_timesheet_lines | `SELECT COUNT(*) FROM timekeeping.salaried_timesheet_lines` = 0 before and after |

---

## Section 15 — Exact Files to Be Changed

| File | Change |
|------|--------|
| `server/index.ts` | Add Step 1–5 SQL blocks to the salaried timesheet migration section (idempotent `ALTER ... IF NOT EXISTS`) |
| `server/src/schema/timekeeping.ts` | Add `chargeCodeId` to `indirectCodesTable`; reconcile `salariedTimesheetLinesTable` columns |
| `server/src/services/timekeeping/salariedTimesheet.service.ts` | Update `injectHolidayLines`, `injectApprovedPTO`, `getIndirectCodes` to resolve and write `chargeCodeId` |

**Files that are NOT changing:**

```
server/src/services/laborPostingService.ts      — DO NOT TOUCH
server/src/services/laborCostingService.ts      — DO NOT TOUCH
server/src/lib/resolveChargeCode.ts             — DO NOT TOUCH
server/src/lib/punchLedger.ts                   — DO NOT TOUCH
server/src/routes/costAccounting.ts             — DO NOT TOUCH
server/src/services/timekeeping/leave.service.ts — DO NOT TOUCH
server/src/services/timekeeping/timeoff.service.ts — DO NOT TOUCH
server/schema.ts (public schema)                — DO NOT TOUCH
```

---

## Appendix A — Live DB State Snapshot (April 25, 2026)

### timekeeping.indirect_codes
```
id  code            label                    is_active  sort_order
 1  HOLIDAY         Company Holiday          true       10
 8  G_AND_A         G&A/Admin                true       10
 2  PTO             Paid Time Off            true       20
 9  SUPERVISION     Supervision/Management   true       20
10  MAINT           Machine Maintenance      true       30
 3  SICK            Sick Leave               true       30
11  SAFETY          Safety Meeting           true       40
 4  TRAINING        Training / Development   true       40
 5  ADMIN           Administrative           true       50
 6  INDIRECT        Indirect – General       true       60
13  QUALITY_REVIEW  Quality Review           true       60
14  PROPOSAL        Proposal/Estimating      true       70
 7  UNALLOC         Unallocated              true       70
15  INTERNAL_ENG    Internal Engineering     true       80
16  FACILITY        Facility/Shop Support    true       90
```

### public.charge_codes
```
(empty — 0 rows)
```

### timekeeping.salaried_timesheet_lines
```
(empty — 0 rows)
Live columns: id, timesheet_id, date(DATE), line_type, indirect_code(TEXT), hours, note, is_locked, created_at
```

---

## Final Verdict

**Implementation is cleared to begin.**

The audit confirms:
1. Option B is the correct and safe architecture
2. No indirect code has an ambiguous accounting classification
3. Zero rows exist in `salaried_timesheet_lines` — no data migration risk
4. `public.charge_codes` is empty — seeding is the first required step
5. The live DB / Drizzle schema divergence is fully mapped and the reconciliation is additive
6. The feature flag (`salariedTimesheetEnabled = false`) provides a safe no-traffic window for all changes
7. No existing GL posting code is affected
8. Rollback is trivial at any point before Phase 2

This implementation is boring, safe, auditable, and impossible to misunderstand.
