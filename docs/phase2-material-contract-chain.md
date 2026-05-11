# Phase 2 Cradle-to-Grave Material And Contract Chain

This opens Phase 2 by making the material and contract chain explicit, queryable, and ready to wire into the operating screens.

## Live coverage endpoint

`GET /api/governance/phase2-material-contract-chain`

The endpoint returns the Phase 2 domain matrix from `server/src/services/phase2MaterialContractChain.ts`, including:

- contract review checklist engine
- receiving inspection plans
- material genealogy viewer and signed export
- supplier approval management
- shipment validation and cert package builder

## Coverage matrix

| Domain | Primary control | Source of truth | Downstream handoff |
| --- | --- | --- | --- |
| Contract review checklist | Contract review checklist engine | contract review checklist | project flowdown, supplier selection, receiving inspection planning, shipment validation |
| Receiving inspection | Receiving inspection plans | contract requirements plus PO line requirements | inventory availability, supplier scorecards, invoice match, audit retention |
| Material genealogy | Material genealogy viewer and signed export | receipt units, material lots, inventory ledger, production consumption, shipment package records | customer cert package, audit evidence, nonconformance trace-back |
| Supplier approval | Supplier approval management | approved supplier list and supplier qualification records | vendor selection, PO release, receiving risk level, supplier performance review |
| Shipment validation | Shipment validation and cert package builder | contract requirements, genealogy evidence, receiving documents, inspection results, shipment records | customer shipment, audit archive, customer-facing cert package |

## Phase 2 control intent

The contract review checklist becomes the front door for material and certification obligations. Those obligations should carry forward through supplier approval, PO release, receiving inspection, inventory hold/release, material genealogy, production consumption, shipment validation, and final cert-package export.

## Required audit events

The Phase 2 coverage service declares the audit events each track needs before it can be considered implementation-complete:

- `CONTRACT_REVIEW_ENGINE_COMPLETED`
- `CONTRACT_REQUIREMENT_CHANGED`
- `CONTRACT_CERT_REQUIREMENT_RECORDED`
- `RECEIVING_INSPECTION_PLAN_CREATED`
- `RECEIVING_INSPECTION_PLAN_APPLIED`
- `RECEIVING_DOCUMENT_HOLD_RELEASED`
- `MATERIAL_GENEALOGY_VIEWED`
- `MATERIAL_GENEALOGY_EXPORT_SIGNED`
- `MATERIAL_TRACEABILITY_LINK_CHANGED`
- `SUPPLIER_APPROVAL_GRANTED`
- `SUPPLIER_APPROVAL_EXPIRED`
- `SUPPLIER_EXCEPTION_APPROVED`
- `SHIPMENT_VALIDATION_COMPLETED`
- `CERT_PACKAGE_BUILT`
- `SHIPMENT_REQUIREMENT_WAIVED`

## Exit criteria

Phase 2 is ready to close when:

- contract review creates structured requirements instead of free-text-only notes
- receiving inspection plans are visible before disposition and enforce document hold/release
- material genealogy traces shipped units back to receipt evidence, supplier, and source identifiers
- signed genealogy exports include signer, timestamp, immutable hash, and evidence manifest
- PO release validates supplier approval against material, process, and project scope
- shipment closeout blocks missing contract-required documents, genealogy links, or inspection releases
- cert packages are generated from linked evidence and retained with a signed manifest
