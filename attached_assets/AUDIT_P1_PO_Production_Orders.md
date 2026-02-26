# READ-ONLY AUDIT: EPOCH (P1) PO ↔ Production Orders + Material Mismatch

---

## PART 0 — Entity Map

| Entity | Table / Model | Primary Key | Foreign Keys | Created / Updated By |
|---|---|---|---|---|
| **Customer PO Header** | `purchase_orders` | `id` (serial) | — | `server/src/routes/index.ts` PO CRUD endpoints |
| **Customer PO Line Item** | `purchase_order_items` | `id` (serial) | `po_id → purchase_orders.id` | Created with PO; `stock_model_id` soft-refs `stock_models.id` |
| **Production Order** | `production_orders` | `id` (serial) | `po_id → purchase_orders.id` (cascade), `po_item_id → purchase_order_items.id` (cascade) | `POST /api/pos/:id/generate-production-orders` (line 5970, `server/src/routes/index.ts`) or `storage.generateProductionOrdersFromPO()` (line 10200, `server/storage.ts`) |
| **Manufacturing Queue** | `manufacturing_queue` | `id` (serial) | `inventory_item_id → inventory_items.id`, `vendor_po_id` (soft), `p2_po_id` / `p2_po_item_id` (soft) | `server/src/utils/manufacturingQueueHelper.ts` (auto-populate from Vendor/P2 POs) |
| **P1 Packet Mfg Queue** | `p1_packet_manufacturing_queue` | `id` (uuid) | `packet_inventory_id → p1_packet_inventory.id`, `product_category_id → cutting_product_categories.id` | Cutting Table scheduling |
| **Stock Model** | `stock_models` | `id` (text, e.g. `cf_adj_alp_hunter`) | — | Admin / seed data |
| **Inventory Item** | `inventory_items` | `id` (integer) | — | Inventory management |
| **Features** | `features` | `id` (text) | `category → feature_categories.id` | Admin configurator |
| **Material Lots** | `material_lots` | `id` (uuid) | `inventory_item_id → inventory_items.id` | Material receiving, AS9100 traceability |

---

## PART 1 — Flow Trace: Production Order Creation from Customer PO

### Primary Endpoint
**`POST /api/pos/:id/generate-production-orders`**
- File: `server/src/routes/index.ts`, line **5970**
- Trigger: `client/src/components/POManager.tsx`, line 723

### Step-by-step Flow

1. **Duplicate check** (line 5980): Calls `storage.getProductionOrdersByPoId(poId)` — if any exist, returns 409.

2. **PO + Items fetched** (lines 5989–5995):
   - `storage.getPurchaseOrder(poId)` → `purchase_orders` row
   - `storage.getPurchaseOrderItems(poId)` → `purchase_order_items` rows

3. **Non-stock filtering** (lines 5999–6047): Items matching regex patterns (bottom metals, rails, screws, etc.) are excluded. Only items with a valid `stockModelId` (not empty, not `no_stock`) proceed.

4. **Per-unit loop** (lines 6057–6096): For each eligible PO line item, a loop runs `item.quantity` times creating individual production orders:
   ```
   orderId       = storage.generateNextOrderId()         // e.g. AG1234
   poId          = <PO id>                               // FK link ✓
   poItemId      = item.id                               // FK link ✓
   customerId    = purchaseOrder.customerId
   customerName  = purchaseOrder.customerName
   poNumber      = purchaseOrder.poNumber
   itemType      = 'stock_model'
   itemId        = item.stockModelId || item.itemId       // e.g. "fg_adj_alp_hunter"
   itemName      = item.stockModelName || item.itemName   // e.g. "Fg Adj Alp Hunter"
   specifications = { ...item.specifications, sourcePoNumber, customerName, expectedDelivery }
   currentDepartment = 'P1 Production Queue'
   productionStatus  = 'PENDING'
   ```

5. **DB write** (line 6095): `storage.createProductionOrder(productionOrderData)` → INSERT into `production_orders` (storage.ts line 10153+)

### Alternate Path (storage-layer)
`storage.generateProductionOrdersFromPO(poId)` at `server/storage.ts` line **10200** — same logic with additional production schedule calculation (distributed due dates across weeks, mold capacity checks).

### Key Finding: What data flows at creation time
- `itemId` = the `stock_model_id` from the PO line (e.g. `fg_adj_alp_hunter`)
- `itemName` = human-readable name (e.g. `Fg Adj Alp Hunter`)
- `specifications` = JSONB snapshot from PO line item's `specifications` column
- **No explicit `material` field is set** — material is never directly stored on the production order at creation time
- **No `features` column exists on `production_orders`** — only `specifications` (JSONB)

### Queue Population
The `manufacturing_queue` table is populated separately for P2/Vendor POs by `server/src/utils/manufacturingQueueHelper.ts` and is **not used for P1 production orders**. P1 production orders flow through `production_orders` directly and are queried into department views via raw SQL.

---

## PART 2 — DB Schema Audit

### `purchase_orders` (line 4113, `server/schema.ts`)
| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `po_number` | text | Customer PO number |
| `customer_id` | text | |
| `customer_name` | text | Denormalized |
| `item_type` | text | single/multiple |
| `po_date` | date | |
| `expected_delivery` | date | |
| `status` | text | OPEN/CLOSED/CANCELED |

### `purchase_order_items` (line 4128, `server/schema.ts`)
| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `po_id` | integer FK → `purchase_orders.id` | |
| `stock_model_id` | text | Soft reference to `stock_models.id` |
| `stock_model_name` | text | Display name snapshot |
| `quantity` | integer | |
| `features` | jsonb | Feature selections from configurator |
| `custom_options` | jsonb | |
| `specifications` | jsonb | Parsed specs (may contain `material`, `action_length`, etc.) |
| `item_name` | text | |
| `item_id` | text | |
| `order_count` | integer | Tracks how many prod orders created |

### `production_orders` (line 5113, `server/schema.ts`)
| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `order_id` | text | Generated ID (e.g. AG1234) |
| **`po_id`** | **integer FK → `purchase_orders.id`** | **CASCADE DELETE** |
| **`po_item_id`** | **integer FK → `purchase_order_items.id`** | **CASCADE DELETE** |
| `customer_id` | text | Snapshot |
| `customer_name` | text | Snapshot |
| `po_number` | text | Snapshot |
| `item_type` | text | Always `stock_model` for P1 |
| `item_id` | text | Stock model ID (e.g. `fg_adj_alp_hunter`) |
| `item_name` | text | Display name (e.g. `Fg Adj Alp Hunter`) |
| `specifications` | jsonb | Snapshot from PO item + enrichment |
| `production_status` | text | PENDING/ACTIVE/LAID_UP/SHIPPED |
| `current_department` | text | Department progression tracking |
| `department_history` | jsonb | Array of movements |

### `stock_models` (line 423, `server/schema.ts`)
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | e.g. `cf_adj_alp_hunter`, `fg_adj_alp_hunter` |
| `name` | text | |
| `display_name` | text | |
| `price` | real | |
| `handedness` | text | LH/RH/null |

### `manufacturing_queue` (line 8051, `server/schema.ts`)
| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `inventory_item_id` | integer FK → `inventory_items.id` | |
| `vendor_po_id` | integer | Soft ref (no FK constraint) |
| `p2_po_id` / `p2_po_item_id` | integer | Soft refs |
| `department` | text | CNC/Cutting Table/Cores |
| `material_details` | text | Free-text material info |

### Traceability Linkage Answer

**YES — a formal FK exists today:**
- `production_orders.po_id` → `purchase_orders.id` (line 5116–5117)
- `production_orders.po_item_id` → `purchase_order_items.id` (line 5119–5120)
- Both have `ON DELETE CASCADE`

**Additionally, soft links exist:**
- `production_orders.po_number` (text snapshot of the PO number)
- `production_orders.item_id` (text matching `stock_models.id`)

**API support for reverse lookup:**
- `GET /api/production-orders/by-po/:poId` (line 6138) — retrieves all production orders for a given PO

---

## PART 3 — UI Audit: Department Queue Card — Name + Material Sources

### Component: `BarcodeQueuePage.tsx`
- File: `client/src/pages/BarcodeQueuePage.tsx`
- Material badge rendered at lines **928–945**
- Name rendered at line **893** via `getDisplayOrderId(order)`

### Data flow (Production Orders → UI):

1. **API Query** (server/src/routes/index.ts, line 800):
   ```sql
   SELECT po.item_id as "stockModelId",
          COALESCE(po.specifications, '{}') as features
   FROM production_orders po
   WHERE po.current_department IN ('P1 Production Queue', 'Layup/Plugging')
   ```

2. **Server-side transformation** (line 877–893):
   ```js
   return {
     modelId: po.stockModelId,          // ← item_id from production_orders
     product: po.stockModelId            // ← string-replaced to title case
       .replace('_', ' ')
       .replace(/\b\w/g, l => l.toUpperCase()),
     features: inferFeaturesFromStockModel(po.stockModelId),
       // ↑ ONLY infers action_length, does NOT set material
   }
   ```

3. **Client-side derivation** (`client/src/utils/deriveOrderLabels.ts`, line 65):
   `deriveOrderLabels(order)` is called at BarcodeQueuePage line **860**.

   The `deriveMaterial()` function (line 65) checks, in order:
   1. `features.material` (from JSONB — usually empty for production orders)
   2. `features.material_type` (from JSONB — usually empty)
   3. `order.material` (not set on production order responses)
   4. `parsedSpecs.material` / `parsedSpecs.materialType` (from specifications JSONB)
   5. **`modelId` prefix** (line 90–98) — matches `cf_` → "Carbon Fiber", `fg_` → "Fiberglass", etc.
   6. `displayName` string matching (line 105–127) — looks for "cf", "carbon", "fg", "fiberglass" in the name
   7. Fallback: "Standard"

### The Mismatch Explained

For an item like `fg_adj_alp_hunter`:

| Field | Source | Value | UI Display |
|---|---|---|---|
| **Name** | `production_orders.item_name` → server transforms `item_id` to title case | "Fg Adj Alp Hunter" | Rendered via `getDisplayOrderId()` or `product` field |
| **Material badge** | `deriveOrderLabels()` → step 5: `modelId` prefix `fg_` | **"Fiberglass"** | Material badge |

**BUT** — if `features.material` or `specifications.material` was set (perhaps from a PO import or AI extraction) to "Carbon Fiber", that would **override** the prefix-based inference because it's checked first (steps 1–4).

### Root Cause Scenarios for "Material=Carbon Fiber" on a "Fg Adj Alp Hunter":

1. **Stale/incorrect `specifications` JSONB**: The PO line item's `specifications` column contains `{ "material": "Carbon Fiber" }` or `{ "material_type": "Carbon Fiber" }`, snapshotted into the production order at creation time. This overrides the `fg_` prefix inference.

2. **Feature mapping fallthrough** (`server/storage.ts` lines 3164–3165): During order import/sync, the system maps `parsedSpecs.material` → `mappedFeatures.material`. If AI extraction or manual entry tagged the material as "Carbon Fiber" despite the model being fiberglass, this gets persisted.

3. **Different source row**: The displayed name comes from `item_id`/`item_name` (stock model) while the material comes from `features` or `specifications` (customer-submitted or AI-extracted data). **They are NOT from the same source.**

---

## PART 4 — Material Source-of-Truth Table

| # | Source | Field(s) | When Set | Who Sets It | Used By Which UI(s) |
|---|---|---|---|---|---|
| 1 | **Stock Model ID prefix** | `stock_models.id` (e.g. `cf_`, `fg_`) | At catalog creation | Admin | `deriveOrderLabels()` → BarcodeQueue, LayupQueue (fallback, step 5) |
| 2 | **PO Line Item features** | `purchase_order_items.features → {material}` | At PO creation/configurator | Order entry UI / POManager | `deriveOrderLabels()` step 1–2 (highest priority) |
| 3 | **PO Line Item specifications** | `purchase_order_items.specifications → {material, material_type}` | At PO import/AI extraction | `storage.ts` feature mapping (line 3164) | `deriveOrderLabels()` step 4 |
| 4 | **Production Order specifications** | `production_orders.specifications` (JSONB snapshot) | At prod order creation | `generate-production-orders` endpoint (line 6082) | Fed to UI as `features` via layup query (line 808) |
| 5 | **Server-side inferred** | `inferFeaturesFromStockModel()` result | At API response time (not persisted) | `server/src/routes/index.ts` line 831 | Layup/Barcode queue — only sets `action_length`, NOT material |
| 6 | **Manufacturing Queue** | `manufacturing_queue.material_details` | At queue auto-population | `manufacturingQueueHelper.ts` | Manufacturing Queue UI (P2/Vendor only) |
| 7 | **Cutting Table** | `cutting_materials` / inline SQL case statement | At cutting scheduling | `server/src/routes/cuttingTable.ts` line 1728 | Cutting Table dashboard |

### Recommendation

**Authoritative source for material should be: Stock Model ID prefix (`stock_models.id`).**

Rationale:
- The `id` is the canonical product identifier (e.g., `cf_adj_alp_hunter` = Carbon Fiber, `fg_adj_alp_hunter` = Fiberglass). This is set once and is immutable.
- The `features` and `specifications` JSONB fields are unreliable because they come from multiple input paths (manual entry, AI extraction, PO imports) and can contain conflicting or stale data.

**Proposed hierarchy for `deriveMaterial()`:**
1. First: `modelId` prefix (`cf_` / `fg_` / `m1a_` / `apr_`) — this is the ground truth
2. Second: `features.material` or `features.material_type` — only if modelId has no prefix match (for non-standard products)
3. Third: `specifications.material` — lowest priority
4. Fallback: "Standard"

**Current code does it backwards** — `features.material` (step 1–2 in current code) overrides `modelId` prefix (step 5), which is the root cause of the mismatch.

**Snapshot vs. Compute:**
- **Snapshot at creation**: `production_orders.item_id` (stock model ID) — already done correctly
- **Compute live**: Material label should be derived from `item_id` prefix at display time (already the approach in `deriveOrderLabels()`, just needs priority reordering)
- **Do NOT snapshot material as free text** — it creates drift opportunities

---

## PART 5 — PO ↔ Production Order Linkage Proposal

### Current State (Already Implemented)

Good news: **The FK linkage already exists.**

```
production_orders.po_id      → purchase_orders.id        (FK, CASCADE)
production_orders.po_item_id → purchase_order_items.id    (FK, CASCADE)
```

These are set at creation time (line 6080–6081 in `server/src/routes/index.ts`).

Reverse lookup API exists: `GET /api/production-orders/by-po/:poId` (line 6138).

### What's Missing

1. **No UI click-through**: There is no visible "Source: PO #### / Line #" on the production order cards in the department queue views.

2. **No snapshot of key PO fields for audit**: When the PO is updated after production orders exist, the production order's `po_number`, `customer_name`, etc. are snapshots from creation time — but `specifications` can diverge from the current PO line item's `specifications`.

3. **No split/partial tracking**: `purchase_order_items.order_count` tracks quantity but there's no per-unit mapping (which specific production order corresponds to which PO line unit).

### Option A: Enhance Existing FK (Recommended for EPOCH)

**Schema changes (conceptual):**
- Add `production_orders.source_snapshot` (JSONB) — snapshot of key fields at creation for audit:
  ```json
  {
    "po_number": "PO-2026-001",
    "po_line_id": 42,
    "stock_model_id": "fg_adj_alp_hunter",
    "stock_model_name": "Fg Adj Alp Hunter",
    "features_at_creation": { ... },
    "material_derived": "Fiberglass",
    "created_at": "2026-02-26T..."
  }
  ```
- Add `production_orders.unit_index` (integer) — which unit number within the PO line (1 of 5, 2 of 5, etc.)

**Pros:**
- Minimal schema change (2 new columns on existing table)
- FKs already exist — just needs snapshot enrichment
- Handles splits naturally (each unit has its own row with `unit_index`)
- Audit trail: compare `source_snapshot` vs current PO line to detect drift

**Cons:**
- Snapshot duplication (acceptable for audit)
- CASCADE DELETE means deleting a PO deletes all production orders (may want to change to SET NULL for history preservation)

### Option B: Join Table `production_order_sources`

```
production_order_sources (
  id serial PK,
  production_order_id int FK → production_orders.id,
  source_type text,           -- 'customer_po_item', 'rts_inventory', 'manual'
  source_id int,              -- purchase_order_items.id
  quantity int,
  snapshot jsonb,
  created_at timestamp
)
```

**Pros:**
- Supports multiple source types (PO lines, RTS inventory, manual orders)
- Clean separation of concerns
- Extensible for future source types

**Cons:**
- Extra table + joins
- Over-engineered for current P1-only use case
- FKs already exist on `production_orders` — would be redundant

### Recommendation: **Option A** for EPOCH

The existing FK structure is solid. Enhance it with:
1. `source_snapshot` JSONB for audit immutability
2. `unit_index` for per-unit tracking within a PO line
3. Consider changing CASCADE DELETE to SET NULL (preserve production history if PO is deleted)
4. Add UI click-through: show "Source: PO {po_number} / Line {po_item_id}" on prod order cards

---

## PART 6 — Debug Checklist for Material Mismatch

When you encounter a production order card showing the wrong material:

### Step 1: Capture IDs from the UI
- [ ] `orderId` (e.g. AG1234) — shown on the card
- [ ] `modelId` / `stockModelId` — look in browser DevTools Network tab for the API response
- [ ] Note the displayed `materialType` badge text and the displayed `product` / `itemName`

### Step 2: Query the Production Order
```sql
SELECT id, order_id, po_id, po_item_id, item_id, item_name, specifications
FROM production_orders
WHERE order_id = '<orderId>';
```
- [ ] Check `item_id` — does its prefix (`cf_` / `fg_`) match the displayed material?
- [ ] Check `specifications` JSONB — does it contain `material`, `material_type`, or `materialType` keys? What values?

### Step 3: Query the Source PO Line Item
```sql
SELECT id, stock_model_id, stock_model_name, features, specifications
FROM purchase_order_items
WHERE id = <po_item_id from step 2>;
```
- [ ] Check `features` JSONB — look for `material` or `material_type` keys
- [ ] Check `specifications` JSONB — look for `material`, `material_type`, `materialType` keys
- [ ] Compare `stock_model_id` to the production order's `item_id` — do they match?

### Step 4: Trace the derivation
The material badge is derived by `client/src/utils/deriveOrderLabels.ts` function `deriveMaterial()` (line 65). It checks in this order:
1. `features.material` → if set, this wins (EVEN IF WRONG)
2. `features.material_type` → if set, this wins
3. `order.material` → if set, this wins
4. `parsedSpecs.material` / `parsedSpecs.materialType`
5. `modelId` prefix (`cf_` → Carbon Fiber, `fg_` → Fiberglass)
6. `displayName` string matching
7. Fallback: "Standard"

- [ ] Which step is the current value coming from? (Enable `logBarcodeDebug()` or check console for `[BARCODE_DEBUG]` logs)
- [ ] If steps 1–4 are returning a value, that value is overriding the correct prefix-based inference from step 5

### Step 5: API Payload Comparison
Check the API response at `GET /api/production-queue/unified` or the layup schedule query:
- [ ] What is `features` in the API response? (Note: for production orders, `specifications` is aliased as `features` at line 808 of `server/src/routes/index.ts`)
- [ ] What is `modelId` / `stockModelId`?
- [ ] Does `inferFeaturesFromStockModel()` (line 831) add any material field? (Currently it does NOT — it only adds `action_length`)

### Step 6: Resolution
If `specifications` JSONB contains incorrect material:
- Source is likely the original PO line item's `specifications` (snapshotted at prod order creation)
- Root cause: AI extraction, manual entry, or PO import set the wrong material
- Fix: Either correct the PO line item's specifications, or (recommended) change `deriveMaterial()` priority order so `modelId` prefix takes precedence over JSONB fields

---

## Summary of Key Findings

1. **PO ↔ Production Order FKs already exist** (`po_id`, `po_item_id`) — traceability is structurally sound.

2. **Material mismatch root cause**: `deriveMaterial()` in `deriveOrderLabels.ts` prioritizes `features.material` / `specifications.material` (unreliable JSONB data from imports/AI) over the `modelId` prefix (reliable, canonical stock model identifier).

3. **Name and Material come from different sources**: Name comes from `item_name` (snapshotted from PO line), Material is derived at display time from multiple competing sources with wrong priority ordering.

4. **Recommended fix** (single code change, no schema changes needed): Reorder `deriveMaterial()` to check `modelId` prefix FIRST, then fall back to JSONB fields for non-standard products only.

5. **For enhanced audit**: Add `source_snapshot` JSONB and `unit_index` integer to `production_orders` to create an immutable record of PO state at creation time.
