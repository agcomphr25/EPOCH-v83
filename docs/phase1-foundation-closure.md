# Phase 1 Foundation Closure

This closes the foundation layer for the next compliance push by making the audit, approval, revision-control, and clause-flowdown seams explicit and queryable.

## Live coverage endpoint

`GET /api/governance/phase1-foundation`

The endpoint returns the Phase 1 domain matrix from `server/src/services/phase1FoundationClosure.ts`, including:

- covered domains
- expected audit event names
- enterprise approval request types
- owning source routes or services
- revision-control and clause-flowdown persistence anchors

## Coverage matrix

| Domain | Audit coverage | Enterprise approval adoption | Foundation anchor |
| --- | --- | --- | --- |
| WAD | `WAD_APPROVAL_RECORDED`, `WAD_EXCEPTION_REQUESTED` | `WAD_APPROVAL`, `WAD_EXCEPTION` | `server/src/routes/workOrders.ts` |
| Estimating | `ESTIMATE_RELEASED` | `ESTIMATE_RELEASE` | `server/src/routes/estimating.ts` |
| Procurement | `PO_FAR_FLOWDOWNS_RECORDED`, `PROCUREMENT_COMPLIANCE_EFFECTIVE_DATE_CHANGED` | `PURCHASE_REQUISITION_APPROVAL`, `PROCUREMENT_DIRECT_PO_EXCEPTION` | `server/src/routes/purchaseRequisitions.ts`, `server/src/routes/vendorPOs.ts` |
| Inventory overrides | `INVENTORY_HIGH_RISK_APPROVAL_EXECUTED` | `INV_MANUAL_ADJUSTMENT`, `INV_ALLOCATION_OVERRIDE`, `INV_QUARANTINE_RELEASE` | `server/src/services/inventoryApprovalExecutor.ts` |
| NCR | `NCR_DISPOSITION` | `NCR_DISPOSITION` | `server/routes/nonconformance.ts` |
| Engineering release | `ENGINEERING_REVISION_TRANSITIONED` | `ENGINEERING_RELEASE`, `ENGINEERING_ECO_APPROVAL` | `engineering_controlled_revisions`, `engineering_change_orders`, `engineering_eco_revision_links` |
| Contract flowdown | `CONTRACT_FLOWDOWN_RECORDED` | `CONTRACT_CLAUSE_FLOWDOWN` | `contract review checklist`, `project_far_flowdowns`, `vendor_po_far_flowdowns` |

## Service wrappers

`phase1FoundationClosure.ts` exports:

- `getPhase1FoundationCoverage()` for UI, reports, and readiness checks.
- `getPhase1ApprovalRequestTypes()` for validating the Phase 1 request-type list.
- `openPhase1ApprovalRequest()` as a constrained wrapper around `escalationService.openRequest()`.
- `logPhase1ControlEvent()` as a constrained wrapper around `auditService.logEvent()`.

These wrappers give future feature routes one controlled import instead of scattering request-type and event-name strings.

## Approval policy seeding

`migrations/0129_phase1_foundation_closure.sql` seeds the uncovered request types into `escalation_policies` and refreshes existing rows idempotently. Inventory high-risk approvals and the base NCR policy already existed; this migration completes WAD, estimating, procurement, engineering release, and contract flowdown coverage.

## Revision control

Engineering-controlled artifacts are already anchored by:

- `engineering_controlled_revisions`
- `engineering_change_orders`
- `engineering_eco_revision_links`
- `/api/engineering-control`

The supported artifact classes are `BOM`, `ROUTING`, `TRAVELER_TEMPLATE`, `WORK_INSTRUCTION`, `SPEC`, and `QC_FORM`.

## Clause flowdown

Clause flowdown now has explicit continuity anchors:

- contract review checklist and purchase review checklist as source-of-truth capture
- `project_far_flowdowns` for project continuity
- `vendor_po_far_flowdowns` for PO-level supplier flowdown
- `/api/far-flowdown-clauses/project/:projectId` for project visibility
