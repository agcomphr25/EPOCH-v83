# EPOCH Architecture Constitution

**Effective:** April 21, 2026
**Authority:** This document supersedes all prior architectural audits, system assessments, and agent-session decisions on the topics it governs. When any other document conflicts with this constitution, this document wins.
**Scope:** Labor, WAD, GL/cost posting, burden, payroll, traveler scan, PM dashboard, DCAA compliance, and all related financial reporting domains.

---

## Section 1 — Single Source of Truth for Labor

There is exactly one authoritative labor pipeline in EPOCH:

```
public.punch_ledger
  → charge_codes (FK: punch_ledger.charge_code_id → charge_codes.id)
  → labor_approvals (FK: labor_approvals.punch_id → punch_ledger.id)
  → GL posting (labor_cost_records + journal_entries, via laborPostingService)
  → payroll export (Gusto-format CSV derived from punch_ledger + labor_approvals)
  → DCAA audit trail (labor_entry_audit, immutable append-only)
```

All labor hours, cost attribution, approval state, and audit evidence must live in and derive from this chain. No secondary table, no parallel schema, and no compatibility bridge may serve as an alternative path for any step in this pipeline.

Any query, report, dashboard widget, or external export that touches labor data must source exclusively from this chain.

---

## Section 2 — Standalone Timeclock Prohibition

The following are permanently forbidden. No task, prompt, or user request may introduce them:

| Forbidden item | Why |
|---|---|
| Imports from `modules/timekeeping/` in any server or shared file | The standalone module is an archived artifact. Its code must not re-enter the main application surface. |
| `tkDb.ts` or any pool/client that connects to the timekeeping module's own Drizzle instance | All DB access uses the single EPOCH pool (`server/src/db.ts`). |
| `timekeepingPairing.ts` or any file whose purpose is to bridge the standalone module to EPOCH | Bridges are architectural debt. Delete first; never add. |
| The deprecated `labor_charge_codes` table as a source of truth for charge codes | Charge codes live in `charge_codes` (public schema). The deprecated table is read-only historical data pending removal. |
| Duplicate punch tables (any table whose rows represent a punch event other than `punch_ledger`) | One table, one record per punch. |
| Parallel timekeeping systems of any kind | Including any new Express server, kiosk app, or database schema dedicated to timekeeping that is not `punch_ledger`. |
| Compatibility bridges or adapter layers to retired code | If retired code must be referenced, it must be deleted and replaced, not wrapped. |

If any of the above are found in existing code during implementation work, stop and flag them for removal before proceeding.

---

## Section 3 — No Free-Text Cost Attribution

All cost attribution must traverse the complete FK chain. There are no shortcuts.

**Required FK chain for any labor cost:**

```
Project (projects.id)
  → WAD / Work Authorization Document (production_work_orders.id, FK → projects.id)
  → Traveler (travelers.id, FK → production_work_orders.id)
  → Authorization (labor_authorizations.id, FK → travelers.id or work order)
  → Charge Code (charge_codes.id, FK required on labor_authorizations or punch)
  → Punch Ledger (punch_ledger.id, FK → charge_codes.id)
  → GL Posting (labor_cost_records.id, FK → punch_ledger entries; journal_entries.id)
```

The following patterns are permanently forbidden:

- Free-text strings as cost object identifiers (e.g., `project_name TEXT`, `charge_code TEXT`)
- JSON blobs as cost attribution (e.g., `attribution JSONB` without FK backing)
- Computed/derived attribution fields that are not traceable to a DB-level FK at each step
- Posting labor costs to a GL account without a `wad_id` and `charge_code_id` on the `labor_cost_records` row

If WAD metadata is not yet wired into a given posting path, the correct action is to wire it — not to post without it.

---

## Section 4 — Traveler Scan Is First-Class Labor Control

The traveler barcode scan is not merely a convenience feature. It is the primary labor control mechanism for shop-floor employees.

**Required behavior:**

1. When an operator scans a traveler and is **not** currently clocked in: the system must automatically initiate a clock-in, linking the punch to the traveler's `work_order_id`, `project_id`, and `charge_code_id` derived from the WAD's `defaultChargeCodeId`.
2. When an operator scans a traveler and is **already** clocked in on a different job: the system must perform a switch-job operation — close the current punch and open a new one against the scanned traveler — in a single atomic transaction.
3. **Duplicate punches are never permitted.** The system must enforce at the DB level (unique constraint or application-level guard with a clear error) that an employee cannot have two open punches simultaneously.
4. The auto clock-in from a traveler scan must write a fully attributed punch: `charge_code_id`, `traveler_id`, `work_order_id`, and `project_id` must all be non-null at the time of insert.
5. The traveler scan audit record must be written to `badge_scan_audit_log` regardless of whether the punch succeeds, fails, or triggers a switch-job.

No implementation of traveler scanning may skip attribution fields on the punch or defer them for a later update step.

---

## Section 5 — DCAA/Audit Compliance Is Enforced by System Design

DCAA compliance is not a reporting feature applied after the fact. It is a structural property enforced at every write path.

**Governing principles:**

1. **Immutability over mutation.** Approved labor records must not be modified in place. Corrections are new addendum records with an explicit `corrects_punch_id` FK. The original record is never overwritten.
2. **Supervisor approval is never bypassed by automation.** `approvalStatus = "AUTO"` is forbidden for any punch that did not receive human review. Traveler-scanned punches must enter a `PENDING_APPROVAL` state and require explicit supervisor sign-off before they are considered approved.
3. **PIN enforcement is mandatory, not optional.** `kiosk_require_pin` must be `true` in all production configurations. Kiosk endpoints must reject punches from sessions that were authenticated without PIN verification.
4. **Every manual override is rare, explicitly approved, and permanently visible.** Any administrative correction to a posted labor record must: (a) require ADMIN/OWNER role, (b) create an immutable `labor_entry_audit` row recording old values, new values, actor, and timestamp, and (c) be surfaced in all DCAA-facing labor reports.
5. **Period locking is a hard system constraint.** Once a pay period is closed and payroll is exported, no journal entries, punch corrections, or charge code changes may be backdated into that period without a formal re-open action that itself creates an audit record.
6. **Burden rates must be applied before GL posting.** Labor costs must not post at raw/unloaded rates. The `labor_burden_rates` table governs fringe, overhead, and G&A burden by cost type and effective date. The `laborPostingService` must apply the applicable rate before creating any `labor_cost_records` row.

---

## Section 6 — Agent Implementation Rule

This section governs how any AI agent or automated tool must behave when implementing features that touch the domains covered by this constitution.

**Before writing any code** for labor, WAD, GL, burden, payroll, traveler, PM dashboard, DCAA, or compliance features:

1. Read this constitution in full.
2. Verify that the proposed implementation uses only the authorized pipeline (Section 1).
3. Verify that no forbidden imports, tables, or patterns (Section 2) are introduced.
4. Verify that all cost attribution follows the required FK chain (Section 3).

**If a requested implementation requires deprecated standalone behavior:**

- **Stop immediately.** Do not write compatibility layers, adapters, or bridges.
- Redesign the feature using native EPOCH-owned tables in the authorized pipeline.
- If the redesign requires new schema, write the migration first.
- If existing code uses forbidden patterns, delete those patterns before adding new code that depends on clean architecture.

**Delete-first principle:** When deprecated code and new code would coexist, the deprecated code must be removed in the same task. A feature that works correctly against deprecated infrastructure is not done — it is a liability.

**Escalation rule:** If this constitution cannot be satisfied without changes that exceed the current task scope, stop, report the conflict explicitly, and request a scope adjustment. Do not silently ship non-compliant code.

---

---

## Section 7 — Standalone Timekeeping Module: Permanent Excision

The standalone timekeeping module (`modules/timekeeping/`) has been permanently excised from this repository as of Task #1206 (April 21, 2026). **It may never be reintroduced in any form.**

This prohibition is absolute and includes:

| Forbidden item | Why |
|---|---|
| Any directory, file, or code re-introduced as `modules/timekeeping/` or any path fragment under `modules/` that duplicates timekeeping domain logic | The module is fully absorbed. Re-introducing it creates a second source of truth for labor data. |
| `@workspace/db` or `@workspace/api-zod` package aliases in any config file | These aliases pointed to standalone module artifacts. The canonical types now live in `server/src/lib/timekeeping-zod.ts` and `server/src/db.ts`. |
| Any import from `modules/timekeeping/artifacts/api-server/src/services/...` or similar paths | Those service files are gone. Native services live in `server/src/services/timekeeping/`. |
| Any startup diagnostic query that targets `timekeeping.employees WHERE epoch_employee_id IS NULL` for migration-phase validation | The Phase 2 identity migration is complete. That diagnostic block has been removed. |

**Preservation note:** The `timekeeping.employees` DB table is **intentionally preserved**. It is the active FK anchor for `punches` and `timesheets` in the native EPOCH schema. It is not a standalone artifact — it is a native EPOCH schema table. It must not be dropped.

Cross-reference: Task #1206 — "Excise standalone timekeeping module."

---

## Revision History

| Date | Change |
|---|---|
| April 21, 2026 | Initial constitution created. Supersedes all prior ad-hoc architectural guidance on labor, WAD, GL, and DCAA domains. |
| April 21, 2026 | Section 7 added: standalone timekeeping module (`modules/timekeeping/`) permanently excised per Task #1206. `timekeeping.employees` table intentionally preserved as native FK anchor. |
| May 6, 2026 | §5.2 enforcement (Task #77): TRAVELER-source punches now default to `approval_status = 'PENDING_APPROVAL'` at every write site (`punchLedger.openSession`, `switchAssignment`, `openOrSwitchForTraveler`, `timeClock` clock-in/job-switch, kiosk + portal punch routes, `storage.switchPunchLedgerAssignment`). Three DB CHECK constraints make the rule physically unbypassable: (a) `punch_ledger_approval_status_chk` pins the enum, (b) `punch_ledger_traveler_no_auto_chk` forbids TRAVELER+AUTO, (c) `punch_ledger_approved_requires_link_chk` requires `labor_approval_id` on every APPROVED, WAD-linked TRAVELER row (and `labor_approval_id` or `labor_budget_override_id` on APPROVED_OVERRUN), so no future code path can flip a punch to APPROVED without inserting the matching `labor_approvals` audit row first. `AUTO` remains a valid status only for non-TRAVELER system-reconciliation entries (e.g., `SALARIED_ENTRY` draft posting; KIOSK/PORTAL punches with no traveler/WAD link). Supervisor approval via `POST /api/timekeeping/labor-approvals` is the sole transition that flips `PENDING_APPROVAL`/`FLAGGED` → `APPROVED` (route performs the `labor_approvals` insert and the `punch_ledger` UPDATE atomically). Migration `0099` opens with a fail-fast `DO $$ ... $$` precondition that aborts with an actionable message if any unbackfilled TRAVELER+AUTO rows or APPROVED-but-unlinked rows still exist. Historical rows are reconciled by `server/scripts/backfillPunchApprovals.ts --cutover <ISO-DATE> [--apply] [--report ./report.json]`, which only touches rows created strictly before the cutover (post-cutover writes already obey the new default and are intentionally left untouched), warns if any post-cutover TRAVELER+AUTO rows exist, and produces a deterministic JSON reconciliation report listing every group it backfilled and every row it could not. |
| May 6, 2026 | Section 8 added: Purchasing Controls (requisition → approval → PO chain) per Task #83. |

---

## Section 8 — Purchasing Controls (Requisition → Approval → PO)

Added by Task #83 (May 6, 2026). Government-contracting (FAR/DFARS) compliance requires that vendor purchase orders trace back to an auditable purchase request decision and capture FAR clause flowdowns plus vendor responsibility (debarment) evidence.

**Authoritative pipeline:**
```
purchase_requisitions → purchase_requisition_approvals → vendor_pos
  + vendor_po_far_flowdowns (per-PO clause checklist)
  + vendor_debarment_checks  (SAM.gov / attestation evidence, freshness-bound)
```

**Vendor PO issuance gate (`POST /api/vendor-pos/:id/issue`)** evaluates, in addition to the existing compliance review gate:

1. PO is linked to an `APPROVED` requisition, **or** carries a populated direct-PO exception (only when `procurement_settings.allow_direct_po = true`).
2. `competition_method` is recorded; `sole_source_justification` is non-empty (≥10 chars) when method = `sole-source`.
3. At least one `vendor_po_far_flowdowns` row is recorded for the PO with `reasoning` ≥3 chars per row (applicable=false rows still count and are required to record reasoning).
4. A passing `vendor_debarment_checks` row exists for the vendor within `procurement_settings.debarment_check_freshness_days` (default 30). The issuance flow auto-records a `po_issuance` evidence row referencing that check.

Direct-PO without requisition is a **deviation path** and is intentionally discouraged. It must be approved by a holder of the `purchasing.direct_po_exception` capability, with a written reason captured on the PO itself, and is surfaced in the procurement audit report.

See `docs/procurement-policy.md` for the full policy, capability matrix, recommended approval-chain seeds, and audit report endpoint.
