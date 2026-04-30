# TASK #305 — POST-IMPLEMENTATION FORENSIC AUDIT
## READ-ONLY VALIDATION — WAD + Charge Code + Department → GL Posting

**Audit Date:** April 25, 2026  
**Auditor:** Forensic review, read-only, no changes made  
**Files examined:**
- `server/schema.ts` (lines 1873–1927, 15719–15763)
- `server/src/services/laborCostingService.ts` (full file)
- `server/src/services/laborPostingService.ts` (full file)
- `server/src/routes/costAccounting.ts` (full file)
- `server/storage.ts` (labor methods, lines 22369–22408)
- Live DB: `information_schema.columns` + `pg_indexes` for `labor_cost_records`

---

## FINAL JUDGMENT

**PARTIAL**

The core implementation claims are real and functionally correct for the happy path. The attribution bridge from `punch_ledger → labor_cost_records → journal_entries` exists. The compound grouping key is implemented correctly. The fail-closed guard on missing `chargeCodeId` / `projectId` works.

However, two critical accounting risks remain that can produce incorrect or duplicate GL entries without any operator error or concurrent usage anomaly. These are not edge cases — they are gaps in the basic integrity model.

**Charge Code Engine Phase 1 should NOT begin until Finding #1 and Finding #3 are resolved.**

---

## SECTION 1 — SCHEMA VALIDATION

### 1a. Verified column definitions (`labor_cost_records`)

| Column | Type | Nullable | FK | Confirmed |
|--------|------|----------|----|-----------|
| `id` | integer (serial) | NO | PK | ✅ |
| `posting_run_id` | integer | YES | → `labor_posting_runs.id` | ✅ |
| `journal_entry_id` | integer | YES | → `journal_entries.id` | ✅ |
| `epoch_employee_id` | integer | YES | → `employees.id` | ✅ |
| `canonical_id` | text | YES | none | ✅ |
| `job_code` | text | YES | none | ✅ |
| `department_code` | text | YES | none | ✅ |
| `period_year` | integer | NO | none | ✅ |
| `period_month` | integer | NO | none | ✅ |
| `source_punch_canonical_id` | text | YES | none | ✅ |
| `clock_in` | timestamp | NO | none | ✅ |
| `clock_out` | timestamp | NO | none | ✅ |
| `hours_worked` | numeric(10,4) | NO | none | ✅ |
| `rate_used` | numeric(12,2) | NO | none | ✅ |
| `dollar_cost` | numeric(12,2) | NO | none | ✅ |
| `cost_type` | text | NO | none | ✅ |
| `rate_source` | text | NO | none | ✅ |
| `production_work_order_id` | uuid | YES | **none** | ⚠️ |
| `project_id` | uuid | YES | **none** | ⚠️ |
| `traveler_id` | text | YES | **none** | ⚠️ |
| `charge_code_id` | integer | YES | **none** | ⚠️ |
| `created_at` | timestamp | YES | none | ✅ |

### 1b. Live DB index audit

Only index found: `labor_cost_records_pkey` (btree on `id`).

**No indexes exist on:**
- `period_year`, `period_month` (used in every query)
- `production_work_order_id` (used in WAD split filter and stamp UPDATE)
- `project_id`, `charge_code_id` (used in stamp UPDATE)
- `journal_entry_id` (used in void path)
- `posting_run_id` (used in void path and stamp UPDATE)

### 1c. Schema findings

**⚠️ FINDING S-1 (HIGH): New WAD columns carry no FK constraints**  
`production_work_order_id`, `project_id`, and `charge_code_id` in `labor_cost_records` have no foreign key constraints to their respective tables. By contrast, `punch_ledger` has:
```
productionWorkOrderId: uuid(...).references(() => productionWorkOrders.id, { onDelete: 'set null' })
chargeCodeId: integer(...).references(() => chargeCodes.id)
projectId: uuid(...).references(() => projects.id, { onDelete: 'set null' })
travelerId: text(...).references(() => travelers.id)
```
The cost record carries only a snapshot of the IDs at calculation time. If a WAD or charge code is later deleted, the cost record's attribution IDs become dangling references the DB cannot detect. DCAA traceability depends on these IDs remaining resolvable.

**⚠️ FINDING S-2 (HIGH): No performance indexes on any grouping or query columns**  
All `getLaborCostRecordsByPeriod` calls are full table scans (no index on `period_year`/`period_month`). The stamp UPDATEs inside the posting transaction also do full scans filtered by compound conditions. As the table grows, this degrades and eventually makes large-period postings unacceptably slow.

**⚠️ FINDING S-3 (MEDIUM): No UNIQUE constraint on `canonical_id`**  
`canonical_id` is set to `pl-${session.id}` — theoretically unique per punch session. There is no DB-level uniqueness constraint. Duplicate cost records for the same punch are possible if `processLaborCosts` runs concurrently (see Finding C-2). The GL would double-count those hours.

---

## SECTION 2 — COST RECORD ATTRIBUTION FLOW

### 2a. Verified field mappings (`laborCostingService.ts` lines 131–151)

```typescript
productionWorkOrderId: session.productionWorkOrderId ?? null,   ✅ correct
projectId:            session.projectId ?? null,                ✅ correct
travelerId:           session.travelerId ?? null,               ✅ correct
chargeCodeId:         session.chargeCodeId ?? null,             ✅ correct
jobCode:              session.chargeCode ?? null,               ✅ (text snapshot)
departmentCode:       session.department ?? null,               ✅ correct
```

Fields originate from `PunchLedgerEntry` (loaded via `listSessions()` from the actual `punch_ledger` table). No client-controlled values. The source is trusted.

### 2b. Critical attribution risk found

**🚨 FINDING C-1 (HIGH): `costType` classification uses `chargeCode` text snapshot — NOT `chargeCodeId`**

Line 126 of `laborCostingService.ts`:
```typescript
const costType = await classifyLaborCost(session.chargeCode ?? null, session.department ?? null);
```

`classifyLaborCost` (line 45) determines `DIRECT` vs `OVERHEAD` purely from the presence of the `chargeCode` **text snapshot**:
```typescript
if (jobCode) return 'DIRECT';   // jobCode = chargeCode text snapshot
```

In `punch_ledger`, `chargeCode` (text) and `chargeCodeId` (integer FK) are separate columns. A session can legitimately have `chargeCodeId` set but `chargeCode` null — for example, if a future punch-in path sets only the FK, or if the text snapshot was not populated due to a bug.

**Result:** A WAD-linked session with `chargeCodeId != null` and `chargeCode = null` would be classified as `OVERHEAD` (falling through to the department lookup). That session would then:
- Pass the fail-closed check (chargeCodeId is non-null ✅)
- Enter the WAD grouping path (productionWorkOrderId is non-null ✅)
- Generate a journal entry with `costType = OVERHEAD` and the debit going to `overheadLaborAccountId`

This is **wrong**. WAD-linked labor is direct cost. It would post to the wrong GL account and carry an incorrect `costType` label in the memo.

**Risk:** Active if any punch path sets `chargeCodeId` without setting the `chargeCode` text snapshot simultaneously.

### 2c. Can bad attribution enter `labor_cost_records`?

**Yes.** Specifically:
- A session with `productionWorkOrderId` set but `chargeCode = null` and `chargeCodeId` set → enters as OVERHEAD with chargeCodeId populated → passes fail-closed → posts to wrong account
- A session with `productionWorkOrderId` set, `chargeCodeId = null`, `chargeCode = null` → enters as OVERHEAD with no chargeCodeId → blocked by fail-closed ✅
- A session with no WAD fields → treated as indirect, no blocking mechanism → correct

---

## SECTION 3 — GL POSTING GROUPING VALIDATION

### 3a. Compound WAD grouping key (verified)

`wadGroupMapKey()` (lines 19–27) constructs the bucket key as:
```
{costType}\x00{chargeCodeId}\x00{productionWorkOrderId}\x00{projectId}\x00{departmentCode ?? '__null__'}
```

All five required dimensions are present. The `\x00` null-byte separator prevents prefix collisions between UUID segments. The `'__null__'` sentinel for null `departmentCode` is safe for all practical inputs.

**Can two different WAD cost objectives collapse into one journal entry?**

For records that pass fail-closed validation: **NO**, assuming `chargeCode` text is consistently populated. Two records that differ on any of the five key dimensions produce separate buckets and separate journal entries.

**BUT:** If Finding C-1 applies (two WAD sessions on the same WAD but one has `chargeCode = null`), they would be split across WAD and non-WAD paths respectively, which is wrong but not a collapse — the WAD-null session becomes non-WAD OVERHEAD and is posted to the wrong account.

### 3b. Stamp UPDATE logic (verified)

Stamp for non-WAD (line 202–213):
```sql
WHERE posting_run_id = ? AND cost_type = ? AND production_work_order_id IS NULL AND journal_entry_id IS NULL
```
Correct. The `IS NULL` guard prevents stamping WAD records.

Stamp for WAD (lines 265–279):
```sql
WHERE posting_run_id = ? 
  AND production_work_order_id IS NOT NULL 
  AND production_work_order_id = ?
  AND project_id = ?
  AND charge_code_id = ?
  AND cost_type = ?
  AND department_code = ? (or IS NULL)
  AND journal_entry_id IS NULL
```
Correct. All five compound key fields are matched. The `IS NULL` / `eq()` branch for `departmentCode` is correct. The `journal_entry_id IS NULL` guard prevents double-stamping.

### 3c. Non-WAD path preservation (verified)

Non-WAD records group by `costType` only. Account mapping unchanged:
- `DIRECT → directLaborAccountId`
- `OVERHEAD → overheadLaborAccountId`
- `G_AND_A → gaLaborAccountId`

Credit always to `accruedPayrollAccountId`. This is identical to pre-Task-#305 behavior. ✅

---

## SECTION 4 — DUPLICATE POSTING SAFETY

### 4a. Primary guard: run-level status check (lines 74–78)
```typescript
if (run.status === 'POSTED') {
  throw 409;
}
```
Correct behavior for the normal (non-concurrent) path.

### 4b. Secondary guard: record-level `journalEntryId` filter (lines 96–104)
```typescript
const records = allRecords.filter((r) => r.journalEntryId == null);
```
This correctly skips records already stamped. Combined with `AND journal_entry_id IS NULL` in the stamp UPDATE, double-stamping a single record is not possible within a single posting run.

### 4c. Critical race condition found

**🚨 FINDING C-2 (CRITICAL): TOCTOU race — run status checked outside the transaction**

The flow in `postLaborToGL` is:
```
1. storage.getLaborPostingRunByPeriod()   ← status check, OUTSIDE transaction
2. storage.getLaborAccountConfig()         ← config load
3. storage.getLaborCostRecordsByPeriod()   ← record load
4. fail-closed checks
5. in-memory aggregation
6. db.transaction() → journal entries + stamp UPDATEs + run POSTED
```

The status check (step 1) and the write (step 6) are **not atomic**. Two concurrent HTTP requests both calling `POST /api/cost-accounting/post-labor-to-gl` for the same period would both pass step 1 (status is `CALCULATED`), both complete steps 2–5, and then both enter step 6. The second transaction would:
- Insert additional journal entries (duplicating GL lines)
- Attempt to set run status to `POSTED` again (idempotent on the run, but the journal entries already exist)

**Result:** GL contains 2× the correct dollar amounts for that period. The `postedBy` field would be overwritten by the second caller. Cost records would be stamped with the second caller's journal entry IDs (the first stamping was already committed, so `journalEntryId IS NULL` no longer matches — but records stamped by the first call now point to voided-looking entries).

The `router.use(authenticateToken)` + `router.use(requireAdminAccess)` guards ensure only an admin can call this route. Concurrent admin sessions or automated retry logic (e.g., network timeout + client retry) are realistic vectors.

**Severity: CRITICAL for a DCAA-sensitive GL.**

### 4d. Partial failure recovery

If the transaction in step 6 fails mid-way (e.g., DB connection drop after some journal entries are created but before the run is marked POSTED):
- All changes inside the transaction are rolled back (PostgreSQL semantics). ✅
- The run remains in `CALCULATED` status. ✅
- No records are stamped. ✅
- Re-calling `postLaborToGL` is safe — it starts fresh.

The record-level `journalEntryId IS NULL` guard is belt-and-suspenders for this scenario and is correctly placed. ✅

### 4e. Non-transactional recalculation gap

**🚨 FINDING C-3 (CRITICAL): `processLaborCosts` delete + insert not in a transaction**

In `laborCostingService.ts` lines 99–155:
```typescript
if (existingRun) {
  await storage.deleteLaborCostRecordsByPeriod(year, month);  // COMMITTED immediately
}
// ... expensive per-session loop (~seconds) ...
await storage.bulkInsertLaborCostRecords(toInsert);           // SEPARATE commit
```

If the process crashes or the connection drops after the delete but before the insert:
- The period has a `CALCULATED` posting run with zero cost records.
- `postLaborToGL` returns: `"No labor cost records found for period X-Y."`
- No data loss in the source (`punch_ledger` is untouched), but recovery requires re-running `processLaborCosts` manually.
- There is no error to the operator — the system appears ready to post but then silently fails.

This is a pre-existing structural issue (not introduced by Task #305), but it compounds the TOCTOU risk above.

---

## SECTION 5 — FAIL-CLOSED VALIDATION

### 5a. Fail-closed check (lines 112–129, verified)

```typescript
const missingAttribution = wadRecords.filter(
  (r) => r.chargeCodeId == null || r.projectId == null,
);
if (missingAttribution.length > 0) {
  throw new Error(`Cannot post labor for ${year}-${month}: ...`);
}
```

This check fires **before** any DB writes. The transaction has not yet started. ✅

The error message includes: record ID, `sourcePunchCanonicalId`, and which specific field is missing. ✅

### 5b. What the fail-closed does NOT catch

**⚠️ FINDING F-1 (HIGH): Fail-closed does not validate `costType = DIRECT` for WAD records**

A WAD-linked record with `chargeCodeId != null` and `projectId != null` but `costType = OVERHEAD` (possible per Finding C-1) passes the fail-closed check and is posted to the wrong account. The fail-closed guard is necessary but not sufficient.

**⚠️ FINDING F-2 (MEDIUM): `postedBy` field is from request body, not the auth session**

Route line 526: `const { year, month, postedBy } = req.body;`  
Line 536: `postLaborToGL(year, month, postedBy ?? 'system')`

The route is protected by `authenticateToken` + `requireAdminAccess` — the actual requester is authenticated. But the `postedBy` value written into `labor_posting_runs` and `journal_entries.createdBy` comes from the caller-supplied request body. A caller can submit any arbitrary string as their identity. This undermines DCAA audit trail accuracy — the identity of who posted the labor should come from `req.user`, not `req.body`.

### 5c. Can bad labor still reach the GL?

**Yes, in one specific scenario:**  
A WAD-linked session where `chargeCodeId` and `projectId` are populated but `chargeCode` text snapshot is null. This session would be classified as OVERHEAD (wrong), pass the fail-closed check, and post to `overheadLaborAccountId` instead of `directLaborAccountId`.

All other "bad labor" paths are correctly blocked. ✅

---

## SECTION 6 — AUDIT TRACEABILITY

### Verified traceability chain

**"What contract was this labor charged to?"**  
Path: `labor_cost_records.charge_code_id` → `charge_codes` table (no FK enforcement but ID is stored). `labor_cost_records.job_code` provides the text snapshot. ✅ (ID present, FK not enforced — see S-1)

**"Who worked it?"**  
Path: `labor_cost_records.epoch_employee_id` → `employees.id` (FK enforced). ✅

**"Which traveler created it?"**  
Path: `labor_cost_records.traveler_id` (text, no FK). The ID value is copied from `punch_ledger.travelerId` which has FK to `travelers.id`. But the cost record column has no FK — the value can drift if a traveler record is deleted. ⚠️

**"Which WAD authorized it?"**  
Path: `labor_cost_records.production_work_order_id` (uuid, no FK). Copied from `punch_ledger.productionWorkOrderId` which has FK with `onDelete: 'set null'`. If the WAD is deleted, the punch_ledger loses it (`null`), but the cost record retains the original UUID. The UUID points to nothing. ⚠️

**"Which charge code was used?"**  
Path: `labor_cost_records.charge_code_id` (integer, no FK) and `job_code` (text snapshot). Both are present. The integer FK is not enforced at DB level. ⚠️

**"Which department incurred it?"**  
Path: `labor_cost_records.department_code` (text, no FK). Correct value copied. ✅

**"Which journal entry posted it?"**  
Path: `labor_cost_records.journal_entry_id` → `journal_entries.id` (FK enforced). After posting, each record carries the journal entry ID. ✅

**Overall traceability verdict:**  
Complete for the happy path. Fragile for WAD/charge code/traveler identity over time due to absent FK constraints on the new columns.

---

## SECTION 7 — REGRESSION RISK

### 7a. Indirect / overhead posting
Non-WAD path is structurally identical to the pre-#305 implementation. The split (`productionWorkOrderId == null`) correctly routes all indirect records to the legacy path. **No regression.** ✅

### 7b. Payroll exports
The `laborCostingService.ts` and `laborPostingService.ts` changes are isolated to the GL costing pipeline. No payroll or Gusto export code was touched. Verified by file scope. ✅

### 7c. Labor approval flow
`punch_ledger.approvalStatus`, `laborApprovalId`, `laborBudgetOverrideId` are not read or written by either service. ✅

### 7d. Traveler clock-in behavior
No traveler session management files were modified. ✅

### 7e. Legacy timekeeping routes
No routes in `server/src/routes/timekeeping/` were modified. ✅

### 7f. `voidLaborPosting` after recalculation (pre-existing bug, not introduced by #305)

**⚠️ FINDING R-1 (MEDIUM): Post-void recalculation reuses VOIDED run**

`voidLaborPosting` sets `labor_posting_runs.status = 'VOIDED'` and nulls `postingRunId` on cost records. When `processLaborCosts` is called again after a void, line 105:
```typescript
let postingRun = existingRun;   // existingRun = the VOIDED run
if (!postingRun) { createLaborPostingRun(...); }
```
The VOIDED run is reused as the postingRunId. New cost records are inserted with `postingRunId` pointing to a VOIDED run. `postLaborToGL` then checks `run.status === 'POSTED'` only — VOIDED passes. Journal entries are created with `referenceId` pointing to a VOIDED run.

This is a pre-existing design issue. It does not affect any implementation added in Task #305, but it affects the overall correctness of the posting lifecycle.

---

## SECTION 8 — VERIFIED CLAIMS CHECKLIST

| Claim | Status | Notes |
|-------|--------|-------|
| `labor_cost_records` has 4 new nullable WAD columns | ✅ Confirmed in schema + live DB | |
| `laborCostingService` copies all 4 fields from session | ✅ Verified line by line | |
| `laborPostingService` groups WAD by compound 5-key | ✅ Verified exact key construction | |
| Non-WAD indirect grouping unchanged | ✅ Confirmed | |
| Fail-closed: `chargeCodeId` null → hard fail | ✅ Verified, fires before any DB write | |
| Fail-closed: `projectId` null → hard fail | ✅ Verified | |
| Duplicate prevention: already-stamped records skipped | ✅ Verified at record level | |
| `skippedAlreadyPosted` exposed in API response | ✅ Confirmed in route | |
| Route protected by `authenticateToken` + `requireAdminAccess` | ✅ Confirmed lines 17–18 | |

---

## SEVERITY-ORDERED RISK REGISTER

| # | Finding | Severity | Can produce wrong GL? | Introduced by #305? |
|---|---------|----------|-----------------------|---------------------|
| C-2 | TOCTOU race: status check outside transaction → duplicate journal entries on concurrent posting | **CRITICAL** | YES — double-posts | No (pre-existing structure) |
| C-1 | `classifyLaborCost` uses `chargeCode` text, not `chargeCodeId` FK → WAD record with null chargeCode posts to wrong account | **CRITICAL** | YES — wrong account | No (pre-existing classification logic, but newly exposed by WAD path) |
| S-2 | No DB indexes on period_year/month, WAD columns → full table scan on every posting operation | **HIGH** | NO (performance) | No |
| S-1 | New WAD columns lack FK constraints → dangling attribution IDs possible | **HIGH** | NO (data quality) | YES (new columns) |
| S-3 | No UNIQUE constraint on `canonical_id` → concurrent recalculation can produce duplicate cost records | **HIGH** | YES — double-counts hours | No |
| F-1 | Fail-closed does not validate `costType = DIRECT` for WAD records | **HIGH** | YES — wrong account | No |
| F-2 | `postedBy` from request body, not auth session → DCAA audit trail identity unverified | **MEDIUM** | NO (audit trail) | No |
| R-1 | Post-void recalculation reuses VOIDED run as postingRunId | **MEDIUM** | YES — referential integrity | No (pre-existing) |
| C-3 | `processLaborCosts` delete + insert non-transactional → orphaned CALCULATED run with no records | **MEDIUM** | NO (availability) | No |

---

## GO / NO-GO RECOMMENDATION

**NO-GO for Charge Code Engine Phase 1.**

Two findings must be resolved first:

**1. C-2 (CRITICAL — TOCTOU):** Wrap the entire posting flow in a database advisory lock keyed on the period (`pg_try_advisory_xact_lock(year * 100 + month)`), or perform the run status read inside the transaction using a `SELECT ... FOR UPDATE` on `labor_posting_runs`. Without this, concurrent admin actions or network-retry scenarios will double-post to the GL.

**2. C-1/F-1 (CRITICAL — misclassification):** `classifyLaborCost` must also check `chargeCodeId != null` as a direct cost signal, not only the `chargeCode` text snapshot. A WAD-linked session should never be classified as OVERHEAD. The correct rule: if `chargeCodeId IS NOT NULL` OR `chargeCode IS NOT NULL` → DIRECT.

The following are recommended but non-blocking for Phase 1:
- Index on `(period_year, period_month)` for query performance
- Index on `(posting_run_id, production_work_order_id)` for stamp UPDATE performance
- FK constraints on new WAD columns (or explicit documentation that snapshot semantics are intentional)
- `postedBy` read from `req.user` instead of `req.body`
