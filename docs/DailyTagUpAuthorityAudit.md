# Daily Tag Up authority audit

Audited against `origin/main` `e094936fe5692f32c7d4dfceaf7d19a9766b123e` on 2026-08-28.

Daily Tag Up is an additive, read-only projection. It does not create or update project, demand, work-order, BOM, queue, traveler, inventory, purchasing, or readiness records.

## Source-of-truth decisions

| Display concern | Authoritative source | Read-model rule |
| --- | --- | --- |
| Project | `projects` | Include active, on-hold, or won projects. |
| Customer PO | `projects.po_id -> p2_purchase_orders.id` | Do not infer a PO from text or older links. |
| Released project demand and assembly hierarchy | The single `p2_frozen_production_demand_baselines` row with `status='RELEASED'`, plus its `p2_frozen_production_demand_nodes` | Nodes, classifications, make/buy disposition, BOM revision identity, routing identity, and quantities come from the immutable released snapshot. Draft, validated, cancelled, and superseded baselines are not manufacturing truth. |
| Actual manufacturing work orders | `p2_manufacturing_work_order_authorities -> production_work_orders` | Every displayed work-order row is an existing authority row. Department rollups sum only those child rows. |
| Department | `p2_manufacturing_work_order_authorities.current_department_id/current_department_name_snapshot` | Use the routed snapshot retained by work-order authority; do not hard-code department names. |
| Required and complete quantities | `p2_manufacturing_work_order_authorities.required_quantity/completed_quantity` | Remaining is `max(required-complete,0)`. In-progress quantity is the outstanding quantity only when lifecycle status is `IN_PROGRESS`; EPOCH has no separate partial in-progress quantity column. |
| Readiness and blockers | Work-order lifecycle status, open `p2_manufacturing_work_order_dependencies`, unsatisfied `p2_manufacturing_work_order_material_requirements`, and required traveler presence | Compose existing execution signals. Do not write a new readiness value. |
| Traveler | `p2_manufacturing_work_order_authorities.traveler_id -> travelers` | Missing required traveler is shown as blocked; no traveler is synthesized. |
| Inventory | Location rollup of `inventory_balances` | Display on hand, allocated, and available independently. Missing balance rows equal zero availability, consistent with current MRP services. |
| Purchasing supply | `vendor_po_items` with exact `project_id` and `ag_part_number`, joined to a current, open `vendor_pos` revision | Unlinked supply is not credited. Show `NO OPEN SUPPLY` instead of matching by description. |
| Lead time | `inventory_items.lead_time_days`; expected receipt from `vendor_pos.expected_delivery_date` | Missing lead time is displayed explicitly. Risk does not invent a duration. |
| Permission | Existing `p2.work_orders.view` capability | Server endpoint and client route both require the read capability; no mutation capability is granted. |

## Intentional boundaries

- Legacy projects without a released Frozen Production Demand baseline remain visible but display `NOT RELEASED`; no legacy BOM is substituted.
- Vendor PO lines without exact project and part traceability are excluded from project supply.
- NCR aggregation is not included because the current project/work-order linkage was not sufficiently direct for a fail-closed join in this scope.
- Manufacturing lead time is not calculated because the current work-order authority does not store a separate trusted manufacturing lead-time duration.
- No migration or index is required. The read model uses existing project, baseline, work-order, inventory, and vendor-PO indexes.

## Post-development capture check

The API response exposes its authority map and returns one server-composed model for summary, projects, departments, actual work orders, released assembly nodes, materials, supply, and issues. React does not fetch queues or BOM lines separately and does not recompute authoritative totals from unrelated endpoints.
