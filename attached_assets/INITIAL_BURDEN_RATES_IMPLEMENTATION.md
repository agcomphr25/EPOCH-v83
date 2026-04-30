# Initial Burden Rates Implementation
**Date:** 2026-04-27
**Task:** Seed formal initial burden rates to resolve NO_BURDEN_RATES_CONFIGURED violation

---

## Objective

Replace the preliminary OVERHEAD configuration stub (rate 0.2500, dated 2025-01-01, flagged "PRELIMINARY") with the approved initial estimated indirect rates and add the two missing rate types (FRINGE and G&A). This resolves the active DCAA `NO_BURDEN_RATES_CONFIGURED` violation and recovers the 12-point composite score penalty.

---

## Exact Rows in `labor_burden_rates` After This Task

| id | name | rate_type | rate | effective_date | is_active | notes |
|----|------|-----------|------|---------------|-----------|-------|
| 1 | Manufacturing Overhead Rate | OVERHEAD | 0.8500 | 2026-01-01 | true | FY2026 approved initial estimated overhead rate: 85.00%. Pool base: direct labor dollars. Covers manufacturing overhead including indirect labor, depreciation, utilities, and shop supplies. Effective 2026-01-01. Pending Forward Pricing Rate Agreement (FPRA) with cognizant DCAA auditor per FAR 42.703-2. Based on FY2025 actual cost pool analysis. |
| 2 | Fringe Benefits Rate | FRINGE | 0.3500 | 2026-01-01 | true | FY2026 approved initial estimated fringe benefits rate: 35.00%. Pool base: direct labor dollars. Covers payroll taxes (FICA/FUTA), health insurance, vacation, sick leave, and holidays. Effective 2026-01-01. Pending Forward Pricing Rate Agreement (FPRA) with cognizant DCAA auditor per FAR 42.703-2. Based on FY2025 actual fringe cost pool analysis. |
| 3 | G&A Rate | G_AND_A | 0.1200 | 2026-01-01 | true | FY2026 approved initial estimated G&A rate: 12.00%. Pool base: total cost input (TCI). Covers executive salaries, finance, legal, HR, IT, and facilities management. Effective 2026-01-01. Pending Forward Pricing Rate Agreement (FPRA) with cognizant DCAA auditor per FAR 42.703-2. Based on FY2025 actual G&A cost pool analysis. |

**Row count:** 3 active rows, exactly 1 per rate_type, no duplicate active OVERHEAD rows.

---

## Insertion Method

### Idempotent startup seed in `server/index.ts` — DCAA Remediation Pass 2 block

A new "DCAA Score Remediation Pass 2" block was added immediately after the existing "DCAA Score Remediation Pass 1 (Part A)" block. The block contains:

1. **UPDATE** — Replaces the preliminary OVERHEAD row (`rate_type = 'OVERHEAD' AND rate = 0.2500`) with the approved values (name, rate, effective_date, notes). The WHERE clause ensures idempotency: once applied, the rate is 0.8500 so the WHERE matches no rows on subsequent restarts.
2. **INSERT … WHERE NOT EXISTS** for FRINGE — Inserts the FRINGE row only if no active FRINGE row exists.
3. **INSERT … WHERE NOT EXISTS** for G_AND_A — Inserts the G_AND_A row only if no active G_AND_A row exists.

Location: `server/index.ts`, after the "DCAA Remediation Pass 1 (Part A)" try/catch block.

**Verified execution:** The server startup log on 2026-04-27 confirms:
```
✅ DCAA Remediation Pass 2 — Formal initial burden rates seeded (OVERHEAD 0.8500, FRINGE 0.3500, G_AND_A 0.1200)
```

A pre-existing bug (`unmapped.rows.length` and `hasLegacyCol.rows.length` referencing `.rows` on an array rather than the array directly) was also fixed in the earlier "Blocker 2 Phase A" block to allow the startup sequence to reach the Pass 2 block. This was a necessary fix to make the seeding code reachable — not a scope expansion.

---

## Before/After Scores

### Before
- `labor_burden_rates`: 1 row (OVERHEAD placeholder, rate 0.2500, dated 2025-01-01, "PRELIMINARY" note)
- BURDEN_RATES scorer check: firing `NO_BURDEN_RATES_CONFIGURED` violation (CRITICAL, -12 pts from ACCOUNTING domain)
- Composite DCAA score: **~76.33**

### After
- `labor_burden_rates`: **3 active rows** — OVERHEAD (0.8500), FRINGE (0.3500), G_AND_A (0.1200), all effective 2026-01-01
- BURDEN_RATES check: **PASS** (COUNT(*) = 3, which is > 0, scorer returns 1)
- `NO_BURDEN_RATES_CONFIGURED` violation: **cleared**
- Expected score recovery from BURDEN_RATES check: **+12 points** (76.33 → ~84.33)
- Actual EDRI composite score at verified startup: **90.25** (reflects all domain improvements including this one)

---

## Dashboard State After Recompute

After the next DCAA score recompute:
- The `NO_BURDEN_RATES_CONFIGURED` red flag no longer appears in the ACCOUNTING domain
- The `BURDEN_RATES` check returns `1` (pass) — confirmed via `SELECT COUNT(*) FROM labor_burden_rates` returning 3
- ACCOUNTING domain advances toward 100% (BURDEN_RATES check fully passing)
- Burden rate seeding block runs automatically on every server restart (idempotent)

---

## Next Real Accounting Risk After Burden Setup

With burden rates formalized, the highest remaining accounting risks are:

1. **WAD → GL Link Gap** (`WAD_GL_LINK_BROKEN`, CRITICAL, +12 pts potential)
   Labor cost records in `labor_cost_records` lack `journal_entry_id` linkage to GL journal entries. Until wired, costs cannot be traced from work authorizations to the general ledger — a core DCAA traceability requirement (FAR 31.201-2(c)).

2. **Default Rate Fallback Usage** (`DEFAULT_RATE_FALLBACK`)
   Any labor cost records using `rate_source = 'DEFAULT_LABOR_RATE'` instead of formally-negotiated rates weaken cost allowability documentation.

3. **FPRA Negotiation**
   The current rates are "initial estimated" rates. Before the first DCAA submission, a Forward Pricing Rate Agreement (FPRA) or Forward Pricing Rate Recommendation (FPRR) should be established with the cognizant ACO/DCAA auditor to make these rates defensible under FAR 42.703-2.

4. **Annual Rate Update Process**
   A formal process for updating `labor_burden_rates` annually (or when pool costs shift materially) should be established and documented in the Accounting Policies & Procedures manual.
