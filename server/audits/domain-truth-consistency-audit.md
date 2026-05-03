# EPOCH Domain Truth & Consistency Audit Report

**Date**: March 22, 2026  
**Type**: Read-only forensic analysis — no code changes made  
**Scope**: P1 order state only (`currentDepartment`, `status`, department history). P2 serialized items, financial data, security, and performance are out of scope.  
**Files analyzed**:
- `server/src/routes/admin.ts` (DTI handler, Flight Recorder handler)
- `server/src/routes/audit.ts` (Order Timeline handler, audit service wrapper)
- `server/src/services/auditService.ts` (query implementations)
- `server/storage.ts` (`getOrdersByDepartment`, `getFinalizedOrderById`, `getProductionOrderByOrderId`, `getOrderDraft`)
- `server/src/routes/orders.ts` (Locate Order handler)
- `client/src/pages/DomainTruthInspector.tsx`
- `client/src/pages/OrderTimeline.tsx`
- `client/src/pages/LocateOrder.tsx`
- `client/src/components/p2/P2ProductionQueue.tsx`

---

## Section 1 — Sources of Truth Map

| Concept | Authoritative Table(s) | Secondary / Mirror Tables | Views That Consume It |
|---|---|---|---|
| `currentDepartment` (P1 orders) | `all_orders.current_department` | `production_orders.current_department`, `orders.current_department` (legacy) | DTI, Department Queues, Locate Order |
| `status` (P1 orders) | `all_orders.status` | `production_orders.production_status` | DTI, Locate Order |
| `currentDepartment` (P2 items) | `p2_serialized_items.current_department` | — | P2ProductionQueue only |
| Order existence / identity | `all_orders` (primary), `production_orders` (P1 PO lines), `order_drafts` (pre-finalization) | `orders` (legacy mirror) | DTI, Locate Order |
| Department history (structured) | `order_department_transitions` (one row per entry/exit, written by `auditService.recordDepartmentEntry`) | `all_orders.department_history` (JSONB array, legacy), `production_orders.department_history` (JSONB array) | DTI Flight Recorder, Order Timeline |
| Scrap events | `order_scrap_cycles` | `all_orders.scrap_date`, `all_orders.scrap_reason` | Order Timeline, DTI Flight Recorder |
| General field-change history | `audit_events` (entity_type + entity_id) | `admin_audit_log` (order_id) | DTI, Order Timeline |
| Badge scan history | `badge_scan_audit_log` | — | DTI Flight Recorder only |
| Kickbacks / quality issues | `kickbacks` | — | DTI only |
| Payments | `payments` | — | DTI only |
| Queue eligibility | Computed at query time from `all_orders` fields (`status`, `scrap_date`, `is_cancelled`, `current_department`) | — | DTI queue evaluation panel |

**Key finding**: No single table is the undisputed authority for `currentDepartment` across all order types. `all_orders`, `production_orders`, and `orders` (legacy) each independently hold a copy of this field with no enforced synchronization between them.

---

## Section 2 — DTI Analysis

**Backend handler**: `GET /api/admin/domain-truth/order/:orderId`  
**Source file**: `server/src/routes/admin.ts`, lines 68–501

### 2.1 Three-tier orderId resolution

**Tier 1 — `all_orders`** (primary):
```sql
SELECT ao.order_id, ao.fb_order_number, ao.status, ao.current_department, ...
FROM all_orders ao
LEFT JOIN customers c ON ao.customer_id = CAST(c.id AS TEXT)
WHERE ao.order_id = $1 OR ao.fb_order_number = $1
LIMIT 1
```
- This is the only tier that resolves `fb_order_number` aliases.
- `resolvedId` is set to `order.order_id` from the returned row — so the canonical ID is established here.

**Tier 2 — `production_orders`** (fallback when Tier 1 returns nothing):
```sql
SELECT id, order_id, production_status, current_department, department_history, created_at
FROM production_orders WHERE order_id = $1 LIMIT 1
```
- Query uses `resolvedId` (which at this point equals the raw input `orderId`, since no alias resolution occurred).
- A synthetic `all_orders`-shaped object is constructed with many `null` fields: `customer_id`, `due_date`, `model_id`, `order_source`, `features`, `shipped_date`, `is_paid`, `urgency`, etc.
- `sourceType` is set to `"PRODUCTION_ORDER"`.

**Tier 3 — `order_drafts`** (fallback when Tiers 1 & 2 both empty):
```sql
SELECT order_id, status, created_at FROM order_drafts WHERE order_id = $1 LIMIT 1
```
- Uses the original raw input `orderId` (no alias resolution here either).
- Even more fields are `null`: no `current_department`, no features, no customer info.
- `sourceType` is set to `"DRAFT"`.

### 2.2 Cross-table comparison queries (run in parallel with Tier 1)

All queries below use `resolvedId`:
| Table | Query purpose | Warning code generated |
|---|---|---|
| `orders` (legacy) | Check `current_department` match | `LEGACY_DEPARTMENT_MISMATCH`, `LEGACY_TABLE_MISSING` |
| `production_orders` | Check `current_department` match | `PRODUCTION_ORDER_DEPARTMENT_MISMATCH` |
| `payments` | Retrieve payment records | (no warning generated from payments alone) |
| `kickbacks` | Detect open quality issues | `OPEN_KICKBACKS` |
| `admin_audit_log` | Retrieve field-change history | (informational only) |
| `audit_events` | Retrieve structured audit events | (informational only) |
| `order_department_transitions` | Retrieve structured dept history | (informational only) |

### 2.3 Queue eligibility logic

Evaluated from the resolved `order` object (lines 254–308 of `admin.ts`):

```
visible = hasDept && statusOk && scrapDateNull && isCancelledFalse

where:
  hasDept        = !!order.current_department
  statusOk       = status NOT IN ['SCRAPPED', 'CANCELLED', 'FULFILLED']
  scrapDateNull  = order.scrap_date === null
  isCancelledFalse = order.is_cancelled !== true
```

### 2.4 Coverage gaps

1. **`badge_scan_audit_log` not in main DTI response**: Badge scans that drive department transitions are only visible via the separate Flight Recorder endpoint (`/api/admin/order-flight-recorder/:orderId`). The main DTI `auditEvents` array does not include them.

2. **`order_scrap_cycles` not in main DTI response**: Structured scrap cycle records are only in the Flight Recorder and Order Timeline responses. DTI main response shows `scrap_date` / `scrap_reason` from `all_orders` but not the richer `order_scrap_cycles` table.

3. **`audit_events` not filtered by `entity_type`**: The query is `WHERE entity_id = $1`. If two different entity types coincidentally share the same ID string (e.g., a `p2_order` and a `p1_order`), their events mix together in the DTI results.

4. **Tier 3 draft fallback uses raw `orderId`**: Drafts have no fb_order_number, so this is rarely a problem in practice, but the asymmetry means the three-tier resolution is not uniformly alias-aware.

---

## Section 3 — Cross-View Consistency Check

### Representative order state for simulation

Assume order `FA001234` exists with:
- `all_orders.order_id = "FA001234"`, `fb_order_number = "FB-9999"`, `current_department = "CNC"`, `status = "FINALIZED"`
- `production_orders.order_id = "FA001234"`, `current_department = "Barcode"`, `production_status = "IN_PROGRESS"`
- `audit_events` rows with `entity_id = "FA001234"`
- `order_department_transitions` rows with `entity_id = "FA001234"`

| Field | DTI | Order Timeline | Department Queues (P1) | Locate Order |
|---|---|---|---|---|
| `currentDepartment` shown | `"CNC"` (from `all_orders`) + warning: `PRODUCTION_ORDER_DEPARTMENT_MISMATCH ("Barcode")` | Not surfaced as a field — only transition events are shown | `"CNC"` slot (from `all_orders`) AND `"Barcode"` slot (from `production_orders`): **order appears twice** | `"CNC"` (from `all_orders.current_department`) |
| `status` shown | `"FINALIZED"` (from `all_orders.status`) | Not surfaced as a header field | `"FINALIZED"` for `all_orders` entry; `"IN_PROGRESS"` for `production_orders` entry — **different values in same view** | `"FINALIZED"` (from `all_orders.status`) |
| History shown | `audit_events` + `order_department_transitions` + `admin_audit_log` (in DTI response; Flight Recorder adds badge scans) | `audit_events` + `order_department_transitions` + `order_scrap_cycles` (unified, chronological) | Not shown | Not shown |
| Source label | `sourceType = "SO"` | N/A | Unlabeled — mixed from two tables | `sourceType = "SO"` |
| Alias search "FB-9999" | ✅ Resolves correctly | ❌ Must receive `"FA001234"` directly | ❌ Does not resolve `fb_order_number` | ❌ `getFinalizedOrderById` only matches `orderId`, not `fb_order_number` |

**Divergence count**: 4 out of 5 comparison dimensions show a different value or behavior between at least two views.

---

## Section 4 — Conflict Scenarios

### Scenario A: Dual-department appearance in queue
**Condition**: `all_orders.current_department = "CNC"` and `production_orders.current_department = "Barcode"` for the same `order_id`.

**Backend trace**: `storage.getOrdersByDepartment("CNC")` queries `all_orders WHERE current_department = 'CNC'` and also `production_orders WHERE current_department = 'CNC'`. Same method called for "Barcode" produces the production_orders row.

**Result**: The order appears in both the CNC column and the Barcode column of the Department Queues view simultaneously. Two operators may work on what they believe is "their" order.

**DTI behavior**: Detects and surfaces `PRODUCTION_ORDER_DEPARTMENT_MISMATCH` warning. Queue itself does not detect or suppress the duplication.

---

### Scenario B: Status contradiction between sources
**Condition**: `all_orders.status = "FINALIZED"` and `production_orders.production_status = "SCRAPPED"`.

**Result**:
- DTI shows `"FINALIZED"` (from `all_orders`, the primary source).
- Department Queues: `all_orders` entry appears (FINALIZED is not excluded by the queue filter `status NOT IN ('SCRAPPED', 'CANCELLED')`). The production_orders entry is also included — `getOrdersByDepartment` applies **no status filter** to the `production_orders` sub-query.
- Locate Order shows `"FINALIZED"` (hits `all_orders` first).

---

### Scenario C: fb_order_number alias lookup divergence
**Condition**: User searches for `"FB-9999"` (an `fb_order_number`) across the four views.

**DTI behavior**: `WHERE order_id = 'FB-9999' OR fb_order_number = 'FB-9999'` — finds order, resolves to `FA001234`. ✅

**Locate Order behavior**: `storage.getFinalizedOrderById('FB-9999')` → `db.select().from(allOrders).where(eq(allOrders.orderId, 'FB-9999'))` — returns nothing. Falls back to `production_orders` (searches `orderId = 'FB-9999'`), then `order_drafts`. **Returns "not found"** even though DTI would find it. ❌

**Order Timeline behavior**: The URL must contain the entity ID. There is no search box or alias resolution — if the user navigates to `/order-timeline/p1_order/FB-9999`, `auditService.getAuditHistory('p1_order', 'FB-9999')` queries `WHERE entity_type = 'p1_order' AND entity_id = 'FB-9999'` — finds nothing, because events were logged under `FA001234`. ❌

---

### Scenario D: Order exists only in `production_orders`
**Condition**: A P1 PO line was created in `production_orders` but the order was never promoted/merged into `all_orders`.

**DTI behavior**: Tier 1 returns nothing; falls back to Tier 2. Constructs synthetic record. Many fields are `null`. `sourceType = "PRODUCTION_ORDER"`. Routing flags cannot be evaluated (no `model_id`, no `features`). Queue eligibility cannot be fully assessed.

**Locate Order behavior**: Tier 1 (`getFinalizedOrderById`) returns nothing; Tier 2 (`getProductionOrderByOrderId`) finds it. Returns `productionStatus` as `status` and `customerName` as `customer`. ✅ (but field semantics differ from the SO case)

**Order Timeline behavior**: If `audit_events` were written with this order's ID under `entity_type = 'p1_order'`, the timeline works. If events were logged under a different `entity_type` (e.g., during P1 PO generation), they may not appear.

---

### Scenario E: FULFILLED order visible in queue
**Condition**: `all_orders.status = "FULFILLED"` with `current_department = "Shipping"`.

**DTI queue eligibility**: `statusOk = false` (FULFILLED is in `EXCLUDED_STATUSES`). Order marked as **not visible** in queue panel.

**Actual queue behavior** (`getOrdersByDepartment`): Filter is `ne(allOrders.status, 'SCRAPPED'), ne(allOrders.status, 'CANCELLED'), isNull(allOrders.scrapDate)`. FULFILLED is **not excluded**. The order still appears in the Shipping department queue. ❌

---

## Section 5 — Partial Data Issues

| Data present in | Not surfaced by | Description |
|---|---|---|
| `order_department_transitions` | Department Queues | Queue shows only the current `current_department` field. Structured transition timeline (entry/exit times, durations, cycle numbers) is entirely invisible to queue operators. |
| `order_department_transitions` | Locate Order | Locate Order shows `currentDepartment` and `status` but not any history or dwell time. |
| `order_scrap_cycles` | DTI main response | Structured scrap cycle records visible in Order Timeline and DTI Flight Recorder are absent from the main DTI `/domain-truth/order/:orderId` response. |
| `audit_events` | Department Queues | Queue view is entirely unaware of audit history. |
| `admin_audit_log` | Order Timeline | The timeline reads `audit_events` and `order_department_transitions` but does NOT read `admin_audit_log`. Admin field overrides (recorded only in `admin_audit_log`) are invisible in Order Timeline. |
| `badge_scan_audit_log` | DTI main response, Order Timeline | Badge scans that drive department transitions are only surfaced in the DTI Flight Recorder endpoint. They are completely absent from Order Timeline, Department Queues, and Locate Order. |
| `kickbacks` | Order Timeline, Department Queues, Locate Order | Open kickback records are only shown in DTI system warnings. No other view surfaces quality hold information. |
| `payments` | Order Timeline, Department Queues, Locate Order | Payment records only appear in the DTI response. |
| `all_orders.department_history` (JSONB) | DTI Flight Recorder | The Flight Recorder explicitly skips this JSONB column in favor of `order_department_transitions`. For orders predating the transition table (where only the JSONB array was written), department history is silently absent from Flight Recorder. |
| `production_orders.production_status` | DTI `order.status` field | When an order exists in both `all_orders` and `production_orders`, DTI shows `all_orders.status` as the main `status`. The `production_orders.production_status` value is available only in a separate `productionOrder` sub-object in the DTI response — not labeled as a conflict unless `current_department` also differs. |
| `orders` (legacy table) | Order Timeline, Department Queues, Locate Order | The legacy `orders` table is checked only by DTI (for mismatch warnings). It is not queried or surfaced by any other view. |

---

## Section 6 — System Reliability Scores

### Domain Truth Inspector (DTI)

| Dimension | Score | Justification |
|---|---|---|
| **Accuracy** | **4 / 5** | Most comprehensive view in the system. Queries 7+ tables, cross-compares them, and surfaces explicit system warnings for detected mismatches. Main accuracy risk: when `all_orders` is the primary source, `production_orders` fields are secondary and only compared, not merged. For orders that exist only in `production_orders`, many fields are null (customer, due date, model_id, routing flags cannot be evaluated). Badge scan history is missing from the main response. |
| **Consistency** | **3 / 5** | DTI's Flight Recorder (separate endpoint) uses `order_department_transitions` as the primary department history source — consistent with the main DTI `departmentTransitions` field. However, `audit_events` vs. `admin_audit_log` are parallel audit channels that are not unified in the response. Badge scans visible in the Flight Recorder are absent from the main DTI `auditEvents` array. The `LEGACY_TABLE_MISSING` warning is filtered out on the frontend (`warnings.filter(w => w.code !== 'LEGACY_TABLE_MISSING')`), creating a silent suppression. |

### Order Timeline

| Dimension | Score | Justification |
|---|---|---|
| **Accuracy** | **3 / 5** | Reads `audit_events` + `order_department_transitions` + `order_scrap_cycles` and merges them into a unified chronological list. However: (1) `admin_audit_log` is not read, so admin field overrides are missing; (2) `badge_scan_audit_log` is not read, so badge-driven department moves may be missing from the timeline; (3) `audit_events` is queried with both `entity_type` and `entity_id`, so cross-type contamination is avoided, but `entityId` is passed raw from the URL without any fb_order_number alias resolution. |
| **Consistency** | **4 / 5** | The merge logic is deterministic and sorts all sources into a single chronological list with consistent typed `id` prefixes (`audit-*`, `transition-entry-*`, `transition-exit-*`, `scrap-*`, `restart-*`). Category/action labeling is consistent. The main consistency gap is that the data sources are incomplete (missing `admin_audit_log` and badge scans), but what is shown is internally consistent. |

### Department Queues (P1 — `getOrdersByDepartment`)

| Dimension | Score | Justification |
|---|---|---|
| **Accuracy** | **3 / 5** | Reads both `all_orders` and `production_orders` for each department slot. Key accuracy problems: (1) the `production_orders` sub-query applies **no status filter** — scrapped/cancelled production orders remain visible; (2) FULFILLED orders from `all_orders` are not excluded (filter only blocks SCRAPPED and CANCELLED), diverging from the DTI queue eligibility policy; (3) when both tables have the same `order_id` with different `current_department` values, the order appears in two department slots simultaneously. |
| **Consistency** | **3 / 5** | The same query pattern is used for every department, so the method is internally consistent. However, the dual-department appearance of orders (when `all_orders` and `production_orders` disagree) is an undetected inconsistency within a single view invocation. The queue does not flag or suppress duplicate order entries. |

### Locate Order

| Dimension | Score | Justification |
|---|---|---|
| **Accuracy** | **3 / 5** | Correct three-tier fallback sequence (`all_orders` → `production_orders` → `order_drafts`). Returns `currentDepartment` and `status` accurately for orders found in `all_orders`. For production orders, `status` comes from `productionStatus` — a different field name and potentially different value set. For SO orders, `customer` returns `customerId` (not the customer name), while for production orders it returns `customerName` — an inconsistent field contract. |
| **Consistency** | **2 / 5** | Does **not** resolve `fb_order_number` aliases (DTI does). `getFinalizedOrderById` queries `WHERE orderId = $1` only. A user searching by fb_order_number will receive "not found" from Locate Order but "found" from DTI for the same logical order. The `customer` field has different semantics by source type (ID vs. name). Draft orders return `null` for `currentDepartment` regardless of draft state. |

---

## Section 7 — Root Cause Summary

### Root Cause 1: Multiple authoritative sources for the same concept (primary cause)

The system maintains `current_department` independently in at least three tables: `all_orders`, `production_orders`, and `orders` (legacy). There is no single write path that atomically updates all three. A badge scan writes to one table; an admin override writes to another; a background sync may or may not propagate the change. This structural fragmentation is the root cause of `LEGACY_DEPARTMENT_MISMATCH`, `PRODUCTION_ORDER_DEPARTMENT_MISMATCH` warnings in DTI, and the dual-slot problem in Department Queues.

**Evidence**: `admin.ts` lines 421–449 show DTI explicitly checking for mismatches and emitting warnings, demonstrating that the development team is aware of the fragmentation.

### Root Cause 2: Fragile fallback logic with asymmetric ID resolution

Three of the four views implement their own independent fallback chains. DTI resolves `fb_order_number` aliases only in Tier 1 (`all_orders`). Locate Order does not resolve aliases at all. Order Timeline accepts a raw entity ID by URL with no alias resolution. This means the views have different "reachable universes" for the same logical order identity, producing the scenario where a user can find an order in DTI but not in Locate Order using the same input.

**Evidence**: DTI handler line 116: `WHERE ao.order_id = $1 OR ao.fb_order_number = $1`. Locate Order `storage.getFinalizedOrderById` (storage.ts line 16580): `where(eq(allOrders.orderId, orderId))` — no fb_order_number clause.

### Root Cause 3: Parallel audit channels without unification

Three independent audit write paths exist: `audit_events` (structured, service-mediated), `admin_audit_log` (free-form, written by admin override routes), and `badge_scan_audit_log` (badge scanner actions). Each channel has a different table, different column names, and different actor encoding. Only the DTI Flight Recorder consolidates all three. Order Timeline only reads `audit_events`. No view outside the DTI Flight Recorder sees badge scan data. Admin field edits are invisible in Order Timeline.

**Evidence**: `auditService.ts` exclusively writes to `audit_events`. `admin_audit_log` is written by separate admin route handlers (not the audit service). `badge_scan_audit_log` is written by `employeeBadges.ts`.

### Root Cause 4: Incomplete queue eligibility enforcement

The canonical queue eligibility definition (in DTI: excludes SCRAPPED, CANCELLED, FULFILLED) is not mirrored in the actual queue query. `getOrdersByDepartment` excludes SCRAPPED and CANCELLED but not FULFILLED. The `production_orders` sub-query in `getOrdersByDepartment` applies no status filter at all. This policy drift means the live queue can display orders that the domain model considers ineligible, and production orders with any status appear in the queue.

**Evidence**: DTI handler lines 66, 257 (`EXCLUDED_STATUSES = ['SCRAPPED', 'CANCELLED', 'FULFILLED']`). `storage.ts` line 4802–4809 (`getOrdersByDepartment` WHERE clause: `ne(status, 'SCRAPPED'), ne(status, 'CANCELLED'), isNull(scrapDate)` — FULFILLED absent). Lines 4855–4858 (production_orders sub-query: only `WHERE current_department = $1`, no status filter).

### Root Cause 5: JSONB history vs. structured transitions (incomplete migration)

`all_orders.department_history` is a JSONB array written during early production. The system later introduced `order_department_transitions` as a structured replacement. The Flight Recorder explicitly skips the JSONB column in favor of the transitions table (`admin.ts` comment at line 587: "JSONB department_history is NOT used here"). For orders predating the transitions table, the JSONB column holds the only history but is silently ignored by all views. No view reads both sources and merges them.

### Root Cause 6: P2 domain isolation (by design, but creates ambiguity)

`P2ProductionQueue` operates on `p2_serialized_items` — a completely separate entity model from P1's `all_orders`/`production_orders`. The department names in P2 (`Pending Layup`, `Layup`, `Assemble/Disassembly`, `Final QC`) differ from the P1 department flow (`P1 Production Queue`, `Layup/Plugging`, `Barcode`, `CNC`, etc.). This is intentional product segmentation, not a bug. However, any P1 order that originates from a P2 purchase order (via the `PO_RELEASE` source) may exist simultaneously in both domains, and no view currently reconciles cross-domain links.

---

*End of audit report. This document was produced entirely from static code analysis with no queries run against live data. All findings reflect code paths as they exist in the codebase on the audit date.*
