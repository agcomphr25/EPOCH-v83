# EPOCH ARCHITECTURAL AUDIT REPORT

**Date:** March 10, 2026
**Scope:** Read-only inspection of data model, BOM architecture, sales/purchase/inventory/manufacturing references
**Goal:** Determine safest path toward a unified Item Master architecture

---

## PHASE 1 — DATA MODEL DISCOVERY

### Table: `inventory_items` (PRIMARY ITEM TABLE)
**File:** `server/schema.ts` (Line 564)
**Fields:**
- `id` (integer, PK, auto-generated)
- `agPartNumber` (text, unique) — primary business identifier ("AG Part#")
- `name` (text)
- `sku` (text) — informational link to stock models
- `source` (text)
- `supplierPartNumber` (text)
- `costPer` (real)
- `type` (text) — "Purchased" or "Manufactured"
- `manufacturingDepartment` (text) — CNC, Cutting Table, or Cores
- `vendorId` (integer, FK → vendors.id)
- `isStockItem` (boolean)
- `utilizedInPL1` (boolean) — Production Line 1 (Stocks)
- `utilizedInPL2` (boolean) — Production Line 2 (Aerospace)
- `traceabilityRequired` (boolean) — for P2 items
- `traceabilityFields` (jsonb) — Lot#, Batch#, Exp Date
- `isFabric`, `isPacket`, `isPacketPart` (booleans)
- `usageUnit`, `vendorUnit`, `purchaseUnit`, `purchaseQuantity` (MRP fields)
- `consumptionRate`, `cogsPerUnit`, `latestCost`, `leadTimeDays`
- `onHand`, `committed`, `available`, `minimumStock`, `reorderPoint` (legacy qty fields)
- `hasSds`, `sdsFilePath`, `hasTds`, `tdsFilePath`

**Used by:**
- `inventory_balances.agPartNumber`
- `inventory_transactions.agPartNumber`
- `vendor_parts.agPartNumber`
- `vendor_po_items.agPartNumber`
- `boms.parentPartAgNumber`
- `bom_lines.childPartAgNumber`
- `quote_line_items.inventoryItemId` / `agPartNumber`
- `material_lots.inventoryItemId`
- `work_order_parts.inventoryItemId`

---

### Table: `stock_models` (FINISHED GOODS / SALEABLE PRODUCTS)
**File:** `server/schema.ts` (Line 439)
**Fields:**
- `id` (text, PK) — model identifier
- `name` (text)
- `displayName` (text)
- `price` (real)
- `description` (text)
- `handedness` (text) — LH, RH, or null
- `isActive` (boolean)
- `sortOrder` (integer)

**Used by:**
- `all_orders.modelId`
- `purchase_order_items.stockModelId`
- `customer_stock_model_prices.stockModelId`

---

### Table: `parts` (DEPRECATED / LEGACY)
**File:** `server/schema.ts` (Line 6319)
**Fields:**
- `id` (UUID, PK)
- `sku` (text)
- `name` (text)
- `uom` (text, default "EA")
- `stdCost` (numeric)
- `weight` (numeric)
- `isMake` (boolean)

**Used by:** No active foreign key references. Schema comment explicitly states: "Now references inventoryItems instead of deprecated parts table"

---

### Table: `bom_definitions` (STOCK/LEGACY BOM PARENT)
**File:** `server/schema.ts` (Line 6222)
**Fields:**
- `id` (UUID, PK)
- `sku` (text)
- `modelName` (text)
- `revision` (text, default "A")
- `description` (text)
- `isActive` (boolean)

**Used by:**
- `bom_items.bomId`
- `all_orders.bomDefinitionId` (implied)

---

### Table: `bom_items` (STOCK/LEGACY BOM CHILDREN)
**File:** `server/schema.ts` (Line 6233)
**Fields:**
- `id` (UUID, PK)
- `bomId` (UUID, FK → bom_definitions.id)
- `partName` (text) — free-text part reference
- `quantity` (real)
- `firstDept` (text) — Layup, Assembly/Disassembly, Finish, Paint, QC, Shipping
- `itemType` (text) — "manufactured", "material", "sub_assembly", "labor"
- `referenceBomId` (UUID, FK → bom_definitions.id) — sub-assembly link
- `assemblyLevel` (integer)
- `quantityMultiplier` (integer)
- `laborHours`, `hourlyRate` (real) — labor tracking
- `isOptional` (boolean)

---

### Table: `boms` (ROBUST BOM PARENT — NEW SYSTEM)
**File:** `server/schema.ts` (Line 6335)
**Fields:**
- `id` (UUID, PK)
- `parentPartAgNumber` (text, FK → inventory_items.agPartNumber)
- `code` (text)
- `description` (text)

**Used by:**
- `bom_revisions.bomId`

---

### Table: `bom_revisions`
**File:** `server/schema.ts` (Line 6349)
**Fields:**
- `id` (UUID, PK)
- `bomId` (UUID, FK → boms.id)
- `revCode` (text)
- `isReleased` (boolean)
- `effectiveFrom` (timestamp)

**Used by:**
- `bom_lines.revisionId`

---

### Table: `bom_lines` (ROBUST BOM CHILDREN)
**File:** `server/schema.ts` (Line 6365)
**Fields:**
- `revisionId` (UUID, FK → bom_revisions.id)
- `childPartAgNumber` (text, FK → inventory_items.agPartNumber)
- `qtyPer` (numeric)
- `scrapPct` (numeric)

---

### Table: `material_lots` (TRACEABILITY / LOT CONTROL)
**File:** `server/schema.ts` (Line 4528)
**Fields:**
- `internalControlNumber` (ICN, unique)
- `inventoryItemId` (integer) — **soft reference, NO FK constraint** to inventory_items
- `materialPartNumber` (text, denormalized)
- `materialName` (text, denormalized)
- `supplier`, `supplierLotNumber`, `expirationDate`, `remainingQty`, `status`

---

### Table: `inventory_balances`
**File:** `server/schema.ts` (Line 3296)
**Fields:**
- `agPartNumber` (text, FK → inventory_items.agPartNumber)
- `locationId` (text)
- `quantityOnHand`, `quantityAllocated`, `quantityAvailable`

---

### Table: `inventory_transactions`
**File:** `server/schema.ts` (Line 3356)
**Fields:**
- `agPartNumber` (text, FK → inventory_items.agPartNumber)
- `transactionType` (receipt, consumption, adjustment, transfer, return, issue)
- `quantity`, `unitOfMeasure`, `fromLocation`, `toLocation`
- `referenceType` (PO, WorkOrder, Adjustment, Manual)
- `referenceId`, `costPerUnit`, `totalCost`

---

## PHASE 2 — BOM ARCHITECTURE

### Three Separate BOM Systems Exist:

#### System 1: Robust BOM (New/MRP — for P2 primarily)
```
boms
  └─ parentPartAgNumber → inventory_items.agPartNumber
  └─ bom_revisions
       └─ bom_lines
            └─ childPartAgNumber → inventory_items.agPartNumber
            └─ qtyPer, scrapPct
```
- **BOM parents:** Stored as `inventory_items` with `type = 'Manufactured'`
- **BOM children:** Also `inventory_items` referenced by `agPartNumber`
- **Supports:** Multi-level explosions via recursive CTEs, revision control, scrap percentages
- **File:** `server/src/db/queries/bom.ts`

#### System 2: Stock BOM (Legacy — for P1/P2)
```
bom_definitions (parent: modelName, sku)
  └─ bom_items
       └─ partName (free text)
       └─ itemType: manufactured | material | sub_assembly | labor
       └─ referenceBomId → bom_definitions.id (sub-assembly)
```
- **BOM parents:** Stored as `bom_definitions` — **NOT** linked to `inventory_items` by FK
- **BOM children:** Referenced by free-text `partName` — **NO FK** to `inventory_items`
- **Linked to production:** `all_orders.bomDefinitionId`

#### System 3: Cutting Table BOM (Specialized)
```
cutting_packet_boms (parent: packet definition)
  └─ cutting_packet_bom_materials (fabrics needed)
  └─ cutting_packet_bom_parts (cut pieces yielded)
```
- Specialized for cutting department, tracks yield_per_cut and square_meters_per_part

---

## PHASE 3 — SALES / INVOICE ITEMS

### `all_orders` (P1 Finalized Sales/Production Orders)
**File:** `server/schema.ts` (Line 76)
**References:**
- `modelId` → `stock_models.id` (text)
- `customerId` (text)
- `bomDefinitionId` → `bom_definitions.id` (implied)
- **Does NOT reference** `inventory_items` or `agPartNumber`

### `purchase_order_items` (P1 Customer PO Line Items)
**File:** `server/schema.ts` (Line 4216)
**References:**
- `stockModelId` (text) → stock_models
- `itemId` (text) — generic item identifier
- `itemName` (text)
- **Does NOT use** a FK to `inventory_items`

### `quote_line_items` (P2 Quote Line Items)
**File:** `server/schema.ts` (Line 8493)
**References:**
- `inventoryItemId` (integer) — **soft reference, NO FK constraint** to inventory_items
- `agPartNumber` (text) — captured for reference, no FK
- `description`, `unitPrice`, `totalPrice`, `quantity`
- Closest to Item Master pattern but lacks FK enforcement

### `ar_invoices` (Accounts Receivable Invoices)
**File:** `server/schema.ts` (Line 13308)
**Fields:**
- `id` (UUID, PK)
- `customerId` (text), `invoiceNumber` (text), `invoiceDate`, `dueDate`
- `terms`, `poId`, `poOverride`
- `subtotal`, `taxAmount`, `totalAmount` (numeric)
- `status` (default "OPEN"), `notes`, `createdBy`

### `ar_invoice_lines` (Invoice Line Items)
**File:** `server/schema.ts` (Line 13339)
**Fields:**
- `id` (UUID, PK)
- `invoiceId` (UUID, FK → ar_invoices.id)
- `inventoryItemId` (text) — **soft reference, NO FK constraint** to inventory_items
- `description` (text), `qty` (numeric), `unitPrice` (numeric), `lineTotal` (numeric)

### `invoice_numbers` (Invoice Sequence Tracker)
**File:** `server/schema.ts` (Line 8441)
**References:**
- `customerId` (text), `customerCode`, `year`, `lastNumber`
- Tracks auto-incrementing invoice numbers per customer/year

---

## PHASE 4 — PURCHASE SYSTEM

### Customer-Facing (Sales-Side):

| Table | References |
|-------|-----------|
| `purchase_orders` | `customerId` (text) |
| `purchase_order_items` | `stockModelId` (text), `itemId` (text) |
| `p2_purchase_orders` | `customerId` → p2_customers, `sourceQuoteId` → quotes |
| `p2_purchase_order_items` | `partNumber` (text), `partName` (text) — **no FK to inventory_items** |

### Supply-Side (Vendor Procurement):

| Table | References |
|-------|-----------|
| `vendor_pos` | `vendorId` → vendors.id |
| `vendor_po_items` | `agPartNumber` → **inventory_items.agPartNumber** (FK) |
| `vendor_parts` | `agPartNumber` → **inventory_items.agPartNumber** (FK), `vendorId` → vendors.id |

**Key Finding:** Vendor procurement is properly linked to `inventory_items`. Customer POs use loose text references (`stockModelId`, `itemId`, `partNumber`) without FKs.

---

## PHASE 5 — INVENTORY SYSTEM

| Table | References |
|-------|-----------|
| `inventory_items` | Central master — `id` (int PK), `agPartNumber` (unique text) |
| `inventory_balances` | `agPartNumber` → inventory_items (FK) |
| `inventory_transactions` | `agPartNumber` → inventory_items (FK) |
| `material_lots` | `inventoryItemId` → inventory_items.id (FK) |

**Finding:** Inventory system **ONLY** references `inventory_items`. The `stock_models` table has **NO** connection to inventory tracking. Finished goods (stock models) are not inventory-tracked.

---

## PHASE 6 — MANUFACTURING / PRODUCTION

### `production_orders` (P1 Production)
**File:** `server/schema.ts` (Line 5201)
**References:**
- `orderId` (text) — customer order ID
- `poId` → purchase_orders.id (FK)
- `poItemId` → purchase_order_items.id (FK)
- `itemId` (text) — loose text reference
- `itemName` (text)
- `itemType` (text)
- **Does NOT reference** `inventory_items` directly

### `all_orders` (P1 Order + Manufacturing Progression)
**References:**
- `modelId` → `stock_models.id`
- Department progression: Layup → CNC → Finish → Gunsmith → Paint → QC → Shipping
- `currentDepartment` defaults to "P1 Production Queue"

### P1 vs P2 Differences

**P1 (Stocks):**
- Uses `stock_models` as the product definition
- Uses `bom_definitions` / `bom_items` (legacy BOM)
- Department flow: P1 Production Queue → Layup → CNC → Finish → Gunsmith → Paint → QC → Shipping
- No traceability requirements

**P2 (Aerospace):**
- Uses `inventory_items` with `type = 'Manufactured'` as the product definition
- Uses `boms` / `bom_revisions` / `bom_lines` (robust BOM)
- Requires tolerance authorization (`isToleranceAuthorizer`)
- Full traceability: `traceabilityRequired`, `traceabilityFields`, `material_lots`
- Separate customer database: `p2_customers`
- Separate PO system: `p2_purchase_orders` / `p2_purchase_order_items`
- Separate quoting: `quotes` / `quote_line_items`

**Production Line Flags on `inventory_items`:**
- `utilizedInPL1` (boolean) — part used in Stocks production
- `utilizedInPL2` (boolean) — part used in Aerospace production

---

## PHASE 7 — FRONTEND ITEM USAGE

| UI Page | File Path | Item Type Used |
|---------|-----------|---------------|
| Stock Models (Products) | `client/src/pages/StockModels.tsx` | `stock_models` |
| Inventory Manager | `client/src/pages/NewInventoryManagerPage.tsx` | `inventory_items` |
| BOM Administration | `client/src/pages/BOMAdministration.tsx` | `bom_definitions` + `bom_items` |
| Stock Model Manager | `client/src/components/StockModelManager.tsx` | `stock_models` |
| Inventory Items Card | `client/src/components/inventory/InventoryItemsCard.tsx` | `inventory_items` |
| BOM Details | `client/src/components/BOMDetails.tsx` | `bom_definitions` + `bom_items` |
| BOM Definition Form | `client/src/components/BOMDefinitionForm.tsx` | `bom_definitions` |

**UI Distinction:**
- "Products" = `stock_models` — managed via StockModelManager, have price/displayName
- "Parts/Materials" = `inventory_items` — managed via InventoryItemsCard, have AG Part#, type (Purchased/Manufactured)
- BOM Admin links `bom_definitions` to `bom_items` by free-text `partName`

---

## PHASE 8 — ROLE ANALYSIS

### Current Item Roles by Table:

| Role | Representation | Table |
|------|---------------|-------|
| RAW MATERIAL | `inventory_items` where `type = 'Purchased'` | `inventory_items` |
| COMPONENT | `inventory_items` (any type) used in `bom_lines` as child | `inventory_items` |
| SUBASSEMBLY | `inventory_items` where `type = 'Manufactured'` used as BOM child | `inventory_items` / `bom_items` with `itemType = 'sub_assembly'` |
| FINISHED GOOD | `stock_models` (P1) / `inventory_items` where `type = 'Manufactured'` (P2) | **SPLIT across two tables** |
| SERVICE / LABOR | `bom_items` where `itemType = 'labor'` | `bom_items` only |

### Multi-Role Support:
- **Partial.** An `inventory_items` record CAN be both a purchased raw material AND a BOM component.
- However, a `stock_model` (finished good) **CANNOT** be an `inventory_item` — they are separate tables with no FK relationship.
- **Hard separation exists between saleable products (stock_models) and tracked parts (inventory_items).**

---

## PHASE 9 — ARCHITECTURAL GAP ANALYSIS

### Critical Conflicts Identified:

| # | Conflict | Impact |
|---|---------|--------|
| 1 | **BOM parent (stock_model) cannot be sold with inventory tracking** | `stock_models` has price but NO connection to `inventory_balances` or `inventory_transactions` |
| 2 | **Manufactured inventory_item cannot be sold** | `inventory_items` has cost data but NO price field; not referenced by `all_orders` |
| 3 | **stock_model cannot appear in vendor POs** | Cannot purchase finished goods; vendor_po_items only references `inventory_items` |
| 4 | **Legacy BOM (bom_items) uses free-text partName** | No FK to `inventory_items`; cost roll-ups require manual mapping; data integrity risk |
| 5 | **P1 production orders use loose text itemId** | `production_orders.itemId` is not FK-linked to any master table |
| 6 | **P2 customer PO items use free-text partNumber** | `p2_purchase_order_items.partNumber` has no FK to `inventory_items` |
| 7 | **ar_invoice_lines.inventoryItemId is a soft reference (text, no FK)** | Invoice line items exist but lack FK constraint to inventory_items; data integrity not enforced |
| 8 | **Two parallel BOM systems** | `bom_definitions`/`bom_items` (legacy) vs `boms`/`bom_revisions`/`bom_lines` (robust) — duplication and confusion |
| 9 | **Deprecated `parts` table still in schema** | Dead code; potential confusion for developers |
| 10 | **stock_models has no agPartNumber** | Cannot unify with inventory_items without a mapping |

---

## PHASE 10 — UNIFIED ITEM MASTER DESIGN

### Recommended `items` Table Structure:

```sql
CREATE TABLE items (
  id              SERIAL PRIMARY KEY,
  ag_part_number  TEXT NOT NULL UNIQUE,       -- universal identifier
  sku             TEXT,                        -- customer-facing SKU
  name            TEXT NOT NULL,
  display_name    TEXT,                        -- customer-facing name
  description     TEXT,

  -- ROLE FLAGS (an item can have multiple roles)
  item_category   TEXT NOT NULL,               -- RAW_MATERIAL, COMPONENT, SUBASSEMBLY, FINISHED_GOOD, SERVICE
  can_purchase    BOOLEAN DEFAULT FALSE,
  can_sell        BOOLEAN DEFAULT FALSE,
  can_manufacture BOOLEAN DEFAULT FALSE,
  has_bom         BOOLEAN DEFAULT FALSE,
  inventory_tracked BOOLEAN DEFAULT TRUE,

  -- PRODUCTION LINE FLAGS
  production_line TEXT[],                       -- ['P1', 'P2'] or subset
  utilized_in_pl1 BOOLEAN DEFAULT FALSE,
  utilized_in_pl2 BOOLEAN DEFAULT FALSE,

  -- COSTING
  standard_cost   NUMERIC(18,6) DEFAULT 0,
  latest_cost     REAL,
  default_price   REAL,                        -- selling price (from stock_models.price)
  cogs_per_unit   REAL,

  -- PURCHASING
  vendor_id       INTEGER REFERENCES vendors(id),
  supplier_part_number TEXT,
  vendor_unit     TEXT,
  purchase_unit   TEXT,
  purchase_quantity REAL,
  lead_time_days  INTEGER,

  -- MANUFACTURING
  type            TEXT,                         -- Purchased, Manufactured
  manufacturing_department TEXT,                -- CNC, Cutting Table, Cores
  uom             TEXT DEFAULT 'EA',

  -- INVENTORY
  on_hand         INTEGER,
  committed       INTEGER,
  available       INTEGER,
  reorder_point   INTEGER,
  minimum_stock   INTEGER,

  -- TRACEABILITY (P2/AS9100)
  traceability_required BOOLEAN DEFAULT FALSE,
  traceability_fields   JSONB DEFAULT '[]',

  -- CLASSIFICATION FLAGS
  is_fabric       BOOLEAN DEFAULT FALSE,
  is_packet       BOOLEAN DEFAULT FALSE,
  is_packet_part  BOOLEAN DEFAULT FALSE,
  is_stock_item   BOOLEAN DEFAULT FALSE,

  -- PRODUCT-SPECIFIC (from stock_models)
  handedness      TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  sort_order      INTEGER DEFAULT 0,

  -- DOCUMENTS
  has_sds         BOOLEAN DEFAULT FALSE,
  sds_file_path   TEXT,
  has_tds         BOOLEAN DEFAULT FALSE,
  tds_file_path   TEXT,

  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);
```

### Key Design Decisions:
1. `inventory_items` becomes the base for `items` — it already has the most complete field set
2. `stock_models` fields (`price`, `displayName`, `handedness`, `sortOrder`) merge into `items` with `can_sell = TRUE`
3. Role flags (`can_purchase`, `can_sell`, `can_manufacture`, `has_bom`) replace hard table separation
4. All BOM, PO, SO, and invoice references point to `items.ag_part_number` or `items.id`

---

## PHASE 11 — MIGRATION PLAN

**Recommended strategy:** Extend `inventory_items` in-place as the canonical Item Master. This is the safest path because `inventory_items` already has the most FK references (inventory_balances, inventory_transactions, vendor_parts, vendor_po_items, boms, bom_lines) and the richest field set. Creating a net-new `items` table would require migrating all those existing FKs unnecessarily.

### PHASE A: Add Item Master Fields to `inventory_items`

**STEP 1: Add role/pricing columns to `inventory_items`**
- Add `can_purchase` BOOLEAN DEFAULT FALSE
- Add `can_sell` BOOLEAN DEFAULT FALSE
- Add `can_manufacture` BOOLEAN DEFAULT FALSE
- Add `has_bom` BOOLEAN DEFAULT FALSE
- Add `inventory_tracked` BOOLEAN DEFAULT TRUE
- Add `default_price` REAL (selling price)
- Add `display_name` TEXT (customer-facing name)
- Add `item_category` TEXT (RAW_MATERIAL, COMPONENT, SUBASSEMBLY, FINISHED_GOOD, SERVICE)
- Add `handedness` TEXT (from stock_models)
- Add `sort_order` INTEGER (from stock_models)

**STEP 2: Backfill role flags from existing data**
- Set `can_purchase = TRUE` where `type = 'Purchased'`
- Set `can_manufacture = TRUE` where `type = 'Manufactured'`
- Set `has_bom = TRUE` where `agPartNumber` appears in `boms.parentPartAgNumber`
- Set `inventory_tracked = TRUE` for all existing records

### PHASE B: Absorb Stock Models

**STEP 3: Create inventory_items records for each stock_model**
- Generate `agPartNumber` for each stock model (e.g., "AG-SM-{id}")
- Map `stock_models.price` → `default_price`
- Map `stock_models.displayName` → `display_name`
- Map `stock_models.handedness` → `handedness`
- Set `can_sell = TRUE`, `can_manufacture = TRUE`, `inventory_tracked = TRUE`

**STEP 4: Create mapping table `stock_model_item_map`**
- Temporary table: `stock_model_id` → `ag_part_number`
- Used during dual-write transition period

### PHASE C: Data Quality & Constraint Hardening

**STEP 5: Validate and backfill soft references**
- `quote_line_items.inventoryItemId` — validate all values exist in inventory_items, then add FK
- `ar_invoice_lines.inventoryItemId` — validate and add FK (change to integer type if needed)
- `material_lots.inventoryItemId` — validate and add FK
- `p2_purchase_order_items.partNumber` — map to valid `agPartNumber` values, add FK
- `purchase_order_items.itemId` — map to valid `agPartNumber` values, add FK
- `production_orders.itemId` — map to valid `agPartNumber` values, add FK

**STEP 6: Clean up deprecated `parts` table**
- Verify no `parts` records exist that are missing from `inventory_items`
- If any exist, migrate them with appropriate role flags
- Drop `parts` table once confirmed empty/redundant

### PHASE D: BOM Consolidation

**STEP 7: Migrate legacy BOM references**
- Map `bom_items.partName` (free text) to `agPartNumber` values
- Add `agPartNumber` FK column to `bom_items`
- Long-term: Deprecate `bom_definitions`/`bom_items` in favor of robust BOM system (`boms`/`bom_revisions`/`bom_lines`)

### PHASE E: Sales/Order Linkage

**STEP 8: Update sales order references**
- Add `agPartNumber` column to `all_orders` (alongside existing `modelId`)
- Backfill from `stock_model_item_map`
- Dual-write during transition: populate both `modelId` and `agPartNumber`
- Update `ar_invoice_lines` to reference `agPartNumber` with proper FK

**STEP 9: Update customer PO references**
- Add `agPartNumber` FK to `purchase_order_items`
- Backfill from `stockModelId` via mapping table

### PHASE F: Deprecation & Cleanup

**STEP 10: Deprecate old tables**
- Mark `stock_models` as deprecated (keep as read-only view during transition)
- Mark `parts` as deprecated
- Plan eventual deprecation of `bom_definitions`/`bom_items`
- Remove legacy columns from `inventory_items` once all routes/UI updated
- Update all API routes and UI pages to use unified item references

---

## PHASE 12 — RISK ANALYSIS

### Tables That Will Break:

| Table | Risk | Mitigation |
|-------|------|-----------|
| `stock_models` | All P1 order entry references `modelId` | Create mapping view; update order entry to use `items` |
| `all_orders` | `modelId` column must be migrated | Add `itemId` column, backfill, dual-write during transition |
| `purchase_order_items` | `stockModelId` must be migrated | Same dual-write approach |
| `bom_definitions` / `bom_items` | Free-text references must be converted | Map `partName` to `agPartNumber`; requires data cleanup |
| `production_orders` | `itemId` text field must be FK-linked | Backfill with verified `agPartNumber` values |
| `p2_purchase_order_items` | `partNumber` text field must be FK-linked | Backfill with verified `agPartNumber` values |

### APIs That Will Break:

| Route Area | Impact |
|-----------|--------|
| Stock model CRUD routes | Must read/write to `items` instead of `stock_models` |
| Order entry routes | Must resolve `items` instead of `stock_models` |
| BOM administration routes | Must use robust BOM or map legacy BOM references |
| Production order routes | Must link `itemId` to `items` table |
| Inventory routes | FK target change (low risk if `agPartNumber` is preserved) |
| Quote routes | Already use `inventoryItemId` — lowest risk |

### UI Pages That Must Be Updated:

| Page | Change Required |
|------|----------------|
| `StockModels.tsx` / `StockModelManager.tsx` | Query `items` where `can_sell = TRUE` instead of `stock_models` |
| `NewInventoryManagerPage.tsx` / `InventoryItemsCard.tsx` | Query `items` instead of `inventory_items` (mostly same fields) |
| `BOMAdministration.tsx` / `BOMDetails.tsx` | Standardize on robust BOM; link components by `agPartNumber` |
| Order Entry pages | Use `items` picker instead of stock model dropdown |
| P2 Quote/PO pages | Already close to target; minor FK updates |

### Migrations Needed:

1. `CREATE TABLE items` (new schema)
2. `INSERT INTO items SELECT ... FROM inventory_items` (data migration)
3. `INSERT INTO items SELECT ... FROM stock_models` (data migration with generated agPartNumbers)
4. `ALTER TABLE all_orders ADD COLUMN item_ag_part_number TEXT REFERENCES items(ag_part_number)`
5. `ALTER TABLE purchase_order_items ADD COLUMN item_ag_part_number TEXT REFERENCES items(ag_part_number)`
6. `ALTER TABLE production_orders ADD COLUMN item_ag_part_number TEXT REFERENCES items(ag_part_number)`
7. `ALTER TABLE p2_purchase_order_items ADD COLUMN item_ag_part_number TEXT REFERENCES items(ag_part_number)`
8. Create `invoice_lines` table referencing `items`
9. Backfill all new FK columns from existing text fields
10. Update FK targets for `inventory_balances`, `inventory_transactions`, `material_lots`, `vendor_parts`, `vendor_po_items`

---

## PHASE 13 — FINAL REPORT SUMMARY

### 1. Current Architecture Diagram

```
                    ┌──────────────────┐
                    │   stock_models   │ (Saleable Products - P1)
                    │  price, display  │
                    └────────┬─────────┘
                             │ modelId (text)
                    ┌────────▼─────────┐
                    │   all_orders     │ (P1 Production/Sales)
                    │  bomDefinitionId │
                    └────────┬─────────┘
                             │
          ┌──────────────────▼──────────────────┐
          │          bom_definitions             │ (Legacy BOM Parent)
          │  modelName, sku (no FK to items)     │
          └──────────────────┬──────────────────┘
                             │ bomId
          ┌──────────────────▼──────────────────┐
          │            bom_items                 │ (Legacy BOM Children)
          │  partName (FREE TEXT - no FK)        │
          └─────────────────────────────────────┘

  ════════════════════════════════════════════════════

          ┌─────────────────────────────────────┐
          │          inventory_items             │ (Parts & Materials Master)
          │  agPartNumber (unique), type,        │
          │  vendorId, costPer, MRP fields       │
          └───────┬──────────┬──────────────────┘
                  │          │
    ┌─────────────▼───┐  ┌──▼──────────────────┐
    │ inventory_       │  │ boms (Robust BOM)   │
    │ balances         │  │ parentPartAgNumber  │
    │ agPartNumber(FK) │  └──────────┬──────────┘
    └─────────────────┘              │
    ┌─────────────────┐   ┌──────────▼──────────┐
    │ inventory_       │   │ bom_revisions       │
    │ transactions     │   └──────────┬──────────┘
    │ agPartNumber(FK) │   ┌──────────▼──────────┐
    └─────────────────┘   │ bom_lines            │
    ┌─────────────────┐   │ childPartAgNumber(FK)│
    │ vendor_po_items  │   └─────────────────────┘
    │ agPartNumber(FK) │
    └─────────────────┘
```

### 2. Table Relationships
- `inventory_items` is the most connected table (12+ foreign key references)
- `stock_models` is isolated — only connected to `all_orders` and `purchase_order_items`
- Two BOM systems operate in parallel with no shared data model

### 3. Parts vs Products Separation
- **HARD SEPARATED.** `inventory_items` (parts/materials) and `stock_models` (products) have zero FK relationship
- A stock model cannot be inventory-tracked
- An inventory item cannot be sold (no price field)

### 4. BOM Architecture
- Three independent BOM systems: Robust (new), Stock (legacy), Cutting (specialized)
- Robust BOM properly links to `inventory_items` via FK
- Legacy BOM uses free-text references — data integrity risk

### 5. Sales Item References
- P1 sales → `stock_models.id` (via `modelId`)
- P2 quotes → `inventory_items` (via `inventoryItemId` + `agPartNumber`)
- `ar_invoice_lines` exists but uses soft references (no FK to inventory_items)

### 6. Purchasing Item References
- Vendor POs → `inventory_items.agPartNumber` (proper FK)
- Customer POs → `stockModelId` / `itemId` / `partNumber` (loose text, no FKs)

### 7. Inventory Item References
- All inventory tables → `inventory_items.agPartNumber` (proper FK)
- `stock_models` has NO inventory tracking

### 8. Manufacturing Item References
- P1 → `stock_models` via `all_orders.modelId`
- P2 → `inventory_items` via robust BOM `parentPartAgNumber`
- `production_orders.itemId` — loose text, no FK

### 9. Conflicts Discovered
- 10 architectural conflicts identified (see Phase 9)
- Most critical: saleable products and trackable inventory are completely separate entities
- `ar_invoice_lines` exists but with soft references — opportunity to harden with proper FK constraints

### 10. Recommended Item Master Model
- **Extend `inventory_items` in-place** as the canonical Item Master (do NOT create a net-new table)
- Add role flags: `can_purchase`, `can_sell`, `can_manufacture`, `has_bom`, `inventory_tracked`
- Absorb `stock_models` fields (`price` → `default_price`, `displayName` → `display_name`, `handedness`, `sortOrder`)
- Add `item_category` for classification (RAW_MATERIAL, COMPONENT, SUBASSEMBLY, FINISHED_GOOD, SERVICE)
- See Phase 10 for complete target schema

### 11. Migration Strategy
- 6-phase, 10-step incremental migration (see Phase 11)
- Phase A: Add columns to `inventory_items` (non-destructive)
- Phase B: Absorb `stock_models` into `inventory_items` with mapping table
- Phase C: Validate and harden all soft references (add FK constraints)
- Phase D: Consolidate legacy BOM onto robust BOM system
- Phase E: Link sales orders and customer POs to `agPartNumber`
- Phase F: Deprecate old tables after route/UI migration
- Dual-write period for backward compatibility during transitions
- Estimated effort: Medium-High (affects ~15 API route modules and ~8 UI pages)
- **Safest path:** `inventory_items` already has the most FK references in the system — extending it avoids unnecessary FK migrations for inventory, vendor POs, robust BOMs, and traceability

### Important Note: FK vs Soft Reference Distinction
Several tables that appear to reference `inventory_items` actually use **soft references** (plain columns with no FK constraint):
- `quote_line_items.inventoryItemId` — no FK
- `ar_invoice_lines.inventoryItemId` — no FK (also stored as text, not integer)
- `material_lots.inventoryItemId` — no FK
- `p2_purchase_order_items.partNumber` — no FK
- `purchase_order_items.itemId` — no FK
- `production_orders.itemId` — no FK

These must be validated and hardened with proper FK constraints as part of the migration (Phase C).
