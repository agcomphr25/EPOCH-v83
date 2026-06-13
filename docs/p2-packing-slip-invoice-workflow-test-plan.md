# P2 Packing Slip and Invoice Workflow Test Plan

This workflow must keep one customer-facing invoice number across the P2 packing slip, packing slip PDF, AR invoice, invoice PDF preview, and invoice email attachment.

## Required Invariants

- Creating a P2 packing slip immediately reserves an invoice number from the P2 numbering configuration and sequence tables.
- The reserved number is stored in both `p2_packing_slips.packing_slip_number` and `p2_packing_slips.invoice_number`.
- The on-screen packing slip and `/api/p2/packing-slips/:id/pdf` show the same invoice number.
- Editing a packing slip invoice number before invoice creation updates both packing-slip number fields and advances the P2 sequence when the edited number is in P2 format.
- Editing packing-slip details clears the frozen packing-slip PDF snapshot so the next PDF preview regenerates from the edited record.
- Invoice detail review creates a `REVIEW` AR invoice from the saved packing-slip number. It must not allocate a second number.
- Once an AR invoice exists, changing the packing-slip invoice number is blocked; edits should happen on the invoice or through void/reissue controls.
- `/api/ar-invoices/:id/pdf` and `POST /api/ar-invoices/:id/send` both generate invoice PDF bytes from the same saved AR invoice state.

## Manual QA Script

1. Create or open a P2 shipment that has no AR invoice.
2. Create the packing slip.
3. Confirm the packing-slip screen shows an invoice number in the configured P2 format, for example `RW26-0226`.
4. Open the packing slip PDF and confirm the same number appears in the PDF.
5. Use `Edit Invoice Details` and confirm the invoice number shown there matches the packing slip.
6. Adjust invoice details, then create the review invoice.
7. Confirm the packing-slip page stays open and shows a linked invoice.
8. Click `Preview Invoice PDF` and confirm the invoice PDF number, line details, totals, and customer notes match the edited invoice.
9. Edit the invoice from the invoice detail page, then preview the PDF again.
10. Send the invoice and confirm the email subject/attachment filename uses the same invoice number as the previewed PDF.

## Regression Checks

- A legacy P2 packing slip with missing `invoice_number` should reserve and stamp a P2 number during invoice-detail review.
- A legacy slip with a stale non-P2 number should not generate a second visible invoice number after the AR invoice exists.
- Sending an invoice with pricing mismatch or ambiguity remains blocked.
- Existing P1 invoice numbering remains on the P1 allocator and is not routed through the P2 number service.
