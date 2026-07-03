# Accounting Phase 1 Revenue Classification

Phase 1 starts from current `origin/main` after the Phase 0 posting scaffold was merged.

## Scope

- Add one shared revenue stream classifier for customer revenue accounting.
- Keep P1 regular prepaid, P1 PO Net 30, and P2 Net 30 as explicit accounting streams.
- Tag P1 shipment revenue journal dimensions with the selected revenue stream, timing, payment terms, and classification reason.
- Guard P1 shipment revenue paths so a PO shipment cannot silently post as prepaid deposit revenue, and a prepaid shipment cannot silently post as PO/AR revenue.

## Revenue Streams

| Stream | Accounting timing | Current Phase 1 behavior |
| --- | --- | --- |
| `P1_REGULAR_PREPAID` | Payment creates `Customer Deposits`; shipment relieves deposits and recognizes revenue. | Used by P1 shipment accounting snapshots. |
| `P1_PO_NET30` | Shipment/invoice creates AR and revenue; cash arrives later under Net 30 terms. | Used by P1 shipment records backed by purchase-order items. |
| `P2_NET30` | Posted P2 AR invoice recognizes AR and revenue with P2 traceability. | Classified centrally for the next AR invoice posting refactor. |

## Non-Goals

- No inventory quantity or receiving workflow changes.
- No schema migration.
- No AR invoice posting rewrite yet.
- No fixed asset or equipment loan tables yet.

## Coordination

Other threads can continue inventory UI and operations work. Coordinate before changing:

- `server/src/services/revenueStreamClassifier.ts`
- `server/src/services/p1ShipmentRevenueService.ts`
- AR invoice posting in `server/src/routes/arInvoices.ts`
- `journal_entries`, `journal_lines`, or revenue account selection behavior
