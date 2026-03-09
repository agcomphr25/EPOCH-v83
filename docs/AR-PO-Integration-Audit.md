# EPOCH v8 — AR + PO Integration Audit Report

**Date:** March 9, 2026  
**Type:** Read-Only Architectural Audit  
**Scope:** Invoice payment allocation, AR aging, PO selector, document uploads, payment terms

---

## PHASE 1 — Customer Purchase Orders

### Tables Storing Customer POs

| Table | Type | PK | Customer ID Field | PO Number Field | Status |
|-------|------|----|--------------------|-----------------|--------|
| `p2_purchase_orders` | P2 Customer PO | `id` (serial) | `customer_id` (text, refs `p2_customers.customerId`) | `po_number` (text, unique) | OPEN / CLOSED / CANCELED |
| `purchase_orders` | P1 Customer PO | `id` (serial) | `customer_id` (text) | `po_number` (text) | OPEN / CLOSED / CANCELED |
| `all_orders` | Production Order | `order_id` (text) | `customer_id` (text) | `customer_po` (text) | various |
| `vendor_pos` | Vendor PO (NOT customer) | `id` (serial) | `vendor_id` | `po_number` | Draft/Sent/Received |

**For the invoice PO dropdown (P2 scope):** Use `p2_purchase_orders` filtered by `customer_id`.

**Fields needed for the dropdown:**
- `p2_purchase_orders.id` — value
- `p2_purchase_orders.po_number` — display label
- `p2_purchase_orders.status` — optional filter (show OPEN only, or all)
- `p2_purchase_orders.customer_id` — filter by selected customer

**P2 PO Line Items:** `p2_purchase_order_items`
- `id`, `po_id` (FK → `p2_purchase_orders.id`), `part_number`, `part_name`, `quantity`, `unit_price`, `total_price`

---

## PHASE 2 — PO to Shipment Chain

### Relationship Path

```
P2 Customers (p2_customers)
  └─→ P2 Purchase Orders (p2_purchase_orders) [customer_id]
       └─→ P2 PO Items (p2_purchase_order_items) [po_id]
            └─→ P2 Serialized Items (p2_serialized_items) [po_id, po_item_id]
                 └─→ Shipment Items (shipment_items) [po_item_id]
                      └─→ Shipment Records (shipment_records) [shipment_id]
```

**For P1 orders:**
```
Customers (customers)
  └─→ Purchase Orders (purchase_orders) [customer_id]
       └─→ PO Items (purchase_order_items) [po_id]
            └─→ Production Orders (all_orders) [source_po_id, source_po_item_id]
                 └─→ Shipment Items (shipment_items) [order_id]
                      └─→ Shipment Records (shipment_records) [shipment_id]
```

**Key linkage fields in `shipment_items`:**
- `order_id` → `all_orders.order_id`
- `po_item_id` → `purchase_order_items.id`
- `shipment_id` → `shipment_records.id`

**`shipment_records` also stores:** `po_numbers` (denormalized text for display)

---

## PHASE 3 — Payment System

### Existing Payment Tables

#### `payments`
| Column | Type | Description |
|--------|------|-------------|
| `id` | serial (PK) | |
| `order_id` | text | FK → `all_orders.order_id` |
| `payment_type` | text | `credit_card`, `check`, `cash`, `credit_memo`, `wire`, `ach` |
| `payment_amount` | real | |
| `payment_date` | timestamp | |
| `processing_fee` | real | For wire/bank fees |

**Currently links to:** `all_orders` (via `order_id`). Does NOT link to invoices.

#### `credit_card_transactions`
| Column | Type | Description |
|--------|------|-------------|
| `payment_id` | integer | FK → `payments.id` |
| `order_id` | text | |
| `transaction_id` | text | Gateway reference (Authorize.Net / Accept.Blue) |
| `amount` | real | |
| `status` | text | pending / completed / failed / voided |
| `last_four_digits` | text | |
| `auth_code` | text | |

#### `credit_memos`
| Column | Type | Description |
|--------|------|-------------|
| `id` | serial (PK) | |
| `memo_number` | text | e.g. `CM-2025-00001` |
| `customer_id` | text | FK → `customers.id` |
| `amount` | real | Total credit value |
| `applied_amount` | real | Already used |
| `unapplied_amount` | real | Remaining balance |
| `source_type` | text | `manual`, `overpayment`, `return` |

#### `credit_memo_applications`
| Column | Type | Description |
|--------|------|-------------|
| `credit_memo_id` | integer | FK → `credit_memos.id` |
| `order_id` | text | FK → `all_orders.order_id` |
| `amount_applied` | real | |

#### Accounting Shadow Layer
- `journal_entries` — transaction headers (`WIRE_PAYMENT`, etc.)
- `journal_lines` — double-entry debit/credit lines
- `chart_of_accounts` — account definitions

### Current Payment Allocation Logic
1. **Direct:** Most payments are 1:1 with an `order_id`
2. **Batch:** `/api/payments/batch` distributes one payment across multiple orders
3. **Credit Memo:** Creates link in `credit_memo_applications` + a `payments` record with type `credit_memo`

### Recommended: `ar_invoice_payments` Table
```
ar_invoice_payments
├── id (uuid, PK)
├── invoice_id (uuid, FK → ar_invoices.id)
├── payment_date (date)
├── amount (numeric)
├── payment_method (text: check, ach, wire, credit_card, cash, credit_memo)
├── reference_number (text, nullable) — check #, transaction ID
├── credit_memo_id (integer, FK → credit_memos.id, nullable)
├── notes (text, nullable)
├── recorded_by (text)
├── created_at (timestamp)
```

**Payment allocation flow:**
1. Record payment in `ar_invoice_payments` linked to one or more `invoice_id`s
2. Update `ar_invoices.status` based on sum of payments vs `total_amount`
3. Optionally create `journal_entries` for AR debit/credit

---

## PHASE 4 — Document Storage System

### Storage Provider
**Replit Object Storage** (backed by Google Cloud Storage) — primary  
**Local filesystem** (`/uploads/`) — legacy fallback

### Upload Flow (Presigned URL Pattern)
1. Client calls `POST /api/media/request-upload-url` with file metadata
2. Server returns `uploadURL` (presigned PUT) + `objectPath`
3. Client PUTs file directly to GCS
4. Client calls `POST /api/media/complete-upload` to save DB record

### Entity Attachment System
**Modern approach:** `media_library` + `media_attachments` (polymorphic linking)

| Column | Type | Description |
|--------|------|-------------|
| `media_id` | ref | FK → `media_library.id` |
| `entity_type` | text | e.g. `'order'`, `'customer'`, **`'invoice'`** |
| `entity_id` | text | The entity's ID |

**Can invoices use `entity_type='invoice'`?** **YES.** The `media_attachments` table explicitly supports `'invoice'` as a valid entity type (confirmed in schema line 10003). The `media_library` table also supports `category: 'invoice'`.

### Upload UI Components
- **`ObjectUploader`** (`client/src/components/ObjectUploader.tsx`) — Uppy-based drag-and-drop
- **`useUpload` hook** (`client/src/hooks/use-upload.ts`) — `getUploadParameters()` and `uploadFile()`

### Recommended Invoice Upload Pattern
```tsx
const { getUploadParameters } = useUpload();

<ObjectUploader
  onGetUploadParameters={getUploadParameters}
  onComplete={async (result) => {
    // Save via: POST /api/media/attachments
    // body: { mediaId, entityType: 'invoice', entityId: invoice.id }
  }}
>
  Attach PDF
</ObjectUploader>
```

### Relevant Endpoints
| Endpoint | Purpose |
|----------|---------|
| `POST /api/media/request-upload-url` | Get presigned upload URL |
| `POST /api/media/complete-upload` | Finalize upload, create media_library record |
| `POST /api/media/attachments` | Link media to entity |
| `GET /api/media/attachments/:entityType/:entityId` | Fetch attachments for entity |

---

## PHASE 5 — Payment Terms

### Where Terms Are Stored

| Table | Field | Default | Notes |
|-------|-------|---------|-------|
| `p2_customers` | `payment_terms` | `NET_30` | Primary source for P2 invoices |
| `vendors` | `payment_terms` | varies | For vendor POs only |
| `ar_invoices` | `terms` | none | Stores per-invoice terms |
| `customers` (P1) | — | none | No terms field exists |

### Existing Dropdown
**`P2CustomerManager.tsx`** has a Select dropdown with options:
- `NET_30`, `NET_15`, `NET_60`, `COD`, `PREPAID`

### Due Date Calculation
**No centralized utility exists.** Due dates are currently passed from the frontend.

**Recommended utility:**
```typescript
function calculateDueDate(invoiceDate: string, terms: string): string {
  const date = new Date(invoiceDate);
  const daysMap: Record<string, number> = {
    'NET_15': 15,
    'NET_30': 30,
    'NET_45': 45,
    'NET_60': 60,
    'COD': 0,
    'PREPAID': 0,
  };
  const days = daysMap[terms] || 30;
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}
```

---

## PHASE 6 — AR Calculation

### Available Data for AR
| Source | Field | Description |
|--------|-------|-------------|
| `ar_invoices` | `total_amount` | Invoice total |
| `ar_invoices` | `status` | OPEN / PAID / OVERDUE / VOID |
| `ar_invoices` | `due_date` | For aging calculation |
| `ar_invoice_payments` (proposed) | `amount` | Payment against invoice |

### AR Balance Calculation
```
Invoice Balance = total_amount - SUM(payments for this invoice)
Customer AR Balance = SUM(invoice balances where status != PAID and status != VOID)
```

### AR Aging Calculation
```sql
SELECT
  customer_id,
  SUM(CASE WHEN due_date >= CURRENT_DATE THEN balance END) AS current,
  SUM(CASE WHEN due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - 30 THEN balance END) AS "1_30",
  SUM(CASE WHEN due_date < CURRENT_DATE - 30 AND due_date >= CURRENT_DATE - 60 THEN balance END) AS "31_60",
  SUM(CASE WHEN due_date < CURRENT_DATE - 60 AND due_date >= CURRENT_DATE - 90 THEN balance END) AS "61_90",
  SUM(CASE WHEN due_date < CURRENT_DATE - 90 THEN balance END) AS "over_90"
FROM ar_invoices
WHERE status NOT IN ('PAID', 'VOID')
GROUP BY customer_id
```

Until `ar_invoice_payments` is built, `balance = total_amount` for OPEN invoices and `balance = 0` for PAID.

---

## PHASE 7 — Reusable UI Components

| Component | Location | Use Case |
|-----------|----------|----------|
| `Select` | `ui/select.tsx` | Customer, PO, Terms, Status dropdowns |
| `Input` (type="date") | `ui/input.tsx` | Invoice Date, Due Date pickers |
| `Table` | `ui/table.tsx` | Invoice lines table editor |
| `ObjectUploader` | `ObjectUploader.tsx` | PDF upload with Uppy |
| `useUpload` hook | `hooks/use-upload.ts` | Presigned URL flow |
| `CustomerSearchInput` | `CustomerSearchInput.tsx` | Customer search combo-box |
| `Textarea` | `ui/textarea.tsx` | Notes field |
| `Badge` | `ui/badge.tsx` | Status badges |
| `Card` | `ui/card.tsx` | Section containers |
| `Dialog` | `ui/dialog.tsx` | Confirmation modals |
| `Separator` | `ui/separator.tsx` | Visual dividers |
| `PdfViewer` | `PdfViewer.tsx` | Invoice PDF preview |
| `Skeleton` | `ui/skeleton.tsx` | Loading states |

---

## Recommended API Endpoints

### Customer PO Selector
```
GET /api/p2-purchase-orders-bypass?customerId={customerId}
```
Returns P2 POs filtered by customer. Already exists — needs customerId filter parameter if not present.

Alternatively, a dedicated endpoint:
```
GET /api/ar-invoices/customer-pos?customerId={customerId}
```
Queries `p2_purchase_orders WHERE customer_id = :customerId` and returns `[{ id, poNumber, status, poDate }]`.

### AR Aging
```
GET /api/ar-invoices/aging
```
Returns aging summary grouped by customer:
```json
[
  {
    "customerId": "STR",
    "customerName": "Strata-G",
    "current": 5000.00,
    "days1to30": 2500.00,
    "days31to60": 1200.00,
    "days61to90": 0,
    "over90": 800.00,
    "totalOutstanding": 9500.00
  }
]
```

### Invoice Payment Allocation
```
POST /api/ar-invoices/:id/payments
Body: { amount, paymentMethod, referenceNumber, paymentDate, notes }

GET /api/ar-invoices/:id/payments
Returns: [{ id, amount, paymentMethod, referenceNumber, paymentDate, recordedBy }]

POST /api/ar-invoices/allocate-payment
Body: { allocations: [{ invoiceId, amount }], paymentMethod, referenceNumber, paymentDate }
```

---

## Implementation Priority

1. **Terms dropdown + due date auto-calculation** — Quick win, use existing P2CustomerManager options
2. **Customer PO selector** — Filter `p2_purchase_orders` by customer, add to invoice form
3. **Document attachments** — Wire `ObjectUploader` + `media_attachments` with `entity_type='invoice'`
4. **Payment allocation** — New `ar_invoice_payments` table + endpoints
5. **AR aging dashboard** — Query engine + dashboard widgets via existing metrics system
