# Phase G — Allocation Costing Production Readiness Report
**Generated:** 2026-04-30T12:39:29.419Z
**Environment:** Development
**Feature flag:** `USE_ALLOCATION_COSTING_READ`
**API base (flag=OFF):** `http://localhost:5000`
**API base (flag=ON):** `http://localhost:5001` (phaseGApiServer.ts, flag in env)
---
## Final Decision: **CONDITIONAL GO**
| Integrity failures | 0 |
|---|---|
| Conditional criteria pending | 2 |
**Conditions required before upgrading to GO:**
- [ ] Zero closed REGULAR sessions — dollar amounts unproven
- [ ] No multi-segment (job-switch) sessions — allocation split costing unproven
---
## Summary Table
| Step | Check | Status |
|---|---|---|
| 2 | CLI recon — last period | PASS ✓ — exit=0 sessions=0 ERR=0 Δ=$0.00 |
| 2 | CLI recon — curr period | PASS ✓ — exit=0 sessions=0 ERR=0 Δ=$0.00 |
| 3 | API reconcile — last period month(s) | PASS ✓ — sessions=0 ERR=0 Δ=$0.00 |
| 3 | API reconcile — curr period month(s) | PASS ✓ — sessions=0 ERR=0 Δ=$0.00 |
| 4 | calculate flag=OFF — last period | PASS ✓ — readModel=LEGACY HTTP 200 10ms |
| 4 | calculate flag=OFF — curr period | PASS ✓ — readModel=LEGACY HTTP 200 4ms |
| 5 | calculate flag=ON (HTTP :5001) — last | PASS ✓ — readModel=ALLOCATION HTTP 200 9ms |
| 5 | calculate flag=ON (HTTP :5001) — curr | PASS ✓ — readModel=ALLOCATION HTTP 200 7ms |
| 6a | No LEGACY_FALLBACK readModel from flag=ON | PASS ✓ |
| 6b | Log file inspection | PASS ✓ — 2 file(s), 0 occurrences |
| 6c | Structural fallback triggers | PASS ✓ — 0 closed session(s) without allocation |
| 7 | Consistency flag=ON vs reconcile — last | PASS ✓ — calc=$0.00 recon=$0.00 Δ=$0.00 |
| 7 | Consistency flag=ON vs reconcile — curr | PASS ✓ — calc=$0.00 recon=$0.00 Δ=$0.00 |
| 8a | Multi-segment session costing | N/A (CONDITIONAL criterion) |
| 8b | Single-session employee costing | 1 employee(s) exercised |
| 8c | Sessions with no allocation rows | PASS ✓ — 0 found |
| 9 | Performance ratio (flag=ON÷OFF) | PASS ✓ — 1.14× avg (threshold ≤2×) |
| 10 | Coverage — last period | PASS ✓ — 0/0 (100.00%) |
| 10 | Coverage — curr period | PASS ✓ — 0/0 (100.00%) |
---
## 1. Pay Periods
| Period | Pay Period Dates | Validation Scope (Calendar Month) |
|---|---|---|
| Last completed pay period | 2026-04-06 → 2026-04-19 | 2026-04 (2026-04-01 → 2026-04-30) |
| Current active pay period | 2026-04-20 → 2026-04-30 | 2026-04 (2026-04-01 → 2026-04-30) |
> CLI uses exact pay-period date boundaries. API (reconcile-labor-costs) accepts only calendar month granularity — so session populations may differ when a month contains both periods. Each tool is validated independently; no session-count match between CLI and API is required.
> NOTE: Both pay periods fall in calendar month 2026-04. API month calls are identical; CLI date boundaries differ.
---
## 2. CLI Reconciliation
### Last completed pay period
**Command:** `npx tsx phaseECostReconciliation.ts --from 2026-04-06 --to 2026-04-19 --output <tmpfile>`
```
Exit code          : 0
Sessions processed : 0
Cost matches (OK)  : 0
Cost mismatches    : 0
N/A (no alloc)     : 0
Legacy total       : $0.00
Allocation total   : $0.00
Grand delta        : $0.00
Elapsed            : 2801ms
```
### Current active pay period
**Command:** `npx tsx phaseECostReconciliation.ts --from 2026-04-20 --to 2026-04-30 --output <tmpfile>`
```
Exit code          : 0
Sessions processed : 0
Cost matches (OK)  : 0
Cost mismatches    : 0
N/A (no alloc)     : 0
Legacy total       : $0.00
Allocation total   : $0.00
Grand delta        : $0.00
Elapsed            : 2710ms
```
---
## 3. API Reconciliation
### Last period — month 2026-04
```
POST /api/cost-accounting/reconcile-labor-costs {"year":2026,"month":4}
HTTP 200  32ms
{
  "sessions": [],
  "summary": {
    "totalSessions": 0,
    "matchCount": 0,
    "mismatchCount": 0,
    "naCount": 0,
    "totalCostLegacy": 0,
    "totalCostAllocation": 0,
    "grandDelta": 0
  }
}
```

### Curr period — month 2026-04
```
POST /api/cost-accounting/reconcile-labor-costs {"year":2026,"month":4}
HTTP 200  8ms
{
  "sessions": [],
  "summary": {
    "totalSessions": 0,
    "matchCount": 0,
    "mismatchCount": 0,
    "naCount": 0,
    "totalCostLegacy": 0,
    "totalCostAllocation": 0,
    "grandDelta": 0
  }
}
```

---
## 4. calculate-labor-costs — flag=OFF
```
POST http://localhost:5000/api/cost-accounting/calculate-labor-costs {"year":2026,"month":4}
HTTP 200  10ms
{
  "message": "Labor costs calculated successfully",
  "runId": 3,
  "recordCount": 0,
  "totalsByType": {
    "DIRECT": 0,
    "OVERHEAD": 0,
    "G_AND_A": 0
  },
  "readModel": "LEGACY"
}
```
```
POST http://localhost:5000/api/cost-accounting/calculate-labor-costs {"year":2026,"month":4}
HTTP 200  4ms
{
  "message": "Labor costs calculated successfully",
  "runId": 3,
  "recordCount": 0,
  "totalsByType": {
    "DIRECT": 0,
    "OVERHEAD": 0,
    "G_AND_A": 0
  },
  "readModel": "LEGACY"
}
```
---
## 5. calculate-labor-costs — flag=ON
**Method:** `phaseGApiServer.ts` spawned as child process on port :5001 with `USE_ALLOCATION_COSTING_READ=true` set in env before any module imports. Both calls are real HTTP POST requests through an Express router. A warm-up call was made before timed measurements to load DB pool and service modules.
```
POST http://localhost:5001/api/cost-accounting/calculate-labor-costs {"year":2026,"month":4}
HTTP 200  9ms
{
  "recordCount": 0,
  "totalsByType": {
    "DIRECT": 0,
    "OVERHEAD": 0,
    "G_AND_A": 0
  },
  "runId": 3,
  "readModel": "ALLOCATION"
}
```

```
POST http://localhost:5001/api/cost-accounting/calculate-labor-costs {"year":2026,"month":4}
HTTP 200  7ms
{
  "recordCount": 0,
  "totalsByType": {
    "DIRECT": 0,
    "OVERHEAD": 0,
    "G_AND_A": 0
  },
  "runId": 3,
  "readModel": "ALLOCATION"
}
```
---
## 6. Fallback Audit
- **(a) readModel=LEGACY_FALLBACK from flag=ON API:** NO ✓
- **(b) Application log inspection:** 2 file(s), 0 LEGACY_FALLBACK occurrences ✓
- **(c) Structural triggers (closed sessions without allocation):** 0 ✓
---
## 7. Consistency
| Period | calculate flag=ON | reconcile new-model | Δ | Match |
|---|---|---|---|---|
| Last period month | $0.00 | $0.00 | $0.00 | ✓ |
| Curr period month | $0.00 | $0.00 | $0.00 | ✓ |
---
## 8. Edge Case Validation
| Edge Case | Found in Dev | Exercised | Result |
|---|---|---|---|
| Multi-segment (job-switch) sessions | 0 | No | N/A — CONDITIONAL criterion |
| Single-session employees | 1 | Yes — targeted flag=ON HTTP | See Step 8b |
| Sessions with no allocation rows | 0 | N/A | PASS ✓ — 100% covered |
---
## 9. Performance
| Path | Last period | Curr period | Avg |
|---|---|---|---|
| flag=OFF — running dev server | 10ms | 4ms | 7.0ms |
| flag=ON — temp server :5001 (post-warmup) | 9ms | 7ms | 8.0ms |
**Ratio (ON÷OFF):** 1.14× — PASS ✓ (≤2×)
---
## 10. Coverage
| Period | Closed REGULAR | Covered by CLOSED allocation | Uncovered | % |
|---|---|---|---|---|
| Last period | 0 | 0 | 0 | 100.00% |
| Curr period | 0 | 0 | 0 | 100.00% |
---
## Relevant Files
- `server/scripts/phaseGValidation.ts` — this script
- `server/scripts/phaseGApiServer.ts` — temporary Express server for flag=ON HTTP testing
- `server/scripts/phaseECostReconciliation.ts` — CLI reconciliation tool
- `server/src/services/laborCostingService.ts` — allocation read path + fallback guard
- `server/src/services/laborReconcileService.ts` — reconcile logic
- `server/src/lib/featureFlags.ts` — `USE_ALLOCATION_COSTING_READ` flag
- `server/src/routes/costAccounting.ts` — API routes for cost accounting