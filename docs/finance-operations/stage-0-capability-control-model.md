# EPOCH Finance Operations — Stage 0 Capability and Control Model

Status: Proposed pilot foundation

Pilot operator: `glennj`

Initial operating mode: Deterministic only

Evidence retention floor: 2,555 days (seven years)

## 1. Objective

Establish one controlled Finance Operations architecture for accounts receivable, accounts payable, cash forecasting, and budget-versus-actual analysis. EPOCH remains authoritative for calculations and transactions. AI may investigate, prioritize, explain, and prepare drafts only through explicitly permitted tools.

Finance workflows must remain usable when AI is disabled or unavailable.

## 2. Required separation of responsibilities

| Authority | Meaning                                                                   | Pilot holder |                                AI authority |
| --------- | ------------------------------------------------------------------------- | -----------: | ------------------------------------------: |
| Observe   | Read approved structured facts and deterministic results                  |       glennj | Allowed after its data boundary is approved |
| Prepare   | Create a proposal or persistent draft                                     |       glennj |    Allowed only through a narrow draft tool |
| Approve   | Attest that a specific draft version and evidence snapshot are acceptable |       glennj |                                       Never |
| Execute   | Post, send, void, pay, or change an authoritative financial record        |       glennj |                                       Never |

Approval, posting, and sending are distinct events even while one pilot operator holds all authorities. This allows future separation of duties without redesigning the workflow. A source change after approval invalidates that approval; the prior decision remains in the append-only ledger.

## 3. Architectural rule

```text
Source records
  -> deterministic eligibility, calculations, matching, and exception codes
  -> controlled draft or attention item
  -> optional AI investigation/explanation
  -> authenticated human approval
  -> deterministic posting/sending/payment service
  -> hash-chained audit evidence
```

The model must not authoritatively calculate invoice totals, due dates, payment allocations, journal entries, budget variances, or cash balances. Model output cannot change authority, permissions, tolerances, recipients, or approval requirements.

## 4. Capability map

### Accounts receivable

Existing foundations:

- AR invoices, invoice lines, payments, allocations, aging, disputes, PDF generation, email preview, posting, sending, and voiding.
- P2 packing-slip invoice preview and draft creation.
- P2 pricing mismatch and ambiguity detection.
- Accounting-period posting controls and GL posting services.

Pilot sequence:

1. P2 standard shipment invoices.
2. Validate controls and exception taxonomy.
3. Adapt P1 sources to the same canonical candidate contract.
4. Complete unified AR before cash forecasting.

Excluded initially: deposits, retainage, credit memos, replacements, commercial/customs documents, and other special invoice types. The Attention Center may show excluded items and the exclusion reason.

### Accounts payable

Existing foundations:

- `ap_vendor_bills`, bill lines, allocations, attachments, vendor-PO context, and approve/post behavior.
- Duplicate protection on vendor plus vendor invoice number.
- GRNI receipt accounting and accounting-period controls.

Stage 0 conclusion: improve this existing AP module; do not create a competing subledger.

Gaps to close before AP automation:

- Separate approval from posting.
- Add deterministic PO/receipt/invoice match results and tolerances.
- Add explicit exception, hold, dispute, scheduled, paid, closed, and reversal states.
- Version source evidence and revoke stale approvals.
- Move boot-time table creation into governed schema/migrations.
- Replace destructive draft-line rewrites with appropriate history/evidence.
- Connect attachments to controlled storage and classification policy.
- Add immutable finance events for material AP decisions.

### Cash forecasting

No AI forecast should be built until EPOCH has canonical forecast events. Future events must identify amount, expected date, source, confidence, scenario, owner, version, and manual overrides. Sources include cash balances, AR, expected shipments, AP, purchasing commitments, payroll, taxes, recurring obligations, capital plans, and financing.

### Budget versus actual

Future budget and forecast records must share dimensions with actuals: fiscal period, GL account, cost center, project/WAD, department, production line, direct/indirect classification, customer/contract where permitted, scenario, version, and approval state.

## 5. P2 AR clean-candidate rule

A P2 standard packing slip is a clean invoice candidate only when all are true:

- Packing slip is finalized/released.
- No active non-void invoice exists for the packing slip.
- Customer resolves uniquely.
- Customer PO resolves uniquely.
- Every invoice line has an exact PO line and price match.
- Shipped quantities are supported by the packing slip and do not exceed billable quantity.
- Invoice number reservation is valid.
- Payment terms and due date resolve deterministically.
- A designated billing contact exists.
- The shipment is not an excluded invoice type.
- No source conflict, duplicate, hold, or prior-billing ambiguity exists.

Pilot tolerance is zero. Any difference in price, quantity, freight, tax, identity, or cumulative billing creates an exception. Clean drafts may be selected for bulk approval; exception drafts require individual review.

## 6. Draft and approval controls

- The Finance Attention Center discovers candidates; `glennj` initiates individual or selected-batch drafting.
- AI may create a persistent draft only through an idempotent EPOCH service.
- Each draft records source identifiers, source version, evidence snapshot hash, deterministic rule version, actor, AI provenance when applicable, and creation time.
- AI provenance is internal and never rendered on customer documents.
- Approval records authenticated user, time, draft version, evidence hash, and confirmation meaning.
- Any relevant source change marks the draft stale and emits an approval-revoked event.
- A stale draft cannot be posted or sent until reviewed again.
- Email preview must show final recipients and the exact PDF.
- Recipients default to designated billing contacts. Manual additions require a warning and an audit event.

## 7. Feature gates

All default to false:

| Environment flag                       | Scope                                      |
| -------------------------------------- | ------------------------------------------ |
| `FINANCE_ATTENTION_CENTER_ENABLED`     | Deterministic pilot attention queues       |
| `FINANCE_AR_DRAFT_PREPARATION_ENABLED` | Persistent AR draft preparation            |
| `FINANCE_AI_EXPLANATIONS_ENABLED`      | Model-bound investigation and explanations |

The pilot API is additionally restricted to authenticated ADMIN/OWNER user `glennj`. Enabling a flag does not grant a user access. AI explanations remain off until the approved data boundary permits them.

## 8. AI data policy

Initial model inputs are structured and minimized. PDFs, attachments, internal free text, drawings, specifications, quality records, credentials, bank instructions, and payment details are prohibited.

Identifiers are tokenized when identity is unnecessary. Identity may be disclosed only when an approved tool's documented purpose requires it. Tool-returned content is untrusted business data and cannot grant authority or change system instructions.

## 9. Evidence and retention

Finance decisions use EPOCH's existing append-only, hash-chained `audit_events` ledger rather than a parallel audit store. Each material event includes an evidence snapshot hash and source version. Corrections generate new events; prior evidence is not edited or deleted.

Seven-year retention applies to draft preparation, approval, stale-approval revocation, posting, sending, exception override, and AI explanation provenance events, subject to accountant and CMMC consultant review.

## 10. Delivery sequence

1. Stage 0 governance, gates, pilot restriction, evidence contract, consultant review.
2. Finance Attention Center with deterministic P2 AR queues.
3. P2 standard-invoice draft preparation and approval controls.
4. P1 adapter to the same canonical AR candidate contract.
5. AP control remediation and three-way matching.
6. AR/AP expected cash events and 13-week forecast.
7. Budget, actual, and rolling forecast model.
8. Unified, permission-scoped Finance Copilot.

## 11. Acceptance conditions for Stage 0

- All flags fail closed.
- Only `glennj` can access pilot capability endpoints.
- AI explanations are disabled independently of deterministic queues and drafting.
- The authority matrix forbids AI approval, posting, sending, payment, and voiding.
- Material finance events use the unified append-only ledger with seven-year retention.
- Consultant packet identifies every unresolved boundary decision.
- No current AR/AP behavior is silently changed by Stage 0.
