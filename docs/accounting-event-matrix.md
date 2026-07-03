# Accounting Event Matrix

This matrix is the first control layer for GAAP-ready financial statements. It answers one question before we build statements or registers:

> Does every accounting-relevant EPOCH transaction create a complete, traceable, balanced journal entry?

The live API version is exposed at `GET /api/accounting/event-matrix` for users with `finance.view`.

## Build Order

1. Close critical GL capture gaps.
2. Build account registers and trial balance from `journal_entries` and `journal_lines`.
3. Build Income Statement, Balance Sheet, and Statement of Cash Flows from the validated ledger.

## Critical Gaps To Close First

| Priority | Event | GAAP risk | First action |
| --- | --- | --- | --- |
| 1 | Revenue stream split | Prepaid P1 regular orders, P1 PO Net 30 orders, and P2 Net 30 orders have different timing and liability/AR treatment. | Keep P1 regular payments in `Customer Deposits` until shipment; route P1 PO and P2 invoices through AR. |
| 2 | Vendor bill recorded | AP, expenses, and inventory are incomplete. | Vendor bill/AP posting now captures generic bill lines, customer/project context, and optional vendor PO matching; expand next into full PO/receipt/vendor-invoice three-way matching. |
| 3 | Inventory received | Inventory can exist operationally without financial value. | Receipt accrual now posts `Dr Inventory - Raw Materials / Cr GRNI - Received Not Invoiced`; next step is vendor invoice matching to clear GRNI to AP. |
| 4 | Inventory issued to production | WIP/COGS cannot be trusted without material cost movement. | Add item valuation and debit WIP or direct materials on issue/consumption. |
| 5 | Fixed assets and equipment loans | Capital equipment, depreciation, and related loan liabilities cannot be reported. | Add fixed asset and asset-loan subledgers that post acquisition, loan setup, loan payments, and depreciation. |
| 6 | Opening balance migration | Statement opening balances cannot tie out. | Add controlled QBO opening balance import with batch id and tie-out evidence. |

## Current Implemented Posting Coverage

| Event | Journal entry | Source |
| --- | --- | --- |
| Customer invoice posted | `AR_INVOICE` / `ar_invoice` | `server/src/routes/arInvoices.ts` |
| Customer invoice voided | `AR_INVOICE_REVERSAL` / `ar_invoice` | `server/src/routes/arInvoices.ts` |
| Modern AR payment received | `AR_PAYMENT` / `ar_payment` | `server/src/services/arPaymentPostingService.ts`; DR `Customer Payment Clearing`, CR `Accounts Receivable` |
| P1 regular prepaid customer payment received | `P1_CUSTOMER_PAYMENT` / `p1_payment` | `server/src/services/p1PaymentPostingService.ts`; DR `Customer Payment Clearing`, CR `Customer Deposits`; use for regular prepaid P1 orders, not PO/customer-account Net 30 invoices |
| Labor cost posted | `LABOR_COST` / `labor_posting_run` | `server/src/services/laborPostingService.ts` |
| Inventory received from vendor PO | `INVENTORY_RECEIPT_ACCRUAL` / `vendor_po_receipt` | `server/src/services/vendorPOReceiptAccountingService.ts`; DR `Inventory - Raw Materials`, CR `GRNI - Received Not Invoiced`; keyed by PO line and cumulative receipt quantity |
| Vendor bill approved/posted | `AP_VENDOR_BILL` / `ap_vendor_bill` | `server/src/routes/apBills.ts`; generic AP workflow with typed bill lines, P1/P2/general customer context, optional vendor PO match, project/customer PO/lot/AR invoice allocation evidence, and attached source documents |
| P2 Net 30 invoice posted | `AR_INVOICE` / `ar_invoice` | `server/src/routes/arInvoices.ts`; DR `Accounts Receivable`, CR revenue/tax accounts with project, PO, lot, and packing slip traceability |

## Known Partial Coverage

| Event | Issue |
| --- | --- |
| P1 regular prepaid shipment revenue | `server/src/services/p1ShipmentRevenueService.ts` can create draft revenue entries that apply deposits at shipment, but the path needs explicit regular-vs-PO classification before formal posting. |
| P1 PO Net 30 invoice | AR invoice infrastructure exists, but the source workflow needs an explicit P1 PO discriminator so prepaid regular orders do not accidentally post as AR. |
| Credit memo issued | Posting exists, but account lookup needs to match the seeded COA and credit reasons need classification to contra revenue vs revenue reversal. |

## Next Implementation Recommendation

Start with the shared posting backbone and revenue-stream classification. Then expand vendor bills/AP from PO-context capture into full three-way matching against vendor PO receipts and GRNI. Add fixed asset and equipment-loan subledgers before trying to produce balance sheet and cash-flow reports from EPOCH.
