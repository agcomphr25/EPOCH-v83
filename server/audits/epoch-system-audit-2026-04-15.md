# EPOCH ERP — SYSTEM AUDIT REPORT
**vs. Deltek Costpoint**
**Date:** April 15, 2026
**Prepared by:** EPOCH Planning Agent (Senior ERP Systems Architect mode)
**Classification:** Internal — Ownership Review

---

## EXECUTIVE SUMMARY

EPOCH v8 is a custom-built, full-stack manufacturing ERP built for a small-to-mid-size composites manufacturer. It is operationally strong — production workflows, shop-floor tracking, traveler execution, barcode-driven traceability, and P2 serialized item control are all well-implemented. However, EPOCH carries significant structural risk in three areas:

1. **Financial backbone is fragmented.** There is no enforced project-based accounting. Two parallel accounting constructs exist (Cost Accounting module and an Accounting Shadow Layer) that do not share a data model and neither is automatically populated from operations.
2. **Multiple sources of truth exist across critical domains.** The orders domain has four deprecated/transitional fields in active production tables. Two separate customer tables exist with no enforced canonical linkage at the database level.
3. **Compliance readiness is not system-enforced.** Audit trails exist but are domain-specific and inconsistent. There is no unified, immutable event log. No DCAA, FAR, or CMMC controls are structurally present.

EPOCH's strongest competitive position is in **manufacturing operations intelligence**, **AI-native direction** (DONNA, pattern awareness layer), and **custom workflow orchestration**. These advantages are real and should be protected while closing the financial and compliance gaps.

---

## PHASE 1 — DOMAIN INVENTORY

### Domains Identified

| Domain | Source of Truth Table(s) | Key Fields | FK Relationships |
|---|---|---|---|
| **Orders (P1)** | `all_orders` | `order_id`, `status`, `status_id`, `current_department`, `current_department_id`, `customer_id`, `is_paid` | `status_id → order_status_types`, `current_department_id → order_department_types` |
| **Shipping** | `p2_shipping` (P2), `shipment_accounting_snapshots` | tracking, carrier, ship date | Partial — snapshots reference `sales_order_id` loosely |
| **AR / Invoicing** | `ar_invoices`, `ar_invoice_lines`, `ar_payments`, `ar_payment_allocations`, `credit_memos` | `total_amount`, `status`, `due_date`, `balance` | `credit_memo_id → credit_memos`, `invoice_id → ar_invoices` |
| **Customers (P1)** | `customers` | `customer_id` (text PK), balance fields | No FK to orders — `all_orders.customer_id` is plain text |
| **Customers (P2)** | `p2_customers` | `id`, `name`, canonical key | Separate table; mapped to P1 via `customerKey` service |
| **Vendors** | `vendors`, `vendor_scope_items`, `vendor_scope_groups` | name, score, evaluation | `vendor_scope_items → vendors` |
| **Inventory** | `inventory_items`, `inventory_balances` | `ag_part_number`, `quantity_on_hand` | `inventory_balances.ag_part_number` string join (no integer FK) |
| **Production / Manufacturing** | `production_orders`, `travelers`, `traveler_steps`, `part_routings`, `robust_boms` | `order_id`, `current_department`, traveler steps | `production_orders → all_orders` via `order_id` (text match, not FK) |
| **Timekeeping** | `punch_events`, `time_clock_entries`, `work_buckets` | `canonical_id`, `punch_time`, `job_id` | `punch_events.job_id → production_orders.id` (optional) |
| **Projects (P2 Pipeline)** | `projects`, `project_steps`, `project_activity_log` | `project_code`, `status`, `current_stage`, `po_id` | `po_id → p2_purchase_orders`, `project_manager_id → employees` |
| **Quality / Nonconformance** | `nonconformance_records`, `p2_nonconforming_dispositions`, `p2_serialized_items` | `status`, `disposition_type` | `disposition_id → p2_nonconforming_dispositions` |
| **Payments (P1)** | `payments`, `bulk_payment_batches` | `order_id`, `payment_type`, `payment_amount` | `order_id` text match to `all_orders.order_id` |
| **Cost Accounting** | `account_categories`, `accounts`, `monthly_account_entries`, `allocation_rules`, `allocation_results` | account number, category, monthly amount | `accounts → account_categories` (FK enforced) |
| **GL / Journal (Shadow)** | `chart_of_accounts`, `journal_entries`, `journal_lines` | `account_name`, `account_type`, `debit_amount`, `credit_amount` | `journal_lines → chart_of_accounts` (FK), `journal_lines → journal_entries` (FK) |
| **Estimating** | `estimating_rfqs`, `estimating_rfq_parts`, `estimating_bom_lines`, `estimating_pricing_snapshots` | part details, pricing, tooling | Internal FKs within estimating module |
| **Purchase Orders (P2)** | `p2_purchase_orders`, `p2_purchase_order_items` | `po_number`, `status`, `customer_id` | `customer_id → p2_customers` (text FK) |

---

## PHASE 2 — SYSTEM OF TRUTH ANALYSIS

### Domain Truth Map

| Domain | Single Source of Truth? | Duplicate State Fields | DB-Level FK Enforcement | Orphan Records Possible? |
|---|---|---|---|---|
| **Orders** | ⚠️ PARTIAL | YES — `status` (text, marked legacy) + `status_id` (FK); `current_department` (text) + `current_department_id` (FK); `priority_score` (deprecated) + `manual_priority_override`; `is_paid` (boolean) duplicates `payments` table | PARTIAL — status_id and dept_id are FKs but status/current_department text fields still written | YES — `all_orders.customer_id` is plain text with no FK |
| **Customers** | ❌ NO | Two tables: `customers` (P1) and `p2_customers` (P2), linked only via application-layer `customerKey` service | No cross-table FK | YES — P2 orders can reference customers not in P1 table |
| **Shipping** | ⚠️ PARTIAL | `shipment_accounting_snapshots` is a snapshot layer — can diverge from live shipping records | `sales_order_id` reference not enforced as FK | YES — snapshots can exist for voided orders |
| **AR / Invoicing** | ✅ YES | Clean model — balance derived at query time from invoice - allocations - credits | FKs enforced on all AR tables | Low risk |
| **Inventory** | ⚠️ PARTIAL | `inventory_items` and `inventory_balances` joined by `ag_part_number` string (not integer FK) | NO integer FK between items and balances | YES — balances can reference non-existent part numbers |
| **Production** | ⚠️ PARTIAL | `production_orders.order_id` is a text field matching `all_orders.order_id` (not an integer FK) | NO enforced FK between production_orders and all_orders | YES — production orders can exist with no parent order |
| **Timekeeping** | ✅ YES | `punch_events` is single source; `time_clock_entries` is legacy/parallel | `job_id → production_orders.id` (optional FK) | Low risk for punches; pay calculation is derived |
| **Projects** | ✅ YES | Projects pipeline is clean, steps linked by UUID FKs | FKs enforced within project module | Low risk |
| **Cost Accounting** | ⚠️ PARTIAL | Parallel to GL Shadow Layer — two separate COA constructs with no link | `accounts → account_categories` (OK); no link to `chart_of_accounts` | YES — two accounting systems never reconcile |
| **Payments** | ❌ NO | `all_orders.is_paid`, `all_orders.payment_amount` duplicate `payments` table | No FK between `payments.order_id` and `all_orders` | YES — payments can exist for non-existent orders |
| **Quality** | ✅ YES | `p2_serialized_items` is clean source for P2 QC; `nonconformance_records` for P1 | FKs enforced in P2 dispositions | Low risk in P2; P1 nonconformance is looser |
| **Vendors** | ✅ YES | `vendors` is clean | FKs enforced in scope tables | Low risk |

### Critical Duplicate Fields (by table)

**`all_orders`:**
- `status` (text, legacy) + `status_id` (integer FK) — both written in production
- `current_department` (text) + `current_department_id` (integer FK) — both written
- `priority_score` (integer, marked DEPRECATED in code) + `manual_priority_override` (integer, newer model)
- `is_paid` + `payment_amount` + `payment_date` — duplicate of `payments` table

---

## PHASE 3 — ACCOUNTING READINESS

| Category | Status | Notes |
|---|---|---|
| **General Ledger Structure** | PARTIAL | Two constructs exist: `chart_of_accounts` + `journal_entries` (GL shadow layer, wire payments only) and `account_categories` + `accounts` + `monthly_account_entries` (cost accounting module, manually entered). They do not share a data model and neither is auto-populated from operations. |
| **Project-Based Accounting** | FAIL | The `projects` table is a pipeline tracker (RFQ → Quote → PO → Production). It has no WBS hierarchy, no budget fields, no cost-to-date tracking, no funding ceiling. No transactions are tied to a project code. |
| **Cost Pools (Labor, Overhead, G&A)** | PARTIAL | `allocation_rules` table exists with source/target accounts and allocation method/value. `monthly_account_entries` holds monthly actuals. However, this is entirely manual entry and is disconnected from actual labor transactions, purchase orders, or shipment costs. |
| **Revenue Recognition Logic** | FAIL | No automated revenue recognition. `shipment_accounting_snapshots` captures shipment data at fulfillment time for manual QuickBooks export. This layer is described in the source code itself as "disposable, migratable." |
| **Audit Traceability** | PARTIAL | Domain-specific audit logs exist: `admin_audit_log`, `p2_shipping_audit_log`, `receipt_audit_log`, `customer_satisfaction_audit_log`, `metal_accessory_audit_log`, `schema_change_log`. There is no unified financial audit trail that traces a dollar from order → invoice → payment → GL entry. |

---

## PHASE 4 — COMPLIANCE GAP ANALYSIS (vs. Costpoint)

| Compliance Area | Costpoint | EPOCH | Gap |
|---|---|---|---|
| **DCAA Compliance** | Native — cost accounting, timekeeping, and billing are integrated and auditable | Not applicable — no cost pool ↔ labor ↔ billing linkage | CRITICAL: Labor hours captured but not burdened or tied to project costs |
| **FAR / CAS Alignment** | Built-in — contract types (FFP, T&M, Cost+), cost principle enforcement | None — no contract type modeling | CRITICAL: No contract accounting structure |
| **Audit Trail Completeness** | Unified, immutable transaction log across all modules | Fragmented — domain-specific logs, no unified financial event log | HIGH: No single source for financial transaction lineage |
| **Role-Based Access Control** | Granular — field-level and function-level RBAC | Basic — three roles (ADMIN, EMPLOYEE, OWNER) plus hardcoded username restrictions (e.g., `glennj` for accounting) | MEDIUM: Username-level access control is brittle at scale |
| **Data Immutability** | Financial records locked after posting | AR invoices lock after POSTED/SENT/VOID/PAID status — good. P1 payments are soft-mutable. Orders can be patched freely. | MEDIUM: No system-wide immutability guarantee on financial records |
| **Government Reporting** | 300+ standard reports | Custom reporting only — no standard government report formats | HIGH: No DCAA-ready report outputs |
| **CMMC Alignment** | FedRAMP-capable environment | `p2_shipping_audit_log` referenced as "CMMC/DCAA compliant" in code comments but not structurally enforced | HIGH: Compliance aspirational, not structural |
| **Contract Management** | Full lifecycle: CLIN/SLIN, multi-contract projects, funding ceilings | None — project module tracks pipeline stages, not contract terms or funding | CRITICAL: No contract accounting |

### Explicit Gap List

1. No project accounting hierarchy (Project → Task → Cost)
2. No WBS or funding ceiling tracking on any project
3. Two disconnected accounting constructs with no reconciliation path
4. Timekeeping labor captured but not burdened or allocated to cost pools
5. Revenue recognition is manual and export-driven (QuickBooks dependency)
6. No standard government reporting formats
7. Dual customer master tables with application-layer-only linkage
8. Dual status fields on `all_orders` create audit ambiguity
9. `payments` table and `all_orders` payment fields not enforced to stay in sync
10. No unified immutable financial event log
11. Username-based access control is not scalable or auditable
12. `production_orders.order_id` links to `all_orders` via text match, not FK

---

## PHASE 5 — ARCHITECTURE COMPARISON (EPOCH vs. Costpoint)

| Dimension | Costpoint | EPOCH | Assessment |
|---|---|---|---|
| **Data Model Structure** | Single unified relational model — all modules share one schema | 15,339-line schema file — broad coverage, but contains deprecated/transitional fields in active tables and two separate accounting constructs | EPOCH: Needs debt resolution |
| **Module Integration** | All modules tied back to Project → Contract → Cost Pool | Modules are route-based but loosely coupled — production orders reference all_orders via text join, not integer FK | EPOCH: Weaker integration backbone |
| **Workflow Orchestration** | Rigid, compliance-driven workflow steps | Strong — traveler execution, P2 pipeline steps, checklist instances, barcode-driven routing | EPOCH: Clear advantage |
| **Reporting / BI** | Unified data model enables 300+ out-of-box reports | Domain-specific queries, shipment accounting snapshots, live metrics registry, executive rundown | EPOCH: Behind — no cross-domain BI layer |
| **AI Integration** | Dela AI — query and automate within Costpoint data | Pattern Awareness Layer, DONNA agent, voice notes, codebase chat, document intelligence | EPOCH: Clear advantage — ahead architecturally |
| **Schema Governance** | Managed by Deltek | Governance module exists: `schema_change_log`, `migration_guard`, `schema_policy.ts`, mutation logger — well-designed | EPOCH: Solid governance foundation |

---

## PHASE 6 — RISK ASSESSMENT

### Critical Risks (will break at scale)

| Risk | Description | Likelihood | Impact |
|---|---|---|---|
| **Dual customer master explosion** | `customers` (P1) and `p2_customers` (P2) will diverge further as P2 grows. No DB-level constraint prevents the same customer from having two incompatible records. | HIGH | HIGH |
| **Dual status fields causing data inconsistency** | `all_orders.status` (text) and `status_id` (FK) are both written. If they diverge, query results will be non-deterministic depending on which field is used. | MEDIUM | CRITICAL |
| **Text-based joins between production_orders and all_orders** | `production_orders.order_id` is a text field. No FK constraint means production records can exist without a parent order, and any refactoring of order IDs would silently break production history. | LOW-MEDIUM | HIGH |
| **Payments table vs. all_orders payment fields** | `is_paid`, `payment_amount`, `payment_date` stored on orders AND in the `payments` table. A failed write to one leaves the system in an inconsistent financial state. | MEDIUM | HIGH |

### Financial Risks (misstated revenue)

| Risk | Description |
|---|---|
| **QuickBooks dependency for revenue** | Revenue recognition flows entirely through manual export of `shipment_accounting_snapshots` to QuickBooks. If a snapshot is missed, skipped, or adjusted without audit, revenue is misstated with no system-level detection. |
| **Two COA systems never reconcile** | `chart_of_accounts` (journal entry shadow layer) and `account_categories`/`accounts` (cost accounting module) have no structural connection. A debit posted to the shadow GL is invisible to the cost accounting module and vice versa. |
| **No project-level cost tracking** | Costs (labor, materials, overhead) are not tied to projects. It is impossible to derive true project profitability from current system data. |

### Compliance Risks (audit failure points)

| Risk | Description |
|---|---|
| **Labor hours not burdened** | Timekeeping captures punch events and calculates hours, but applies no burden rates. DCAA requires burdened labor costs allocated to cost objectives. |
| **No funding ceiling enforcement** | If a government contract has a funding ceiling, EPOCH has no mechanism to detect or prevent overbilling. |
| **Username-based access control** | Accounting features are gated with hardcoded username arrays (e.g., `const AUTHORIZED_USERS = ['glennj']`). This cannot be audited, is not role-based, and breaks on personnel changes. |
| **Fragmented audit logs** | Audit trails span 7+ separate log tables with different schemas. A DCAA auditor requesting a transaction log would receive incomplete, non-standardized outputs. |

### Operational Risks (duplicate systems, manual fixes)

| Risk | Description |
|---|---|
| **P1 / P2 boundary ambiguity** | EPOCH has a clear P1 (custom stock/consumer orders) and P2 (contract manufacturing, serialized) split in the UI and routes, but not in the data model. Customers, payments, and orders exist in both universes without a unified view. |
| **Governance layer not connected to all write paths** | The mutation logger and governance routes are active, but many inline route handlers in `routes/index.ts` bypass the mutation logger entirely. |
| **`accountingPrep` described as disposable in its own source** | The shipment accounting snapshot module is self-described as "disposable, migratable." This means the only automated financial capture layer is expected to be replaced, creating a future migration risk with no replacement yet defined. |

---

## PHASE 7 — PRIORITIZED ROADMAP

### TIER 1 — MUST FIX (System Viability)

| # | Problem | Impact | Recommended Fix |
|---|---|---|---|
| T1-1 | **Dual status fields on `all_orders`** (`status` text + `status_id` FK both written) | Data inconsistency, query non-determinism, audit ambiguity | Complete migration to `status_id` FK. Add DB-level trigger to reject writes to `status` text field. Remove legacy column. |
| T1-2 | **Text-based join between `production_orders` and `all_orders`** | Cannot enforce referential integrity; silent orphan risk at scale | Add integer FK `production_orders.all_order_id → all_orders.id`. Backfill. Deprecate text match join. |
| T1-3 | **Dual customer master (`customers` + `p2_customers`)** | Same customer has two records; no DB-level canonical link | Add a `canonical_customers` master table. Both `customers` and `p2_customers` reference it. The `customerKey` service becomes a read path, not the only truth. |
| T1-4 | **Payment data duplicated on `all_orders`** | Financial inconsistency if either write path fails | Remove `is_paid`, `payment_amount`, `payment_date` from `all_orders`. All payment reads go through `payments` table. Add a view or join for display if needed. |
| T1-5 | **`inventory_balances` joins `inventory_items` via string part number** | Cannot enforce referential integrity on inventory | Add integer FK `inventory_balances.inventory_item_id → inventory_items.id`. Backfill. |

### TIER 2 — ENTERPRISE READINESS

| # | Problem | Impact | Recommended Fix |
|---|---|---|---|
| T2-1 | **Two disconnected accounting constructs** | Financial data siloed; impossible to produce a unified P&L | Merge into a single Chart of Accounts. Cost accounting module accounts become canonical. Shadow layer journal entries post to these accounts. |
| T2-2 | **No project-based cost tracking** | Cannot derive project profitability or support DCAA cost allocation | Extend `projects` with budget fields. Add `cost_transactions` table that ties labor, materials, and overhead to a `project_id`. All production-touching transactions should carry `project_id`. |
| T2-3 | **Labor not burdened** | Hours captured but costs not calculated per DCAA requirements | Add burden rate configuration table. Extend labor summary service to apply rates. Post burdened labor costs to project cost transactions. |
| T2-4 | **Fragmented audit logs** | Cannot produce unified financial audit trail | Create a single `financial_audit_log` table. All financial events (invoices, payments, credit memos, GL entries, adjustments) write one canonical row here in addition to domain-specific logs. |
| T2-5 | **Username-based access control** | Brittle, unauditable, breaks on personnel changes | Replace with a permissions table. Feature access is tied to employee roles or explicit grants, not username arrays in source code. |
| T2-6 | **Revenue recognition is manual (QuickBooks export)** | Missed shipments = misstated revenue; no system-level detection | Auto-generate journal entries at shipment time from within EPOCH. Revenue recognized in-system. QuickBooks export becomes a secondary output, not the primary record. |

### TIER 3 — COMPETITIVE ADVANTAGE (Where EPOCH beats Costpoint)

| # | Opportunity | What to Build |
|---|---|---|
| T3-1 | **Domain Truth Inspector (already started)** | Expand into a live, scheduled data integrity monitor that flags constraint violations, orphan records, and field conflicts. Alert on critical failures automatically. |
| T3-2 | **AI-driven project cost intelligence** | DONNA + Pattern Awareness Layer surfaces budget burn anomalies, predicts cost overruns, and flags unusual labor patterns before they become audit findings. No off-the-shelf ERP does this well. |
| T3-3 | **Unified financial event stream as AI query target** | Once Tier 2 produces a canonical `financial_audit_log`, DONNA can answer natural-language financial queries ("What is our unbilled AR by project this month?") without custom reports. |
| T3-4 | **Live compliance readiness score** | A real-time DCAA/compliance readiness scorecard driven by actual data — missing burden rates, unlinked transactions, unposted journal entries — surfaced as a score to ownership. This alone would be a market differentiator. |

---

## SUMMARY SCORECARD

| Area | Rating | Notes |
|---|---|---|
| Manufacturing Operations | ✅ STRONG | Best-in-class shop floor, traveler execution, barcode traceability |
| Order Management | ⚠️ PARTIAL | Functional but carrying legacy dual-field debt |
| Inventory | ⚠️ PARTIAL | String joins, no FK integrity between items and balances |
| AR / Invoicing | ✅ GOOD | Clean model, proper balance derivation at query time |
| Payments | ❌ WEAK | Duplicated across two locations, no FK enforcement |
| Customer Master | ❌ WEAK | Two tables, no enforced canonical link at DB level |
| Cost Accounting | ⚠️ PARTIAL | Two disconnected accounting constructs; manual entry only |
| GL / Journal Entries | ⚠️ PARTIAL | Wire payments only; not transaction-complete |
| Project Accounting | ❌ FAIL | Pipeline tracker only; no financial project structure |
| Labor / Timekeeping | ⚠️ PARTIAL | Hours captured; no burdening, no project cost allocation |
| Compliance (DCAA/FAR) | ❌ FAIL | Aspirational only; not structurally enforced |
| Audit Trails | ⚠️ PARTIAL | Domain-specific only; no unified financial event log |
| RBAC / Access Control | ⚠️ PARTIAL | Three-role system; username hardcoding is a meaningful gap |
| AI / Automation | ✅ STRONG | Ahead of Costpoint — DONNA, Pattern Awareness, voice notes |
| Schema Governance | ✅ GOOD | Governance layer, migration guard, schema policy — well-designed |

---

*This report was produced via read-only inspection of the EPOCH schema (`server/schema.ts`, 15,339 lines), all route files, service layer, governance module, and selected UI pages. No code was modified. All findings are based on verified schema definitions, route logic, source comments, and architectural patterns. April 15, 2026.*
