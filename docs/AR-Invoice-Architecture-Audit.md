# EPOCH v8 — Accounts Receivable & Invoice System Architecture Audit

**Date:** March 9, 2026  
**Type:** Read-Only Forensic Audit  
**Scope:** Full codebase analysis for AR/Invoice module integration

---

## 1. Current Architecture Summary

EPOCH v8 is a full-stack TypeScript monorepo (React + Express + PostgreSQL/Drizzle ORM) serving as a Manufacturing ERP. The system has two distinct customer/order tracks:

- **P1 (Standard):** Consumer-facing sales orders, RTS (Ready to Ship) inventory, simple production workflows
- **P2 (Strategic/AS9100):** Complex manufacturing projects with serialized items, RFQ risk assessments, department-stage tracking, and AS9100 compliance

The system already has extensive financial infrastructure (payments, credit memos, refunds, accounting shadow layer), a robust document management system, digital signature workflows, shipment tracking with UPS integration, and a modular dashboard framework.

---

## 2. Existing Systems That Can Be Reused

### 2.1 Customer System ✅ REUSE
**P2 Customers** — stored in `p2_customers` table with:
- `customerId` (unique text ID), `customerName`, `contactEmail`, `contactPhone`
- `billingAddress`, `billingCity`, `billingState`, `billingZip`
- `paymentTerms` (default: `NET_30`)
- `status` (ACTIVE, INACTIVE, SUSPENDED)

**P2 Customer Contacts** — `p2_customer_contacts` table with name, email, phone, isPrimary

**API:** `GET /api/p2-customers-bypass` — fetches all P2 customers  
**UI:** `P2CustomerManager.tsx`, `CustomerSearchInput.tsx` (shared search component)

> **Verdict:** The P2 customer system has billing fields and payment terms. Invoices can link directly to `p2_customers.id` or `p2_customers.customer_id`.

### 2.2 P2 Order / PO System ✅ REUSE
**Tables:**
- `p2_purchase_orders` — `id`, `po_number` (unique), `customer_id`, `customer_name`, `po_date`, `status` (OPEN/CLOSED/CANCELED), `locked_at`
- `p2_purchase_order_items` — `id`, `po_id`, `part_number`, `part_name`, `quantity`, `unit_price`, `total_price`, `specifications`

**API:** `GET/POST /api/p2-purchase-orders-bypass`  
**ID Generation:** `p2_order_id_sequences` table with `generateNextP2OrderIds()`

> **Verdict:** Invoices can be linked to `p2_purchase_orders.id` and reference `po_number`. Line items can pull from `p2_purchase_order_items`.

### 2.3 Shipment System ✅ REUSE
**Tables:**
- `shipment_records` — `master_tracking_number`, `carrier`, `service_level`, `total_weight_lbs`, ship-from/ship-to address snapshots
- `shipment_items` — links shipments to `order_id` and `po_item_id`
- `shipment_accounting_snapshots` — immutable financial data captured at shipment time

**API:** `server/src/routes/shipping.ts` — mark shipped, update tracking, delivery confirmation  
**UI:** `ShippingQueuePage.tsx`, `PackingSlip.tsx`, `ShippingManagement.tsx`  
**Features:** UPS integration, automated email/SMS notifications, packing slip PDF generation

> **Verdict:** Invoices can link to `shipment_records.id`. Shipment documents and packing slips are reusable for invoice attachments. Phase 2 invoice generation from completed shipments is well-supported.

### 2.4 Document / Attachment System ✅ REUSE
**Tables:**
- `documents` — central registry with `title`, `fileName`, `filePath`, `fileSize`, `documentType` (supports types like 'RFQ', 'QUOTE', 'PO', **'INVOICE'**)
- `order_attachments` — links files to orders
- `document_collection_relations` — many-to-many grouping system
- `document_tag_relations` — flexible tagging

**Storage:** Hybrid — Replit Object Storage (primary, cloud) + local filesystem (legacy)  
**Upload Pipeline:** Presigned URL pattern (request URL → direct upload to GCS → complete upload → save metadata)  
**Upload Components:** `ObjectUploader.tsx` (Uppy-based drag-and-drop), `OrderAttachments.tsx`

> **Verdict:** The `documents` table already has an 'INVOICE' type. The presigned URL upload pipeline and `ObjectUploader.tsx` are directly reusable. A new `invoice_attachments` linking table or reuse of the existing `document_collection_relations` system is feasible.

### 2.5 Digital Signature System ✅ REUSE
**Tables:**
- `signature_requests` — workflow metadata with `document_type`, `original_document_path`, `current_document_path`, `status`
- `signature_signers` — sequential signer management with `sign_order`, `signature_data` (Base64)
- `signature_activity_log` — full audit trail

**Components:** `SignatureSigningInterface.tsx` (react-signature-canvas modal), `PDFSignatureCapture.tsx`, `SignatureWorkflow.tsx`, `PendingSignatureTasks.tsx`  
**Backend:** `server/src/routes/signatureWorkflow.ts` — uses `pdf-lib` to embed signatures into PDFs  
**Security:** Public signature links with token-based access for external signers

> **Verdict:** Phase 2 invoice signing can reuse the entire signature workflow — create a `signature_request` linked to the invoice document, use `SignatureSigningInterface.tsx` for capture, and `pdf-lib` for embedding.

### 2.6 Inventory / Product System ✅ REUSE
**Tables:**
- `inventory_items` — `ag_part_number`, `sku`, `supplier_part_number`, `name`, `description`, `cost_per`, `latest_cost`, `cogs_per_unit`
- `stock_models` — `id`, `name`, `display_name`, `price`, `description`
- `rts_inventory` — finished goods with `stock_model`, `price`

**Description Auto-Population:** Sales order descriptions are built from model + features. `miscItems` support for ad-hoc line items.

> **Verdict:** Invoice line descriptions can auto-populate from `inventory_items.name`/`description` and `stock_models.display_name`. Pricing can pull from `inventory_items.cost_per` or `stock_models.price`.

### 2.7 Payment / Finance System ✅ REUSE
**Tables:**
- `payments` — multi-payment per order (credit_card, check, cash, ach, wire)
- `credit_card_transactions` — Authorize.Net / Accept.Blue logs
- `refund_requests` — full refund lifecycle
- `credit_memos` & `credit_memo_applications` — customer credit system
- `chart_of_accounts`, `journal_entries`, `journal_lines` — double-entry accounting shadow layer
- `invoice_numbers` — per-customer/year sequential invoice numbering

**API:** `/api/payments`, `/api/refund-requests`, `/api/credit-memos`, `/api/finance/*`  
**UI:** `AccountingPage.tsx`, `RefundQueue.tsx`, `PaymentManagement.tsx`, `BulkPaymentPage.tsx`, `PaymentAnalytics.tsx`

> **Verdict:** The `invoice_numbers` table already exists for sequential numbering. Credit memos can be applied to invoices. Journal entries can record AR transactions. The payment recording pattern is well-established and reusable.

### 2.8 Dashboard System ✅ REUSE
**Architecture:** Registry-based widget system
- **Widget Registry:** `client/src/lib/widgetRegistry.ts` — `registerWidget()` pattern
- **Widget Renderer:** `WidgetRenderer.tsx` — factory lookup and render
- **Dashboard Grid:** `DashboardGrid.tsx` — responsive CSS grid sections
- **Layout Config:** `dashboardLayouts.ts` — JSON section/widget definitions
- **Metrics:** `useMetric(slug)` hook + `/api/metrics/:slug` backend

> **Verdict:** AR dashboard widgets (outstanding balance, aging summary, overdue count) can plug directly into the existing registry with new metric slugs.

### 2.9 Reusable UI Components ✅ REUSE
| Component | Location | Use Case |
|-----------|----------|----------|
| `Table` (ShadCN) | `ui/table.tsx` | Invoice list, line items |
| `Form` (react-hook-form + zod) | `ui/form.tsx` | Invoice creation form |
| `Dialog` / `AlertDialog` | `ui/dialog.tsx` | Modals for payment recording |
| `Select` / `DropdownMenu` | `ui/select.tsx` | Customer/PO selectors |
| `ObjectUploader` (Uppy) | `ObjectUploader.tsx` | PDF attachment upload |
| `CustomerSearchInput` | `CustomerSearchInput.tsx` | Customer selection |
| `PdfViewer` | `PdfViewer.tsx` | Invoice PDF preview |
| `SignatureSigningInterface` | `SignatureSigningInterface.tsx` | Document signing |
| `EnhancedFormRenderer` | `EnhancedFormRenderer.tsx` | Dynamic form generation |
| `AuditDrawer` | `AuditDrawer.tsx` | Audit trail side panel |
| `Drawer` | `ui/drawer.tsx` | Side panel overlays |

---

## 3. Missing Systems That Must Be Created

### 3.1 Invoice Tables (NEW)
The following tables do not exist and must be created:

```
invoices
├── id (uuid, PK)
├── invoice_number (text, unique) — use existing invoice_numbers table for sequencing
├── customer_id (text, FK → p2_customers.customer_id)
├── po_id (uuid, FK → p2_purchase_orders.id, nullable)
├── po_number_override (text, nullable) — manual PO override
├── shipment_id (uuid, FK → shipment_records.id, nullable)
├── invoice_date (date)
├── due_date (date)
├── subtotal (numeric)
├── tax_amount (numeric, default 0)
├── total_amount (numeric)
├── amount_paid (numeric, default 0)
├── balance_due (numeric, generated or computed)
├── status (enum: draft, sent, partially_paid, paid, overdue, void, cancelled)
├── notes (text, nullable)
├── terms (text, nullable) — e.g. NET_30, populated from p2_customers.paymentTerms
├── source (enum: manual, quickbooks_import, shipment_generated)
├── quickbooks_ref (text, nullable) — for historical imports
├── created_at (timestamp)
├── updated_at (timestamp)
├── created_by (integer, FK → employees.id)

invoice_lines
├── id (uuid, PK)
├── invoice_id (uuid, FK → invoices.id)
├── description (text)
├── quantity (numeric)
├── unit_price (numeric)
├── total_price (numeric) — qty × rate
├── part_number (text, nullable) — optional link to inventory
├── po_item_id (uuid, FK → p2_purchase_order_items.id, nullable)
├── sort_order (integer)

invoice_payments
├── id (uuid, PK)
├── invoice_id (uuid, FK → invoices.id)
├── payment_date (date)
├── amount (numeric)
├── payment_method (enum: check, ach, wire, credit_card, cash, credit_memo)
├── reference_number (text, nullable) — check #, transaction ID, etc.
├── credit_memo_id (uuid, FK → credit_memos.id, nullable)
├── notes (text, nullable)
├── recorded_by (integer, FK → employees.id)
├── created_at (timestamp)

invoice_attachments
├── id (uuid, PK)
├── invoice_id (uuid, FK → invoices.id)
├── document_id (uuid, FK → documents.id, nullable)
├── file_path (text)
├── file_name (text)
├── file_type (text)
├── uploaded_at (timestamp)
├── uploaded_by (integer)
```

### 3.2 Invoice API Routes (NEW)
```
POST   /api/invoices                    — Create invoice (manual or import)
GET    /api/invoices                    — List invoices (with filters: customer, status, date range)
GET    /api/invoices/:id                — Get invoice detail with lines, payments, attachments
PATCH  /api/invoices/:id                — Update invoice (draft only)
DELETE /api/invoices/:id                — Void/cancel invoice
POST   /api/invoices/:id/lines          — Add line item
PATCH  /api/invoices/:id/lines/:lineId  — Update line item
DELETE /api/invoices/:id/lines/:lineId  — Remove line item
POST   /api/invoices/:id/payments       — Record payment against invoice
GET    /api/invoices/:id/payments       — List payments for invoice
POST   /api/invoices/:id/attachments    — Attach document
DELETE /api/invoices/:id/attachments/:attachmentId — Remove attachment
POST   /api/invoices/import             — Bulk import from QuickBooks CSV
GET    /api/invoices/next-number        — Get next invoice number for customer
POST   /api/invoices/from-shipment/:shipmentId — Generate invoice from shipment (Phase 2)
GET    /api/ar/summary                  — AR dashboard data (Phase 3)
GET    /api/ar/aging                    — Aging report (Phase 3)
POST   /api/ar/allocate-payment         — Allocate one payment across invoices (Phase 3)
```

### 3.3 Invoice UI Pages (NEW)
```
/invoices                — Invoice list page with search, filters, status badges
/invoices/new            — Create invoice form
/invoices/:id            — Invoice detail page (view/edit lines, record payments, attachments)
/invoices/import         — QuickBooks historical import page
/ar-dashboard            — AR dashboard with aging, outstanding balances (Phase 3)
```

---

## 4. Conflicts and Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Dual customer systems** — P1 uses `customers` table, P2 uses `p2_customers`. AR module must initially bind to P2 only. | Medium | Scope Phase 1 strictly to P2. Add a `customer_type` discriminator when P1 is added later. |
| **Invoice number collision** — `invoice_numbers` table already exists and is used by packing slip generation | High | Audit current usage of `invoice_numbers`. Either reuse it with a new `context` column or create a separate `ar_invoice_sequences` table. |
| **Double-entry consistency** — The accounting shadow layer (journal_entries) must stay in sync with AR transactions | Medium | Create a service function `recordARJournalEntry()` that auto-generates debit (AR) / credit (Revenue) entries when an invoice is created, and reverse when paid. |
| **Credit memo integration** — `credit_memo_applications` currently links to orders, not invoices | Low | Extend `credit_memo_applications` with an optional `invoice_id` FK or create a parallel `invoice_credit_applications` table. |
| **File storage migration** — System is transitioning from local to cloud storage | Low | Use the cloud presigned URL pipeline exclusively for invoice attachments. |
| **Permission system** — Must add invoice routes to `userPermissions.ts` and `Navigation.tsx` | Low | Follow the existing pattern: add to both files simultaneously. |

---

## 5. Extra Analysis — Specific Answers

### Q1: Does a global document linking system already exist?
**Yes.** The `documents` table serves as a central registry with `documentType` already supporting 'INVOICE'. The `document_collection_relations` table provides many-to-many entity grouping. The `document_tag_relations` table adds flexible tagging. Invoices can create entries in `documents` and link them via a new `invoice_attachments` table or reuse `document_collection_relations`.

### Q2: Can shipment documents be reused by invoices?
**Yes.** `shipment_records` stores complete shipping data with address snapshots. `shipment_items` links to orders/PO items. `shipment_accounting_snapshots` captures financial data at shipment time. Packing slips are generated as PDFs. All of these can be referenced from invoices via `invoices.shipment_id` and attached via the document system.

### Q3: Is there already a digital signature capture component?
**Yes.** `SignatureSigningInterface.tsx` provides a full modal with `react-signature-canvas`. `PDFSignatureCapture.tsx` handles PDF-specific signing. `SignatureWorkflow.tsx` manages multi-signer sequential workflows. `signatureWorkflow.ts` backend uses `pdf-lib` to embed signatures into PDFs. Public signature links with token-based security exist for external signers.

### Q4: Can invoice descriptions pull from inventory items?
**Yes.** `inventory_items` has `name`, `description`, `ag_part_number`, and pricing fields (`cost_per`, `latest_cost`). `stock_models` has `display_name`, `description`, and `price`. `p2_purchase_order_items` has `part_name`, `part_number`, `unit_price`. The `miscItems` pattern also supports ad-hoc line item descriptions.

### Q5: Is there an existing dashboard system suitable for AR metrics?
**Yes.** The widget registry pattern (`registerWidget()` + `WidgetRenderer` + `DashboardGrid`) supports plugging in new widgets. The metrics system (`useMetric(slug)` + `/api/metrics/:slug`) can be extended with AR-specific slugs (e.g., `ar_total_outstanding`, `ar_overdue_count`, `ar_aging_30_60_90`). The analytics infrastructure (`PaymentAnalytics.tsx`, `COGSReportPage.tsx`) provides patterns for complex financial reporting pages.

---

## 6. Implementation Order (Step-by-Step Roadmap)

### Phase 1A — Foundation (Week 1-2)
1. **Define schema** — Add `invoices`, `invoice_lines`, `invoice_payments`, `invoice_attachments` tables to `server/schema.ts`
2. **Run migration** — Generate and apply Drizzle migration
3. **Create storage interface** — Add CRUD methods to storage layer
4. **Build API routes** — `server/src/routes/invoices.ts` with create, read, update, list, line management, payment recording
5. **Invoice number service** — Integrate with existing `invoice_numbers` table or create new sequencing

### Phase 1B — Core UI (Week 2-3)
6. **Invoice list page** — `/invoices` with table, search, status filters, customer filter
7. **Create invoice form** — `/invoices/new` with customer selector (reuse `CustomerSearchInput`), PO linking, line item editor
8. **Invoice detail page** — `/invoices/:id` with line items, payment history, attachment management
9. **Attach PDFs** — Reuse `ObjectUploader.tsx` for invoice PDF uploads
10. **Auto-calculate totals** — Real-time subtotal/total computation on line item changes

### Phase 1C — Historical Import (Week 3-4)
11. **QuickBooks import** — CSV upload page at `/invoices/import` with field mapping, validation, and bulk insert
12. **Payment status tracking** — Status transitions (draft → sent → partially_paid → paid) with audit logging
13. **Navigation & permissions** — Add to `Navigation.tsx` and `userPermissions.ts`

### Phase 2 — Shipment Integration (Week 5-6)
14. **Generate from shipment** — `POST /api/invoices/from-shipment/:shipmentId` pulling items from `shipment_items` + `p2_purchase_order_items`
15. **Auto-populate descriptions** — Pull from `inventory_items.name` and `p2_purchase_order_items.part_name`
16. **Attach shipping documents** — Auto-link packing slips and shipping labels
17. **Digital signatures** — Create `signature_request` for invoice documents, reuse `SignatureSigningInterface.tsx`

### Phase 3 — AR Dashboard & Payments (Week 7-8)
18. **AR dashboard** — Register new metric widgets (`ar_outstanding`, `ar_aging`, `ar_overdue`), create `/ar-dashboard` page
19. **Aging report** — 30/60/90/120+ day aging buckets with drill-down
20. **Payment allocation** — One payment applied across multiple invoices (new `payment_allocations` table)
21. **Customer portal** — Public invoice download links with token-based access (reuse `followup_orders` security pattern)
22. **Journal entry integration** — Auto-generate double-entry records via `recordARJournalEntry()` service

---

## 7. Key Files Reference

| Category | Files |
|----------|-------|
| **Schema** | `server/schema.ts` |
| **Storage** | `server/storage.ts` |
| **Route Registration** | `server/src/routes/index.ts` |
| **Customer Routes** | `server/src/routes/customers.ts` |
| **Shipping Routes** | `server/src/routes/shipping.ts` |
| **Payment Routes** | `server/src/routes/payments.ts` |
| **Document Routes** | `server/src/routes/documents.ts`, `server/src/routes/orderAttachments.ts` |
| **Signature Routes** | `server/src/routes/signatureWorkflow.ts` |
| **Accounting Service** | `server/src/services/accountingService.ts` |
| **Metrics Service** | `server/src/services/metricsService.ts` |
| **Widget Registry** | `client/src/lib/widgetRegistry.ts` |
| **Permissions** | `client/src/config/userPermissions.ts` |
| **Navigation** | `client/src/components/Navigation.tsx` |
| **Object Storage** | `server/replit_integrations/object_storage/objectStorage.ts` |
| **File Upload Util** | `server/utils/fileUpload.ts` |
| **Upload Component** | `client/src/components/ObjectUploader.tsx` |
| **Customer Search** | `client/src/components/CustomerSearchInput.tsx` |
| **PDF Viewer** | `client/src/components/PdfViewer.tsx` |
| **Signature UI** | `client/src/components/SignatureSigningInterface.tsx` |
