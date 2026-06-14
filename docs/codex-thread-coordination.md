# Codex Thread Coordination

Use this file when multiple Codex threads are making changes in different parts of EPOCH at the same time. It is meant to be visible to the user and to every thread working in this repo.

## Ground Rules

- Start each thread from a fresh `origin/main`.
- Use one branch per change area, preferably named `codex/<short-change-name>`.
- Keep each thread scoped to the files and app sections listed in the table below.
- Before pushing, run `git fetch origin`, rebase on `origin/main`, and verify the diff.
- If two threads need the same file, note it here before editing so the later thread can rebase or wait.
- After a branch lands on `main`, other active threads should rebase on the updated `origin/main`.

## Active Threads

| Status | Thread / Change Area | Branch | App Section | Files / Ownership | Notes |
| --- | --- | --- | --- | --- | --- |
| merged | Parts request visibility and Tandym PTO tasks | `main` | `/inventory/parts-request`, `/production-control-center` | `client/src/components/inventory/PartsRequestsCard.tsx`, `client/src/pages/ProductionControlCenter.tsx`, inventory routes and permissions | Pushed as `3b1a388ec` on `main`. |
| ready | P1 invoice recipient automation | `codex/p1-invoice-recipient-automation` | `/finance/invoices/:id` | `server/src/routes/arInvoices.ts` | Send Invoice now finds P1 PO invoice recipients through the linked PO/customer fallback. |
| editing | P2 packing slip and invoice PDF workflow | `codex/p2-packing-slip-invoice-workflow` | `/p2/packing-slip/:id`, AR invoice preview/send | `client/src/pages/P2PackingSlipViewer.tsx`, `client/src/components/p2/P2InvoicePreviewButton.tsx`, `server/src/routes/p2Shipping.ts`, `server/src/routes/arInvoices.ts`, `server/src/services/invoiceFromPackingSlip.ts`, PDF helpers/tests | Ensure the packing slip, invoice draft, preview PDF, and sent email PDF use the same reserved invoice number and review/edit loop. |
| ready | P2 invoice customer part carryover and edit persistence | `codex/p2-invoice-customer-part` | `/finance/invoices/:id`, `/finance/invoices/:id/edit`, `/p2/packing-slip/:id` | `server/src/services/invoiceFromPackingSlip.ts`, `client/src/pages/InvoiceFormPage.tsx`, `server/utils/pdf/arInvoicePdf.ts`, `server/src/routes/arInvoices.ts` | P2 invoice lines/PDF carry the same customer-facing part number/SKU shown on the packing slip; invoice edit keeps current customer/PO/line data visible; invoice sends CC accounting at glenn@agadvanced.com. Coordinate with the broader P2 packing slip invoice workflow branch before merging. |
| available | Next thread | `codex/<name>` | TBD | TBD | Add a row before editing. |

## Thread Startup Checklist

1. Pull the freshest code:

   ```powershell
   git fetch origin
   git checkout main
   git pull --ff-only
   ```

2. Create or switch to the thread branch:

   ```powershell
   git checkout -b codex/<short-change-name>
   ```

3. Add a row in the Active Threads table with the intended files or app section.

4. Check whether another active row owns the same files.

## Thread Finish Checklist

1. Rebase on the latest main:

   ```powershell
   git fetch origin
   git rebase origin/main
   ```

2. Verify the work:

   ```powershell
   git diff --check
   git status --short --branch
   ```

3. Update this file's row with the final status and any handoff notes.

4. Push the branch:

   ```powershell
   git push -u origin codex/<short-change-name>
   ```

## Status Values

- `researching`: reading code, no edits yet.
- `editing`: actively changing files.
- `blocked`: waiting on another branch, decision, or external dependency.
- `ready`: ready to merge or review.
- `merged`: landed on `main`.
- `available`: placeholder row for the next thread.
