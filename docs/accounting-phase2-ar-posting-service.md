# Accounting Phase 2 AR Posting Service

Phase 2 moves AR invoice journal-entry construction behind the shared accounting posting boundary created in Phase 0.

## Scope

- Add `arInvoicePostingService` for posted customer invoices.
- Keep the existing invoice posting route and user workflow intact.
- Use `createOrReplaceAccountingPosting` for AR invoice journal entries instead of hand-building `journal_entries` and `journal_lines` in the route.
- Carry Phase 1 revenue stream classification into AR invoice journal-line dimension tags.
- Preserve production-line revenue account mapping for P1, P2, and future lines.

## Covered Revenue Streams

| Stream | Phase 2 treatment |
| --- | --- |
| `P1_PO_NET30` | AR invoice posting records receivable and revenue with Net 30 classification tags. |
| `P2_NET30` | AR invoice posting records receivable and revenue with P2 traceability tags. |
| `P1_REGULAR_PREPAID` | Still handled by P1 payment/deposit and shipment revenue services, not AR invoice posting. |

## Non-Goals

- No inventory valuation posting changes.
- No vendor bill or GRNI matching changes.
- No fixed asset or equipment loan tables yet.
- No invoice UI redesign.

## Next Phase

Phase 3 should move P1 prepaid shipment revenue through the shared posting service, then begin AP/GRNI matching once the inventory thread has settled.
