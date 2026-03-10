# EPOCH MANUFACTURING CORE ARCHITECTURE AUDIT

**Date:** March 10, 2026
**Scope:** Read-only inspection of manufacturing data structures
**Goal:** Verify minimum manufacturing core requirements and traceability chain integrity

---

## PHASE 1 — ITEM MASTER

### Table: `inventory_items`
**File:** `server/schema.ts` (Line 564)

```typescript
export const inventoryItems = pgTable('inventory_items', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  agPartNumber: text('ag_part_number').notNull().unique(),
  name: text('name').notNull(),
  source: text('source'),
  supplierPartNumber: text('supplier_part_number'),
  costPer: real('cost_per'),
  sku: text('sku'),
  type: text('type'),                    // "Purchased" or "Manufactured"
  manufacturingDepartment: text('manufacturing_department'),  // CNC, Cutting Table, Cores
  vendorId: integer('vendor_id').references(() => vendors.id),
  usageUnit: text('usage_unit'),
  vendorUnit: text('vendor_unit'),
  purchaseUnit: text('purchase_unit'),
  purchaseQuantity: real('purchase_quantity'),
  consumptionRate: real('consumption_rate'),
  cogsPerUnit: real('cogs_per_unit'),
  latestCost: real('latest_cost'),
  leadTimeDays: integer('lead_time_days'),
  isStockItem: boolean('is_stock_item').default(false),
  utilizedInPL1: boolean('utilized_in_pl1').default(false),
  utilizedInPL2: boolean('utilized_in_pl2').default(false),
  traceabilityRequired: boolean('traceability_required').default(false),
  traceabilityFields: jsonb('traceability_fields'),
  isFabric: boolean('is_fabric').default(false),
  isPacket: boolean('is_packet').default(false),
  isPacketPart: boolean('is_packet_part').default(false),
  isActive: boolean('is_active').default(true),
  // ... additional fields (legacy qty, SDS/TDS, etc.)
});
```

### FK Relationships (Outbound):
| Column | References |
|--------|-----------|
| `vendorId` | `vendors.id` (proper FK) |

### Tables Referencing `inventory_items`:

| Table | Column | Reference Type |
|-------|--------|---------------|
| `inventory_balances` | `agPartNumber` | **FK** (cascade delete) |
| `inventory_transactions` | `agPartNumber` | **FK** (cascade delete) |
| `vendor_parts` | `agPartNumber` | **FK** (cascade delete) |
| `vendor_po_items` | `agPartNumber` | **FK** (nullable) |
| `boms` | `parentPartAgNumber` | **FK** (cascade delete) |
| `bom_lines` | `childPartAgNumber` | **FK** |
| `manufacturing_queue` | `inventoryItemId` | **FK** (cascade delete) |
| `quote_line_items` | `inventoryItemId` | **Soft reference** (no FK constraint) |
| `ar_invoice_lines` | `inventoryItemId` | **Soft reference** (text type, no FK) |
| `material_lots` | `inventoryItemId` | **Soft reference** (no FK constraint) |
| `part_routings` | `inventoryItemId` | **Soft reference** (text type, no FK) |
| `travelers` | `inventoryItemId` | **Soft reference** (varchar, no FK) |

### Suitability as Unified Item Master:

**Strengths:**
- Most connected table in the system (12+ references)
- Already has `type` field distinguishing Purchased vs Manufactured
- Production line flags (`utilizedInPL1`, `utilizedInPL2`)
- Traceability configuration per item
- Manufacturing department assignment
- MRP-related fields (lead time, consumption rate, COGS)
- Vendor linkage with proper FK

**Weaknesses:**
- No `price` field (selling price) — currently lives on `stock_models`
- No `display_name` field — currently on `stock_models`
- No role flags (`can_purchase`, `can_sell`, `can_manufacture`)
- No `uom` field (unit of measure is split across `usageUnit`, `vendorUnit`, `purchaseUnit`)
- Several important references are soft (no FK constraints)
- `stock_models` (saleable products) are a completely separate table with no FK to `inventory_items`

**Assessment:** `inventory_items` is the strongest candidate for the unified Item Master. It needs role flags, pricing fields, and FK hardening, but the foundation is solid.

---

## PHASE 2 — BILL OF MATERIALS

### Three BOM Implementations Found:

### System 1: Robust BOM (Modern — MRP/P2)

**Table: `boms`** — File: `server/schema.ts` (Line 6335)
```typescript
export const boms = pgTable('boms', {
  id: uuid('id').primaryKey().defaultRandom(),
  parentPartAgNumber: text('parent_part_ag_number').notNull()
    .references(() => inventoryItems.agPartNumber, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  description: text('description').default(''),
});
```

**Table: `bom_revisions`** — File: `server/schema.ts` (Line 6349)
```typescript
export const bomRevisions = pgTable('bom_revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  bomId: uuid('bom_id').references(() => boms.id),
  revCode: text('rev_code'),
  isReleased: boolean('is_released'),
  effectiveFrom: timestamp('effective_from'),
});
```

**Table: `bom_lines`** — File: `server/schema.ts` (Line 6365)
```typescript
export const bomLines = pgTable('bom_lines', {
  revisionId: uuid('revision_id').references(() => bomRevisions.id),
  childPartAgNumber: text('child_part_ag_number')
    .references(() => inventoryItems.agPartNumber),
  qtyPer: numeric('qty_per'),
  scrapPct: numeric('scrap_pct'),
});
```

**FK Analysis:**
- Parent → `inventory_items.agPartNumber` — **real FK with cascade delete**
- Child → `inventory_items.agPartNumber` — **real FK**
- Revision → `boms.id` — **real FK**
- Schema supports multi-level explosions. **However**, the recursive CTE in `server/src/db/queries/bom.ts` uses stale column names (`child_part_id`, `parent_part_id`) and references the deprecated `parts` table instead of the current `inventory_items`/`agPartNumber` columns. **The recursive BOM explosion query is likely non-functional against the current schema and needs to be rewritten.**
- Supports revision control and scrap percentage

### System 2: Stock/Legacy BOM (P1/P2 Simple)

**Table: `bom_definitions`** — File: `server/schema.ts` (Line 6222)
```typescript
export const bomDefinitions = pgTable('bom_definitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  sku: text('sku'),
  modelName: text('model_name').notNull(),
  revision: text('revision').notNull().default('A'),
  description: text('description'),
  isActive: boolean('is_active').default(true),
});
```

**Table: `bom_items`** — File: `server/schema.ts` (Line 6233)
```typescript
export const bomItems = pgTable('bom_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  bomId: uuid('bom_id').references(() => bomDefinitions.id).notNull(),
  partName: text('part_name').notNull(),       // FREE TEXT — no FK
  quantity: real('quantity').notNull().default(1),
  firstDept: text('first_dept').notNull().default('Layup'),
  itemType: text('item_type').notNull().default('manufactured'),
  referenceBomId: uuid('reference_bom_id').references(() => bomDefinitions.id),
  assemblyLevel: integer('assembly_level').default(0),
  laborHours: real('labor_hours'),
  hourlyRate: real('hourly_rate'),
  isOptional: boolean('is_optional').default(false),
});
```

**FK Analysis:**
- Parent → `bom_definitions` (standalone table, **NO FK** to `inventory_items`)
- Child → `partName` free text (**NO FK** to any table)
- Sub-assembly → `referenceBomId` FK to `bom_definitions`
- Supports labor tracking (`laborHours`, `hourlyRate`)
- **Data integrity risk:** Free-text references cannot be validated

### System 3: Cutting Table BOM (Specialized)

**Tables:** `cutting_packet_boms`, `cutting_packet_bom_materials`, `cutting_packet_bom_parts`
- Specialized for cutting department (fabric plies, kits)
- Tracks `yield_per_cut`, `square_meters_per_part`
- References `fabricInventoryId` to `cutting_fabric_inventory` (separate table, NOT directly to `inventory_items`)
- **Purpose-built; not suitable for general BOM use**

### BOM Summary:

| Feature | Robust BOM | Legacy BOM | Cutting BOM |
|---------|-----------|-----------|-------------|
| Parent Reference | `inventory_items` (FK) | standalone table (no FK) | packet definition |
| Child Reference | `inventory_items` (FK) | free text (no FK) | part number text |
| Revision Control | Yes (`bom_revisions`) | Simple text revision | No |
| Multi-level | Schema supports it (recursive CTE query is stale) | Yes (`referenceBomId`) | No |
| Scrap/Yield | Yes (`scrapPct`) | No | Yes (`yield_per_cut`) |
| Labor Tracking | No | Yes (`laborHours`) | No |
| FK Integrity | **Strong** | **Weak** | Partial |

---

## PHASE 3 — PRODUCTION ORDERS

### Table: `production_orders` (P1 — Stocks)
**File:** `server/schema.ts` (Line 5201)

```typescript
export const productionOrders = pgTable('production_orders', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull(),
  poId: integer('po_id').references(() => purchaseOrders.id, { onDelete: 'cascade' }).notNull(),
  poItemId: integer('po_item_id').references(() => purchaseOrderItems.id, { onDelete: 'cascade' }).notNull(),
  customerId: text('customer_id').notNull(),
  customerName: text('customer_name').notNull(),
  itemType: text('item_type').notNull(),
  itemId: text('item_id').notNull(),           // Soft reference — no FK
  itemName: text('item_name').notNull(),
  productionStatus: text('production_status').notNull().default('PENDING'),
  currentDepartment: text('current_department').default('Barcode'),
  departmentHistory: jsonb('department_history').default('[]'),
  // Department timestamps: barcodeCompletedAt, layupCompletedAt, cncCompletedAt, etc.
  isFulfilled: boolean('is_fulfilled').default(false),
  priorityScore: integer('priority_score'),
  hasP1Priority: boolean('has_p1_priority').default(false),
  materialCanonical: text('material_canonical').notNull().default(''),
});
```

**FK Analysis:**
- `poId` → `purchase_orders.id` — **real FK**
- `poItemId` → `purchase_order_items.id` — **real FK**
- `itemId` — **soft reference** (text, no FK to `inventory_items` or `stock_models`)

### Table: `p2_production_orders` (P2 — Aerospace)
**File:** `server/schema.ts` (Line 6547)

```typescript
export const p2ProductionOrders = pgTable('p2_production_orders', {
  id: serial('id').primaryKey(),
  orderId: text('order_id').notNull(),
  p2PoId: integer('p2_po_id').references(() => p2PurchaseOrders.id).notNull(),
  p2PoItemId: integer('p2_po_item_id').references(() => p2PurchaseOrderItems.id).notNull(),
  bomDefinitionId: uuid('bom_definition_id'),  // Soft reference — no FK
  bomItemId: uuid('bom_item_id'),              // Soft reference — no FK
  sku: text('sku').notNull(),
  partName: text('part_name').notNull(),
  quantity: integer('quantity').notNull(),
  quantityManufactured: integer('quantity_manufactured').default(0),
  department: text('department').notNull(),
  status: text('status').default('PENDING'),
  priority: integer('priority').default(50),
  dueDate: timestamp('due_date'),
  scheduledLayupDate: timestamp('scheduled_layup_date'),
});
```

**FK Analysis:**
- `p2PoId` → `p2_purchase_orders.id` — **real FK**
- `p2PoItemId` → `p2_purchase_order_items.id` — **real FK**
- `bomDefinitionId` — **soft reference** (no FK to `bom_definitions`)
- `bomItemId` — **soft reference** (no FK to `bom_items`)
- **No direct reference** to `inventory_items`

### Table: `all_orders` (P1 — Legacy/Active Order + Dept Progression)
**File:** `server/schema.ts` (Line 76)

```typescript
export const allOrders = pgTable('all_orders', {
  orderId: text('order_id').notNull(),
  modelId: text('model_id'),                    // Soft reference to stock_models.id
  statusId: integer('status_id').references(() => orderStatusTypes.id),
  currentDepartmentId: integer('current_department_id').references(() => orderDepartmentTypes.id),
  currentDepartment: text('current_department').default('P1 Production Queue'),
  // Department timestamps: layupCompletedAt, cncCompletedAt, finishCompletedAt, etc.
  sourcePoId: integer('source_po_id'),
  sourcePoItemId: integer('source_po_item_id'),
});
```

### Table: `manufacturing_queue` (Unified Manufacturing Queue)
**File:** `server/schema.ts` (Line 8149)

```typescript
export const manufacturingQueue = pgTable('manufacturing_queue', {
  id: serial('id').primaryKey(),
  inventoryItemId: integer('inventory_item_id')
    .references(() => inventoryItems.id, { onDelete: 'cascade' }).notNull(),
  vendorPoId: integer('vendor_po_id'),
  vendorPoItemId: integer('vendor_po_item_id')
    .references(() => vendorPOItems.id, { onDelete: 'cascade' }),
  p2PoId: integer('p2_po_id'),
  p2PoItemId: integer('p2_po_item_id'),
  department: text('department').notNull(),     // CNC, Cutting Table, Cores
  quantityRequested: integer('quantity_requested').notNull().default(1),
  quantityCompleted: integer('quantity_completed').default(0),
  status: text('status').notNull().default('PENDING'),
  // Inline traceability: fabricLot, fabricBatch, fabricRoll, materialDetails
});
```

**FK Analysis:**
- `inventoryItemId` → `inventory_items.id` — **real FK** (strongest production-to-item link)
- `vendorPoItemId` → `vendor_po_items.id` — **real FK**

### Production Order Summary:

| Table | References Items Via | FK Type | Production Line |
|-------|---------------------|---------|-----------------|
| `production_orders` | `itemId` (text) | **Soft** | P1 |
| `p2_production_orders` | `partName` (text) | **Soft** | P2 |
| `all_orders` | `modelId` (text) | **Soft** (to `stock_models`) | P1 |
| `manufacturing_queue` | `inventoryItemId` (int) | **Real FK** | P1 + P2 |

**Assessment:** Only the `manufacturing_queue` has a proper FK to `inventory_items`. All other production order tables use soft text references.

---

## PHASE 4 — PRODUCTION OPERATIONS

### Operations ARE Supported — via Traveler System

The system does **not** have a single `production_operations` or `routing` table. Instead, it uses a hierarchical structure:

### Template Layer: Part Routings

**Table: `part_routings`** — File: `server/schema.ts` (Line 4500)
```typescript
export const partRoutings = pgTable('part_routings', {
  id: uuid('id').defaultRandom().primaryKey(),
  inventoryItemId: text('inventory_item_id').notNull(),  // Soft reference
  partNumber: text('part_number').notNull(),
  partName: text('part_name').notNull(),
  routingName: text('routing_name').default('Default'),
  routingRevision: integer('routing_revision').default(1),
  departmentSequence: jsonb('department_sequence').notNull(),   // ["Layup", "CNC", "Finish"]
  traceabilityConfig: jsonb('traceability_config').notNull(),
  departmentConfig: jsonb('department_config'),
  materialsConfig: jsonb('materials_config'),
  qcStandards: jsonb('qc_standards'),
  customFields: jsonb('custom_fields'),
  isActive: boolean('is_active').default(true),
  createdBy: text('created_by').notNull(),
});
```

### Work Center Table

**Table: `p2_routing_departments`** — File: `server/schema.ts` (Line 4486)
```typescript
export const p2RoutingDepartments = pgTable('p2_routing_departments', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
});
```

### Execution Layer: Travelers

**Hierarchy:**
```
part_routings (TEMPLATE)
  └─ travelers (EXECUTION RECORD per production unit)
       └─ traveler_steps (DEPARTMENT/WORK CENTER steps)
            └─ traveler_tasks (INDIVIDUAL OPERATIONS)
                 └─ traveler_task_fields (DATA CAPTURE per operation)
                 └─ traveler_signatures (DIGITAL SIGNATURES)
            └─ traveler_material_consumption (MATERIAL USAGE per step)
```

**Table: `travelers`** — File: `server/schema.ts` (Line 4693)
```typescript
export const travelers = pgTable('travelers', {
  id: varchar('id', { length: 255 }).primaryKey(),
  travelerNumber: varchar('traveler_number', { length: 255 }).notNull().unique(),
  travelerRevision: integer('traveler_revision').default(1),
  inventoryItemId: varchar('inventory_item_id', { length: 255 }),  // Soft reference
  partNumber: varchar('part_number', { length: 255 }),
  partName: varchar('part_name', { length: 255 }),
  lotNumber: varchar('lot_number', { length: 255 }),
  serialNumber: varchar('serial_number', { length: 255 }),
  quantity: integer('quantity').default(1),
  status: varchar('status', { length: 50 }).default('DRAFT'),
  partRoutingId: varchar('part_routing_id', { length: 255 }),  // Soft reference
});
```

**Table: `traveler_steps`** — File: `server/schema.ts` (Line 4726)
```typescript
export const travelerSteps = pgTable('traveler_steps', {
  id: varchar('id', { length: 255 }).primaryKey(),
  travelerId: varchar('traveler_id', { length: 255 })
    .references(() => travelers.id, { onDelete: 'cascade' }).notNull(),
  departmentName: varchar('department_name', { length: 255 }).notNull(),
  stepNumber: integer('step_number').notNull(),
  status: varchar('status', { length: 50 }).default('NOT_STARTED'),
  assignedTechnicianId: varchar('assigned_technician_id', { length: 255 }),
  startedAt: timestamp('started_at'),
  startedBy: varchar('started_by', { length: 255 }),
  completedAt: timestamp('completed_at'),
  completedBy: varchar('completed_by', { length: 255 }),
  blockedAt: timestamp('blocked_at'),
  blockedReason: text('blocked_reason'),
});
```

**Table: `traveler_tasks`** — File: `server/schema.ts` (Line 4751)
```typescript
export const travelerTasks = pgTable('traveler_tasks', {
  id: varchar('id', { length: 255 }).primaryKey(),
  travelerStepId: varchar('traveler_step_id', { length: 255 })
    .references(() => travelerSteps.id, { onDelete: 'cascade' }).notNull(),
  taskType: varchar('task_type', { length: 100 }).notNull(),
  taskPhase: text('task_phase').notNull().default('WORK'),
  title: varchar('title', { length: 255 }).notNull(),
  instructions: text('instructions'),
  required: boolean('required').default(true),
  sortOrder: integer('sort_order').default(0),
  requiresSignature: boolean('requires_signature').default(false),
  requiresCertification: boolean('requires_certification').default(false),
  status: varchar('status', { length: 50 }).default('NOT_STARTED'),
});
```

**Table: `traveler_task_fields`** — File: `server/schema.ts` (Line 4783)
```typescript
export const travelerTaskFields = pgTable('traveler_task_fields', {
  travelerTaskId: varchar('traveler_task_id', { length: 255 })
    .references(() => travelerTasks.id, { onDelete: 'cascade' }).notNull(),
  fieldKey: varchar('field_key', { length: 255 }).notNull(),
  fieldLabel: varchar('field_label', { length: 255 }).notNull(),
  fieldType: varchar('field_type', { length: 50 }).default('text'),
  required: boolean('required').default(false),
  value: text('value'),
  recordedBy: varchar('recorded_by', { length: 255 }),
  recordedAt: timestamp('recorded_at'),
});
```

### Assessment:
- Operations **ARE** supported through the Traveler system
- Part Routings define the template (department sequence, materials, QC standards)
- Travelers are execution records with steps → tasks → data fields
- Digital signatures are supported for AS9100 compliance
- **Primary gap:** The Traveler system is primarily used for P2 (Aerospace). P1 (Stocks) uses the simpler department-timestamp approach on `all_orders` and `production_orders` instead of travelers.

---

## PHASE 5 — INVENTORY TRANSACTIONS

### Table: `inventory_transactions`
**File:** `server/schema.ts` (Line 3356)

```typescript
export const inventoryTransactions = pgTable('inventory_transactions', {
  id: serial('id').primaryKey(),
  agPartNumber: text('ag_part_number')
    .references(() => inventoryItems.agPartNumber, { onDelete: 'cascade' }).notNull(),
  transactionType: text('transaction_type').notNull(),  // receipt, consumption, adjustment, transfer, return, issue
  quantity: real('quantity').notNull(),                  // Negative for issues/consumption
  unitOfMeasure: text('unit_of_measure'),
  fromLocation: text('from_location'),
  toLocation: text('to_location'),
  referenceType: text('reference_type'),                // PO, WorkOrder, Adjustment, Manual
  referenceId: text('reference_id'),                    // ID of related record
  costPerUnit: numeric('cost_per_unit', { precision: 12, scale: 2 }),
  totalCost: numeric('total_cost', { precision: 12, scale: 2 }),
  notes: text('notes'),
  performedBy: text('performed_by').notNull(),
  metadata: jsonb('metadata'),
  transactionDate: timestamp('transaction_date').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

### Table: `inventory_balances`
**File:** `server/schema.ts` (Line 3296)

```typescript
export const inventoryBalances = pgTable('inventory_balances', {
  id: serial('id').primaryKey(),
  agPartNumber: text('ag_part_number')
    .references(() => inventoryItems.agPartNumber, { onDelete: 'cascade' }).notNull(),
  locationId: text('location_id').notNull(),
  quantityOnHand: integer('quantity_on_hand').notNull().default(0),
  quantityAllocated: integer('quantity_allocated').notNull().default(0),
  quantityAvailable: integer('quantity_available').notNull().default(0),
  reorderPoint: integer('reorder_point').default(0),
  lastCountedAt: timestamp('last_counted_at'),
});
```

### Table: `material_lot_transactions` (AS9100 Material Audit Trail)
**File:** `server/schema.ts` (Line 4597)

```typescript
export const materialLotTransactions = pgTable('material_lot_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  materialLotId: uuid('material_lot_id')
    .references(() => materialLots.id, { onDelete: 'cascade' }).notNull(),
  internalControlNumber: text('internal_control_number').notNull(),
  transactionType: text('transaction_type').notNull(),
    // RECEIVE | MOVE | ISSUE | ADJUST | SCRAP | RETURN | SPLIT | OUT_START | OUT_END | ACCEPT | REJECT | QUARANTINE
  qtyBefore: numeric('qty_before'),
  qtyChange: numeric('qty_change'),
  qtyAfter: numeric('qty_after'),
  fromLocation: text('from_location'),
  toLocation: text('to_location'),
  referenceType: text('reference_type'),   // TRAVELER | WORK_ORDER | ADJUSTMENT | SCRAP_REPORT
  referenceId: text('reference_id'),
  performedBy: text('performed_by').notNull(),
  wasOverride: boolean('was_override').default(false),
  overrideApprovedBy: text('override_approved_by'),
  overrideReason: text('override_reason'),
});
```

### Assessment:
- **Two-tier transaction system:** General inventory (`inventory_transactions`) and lot-level material traceability (`material_lot_transactions`)
- Both are **immutable append-only audit trails** — transactions are never updated or deleted
- `inventory_transactions` links to `inventory_items` via proper FK on `agPartNumber`
- `material_lot_transactions` links to `material_lots` via proper FK
- Cross-references via `referenceType`/`referenceId` are **soft** (text-based, no FK constraints)
- **Location tracking** is present: `fromLocation`/`toLocation` with department mapping (`DEPARTMENT_LOCATION_MAP`)
- **Cost tracking** is captured on general transactions (`costPerUnit`, `totalCost`)

---

## PHASE 6 — MATERIAL CONSUMPTION

### No Dedicated `production_order_materials` Table Exists

Material consumption is handled through two mechanisms:

### Mechanism 1: Traveler Material Consumption (P2 — AS9100)

**Table: `traveler_material_consumption`** — File: `server/schema.ts` (Line 4643)

```typescript
export const travelerMaterialConsumption = pgTable('traveler_material_consumption', {
  id: uuid('id').defaultRandom().primaryKey(),
  travelerId: uuid('traveler_id').notNull(),           // Soft reference (no FK in Drizzle)
  travelerStepId: uuid('traveler_step_id').notNull(),  // Soft reference (no FK in Drizzle)
  travelerTaskId: uuid('traveler_task_id'),
  materialLotId: uuid('material_lot_id')
    .references(() => materialLots.id).notNull(),       // Real FK
  internalControlNumber: text('internal_control_number').notNull(),
  materialPartNumber: text('material_part_number').notNull(),
  materialName: text('material_name').notNull(),
  qtyUsed: numeric('qty_used').notNull(),
  unitOfMeasure: text('unit_of_measure').notNull(),
  validationStatus: text('validation_status').notNull(), // VALID | OVERRIDE | WARNING
  validationDetails: jsonb('validation_details'),
  scannedBy: text('scanned_by').notNull(),
  scannedAt: timestamp('scanned_at').defaultNow(),
  wasOverride: boolean('was_override').default(false),
  overrideApprovedBy: text('override_approved_by'),
  overrideReason: text('override_reason'),
});
```

**Flow:** Technician scans material ICN → system validates lot status → records consumption against traveler step → decrements `material_lots.remainingQty` → creates `material_lot_transactions` audit entry

### Mechanism 2: Manufacturing Queue Inline Traceability (P1/P2 Hybrid)

The `manufacturing_queue` table stores inline traceability fields:
- `fabricLot`, `fabricBatch`, `fabricRoll`, `materialDetails`
- No FK to `material_lots` — these are denormalized text fields

### Mechanism 3: Cutting Table Consumption

**Table: `cutting_packet_bom_cuts`** — tracks actual `square_meters_used` from specific fabric rolls
- Links to `cutting_packet_bom_parts` and `fabric_inventory_id`

### Assessment:
- **BOM materials are NOT formally copied into production orders as a material requirements list**
- P2 production orders reference `bomDefinitionId` and `bomItemId` to calculate quantities, but the actual material line items are consumed via the Traveler system at execution time
- P1 production does not have formal material consumption tracking
- **Missing:** A `production_order_materials` table that pre-populates expected materials from the BOM when a production order is created. This would enable:
  - Material availability checking before production starts
  - Planned vs actual consumption variance analysis
  - MRP planned order material reservations

---

## PHASE 7 — PURCHASE ORDER INTEGRATION

### Vendor Purchase Orders (Supply-Side)

**Table: `vendor_pos`** — File: `server/schema.ts` (Line 3399)
- `vendorId` → `vendors.id` — **real FK**
- Revision tracking: `revisionNumber`, `parentPoId`, `isCurrentRevision`

**Table: `vendor_po_items`** — File: `server/schema.ts` (Line 3433)
```typescript
agPartNumber: text('ag_part_number')
  .references(() => inventoryItems.agPartNumber),  // Real FK (nullable for ad-hoc items)
```
- `agPartNumber` → `inventory_items.agPartNumber` — **real FK**
- Supports dual unit tracking: purchase units and vendor units with `conversionFactor`
- Tracks `receivedQuantity` and `receivedDate`

### Customer Purchase Orders (P1)

**Table: `purchase_orders`** — File: `server/schema.ts` (Line 4201)
**Table: `purchase_order_items`** — File: `server/schema.ts` (Line 4216)
- `stockModelId` (text) — **soft reference** to `stock_models`
- `itemId` (text) — **soft reference** (no FK)

### Customer Purchase Orders (P2)

**Table: `p2_purchase_orders`** — File: `server/schema.ts` (Line 4284)
**Table: `p2_purchase_order_items`** — File: `server/schema.ts` (Line 4324)
- `partNumber` (text) — **soft reference** (no FK to `inventory_items`)
- `partName` (text) — denormalized display name

### Assessment:
- **Vendor procurement is properly linked** to `inventory_items` via FK on `agPartNumber`
- Customer-facing POs (both P1 and P2) use loose text references without FK constraints
- Vendor PO → inventory receipt link exists via `inventory_transactions.referenceType = 'PO'` (soft) and `material_lots.purchaseOrderNumber` (text-based, no FK)

---

## PHASE 8 — TRACEABILITY

### Full Chain Analysis:

```
Purchase Order → Inventory Receipt → Production Consumption → Finished Item → Sales Shipment
```

### Link 1: Purchase Order → Inventory Receipt

| From | To | Mechanism | Integrity |
|------|-----|-----------|-----------|
| `vendor_po_items` | `inventory_transactions` | `referenceType='PO'`, `referenceId=poNumber` | **Soft** (text match) |
| `vendor_po_items` | `material_lots` | `purchaseOrderNumber` (text) | **Soft** (no FK) |
| `vendor_po_items` | `inventory_balances` | Via `inventory_transactions` processing | **Derived** |

**Status:** Link exists but relies on text-based matching. No hard FK from receipt to PO.

### Link 2: Inventory Receipt → Production Consumption

| From | To | Mechanism | Integrity |
|------|-----|-----------|-----------|
| `material_lots` | `traveler_material_consumption` | `materialLotId` FK | **Strong** (UUID FK) |
| `material_lots` | `material_lot_transactions` | `materialLotId` FK | **Strong** (UUID FK) |

**Status:** **Strongest link in the chain.** Full lot-level traceability with ICN scanning, validation status, and override tracking. AS9100 compliant.

### Link 3: Production Consumption → Finished Item Inventory

| From | To | Mechanism | Integrity |
|------|-----|-----------|-----------|
| `traveler_material_consumption` → `travelers` | Finished goods | Via traveler status = 'COMPLETED' | **Loose** |
| `production_orders` | `inventory_balances` | No direct link | **Missing** |

**Status:** **Weakest link.** There is no formal "receipt of finished goods" transaction. When production completes:
- `production_orders.productionStatus` changes to 'SHIPPED'
- `all_orders.currentDepartment` progresses to 'Shipping'
- But no `inventory_transaction` of type 'PRODUCTION_RECEIPT' is created for the finished item
- No `inventory_balance` entry is created for the completed assembly/product

### Link 4: Finished Item → Sales Shipment

| From | To | Mechanism | Integrity |
|------|-----|-----------|-----------|
| `shipment_records` | `shipment_items` | `shipmentId` FK | **Strong** (P1) |
| `shipment_items` | `purchase_order_items` | `poItemId` FK | **Strong** (P1) |
| `shipment_items` | Production order | `orderId` text (no FK) | **Soft** |
| `all_orders` | Shipment | `shippingCompletedAt`, tracking fields | **Soft** (status-based) |
| `p2_packing_slips` | `p2_serialized_items` | Line item references | **Functional** (P2 only) |

**Shipment tables exist:** `shipment_records` (File: `server/schema.ts`, Line 6615) tracks carrier, tracking number, package details. `shipment_items` (Line 6665) links shipments to PO items via real FK. However, shipment items reference production orders by `orderId` text (no FK), and there is still no inventory transaction created upon shipment.

**Status:** P1 has structured shipment records with FK to PO items. P2 has packing slips and serialized items. Both lack a formal inventory deduction transaction at shipment time.

### Traceability Chain Summary:

```
vendor_po_items ──(text)──→ material_lots ──(FK)──→ traveler_material_consumption
                                                          │
                                                    (loose link)
                                                          │
                              production_orders ←── (no formal receipt) ──→ all_orders
                                                                              │
                                                                        (text orderId)
                                                                              │
                                                                      shipment_items ──(FK)──→ shipment_records
                                                                           │
                                                                      (FK to purchase_order_items)
```

### Missing Traceability Links:
1. **No FK from `material_lots` to `vendor_pos`** — PO reference is text-based
2. **No finished goods receipt transaction** — production completion doesn't create an inventory receipt
3. **`shipment_items.orderId` is text-based** — no FK to production orders or all_orders
4. **No inventory deduction at shipment** — shipping doesn't create an inventory consumption transaction
5. **P1 has no lot-level consumption tracking** — only department timestamps

---

## PHASE 9 — PRODUCTION LINE SUPPORT

### How P1 vs P2 Are Separated:

Production lines are separated through **all three mechanisms**: table columns, separate tables, and hardcoded logic.

### 1. Separate Tables (Strongest Separation)

| Domain | P1 Table | P2 Table |
|--------|----------|----------|
| Customer POs | `purchase_orders` / `purchase_order_items` | `p2_purchase_orders` / `p2_purchase_order_items` |
| Production Orders | `production_orders` | `p2_production_orders` |
| Customers | (inline on orders) | `p2_customers` / `p2_customer_contacts` |
| Shipment Docs | (inline on `all_orders`) | `p2_packing_slips` / `p2_lot_numbers` |
| Serial Numbers | (none) | `p2_serialized_items` |
| Test Reports | (none) | `p2_test_reports` |

### 2. Table Column Flags (Shared Tables)

**`inventory_items`:**
- `utilizedInPL1` (boolean) — part is used in Stocks production
- `utilizedInPL2` (boolean) — part is used in Aerospace production
- `traceabilityRequired` (boolean) — typically true for P2 items
- `traceabilityFields` (jsonb) — configures which fields are required per P2 item

**`cutting_packet_boms`:**
- `isP2` (boolean) — determines P2-specific label generation

**`manufacturing_queue`:**
- `vendorPoId` / `vendorPoItemId` — routes to P1/vendor PO demand
- `p2PoId` / `p2PoItemId` — routes to P2 demand

### 3. Hardcoded Logic (Application Layer)

**Barcode Prefixes:**
- `P1-` prefix for P1 production items
- `P2-` prefix for P2 production items
- Checked in QC Manager and inventory routes

**Department Routing:**
- P1: Fixed sequence — P1 Production Queue → Layup → CNC → Finish → Gunsmith → Paint → QC → Shipping
- P2: Configurable via `part_routings.departmentSequence` — flexible per-item routing

**UI Pages:**
- P1: Standard order entry, stock model management
- P2: Dedicated pages (`P2ProductionQueuePage`, `P2SerializedItemScheduler`, etc.)

### Assessment:
- Production line support is **functional but fragmented**
- P1 and P2 share `inventory_items` and `manufacturing_queue` (good)
- But have completely separate PO, production order, and shipping tables (duplication)
- A unified `production_line` column on a single production orders table would be cleaner than parallel table structures

---

## PHASE 10 — GAP ANALYSIS

### Comparison Against Expected Manufacturing Core:

| Component | Expected | Current State | Gap |
|-----------|----------|--------------|-----|
| **Item Master** | Single unified table | `inventory_items` (parts) + `stock_models` (products) — split | **Role flags and price field missing** |
| **Bill of Materials** | Single BOM with FK to items | 3 parallel systems; only robust BOM has real FKs | **Legacy BOM uses free-text references** |
| **Production Orders** | FK to item master, status, qty tracking | Exists for both P1/P2 but uses soft text references to items | **No FK to inventory_items** |
| **Production Operations** | Step-level operations within orders | Traveler system (P2 only) — very capable | **P1 lacks operation-level tracking** |
| **Inventory Transactions** | Immutable audit trail with FK | Two-tier system (general + lot-level) — well designed | **Cross-references are text-based, no FK** |
| **Purchase Orders** | FK to item master | Vendor POs have real FK; customer POs do not | **Customer PO items lack FK to items** |

### Critical Architectural Weaknesses:

1. **No finished goods receipt:** Production completion doesn't create an inventory transaction or balance entry for the manufactured item
2. **No production order material requirements:** BOM materials are not pre-populated on production orders; consumption is only tracked at execution time (P2) or not at all (P1)
3. **Soft references everywhere:** Most cross-system references (production → items, POs → items, invoices → items) are text-based without FK constraints
4. **Dual BOM systems:** Legacy `bom_definitions`/`bom_items` coexist with robust `boms`/`bom_revisions`/`bom_lines`; no clear deprecation path
5. **P1/P2 table duplication:** Separate production order and PO tables for each production line creates maintenance burden and prevents unified reporting

---

## PHASE 11 — MANUFACTURING MATURITY SCORE

| Category | Score | Rating | Justification |
|----------|-------|--------|--------------|
| **Item Master** | 2 | Functional | `inventory_items` is comprehensive for parts/materials. Missing: unified product/item concept, role flags, selling price. |
| **BOM** | 1.5 | Partial-Functional | Robust BOM schema has revision control and FK integrity. However, the recursive CTE explosion query (`server/src/db/queries/bom.ts`) references stale columns/tables and is likely non-functional. Legacy BOM uses free-text references. |
| **Production Orders** | 1 | Partial | Tables exist for P1 and P2 but use soft references to items. No material requirements pre-population. Separate tables per production line. |
| **Operations** | 2 | Functional | Traveler system (P2) is sophisticated — routing templates, step/task hierarchy, data capture, signatures. P1 uses simpler timestamp-based tracking. |
| **Inventory Traceability** | 2 | Functional | Two-tier transaction system with lot-level traceability. Missing: finished goods receipt, some cross-references are text-based. |
| **Purchasing Integration** | 2 | Functional | Vendor POs properly linked to inventory_items via FK. Customer POs use soft references. Dual-unit support is mature. |

### Overall Manufacturing Maturity: **10.5/18 (58%)**

**Interpretation:**
- The system has most manufacturing data structures in place
- The P2/Aerospace traceability chain (material lots → travelers → consumption) is the most mature area
- The primary gaps are: unified item master, FK constraint hardening, finished goods receipt, and P1 operation-level tracking
- The system is functional for current operations but needs structural improvements before adding Sales Orders and Invoices

---

## PHASE 12 — RECOMMENDED IMPROVEMENTS

### Missing Tables:

| Table | Purpose | Priority |
|-------|---------|----------|
| `production_order_materials` | Pre-populate BOM materials as planned requirements on production orders | HIGH |
| *(none — extend `inventory_items`)* | Unified Item Master with role flags and pricing | HIGH |

### Missing Relationships (FK Constraints Needed):

| From Table | Column | Should Reference | Priority |
|-----------|--------|-----------------|----------|
| `production_orders` | `itemId` | `inventory_items.agPartNumber` | HIGH |
| `p2_production_orders` | `bomDefinitionId` | `bom_definitions.id` | MEDIUM |
| `p2_production_orders` | `bomItemId` | `bom_items.id` | MEDIUM |
| `all_orders` | `modelId` | `stock_models.id` (then migrate to `inventory_items`) | MEDIUM |
| `material_lots` | `inventoryItemId` | `inventory_items.id` | HIGH |
| `part_routings` | `inventoryItemId` | `inventory_items.id` (fix type: text → integer) | MEDIUM |
| `travelers` | `inventoryItemId` | `inventory_items.id` (fix type: varchar → integer) | MEDIUM |
| `quote_line_items` | `inventoryItemId` | `inventory_items.id` | MEDIUM |
| `ar_invoice_lines` | `inventoryItemId` | `inventory_items.id` (fix type: text → integer) | HIGH |
| `purchase_order_items` | `itemId` | `inventory_items.agPartNumber` | MEDIUM |
| `p2_purchase_order_items` | `partNumber` | `inventory_items.agPartNumber` | MEDIUM |

### Schema Improvements:

1. **Add to `inventory_items`:**
   - `can_purchase` BOOLEAN DEFAULT FALSE
   - `can_sell` BOOLEAN DEFAULT FALSE
   - `can_manufacture` BOOLEAN DEFAULT FALSE
   - `has_bom` BOOLEAN DEFAULT FALSE
   - `inventory_tracked` BOOLEAN DEFAULT TRUE
   - `default_price` REAL (from `stock_models.price`)
   - `display_name` TEXT (from `stock_models.displayName`)
   - `uom` TEXT DEFAULT 'EA' (standardized unit of measure)
   - `item_category` TEXT (RAW_MATERIAL, COMPONENT, SUBASSEMBLY, FINISHED_GOOD, SERVICE)

2. **Create `production_order_materials`:**
   ```
   production_order_materials
   ├── id (serial PK)
   ├── production_order_id (FK)
   ├── inventory_item_id (FK → inventory_items.id)
   ├── ag_part_number (FK → inventory_items.ag_part_number)
   ├── qty_required (numeric)
   ├── qty_consumed (numeric, default 0)
   ├── uom (text)
   ├── bom_line_id (FK → bom_lines, nullable)
   └── status (PENDING, ALLOCATED, CONSUMED)
   ```

3. **Add finished goods receipt transaction type:**
   - Add `PRODUCTION_RECEIPT` to `inventory_transactions.transactionType` allowed values
   - When production order completes → create inventory transaction for manufactured item
   - Update `inventory_balances` for the finished item

### Architecture Improvements for P1 and P2:

1. **Unify production order tables:**
   - Merge `production_orders` and `p2_production_orders` into a single table with a `production_line` column
   - Or add a common base with shared fields and per-line extensions

2. **Standardize on robust BOM:**
   - Migrate all `bom_definitions`/`bom_items` data to `boms`/`bom_revisions`/`bom_lines`
   - Add labor tracking to `bom_lines` (currently only in legacy `bom_items`)

3. **Extend Traveler system to P1:**
   - P1 currently uses timestamp-based department tracking
   - Traveler system would provide operation-level visibility and material consumption for P1

4. **Harden PO → Receipt traceability:**
   - Add `vendorPoItemId` FK to `material_lots` (currently uses text-based `purchaseOrderNumber`)
   - This completes the PO → receipt → consumption chain with real FKs

---

## PHASE 13 — FINAL REPORT

### 1. Current Manufacturing Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         EPOCH ERP                                   │
│                                                                     │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐   │
│  │ stock_models │     │ inventory_  │     │ vendors             │   │
│  │ (Products)   │     │ items       │◄────│                     │   │
│  │ No FK link ──╳──── │ (Parts/Mat) │     └─────────────────────┘   │
│  └──────┬──────┘     └──────┬──────┘                                │
│         │                   │                                        │
│    ┌────▼────┐         ┌────▼──────────────────┐                    │
│    │all_orders│         │ boms (Robust)         │                    │
│    │(P1 Prod) │         │ bom_revisions         │                    │
│    └─────────┘         │ bom_lines             │                    │
│                        └───────────────────────┘                    │
│    ┌───────────────┐   ┌───────────────────────┐                    │
│    │bom_definitions│   │ part_routings          │                    │
│    │bom_items      │   │   └─ travelers         │                    │
│    │(Legacy BOM)   │   │       └─ steps          │                    │
│    └───────────────┘   │         └─ tasks        │                    │
│                        └───────────────────────┘                    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    INVENTORY LAYER                           │    │
│  │  inventory_balances ◄── inventory_transactions              │    │
│  │  material_lots ◄── material_lot_transactions                │    │
│  │  material_lots ◄── traveler_material_consumption            │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    PURCHASING LAYER                          │    │
│  │  vendor_pos ──► vendor_po_items ──► inventory_items (FK)    │    │
│  │  purchase_orders ──► purchase_order_items (soft ref)        │    │
│  │  p2_purchase_orders ──► p2_purchase_order_items (soft ref)  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    SHIPPING LAYER                            │    │
│  │  shipment_records ──► shipment_items ──► PO items (FK)      │    │
│  │  shipment_items.orderId (soft text ref to production)       │    │
│  │  p2_packing_slips ──► p2_serialized_items (P2 only)        │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### 2. Table Relationships

| Relationship | Type | Integrity |
|-------------|------|-----------|
| `vendor_po_items` → `inventory_items` | FK on `agPartNumber` | **Strong** |
| `boms` → `inventory_items` | FK on `agPartNumber` | **Strong** |
| `bom_lines` → `inventory_items` | FK on `agPartNumber` | **Strong** |
| `inventory_balances` → `inventory_items` | FK on `agPartNumber` | **Strong** |
| `inventory_transactions` → `inventory_items` | FK on `agPartNumber` | **Strong** |
| `manufacturing_queue` → `inventory_items` | FK on `id` | **Strong** |
| `material_lot_transactions` → `material_lots` | FK on `id` | **Strong** |
| `traveler_material_consumption` → `material_lots` | FK on `id` | **Strong** |
| `traveler_steps` → `travelers` | FK on `id` | **Strong** |
| `traveler_tasks` → `traveler_steps` | FK on `id` | **Strong** |
| `production_orders` → `inventory_items` | Text `itemId` | **Soft** |
| `p2_production_orders` → `bom_definitions` | UUID, no FK | **Soft** |
| `all_orders` → `stock_models` | Text `modelId` | **Soft** |
| `material_lots` → `inventory_items` | Integer, no FK | **Soft** |
| `travelers` → `inventory_items` | Varchar, no FK | **Soft** |
| `quote_line_items` → `inventory_items` | Integer, no FK | **Soft** |
| `ar_invoice_lines` → `inventory_items` | Text, no FK | **Soft** |

### 3. Production Flow

**P1 (Stocks):**
```
Customer PO → all_orders → Department Progression (timestamps) → Shipping
                  │
                  └─ model_id → stock_models (soft)
```

**P2 (Aerospace):**
```
Customer PO → p2_production_orders → Manufacturing Queue → Traveler Execution → Shipping
                  │                        │                      │
                  └─ bomDefinitionId       └─ inventoryItemId     └─ material consumption
                     (soft)                   (FK)                    (FK to material_lots)
```

### 4. Inventory Traceability

| Chain Segment | P1 Support | P2 Support |
|---------------|-----------|-----------|
| PO → Receipt | Text-based | Text-based + material lots |
| Receipt → Lot Control | Not used | Full (ICN, lot#, expiry, qty) |
| Lot → Production Consumption | Not tracked | Full (traveler consumption) |
| Production → Finished Goods | Status-based only | Status-based only |
| Finished Goods → Shipment | `shipment_records`/`shipment_items` (FK to PO items) | Packing slips + serial numbers |

### 5. P1 vs P2 Structure

| Aspect | P1 (Stocks) | P2 (Aerospace) |
|--------|-------------|----------------|
| Item Definition | `stock_models` | `inventory_items` (type=Manufactured) |
| BOM System | Legacy (`bom_definitions`/`bom_items`) | Robust (`boms`/`bom_revisions`/`bom_lines`) |
| Production Tracking | Department timestamps on `all_orders` | Traveler system (steps/tasks/fields) |
| Material Consumption | Not formally tracked | Full lot-level via travelers |
| Traceability | Minimal | AS9100 compliant |
| Operations | Fixed department sequence | Configurable routing per part |
| Serialization | None | `p2_serialized_items` |
| Customer POs | `purchase_orders` (generic) | `p2_purchase_orders` (dedicated) |

### 6. Missing Components

1. **Unified Item Master** — `stock_models` and `inventory_items` are separate entities with no FK relationship
2. **Production Order Materials** — No table to pre-populate BOM materials as planned requirements
3. **Finished Goods Receipt** — No inventory transaction created when production completes
4. **P1 Material Consumption** — No tracking of material usage during P1 production
5. **P1 Operation-Level Tracking** — Timestamps only; no step/task granularity
6. **Unified Production Orders** — Separate tables for P1 and P2 prevent cross-line reporting

### 7. Risk Areas

| Risk | Severity | Impact |
|------|----------|--------|
| Soft references break silently | HIGH | Data integrity loss when items are renamed/deleted |
| No finished goods receipt | HIGH | Cannot reconcile manufactured inventory; cost variance analysis impossible |
| Legacy BOM free-text references | HIGH | BOM cost roll-ups unreliable; material planning inaccurate |
| Robust BOM recursive query is stale | HIGH | `server/src/db/queries/bom.ts` uses deprecated `parts` table columns; multi-level BOM explosion likely non-functional |
| P1 lacks material consumption tracking | MEDIUM | Cannot trace which materials went into P1 products |
| Duplicate production order tables | MEDIUM | Maintenance burden; unified MRP reporting impossible |
| `ar_invoice_lines` type mismatch | MEDIUM | `inventoryItemId` stored as text instead of integer; FK impossible without type migration |

### 8. Recommended Manufacturing Core

**Target architecture to support Quotes, Sales Orders, and Invoices:**

```
┌──────────────────────────────────────────────────────────┐
│                  UNIFIED ITEM MASTER                     │
│          inventory_items (extended)                       │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ can_purchase | can_sell | can_manufacture | has_bom  │ │
│  │ default_price | item_category | uom                 │ │
│  └─────────────────────────────────────────────────────┘ │
└────────────────────┬─────────────────────────────────────┘
                     │
    ┌────────────────┼────────────────────────┐
    │                │                        │
    ▼                ▼                        ▼
┌────────┐   ┌──────────────┐   ┌────────────────────────┐
│ ROBUST │   │ PRODUCTION   │   │ PURCHASING             │
│ BOM    │   │ ORDERS       │   │ vendor_po_items (FK)   │
│ (FK)   │   │ (unified,    │   │ customer PO items (FK) │
│        │   │  with matl   │   └────────────────────────┘
│        │   │  requirements│
│        │   │  & operations│
└────────┘   └──────┬───────┘
                    │
             ┌──────▼───────┐
             │ INVENTORY    │
             │ transactions │
             │ + balances   │
             │ + lot control│
             └──────┬───────┘
                    │
             ┌──────▼───────┐
             │ SALES        │
             │ quotes (FK)  │
             │ orders (FK)  │
             │ invoices (FK)│
             └──────────────┘
```

**Priority implementation order:**
1. Extend `inventory_items` with role flags and pricing (Item Master unification)
2. Harden all soft references with proper FK constraints
3. Add `production_order_materials` for BOM material pre-population
4. Add `PRODUCTION_RECEIPT` transaction type for finished goods
5. Consolidate legacy BOM onto robust BOM system
6. Unify production order tables with `production_line` column
7. Extend Traveler system to P1 (optional but recommended)
