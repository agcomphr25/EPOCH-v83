# Accounting Phase 0 Coordination

Phase 0 is intentionally additive. It creates the shared accounting posting boundary and updates the accounting event matrix without changing existing inventory, receiving, shipping, or invoice behavior.

## Scope

- Shared posting service: `server/src/services/accountingPostingService.ts`
- Accounting event matrix: `server/src/services/accountingEventMatrix.ts`
- Accounting matrix documentation: `docs/accounting-event-matrix.md`
- Focused tests for the posting boundary and event coverage

## Non-Goals

- No inventory quantity-flow changes
- No receiving workflow changes
- No AP/GRNI three-way-match implementation yet
- No fixed asset or loan tables yet
- No migration of existing posting routes to the new service in Phase 0

## Revenue Stream Boundaries

- P1 regular prepaid orders: payment first, shipment roughly 14-16 weeks later; record payment to `Customer Deposits`, then relieve deposit and recognize revenue at shipment.
- P1 PO orders: invoice at Net 30; record AR and revenue at invoice/shipment, then clear AR when payment is received.
- P2 orders: invoice at Net 30; record AR and revenue with P2 PO, packing slip, lot, project, and WAD traceability.

## Capital Equipment Boundaries

Future fixed asset work should add a subledger for equipment acquisition, useful life, depreciation method, in-service date, and asset location. Future loan work should add linked notes payable, amortization schedules, and loan-payment postings that split principal, interest, and fees.

## Thread Safety

Other threads can continue work on inventory screens, receiving controls, P1/P2 operational flows, and costing data capture. Coordination is needed before any branch changes:

- `journal_entries`
- `journal_lines`
- `chart_of_accounts`
- `accounting_periods`
- posting behavior in AR, AP, labor, inventory valuation, payments, refunds, or fixed assets
