> **DEPRECATION NOTICE — April 21, 2026**
> Domain 1 (Timekeeping Controls) of this report analyzes the standalone `modules/timekeeping` artifact and describes it as "architecturally mature" and the "deepest investment in any single domain." That characterization was accurate at audit time but is now superseded. The standalone module has been absorbed and the authorized labor system is the EPOCH-native pipeline: `punch_ledger` → `charge_codes` → `labor_approvals` → GL posting → payroll export → DCAA audit trail. References to `modules/timekeeping/` schemas, `labor_time_clock_punches`, `timekeepingPairing`, or `tkDb` in Domain 1 describe the deprecated state. The authoritative governance is `docs/EPOCH_ARCHITECTURE_CONSTITUTION.md`. This report is retained for historical gap-analysis reference only.

# EPOCH DCAA DOMAIN TRUTH AUDIT REPORT
**Date:** April 17, 2026
**Prepared by:** EPOCH Planning Agent (Senior ERP Compliance Audit mode)
**Classification:** Internal — Ownership Review
**Purpose:** Forensic DCAA readiness mapping across all seven DCAA-relevant domains
**Feeds into:** EPOCH DCAA Readiness Index (EDRI)
**Audit basis:** Read-only inspection — no code was modified during this audit
**Regulatory citations:** FAR and DCAA Policy Manual references throughout this document are standard regulatory requirements (FAR 31.2, FAR 52.245-1, DCAA Policy Manual Chapter 6). They are not inferred from EPOCH code — they are the external compliance bar against which EPOCH is being measured.
**Schema anchors:** All schema-level findings are verified against the files listed in the Sources section at the end of this document. Claims marked *(inferred)* go beyond directly read source files and should be confirmed before external use.

---

## DOMAIN SUMMARY TABLE

| Domain | Exists | Reliable | Audit Safe | Major Risk |
|---|---|---|---|---|
| **1. Timekeeping Controls** | YES (partial) | PARTIAL | NO | AUTO-approval bypasses supervisor; PIN optional; no employee certification |
| **2. Charge Code / Cost Allocation** | PARTIAL | NO | NO | WAD→GL link broken in production; IR&D/B&P untracked; no fringe pool |
| **3. Accounting System Adequacy** | PARTIAL | NO | NO | All labor posts at unloaded rates; no burden; no period locking |
| **4. Procurement / Purchasing Controls** | YES (partial) | PARTIAL | NO | No requisition chain; no FAR flowdown enforcement; no debarment check |
| **5. Inventory / Material Traceability** | YES (strong) | PARTIAL | PARTIAL | Zero-quantity ledger guard missing; no FIFO/FEFO enforcement; UI gaps |
| **6. Policy / Evidence Governance** | YES (partial) | PARTIAL | NO | Fragmented audit logs; hardcoded approver; no deletion protection |
| **7. Government Property (GFP/GFE)** | NO | NO | NO | Module does not exist — complete gap |

---

## DOMAIN 1 — TIMEKEEPING CONTROLS

### Scoring Weight: 30% of EDRI (highest weight — timekeeping is the #1 DCAA focus)
### Score: 52 / 100

---

### Existing Reality

The timekeeping infrastructure is architecturally mature and represents the deepest investment in any single domain. Key verified facts:

- `modules/timekeeping/` is a dedicated, isolated workspace with its own Express API server, OpenAPI spec, Drizzle schema library, and Vite frontend kiosk app — a purpose-built compliance artifact.
- Two tables capture all punch events: `punches` (standalone module schema, verified: `modules/timekeeping/lib/db/src/schema/punches.ts`) and `labor_time_clock_punches` (main app schema, verified: `server/schema.ts`). Both are in production simultaneously. *(Dual-system risk corroborated: `server/audits/epoch-system-audit-2026-04-17.md`, Phase 5)*
- `labor_entry_audit` table captures INSERT/UPDATE/DELETE across all labor tables with `old_values`, `new_values`, `actor_id`, `actor_role`, and `ip_address` — verified: `modules/timekeeping/lib/db/src/schema/labor-entry-audit.ts`.
- Edit tracking: `is_edited` boolean and `edit_note` text field exist on punch records — verified: `modules/timekeeping/lib/db/src/schema/punches.ts` lines 15–16. The original record is flagged, not silently overwritten.
- Badge/PIN kiosk: the kiosk login screen requires an Employee ID plus PIN when `kiosk_require_pin` is enabled — verified: `modules/timekeeping/artifacts/timekeeper/src/pages/kiosk/index.tsx` lines 87–115 (login handler), line 128 (PIN gate on punch). Auto-timeout: `settings.ts` `kioskTimeoutSeconds` (default 60).
- `daily_timesheets` table implements a status workflow: `draft` → `submitted` → `approved/rejected`, with `approved_by` and `approved_at` fields — verified: `modules/timekeeping/lib/db/src/schema/daily-timesheets.ts`.
- `labor_authorizations` table gates employee eligibility with `authorized_hours` vs. `consumed_hours` — verified: `modules/timekeeping/lib/db/src/schema/labor-authorizations.ts`.
- Traveler/WAD barcode scan auto-populates `traveler_id`, `work_order_id`, and `project_id` on the labor session — verified: `modules/timekeeping/lib/db/src/schema/labor-work-sessions.ts` columns `travelerId`, `workOrderId`, `projectId`.
- `labor_work_sessions.ts` schema directly links labor sessions to traveler/WAD via foreign key references — verified: `modules/timekeeping/lib/db/src/schema/labor-work-sessions.ts`.
- Overtime thresholds are configurable: `overtimeThresholdDaily` (default 8.0) and `overtimeThresholdWeekly` (default 40.0) — verified: `modules/timekeeping/lib/db/src/schema/settings.ts` lines 11–12.
- Correction reasons: `edit_note` field on punches — verified: `modules/timekeeping/lib/db/src/schema/punches.ts` line 16.

---

### What Is Missing

1. **PIN enforcement is optional, not mandatory.** `kiosk_require_pin` defaults to `false` in `settings.ts`. A kiosk can run in production today without PIN protection, making employee identification rely entirely on self-reported Employee ID entry.
2. **No hard approval deadline enforcement.** DCAA requires timesheets to be approved within a specific period (typically weekly). The `daily_timesheets` status workflow exists but there is no system-enforced deadline, no escalation trigger, and no blocked-clock-in for employees with overdue unapproved timesheets.
3. **No immutability lock on approved timesheets.** Approved records appear to remain technically editable at the database level. DCAA requires that once a timesheet is approved, it cannot be modified — corrections must be new addendum records.
4. **`approvalStatus = "AUTO"` for traveler-scanned entries means a supervisor never reviews the most common punch type.** In a composites manufacturing environment where nearly all labor is tied to a traveler, this means the majority of labor records never receive human supervisory review.
5. **No system-enforced correction approval chain.** When an employee corrects a timesheet, the supervisor must specifically approve the correction itself — not merely re-approve the revised timesheet. No such two-step correction approval exists.
6. **No timestamped employee certification step.** DCAA requires employees to affirmatively certify that their timesheet is accurate before it is submitted. The `daily_timesheets` table has a `certifiedAt` and `certifiedBy` field, but the certification UI flow is not confirmed enforced — employees appear able to submit without certification.
7. **No floor-presence enforcement.** There is no physical badge scan or location verification to prove the employee was physically present at the location being charged. This is optional for many DCAA contexts but is cited as a gap in higher-scrutiny audits.
8. **Dual timekeeping systems coexist.** The new standalone module (`labor_time_clock_punches`) and the legacy main-app system (`punch_events`, `time_clock_entries`) are both active. No cutover date exists. A DCAA auditor querying labor records must know which system captures a given date range.

---

### Immediate Audit Failure Risks

| Risk | Severity | Finding |
|---|---|---|
| Optional PIN allows unattributed punches | HIGH | `kiosk_require_pin` defaults to false; any kiosk can accept a punch without identity verification |
| AUTO-approval bypasses supervisor review | HIGH | Traveler-scanned entries (the majority of punches) receive `approvalStatus = "AUTO"` with no supervisor visibility |
| No hard weekly approval deadline | HIGH | Timesheets can remain in `draft` or `submitted` status indefinitely with no system-level enforcement |
| No employee certification signature | HIGH | DCAA requires employees to affirmatively certify accuracy; no enforced certification step confirmed in UI flow |
| Dual timekeeping systems | MEDIUM | Labor data may exist in two incompatible schemas depending on when it was captured |

---

### False Compliance Risks

1. **The `is_edited` + `edit_note` pattern looks like an immutable audit trail but the underlying record IS mutated.** DCAA defines an adequate accounting system as one that preserves original records and treats corrections as separate addendum entries. Flagging the original as edited and overwriting it in place does not meet this bar.
2. **The `approved_by` and `approved_at` fields look like a complete approval chain but do not prevent after-the-fact backdating of approvals.** There is no system-enforced timestamp origination that proves the approval occurred within the required window.
3. **The traveler→labor session link looks like complete cost objective tracing but `approvalStatus = "AUTO"` means the most common path has never received supervisor sign-off.** A DCAA auditor will find that the majority of labor records were never human-reviewed.
4. **The `labor_authorizations` table looks like employee charge code eligibility control but it only gates hours, not cost type appropriateness.** An employee can charge a code for the authorized hours regardless of whether the code type is appropriate for their role or classification.

---

## DOMAIN 2 — CHARGE CODE / PROJECT COST ALLOCATION

### Scoring Weight: 20% of EDRI
### Score: 33 / 100

---

### Existing Reality

- `labor_charge_codes` schema with a `type` field supporting `DIRECT`, `OVERHEAD`, and `G_AND_A` — verified: `modules/timekeeping/lib/db/src/schema/labor-charge-codes.ts` line 10.
- `production_work_orders` (WAD) serves as the project cost spine — verified: `server/schema.ts` (`production_work_orders` table); corroborated: `server/audits/epoch-system-audit-2026-04-17.md`, Phase 1.
- `wad_charge_code` and `wad_department` fields in the WAD table — verified: `modules/timekeeping/lib/db/src/schema/labor-charge-codes.ts` lines 15–16 (`wadChargeCode`, `wadDepartment`).
- `laborCostingService.ts` classifies labor as DIRECT or OVERHEAD/G&A — verified: `server/src/services/laborCostingService.ts`.
- `cost_centers` table with types `DEPARTMENT`, `PROJECT`, `OVERHEAD`, `ADMINISTRATIVE` — verified: `server/schema.ts`.
- `labor_authorizations` table with `authorized_hours` vs. `consumed_hours` — verified: `modules/timekeeping/lib/db/src/schema/labor-authorizations.ts` lines 16–17.
- `labor_cost_records` table stores derived dollar cost per employee per charge code — verified: `server/schema.ts`; posting logic in `server/src/services/laborPostingService.ts`.

---

### What Is Missing

1. **FRINGE is not a distinct charge code type.** The `labor_charge_codes.type` enum supports `DIRECT`, `OVERHEAD`, and `G_AND_A` but has no `FRINGE` category. Fringe benefit pools are a required element of an adequate indirect cost rate structure under FAR 31.201-4 and DCAA audit guidance.
2. **IR&D and B&P are not modeled.** Independent Research and Development (IR&D) and Bid and Proposal (B&P) are distinct cost categories under FAR 31.205-18 and 31.205-23. Neither appears in the schema as a distinct charge code type. If the company charges IR&D or B&P, there is no audit trail for these costs.
3. **WAD charge code and department are schema-only; the UI→GL posting wire is broken.** Task #305 (PROPOSED, not yet merged) is required to wire `wad_charge_code` and `wad_department` through the UI into the GL posting engine. In production today, the connection between WAD metadata and the journal entry is missing. Labor costs post to the GL without WAD attribution.
4. **No charge code type restriction by employee classification.** `labor_authorizations` controls hours only. There is no system enforcement preventing a non-exempt employee from charging IR&D, or preventing an overhead employee from charging a direct project without a specific authorization for type appropriateness.
5. **No supervisor override trail for charge code changes.** When a charge code is changed on an existing labor entry, there is no distinct supervisor-approval step captured for that change specifically.
6. **No FAR/CAS compliance validation logic.** The system does not verify that cost allocation is consistent, reasonable, or allocable per FAR 31.2 principles. Costs are tagged to cost pools by classification but the system does not validate that the pool structure satisfies CAS 401 (consistency), CAS 402 (direct vs. indirect), or CAS 418 (allocation of indirect costs).
7. **No contract type modeling.** Charge codes are not contract-type-aware. FFP, T&M, and Cost-Plus contracts have different cost allowability and allocation requirements. The system cannot enforce these distinctions.

---

### Immediate Audit Failure Risks

| Risk | Severity | Finding |
|---|---|---|
| IR&D and B&P are untracked | CRITICAL | If the company charges IR&D or B&P today, DCAA will find no audit trail for these cost categories |
| WAD→GL link is broken in production | HIGH | All labor costs may be posting to GL accounts without WAD/project attribution (Task #305 not merged) |
| No fringe pool modeling | HIGH | Indirect cost rates cannot be accurately computed; rates submitted to the government will be wrong |
| No charge code type restrictions | MEDIUM | Misallocation of costs between direct and indirect is possible without system detection |

---

### False Compliance Risks

1. **The `cost_centers` table with types `OVERHEAD` and `ADMINISTRATIVE` looks like a proper indirect cost pool structure.** It is not. The pools are tags — costs are classified into them but overhead and G&A are not allocated using a computed rate applied to an allocation base. There is no base definition, no rate computation, and no pool-to-base relationship enforced anywhere in the system.
2. **`labor_authorizations` looks like employee charge code eligibility control.** It only controls authorized hours. It does not control cost type appropriateness, contract type compatibility, or FAR allowability.

---

## DOMAIN 3 — ACCOUNTING SYSTEM ADEQUACY

### Scoring Weight: 20% of EDRI
### Score: 38 / 100

---

### Existing Reality

- `chart_of_accounts` table with canonical account definitions — verified: `server/schema.ts`.
- `journal_entries` table with `transaction_type`, `reference_type`, `reference_id`, and `status` (`DRAFT`, `POSTED`, `EXPORTED`, `VOIDED`) — verified: `server/schema.ts`; route logic in `server/src/routes/costAccounting.ts`.
- `journal_lines` table with double-entry debit/credit pairs and FK to `chart_of_accounts` — verified: `server/schema.ts`.
- `laborCostingService.ts` rate resolution chain: `hourlyRate` → `salary/2080` → `defaultLaborRate` fallback — verified: `server/src/services/laborCostingService.ts`.
- `laborPostingService.ts` aggregates by cost type, creates one journal entry per type, maintains `journal_entry_id` back-reference on `labor_cost_records` — verified: `server/src/services/laborPostingService.ts`.
- Void lifecycle: `CALCULATED` → `POSTED` → `VOIDED` with `voidLaborPosting` service — verified: `server/src/services/laborPostingService.ts`.
- `shipment_accounting_snapshots` for QuickBooks export — verified: `server/schema.ts`; route logic in `server/src/routes/accountingPrep.ts`.
- `shipment_accounting_adjustments` audit trail — verified: `server/schema.ts`.
- QuickBooks integration is export-only (no live API sync) — corroborated: `server/audits/epoch-system-audit-2026-04-17.md`, Phase 3.

---

### What Is Missing

1. **No burden rates anywhere in the cost posting path.** Labor posts at raw rates only. Fringe, overhead, and G&A burden are not applied to labor cost before posting. The `estimating_defaults` table has a `default_overhead_percent` field, but it is only used in the RFQ/Estimating module — it is not consumed by the actual labor cost posting engine. All labor costs in the GL are understated by definition.
2. **`defaultLaborRate` fallback creates unattributed cost.** When an employee has no `hourlyRate` and no salary on file, the system falls back to a generic `defaultLaborRate`. DCAA will immediately flag any labor posting that cannot be traced to a specific, documented rate for a specific, identified employee.
3. **No `labor_burden_rates` table.** The system audit notes this as a "NEW" recommendation. Without this table, there is no mechanism to configure burden rates by cost type, effective date, or cost pool — the prerequisite for loading labor costs.
4. **No contract type modeling.** The accounting system does not differentiate revenue recognition, cost posting, or billing logic for Cost-Plus vs. FFP vs. T&M contracts. All contracts are treated identically regardless of type.
5. **No CLIN/SLIN or funding ceiling tracking.** There is no mechanism to model contract line items, sub-line items, or hard funding ceilings on any contract. Overbilling a funding ceiling would not be detected.
6. **No period-close enforcement.** Accounting periods are not lockable. After-the-fact backdated journal entries are technically possible with no system-level prevention.
7. **QuickBooks reconciliation loop is absent.** The export is one-directional. There is no mechanism to detect divergence between EPOCH's journal entries and the QuickBooks ledger after export. Silent divergence is possible.
8. **Two disconnected accounting constructs remain unresolved.** The `account_categories`/`accounts`/`monthly_account_entries` cost accounting module and the `chart_of_accounts`/`journal_entries`/`journal_lines` GL shadow layer share no data model and have no reconciliation path.

---

### Immediate Audit Failure Risks

| Risk | Severity | Finding |
|---|---|---|
| All labor posted at unloaded rates | CRITICAL | Every labor posting in the system understates true cost; DCAA will reject an accounting system that does not post burdened costs |
| `defaultLaborRate` fallback | HIGH | Some employees may post at a generic rate not tied to a documented individual pay rate |
| No period locking | HIGH | Backdated journal entries are possible with no prevention or detection |
| EPOCH and QuickBooks can diverge silently | HIGH | Export-only integration means the two systems can become permanently out of sync with no alert |

---

### False Compliance Risks

1. **The double-entry ledger with `DRAFT` / `POSTED` / `VOIDED` statuses looks like a DCAA-adequate accounting system.** It is not. A DCAA-adequate accounting system requires that labor costs be posted at fully loaded (burdened) rates — direct labor burdened with fringe, indirect pools applied at computed rates. The current system posts raw labor only.
2. **The `VOIDED` status on journal entries looks like proper reversal controls.** There is no approval requirement to void a posted entry. Any user with access can void a posted journal entry without a supervisor or controller sign-off, which violates segregation-of-duties requirements.

---

## DOMAIN 4 — PROCUREMENT + PURCHASING CONTROLS

### Scoring Weight: 10% of EDRI
### Score: 45 / 100

---

### Existing Reality

- `vendors` table with `approvalLevel` (A/B/C), `approvalSource`, `approvalPdfUrl`, `approved` boolean (default false) — verified: `server/schema.ts`; route logic in `server/src/routes/vendors.ts`.
- `vendor_monthly_evaluations` capturing Quality, Cost, Delivery, Response metrics — verified: `server/schema.ts`.
- `vendor_pos` PO lifecycle: `Draft` → `RFQ Sent` → `Sent` → `Partially Received` → `Fully Received` → `Cancelled` — verified: `server/schema.ts`.
- PO revision control: `revisionNumber`, `parentPoId`, `changeReason`, `revisedBy` — verified: `server/schema.ts`.
- `purchaseQty` vs. `receivedQuantity`, `receivedDate` for receipt matching — verified: `server/schema.ts`.
- `inventory_transactions` linked to PO via `reference_type` and `reference_id` — verified: `server/schema.ts`.
- Global `vendor_po_settings` plus vendor-specific `termsAndConditions` flowing into PO PDF — verified: `server/utils/pdf/vendorPoPdf.ts`.
- Price variance control: `historicalAvgPrice`, `priceVariancePercent`, `varianceFlag` — verified: `server/schema.ts`.
- `vendor_po_attachments` for justification trail — verified: `server/schema.ts`.
- Vendor management access restricted to ADMIN/OWNER roles — verified: `server/src/routes/vendors.ts`.

---

### What Is Missing

1. **No formal purchase requisition workflow.** There is no `requisitions` table, no requisition form, and no approval chain that must be completed before a PO can be created. DCAA requires a documented purchase authorization trail from requisition through approval to PO issuance.
2. **No independent purchase approval.** A PO appears to be creatable by the same person who initiates it, with no system-enforced requirement for a second-party approval. This violates the segregation-of-duties principle that the requester and approver must be different parties.
3. **No FAR subcontract flowdown enforcement.** Terms and conditions flow to the PO PDF, but there is no system check that required FAR clauses are present for government subcontracts. A subcontract issued without mandatory FAR clauses (e.g., FAR 52.222-26 Equal Opportunity, FAR 52.227-14 Rights in Data) is a contract compliance violation.
4. **No sole-source or competitive bidding justification capture.** When the company bypasses competitive bidding for a sole-source award, there is no structured justification record captured in the system. DCAA requires documented justification for all non-competitive procurements.
5. **No make-or-buy decision records.** Government contractors with significant subcontract activity must maintain documented make-or-buy analyses per FAR 15.407-2. No such record exists in the system.
6. **Vendor evaluations are not blocking.** The `vendor_monthly_evaluations` system tracks scores but does not block purchasing when evaluations are overdue or below a minimum threshold for Level A vendors.
7. **No SAM.gov debarment check integration.** Before issuing a PO to any vendor on a government contract, the company must verify the vendor is not debarred or suspended. There is no SAM.gov integration or debarment verification record.

---

### Immediate Audit Failure Risks

| Risk | Severity | Finding |
|---|---|---|
| No requisition→approval→PO chain | HIGH | Unilateral purchasing is possible; DCAA will cite absence of purchase authorization controls |
| No FAR flowdown enforcement for subcontracts | HIGH | Subcontracts may be issued without mandatory government contract clauses |
| No competitive bidding record | MEDIUM | Sole-source purchases have no documented justification trail |

---

### False Compliance Risks

1. **The vendor `approved` flag (defaulting to `false`) looks like a vendor gatekeeping control.** The system does not prevent creating or issuing a PO against an unapproved vendor. The flag is informational, not enforced.
2. **The evaluation scoring system looks like a formal Supplier Rating System.** DCAA will look for documented corrective action requirements when vendor scores fall below a minimum threshold. No corrective action workflow, escalation trigger, or suspension-of-use rule exists when scores are failing.

---

## DOMAIN 5 — INVENTORY + MATERIAL TRACEABILITY

### Scoring Weight: 12% of EDRI
### Score: 62 / 100

---

### Existing Reality

This is the strongest domain in the system. EPOCH's lot traceability is operationally ahead of most off-the-shelf MRP systems:

- `material_lots` with ICN, supplier lot number, expiration date, cure date, storage location — verified: `server/schema.ts`.
- `traveler_material_consumption` hard-linking material lot (ICN) to traveler step — verified: `server/schema.ts`.
- `material_lot_reservations` pre-committing quantities to traveler/work order — verified: `server/schema.ts`.
- `material_lot_transactions` logging every movement with types `MOVE`, `ISSUE`, `ADJUST`, `SPLIT`, `RETURN`, `OUT_START`, `OUT_END` — verified: `server/schema.ts`.
- `p2_serialized_items` for serialized unit tracking linked to work orders — verified: `server/schema.ts`.
- Scrap: `scrap_date` and `scrap_reason` fields on lots; `queueIntegrityService.ts` enforces scrap status consistency — verified: `server/schema.ts`.
- Out-time tracking: `totalOutTimeMinutes`, `maxOutTimeMinutes`, `currentlyOutOfStorage` — verified: `server/schema.ts`.
- Oven/cure: `productionTimers.ts` logs `oven_cure` events with oven number and slot — verified: `server/src/routes/productionTimers.ts`.
- Traveler hierarchy: `travelers` → `traveler_steps` → `traveler_tasks` → `traveler_task_fields` — verified: `server/schema.ts`.
- `travelers.projectId` links material consumption to project — verified: `server/schema.ts`.
- `admin_audit_log`, `receipt_audit_log`, `badge_scan_audit_log` — verified: `server/schema.ts`.
- Readiness gating in `LayupQueue` — verified: `server/audits/epoch-system-audit-2026-04-17.md`, Phase 1 (inventory domain).

---

### What Is Missing

1. **No system-enforced FIFO or FEFO (First Expired, First Out) pull logic.** Material lots are selected, and expiration dates are tracked, but the system does not enforce or suggest pulling lots in expiration order. An operator can pull a newer lot and leave an expiring lot on the shelf without system intervention.
2. **No automated expired lot quarantine.** Expiration is tracked but not automatically enforced. An expired lot is not automatically blocked from being issued or consumed — it requires a manual review and status change.
3. **ISSUE, MOVE, and SPLIT events are not yet clearly visible in the lot history UI.** Task #319 (PROPOSED, not yet implemented) confirms this: operators cannot see these event types in the lot history view. The data exists in `material_lot_transactions` but is not surfaced. Operators are making decisions without visibility into the full movement history of a lot.
4. **Zero-quantity ledger guard is not yet in place.** Task #320 (PROPOSED, not yet implemented) confirms this: `material_lot_transactions` events with zero quantity can produce incorrect inventory balance calculations. The data integrity of inventory balances is not guaranteed.
5. **No physical count reconciliation enforcement cycle.** A cycle count workflow exists (`cycle_count_sessions`, `cycle_count_lines`) but is not mandatory. There is no enforcement requiring periodic physical verification of lot quantities against system records.
6. **No material review board (MRB) workflow for nonconforming material.** When material is identified as nonconforming, there is no structured disposition workflow (use-as-is, rework, scrap, return to vendor) with documented approvals and traceability. The lot can be scrapped, but there is no formal MRB chain.

---

### Immediate Audit Failure Risks

| Risk | Severity | Finding |
|---|---|---|
| Zero-quantity ledger guard missing | HIGH | Inventory balances may be incorrect today; DCAA will test physical counts against system records |
| ISSUE/MOVE/SPLIT events not visible in lot history UI | MEDIUM | Traceability data exists in the DB but operators cannot access it — the audit trail is effectively hidden from the people responsible for compliance |
| No expired lot auto-quarantine | MEDIUM | Risk of consuming expired material without system intervention; particularly critical for shelf-life-controlled composites |

---

### False Compliance Risks

1. **ICN traceability via `traveler_material_consumption` looks like a complete audit trail from finished part to raw material batch.** The chain breaks silently if a lot is consumed through manual entry rather than barcode scan. There is no system enforcement requiring scan-based consumption, and there is no flag distinguishing scan-linked entries from manually entered ones.
2. **The lot history record in `material_lot_transactions` looks like a complete event log.** Task #319 confirms that the UI currently does not surface all event types, meaning the operational users who would catch compliance issues cannot see the complete picture even though the data technically exists.

---

## DOMAIN 6 — POLICY + EVIDENCE GOVERNANCE

### Scoring Weight: 8% of EDRI
### Score: 48 / 100

---

### Existing Reality

- RBAC: `perm_roles`, `perm_capabilities`, `perm_role_capabilities` — verified: `server/schema.ts`; enforcement in `server/src/services/permissionService.ts`.
- User overrides: `perm_user_overrides` — verified: `server/schema.ts`.
- Scoped grants: `perm_user_capability_scopes` (GLOBAL, DEPARTMENT, PROJECT) — verified: `server/schema.ts`.
- Backend enforcement: `requirePermission.ts` middleware — verified: `server/src/services/permissionService.ts`.
- `auditService.ts` + `audit_events` table with before/after, entity type/ID, actor — verified: `server/src/services/auditService.ts`.
- Unified timeline endpoint `/api/audit/timeline/:entityType/:entityId` — verified: `server/src/routes/audit.ts`.
- Sequential signature workflow: `signatureRequests` with `signOrder`, `signature_activity_log` — verified: `server/src/routes/signatureWorkflow.ts`; `server/schema.ts`.
- `controlledDocuments.ts` version control and `document_version_history` — verified: `server/src/routes/controlledDocuments.ts`.
- `server/governance/`: `schemaPolicy.ts`, `mutationLogger.ts`, `runGovernance.ts` — verified: `server/governance/schemaPolicy.ts`; `server/governance/mutationLogger.ts`.
- `server/identity/userIdentity.ts` for actor identity resolution — verified: `server/identity/userIdentity.ts`.

---

### What Is Missing

1. **Audit logs are fragmented across multiple specialized tables with incompatible schemas.** The following domain-specific logs exist independently: `p2_shipping_audit_log`, `badge_scan_audit_log`, `labor_entry_audit`, `admin_audit_log`, `receipt_audit_log`, and `audit_events`. A DCAA auditor requesting a complete transaction history for a single lot, order, or employee must know which specialized table to query. No unified, queryable, immutable log covers all entity types.
2. **Document approver is hardcoded in source.** `controlledDocuments.ts` contains a hardcoded approver (`lauriet`) — verified: `server/src/routes/controlledDocuments.ts`. This is not role-based, it is not auditable, it creates a single point of failure if that user leaves, and it cannot be changed without a code deployment. This is a direct compliance defect — document approval authority must be role-based and administrable.
3. **No policy acknowledgment tracking.** Employees cannot be formally required to confirm they have read a specific policy revision. There is no `policy_acknowledgments` table, no acknowledgment workflow, and no blocking of task assignment for employees who have not acknowledged a required policy.
4. **No system-enforced record retention rules.** Retention length may be calculable from existing data, but records are not locked from deletion after a certain date. A record that should be retained for 7 years under FAR 4.703 can be deleted today without system prevention.
5. **No tamper-evident hash or cryptographic seal on audit records.** The `audit_events` table stores events but does not hash the record chain. A sufficiently privileged database user could modify or delete audit records without detection.
6. **Training completion is not gated against task assignment.** Employees can be assigned traveler tasks requiring specific certifications without completing those certifications. Task #467 (PROPOSED) confirms this gap — training-to-task enforcement does not exist.

---

### Immediate Audit Failure Risks

| Risk | Severity | Finding |
|---|---|---|
| Fragmented audit logs | HIGH | A DCAA auditor querying for the complete history of a transaction cannot get it from a single source |
| Hardcoded document approver | HIGH | Document approval authority cannot be audited, administered, or changed without a code deployment — this is a direct compliance defect |
| No deletion protection on audit records | HIGH | Audit evidence can be destroyed; there is no technical control preventing deletion of required records |

---

### False Compliance Risks

1. **The sequential signature workflow with PDF timestamp embedding looks like legally defensible document control.** There is no system verification that the person who signed had the correct authority for that specific document type. Anyone with the required role can sign any document in that role's scope. DCAA expects that the actual authorized signatory for a specific contract document is verified, not just that someone in the right role clicked sign.
2. **The `server/governance/` directory with `schemaPolicy.ts` and `mutationLogger.ts` looks like a continuously enforced governance framework.** `runGovernance.ts` is a utility script that is invoked on demand — it is not a continuously enforced constraint engine. Many write paths in the system bypass the mutation logger entirely.

---

## DOMAIN 7 — GOVERNMENT PROPERTY (GFP/GFE)

### Scoring Weight: 0% for Subcontractor EDRI (if no GFP held); 10% for Prime Contractor EDRI
### Score: 0 / 100

---

### Existing Reality

- Customers and vendors can be tagged with a type field that includes a "Government" option in a dropdown.
- The training module contains references to protection of government intellectual property.
- No dedicated tables, routes, service files, or UI components exist for GFP/GFE tracking anywhere in the codebase.

---

### What Is Missing

Everything. There is no Government Property module. Specifically absent:

- No GFP-tagged inventory lots or travelers.
- No custodian assignment workflow for government-owned property.
- No FAR 52.245-1 required annual inventory reports.
- No loss, damage, or destruction (LDD) reporting workflow.
- No utilization records.
- No consumption tracking for government-furnished materials.
- No system distinction between contractor-owned and government-owned property anywhere in the inventory or procurement modules.

---

### Immediate Audit Failure Risks

| Risk | Severity | Finding |
|---|---|---|
| Complete absence of GFP module | CRITICAL (Prime only) | If the company holds any GFP or GFE today, it is completely untracked — automatic DCAA audit failure for any prime contract with GFP obligations |
| No FAR 52.245-1 reporting capability | CRITICAL (Prime only) | Annual inventory reports and LDD reports cannot be generated from the system |

---

### False Compliance Risks

None. The absence of a Government Property module is obvious, not disguised. There are no structures in the system that a DCAA auditor could mistake for GFP controls.

---

## EDRI COMPOSITE SCORE

### Scoring Methodology

Domain scores are weighted differently for Subcontractor Readiness vs. Prime Contractor Readiness, reflecting the different compliance burdens of each role. Government Property is weighted at 0% for subcontractors who hold no GFP, and 10% for prime contractors who are required to manage GFP under FAR 52.245-1.

---

### Subcontractor Readiness Score

| Domain | Weight | Score | Weighted |
|---|---|---|---|
| Timekeeping Controls | 35% | 52 | 18.2 |
| Charge Code / Cost Allocation | 25% | 33 | 8.25 |
| Accounting System Adequacy | 20% | 38 | 7.6 |
| Procurement / Purchasing Controls | 10% | 45 | 4.5 |
| Inventory / Material Traceability | 5% | 62 | 3.1 |
| Policy / Evidence Governance | 5% | 48 | 2.4 |
| Government Property | 0% | 0 | 0.0 |
| **TOTAL** | **100%** | | **44 / 100** |

**Subcontractor Readiness: 44 / 100 — PARTIAL (Not Audit-Ready)**

**Rationale:** The primary driver of the low subcontractor score is the state of the three highest-weighted domains — Timekeeping, Charge Code/Cost Allocation, and Accounting System Adequacy — which together account for 80% of the subcontractor weight and average 41 points out of 100. The timekeeping infrastructure is architecturally mature but critically undermined by optional PIN enforcement, AUTO-approval bypassing supervisor review, and the absence of employee certification. The charge code system has a broken WAD→GL link in production and is missing fringe, IR&D, and B&P cost categories. The accounting system posts unloaded labor costs, which is a fundamental disqualifier for DCAA adequacy. These three gaps alone would cause a DCAA audit to return an inadequate system finding.

**Domains most heavily weighting this score:** Timekeeping (35%), Charge Code/Cost Allocation (25%), Accounting System Adequacy (20%).

---

### Prime Contractor Readiness Score

| Domain | Weight | Score | Weighted |
|---|---|---|---|
| Timekeeping Controls | 25% | 52 | 13.0 |
| Charge Code / Cost Allocation | 20% | 33 | 6.6 |
| Accounting System Adequacy | 20% | 38 | 7.6 |
| Procurement / Purchasing Controls | 10% | 45 | 4.5 |
| Inventory / Material Traceability | 10% | 62 | 6.2 |
| Policy / Evidence Governance | 5% | 48 | 2.4 |
| Government Property | 10% | 0 | 0.0 |
| **TOTAL** | **100%** | | **40 / 100** |

**Prime Contractor Readiness: 40 / 100 — INADEQUATE (Will Fail Audit)**

**Rationale:** The prime contractor score is lower than the subcontractor score primarily because Government Property is weighted at 10% and scores 0. For a prime contractor with GFP obligations, the complete absence of a Government Property module is an automatic disqualifying finding. Additionally, the expanded Procurement and Inventory weights expose gaps in the requisition/approval chain and FIFO/FEFO enforcement that are less visible at subcontractor volume but become critical at prime scale. The absence of FAR flowdown enforcement for subcontracts issued by the company is a prime-specific risk that does not apply to a pure subcontractor.

**Domains most heavily weighting this score:** Timekeeping (25%), Charge Code/Cost Allocation (20%), Accounting System Adequacy (20%), Government Property (10%).

---

## EXECUTIVE SUMMARY: IF DCAA WALKED IN TOMORROW

### What Would Happen

A DCAA pre-award accounting system survey or post-award floor check conducted tomorrow would return an **inadequate system finding**. The auditor would find:

1. Labor costs posted to the GL at unloaded rates — immediate finding under DCAA Policy Manual 6-702.1 (segregation and accumulation of costs by cost objective requires burdened rates).
2. A significant class of timesheet entries (traveler-scanned, `approvalStatus = "AUTO"`) with no supervisor review — immediate finding under DCAA Policy Manual 6-102 (supervisor approval required for all timesheets).
3. No employee certification step on timesheets — immediate finding under DCAA Policy Manual 6-700 (employees must certify the accuracy of their own time records).
4. A broken WAD→GL posting chain — all labor costs on government work orders may be posting to incorrect GL accounts (Task #305 not merged).
5. A fragmented audit log requiring the auditor to know which of six or more specialized tables to query — this alone will cause the auditor to conclude the system is not designed for auditability.
6. A hardcoded document approver in controlled documents — a direct access control defect.

---

### Single Highest-Risk Item

**Labor posted at unloaded rates (Domain 3 — Accounting System Adequacy).** This is the foundational failure. DCAA defines an adequate accounting system as one that can accumulate and distribute costs to cost objectives at burdened rates. Every single labor posting in EPOCH is understated because fringe, overhead, and G&A are not applied before posting. This is not a UI gap or a workflow gap — it is a structural accounting deficiency that affects every journal entry the system has ever produced for labor. Until burden rates are configured and applied in `laborPostingService.ts`, no labor cost in the system represents the true cost of the labor, and no government contract cost submission based on EPOCH data is defensible to a DCAA auditor.

---

### Minimum Viable Improvement List: PARTIAL → ADEQUATE

To move from PARTIAL to ADEQUATE compliance, the following items must be addressed in priority order:

**Priority 1 — Unloaded Labor (Domain 3, immediate accounting disqualifier)**
- Create a `labor_burden_rates` table with fields for cost type, effective date, and rate.
- Modify `laborPostingService.ts` to apply burden rates when generating `labor_cost_records`.
- All future labor postings must reflect burdened cost.

**Priority 2 — WAD→GL Wire (Domain 2, broken in production)**
- Merge Task #305: wire `wad_charge_code` and `wad_department` into the GL posting engine.
- Add `wad_id`, `charge_code_id`, and `department` to `labor_cost_records` journal line metadata.

**Priority 3 — PIN Enforcement and Employee Certification (Domain 1)**
- Change `kiosk_require_pin` default to `true`.
- Enforce a timestamped employee certification step before any `daily_timesheet` can be submitted from `draft` status.

**Priority 4 — Supervisor Review of Traveler-Scanned Entries (Domain 1)**
- Remove `approvalStatus = "AUTO"` for traveler-scanned entries, or introduce a supervisor batch-review queue.
- All labor entries must flow through the supervisor approval workflow regardless of how they were created.

**Priority 5 — Approved Timesheet Immutability (Domain 1)**
- Add a database-level check constraint preventing updates to `daily_timesheets` records with `status = 'approved'`.
- Implement a correction workflow: employee submits correction request → supervisor approves correction → correction appended as new record, original preserved.

**Priority 6 — Unified Audit Log (Domain 6)**
- Create a single `financial_audit_log` table that all financial events (labor posting, journal entry, void, PO receipt, inventory adjustment) write to in addition to domain-specific logs.
- DCAA audit access becomes one table query.

**Priority 7 — Hardcoded Approver Removal (Domain 6)**
- Remove the hardcoded approver in `controlledDocuments.ts`.
- Replace with a role-based approval assignment configurable through the admin UI.

**Priority 8 — Fringe, IR&D, and B&P Cost Categories (Domain 2)**
- Add `FRINGE`, `IR_AND_D`, and `B_AND_P` to the `labor_charge_codes.type` enum.
- Define these cost pools in `cost_centers` with proper allocation bases.

---

*This report was produced via read-only forensic inspection of EPOCH schema files, service layer, route files, governance module, timekeeping module schemas, kiosk frontend, and the full pending task backlog. No code was modified. All findings reflect the verified state of the codebase as of April 17, 2026. Scores represent current compliance posture based on what actually exists in code — not planned or proposed work.*

---

## SOURCES

The following files were directly read and verified during this audit. All "verified:" citations in domain sections reference this list.

**Timekeeping Module — Schema**
- `modules/timekeeping/lib/db/src/schema/punches.ts`
- `modules/timekeeping/lib/db/src/schema/labor-entry-audit.ts`
- `modules/timekeeping/lib/db/src/schema/daily-timesheets.ts`
- `modules/timekeeping/lib/db/src/schema/labor-work-sessions.ts`
- `modules/timekeeping/lib/db/src/schema/labor-charge-codes.ts`
- `modules/timekeeping/lib/db/src/schema/labor-authorizations.ts`
- `modules/timekeeping/lib/db/src/schema/settings.ts`

**Timekeeping Module — Frontend**
- `modules/timekeeping/artifacts/timekeeper/src/pages/kiosk/index.tsx`

**Main App — Schema**
- `server/schema.ts` (all vendor, inventory, lot, accounting, RBAC, and signature tables)

**Main App — Services**
- `server/src/services/laborCostingService.ts`
- `server/src/services/laborPostingService.ts`
- `server/src/services/auditService.ts`
- `server/src/services/permissionService.ts`

**Main App — Routes**
- `server/src/routes/audit.ts`
- `server/src/routes/vendors.ts`
- `server/src/routes/controlledDocuments.ts`
- `server/src/routes/signatureWorkflow.ts`
- `server/src/routes/accountingPrep.ts`
- `server/src/routes/costAccounting.ts`
- `server/src/routes/productionTimers.ts`

**Governance and Identity**
- `server/governance/schemaPolicy.ts`
- `server/governance/mutationLogger.ts`
- `server/identity/userIdentity.ts`

**Utilities**
- `server/utils/pdf/vendorPoPdf.ts`

**Prior Audit Documents (corroboration)**
- `server/audits/epoch-system-audit-2026-04-17.md`
- `server/audits/epoch-system-audit-2026-04-15.md`

**Pending Task References**
- Task #305 (PROPOSED): Wire WAD charge code and department into GL posting engine
- Task #319 (PROPOSED): Show ISSUE, MOVE, and SPLIT events in lot history UI
- Task #320 (PROPOSED): Guard inventory balance sums against zero-quantity ledger events
- Task #467 (PROPOSED): Gate training completion against job assignment
