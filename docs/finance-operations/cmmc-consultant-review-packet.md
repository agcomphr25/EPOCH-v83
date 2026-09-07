# EPOCH Finance Operations AI — CMMC/IT Consultant Review Packet

Status: Review requested before any finance data is sent to an AI model.

## Proposed use

AG Composites intends to add an EPOCH-native Finance Operations assistant. EPOCH's deterministic services remain authoritative. The model would be limited to investigating approved structured facts, prioritizing attention items, explaining deterministic exceptions, and preparing non-posted drafts.

The model would not approve, post, send, void, pay, alter permissions, change customer/vendor master data, or process payment instructions.

## Initial deployment state

- Operator: authenticated EPOCH user `glennj` only.
- Finance Attention Center: feature-flagged off by default.
- AR draft preparation: feature-flagged off by default.
- AI explanations/data transmission: separately feature-flagged off by default.
- Initial scope: P2 standard shipment invoices, followed by P1.
- External email ingestion: none.
- Model access to attachments/PDFs: none.
- Model access to internal free text: none.
- External notifications: none.
- Posting, sending, and payment authority: none.

## Proposed data flow

```text
EPOCH source records
  -> deterministic local query/calculation
  -> field minimization and tokenization
  -> approved AI provider (only after review)
  -> explanation/recommendation
  -> EPOCH validation and display
  -> human decision
  -> deterministic EPOCH action
  -> append-only audit evidence
```

## Candidate fields for model disclosure

Only fields required by an approved tool would be disclosed. Candidate low-context fields include tokenized customer/order/part identifiers, dates, quantities, monetary amounts, payment terms, deterministic status/exception codes, and age/duration metrics.

Identity-bearing customer, vendor, PO, contract, project, and part information would be disclosed only when the approved use case requires identity and the data classification permits it.

## Explicitly prohibited model inputs in the pilot

- Drawings, CAD, specifications, technical data, and manufacturing instructions
- Customer or vendor attachments and invoice PDFs
- Quality records and controlled-document content
- Internal notes and unrestricted free text
- Credentials, secrets, authentication artifacts, and security configuration
- Bank-account, routing, card, and payment-instruction data
- Export-controlled or CUI content unless the provider and architecture are explicitly approved for it

## Controls

- Independent fail-closed feature gates
- ADMIN/OWNER authentication plus exact pilot username restriction
- Narrow purpose-specific tools
- No general database query or browser-control tool
- No model-accessible approval, posting, sending, payment, void, or permission mutation
- Deterministic financial calculations
- Source-version and evidence-hash binding
- Automatic approval revocation when source evidence changes
- Append-only, hash-chained finance decision evidence
- Seven-year retention floor pending professional review
- Human recipient/PDF preview before sending
- Normal EPOCH operation when AI is unavailable

## Questions requiring consultant determination

1. Which EPOCH finance fields are CUI, FCI, Security Protection Data, export-controlled, or otherwise restricted in AG Composites' environment?
2. Can combinations of otherwise ordinary invoice fields reveal controlled program context?
3. Is the proposed AI provider/configuration permitted to process any approved finance fields?
4. What contractual, FedRAMP, residency, retention, incident-reporting, and training-use terms apply?
5. Must prompts omit or redact specific identifiers before transmission?
6. May prompts, outputs or tool results be retained by the provider, and for how long?
7. Do EPOCH application logs, model traces, or audit records constitute Security Protection Data?
8. Does this change EPOCH's CMMC assessment boundary, SSP, network/data-flow diagrams, asset inventory, or customer responsibility matrix?
9. Are `ar@agcomposites.com` and `ap@agcomposites.com` inside the intended boundary, and what mailbox environment and retention controls apply?
10. Is seven-year retention appropriate for all proposed finance decision evidence?
11. What incident response is required for accidental prohibited-data disclosure to the model?
12. What approval record should be retained before enabling `FINANCE_AI_EXPLANATIONS_ENABLED`?

## Requested output

Please classify each proposed input field and data flow as:

- Approved for the proposed AI service
- Approved only with tokenization/redaction
- Keep entirely inside EPOCH
- Requires customer/contract-specific review
- Prohibited

Please also identify required SSP, policy, contract, training, logging, and incident-response updates. Until written approval is received and recorded, the AI explanation flag will remain disabled.
