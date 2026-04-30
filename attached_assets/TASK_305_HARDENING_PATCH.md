# TASK #305 — HARDENING PATCH
## Critical Accounting Fix — Concurrent Posting Race + WAD Cost Classification

**Patch Date:** April 25, 2026  
**Scope:** Two critical findings from `TASK_305_POST_IMPLEMENTATION_AUDIT.md`  
**Code changes:** 3 files  
**Tests after patch:** 425 passing, 0 failing  
**Server startup:** Clean — no TypeScript errors

---

## Files Changed

| File | Change |
|------|--------|
| `server/src/services/laborPostingService.ts` | All state-sensitive reads moved inside the transaction; `SELECT ... FOR UPDATE` added to the run row; `storage` import removed; unused `CostType` import removed |
| `server/src/services/laborCostingService.ts` | `classifyLaborCost` rewritten to accept and use `chargeCodeId`; call site updated |
| `server/storage.ts` | `getChargeCodeById(id)` added to `IStorage` interface and `DatabaseStorage` implementation |

---

## Fix 1 — Concurrent Double-Posting (TOCTOU Race)

### Problem

The original `postLaborToGL` read the run status from the DB **outside** the transaction:

```
storage.getLaborPostingRunByPeriod()   ← status check, committed read
storage.getLaborAccountConfig()
storage.getLaborCostRecordsByPeriod()
fail-closed checks
in-memory grouping
db.transaction() → insert journal entries + stamp records + mark POSTED
```

Two concurrent HTTP requests both calling `POST /api/cost-accounting/post-labor-to-gl` for the same period would both pass the status check (run is `CALCULATED`), both complete the in-memory work, and both enter the transaction independently. Result: duplicate journal entries and duplicate GL lines for the same period.

### Fix — Strategy: SELECT ... FOR UPDATE inside the transaction

All state-sensitive reads were moved inside a **single atomic transaction**. The run row is selected with `FOR UPDATE` as the **first operation** inside that transaction:

```typescript
await db.transaction(async (tx) => {

  // ── 1. Lock the posting run row ─────────────────────────────────────────────
  const [run] = await tx
    .select()
    .from(laborPostingRuns)
    .where(and(
      eq(laborPostingRuns.periodYear, year),
      eq(laborPostingRuns.periodMonth, month),
    ))
    .for('update')
    .limit(1);

  if (!run) { throw new Error('No calculated run...'); }
  if (run.status === 'POSTED') { throw 409; }

  // ── 2. Load config (inside tx) ──────────────────────────────────────────────
  const [config] = await tx.select().from(laborAccountConfig).limit(1);

  // ── 3. Load cost records (inside tx) ────────────────────────────────────────
  const allRecords = await tx.select().from(laborCostRecords).where(...period...);

  // ── 4-8. Fail-closed + grouping + journal entry inserts + stamp UPDATEs ─────
  // ... unchanged logic, all using tx ...

  // ── 8c. Mark run POSTED — same transaction ───────────────────────────────────
  await tx.update(laborPostingRuns).set({ status: 'POSTED', ... }).where(...);
});
```

### Transaction boundary

```
BEGIN
  SELECT ... FROM labor_posting_runs FOR UPDATE          ← row lock acquired
  SELECT ... FROM labor_account_config
  SELECT ... FROM labor_cost_records WHERE period = ...
  [fail-closed checks — in memory, no DB]
  [grouping — in memory, no DB]
  INSERT INTO journal_entries ... RETURNING              ← repeated per bucket
  INSERT INTO journal_lines ...                          ← debit line
  INSERT INTO journal_lines ...                          ← credit line
  UPDATE labor_cost_records SET journal_entry_id = ...  ← stamp
  UPDATE labor_posting_runs SET status = 'POSTED'
COMMIT  ← lock released
```

A second concurrent transaction reaching `SELECT ... FOR UPDATE` on the same run row blocks at the DB level until the first transaction commits. After the first commits, the second acquires the lock, reads `status = 'POSTED'`, and immediately throws 409. No duplicate journal entries are possible.

### What was removed

- `import { storage }` — no longer used in `postLaborToGL`; the function now queries tables directly via `tx`
- `import type { CostType }` — was already unused (audit Finding LOW #11); removed

---

## Fix 2 — WAD Cost Classification Using chargeCode Text Snapshot (Finding C-1 / F-1)

### Problem

`classifyLaborCost` determined `DIRECT` vs `OVERHEAD` by checking whether the `chargeCode` **text snapshot** was truthy:

```typescript
// BEFORE
async function classifyLaborCost(jobCode: string | null, departmentCode: string | null) {
  if (jobCode) return 'DIRECT';          // jobCode = chargeCode text snapshot
  ...
  return 'OVERHEAD';
}
```

A WAD-linked punch session with `chargeCodeId` set (the authoritative FK) but `chargeCode` text null would classify as OVERHEAD. That session would then:
1. Pass the fail-closed check (chargeCodeId is non-null ✅)
2. Enter WAD grouping (productionWorkOrderId is non-null ✅)
3. Post to `overheadLaborAccountId` instead of `directLaborAccountId` ❌

### Fix — Authoritative lookup from charge_codes.type

`classifyLaborCost` now accepts `chargeCodeId` as its first argument. When `chargeCodeId` is present, it performs a DB lookup against `charge_codes.type` (the authoritative field: `DIRECT | OVERHEAD | G_AND_A`) and uses that value directly. The text snapshot is demoted to a fallback signal only for non-WAD sessions.

```typescript
// AFTER
export async function classifyLaborCost(
  chargeCodeId: number | null,
  chargeCode: string | null,
  departmentCode: string | null,
): Promise<CostType> {

  if (chargeCodeId != null) {
    // WAD path — authoritative lookup, fail-closed if charge code not found
    const cc = await storage.getChargeCodeById(chargeCodeId);
    if (!cc) {
      throw new Error(
        `Cannot classify labor cost: charge code ID ${chargeCodeId} does not exist. ` +
        `Resolve the invalid charge code reference before recalculating.`,
      );
    }
    const t = cc.type.toUpperCase();
    if (t === 'DIRECT') return 'DIRECT';
    if (t === 'G_AND_A') return 'G_AND_A';
    return 'OVERHEAD';
  }

  // Non-WAD path — text snapshot fallback (legacy behaviour preserved)
  if (chargeCode) return 'DIRECT';

  if (departmentCode) {
    const costCenter = await storage.getCostCenterByCode(departmentCode);
    if (costCenter) {
      const t = costCenter.type.toUpperCase();
      if (t === 'ADMINISTRATIVE') return 'G_AND_A';
      if (t === 'OVERHEAD') return 'OVERHEAD';
    }
  }

  return 'OVERHEAD';
}
```

Call site in `processLaborCosts` updated:

```typescript
// BEFORE
const costType = await classifyLaborCost(session.chargeCode ?? null, session.department ?? null);

// AFTER
const costType = await classifyLaborCost(
  session.chargeCodeId ?? null,
  session.chargeCode ?? null,
  session.department ?? null,
);
```

### New storage method

`getChargeCodeById(id: number)` added to `IStorage` and `DatabaseStorage`:

```typescript
async getChargeCodeById(id: number): Promise<ChargeCode | undefined> {
  const [row] = await db.select().from(chargeCodes).where(eq(chargeCodes.id, id)).limit(1);
  return row ?? undefined;
}
```

### Classification matrix after patch

| Session type | chargeCodeId | chargeCode text | Result |
|---|---|---|---|
| WAD, charge code type = DIRECT | set | any | `DIRECT` → `directLaborAccountId` ✅ |
| WAD, charge code type = DIRECT | set | **null** | `DIRECT` → `directLaborAccountId` ✅ (fixed) |
| WAD, charge code type = OVERHEAD | set | any | `OVERHEAD` → `overheadLaborAccountId` ✅ |
| WAD, charge code deleted/invalid | set (bad) | any | **throws error** — fail-closed ✅ |
| WAD, no charge code | null | null | blocked by `postLaborToGL` fail-closed ✅ |
| Non-WAD, has job code text | null | set | `DIRECT` ✅ (legacy preserved) |
| Non-WAD, admin department | null | null | `G_AND_A` ✅ |
| Non-WAD, overhead department | null | null | `OVERHEAD` ✅ |
| Non-WAD, no signals | null | null | `OVERHEAD` ✅ |

---

## Validation Results

### 1. Two concurrent posting calls cannot double-post
**Mechanism:** `SELECT ... FOR UPDATE` on the run row at transaction start. The second concurrent transaction blocks until the first commits with `status = POSTED`, then reads the updated status and throws 409. DB-enforced — no application-layer mutex needed.

### 2. WAD labor with chargeCodeId but null chargeCode text posts correctly
**Mechanism:** `classifyLaborCost` now checks `chargeCodeId` first, performs a DB lookup, and uses `charge_codes.type` as the authoritative source. Null text snapshot no longer affects the result.

### 3. WAD labor with invalid/missing chargeCodeId fails closed
**Two layers of protection:**
- At calculation time (`processLaborCosts`): `classifyLaborCost` throws if `chargeCodeId` is set but the charge code row does not exist.
- At posting time (`postLaborToGL`): the existing fail-closed check rejects any WAD cost record where `chargeCodeId IS NULL`.

### 4. Normal direct traveler labor still posts
Non-WAD path in `classifyLaborCost` is unchanged: text snapshot → DIRECT. Non-WAD path in `postLaborToGL` is unchanged: group by `costType` only. ✅

### 5. Non-WAD indirect/overhead posting still works
The non-WAD split (`productionWorkOrderId == null`) and its grouping/posting logic is unchanged. ✅

### 6. Already-posted records remain safely skipped
The `journalEntryId IS NULL` filter (step 4 inside the transaction) and the `AND journal_entry_id IS NULL` clause in every stamp UPDATE remain in place. Records stamped in a previous posting are invisible to the current run. ✅

### Test run
```
Test Files  28 passed (28)
     Tests  425 passed (425)
  Duration  18.70s
```
No regressions.

---

## Remaining Non-Critical Risks (not addressed in this patch)

Per the audit brief, the following are deferred:

| Finding | Severity | Status |
|---------|----------|--------|
| No DB indexes on period_year/month, WAD columns | HIGH | Deferred — performance, not correctness |
| No FK constraints on productionWorkOrderId, projectId, chargeCodeId in labor_cost_records | HIGH | Deferred — snapshot design decision |
| No UNIQUE constraint on canonical_id | HIGH | Deferred — concurrent recalculation race |
| travelerId in labor_cost_records lacks FK | MEDIUM | Deferred |
| postedBy comes from request body, not auth session | MEDIUM | Deferred — DCAA audit trail |
| Post-void recalculation reuses VOIDED run | MEDIUM | Deferred — pre-existing |
| processLaborCosts delete + insert non-transactional | MEDIUM | Deferred — availability, not double-posting |

---

## Go/No-Go Reassessment

The two CRITICAL findings are resolved:

- Duplicate GL posting under concurrency: **eliminated** (row-level lock)
- WAD mis-classification due to text snapshot: **eliminated** (authoritative DB lookup, fail-closed on invalid chargeCodeId)

**Charge Code Engine Phase 1 may now proceed**, subject to tracking the remaining HIGH/MEDIUM findings above as separate work items.
