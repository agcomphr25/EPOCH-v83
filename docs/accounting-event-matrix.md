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
| 1 | Vendor bill recorded | AP, expenses, and inventory are incomplete. | Add vendor bill/AP posting from PO, receipt, and vendor invoice match. |
| 2 | Inventory received | Inventory can exist operationally without financial value. | Decide whether receipt accrual posts immediately or waits for vendor bill match. |
| 3 | Inventory issued to production | WIP/COGS cannot be trusted without material cost movement. | Add item valuation and debit WIP or direct materials on issue/consumption. |
| 4 | Opening balance migration | Statement opening balances cannot tie out. | Add controlled QBO opening balance import with batch id and tie-out evidence. |

## Current Implemented Posting Coverage

| Event | Journal entry | Source |
| --- | --- | --- |
| Customer invoice posted | `AR_INVOICE` / `ar_invoice` | `server/src/routes/arInvoices.ts` |
| Customer invoice voided | `AR_INVOICE_REVERSAL` / `ar_invoice` | `server/src/routes/arInvoices.ts` |
| Modern AR payment received | `AR_PAYMENT` / `ar_payment` | `server/src/services/arPaymentPostingService.ts`; DR `Customer Payment Clearing`, CR `Accounts Receivable` |
| P1 customer payment received | `P1_CUSTOMER_PAYMENT` / `p1_payment` | `server/src/services/p1PaymentPostingService.ts`; DR `Customer Payment Clearing`, CR `Customer Deposits`; tagged with P1 production line and customer type |
| Labor cost posted | `LABOR_COST` / `labor_posting_run` | `server/src/services/laborPostingService.ts` |

## Known Partial Coverage

| Event | Issue |
| --- | --- |
| Credit memo issued | Posting exists, but account lookup needs to match the seeded COA and credit reasons need classification to contra revenue vs revenue reversal. |

## Next Implementation Recommendation

Next, define P1 deposit application or move to vendor bills/AP. Deposit application would clear `Customer Deposits` when the order is fulfilled/invoiced. Vendor bills/AP would make Balance Sheet liabilities and inventory/expense recognition useful.
