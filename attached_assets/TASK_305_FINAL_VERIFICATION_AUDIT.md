# TASK #305 — FINAL VERIFICATION AUDIT
## Post-Hardening Read-Only Validation

**Audit Date:** April 25, 2026  
**Audit Type:** Strict read-only — no code changes made  
**Drizzle ORM version in use:** 0.39.1 (confirmed — `.for('update')` fully supported)

---

## FINAL VERDICT: PASS

All 10 verification items pass. The two critical accounting risks from `TASK_305_POST_IMPLEMENTATION_AUDIT.md` are fully and correctly resolved. The implementation is safe to operate and Charge Code Engine Phase 1 (Blocker 2) may begin.

---

## Files Inspected

| File | Lines read |
|------|-----------|
| `server/src/services/laborPostingService.ts` | 1–411 (complete) |
| `server/src/services/laborCostingService.ts` | 1–193 (complete) |
| `server/src/routes/costAccounting.ts` | 1–18, 456–554 |
| `server/storage.ts` | 2994–2997 (IStorage interface), 25225–25230 (implementation) |
| `server/schema.ts` | 15719–15748 (laborCostRecords table) |
| Live DB | `information_schema.columns` on `labor_cost_records`; `DISTINCT charge_codes.type` |

---

## Verification Item 1 — All posting-period reads inside one DB transaction

**PASS ✅**

The entire body of `postLaborToGL` is wrapped in a single `db.transaction(async (tx) => { ... })` starting at line 72. There are zero calls to `storage.*` or `db.*` outside that transaction closure.

Operations confirmed inside the transaction, in order:

| Step | Operation | Location |
|------|-----------|----------|
| 1 | `tx.select().from(laborPostingRuns).for('update')` | lines 75–85 |
| 2 | `tx.select().from(laborAccountConfig)` | line 102 |
| 3 | `tx.select().from(laborCostRecords).where(period)` | lines 111–119 |
| 4 | In-memory: duplicate filter, WAD split, fail-closed | lines 126–158 |
| 5 | In-memory: aggregation buckets | lines 160–191 |
| 6 | `tx.insert(journalEntries)` × N | lines 202, 259 |
| 7 | `tx.insert(journalLines)` × 2N | lines 214–225, 271–282 |
| 8 | `tx.update(laborCostRecords) SET journal_entry_id` × N | lines 228–238, 290–304 |
| 9 | `tx.update(laborPostingRuns) SET status='POSTED'` | lines 308–310 |

No read or write touches the database outside the transaction boundary.

---

## Verification Item 2 — First transaction operation locks the posting run row with SELECT ... FOR UPDATE

**PASS ✅**

Lines 75–85 of `laborPostingService.ts`:

```typescript
const [run] = await tx
  .select()
  .from(laborPostingRuns)
  .where(
    and(
      eq(laborPostingRuns.periodYear, year),
      eq(laborPostingRuns.periodMonth, month),
    ),
  )
  .for('update')
  .limit(1);
```

This is the **first** database call inside the transaction. `.for('update')` generates `SELECT ... FOR UPDATE` in the emitted SQL, which acquires a row-level exclusive lock on the matching `labor_posting_runs` row for the duration of the transaction. The status check (`run.status === 'POSTED'`) occurs immediately after — while the lock is held — at lines 93–97.

---

## Verification Item 3 — Second concurrent posting attempt cannot create duplicate journal entries

**PASS ✅**

**Mechanism verified:**

```
Transaction A                              Transaction B (concurrent)
─────────────────────────────────────────  ────────────────────────────────────────
BEGIN
SELECT ... FOR UPDATE                 →    [B attempts SELECT ... FOR UPDATE]
  → acquires row lock                      [B blocks — lock held by A]
status check: CALCULATED ✅
config load, record load
fail-closed checks
insert journal entries
stamp cost records
UPDATE run SET status='POSTED'
COMMIT, lock released               →    [B acquires lock]
                                          status check: reads POSTED
                                          → throws 409
                                          ROLLBACK (nothing was written)
```

The second caller acquires the row lock only after the first transaction commits. At that point the run status is `POSTED` and the second caller immediately throws and rolls back. Journal entry creation has not started. **Duplicate GL entries are structurally impossible** under this scheme for any number of concurrent callers.

---

## Verification Item 4 — classifyLaborCost uses chargeCodeId / charge_codes.type as authoritative source

**PASS ✅**

Lines 52–68 of `laborCostingService.ts`:

```typescript
export async function classifyLaborCost(
  chargeCodeId: number | null,
  chargeCode: string | null,
  departmentCode: string | null,
): Promise<CostType> {
  if (chargeCodeId != null) {
    const cc = await storage.getChargeCodeById(chargeCodeId);
    if (!cc) {
      throw new Error(`Cannot classify labor cost: charge code ID ${chargeCodeId} does not exist. ...`);
    }
    const t = cc.type.toUpperCase();
    if (t === 'DIRECT') return 'DIRECT';
    if (t === 'G_AND_A') return 'G_AND_A';
    return 'OVERHEAD';
  }
  // ... non-WAD fallback path
}
```

When `chargeCodeId` is non-null, the function:
1. Performs a live DB lookup via `storage.getChargeCodeById()` → `SELECT * FROM charge_codes WHERE id = $1 LIMIT 1`
2. Uses `charge_codes.type` (schema-defined: `DIRECT | OVERHEAD | G_AND_A`) as the classification
3. Returns immediately — the `chargeCode` text check at line 72 is never reached

`charge_codes.type` is confirmed present in the live DB schema. The `getChargeCodeById` implementation is confirmed in `DatabaseStorage` at line 25227.

---

## Verification Item 5 — Missing or invalid chargeCodeId fails closed

**PASS ✅ — Two independent layers verified**

**Layer A — at calculation time (`processLaborCosts`):**  
`classifyLaborCost` throws at line 59–63 if `chargeCodeId` is provided but the charge code row does not exist. Error is propagated by `processLaborCosts` as a 500 at the route level. No cost record is written for that session.

**Layer B — at posting time (`postLaborToGL`):**  
Lines 141–158 — the fail-closed check rejects the entire period posting if any WAD record has `chargeCodeId == null`:

```typescript
const missingAttribution = wadRecords.filter(
  (r) => r.chargeCodeId == null || r.projectId == null,
);
if (missingAttribution.length > 0) {
  throw new Error(`Cannot post labor for ${year}-${month}: ...`);
}
```

This check runs inside the transaction, after the row lock is acquired, before any journal entries are inserted. If it throws, the transaction rolls back completely — no partial posting is possible.

---

## Verification Item 6 — chargeCode text is only a non-WAD fallback/display path

**PASS ✅**

The execution path is exclusive. When `chargeCodeId != null`, the function returns from lines 64–68 without evaluating line 72. The text snapshot check (`if (chargeCode) return 'DIRECT'`) is only reachable when `chargeCodeId == null`:

```
chargeCodeId != null → DB lookup → return from lines 64-68  [text never evaluated]
chargeCodeId == null → fall through to line 72               [text snapshot path]
```

The `chargeCode` text snapshot column (`job_code` in the cost record) is preserved for display and legacy traceability purposes. It has no effect on classification when `chargeCodeId` is present.

---

## Verification Item 7 — WAD-linked labor cannot post without productionWorkOrderId, projectId, chargeCodeId

**PASS ✅ — All three are required**

```
productionWorkOrderId requirement:
  laborPostingService.ts line 137:
  const wadRecords = records.filter((r) => r.productionWorkOrderId != null);
  → Records without productionWorkOrderId are routed to nonWadRecords; they never
    enter WAD grouping or WAD journal entry creation.

chargeCodeId requirement:
  laborPostingService.ts lines 141–143:
  const missingAttribution = wadRecords.filter(
    (r) => r.chargeCodeId == null || r.projectId == null,
  );
  → Throws before any writes if chargeCodeId is null on any WAD record.

projectId requirement:
  Same check — throws if projectId is null on any WAD record.
```

A WAD cost record that passes all three checks and enters the journal entry loop is guaranteed to have all three fields set. The stamp UPDATE (lines 290–304) matches on all five compound key fields.

---

## Verification Item 8 — Non-WAD indirect/overhead posting still works

**PASS ✅**

The non-WAD path is unchanged in structure:

```typescript
const nonWadRecords = records.filter((r) => r.productionWorkOrderId == null);

const nonWadTotals: Record<string, number> = {};
for (const rec of nonWadRecords) {
  nonWadTotals[ct] = (nonWadTotals[ct] ?? 0) + Number(rec.dollarCost);
}
```

One journal entry per distinct `costType` (DIRECT/OVERHEAD/G_AND_A) is created for non-WAD records. The stamp UPDATE at lines 228–238 includes `isNull(laborCostRecords.productionWorkOrderId)` — ensuring WAD records are never incorrectly stamped by a non-WAD journal entry.

The `classifyLaborCost` non-WAD fallback path (lines 71–83) is unchanged: `chargeCode` text → `DIRECT`; `departmentCode` → cost center lookup → `G_AND_A` / `OVERHEAD`; final fallback → `OVERHEAD`. Non-WAD classification behavior is identical to pre-hardening.

---

## Verification Item 9 — skippedAlreadyPosted behavior still works

**PASS ✅**

Lines 64–66 (outer scope):
```typescript
let skippedAlreadyPosted = 0;
```

Lines 126–127 (inside transaction):
```typescript
skippedAlreadyPosted = allRecords.filter((r) => r.journalEntryId != null).length;
const records = allRecords.filter((r) => r.journalEntryId == null);
```

Line 313 (return):
```typescript
return { runId, journalEntryIds, skippedAlreadyPosted };
```

Route handler line 542:
```typescript
skippedAlreadyPosted: result.skippedAlreadyPosted,
```

The count is computed correctly inside the transaction (where the full record set is visible), assigned to the outer closure variable, and returned to the caller. The route surfaces it in the JSON response body.

---

## Verification Item 10 — No UI, traveler clock-in, payroll, or unrelated timekeeping behavior changed

**PASS ✅**

File diff scope:
- `server/src/services/laborPostingService.ts` — GL posting service only
- `server/src/services/laborCostingService.ts` — cost classification and calculation
- `server/storage.ts` — one method added (`getChargeCodeById`), nothing removed or modified

No client files were touched. No timekeeping route files were touched. No traveler session management, payroll export, Gusto integration, or labor approval flow files were touched. The `authenticateToken` + `requireAdminAccess` middleware on the cost accounting router is unchanged (lines 17–18 of `costAccounting.ts`).

---

## Transaction Safety — Line-by-Line Summary

```
postLaborToGL enters db.transaction()
│
├── SELECT labor_posting_runs FOR UPDATE        ← ROW LOCK ACQUIRED
│   ├── no row → throw (no tx started yet → implicit rollback)
│   └── status=POSTED → throw 409 (lock released on rollback)
│
├── SELECT labor_account_config                 ← inside tx
│
├── SELECT labor_cost_records WHERE period      ← inside tx
│   └── no records → throw (rollback, lock released)
│
├── [in-memory: filter, split, fail-closed checks]
│   └── missing attribution → throw (rollback, lock released, NOTHING written)
│
├── [in-memory: aggregation buckets]
│
├── INSERT journal_entries (non-WAD × N)       ← inside tx
├── INSERT journal_lines (non-WAD × 2N)        ← inside tx
├── UPDATE labor_cost_records stamp (non-WAD)  ← inside tx
│
├── INSERT journal_entries (WAD × M)           ← inside tx
├── INSERT journal_lines (WAD × 2M)            ← inside tx
├── UPDATE labor_cost_records stamp (WAD)      ← inside tx
│
└── UPDATE labor_posting_runs SET POSTED       ← inside tx
    COMMIT                                      ← LOCK RELEASED
```

Any exception at any step rolls back the entire transaction. No partial posting state is possible.

---

## One Pre-Existing Observation (Not a Patch Regression)

`voidLaborPosting` (lines 331–411) reads the posting run row inside its transaction but **without** `.for('update')`. The risk of concurrent voiding is lower (voiding requires `status = POSTED`; two simultaneous voids is a rare admin scenario; the worst outcome — both mark entries VOIDED and clear back-links — is idempotent). This was present before the hardening patch and was not introduced by it. It is listed in the deferred risk register.

---

## Remaining Non-Critical Risks (Deferred — Unchanged from Prior Audit)

| Finding | Severity | Description |
|---------|----------|-------------|
| No UNIQUE constraint on `canonical_id` | HIGH | Concurrent `processLaborCosts` can produce duplicate cost records for the same punch |
| No DB indexes on period/WAD columns | HIGH | Full table scans on all period queries and stamp UPDATEs |
| No FK constraints on `productionWorkOrderId`, `projectId`, `chargeCodeId` in `labor_cost_records` | HIGH | Attribution IDs can become dangling references |
| `travelerId` in `labor_cost_records` lacks FK | MEDIUM | Traveler traceability not DB-enforced |
| `postedBy` from request body, not auth session | MEDIUM | DCAA audit trail identity is caller-supplied |
| Post-void recalculation reuses VOIDED run | MEDIUM | Journal entries for re-post reference a VOIDED run |
| `processLaborCosts` delete + insert non-transactional | MEDIUM | Partial failure leaves CALCULATED run with no records |
| `voidLaborPosting` run read without FOR UPDATE | LOW | Concurrent voids idempotent but unguarded |

---

## Recommendation

**Charge Code Engine Phase 1 (Blocker 2) may begin.**

The two accounting risks that blocked it are fully resolved:

1. **Concurrent double-posting** is eliminated by `SELECT ... FOR UPDATE` at the start of the posting transaction. The lock is held for the full duration of all GL writes.

2. **WAD cost misclassification** is eliminated by authoritative `charge_codes.type` lookup when `chargeCodeId` is present, with fail-closed behavior when the charge code does not exist.

The remaining risks in the table above are real but do not affect posting correctness under normal (non-concurrent-calculation) usage. They should be tracked as separate work items and addressed before this system operates at high volume.
