# AUTO_APPROVAL_BYPASS — FORENSIC AUDIT
## DCAA/EDRI Labor Approval Defensibility

**Date:** 2026-04-26
**Status:** READ-ONLY — no code modified, no rows seeded
**Auditor:** EPOCH forensic pass
**Current composite score:** 90.25
**Current NO_AUTO_APPROVAL sub-score:** 1.0 (dev DB is empty — passes by absence)

---

## Files Inspected

| File | Purpose |
|------|---------|
| `server/src/services/edriDomainScorers.ts` lines 77–104 | Exact scorer SQL and scoring logic |
| `server/schema.ts` lines 1815–1825, 1873–1915 | labor_approvals and punchLedger schema |
| `server/src/routes/timeClock.ts` lines 1134–1390 | Traveler clock-in path — all approval code paths |
| `server/src/routes/timekeeping/punches.ts` lines 176–300, 380–487 | Portal/admin clock-in and break-resume paths |
| `server/src/routes/timekeeping/salariedTimesheets.ts` | Salaried approval chain (OPEN→PAYROLL_APPROVED) |
| `server/src/services/laborCostingService.ts` lines 86–193 | Full posting pipeline — approval gate analysis |
| `server/src/lib/punchLedger.ts` | openSession, closeSession, switchAssignment |
| `server/storage.ts` lines 1526–1528, 16897–16940 | createLaborApproval, getLaborApprovalById |
| `server/src/routes/labor.ts` | Retired labor routes (all 410 Gone) |
| `server/src/services/dcaaForensicRules.ts` | TK-001 forensic rule referencing labor_approvals |

---

## Question 1 — Exact Trigger for AUTO_APPROVAL_BYPASS

### Scorer SQL (edriDomainScorers.ts lines 80–92)

**Total closed sessions query:**
```sql
SELECT COUNT(*) FROM punch_ledger
WHERE clock_out IS NOT NULL
  AND labor_class = 'REGULAR'
```

**Unapproved sessions query:**
```sql
SELECT COUNT(*) FROM punch_ledger pl
WHERE pl.clock_out IS NOT NULL
  AND pl.labor_class = 'REGULAR'
  AND pl.production_work_order_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM labor_approvals la
    WHERE la.employee_id = pl.employee_id::text
      AND la.production_work_order_id = pl.production_work_order_id
  )
```

### Scoring Rule

```
unapprovedRatio = unapprovedSessions / totalSessions
                  (if totalSessions = 0, ratio = 0)

NO_AUTO_APPROVAL score:
  1.0  — unapprovedSessions === 0              (all WAD sessions have approval)
  0.5  — unapprovedSessions > 0, ratio < 0.05  (<5% unapproved, partial credit)
  0.0  — unapprovedSessions > 0, ratio >= 0.05 (≥5% unapproved, FAIL)
```

Flag emitted: `AUTO_APPROVAL_BYPASS`, severity CRITICAL, FAR 31.201-2(c),
`potentialScoreRecovery: 10`

### Current State

Dev DB: zero closed REGULAR sessions → `totalSessions = 0` → `unapprovedRatio = 0` → score 1.0.
This is a false pass caused by an empty database, not by any approval mechanism.

In production (ep-wispy-sun-adm062ft), any closed REGULAR session linked to a
`production_work_order_id` with no matching `labor_approvals` row will trigger the flag.

---

## Question 2 — Can Labor Reach labor_cost_records Without labor_approvals?

**Yes. Unconditionally.** The full path:

```
KIOSK / TRAVELER / PORTAL clock-in
  → punch_ledger INSERT (production_work_order_id set, approvalStatus='AUTO', laborApprovalId=null)

Clock-out
  → punch_ledger UPDATE (clock_out set)

POST /api/cost-accounting/labor/calculate
  → processLaborCosts(year, month)          [laborCostingService.ts lines 86–193]
  → listSessions() — loads ALL sessions
  → filter: clockOut !== null && laborClass === 'REGULAR'
  → NO approval check. approvalStatus is never read. laborApprovalId is never read.
  → classifyLaborCost(), resolveEmployeeRate()
  → labor_cost_records BULK INSERT

POST /api/cost-accounting/labor/post
  → postLaborToGL(year, month, postedBy)    [laborPostingService.ts]
  → journal_entries INSERT
```

`processLaborCosts` (lines 114–116):
```typescript
const closedSessions = allSessions.filter(
  (s: PunchLedgerEntry) => s.clockOut !== null && s.laborClass === 'REGULAR'
);
```

**`approvalStatus`, `laborApprovalId`, and `production_work_order_id` are never read
or checked in the costing or posting pipeline.** All closed REGULAR sessions post
to the GL regardless of approval state.

---

## Question 3 — Problem Classification

### Primary Gap: Missing API Route

**Classification: `APPROVAL_ROUTE_NOT_EXPOSED`**

`storage.createLaborApproval()` is fully implemented (storage.ts line 16897):
```typescript
async createLaborApproval(data: InsertLaborApproval): Promise<LaborApproval> {
  const [approval] = await db.insert(laborApprovals).values(data).returning();
  return approval;
}
```

The `labor_approvals` table exists with the correct schema
(`id`, `production_work_order_id`, `employee_id`, `approved_by`, `reason`,
`approved_at`, `hours_at_approval`).

However, **there is no HTTP endpoint** that allows a supervisor to create a
`labor_approvals` row for a standard (non-overrun) session. No route file in
`server/src/routes/` contains a `createLaborApproval` call for a regular punch.

The only code path that ever sets `laborApprovalId` on a `punch_ledger` row is:
`timeClock.ts` lines 1304–1331 — a budget-BLOCKED traveler clock-in where the
client supplies a `laborApprovalId` in the request body. This path is gated on
`laborStatus.status === 'BLOCKED'`, meaning it is unreachable for normal sessions.

### Secondary Gap: No Approval Gate in Posting Engine

**Classification: `APPROVAL_BYPASS_IN_POSTING_PIPELINE`**

`processLaborCosts` processes all closed REGULAR sessions without any pre-flight
approval check. Labor can reach `labor_cost_records` and from there to the GL
without any `labor_approvals` entry ever existing.

### Not the Problem
- The scorer SQL is correct
- The `labor_approvals` table structure is correct
- The `punch_ledger` schema has the right FK column (`labor_approval_id`)
- The storage layer is ready
- There are no feature flags disabling this functionality
- The salaried timesheet approval chain (SUPERVISOR_APPROVED/PAYROLL_APPROVED)
  writes to `salaried_timesheet_audit`, not `labor_approvals` — it is a
  separate parallel approval mechanism and does NOT satisfy the scorer

---

## Question 4 — Which Labor Types Are Affected?

### Bypassing (Unapproved Path — All)

| Labor Type | Source | WAD Linked | approval_status | laborApprovalId | Scorer sees? |
|------------|--------|------------|-----------------|-----------------|--------------|
| Traveler direct labor | TRAVELER | YES (normal) | AUTO | null | YES — counted |
| Traveler near-budget | TRAVELER | YES (WARNING) | AUTO | null | YES — counted |
| Portal admin punch (traveler context) | PORTAL | YES | AUTO | null | YES — counted |
| KIOSK punch with WAD | KIOSK | YES | AUTO | null | YES — counted |
| Traveler BLOCKED, no approval supplied | TRAVELER | YES | FLAGGED | null | YES — counted |

### Partially Protected

| Condition | Status | Coverage |
|-----------|--------|----------|
| Budget-BLOCKED traveler session where client supplies a valid `laborApprovalId` | `APPROVED_OVERRUN`, `laborApprovalId` FK set | Only if pre-existing `labor_approvals` row exists AND client knows the ID |

### Exempt from Scorer Check (production_work_order_id = NULL)

| Labor Type | Reason |
|------------|--------|
| Traveler with NO_WAD_LINKED | `production_work_order_id` = null → excluded by scorer WHERE clause |
| Portal punch without charge context | `production_work_order_id` = null |
| Indirect overhead punches (no WAD) | `production_work_order_id` = null |
| PTO / Holiday | Typically no WAD linked |

### Salaried Employees

Salaried employees have their own approval chain (`salaried_timesheets`):
OPEN → SUBMITTED → SUPERVISOR_APPROVED → PAYROLL_APPROVED.
This flow writes `labor_cost_records` on payroll-approve (correctly gated).
**However**, if salaried employees also clock in via kiosk/traveler for WAD tracking
(which is possible), those punch_ledger rows would still be subject to the
NO_AUTO_APPROVAL scorer check and would count as unapproved.

---

## Question 5 — Safest Implementation Path

### Recommendation: Option B (Approval Hook During Posting) + New Supervisor Route

**Two-part implementation, both required:**

---

#### Part 1 — Supervisor Labor Approval Route

**New endpoint:** `POST /api/timekeeping/labor-approvals`

**What it does:**
- Accepts `{ productionWorkOrderId, employeeId, approvedBy, reason, hoursAtApproval }`
- Validates that the work order and employee exist
- Calls `storage.createLaborApproval(data)` (already implemented, zero new storage code)
- Returns the created `labor_approvals` row

**Why this satisfies the scorer:**
The scorer checks `labor_approvals WHERE employee_id = pl.employee_id::text AND production_work_order_id = pl.production_work_order_id`. One approval row per employee per work order covers **all** sessions on that work order. A supervisor can approve a week's worth of labor for Employee X on Work Order Y with a single API call.

**Schema already supports this.** No migration required.

---

#### Part 2 — Approval Gate in processLaborCosts (Optional Safety Net)

**Location:** `server/src/services/laborCostingService.ts` line 114 (filter step)

**What it does:**
Before the bulk insert, check if any session being posted has `production_work_order_id IS NOT NULL`
and no corresponding `labor_approvals` row. Options:
- **BLOCK**: Reject the entire posting run with a list of unapproved sessions
- **WARN**: Write the records but flag them with a warning in the response

**Recommendation: BLOCK.** Posting unapproved labor to the GL is the core DCAA
deficiency. A supervisor must approve before labor reaches the ledger.

---

**Why NOT the alternatives:**

- **Option A (require approval before clock-in):** Breaks all existing production
  clock-in flows immediately. Traveler scanning would block on every clock-in until
  a supervisor pre-creates an approval. Too disruptive.

- **Option C (auto-generate approval on clock-out):** Defeats the purpose of
  supervisor oversight. Auto-created approvals without a human actor would score
  as bypass in any DCAA audit.

- **Mixed approach:** If Part 2 (posting gate) is too disruptive short-term,
  Part 1 alone (the route) is still a major improvement — it creates the audit
  trail the scorer needs even if the posting gate comes later.

---

## Question 6 — Score Impact

### Dev Environment (current)
- `NO_AUTO_APPROVAL` = 1.0 (empty DB — zero sessions)
- No change until real sessions exist

### Production Environment (ep-wispy-sun-adm062ft)

**If `NO_AUTO_APPROVAL` is currently failing (score = 0):**

| Metric | Before fix | After fix | Delta |
|--------|-----------|-----------|-------|
| NO_AUTO_APPROVAL sub-score | 0.0 | 1.0 | +1.0 |
| TIMEKEEPING raw score | 87.5 | 100.0 | +12.5 raw points |
| Weighted TIMEKEEPING (×0.30) | 26.25 | 30.0 | +3.75 |
| Composite EDRI | 86.50 | 90.25 | +3.75 |

**If at partial credit (score = 0.5, <5% unapproved):**

| Metric | Before fix | After fix | Delta |
|--------|-----------|-----------|-------|
| NO_AUTO_APPROVAL sub-score | 0.5 | 1.0 | +0.5 |
| TIMEKEEPING raw delta | — | — | +6.25 raw |
| Weighted composite delta | — | — | +1.875 |

Note: The "~10 pts" estimate in the project tracking compounds `NO_AUTO_APPROVAL`
(up to 6.25 raw TIMEKEEPING) with `TIMESHEET_APPROVAL_DEADLINE` (up to 6.25 raw TIMEKEEPING),
which is a related but separate check. Both are fixed by the same supervisor route.

---

## Implementation Priority

| Item | Priority | Effort | Score Impact |
|------|----------|--------|-------------|
| `POST /api/timekeeping/labor-approvals` supervisor route | **P1 CRITICAL** | Low (storage method exists) | Up to +3.75 composite |
| GET route for supervisor review (list unapproved sessions) | P2 HIGH | Low | Enables UI workflow |
| Approval gate in `processLaborCosts` | P2 HIGH | Low | Prevents future bypass |
| Salaried employee coverage (does the salaried flow also write to `labor_approvals`?) | P3 MEDIUM | Medium | Closes edge case |

---

## Summary

| Question | Finding |
|----------|---------|
| Exact trigger | Closed REGULAR sessions with production_work_order_id where no labor_approvals row matches employee_id + work_order_id; ratio ≥5% → score 0 |
| Can labor bypass approval? | Yes. processLaborCosts reads ALL sessions, no approval check anywhere in the pipeline |
| Problem type | APPROVAL_ROUTE_NOT_EXPOSED — storage layer ready, no HTTP route to create approvals for regular sessions |
| Labor types affected | All WAD-linked KIOSK/TRAVELER/PORTAL sessions (the majority of production labor charges) |
| Safest path | Option B: new supervisor POST route + optional posting gate in processLaborCosts |
| Score impact | Up to +3.75 composite if currently failing in production; +1.875 if at partial credit |
