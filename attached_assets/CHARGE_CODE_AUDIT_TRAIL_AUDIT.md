# FORENSIC AUDIT — CHARGE CODE AUDIT TRAIL
## NO_CHARGE_CODE_AUDIT Resolution
**Date:** 2026-04-25  
**Mode:** READ-ONLY — no code modified, no rows inserted  
**Starting Dev Score:** ~85.38  

---

## 1. Files Inspected

| File | Purpose |
|---|---|
| `server/schema.ts` (lines 5232–5254) | `chargeCodes` table definition |
| `server/schema.ts` (lines 10916–10944) | `auditEvents` table definition |
| `server/src/routes/chargeCodes.ts` | Only charge code mutation routes (53 lines) |
| `server/src/routes/index.ts` | Route registration |
| `server/storage.ts` (lines 2992–2996, 25227–25253) | `IStorage` interface + `MemStorage` charge code methods |
| `server/src/services/edriDomainScorers.ts` (lines 287–374) | `scoreChargeCode()` — all 5 checks |
| `server/src/services/edriScoringService.ts` (lines 32–56, 90–129) | Domain weights, composite score formula |
| `server/src/routes/timekeeping.ts` | Checked for charge code mutations — read-only charge code usage only |
| `server/src/routes/labor.ts` | Checked for charge code mutations — read-only charge code usage only |

---

## 2. `charge_codes` Table Schema

```
id              serial PK
code            text UNIQUE NOT NULL
description     text
type            text DEFAULT 'DIRECT'   -- DIRECT | OVERHEAD | G_AND_A | IR_AND_D | B_AND_P
contract_reference text
department      text
requires_approval boolean DEFAULT false
max_hours_per_day double precision
billable        boolean DEFAULT true
active          boolean DEFAULT true    -- deactivation flag
created_at      timestamptz
updated_at      timestamptz
```

**Key observation:** `active = false` is the deactivation mechanism. There is no separate DELETE or DEACTIVATE route — deactivation is accomplished via `PATCH /api/charge-codes/:id` with `{ "active": false }`.

**Current DB state:** 13 charge codes (IDs 1–15, 31, 32), all `active=true`, all created 2026-04-25 via seed scripts. No audit events were generated during seeding.

---

## 3. Mutation Routes — Where Charge Codes Are Changed

### File: `server/src/routes/chargeCodes.ts`

#### Route 1 — CREATE
```
POST /api/charge-codes
Auth: authenticateToken + requireRole('ADMIN')
Handler: storage.createChargeCode(parsed.data)
Audit: NONE
```

#### Route 2 — UPDATE (and DEACTIVATE)
```
PATCH /api/charge-codes/:id
Auth: authenticateToken + requireRole('ADMIN')
Handler: storage.updateChargeCode(id, parsed.data)
Audit: NONE
Deactivation: This same route handles { active: false } — no separate route
```

#### Route 3 — LIST / GET
```
GET /api/charge-codes
Auth: authenticateToken (no admin required)
Handler: storage.listChargeCodes(activeOnly)
Audit: N/A — read-only
```

**No DELETE route exists.** No separate override or approval workflow endpoint exists.

### Storage Layer: `server/storage.ts`

```typescript
// IStorage interface (lines 2992–2996)
listChargeCodes(activeOnly?: boolean): Promise<ChargeCode[]>;
getChargeCodeByCode(code: string): Promise<ChargeCode | undefined>;
getChargeCodeById(id: number): Promise<ChargeCode | undefined>;
createChargeCode(data: InsertChargeCode): Promise<ChargeCode>;
updateChargeCode(id: number, data: Partial<InsertChargeCode>): Promise<ChargeCode | undefined>;

// MemStorage implementations (lines 25245–25253)
async createChargeCode(data) { return db.insert(chargeCodes).values(data).returning() }
async updateChargeCode(id, data) { return db.update(chargeCodes).set(data).where(eq(chargeCodes.id, id)).returning() }
```

**Neither storage method writes any audit event.** They are pure DB operations with no side effects.

### Other Routes Checked

- `server/src/routes/timekeeping.ts` — reads `chargeCode` from open session, no mutation
- `server/src/routes/labor.ts` — reads `chargeCode` from entries, no mutation
- `server/src/routes/travelers.ts` — no charge code mutation
- `server/src/routes/pmDashboard.ts` — no charge code mutation

**Conclusion: The only two mutation paths are `POST` and `PATCH` in `chargeCodes.ts`. Both are gated to ADMIN. Neither writes audit events.**

---

## 4. `audit_events` Table Schema

```
id          serial PK
entity_type text NOT NULL     -- e.g. 'charge_code'
entity_id   text NOT NULL     -- String cast of the record ID
action      text NOT NULL     -- e.g. 'CHARGE_CODE_CREATED'
actor_id    integer FK → employees.id
actor_name  text
actor_role  text
reason      text
fields_changed jsonb          -- { fieldName: { from, to } }
meta        jsonb
ip_address  text
user_agent  text
timestamp   timestamptz DEFAULT now()
created_at  timestamptz DEFAULT now()
```

**Current audit_events rows with charge code relevance:** 0

Full entity_type distribution in DB:
- `edri_notification`: 9 rows
- `edri_snapshot`: 86 rows
- `employee_onboarding`: 10 rows
- `journal_entry`: 5 rows (our VOID events from Pass 2)
- `p1_order`: 68 rows
- `qr_code`: 1 row
- `ticket`: 1 row
- `user_session`: 10 rows
- **`charge_code`: 0 rows**

---

## 5. Exact Scorer Expectation

### File: `server/src/services/edriDomainScorers.ts` — lines 356–372

```typescript
// Check 5: Supervisor override trail — check for audit events on charge codes
const ccAuditCount = await safeCount(`
  SELECT COUNT(*) as count FROM audit_events
  WHERE entity_type = 'charge_code' OR entity_type LIKE '%charge%'
  LIMIT 1000
`);
checks['SUPERVISOR_OVERRIDE_TRAIL'] = ccAuditCount === null ? 0.5 : ccAuditCount > 0 ? 1 : 0;

if (ccAuditCount === 0) {
  redFlags.push({
    domainKey: 'CHARGE_CODE', flagKey: 'NO_CHARGE_CODE_AUDIT', severity: 'MEDIUM',
    title: 'Charge Code Changes Not Audited',
    description: 'No audit events for charge code changes. All modifications must be logged.',
    farCitation: 'FAR 31.201-2(c)', potentialScoreRecovery: 3,
  });
}
```

### Exact requirements to clear the flag:
1. At least **one** `audit_events` row where `entity_type = 'charge_code'` (exact match) **OR** `entity_type LIKE '%charge%'` (partial match)
2. The action value is not constrained by the scorer — any action string is accepted
3. No minimum field requirements — `actorId`, `actorName`, `fieldsChanged` are all nullable

**Minimum threshold to pass:** `ccAuditCount > 0` → `score = 1`  
**To fail:** `ccAuditCount = 0` → `score = 0` (current state)

### All 5 CHARGE_CODE domain checks:

| Check Key | Query / Condition | Current Value | Current Score |
|---|---|---|---|
| `IRD_BP_CATEGORIES` | `type IN ('IR_AND_D','B_AND_P',...) COUNT > 0` | 2 (IND-IRD, IND-BNP) | **1** |
| `FRINGE_POOL` | `cost_centers WHERE type='FRINGE' COUNT > 0` | 1 (seeded) | **1** |
| `WAD_GL_LINK` | `labor_cost_records unlinked / total ≤ 10%` | 0 cost records → rate=0 | **1** |
| `GA_OVERHEAD_POOL` | `type IN ('G_AND_A','OVERHEAD') COUNT > 0` | 14 codes | **1** |
| `SUPERVISOR_OVERRIDE_TRAIL` | `audit_events entity_type='charge_code' COUNT > 0` | **0** | **0** |

**Current CHARGE_CODE rawScore:** (1+1+1+1+0)/5 × 100 = **80**

**After fix:** (1+1+1+1+1)/5 × 100 = **100**

---

## 6. Score Impact Calculation

### CHARGE_CODE domain weight: 0.20 (from `DOMAIN_WEIGHTS`, `edriScoringService.ts` line 34)
### Composite formula: `sum(domain_rawScore × normalized_weight)` across 6 active domains

| Domain | Weight | Notes |
|---|---|---|
| TIMEKEEPING | 0.30 | |
| CHARGE_CODE | 0.20 | ← this fix |
| ACCOUNTING | 0.20 | |
| PROCUREMENT | 0.10 | |
| INVENTORY | 0.10 | |
| POLICY | 0.10 | |
| GOVT_PROPERTY | 0.00 | excluded from normalization |

Total active weight = 1.00 → normalized weight for CHARGE_CODE = **0.20**

**Delta:** CHARGE_CODE rawScore: 80 → 100 = +20 pts domain  
**Composite delta:** +20 × 0.20 = **+4 pts composite**

**Expected dev score after fix:** ~85.38 + 4.00 = **~89.38**

Note: `potentialScoreRecovery: 3` in the scorer is a conservative estimate. The actual computed delta based on the scoring formula is **+4 pts**.

---

## 7. Missing Audit Hooks — Gap Summary

| Operation | Route | Storage Method | Audit Hook Exists? | Gap |
|---|---|---|---|---|
| CREATE | `POST /api/charge-codes` | `createChargeCode()` | **NO** | No `audit_events` insert after successful create |
| UPDATE | `PATCH /api/charge-codes/:id` | `updateChargeCode()` | **NO** | No `audit_events` insert after successful update |
| DEACTIVATE | `PATCH /api/charge-codes/:id` with `{active:false}` | `updateChargeCode()` | **NO** | Same route — no deactivation-specific audit |
| LIST / GET | `GET /api/charge-codes` | `listChargeCodes()` | N/A | Read-only, not required |

---

## 8. Recommended Implementation Path

### Recommendation: Option A — Route Layer Hook

**Add `audit_events` inserts directly in `server/src/routes/chargeCodes.ts` after each successful mutation.**

#### Why Option A over Option B (Storage Layer):

| Concern | Route Layer (A) | Storage Layer (B) |
|---|---|---|
| Access to `req.user` actor | **Direct** — `req.user.id`, `req.user.username`, `req.user.role` | **Indirect** — must thread actor params through method signatures |
| Storage interface purity | Unchanged — storage stays a thin DB wrapper | Coupling audit logic into storage layer |
| IStorage interface changes | None required | Would require adding `actorId?` params to `createChargeCode` / `updateChargeCode` |
| Scope of callers | Only 2 routes call these methods (confirmed) | Would catch hypothetical direct storage calls, but none exist |
| DCAA audit quality | **Higher** — captures real HTTP actor identity | Lower — actor must be passed in or defaults to null |
| Risk of regression | Low — only 53-line file changes | Moderate — storage changes affect all callers |

#### What needs to change (Option A):

**File:** `server/src/routes/chargeCodes.ts`

**Imports to add:**
```typescript
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { auditEvents } from '../../schema';
```

**POST handler:** After `storage.createChargeCode()` succeeds, insert:
```typescript
await db.insert(auditEvents).values({
  entityType: 'charge_code',
  entityId: String(created.id),
  action: 'CHARGE_CODE_CREATED',
  actorId: (req.user as any)?.id ?? null,
  actorName: (req.user as any)?.username || (req.user as any)?.email || 'admin',
  actorRole: (req.user as any)?.role || 'ADMIN',
  fieldsChanged: { code: created.code, type: created.type, active: created.active },
  meta: { billable: created.billable, requiresApproval: created.requiresApproval },
});
```

**PATCH handler:** Before returning, detect deactivation and insert:
```typescript
const isDeactivation = parsed.data.active === false && previousEntry.active === true;
await db.insert(auditEvents).values({
  entityType: 'charge_code',
  entityId: String(id),
  action: isDeactivation ? 'CHARGE_CODE_DEACTIVATED' : 'CHARGE_CODE_UPDATED',
  actorId: (req.user as any)?.id ?? null,
  actorName: (req.user as any)?.username || (req.user as any)?.email || 'admin',
  actorRole: (req.user as any)?.role || 'ADMIN',
  fieldsChanged: parsed.data,  // Changed fields only
  reason: (req.body as any).reason ?? null,
});
```

**Note for PATCH:** Must fetch the existing record before updating to:
1. Detect deactivation (was `active=true`, now `active=false`)
2. Populate `fieldsChanged` with before/after diff

---

## 9. What NOT To Do

- **Do not seed fake audit rows** — scorer count must reflect real system activity
- **Do not change scorer logic** — the query is correct and minimal
- **Do not add approval workflow** — no approval gate is required by the scorer; any audit event suffices
- **Do not modify storage interface signatures** — unnecessary with Option A
- **Do not add `entity_type = 'CHARGE_CODE'` (uppercase)** — scorer matches lowercase `'charge_code'` exact

---

## 10. Safest Next Implementation Prompt

> Implement charge code audit logging at the route layer.
> 
> Target file: `server/src/routes/chargeCodes.ts`
>
> Requirements:
> 1. Add imports: `eq` from `drizzle-orm`, `db` from `../../db`, `auditEvents` from `../../schema`
> 2. `POST /api/charge-codes`: After `storage.createChargeCode()` succeeds, insert one `audit_events` row with `entity_type='charge_code'`, `action='CHARGE_CODE_CREATED'`, actor from `req.user`, `fieldsChanged` with the created record's `code`, `type`, `active` values
> 3. `PATCH /api/charge-codes/:id`: 
>    - Fetch the existing record via `storage.getChargeCodeById(id)` BEFORE updating (need the before-state)
>    - After `storage.updateChargeCode()` succeeds, insert one `audit_events` row with `entity_type='charge_code'`
>    - Use `action='CHARGE_CODE_DEACTIVATED'` if `parsed.data.active === false && existing.active === true`, otherwise `action='CHARGE_CODE_UPDATED'`
>    - `fieldsChanged` should include a `{ from, to }` diff for any field present in `parsed.data`
>    - Actor from `req.user`
> 4. No storage interface changes. No schema changes. No scorer changes.
> 5. Do not modify any other file.
>
> Expected outcome: `ccAuditCount > 0` → `SUPERVISOR_OVERRIDE_TRAIL` score 0→1 → CHARGE_CODE domain 80→100 → composite score +4 pts → dev score ~89.38

---

## Summary

| Item | Detail |
|---|---|
| Flag | `NO_CHARGE_CODE_AUDIT` (CHARGE_CODE domain, MEDIUM severity) |
| Scorer check | `SUPERVISOR_OVERRIDE_TRAIL` — currently 0, needs > 0 audit events |
| Scorer query | `SELECT COUNT(*) FROM audit_events WHERE entity_type='charge_code' OR entity_type LIKE '%charge%'` |
| Current count | **0** |
| Required count | **≥ 1** |
| Mutation routes | `POST /api/charge-codes` and `PATCH /api/charge-codes/:id` (both in `chargeCodes.ts`) |
| Storage methods | `createChargeCode()` and `updateChargeCode()` — no audit hooks |
| Recommended fix | Option A: Route layer — 3 imports + 2 audit inserts, ~30 lines |
| Expected delta | **+4 pts** composite (CHARGE_CODE 80→100 × weight 0.20) |
| Expected score after | **~89.38** |
| Files to change (implementation) | `server/src/routes/chargeCodes.ts` only |
| FAR citation | FAR 31.201-2(c) — Cost accounting system requirements |
