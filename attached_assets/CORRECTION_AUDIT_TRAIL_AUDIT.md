# FORENSIC AUDIT — CORRECTION AUDIT TRAIL
NO_CORRECTION_AUDIT_TRAIL Resolution

**Date:** 2026-04-26
**Flag:** `NO_CORRECTION_AUDIT_TRAIL`
**Domain:** TIMEKEEPING (weight: 0.30)
**EDRI check:** `CORRECTION_APPROVAL_CHAIN`
**Current check score:** 0.5 (count = 0 → partial pass, flag active)
**Current composite:** 88.38

---

## FILES INSPECTED

| File | Role |
|---|---|
| `server/src/services/edriDomainScorers.ts` lines 177–194 | Scorer logic for CORRECTION_APPROVAL_CHAIN |
| `server/src/routes/timekeeping/punches.ts` | All punch_ledger mutation routes |
| `server/src/services/timekeeping/punches.service.ts` | Legacy timekeeping.punches edit service |
| `server/src/services/timekeeping/audit.service.ts` | `logAction` / `actorFromUser` helpers |
| `server/src/routes/timekeeping/timesheets.ts` | Timesheet lifecycle routes |
| `server/src/routes/timekeeping/daily-certification.ts` | Daily certification audit events |
| `server/schema.ts` | `auditEvents` table definition |
| `server/src/services/timekeeping/timesheets.service.ts` | (via grep — no edit audit hooks found) |
| DB: `audit_events` | Scorer target table |
| DB: `labor_entry_audit` | Legacy correction audit table (separate system) |
| DB: `punch_ledger` | Native punch storage (is_edited, edit_note columns present) |

---

## ARCHITECTURE OVERVIEW — TWO PARALLEL SYSTEMS

EPOCH has two timekeeping systems operating in parallel:

### System A — Legacy (`timekeeping.punches` table)
- Writes go through `punches.service.ts`
- Corrections via `updatePunch()` write to **`labor_entry_audit`** (`action = 'PUNCH_EDITED'`)
- Also writes to **`audit_log`** (generic table-level log) via `logAction()`
- This is the **legacy system** — no new data flows here

### System B — Native punch_ledger (`public.punch_ledger` table)
- All active punches write to `punch_ledger` via `ledger.*` helpers
- Admin edits via `PATCH/PUT /api/timekeeping/punches/:id`
- This is the **current active system**

The scorer checks **`audit_events`** (System C — the shared DCAA audit log), which neither system writes to for corrections.

---

## EXACT SCORER QUERY (edriDomainScorers.ts lines 179–183)

```sql
SELECT COUNT(*) as count FROM audit_events
WHERE entity_type = 'time_entry'
  AND action IN ('PUNCH_EDITED', 'PUNCH_MODIFIED', 'TIME_ENTRY_EDITED', 'ENTRY_UPDATED')
```

### Scoring logic (line 184):
```typescript
checks['CORRECTION_APPROVAL_CHAIN'] =
  correctionAuditCount === null ? 0.5   // DB unavailable
  : correctionAuditCount > 0   ? 1      // PASS
  : 0.5;                                // count = 0 → PARTIAL (flag fires)
```

**Current count:** 0 → score = **0.5**
**Required:** ≥ 1 row with `entity_type = 'time_entry'` AND `action IN (...)` → score = **1**

---

## MUTATION PATHS IDENTIFIED AND AUDIT STATUS

### 1. `PATCH/PUT /api/timekeeping/punches/:id` — Admin punch_ledger edit
**File:** `server/src/routes/timekeeping/punches.ts` lines 632–660
**Handler:** `handleAdminPunchUpdate` (shared between PATCH and PUT)

**What it does:**
- Validates `editNote` (Zod `.min(1)` — enforced at schema level, line 528)
- Fetches `existing` record via `storage.getPunchLedgerEntryById()`
- Updates `punch_ledger` with `isEdited: true`, `editNote`, field changes
- Sets `updatedBy` / `updatedByDisplayName` from `actor`

**Audit status:** ❌ **NO AUDIT EVENT WRITTEN**
- `actorFromUser()` is called (line 639) — actor is built
- `existing` is fetched (line 640) — before-state is available
- `storage.updatePunchLedgerEntry()` is called (line 645)
- **No `db.insert(auditEvents)` after the update**

```typescript
// handleAdminPunchUpdate — CURRENT (lines 633–657)
const actor = actorFromUser(req.user ?? null, req.ip ?? null);
const existing = await storage.getPunchLedgerEntryById(p.data.id);
// ...
const updated = await storage.updatePunchLedgerEntry(p.data.id, { ... });
res.json(updated);
// ← MISSING: db.insert(auditEvents) here
```

---

### 2. `DELETE /api/timekeeping/punches/:id` — Admin punch_ledger delete
**File:** `server/src/routes/timekeeping/punches.ts` lines 662–675

**What it does:**
- Validates `editNote` from `req.body` (plain check, not Zod)
- Fetches `existing` record
- Calls `storage.deletePunchLedgerEntry(id)`

**Audit status:** ❌ **NO AUDIT EVENT WRITTEN**
- No `db.insert(auditEvents)` after delete

---

### 3. `POST /api/timekeeping/punches` — Admin manual punch creation
**File:** `server/src/routes/timekeeping/punches.ts` lines 545–603

**Audit status:** ❌ **NO AUDIT EVENT WRITTEN** (corrections only — creates not required by scorer)

---

### 4. Legacy `updatePunch()` in punches.service.ts — Legacy system
**File:** `server/src/services/timekeeping/punches.service.ts` lines 185–267

**What it does:**
- Enforces `editNote` (lines 194–200)
- Checks immutability (approved timesheet guard, line 202)
- Writes `PUNCH_EDITED` to **`labor_entry_audit`** table (line 251–261)
- Writes UPDATE to **`audit_log`** via `logAction()` (line 238)

**Audit status:** ✅ Audited — **BUT to `labor_entry_audit` (wrong table for scorer)**
The scorer queries `audit_events`. `labor_entry_audit` is a separate table. These events are invisible to the EDRI scorer.

---

### 5. Timesheet lifecycle routes (approve/reject/reopen)
**File:** `server/src/routes/timekeeping/timesheets.ts`

**Audit status:** All routes delegate to `timesheets.service.*` — no direct `audit_events` inserts at the route layer. Audit coverage depends on the service implementations (not inspected for the scope of this flag).

---

### 6. Daily certification
**File:** `server/src/routes/timekeeping/daily-certification.ts`

**Audit status:** ✅ Writes `DAILY_CERTIFIED` to `audit_events` with `entity_type = 'time_entry'`.
Does NOT write `PUNCH_EDITED` — irrelevant to this flag but confirms the pattern works.

---

## DATABASE STATE CONFIRMATION

```sql
-- Scorer target table
SELECT COUNT(*) FROM audit_events
WHERE entity_type = 'time_entry'
  AND action IN ('PUNCH_EDITED','PUNCH_MODIFIED','TIME_ENTRY_EDITED','ENTRY_UPDATED');
→ 0

-- Legacy correction table (not queried by scorer)
SELECT action, COUNT(*) FROM labor_entry_audit GROUP BY action;
→ (empty — no legacy corrections either)

-- punch_ledger (native system, no corrections made yet)
SELECT COUNT(*) FROM punch_ledger;
→ 0
```

---

## ROOT CAUSE

The `handleAdminPunchUpdate` function in `punches.ts` was written to enforce `editNote` and flag `isEdited = true` in `punch_ledger`, but the DCAA audit trail write to `audit_events` was **never added**.

The scorer comment on line 190 states: *"The edit-note enforcement is in place; this will auto-resolve when the first correction is submitted."* — this comment is **incorrect**. The edit-note enforcement is in place, but the `audit_events` insert is missing. The correction will NOT auto-resolve; a code change is required.

The legacy `punches.service.ts` does have correction auditing (to `labor_entry_audit`), but that system is inactive (no legacy punches in the DB) and writes to the wrong table anyway.

---

## EXACT MISSING HOOKS

### Gap 1 — PRIMARY (scores the check)
**File:** `server/src/routes/timekeeping/punches.ts`
**Handler:** `handleAdminPunchUpdate` (lines 633–657)
**After:** `storage.updatePunchLedgerEntry()` succeeds

Required insert:
```typescript
await nativeDb.insert(auditEvents).values({
  entityType: 'time_entry',
  entityId: String(p.data.id),
  action: 'PUNCH_EDITED',
  actorId: actor.id ?? null,
  actorName: actor.email ?? null,
  actorRole: actor.role ?? null,
  reason: body.data.editNote,
  fieldsChanged: {
    ...(body.data.clockIn   != null ? { clockIn:   { from: existing.clockIn,   to: body.data.clockIn   } } : {}),
    ...(body.data.clockOut  !== undefined ? { clockOut:  { from: existing.clockOut,  to: body.data.clockOut  } } : {}),
    ...(body.data.chargeCodeId !== undefined ? { chargeCodeId: { from: existing.chargeCodeId, to: body.data.chargeCodeId } } : {}),
    ...(body.data.travelerId !== undefined ? { travelerId: { from: existing.travelerId, to: body.data.travelerId } } : {}),
  },
  meta: { table: 'punch_ledger', editNote: body.data.editNote },
  ipAddress: req.ip ?? null,
  userAgent: req.headers['user-agent'] ?? null,
});
```

### Gap 2 — SECONDARY (correctness, not needed for scorer)
**File:** `server/src/routes/timekeeping/punches.ts`
**Handler:** DELETE /punches/:id (lines 662–675)
**After:** `storage.deletePunchLedgerEntry()` succeeds

Required insert:
```typescript
await nativeDb.insert(auditEvents).values({
  entityType: 'time_entry',
  entityId: String(p.data.id),
  action: 'PUNCH_DELETED',
  actorId: (req.user as any)?.id ?? null,
  actorName: (req.user as any)?.username ?? (req.user as any)?.email ?? 'admin',
  actorRole: (req.user as any)?.role ?? 'admin',
  reason: String(editNote).trim(),
  fieldsChanged: existing as Record<string, unknown>,
  meta: { table: 'punch_ledger' },
  ipAddress: req.ip ?? null,
  userAgent: req.headers['user-agent'] ?? null,
});
```

---

## IMPORT CHANGE REQUIRED

**File:** `server/src/routes/timekeeping/punches.ts` line 13

**Current:**
```typescript
import { chargeCodes, employees } from "../../../schema";
```

**Required:**
```typescript
import { chargeCodes, employees, auditEvents } from "../../../schema";
```

`nativeDb` is already imported (line 12): `import { db as nativeDb } from "../../../db";`

---

## RECOMMENDED IMPLEMENTATION PATH

### Option A — Route-layer audit hook in `handleAdminPunchUpdate` ✅ RECOMMENDED

**Why:**
- All required ingredients are already present in scope: `actor`, `existing`, `body.data`, `p.data.id`
- One function covers both PATCH and PUT verbs
- Consistent with the charge code audit pattern (Pass 3)
- No storage interface changes required
- No schema changes required
- Minimal blast radius — single file, ~15 lines

**Why not Option B (storage-layer):**
- `storage.updatePunchLedgerEntry()` does not have access to `req.ip`, `req.headers['user-agent']`, or the parsed `body.data` — these must come from the route layer
- Inserting into `audit_events` inside storage would require passing actor context through every storage call

**Why not Option C (approval workflow):**
- Timesheet approval audit already exists separately; this flag is specifically about punch corrections

**Why not Option D (mixed):**
- Not warranted — the gap is a single missing insert

---

## SCORE IMPACT

### Before
| Check | Score |
|---|---|
| `CORRECTION_APPROVAL_CHAIN` | 0.5 |
| TIMEKEEPING domain raw | 93.75 |
| TIMEKEEPING weighted (× 0.30) | 28.13 |
| Composite | 88.38 |

### After (first punch correction submitted)
| Check | Score |
|---|---|
| `CORRECTION_APPROVAL_CHAIN` | 1 |
| TIMEKEEPING domain raw | **100.00** |
| TIMEKEEPING weighted (× 0.30) | **30.00** |
| Composite | **~90.25** |

**Delta: +1.875 composite points**

---

## SAFE NEXT IMPLEMENTATION PROMPT

```
IMPLEMENTATION PROMPT — CORRECTION AUDIT TRAIL
NO_CORRECTION_AUDIT_TRAIL Resolution

STRICT SCOPE:
Only modify: server/src/routes/timekeeping/punches.ts

DO NOT modify:
- storage.ts
- edriDomainScorers.ts
- punch_ledger schema
- any other file

Goal:
Resolve NO_CORRECTION_AUDIT_TRAIL by writing a real
audit_events row on every admin punch_ledger edit.

SCORER REQUIRES:
  SELECT COUNT(*) FROM audit_events
  WHERE entity_type = 'time_entry'
    AND action IN ('PUNCH_EDITED','PUNCH_MODIFIED','TIME_ENTRY_EDITED','ENTRY_UPDATED')
  COUNT > 0 → score = 1

STEP 1 — Import:
Add auditEvents to the existing schema import (line 13):
  import { chargeCodes, employees, auditEvents } from "../../../schema";

STEP 2 — handleAdminPunchUpdate hook (lines 633–657):
After storage.updatePunchLedgerEntry() returns `updated`:

  await nativeDb.insert(auditEvents).values({
    entityType: 'time_entry',
    entityId: String(p.data.id),
    action: 'PUNCH_EDITED',
    actorId: actor.id ?? null,
    actorName: actor.email ?? null,
    actorRole: actor.role ?? null,
    reason: body.data.editNote,
    fieldsChanged: {
      ...(body.data.clockIn != null
        ? { clockIn: { from: existing.clockIn, to: body.data.clockIn } } : {}),
      ...(body.data.clockOut !== undefined
        ? { clockOut: { from: existing.clockOut, to: body.data.clockOut } } : {}),
      ...(body.data.chargeCodeId !== undefined
        ? { chargeCodeId: { from: existing.chargeCodeId, to: body.data.chargeCodeId } } : {}),
      ...(body.data.travelerId !== undefined
        ? { travelerId: { from: existing.travelerId, to: body.data.travelerId } } : {}),
    },
    meta: { table: 'punch_ledger', editNote: body.data.editNote },
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  });

STEP 3 — DELETE hook (lines 662–675):
After storage.deletePunchLedgerEntry() succeeds, add:

  await nativeDb.insert(auditEvents).values({
    entityType: 'time_entry',
    entityId: String(p.data.id),
    action: 'PUNCH_DELETED',
    actorId: (req.user as any)?.id ?? null,
    actorName: (req.user as any)?.username ?? (req.user as any)?.email ?? 'admin',
    actorRole: (req.user as any)?.role ?? 'admin',
    reason: String(editNote).trim(),
    fieldsChanged: existing as Record<string, unknown>,
    meta: { table: 'punch_ledger' },
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  });

SAFETY:
- Only write after successful storage operation
- Do NOT audit failed writes
- entity_type MUST be exactly 'time_entry' (lowercase)
- action for PATCH/PUT MUST be exactly 'PUNCH_EDITED'

VALIDATION:
1. Server compiles cleanly
2. PATCH /api/timekeeping/punches/:id writes audit_events row
3. entity_type = 'time_entry', action = 'PUNCH_EDITED'
4. Scorer count goes from 0 → 1
5. CORRECTION_APPROVAL_CHAIN: 0.5 → 1
6. TIMEKEEPING domain: 93.75 → 100
7. Composite: 88.38 → ~90.25
8. No regressions

DELIVERABLE:
attached_assets/CORRECTION_AUDIT_TRAIL_IMPLEMENTATION.md
```
