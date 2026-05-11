# EPOCH DCAA + AS9100 Cradle-to-Grave Gap Analysis

Date: May 11, 2026
Branch: `codex/aerospace-gap-scoped`
Scope: Enterprise buildout roadmap from commercial intake through shipment, audit evidence, and security.

## Executive Position

EPOCH is no longer only a manufacturing management application. The codebase is already moving into an aerospace operating system with ERP, MES, QMS, MRP, DCAA labor, AS9100 evidence, procurement, receiving, and controlled manufacturing execution patterns in one platform.

The remaining maturity work is not one giant feature. It should be delivered as a controlled foundation sequence:

1. Unified immutable event ledger coverage across every critical domain.
2. Reusable approval workflow engine wired into quote, contract, WAD, procurement, quality, engineering, and security actions.
3. Revision-control framework for controlled manufacturing and quality artifacts.
4. Clause-flowdown engine from contract review into PO, traveler, supplier PO, QC, and cert package.
5. Material genealogy from received lot through kit, traveler, assembly, shipment, and serial number.
6. DCAA timekeeping enforcement, daily employee certification, supervisor approval, and immutable correction trail.
7. AS9100 supplier approval, audit, scope, and scorecard controls.

## Current Repo Evidence

This analysis is source-grounded against the current `origin/main` state as of May 11, 2026.

### Already Present Or Recently Landed

| Area | Current Evidence | Maturity |
| --- | --- | --- |
| Labor DCAA backbone | `docs/EPOCH_ARCHITECTURE_CONSTITUTION.md` defines `punch_ledger -> charge_codes -> labor_approvals -> GL posting -> payroll export -> DCAA audit trail`. | Strong foundation, enforcement coverage still needs daily certification and period-close completeness checks. |
| Unified audit ledger | Constitution Section 9 defines `recordAuditEvent() -> audit_events`, hash chaining, anchors, retention policy, export manifest, and no parallel ledgers. `server/schema.ts` includes `auditEvents`, `auditAnchors`, and `auditRetentionPolicies`. | Strong foundation, needs domain-by-domain mandatory event coverage map and endpoint enforcement audit. |
| RFQ estimating controls | `migrations/0126_rfq_estimating_controls.sql`, `server/schema.ts`, and `server/src/routes/estimating.ts` now include estimate versions, line versions, assumptions, estimating approvals, risk assessments, risk items, and mitigation actions. | Recently implemented foundation, needs UI workflow integration, audit-ledger emission, release gates, and executive threshold policy. |
| Quote contractual snapshots | `migrations/0121_quote_snapshots_and_po_reconciliation.sql`, `server/src/routes/quotes.ts`, and `server/src/services/quoteContractService.ts` add quote snapshots, line snapshots, sent-quote immutability, and PO reconciliation records. | Recently implemented foundation, needs contract-review linkage and clause comparison expansion. |
| Purchasing controls | Constitution Section 8 defines requisition -> approval -> PO, vendor debarment checks, direct-PO exception control, and procurement audit report expectations. `server/schema.ts` includes purchase requisition tables. | Partial enterprise foundation, needs approved supplier management and supplier scorecards. |
| WAD control | Constitution revision history records WAD approval/backfill audit behavior and release gating. | Useful backbone, needs full WAD approval matrix, revision history, overrun approvals, and budget enforcement UI. |
| Material issue control | Constitution Section 10 records controlled material issue service, routing-step enforcement, operator badge sessions, inventory ledger writes, and blocker-based rejection. `server/schema.ts` includes material lots, reservations, transactions, and `inventoryTransactionLedger`. | Strong execution-control foundation, needs full genealogy viewer and end-to-end lot-to-serial traceability. |
| Role and capability controls | `server/schema.ts` includes both legacy capability grants and newer `perm_*` capability tables/scopes. | Present but needs enterprise capability matrix for restricted AS9100/DCAA actions. |
| Controlled documents | `server/schema.ts` includes `controlledDocuments` and document-version records. | Partial controlled-document foundation, needs vault hardening, CAD/drawing access logs, MFA, download tracking, and expiring links. |
| NCR basis | `server/schema.ts` includes `nonconformanceRecords`. | Partial quality foundation, needs containment, root cause, corrective action, effectiveness review, and CAPA linkage. |

## Domain Gap Matrix

| Domain | Target State | Current State | Primary Gap | Priority |
| --- | --- | --- | --- | --- |
| Commercial: RFQ -> Quote -> PO | Estimates are versioned, approved, assumption-backed, risk-scored, and quote snapshots are immutable. | RFQ controls and quote snapshots now exist in schema/routes. | Enforce quote release only after required estimating approvals and risk closure; emit all actions to the unified audit ledger. | P0 |
| Contractual | Formal contract review verifies engineering, quality, procurement, scheduling, finance, clauses, specs, capacity, and supplier availability. | Purchase review checklist and project FAR flowdown exist in related work. | Create a configurable contract review checklist engine and formal clause flowdown object model for customer PO clauses. | P0 |
| Manufacturing Authorization | WAD is the executable budget, scope, charge-code, and release authority. | WAD status/backfill and approval audit behavior exists. | Add WAD approval matrix, rejection/revision history, real-time budget enforcement, and project overrun approval requests. | P0 |
| Engineering Control | BOM, routing, traveler templates, work instructions, specs, and QC forms have draft/review/approved/released/obsolete workflows. | Routing and traveler execution foundations exist, controlled documents exist. | Add generic controlled revision framework with effectivity by serial range, date, customer, project, and ECO. | P0 |
| Procurement & Supply Chain | PR -> approval -> PO is enforced, suppliers are approved by scope, audits, expirations, and scorecards. | Purchase requisitions and PO controls exist. | Add approved supplier tables, scope approvals, audit tracking, scorecards, expiration gates, and immutable supplier decisions. | P1 |
| Receiving & Material Control | Configurable inspection plans, strict dispositions, doc holds, and material genealogy are enforced before use. | Receiving traceability/doc hold work and material issue gates exist in related branches/main history. | Add receiving inspection plan rules and full lot genealogy from raw material to serial shipment. | P0 |
| Manufacturing Execution | Travelers enforce mandatory scans, training/certification validation, signoff, labor capture, and material consumption. | Traveler scan and material issue enforcement are strong; operator auth exists. | Add training/certification gate at operation execution and traveler-step electronic signoff completeness before shipment. | P1 |
| Quality & Compliance | NCR, CAPA, calibration, FAIR, cert packages, and shipment validation produce audit-ready evidence. | NCR table exists; inspection/cert pieces are partial. | Expand NCR into containment/root cause/CAPA/effectiveness, add calibration lockout, and gate shipment on complete quality evidence. | P1 |
| Audit / DCAA / Security | Critical actions across every domain write hash-chained ledger events, electronic signatures, retention, and capability controls. | Unified audit ledger, anchors, retention, and capability tables exist. | Create required-event coverage map and fail-closed service wrappers so domain actions cannot bypass `recordAuditEvent()`. | P0 |
| CMMC / ITAR / Security | Controlled document vault, MFA, device/session tracking, access logs, download tracking, and expiring links protect CUI/customer data. | Authentication and controlled documents exist, but vault controls are not complete. | Add controlled vault policy layer and session security controls tied to access logs and capability scopes. | P1 |

## Section-by-Section Buildout Plan

### Section 1: RFQ / Estimating / Cost Builder

Current foundation:

- `estimate_versions`
- `estimate_line_versions`
- `estimate_assumptions`
- `estimating_approvals`
- `risk_assessments`
- `risk_items`
- `mitigation_actions`
- Routes for RFQ versions, assumptions, approvals, readiness checks, risk assessment items, and mitigations.

Remaining work:

- Add UI surfaces for version history, assumption review, role approvals, risk scoring, and mitigation closure.
- Gate quote release on `approval-readiness` plus risk assessment status.
- Add immutable audit events for every version creation, assumption change, approval/rejection, risk item update, and mitigation closure.
- Add executive approval threshold policy based on estimated value, margin, risk score, or customer/compliance category.

Overlap warning:

- This area directly overlaps recent RFQ work now merged from `codex/rfq-estimating-controls`.

### Section 2: Quoting System

Current foundation:

- `quote_snapshots`
- `quote_line_snapshots`
- `quote_po_reconciliations`
- Sent quotes are blocked from normal edit paths.
- Quote submission creates immutable snapshots.

Remaining work:

- Expand snapshot payload checks for BOM assumptions, labor assumptions, lead times, exclusions, cert requirements, and contractual clauses.
- Add PO reconciliation UI with revision, pricing, clause, schedule, and quantity mismatch flags.
- Link quote snapshot approval to contract review before project release.

Overlap warning:

- This area overlaps recent quote snapshot and PO reconciliation work already fast-forwarded into this branch from `origin/main`.

### Section 3: Contract / PO Review

Current foundation:

- Purchase review checklist concepts exist.
- Project FAR/DFARS flowdown continuity exists in related work.
- Procurement controls mention FAR clause flowdown expectations.

Remaining work:

- Add configurable contract review checklist templates and checklist instances.
- Add required review areas: engineering, quality, procurement, scheduling, and finance.
- Add formal clause objects: `contract_clauses`, `clause_templates`, and `flowed_requirements`.
- Flow clauses automatically into PO, traveler, QC, supplier PO, and cert package requirements.

### Section 4: WAD

Current foundation:

- WAD status/backfill flow exists.
- WAD approval emits immutable ledger events.
- Labor and material issue controls reference WAD authority.

Remaining work:

- Add WAD approval matrix: PM, engineering, quality, operations, executive.
- Add WAD revision history with rejection workflow.
- Enforce budget controls for labor hours, material spend, and outside processing caps.
- Add real-time percent-used and projected-overrun calculations.
- Require approval requests for overrun, charge-code override, and late-release exceptions.

### Section 5: Engineering Control

Current foundation:

- Controlled documents and document versions exist.
- Routing/traveler execution controls exist.

Remaining work:

- Add a reusable revision framework for BOM, routing, traveler templates, work instructions, specs, and QC forms.
- Add release states: draft, review, approved, released, obsolete.
- Add effectivity by serial range, date, customer, and project.
- Add ECO change request, impact review, approval, implementation date, and release linkage.

### Section 6: Procurement System

Current foundation:

- Purchase requisition tables exist.
- Direct-PO exception policy and capability are documented.
- FAR flowdown to vendor PO has related work.

Remaining work:

- Add PR approval thresholds: buyer under $500, manager over $500, executive over $5,000.
- Add approved suppliers, supplier scopes, supplier audits, and supplier scorecards.
- Make vendor approval status, expiration, debarment, and scope match fail-closed before PO issue.
- Emit immutable procurement ledger/audit events through the unified ledger for every decision.

### Section 7: Receiving / Material Control

Current foundation:

- Material lots, lot transactions, reservations, issue blockers, operator auth, and inventory transaction ledger exist.
- Receiving proof/document-hold work exists in related branches and recent history.

Remaining work:

- Add configurable receiving inspection plans by item, material type, risk, supplier status, and flight-critical flag.
- Block consume, reserve, or issue for rejected, quarantined, expired, or document-held lots unless a governed approval path exists.
- Build full genealogy from raw material lot -> kit -> traveler -> assembly -> serial number -> shipment.
- Add signed traceability export suitable for customer and AS9100 audit packages.

### Section 8: Manufacturing Execution

Current foundation:

- Traveler scan is treated as a first-class labor control.
- Material issue gate chain enforces WAD, routing step, allocation, lot status, and operator authorization.

Remaining work:

- Add mandatory operation scans and electronic signoff completeness gates.
- Validate training and certification before operation execution.
- Tie every labor entry to employee, charge code, operation, project, traveler step, timestamp, and WAD.
- Add daily employee time certification and supervisor approval status.

### Section 9: Quality System

Current foundation:

- Nonconformance records exist.
- Inspection results can link nonconformance IDs and corrective actions in some areas.

Remaining work:

- Expand NCR with containment, root cause, corrective action, disposition, and effectiveness review.
- Add CAPA for corrective/preventive actions, recurrence tracking, and effectiveness closure.
- Add calibration management for gages, expiration, calibration evidence, lockout, and operation/tool use enforcement.

### Section 10: Shipping / Cert Package

Current foundation:

- Shipping and QC artifacts exist in the repo, but cert package orchestration is not yet enterprise-complete.

Remaining work:

- Gate shipment on traveler completion, NCR closure, inspection completion, required cert attachment, and WAD/project state.
- Add certificate package builder for CoC, material certs, special process certs, FAIR, inspection reports, and customer clause evidence.
- Export cert packages with audit manifest, package hash, and revision snapshot.

### Section 11: Audit / DCAA / Security

Current foundation:

- Unified audit ledger architecture exists.
- Audit anchors and retention policies exist.
- Digital signatures migration exists.
- Capability systems exist.

Remaining work:

- Create required-event coverage matrix for inventory, procurement, labor, approvals, quality, engineering, shipping, and security.
- Replace raw per-domain audit inserts with `recordAuditEvent()` where compliance evidence is required.
- Add electronic signature meaning, reason, username, timestamp, role, and linked object coverage to all approval actions.
- Expand role/capability matrix for approval overrides, labor overrides, revision releases, PO approvals, NCR closure, vault access, and shipment release.
- Add configurable retention/archive policy by contract, cert, traveler, labor, procurement, quality, and engineering object type.

### Section 12: CMMC / ITAR / Security

Current foundation:

- Controlled documents exist.
- Authentication and permission primitives exist.

Remaining work:

- Add controlled document vault for CAD, drawings, specs, and customer files.
- Enforce encryption-at-rest policy, access logs, MFA, device tracking, download tracking, expiring links, and session timeout.
- Add CUI/ITAR classification fields and access rules to controlled documents and contract/customer artifacts.

## Recommended Execution Order

### Immediate Recommendations

1. Create an audit-event coverage matrix before adding more domain features. Each row should name the critical action, required actor, required signature meaning, required ledger event type, required linked object IDs, and the fail-closed rule if the event cannot be written.
2. Make the approval engine the common path for high-risk actions. Estimating approvals, WAD approvals, purchase approvals, inventory overrides, NCR closure, ECO release, shipment release, and vault access exceptions should not each invent their own approval shape.
3. Treat `recordAuditEvent()` as a platform boundary. Any new feature in this buildout should define its required audit events before implementation and should use the unified ledger rather than adding another isolated audit table.
4. Build revision control as a shared framework, not as separate one-off revision tables for BOMs, routings, work instructions, traveler templates, specs, and QC forms.
5. Do clause flowdown before deep cert-package automation. The cert package builder will be much stronger if contract clauses already know which PO, traveler, supplier PO, QC form, and cert artifact must satisfy them.
6. Make material genealogy read-only and exportable early. A simple lot-to-traveler-to-serial traceability viewer will expose missing links before the team adds more downstream automation.
7. Keep CMMC/ITAR vault work separate from general controlled-documents work. Drawings, CAD, and customer CUI need stricter session, MFA, download, and access-log controls than ordinary procedure documents.
8. Add tests around gates, not just happy-path CRUD. The most important compliance tests should prove blocked actions stay blocked: edited sent quote, WAD release without approvals, material issue from quarantined/expired lot, shipment with open NCR, supplier PO to unapproved supplier, and labor posting into a closed period.

### Phase 1: Foundation Closure

1. Audit event coverage matrix and service wrappers.
2. Enterprise approval workflow engine adoption across WAD, estimating, procurement, inventory overrides, NCR, and engineering release.
3. Revision-control framework for engineering-controlled artifacts.
4. Clause-flowdown engine from contract review.

### Phase 2: Cradle-to-Grave Material And Contract Chain

1. Contract review checklist engine.
2. Receiving inspection plans.
3. Material genealogy viewer and signed export.
4. Supplier approval management.
5. Shipment validation and cert package builder.

### Phase 3: DCAA And Quality Maturity

1. Daily employee time certification.
2. Supervisor approval completeness dashboards.
3. Period-close hard lock and reopen workflow coverage checks.
4. NCR/CAPA expansion.
5. Calibration management and lockout.

### Phase 4: CMMC / ITAR Hardening

1. Controlled document vault.
2. MFA and device/session controls.
3. Download and access telemetry.
4. Retention/archive execution policy.

## Parallel Branch Overlap Notes

Known active or recent branches in this workspace indicate likely overlap:

| Branch | Area | Overlap Risk |
| --- | --- | --- |
| `codex/rfq-estimating-controls` | RFQ versions, assumptions, approvals, risk controls | High for Section 1. |
| `codex/quote-contract-snapshots` | Quote snapshots and quote-to-PO reconciliation | High for Section 2, now apparently merged into `origin/main`. |
| `codex/far-flowdown-projects` | FAR/DFARS project flowdown from purchase review checklist | High for Section 3 clause continuity. |
| `codex/receiving-document-hold-enforcement` | Receiving hold/release and closeout gating | High for Section 7 receiving controls. |
| `codex/inventory-status-traceability-controls` | Material disposition and issue control | High for Section 7 material control. |
| `codex/parts-request-po-approvals` | Parts request to PO approval controls | Medium for Section 6 procurement workflow. |
| `codex/procurement-project-traceability` | Vendor PO project/WAD/charge-code traceability | Medium for Sections 4 and 6. |
| `codex/vendor-po-p2-compliance-gate` | Vendor PO push-through / compliance gating | Medium for Sections 6 and 7. |

This document-only PR intentionally avoids direct schema or route changes so it can be reviewed without blocking or conflicting with those implementation branches.

## Done Criteria For Enterprise Compliance Readiness

EPOCH should not be considered cradle-to-grave aerospace-compliance ready until these conditions are true:

1. Every critical action has an immutable event in the unified audit ledger.
2. Every approval carries actor, role, timestamp, meaning, reason, linked object, and signature evidence.
3. Every controlled object has a released revision and effectivity model.
4. Every contract clause can be traced downstream to the operational object that must satisfy it.
5. Every material lot can be traced to every traveler, assembly, serial, shipment, and cert package it affected.
6. Every labor entry is certified daily by the employee, approved by the supervisor, tied to WAD/project/charge code/traveler step, and correction-only after approval.
7. Every supplier decision is scoped, approved, unexpired, scored, auditable, and enforced before purchasing.
8. Every shipment is blocked until traveler, quality, NCR, cert, receiving, and contract evidence are complete.
9. Every CUI/ITAR/customer-controlled document is protected by vault access, logging, MFA/session controls, and retention rules.
