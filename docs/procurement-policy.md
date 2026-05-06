# Procurement Policy — Purchasing Controls (Task #83)

This document codifies the requisition → approval → vendor PO chain enforced by EPOCH v8 to satisfy government-contracting (FAR/DFARS) audit requirements.

## Pipeline (authoritative)

```
purchase_requisitions (DRAFT)
  → SUBMITTED (approval chain rows generated)
  → APPROVED (final stage approval requires fresh debarment check evidence when vendorId is set)
  → CONVERTED_TO_PO (linked to vendor_pos.requisitionId)
vendor_pos.issue endpoint enforces:
  - linked APPROVED requisition  OR  recorded direct-PO exception (when allow_direct_po=true)
  - competition method recorded
  - sole-source justification (≥10 chars) when method = sole-source
  - FAR flowdown checklist recorded with reasoning per clause
  - vendor debarment check passing within procurement_settings.debarment_check_freshness_days
```

## Statuses

| Status            | Meaning                                                    | Transitions                              |
|-------------------|------------------------------------------------------------|------------------------------------------|
| DRAFT             | Created by requester; editable                             | → SUBMITTED, → CANCELLED                 |
| SUBMITTED         | Approval chain seeded; awaiting decisions                  | → APPROVED, → REJECTED, → CANCELLED      |
| APPROVED          | All stages approved, debarment evidence captured           | → CONVERTED_TO_PO, → CANCELLED           |
| REJECTED          | A stage rejected the requisition                           | terminal                                 |
| CONVERTED_TO_PO   | Linked to a vendor PO (set when PO is issued)              | terminal                                 |
| CANCELLED         | Cancelled before conversion                                | terminal                                 |

## Approval chain configuration

`purchase_requisition_approval_chain` rows define which capability must approve at each stage, scoped by category and dollar range.

Default (when no row matches):
- Stage 1 — `purchasing.approve_requisition`

Recommended seed (admin-configurable via `POST /api/purchase-requisitions/admin/approval-chain`):
- `default`, $0 – $5,000  → Stage 1 = `purchasing.approve_requisition`
- `default`, $5,001 – $25,000  → Stage 1 = `purchasing.approve_requisition`, Stage 2 = `finance.approve_mid`
- `default`, $25,001 – ∞  → Stage 3 = `finance.approve_high` (CFO/Owner)

## Capabilities used

| Capability key                              | Granted to (typical)            | Purpose                                                 |
|---------------------------------------------|---------------------------------|---------------------------------------------------------|
| `purchasing.view_requisitions`              | All purchasing/finance staff    | Read requisitions, queue, FAR clause library            |
| `purchasing.create_requisition`             | Requesters                      | Create / submit / cancel own drafts                     |
| `purchasing.approve_requisition`            | Purchasing manager              | Default stage-1 approval                                |
| `purchasing.admin_chain`                    | Owner / Compliance              | Manage chain config, FAR clause library, settings       |
| `purchasing.record_debarment_check`         | Purchasing / Compliance         | Record SAM.gov / attestation evidence                   |
| `purchasing.direct_po_exception`            | Owner / CFO                     | Approve direct-PO without requisition (when allowed)    |
| `purchasing.manage_pos`                     | Purchasing                      | Edit PO + attach FAR flowdowns                          |
| `purchasing.approve_po`                     | Purchasing manager              | Issue vendor PO (gate evaluated here)                   |

`finance.approve_mid` and `finance.approve_high` are example tiered finance capabilities.

## FAR flowdown checklist

`far_flowdown_clauses` is the admin-managed clause library; `vendor_po_far_flowdowns` records the per-PO selection with `applicable` boolean and a free-text `reasoning`.

A PO cannot be issued unless **at least one row** has been recorded for the PO and every row has `reasoning` of ≥3 characters. Marking a clause `applicable = false` is acceptable but still requires reasoning.

## Vendor debarment checks

`vendor_debarment_checks` captures SAM.gov / attestation evidence with these fields: `source`, `result` (`pass` | `fail` | `inconclusive`), `evidenceUrl`, `attestationText`.

Two enforcement points:
1. **Requisition approval (final stage, when `vendorId` is set):** the approver must either submit a `debarmentCheck` payload with the decision OR an existing passing check within `debarmentCheckFreshnessDays` must be on file.
2. **Vendor PO issuance:** a passing check within freshness window is required; the PO issuance flow auto-records a `po_issuance` evidence row referencing the relied-upon check.

> **Out of scope for Task #83:** live SAM.gov API calls. Today the `source` is recorded but the integration is manual. A follow-up task will add automated SAM.gov polling.

## Direct-PO exception

When `procurement_settings.allow_direct_po = true`, a PO may be issued without a requisition by populating `vendor_pos.directPoExceptionApprovedAt` / `Reason` (≥10 chars). The exception approval should be performed by a user holding `purchasing.direct_po_exception`.

This is intentionally a deviation path — discouraged and reviewed during the procurement audit report (`GET /api/purchase-requisitions/audit/report`).

## Audit evidence

The audit report endpoint returns, for any date range, every requisition with its approval history and associated debarment-check evidence — sufficient for DCAA / contracting officer review.

CSV export is a follow-up; today the JSON response is the system-of-record.

## Related

- `docs/EPOCH_ARCHITECTURE_CONSTITUTION.md` — see "Purchasing Controls" addendum
- `server/schema.ts` — table definitions (search for "Purchasing Controls")
- `server/src/routes/purchaseRequisitions.ts`, `farFlowdownClauses.ts`, `vendorDebarmentChecks.ts`
- `server/src/routes/vendorPOs.ts` — `POST /:id/issue` purchasing-controls gate
