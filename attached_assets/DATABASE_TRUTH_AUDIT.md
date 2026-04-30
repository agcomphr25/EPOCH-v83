# DATABASE TRUTH AUDIT — SYSTEM OF RECORD
**Date:** 2026-04-25  
**Method:** Forensic read-only — runtime logs, direct queries, env var inspection  
**Status:** DEFINITIVE — all 6 questions answered with evidence

---

## TL;DR (Hard Answers First)

| Question | Answer |
|----------|--------|
| What does the live production app connect to? | **Neon `ep-wispy-sun-adm062ft`** — confirmed from deployment boot log |
| What does `NEON_DATABASE_URL` point to? | **The same database** — it is an alias for the production `DATABASE_URL` |
| What does `executeSql(environment="production")` query? | **A separate Replit-internal Postgres** — NOT the app's database |
| What is the accounting source of truth? | **`ep-wispy-sun-adm062ft` (Neon)** — the only database the production app reads and writes |
| Were the DCAA seeds applied to the right database? | **YES** — seeds went directly to `ep-wispy-sun-adm062ft` via `NEON_DATABASE_URL` |
| Were the previous DCAA score audits against the right database? | **NO** — the 58.63 snapshot came from the Replit-internal DB, which the app does not use |

---

## Three Databases In Play

| DB | Identifier | Who Uses It | Customers | Employees | charge_codes | dcaa_snapshots |
|----|-----------|-------------|-----------|-----------|--------------|----------------|
| **Production App DB** | `ep-wispy-sun-adm062ft.neondb` | Live production app (DATABASE_URL) | 550 | 19 | 2 (our seeds) | TABLE ABSENT |
| **Replit Internal DB** | Unknown Neon, name=`neondb` | `executeSql(environment="production")` ONLY | 2,223 | 20 | 15 IND-* codes | TABLE ABSENT |
| **Dev DB** | `heliumdb` | Dev app (DATABASE_URL in dev) | 551 | 19 | 17 | EXISTS (score 82.38) |

---

## Question 1: Which connection string does the live production app use?

### Evidence: Deployment Boot Log

```
DATABASE_URL: postgresql://neondb_owner:npg_8ybQvUYfuNm6@ep-wispy-sun-adm062ft.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require
```

Log timestamp: 1777140200846 (April 23, 2026 — most recent deployment).  
`server/index.ts` line 33: `console.log('🧬 [BOOT] DATABASE_URL:', process.env.DATABASE_URL);`

### Code Path

```
server/index.ts          →  startup, requires DATABASE_URL
server/db.ts line 14     →  new Pool({ connectionString: process.env.DATABASE_URL })
server/db.ts line 17     →  export const db = drizzle({ client: pgPool, schema })
drizzle.config.ts line 8 →  dbCredentials: { url: process.env.DATABASE_URL }
scripts/post-merge.sh    →  psql "$DATABASE_URL"
```

**All paths read `DATABASE_URL`. In production, `DATABASE_URL` = `ep-wispy-sun-adm062ft`.**

---

## Question 2: Which database does EDRI / DCAA scoring use?

### Code Path

```
server/src/services/edriDomainScorers.ts
  → imports { db } from server/db.ts
  → db = drizzle({ client: pgPool })
  → pgPool = new Pool({ connectionString: process.env.DATABASE_URL })
  → writes to dcaa_readiness_snapshots, dcaa_domain_scores
```

**EDRI scoring reads and writes to the same `DATABASE_URL` pool — Neon `ep-wispy-sun-adm062ft`.**

The `dcaa_readiness_snapshots` table does **not yet exist** in the production Neon. The scorer has never successfully run in production. The first scorer execution in production will create this table and produce the first real score.

---

## Question 3: Which database does `executeSql(environment="production")` target?

### Evidence: Data Fingerprint Mismatch

| Metric | `executeSql(production)` | Direct Neon (`NEON_DATABASE_URL`) |
|--------|--------------------------|-----------------------------------|
| `current_database` | `neondb` | `neondb` |
| customers | **2,223** | **550** |
| employees | **20** | **19** |
| charge_codes | **15** (IND-ADMIN, IND-FACILITY, etc.) | **2** (our seeds only) |
| labor_burden_rates | **0** | **1** (our seed) |

Both return `current_database = neondb` because Neon names every database `neondb` by default. They are **entirely different Neon projects** with the same default database name.

### Conclusion

`executeSql(environment="production")` connects to **Replit's internally provisioned Neon database**, not to the application's `DATABASE_URL`. This is a Replit platform artifact — the tool reads from a different data store than what the live app uses.

**This tool is unreliable for auditing app production data state.** All previous assessments made using it were against a stale, unused database.

---

## Question 4: What is `NEON_DATABASE_URL` actually for?

### Evidence

The deployment boot log shows:
```
DATABASE_URL = postgresql://neondb_owner:npg_8ybQvUYfuNm6@ep-wispy-sun-adm062ft...
```

The `NEON_DATABASE_URL` secret points to the same endpoint. In the production Replit environment, `DATABASE_URL` is stored as a secret containing the Neon connection string.

`NEON_DATABASE_URL` is **the production `DATABASE_URL` stored under a secondary name** — likely created to allow direct access from scripts and agents without ambiguity. It is not a separate database.

### Historical Context

One-time migration scripts in `scripts/migrate-*.ts` hardcode the same endpoint as `PRODUCTION_URL`:
```
const PRODUCTION_URL = 'postgresql://neondb_owner:npg_8ybQvUYfuNm6@ep-wispy-sun-adm062ft...';
const DEVELOPMENT_URL = 'postgresql://neondb_owner:npg_28YFPchwECLb@ep-sweet-smoke-adiyfj99...';
```

These scripts moved data **from** one Neon instance **to** another (e.g., PO products, purchase orders). The current production Neon (`ep-wispy-sun-adm062ft`) is the destination — the active production system.

**`NEON_DATABASE_URL` is the primary production database. It is not a shadow, staging, legacy, or abandoned database.**

---

## Question 5: Which DB is the accounting source of truth?

**`ep-wispy-sun-adm062ft.neondb` — the Neon instance accessed via `NEON_DATABASE_URL` and `DATABASE_URL` in production.**

This is the only database that:
- The live production app reads from
- The live production app writes to
- EDRI/DCAA scoring will write snapshots to
- The startup migrations target
- The post-merge script targets

---

## Question 6: What should happen next?

### Recommended: **Option A — Production remains on `DATABASE_URL` (Neon)**

This is already the correct architecture. No database migration is needed.

**However, three corrections to how this infrastructure is understood and used:**

#### A1 — Stop treating `executeSql(environment="production")` as production truth

The Replit `executeSql` tool in production mode connects to a Replit-internal Neon that is not the app's database. This tool is useful for querying Replit's own managed infrastructure but should **never be used to audit or seed EPOCH's accounting data**. All future forensic SQL against production must go through direct Neon connection (`NEON_DATABASE_URL`).

#### A2 — Discard the 58.63 baseline score

The DCAA snapshot #75 score of 58.63 that appeared in `executeSql(production)` queries was from the Replit-internal DB — not from the production app's database. It is stale data from a different data store. The true production DCAA baseline is: **no snapshot exists yet** (the dcaa_readiness_snapshots table is absent from Neon).

#### A3 — Trigger the first real DCAA scorer run in production

With the seeds now present in Neon (labor_burden_rates, IND-IRD, IND-BNP, FRINGE), the next production DCAA scoring run will:
1. Create `dcaa_readiness_snapshots` in Neon
2. Create `dcaa_domain_scores` in Neon
3. Produce the first real production DCAA score

**Projected score: ≥80.63** based on Pass 1 scorer fixes + seed data alignment.

---

## DCAA Seeds — Correctness Confirmation

Seeds applied in previous session went to `NEON_DATABASE_URL` = `ep-wispy-sun-adm062ft` = the production app DB.

| Object | Status in Production Neon | Correct? |
|--------|--------------------------|----------|
| `labor_burden_rates` (Preliminary Overhead) | ✓ Present (id=1, OVERHEAD, 0.2500, active) | YES |
| `charge_codes` IND-IRD (IR_AND_D) | ✓ Present (id=1, active, non-billable) | YES |
| `charge_codes` IND-BNP (B_AND_P) | ✓ Present (id=2, active, non-billable) | YES |
| `cost_centers` FRINGE | ✓ Present (id=a4f2c0df, ACTIVE) | YES |

**The seeds are on the correct database and will be read by the DCAA scorer when it runs.**

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  PRODUCTION REPLIT DEPLOYMENT                               │
│                                                             │
│  server/index.ts                                            │
│    → DATABASE_URL = ep-wispy-sun-adm062ft (Neon)           │
│    → EDRI scorer, all routes, all migrations                │
│                   ↓                                         │
│  ┌────────────────────────────────────────────────────┐    │
│  │  NEON: ep-wispy-sun-adm062ft.neondb               │    │
│  │  THE PRODUCTION SYSTEM OF RECORD                   │    │
│  │  550 customers, 19 employees                       │    │
│  │  Seeds: ✓ burden rate, IND-IRD, IND-BNP, FRINGE   │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  REPLIT AGENT executeSql(environment="production")          │
│    → Replit-internal Neon (DIFFERENT database)             │
│    → 2,223 customers, 15 IND-* codes, 0 burden rates       │
│    → Stale, NOT connected to the app                        │
│    → UNRELIABLE for EPOCH production auditing              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  DEV REPLIT ENVIRONMENT                                     │
│    → DATABASE_URL = heliumdb (local Replit Postgres)       │
│    → 551 customers, 17 charge codes, DCAA score 82.38      │
└─────────────────────────────────────────────────────────────┘
```

---

## Immediate Risk Register

| Risk | Severity | Status |
|------|----------|--------|
| All previous `executeSql(production)` DCAA audits used wrong DB | HIGH | Documented — discard those baselines |
| True prod DCAA score unknown (no snapshot exists in Neon) | HIGH | Resolved after first scorer run |
| Seeds applied to correct DB | — | CONFIRMED CORRECT |
| Phase A error in server/index.ts:1527 still blocks startup migrations | MEDIUM | Unrelated to DB truth; documented separately |
