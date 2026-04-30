# PRIOR-PERIOD DRAFT JOURNAL ENTRIES — FORENSIC AUDIT
**Date:** 2026-04-25  
**Flag:** `NO_PERIOD_LOCKING` (HIGH severity)  
**Current DCAA Score:** 82.38  
**Method:** Read-only — direct DB queries, source code inspection  
**Scope:** journal_entries, journal_lines, payments, admin_audit_log, GL service, cost accounting routes

---

## Database Evidence — Schema Facts

```
journal_entries columns:
  id, transaction_type, reference_type, reference_id, effective_date,
  status, memo, created_by, created_at, updated_at, exported_at

journal_lines columns:
  id, journal_entry_id, account_id, debit_amount, credit_amount,
  created_at, updated_at

Total journal_entries in DB: 5
Total with status=DRAFT: 5
Total with effective_date < 2026-04-01 (prior period): 5
```

All 5 journal entries in the database are in DRAFT status and in a prior period. There are **no POSTED, VOIDED, or EXPORTED entries**. This is the first and only GL activity recorded.

---

## The 5 DRAFT Entries — Complete Table

| ID | Transaction Type | Ref Type | Ref ID | Effective Date | Memo | Created At | Created By | Lines | Total Debit | Total Credit | Balanced |
|----|-----------------|----------|--------|----------------|------|-----------|------------|-------|-------------|--------------|---------|
| 1 | WIRE_PAYMENT | payment | **81** | 2026-03-02 | `"test"` | 2026-03-02 17:58:38 | admin | 2 | $180.95 | $180.95 | **YES** |
| 2 | WIRE_PAYMENT | payment | **82** | 2026-03-02 | `"test"` | 2026-03-02 17:58:38 | admin | 2 | $800.95 | $800.95 | **YES** |
| 3 | WIRE_PAYMENT | payment | **83** | 2026-03-02 | `"test2"` | 2026-03-02 20:34:02 | admin | 2 | $616.00 | $616.00 | **YES** |
| 4 | WIRE_PAYMENT | payment | **84** | 2026-03-02 | `"test2"` | 2026-03-02 20:34:02 | admin | 2 | $669.00 | $669.00 | **YES** |
| 5 | WIRE_PAYMENT | bulk_wire | **0** | 2026-03-02 | `"Test 3"` | 2026-03-02 23:07:12 | admin | 3 | $1,148.00 | $1,148.00 | **YES** |

### Journal Lines Detail

**Entry 1 & 2 (first batch, 17:58):**
```
Entry 1:  DR account_id=1  $180.95   |  CR account_id=2  $180.95  (payment ref 81)
Entry 2:  DR account_id=1  $800.95   |  CR account_id=2  $800.95  (payment ref 82)
```

**Entry 3 & 4 (second batch, 20:34):**
```
Entry 3:  DR account_id=1  $616.00   |  CR account_id=2  $616.00  (payment ref 83)
Entry 4:  DR account_id=1  $669.00   |  CR account_id=2  $669.00  (payment ref 84)
```

**Entry 5 (consolidated bulk, 23:07):**
```
Entry 5:  DR account_id=1  $1,133.00 |
          DR account_id=3  $15.00    |  CR account_id=2  $1,148.00  (bulk_wire ref 0)
```

### Referenced Payment Records

| Payment ID | Order ID | Amount | Type | Notes | Batch ID |
|-----------|----------|--------|------|-------|---------|
| 81 | AG063 | $180.95 | wire | `"test"` | null |
| 82 | AG460 | $800.95 | wire | `"test"` | null |
| 83 | EI487 | $616.00 | wire | `"test2"` | null |
| 84 | EI452 | $669.00 | wire | `"test2"` | null |

**Entry 5 — bulk_wire reference_id=0:** No valid record. `reference_id=0` is not a real database ID. This is an orphaned entry with no traceable source document.

---

## Root Cause Analysis

### Classification

All 5 entries share identical characteristics that confirm a single root cause:

| Signal | Evidence |
|--------|----------|
| All created same day | 2026-03-02 (one day, three sessions: 17:58, 20:34, 23:07) |
| Memo values | "test", "test", "test2", "test2", "Test 3" — sequential test naming |
| Payment notes | payments 81–84 have notes="test" or "test2" matching JE memos |
| Created by | all by `admin` |
| No progression | status never advanced past DRAFT; no export; no post attempt |
| No audit trail | admin_audit_log shows no journal_entries actions |
| Entry 5 orphaned | reference_id=0 — invalid, no matching bulk_wire record |

**Root cause: Test/development entries created during initial GL wire-payment posting feature development on 2026-03-02. All 5 were test runs that were never cleaned up and are not legitimate business transactions.**

The developer created these in three sessions on the same day — first testing individual wire payments (17:58 session: entries 1–2; 20:34 session: entries 3–4), then testing the consolidated bulk wire path (23:07 session: entry 5). None were voided or cleaned up, leaving them permanently in DRAFT in a prior accounting period.

### Classification Per Entry

| Entry | Classification |
|-------|---------------|
| 1 | **Test/development entry** — "test" memo, payment 81 also marked test |
| 2 | **Test/development entry** — "test" memo, payment 82 also marked test |
| 3 | **Test/development entry** — "test2" memo, payment 83 also marked test2 |
| 4 | **Test/development entry** — "test2" memo, payment 84 also marked test2 |
| 5 | **Orphaned test entry** — reference_id=0 (no valid source document), "Test 3" memo |

---

## Recommended Action Per Entry

| Entry | Action | Reasoning |
|-------|--------|-----------|
| 1 | **VOID** | Confirmed test entry (memo+payment notes both say "test"). Not a legitimate business posting. |
| 2 | **VOID** | Confirmed test entry (memo+payment notes both say "test"). Not a legitimate business posting. |
| 3 | **VOID** | Confirmed test entry (memo+payment notes both say "test2"). Not a legitimate business posting. |
| 4 | **VOID** | Confirmed test entry (memo+payment notes both say "test2"). Not a legitimate business posting. |
| 5 | **VOID** | Orphaned entry — reference_id=0 is invalid. No real source document. Definitively unpostable. |

**None of the 5 should be POSTed.** Posting test entries to the GL would incorrectly record fictitious wire payments as accounting facts. All 5 must be VOID'd, with an audit trail entry for each.

**Note on payments 81–84:** The underlying payment records (referencing real orders AG063, AG460, EI487, EI452) may or may not represent real transactions — that determination is out of scope here. The journal entries are confirmed test entries regardless of the payment records' validity.

---

## Workflow Support Audit

### What Exists

| Operation | Route | Service | Status |
|-----------|-------|---------|--------|
| List journal entries (with lines) | `GET /api/finance/accounting/journal-entries` | inline | ✓ IMPLEMENTED |
| Calculate labor costs | `POST /api/cost-accounting/calculate-labor-costs` | laborCostingService | ✓ IMPLEMENTED |
| Post labor to GL | `POST /api/cost-accounting/post-labor-to-gl` | laborPostingService | ✓ IMPLEMENTED |
| Void labor GL posting | `POST /api/cost-accounting/void-labor-posting` | laborPostingService | ✓ IMPLEMENTED |

### What Is Missing

| Operation | Status | Impact |
|-----------|--------|--------|
| Void individual WIRE_PAYMENT journal entry | **NOT IMPLEMENTED** | Cannot void entries 1–5 via API |
| Post individual WIRE_PAYMENT journal entry | **NOT IMPLEMENTED** | No non-labor posting path |
| Period close / period lock | **NOT IMPLEMENTED** | Core DCAA gap — no mechanism to prevent retroactive changes |
| Accounting period management | **NOT IMPLEMENTED** | No period table, no lock/unlock workflow |
| Audit trail for journal entry status changes | **NOT IMPLEMENTED** | admin_audit_log not wired to journal_entries |

### Key Gap

The existing void route (`POST /api/cost-accounting/void-labor-posting`) operates on **labor posting runs** only. It requires a `laborPostingRun` record for the period and targets entries created by the labor posting engine. It **cannot void WIRE_PAYMENT entries** — there is no labor posting run for March 2026, and these entries were not created via the labor path.

There is **no API route** to void an individual journal entry by ID.

---

## Implementation Recommendation

### Option A: Admin Review + Targeted Void Route (RECOMMENDED)

**Do this first — minimum viable, lowest risk:**

1. Build `POST /api/cost-accounting/void-journal-entry/:id`
   - Accepts body: `{ reason: string, voidedBy: string }`
   - Validates: entry must be DRAFT; requires admin auth
   - Writes an `audit_events` record: `{ action: 'JOURNAL_ENTRY_VOIDED', entityId: id, reason, by }`
   - Updates `journal_entries.status = 'VOIDED'`
   - Does **not** delete. Does **not** reverse lines. Marks void only.
   - Returns the voided entry

2. Admin calls this route for entries 1–5 with appropriate reason strings.
   Example reason for all 5: `"Test entry created during GL development on 2026-03-02 — not a business transaction"`

3. After voiding all 5, `PERIOD_LOCKING` scorer returns 1.0.

**Why not Option B (automatic void)?** The void action must be deliberately human-authorized for DCAA compliance. An automated void without a named accountant approver would introduce a new audit trail gap that DCAA would question — *who voided these entries and why?*

**Why not Option C (period close)?** Period close is a correct long-term solution but a larger build. It shouldn't block resolving these 5 entries today.

**Option D (mixed):** Implement Option A now. After the 5 entries are resolved, build the period-close/lock workflow as a follow-on task (Pass 3 or dedicated accounting-controls sprint). The period-lock mechanism is needed to prevent new DRAFT entries from accumulating in future months.

---

## Files To Inspect / Modify (Implementation Only — Not Now)

| File | Purpose |
|------|---------|
| `server/src/routes/costAccounting.ts` | Add `POST /void-journal-entry/:id` route |
| `server/src/services/accountingService.ts` | May need a `voidJournalEntry()` service method |
| `server/schema.ts` | Verify `journalEntries` Drizzle table definition for status values |
| `server/src/services/edriDomainScorers.ts` | No change needed — scorer correctly reads DRAFT count |

---

## Expected Score Movement

| Condition | PERIOD_LOCKING Score | Est. DCAA Delta | Est. Total Score |
|-----------|---------------------|-----------------|-----------------|
| Current (5 DRAFT entries) | 0.5 | — | **82.38** |
| After voiding all 5 (0 entries) | 1.0 | **+~3 pts** | **~85.38** |

The `potentialScoreRecovery` for this flag is listed as 6 points total (full resolution from 0→1.0). Currently at 0.5, the remaining recoverable value is half = approximately **+3 points** to the composite DCAA score.

This would move the score from 82.38 → ~85.38, keeping it in the PASSABLE range and closing the only HIGH-severity flag remaining in the dev environment.

---

## Safest Next Implementation Prompt

```
IMPLEMENTATION: WIRE PAYMENT JOURNAL ENTRY VOID ROUTE

Strict scope:
- Add POST /api/cost-accounting/void-journal-entry/:id to costAccounting.ts
- Requires admin auth (authenticateToken + requireAdminAccess already on router)
- Body: { reason: string, voidedBy: string }
- Validates entry is DRAFT (reject if POSTED, VOIDED, or EXPORTED)
- Validates transaction_type is WIRE_PAYMENT (not for labor entries — those have their own void path)
- Updates status to 'VOIDED' via drizzle update
- Writes one audit_events row: action='JOURNAL_ENTRY_VOIDED', entity_type='journal_entry', entity_id
- Returns the updated entry
- Do NOT delete journal_lines
- Do NOT reverse or create counter-entries
- Do NOT touch the referenced payment record

After implementation:
- Admin voids entries 1-5 each with reason: "Test entry — created during GL development 2026-03-02, not a business transaction"
- Confirm PERIOD_LOCKING scorer returns 1.0
- Confirm DCAA score reaches ~85.38
```

---

## Audit Trail

| DB Query | Result |
|----------|--------|
| `SELECT * FROM journal_entries WHERE status='DRAFT' AND effective_date < '2026-04-01'` | 5 rows (IDs 1–5) |
| `SELECT * FROM journal_lines WHERE journal_entry_id IN (1,2,3,4,5)` | 11 lines, all balanced |
| `SELECT * FROM payments WHERE id IN (81,82,83,84)` | All have notes="test" or "test2" |
| `SELECT * FROM admin_audit_log WHERE ... journal ...` | 0 rows — no audit history |
| `SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%period%'` | No accounting period tables |
| `grep -rn "void.*journal\|journal.*void" server/src/routes/` | No wire payment void route found |
