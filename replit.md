# EPOCH v8 - Manufacturing ERP System

## Overview
EPOCH v8 is a comprehensive Manufacturing ERP system designed to streamline operations, enhance efficiency, and improve scalability for small manufacturing companies specializing in customizable products. It offers end-to-end order management, inventory tracking, an employee portal, quality control, a powerful Bill of Materials (BOM) system, Google OAuth, global search, and a Parts List Management System. The vision is to be the leading ERP solution for small-to-medium customizable product manufacturers, delivered as a full-stack TypeScript PWA with a React frontend and Express backend, deployable to web and mobile platforms.

## User Preferences
Preferred communication style: Simple, everyday language.
Production constraints: Do not modify mold capacities or employee settings to unrealistic values. Use actual production capacity constraints for accurate scheduling.
Order finalization rules: Orders with "None" or empty stock models cannot be finalized and sent to the Production Queue. The system will block finalization with a clear error message.
Order identification: FB Order Numbers (like AK046) are stored in the fb_order_number field, not as the primary order_id. The actual order_id remains the AG series format (e.g., AG589 has FB Order #AK046).
Data integrity: Prevent orders from being saved with null/empty modelId fields to maintain consistency between draft and finalized order tables.
UI Performance: Department progression buttons use cache-first approach with disabled automatic refetching to prevent UI reversion issues.
Default shipping charge: Should be 36.95 for new orders.
Critical requirement: All completed functionality must be hard-coded to prevent loss of features and data.
Search standardization: All department queue pages use unified OrderSearchBox component with "Search orders by Order ID or FishBowl Number..." placeholder for consistent user experience.
Navigation dropdown behavior: All navbar dropdown menus close automatically after selection.
Balance due access: Customer balance due tracking is restricted to username "glennj" only for security. Balance Due column appears in Customer Management only when glennj is logged in.
EPOCH Overview: User preference to maintain EPOCH-Overview.md as a living document - update periodically when requested as system grows.
Tikka compatibility guardrails: On the Order Entry page, Tikka stock models ONLY show Tikka options for action inlet, barrel inlet, and bottom metal (with a green "Tikka only" badge). Non-Tikka stock models hide all Tikka options from these dropdowns. When switching between Tikka and non-Tikka models, incompatible selections are automatically cleared with a toast notification.
Navbar-permissions alignment: The userPermissions.ts file is the source of truth for user route access. Navigation.tsx filters navbar items based on these permissions. Users not in the permissions list default to only seeing the Employee Portal. Each user sees only their own dashboard in the User Dashboards dropdown (admins see all). Any new navbar items must be added to both Navigation.tsx AND the appropriate user permission lists in userPermissions.ts to stay in sync.

## DCAA-Compliant Employee Time Certification (Task #1855)

Both hourly and salaried timesheets now require explicit employee certification before submission:

- **Hourly (admin attest flow)**: Admin clicks the attest button → a certification dialog opens with the canonical DCAA statement and a required checkbox. The checkbox must be checked before "Certify & Attest" is enabled. The route `POST /api/timekeeping/timesheets/:id/attest` requires `{ certificationConfirmed: true }` and writes the canonical statement + version + `TIME_CERTIFIED` audit event.
- **Salaried (employee portal)**: An amber certification card with the DCAA statement and a required checkbox appears instead of the old two-step confirm button. The portal certify route `POST /salaried-timesheet/portal/:portalId/certify/:id` requires `{ certificationConfirmed: true }` and writes the statement + audit event.
- **Canonical statement**: `"I certify that the time recorded for this period is complete, accurate, and represents work I actually performed."` — `DCAA_CERTIFICATION_VERSION = 1`
- **Edit lock post-certification**: `updateTimesheet` (hourly) blocks edits when `certificationStatement` is set; salaried POST/PATCH/DELETE line endpoints block edits after certification unless status is OPEN/REOPENED.
- **Cert cleared on reopen**: `rejectTimesheet` (hourly) and the salaried reopen endpoint clear `certificationStatement`, `certificationVersion`, `certifiedAt`, and `certifiedBy`.
- **Schema**: `timesheets` table has `certifiedByUserId`, `certificationStatement`, `certificationVersion` columns; `salaried_timesheets` has `certificationStatement`, `certificationVersion` columns (plus existing `certifiedAt`/`certifiedBy`). Inline `ALTER TABLE … IF NOT EXISTS` migration blocks added to `server/index.ts`.

## WAD-Based Labor Charging Enforcement (Task #1235 — Phase 1 WARN)

When a technician starts a traveler step or clocks in via a traveler barcode, the system now:
1. **Auto-resolves the charge code** from the linked WAD (`defaultChargeCodeId`) with fallback to department-matched active charge code
2. **Derives `projectId` server-side** from the WAD — never trusted from client input
3. **Records certification state** (VALID/EXPIRED/MISSING) at step start time using routing operation cert requirements
4. **Records budget overrun state** (`isOverrun`, `overrunReason`) using the existing labor budget helper
5. **Stamps all 5 fields** on `punch_ledger` at clock-in/step-start via migration `0064_punch_ledger_wad_traceability.sql`

**Policy**: Phase 1 = WARN (allow with flag). Sessions are never blocked by budget or cert issues — they are recorded and flagged for supervisor review.

**UI** (TravelerExecution.tsx): NOT_STARTED step shows resolved charge code badge + source, inline budget overrun warning with acknowledgment checkbox (start disabled until acknowledged).

**New API**: `GET /api/travelers/:travelerId/steps/:stepId/labor-context` returns WAD charge code, budget overrun state, and projectId for pre-step display.

**Key files**: `server/src/lib/resolveChargeCode.ts`, `server/src/lib/punchLedger.ts`, `server/src/routes/timeClock.ts`, `server/src/routes/travelers.ts`, `client/src/pages/TravelerExecution.tsx`, `migrations/0064_punch_ledger_wad_traceability.sql`

## MANDATORY READ — Architecture Constitution

**Before implementing anything that touches labor, WAD, GL, burden, payroll, traveler, PM dashboard, DCAA, or compliance, you must read:**

> **`docs/EPOCH_ARCHITECTURE_CONSTITUTION.md`**

This file is the authoritative governance document for EPOCH's financial and labor architecture. It defines:
- The single authorized labor pipeline (`punch_ledger` → `charge_codes` → `labor_approvals` → GL → payroll → DCAA)
- A complete list of forbidden patterns (standalone imports, duplicate punch tables, free-text cost attribution, compatibility bridges)
- The required FK chain for all cost attribution
- Traveler scan behavior requirements
- DCAA compliance enforcement rules
- The agent implementation rule (delete-first, no compatibility layers, stop-and-redesign if deprecated behavior is required)

Skipping this read before implementing any of the above domains is a constitution violation.

## System Architecture
The application is a full-stack TypeScript monorepo designed for type safety, data consistency, and cross-platform compatibility with PWA support via Capacitor.

### Core Architectural Decisions
- **Type Safety & Data Consistency**: Shared TypeScript schemas (Drizzle, Zod) and a `features` object as a single source of truth.
- **Authentication**: Hybrid JWT + Session authentication with a 3-role (ADMIN, EMPLOYEE, OWNER) capability-based access control system.
- **UI/UX**: Modern UI using ShadCN UI, Tailwind CSS, and Framer Motion.
- **BOM System**: Two BOM systems — (1) Robust BOMs (`boms`/`bom_revisions`/`bom_lines`) with revision control, (2) P2 BOM Wizard (`bom_definitions`/`bom_items`) for simpler definitions. Production order generation checks both systems (robust first, then P2 BOM Wizard fallback). All BOM PKs are UUIDs — never use parseInt().
- **Order Management**: Atomic order ID reservation, rush fees, urgency/priority system, path-based signature email architecture, and card-before-save flow.
- **Inventory & Production**: Parts list management, Purchase Orders, vendor POs, inventory CSV import, enhanced layup scheduling, and FIFO-based packet building with AS9100 traceability via barcode scanning. Includes dynamic inventory thresholds and demand-filtered BOM assignment. Cutting Table Dashboard supports packet barcode printing (MFG-{id}-{partNumber} format), scan-to-start workflow with BOM material display/ply schedule/cuts config, and BOM-validated material roll scanning (rejects non-matching materials). FIFO inventory recommendations shown when packet is scanned. Fabric Inventory fabric type dropdown is driven by inventory items with `is_fabric = true` — selecting a fabric auto-populates part number, source, and supplier part number. `cutting_fabric_inventory.inventory_item_id` FK links each fabric roll to its master inventory item. Endpoint: `GET /api/inventory/items/fabric-items`.
- **Quality Control**: Nonconformance Record System, Vendor Evaluation System, and Hard QC Stop enforcement with authorized deviation approval workflow.
- **P2 Serialized Item Tracking**: Complete serialized item tracking for P2 purchase orders with customizable workflows, barcode scanning, traceability gating, Traveler Viewer, Electronic Signature System, department data editing, and notes at any workflow stage. Traveler Management page includes Authorized Notes system (`traveler_authorized_notes` table) — authorized users can add signed notes per department with linked PO documents and tolerance change authorization. These document links follow the remaining travelers throughout PO completion. Edit button removed from traveler management in favor of Authorized Notes action badge.
- **Communication Governance Layer**: Centralized email control plane with templating, logging, audit capabilities, and robust HTML safety features including sanitization, style whitelisting, inline JS detection, placeholder validation, and size limits. Includes admin-editable Sign Order Page content settings (singleton `sign_order_page_settings` table) with a dedicated settings UI at `/sign-order-page-settings`.
- **Financial & Reporting**: Cost Center Management, dynamic discount system, Credit Memo Management, Payment Analytics, Historical Data Module, and Refund Request/Queue.
- **PDF Management**: Centralized PDF configuration, flexible Template Library System, and unified `orderPdfService` for intent-based PDF generation using frozen order snapshots.
- **Smart Data Entry**: Streamlined traceability with recent lot number recall, autocomplete, and barcode quick-fill.
- **PM Control Center** (`/pm-control-center`): Dedicated project manager dashboard (`client/src/pages/PMControlCenterPage.tsx`) providing full project health visibility in one tabbed view. Project selector with "Only My Projects" toggle; auto-selects when PM has exactly one active project. KPI summary cards (production %, labor hours, material cost, open blockers, target ship date — refreshes every 60s). Three tabs: (1) **Production** — work order table with status badges, days ahead/behind, active traveler number; row click opens right-side drawer with work order details, traveler list, and open labor sessions; (2) **Direct Labor** — 4 summary cards (budgeted/actual/remaining/% consumed), charge code budget-vs-actual table with red (>100%) / yellow (≥80%) highlighting, live open session feed auto-refreshing every 30s showing employee, traveler, department, charge code, elapsed time, certification badge; (3) **Material Budget** — 4 summary cards, sortable allocation table defaulting to risk-first order (SHORT→ON_HOLD→PARTIAL→FULLY_ALLOCATED). Backend: `server/src/routes/pmDashboard.ts` with 6 endpoints: `GET /api/pm-dashboard/projects`, `GET /api/pm-dashboard/:projectId/summary`, `/production`, `/production/:workOrderId`, `/labor`, `/materials`. Uses raw SQL for cross-schema joins between public schema (projects, work orders, travelers) and timekeeping schema (labor_work_sessions, labor_authorizations, labor_charge_codes, certifications). Registered in `server/src/routes/index.ts`; nav item added to Purchase Orders section in `Navigation.tsx`.
- **Control Centers**: Unified interfaces for P2 Purchase Orders and Cutting Table with dashboards, wizards, and progress tracking, including P2 Control Center Shipping tab, Production Timer endpoints, and Off-System Production completion (marks items complete outside digital travelers, auto-creates completed traveler records for management visibility). Production Control Center (`/production-control-center`) with hero metrics, shipment trend chart, bubble chart, kit progress tracker, signal cards, and swim lane preview — all built on the extensible widget registry system. **P2 PO Locking**: `locked_at`/`locked_by` columns on `p2_purchase_orders` (FK → employees); `POST /api/p2-purchase-orders/:id/lock` and `/:id/unlock` endpoints; state guard in PATCH route returns 423 for locked POs; `P2POManager.tsx` shows amber "Locked" badge, disables all edit/delete actions, and shows a Lock/Unlock button per card; lock banner in the edit dialog reminds users attachments can still be managed. **Control Tower Ribbon**: `ControlTowerRibbon` widget (`client/src/components/widgets/ControlTowerRibbon.tsx`) mounted at top of PCC — fetches `GET /api/control-tower/signals` (backed by `server/src/services/controlTowerService.ts`); aggregates 5 signals: stuck orders (department threshold days), inventory shortages, AR overdue, quotes awaiting response, P2 pending BOMs; each signal is severity-classified (info/warning/critical) and clickable to navigate to the relevant page.
- **P2 Pipeline Board**: Kanban drag-and-drop board at `/projects/pipeline` (`client/src/pages/P2PipelineBoardPage.tsx`) using `@dnd-kit/core`. Displays 7 pipeline stages (rfq_received → quote_preparing → quote_submitted → purchase_review → po_received → production → completed). Dragging a project card triggers `PATCH /api/projects/:id` to update `currentStage`. Endpoint `GET /api/projects/pipeline` returns lightweight project cards with stage info. Route added to `VALID_NAVBAR_ROUTES` in `userPermissions.ts`.
- **Flexible Project Workflow Steps**: `ProjectDetailPage.tsx` enhanced with independent step management: skip (with required reason via `POST /api/projects/:id/steps/:stepId/skip`), reopen (`POST /:stepId/reopen`), and full status support (pending/in_progress/completed/blocked/skipped/not_applicable). Step document uploads via `POST /api/project-step-attachments/request-upload-url` + object storage; `GET /api/project-step-attachments/by-project/:id` loads all attachments in one call. `projectStepStatusEnum` in schema has 6 values. Boot migration `Ensured projects table has pipeline stage columns and flexible step statuses` adds `current_stage` (text, default 'rfq_received') and `stage_updated_at` (timestamp) to projects table. Invoice file uploads added to `MediaAttachmentPicker.tsx` (`entityType: 'invoice'`).
- **Widget System**: Extensible dashboard widget architecture with `widgetRegistry.ts` supporting types: `metric_stat`, `metric_stat_group`, `hero_metric`, `shipment_trend`, `bubble_chart`, `kit_progress`, `signal_card`, `swim_lane_preview`, `department_status`, `capability_radar`. Config-driven layouts via `dashboardLayouts.ts` and `DashboardGrid`/`WidgetRenderer`. Includes `FlippableCard` component (`client/src/components/widgets/FlippableCard.tsx`) for 3D flip animations using Framer Motion. `DashboardFilterContext` (`client/src/contexts/DashboardFilterContext.tsx`) provides `timeRange` (week/mtd/ytd) and `businessContext` (company/p1/p2) state via `useDashboardFilters()` hook — PCC page is wrapped with the provider. All 5 primary widgets (HeroMetricWidget, ShipmentTrendWidget, BubbleChartWidget, KitProgressWidget, SignalCardWidget) consume filters via `useDashboardFilters()` and include filter values in query keys for proper cache invalidation. ShipmentTrendWidget and BubbleChartWidget pass `timeRange`/`businessContext` as query params to backend endpoints which adjust data windows and apply P1/P2 filtering (`buildBusinessContextFilter` uses modelId presence). `DashboardControlBar` provides segmented toggles for time range and business context plus quick-action navigation buttons (Order, Vendors, Inventory, Maintenance). HeroMetricWidget supports `enableFlip` prop to wrap content in FlippableCard — front shows current metric with goal progress bar, back shows YTD shipments, last month same week, 4-week average, and avg revenue per stock (via `GET /api/shipping/hero-backside`). Shipping endpoints: `GET /api/shipping/weekly-history`, `GET /api/shipping/stock-model-bubbles`, `GET /api/shipping/hero-backside` — all accept `timeRange` and/or `businessContext` query params.
- **Discrete Event Simulation (DES) Forecast Engine**: `server/src/services/productionSimulator.ts` — simulates factory throughput using department capacity (stations + parallel efficiency from `department_capacity` table), historical cycle times, and order pipeline routing. Replaces simple "queue length × avg days" math with a proper event-driven simulation that models station assignments, queue wait times, and order flow. Results cached for 5 minutes. Now uses per-model learned cycle times from `model_department_stats` when sample count ≥ 5, falling back to global averages. Endpoints: `GET /api/admin/department-capacity`, `PUT /api/admin/department-capacity/:department`, `GET /api/admin/order-forecast/:orderId/timeline`. The existing `forecastActiveOrders()` and `forecastOrder()` in `productionForecastService.ts` now delegate to the DES simulator with automatic fallback to legacy math on failure.
- **Self-Learning Cycle Time Engine**: `server/src/services/cycleTimeLearning.ts` — automatically aggregates per-model, per-department cycle times from historical production data (`all_orders` timestamps + `order_department_transitions` when available). Stores results in `model_department_stats` table with confidence levels (HIGH ≥20 samples, MEDIUM ≥5, LOW <5). Only stats with ≥5 samples feed into the DES simulator. Drift detection flags anomalies when cycle times shift >20% between rebuilds, logged to `cycle_time_drift_log` table. Runs nightly at 2 AM via cron. Endpoints: `POST /api/admin/cycle-time-learning/rebuild` (manual trigger), `GET /api/admin/cycle-time-learning/stats` (overview), `GET /api/admin/cycle-time-learning/drift-log`, `GET /api/admin/cycle-time-learning/model-stats`.
- **Forecast Accuracy Tracking**: `server/src/services/forecastAccuracyService.ts` — tracks forecast vs. actual completion dates to measure DES prediction accuracy. Three `all_orders` columns: `forecast_completion_date` (stamped when forecast runs), `actual_completion_date` (set on mark-shipped), `forecast_error_days` (calculated as actual − forecast). `stampForecastOnOrders()` runs automatically after `forecastActiveOrders()` to persist predicted completion dates. `recordActualCompletion()` called in `shipping.ts` mark-shipped route. Endpoints: `GET /api/admin/forecast-accuracy` (returns avg/median error, within-N-day percentages, over/under-estimated split), `POST /api/admin/forecast-accuracy/stamp` (manual trigger). PCC widget `ForecastAccuracyWidget` in the Executive Metrics section shows accuracy percentage, avg error, median, and trend breakdown.
- **Order Audit System**: Comprehensive audit tracking for P1 orders and P2 serialized items with configurable event categories, field change detection, and department transition timing.
- **Media Library System**: Centralized image storage with camera capture, file upload, reference-based attachments, and hierarchical folder organization with role-based access control.
- **Document Scanner**: Built-in scanning with OpenCV.js for automatic edge detection, perspective correction, image enhancement, and PDF conversion.
- **Voice Notes System**: Voice-activated note recording for production issues with automatic order ID extraction, issue categorization, and resolution tracking.
- **Customer Watch Rules System**: Configurable monitoring rules for tracking customer orders through departments with multi-person visibility sharing.
- **Timekeeping — SUPERSEDED ARCHITECTURE (historical record only)**: ⚠️ The description below reflects a previous architectural state and is superseded by the EPOCH Architecture Constitution (`docs/EPOCH_ARCHITECTURE_CONSTITUTION.md`). The standalone `modules/timekeeping` artifact and its dual-pool pattern are deprecated. The authorized labor pipeline is `punch_ledger` → `charge_codes` → `labor_approvals` → GL posting. Do NOT introduce new imports from `modules/timekeeping/`, `tkDb`, or dual-pool patterns. *Historical context:* The standalone Timekeeper module (`modules/timekeeping`) was absorbed INTO EPOCH (single server, port 5000) as Tier 1 of a multi-tier plan. Backend API lived under `/api/timekeeping/`. Key historical files: `server/src/lib/timekeeping.ts`, `server/src/lib/timekeeping-zod.ts`, `server/src/services/timekeeping/`, `server/src/routes/timekeeping/`. Migration `0049_timekeeping_schema.sql` created the `timekeeping.*` schema. The dual-pool architecture (timekeeping services importing `db` from `modules/timekeeping/lib/db/src` while EPOCH's `db` was used for `public.*` reads) was marked "intentional" at the time but is now a deprecated pattern under the constitution's standalone prohibition (Section 2).
- **Accounting Shadow Layer**: Double-entry journal for wire payments, restricted to ADMIN.
- **Attention & State-Confidence System**: Cross-domain system tracking confidence in the current state of work using `lastConfirmedAt`, `lastConfirmedByUserId`, `confirmationNote`, and `attentionRisk` fields.
- **Real-Time WebSocket Notifications**: WebSocket server for targeted notifications.
- **Fillable PDF Templates System**: MVP for customer fill-and-sign workflow with public signature links.
- **Central QR Code System**: Generates and resolves QR codes to entity-specific routes based on user role, logs scan events, and provides admin CRUD UI.
- **Asset Management & Work Order System**: Comprehensive asset tracking with hierarchical categories, physical locations, generalized work orders, and integration with Preventive Maintenance.
- **Routing Document Management System**: AI-powered document management for P2 Control Center supporting work instructions, spec sheets, and traveler templates.
- **Executive Rundown System**: Glenn-only personal task management with daily rundown groups, priority tiers, carry-forward of overdue items, and rapid capture.
- **Project Pipeline Stage Model**: Projects track lifecycle via `currentStage` (text column: rfq_received, quote_preparing, quote_submitted, purchase_review, po_received, production, completed) and expanded `status` enum (active, on_hold, completed, cancelled, inactive, won, lost). `poId` FK links to `p2_purchase_orders`. Stage auto-derives from step completions via `STEP_TO_STAGE_MAP` in `server/src/routes/projects.ts`. Final step (p2_order) completion sets status=won, stage=production. Pipeline endpoint: `GET /api/projects/pipeline` returns active/won projects with customer names and stage info.
- **Flexible Step System**: Project steps can be started, completed, skipped, or reopened independently — sequential enforcement removed. Step status enum: pending, in_progress, completed, blocked, skipped, not_applicable. Skip requires reason via dedicated `PATCH /skip` endpoint (reason appended to notes). Reopen via `PATCH /reopen` clears completion fields and reverts project status to active if project was completed/won. Generic PATCH endpoint blocks direct `skipped` status to enforce skip-with-reason semantics. UI: Start/Skip/Reopen buttons on steps; skip dialog with mandatory reason; skipped steps render grey with "Skipped" badge.
- **P2 Pipeline Board (Kanban)**: Visual pipeline board at `/projects/pipeline` (`P2PipelineBoardPage.tsx`). 7 stage columns (RFQ Received → Completed) with project cards showing projectCode, projectName, customerName, targetShipDate, daysInStage. Drag-and-drop via `@dnd-kit/core` triggers `PATCH /api/projects/:id` to update `currentStage` and `stageUpdatedAt`. Backend validates stage against `VALID_PIPELINE_STAGES` whitelist. Quick actions menu per card (Open Project, Open Quote, Open PO). Accessible via nav menu and "Pipeline Board" button on ProjectsPage.
- **Control Tower Ribbon**: Operational alert ribbon on the Production Control Center (`ControlTowerRibbon.tsx`), positioned between the DashboardControlBar and DashboardGrid. Fetches signals from `GET /api/control-tower/signals` (30s stale, 60s refetch). Backend service (`server/src/services/controlTowerService.ts`) aggregates 5 signal types: stuck orders (from all_orders), inventory shortages, AR overdue, quotes awaiting response, P2 pending BOMs. Signals are domain-tagged (company/p1/p2) and filtered client-side based on the active `businessContext` toggle. Severity thresholds: critical (red) / warning (yellow) / info (blue). Ribbon hides entirely when zero signals. Each chip navigates to the relevant page on click.
- **User Snapshot Resolver**: Reusable backend utility (`server/utils/userSnapshot.ts`) that resolves numeric user/employee IDs to display names for display in `performedByDisplayName` and `completedByDisplayName`.
- **User Identity Layer**: Foundational identity abstraction (`server/identity/userIdentity.ts`) providing `createIdentitySnapshot()` for richer identity records. P2 Traveler routes (`p2Traveler.ts`) are fully converted to write-time identity resolution — all human-facing fields (startedBy, completedBy, performedBy, recordedBy, finalizedBy) store display names via `createEmployeeIdentitySnapshot()`, while `employeeCode` is preserved only in `p2WorkTasks` as an identifier. The P2 Traveler Viewer retains a defensive `resolveName()` fallback for legacy data.
- **Form Draft Persistence & Unsaved Changes Warning**: Reusable hooks for localStorage-based auto-save drafts and browser `beforeunload` warnings.
- **Centralized Address Domain Service**: All address creation and updates flow through a service that normalizes and validates via SmartyStreets US Street API.
- **Canonical Material & Source Snapshot**: `production_orders` table includes `material_canonical` (derived from stock model ID prefix) and `source_snapshot` (immutable record of PO state at creation) for P1 material display.
- **Training Builder Module**: Self-contained training program management using Train-the-Trainer methodology.
- **Epoch 4-Step Training System**: Comprehensive training management using the 4-step methodology, with AI-generated training plans and quizzes.
- **Employee Onboarding System**: Admin-driven employee onboarding with configurable paths, intake forms, session lifecycle management, and atomic finalization.
- **Inventory Allocation Engine**: Three-function service (`allocateInventory`, `deallocateInventory`, `consumeAllocatedInventory`) in `server/src/services/inventoryAllocationService.ts` using `db.transaction()` with `FOR UPDATE` row locking. Invariant: `quantity_available = GREATEST(0, quantity_on_hand - quantity_allocated)`. Logs all operations to `inventory_transactions`.
- **Production Order Allocation Trigger**: `server/src/services/productionOrderAllocationService.ts` — automatically allocates BOM materials when an order transitions FINALIZED → IN_PROGRESS (intercepted in `PATCH /api/orders/:orderId`). Resolves BOM via direct FK or `bom_definitions.sku = model_id` fallback. Pre-flight shortage check before any DB write; returns HTTP 409 `MATERIAL_SHORTAGE` if insufficient inventory.
- **MRP Material Planning Engine**: `server/src/services/mrpMaterialPlanning.ts` — `calculateMaterialDemand()` (open-order BOM demand rollup), `calculateMaterialShortages()` (demand vs. on-hand), `calculateBuildCapacity()` (floor(available/bom_qty), min across all BOM materials). BOM lookup: `all_orders.bom_definition_id` FK first, then `bom_definitions.sku = model_id` fallback. Exposed via `GET /api/inventory/mrp/{demand|shortages|capacity/:sku|run}` and the dedicated `GET /api/mrp/material-readiness` endpoint (returns `max_buildable_units`, `materials[]` with names from `inventory_items`, and `blocking_materials[]`).
- **AR Invoice System (Phase 1)**: Historical invoice tracking module for P2 customers. Tables: `ar_invoices` and `ar_invoice_lines` (UUID PKs, cascade delete). Routes: `server/src/routes/arInvoices.ts` mounted at `/api/ar-invoices` with full CRUD. Server-side total calculation (subtotal + tax = totalAmount). Invoice list/detail queries include computed `amountPaid` and `balance` fields from `ar_payment_allocations`. Protected by `authenticateToken` + `requireAdminAccess`. UI: Invoice list (`/finance/invoices`), create/edit form (`/finance/invoices/new`, `/finance/invoices/:id/edit`), detail view (`/finance/invoices/:id`). Navigation under Finance dropdown. Permissions for ADMIN/OWNER roles. Separate from existing `invoice_numbers` packing slip system — uses `ar_` table prefix. PO dropdown loads from `p2_purchase_orders` via `/api/ar-invoices/customer-pos`. Terms dropdown uses standardized options (NET_15, NET_30, NET_60, COD, PREPAID) with auto due-date calculation.
- **AR Payment Allocation System**: Independent payment system for AR invoices (`ar_payments`, `ar_payment_allocations` tables, UUID PKs). Routes: `server/src/routes/arPayments.ts` mounted at `/api/ar-payments`. Supports: create payment, allocate to multiple invoices (`POST /:id/allocate`), delete with invoice status rollback. Allocation validates payment total and per-invoice balance. Auto-sets invoice status to PAID when fully paid. Does NOT modify existing `payments` table (production order payments). UI: AR Payments list page (`/finance/ar-payments`) with search, create payment dialog, and allocation interface. Invoice detail page (`/finance/invoices/:id`) includes "Apply Payment" button, payment recording dialog, multi-invoice allocation dialog, and Payments tab showing payment history. Invoice detail page also includes Attachments tab using MediaAttachmentPicker with `entityType="invoice"`. Invoice edit form shows MediaAttachmentPicker for existing invoices.
- **Weekly Shipments Overview**: Combined view at `/weekly-shipments` (`client/src/pages/WeeklyShipmentsOverview.tsx`) that unifies P1 Shipping Tracker and OEM Shipments into a single weekly dashboard. Shows all stocks shipped during any selected operational week (Wed-Tue), with summary metric cards (total stocks, P1 count, OEM count, unique packages), tabbed filtering (All/P1/OEM), search across order IDs/customers/tracking numbers, and quick-links to the individual Shipping Tracker and OEM Shipments pages. Data sources: `/api/orders/with-payment-status` (P1) and `/api/po-orders/oem-shipments` (OEM). Permissions: available to admin users and users who have both shipping-tracker and oem-shipments access.
- **Capability-Based Permission System**: Database-driven permission layer complementing the existing `userPermissions.ts` flat-file system. Four `perm_` prefixed tables: `perm_capabilities` (43 atomic permission keys across 10 categories), `perm_roles` (ADMIN/OWNER/EMPLOYEE/INVENTORY_MANAGER + custom roles), `perm_role_capabilities` (M2M join), `perm_user_overrides` (per-user allow/deny overrides). Tables auto-created via boot migration in `server/index.ts`. Service: `server/src/services/permissionService.ts` — `getUserPermissions(userId, role)` resolves: role caps → add allow-overrides → remove deny-overrides. Routes: `server/src/routes/permissions.ts` at `/api/permissions` — GET `/me` (current user's caps), `/capabilities`, `/roles`, `/roles/:id/capabilities`, `/user-overrides`, `/all-user-overrides` — all admin-only except `/me`. Admin UI: `/admin/roles-permissions` (`client/src/pages/admin/RolesPermissionsPage.tsx`) — Roles tab shows role list with capability counts, capability checkbox editor grouped by category with expand/collapse; User Overrides tab shows all overrides with add/remove UI. Client hook: `client/src/hooks/usePermissions.ts` — `can(key)` helper for frontend gating.
- **Monthly Financial Review Module**: Comprehensive slide-format monthly business review system. Three views: (1) `/financial-review` — single-page scrollable dashboard (`FinancialReviewPage.tsx`) with live KPIs, AR aging, QMS metrics, BD pipeline, action items, narrative sections, per-section "last fetched" timestamps, and print/PDF CSS; (2) `/financial-review/sessions` — session list (`FinancialReviewListPage.tsx`); (3) `/financial-review/sessions/:monthKey` — 16-slide presentation navigator (`FinancialReviewSlidePage.tsx`). Backend: `financial_review_sessions` table (boot migration) stores month_key, action_items/bd_pipeline/calendar_events JSONB. Routes: `server/src/routes/financialReview.ts` at `/api/financial-review` — CRUD + `GET /summary` (aggregates revenue from payments, OTD from all_orders, NCR count, customer satisfaction 12-mo/30-day, AR aging balance from ar_invoices+ar_payment_allocations, customer return rate from refund_requests, project pipeline by stage from projects table) + live endpoints (shipments/revenue/kpis/customer-score). Config: `client/src/config/financialReviewConfig.json` (version 2026-02) with narrative section schema and Feb 2026 sample data. Access control: `ROLE_ROUTE_ACCESS` in `routeAuthorization.ts` grants ADMIN/OWNER/FINANCE access.
- **AR Aging Dashboard**: `/finance/ar-aging` page with color-coded aging bucket cards (Current, 1-30, 31-60, 61-90, 90+) and per-customer aging breakdown table. Endpoints: `GET /api/ar-invoices/aging` (totals), `GET /api/ar-invoices/aging/by-customer` (by customer), `GET /api/ar-invoices/customer-summary/:customerId`. Three AR metrics registered in metricsService: `ar_total_outstanding`, `ar_overdue_count`, `ar_open_invoice_count` — all use balance-based filtering (total - payments > 0) for consistency with aging queries.
- **Pipeline Validation Engine**: Validates production pipeline by comparing derived stage (from completion timestamps) against `current_department`. Service: `server/src/services/pipelineValidationService.ts` — exports `PIPELINE_STAGES`, `derivePipelineStage(order)`, `validatePipelineState()`. Detects: PIPELINE_DRIFT, STAGE_REGRESSION, SKIPPED_STAGE. Respects skip rules (flattop→skip CNC/Gunsmith, no_rail→skip Gunsmith, no_stock→skip to Shipping QC). Runs every 5 minutes alongside queue integrity background worker. API: `GET /api/admin/pipeline-validation` (full report), `GET /api/admin/pipeline-validation/status` (summary). UI: Pipeline Validation tab in Queue Integrity Monitor (`/admin/queue-integrity`).
- **Pipeline Repair Engine**: Safe auto-repair for PIPELINE_DRIFT and STAGE_REGRESSION issues only (SKIPPED_STAGE and STALLED_ORDER require manual review). Service: `server/src/services/pipelineRepairService.ts` — exports `repairPipelineDrift(orderId)`, `batchRepairPipelineDrift()`. Updates `current_department` to match derived stage and logs to `admin_audit_log`. Batch limit: 200 orders per run. API: `POST /api/admin/pipeline-repair/:orderId` (single), `POST /api/admin/pipeline-repair/batch` (batch with safety limit).
- **Production Control Tower**: Real-time operational dashboard at `/admin/control-tower`. Page: `client/src/pages/admin/ProductionControlTower.tsx`. Top cards: Active Orders, Pipeline Errors, Queue Errors, Stalled Orders (14+ days without update). Six sections: (1) Department Heatmap — order count, avg days, standard time, status with bottleneck coloring. (2) Stuck Orders Inspector — top 50 orders exceeding department time thresholds, red highlight for 2x threshold. (3) Production Throughput — completion counts for today/week/month. (4) Department Cycle Times — avg stage-to-stage durations with threshold highlighting. (5) Schedule Risk — predictive completion dates with ON_TRACK/AT_RISK/LATE classification, shows late and at-risk orders. APIs: `GET /api/admin/production-heatmap`, `GET /api/admin/stuck-orders` (50-row limit, joins customers for names), `GET /api/admin/throughput-analytics` (60s cache, filters negative durations), `GET /api/admin/order-forecast` (500-order limit, respects skip rules). Cross-linked from Queue Integrity Monitor.
- **Production Forecast Engine (Canonical)**: Service at `server/src/services/productionForecastService.ts`. Computes projected completion dates by summing average cycle times for remaining pipeline stages. Uses actual throughput data (5-min cache) with fallback averages. Respects all skip rules (flattop, no_rail, no_stock) from validation engine. Risk classification: LATE (projected > due date), AT_RISK (< 3 days margin), ON_TRACK. Excludes terminal statuses. **Model-Dependent Forecasting**: Uses 3-tier cycle time priority: (1) `model_department_stats` table (per-model per-department averages from historical data), (2) department-level historical averages, (3) hardcoded fallbacks. `model_department_stats` table rebuilt every 4 hours by `server/services/modelStatsAggregator.ts` (minimum 5-sample threshold). **Weighted Queue Calculation**: Backlog uses `model_queue_weights` table to weight orders by model complexity (e.g., adjustable=1.4, ultralight=0.7, default=1.0) instead of raw COUNT(*). Both engines (canonical and legacy) use weighted queues. **Pre-order simulation**: `simulateNewOrder({ model_id, is_flattop, features })` computes projected completion with model-aware cycle times, weighted backlog modeling (5-min cache), and business day math; returns `suggestedDueDate`, `estimatedCycleDays`, `backlogDelayDays`, `totalBusinessDays`, `confidence`, `stageDurations` (per-department), `modelSpecific` (boolean), `modelReasons` (detailed per-department reasoning). Adjustable model +10 day penalty only applies when no model-specific history exists. APIs: `GET /api/admin/order-forecast` (batch, 500 limit), `GET /api/admin/order-forecast/:orderId` (single), `POST /api/admin/order-forecast/simulate` (pre-order). CSR integration: `OrderEntry.tsx` calls simulate endpoint when model/flattop changes, shows weeks-based estimate with model-specific reasoning. `ForecastDateModal.tsx` shows production timeline with per-department dates based on real stage durations. Manual override still supported. Simulation logs stored in `forecast_simulation_logs` table. Legacy engine at `server/services/productionForecastEngine.ts` still serves `/api/forecast/*` routes (dashboard, weekly, drift detection) — also upgraded to use `model_department_stats` and weighted queues.

- **PWA & Offline Support**: Service worker registered at startup (production only) via `client/src/utils/pwa.ts`. Service worker (`client/public/sw.js`) caches static assets (cache-first) and uses network-first with `/index.html` fallback for SPA navigation; `/api/*` is never cached. Install prompt captured for manufacturing floor tablets. Offline mutation queue infrastructure in `client/src/offline/` using Dexie (IndexedDB): `offlineDB.ts` defines `epochOfflineDB` with `mutation_queue` table, `mutationQueue.ts` provides `queueMutation()`, `getPendingMutations()`, `getRetryableMutations()`, `markMutationSynced()`, `markMutationFailed()`, `markMutationPending()`, `incrementRetryCount()`, `clearQueue()`. Mutations have typed status (`'pending' | 'synced' | 'failed'`). Sync engine (`client/src/offline/syncEngine.ts`) replays pending mutations to `POST /api/offline/replay-event` with idempotency keys, 30s polling interval + `online` event trigger, max 10 retries, non-retryable 4xx errors fail immediately, idempotent start/stop lifecycle. Server endpoint (`server/src/routes/offlineReplay.ts`) dispatches replayed events to internal Express routes (MOVE_ORDER, COMPLETE_OPERATION, QC_PASS, SHIP_PACKAGE, CLOCK_IN, CLOCK_OUT) with event type allowlist and idempotency dedup (only on success). `performMutation()` (`client/src/offline/performMutation.ts`) wraps API calls: online=direct API call, offline=queue to IndexedDB with optimistic UI callback, mid-request connection loss=fallback to queue. Idempotency key preserved from creation through queue and replay. `useOrderActions.ts` progressOrderMutation and `useTimeClock.ts` clockIn/clockOut use `performMutation`.

### Technical Implementations
- **Frontend**: React 18, TypeScript, Vite, ShadCN UI, Tailwind CSS, Framer Motion, Wouter.
- **Backend**: Express.js, TypeScript, TanStack Query, Zod, Axios.
- **Database**: PostgreSQL (Neon serverless), Drizzle ORM, Drizzle-kit.
- **Security**: Dual-condition authentication bypass for development, global API authentication, JWT secret in production, bcrypt password hashing, Zod input validation, backend middleware mirroring frontend permissions, admin-only routes, and feature flags. All new tables use UUID for primary keys.

## External Dependencies

### Database
- PostgreSQL
- Drizzle ORM

### UI Framework
- React 18
- ShadCN UI
- Tailwind CSS
- Framer Motion

### Backend Dependencies
- Express.js
- TanStack Query
- Zod
- Axios

### Third-Party Services
- SmartyStreets (Address Validation)
- Authorize.Net (Payment Gateway)
- Accept.Blue (Credit Card Processing)
- UPS API (Shipping)
- SendGrid (Email)
- Twilio (SMS)
- Google Calendar (Event Integration)
- Google Drive (File Access and PDF Processing)
- Google APIs
- Azure Document Intelligence (AI-powered document analysis)
- Microsoft Azure AD / MSAL (OAuth authentication)
## Document Vault (CUI/ITAR Classification)

### Overview
Secure document storage with file-level access controls and CUI/ITAR classification labels.

### Features
- Four classification levels: Public, Internal, CUI (Controlled Unclassified Information), ITAR (Export Controlled)
- Document scoping: organization-wide, project-specific, or department-specific
- Server-side ACL enforcement on every download request
- Admin-managed access grants for CUI/ITAR documents
- Access-denied events emitted to audit log on blocked download attempts

### Files
- `server/src/routes/vault.ts` — API endpoints (list, upload, download, access management)
- `client/src/pages/VaultPage.tsx` — UI with upload dialog, classification legend, and admin access panel
- `server/replit_integrations/object_storage/objectAcl.ts` — Extended ObjectAccessGroupType enum (USER_LIST, PROJECT, DEPARTMENT)
- `server/schema.ts` — vault_documents and vault_access_grants Drizzle table definitions
- Database tables: `vault_documents`, `vault_access_grants` (created by boot runner in server/index.ts)
- Route: `/vault` (client), `/api/vault/*` (server)

## CMMC 2.0 Level 2 Readiness (SSP)

### Overview
Complete CMMC 2.0 Level 2 (NIST SP 800-171 Rev 2) control mapping and System Security Plan (SSP) readiness system for admin/owner roles.

### Features
- All 110 NIST SP 800-171 Rev 2 practices across 14 control families (AC, AT, AU, CM, IA, IR, MA, MP, PE, PS, RA, SA, SC, SI)
- Evidence mapping linking each practice to in-system evidence (audit logs, DCAA forensic rules, RBAC, vault documents)
- Status tracking: Implemented / Partial / Planned / Not Applicable per practice
- Attestation support: admins can mark practices as attested with timestamp
- Policy document attachment fields (policyDocumentId, policyDocumentName)
- Family coverage cards with progress bars
- Searchable/filterable practice list with evidence badges
- Edit dialog for updating status, notes, and attestation
- SSP JSON export download

### Files
- `server/src/services/cmmcControlTaxonomy.ts` — 110 practice definitions
- `server/src/services/cmmcEvidenceMapping.ts` — evidence links and seeded statuses
- `server/src/routes/cmmc.ts` — REST API (summary, list, detail, PATCH, JSON export)
- `client/src/pages/admin/CmmcDashboard.tsx` — Admin dashboard UI
- Database table: `cmmc_control_status` (created and seeded by boot runner in server/index.ts)
- Route: `/admin/cmmc` (client), `/api/cmmc/*` (server, ADMIN/OWNER only)

## Proteus Labs — AI Prompt Library (Migration 0081)

Admin/Owner-only internal tool for storing, organizing, and executing AI prompts.

**Tables:** `proteus_prompts`, `proteus_prompt_variables`, `proteus_prompt_executions`, `proteus_prompt_results`, `proteus_prompt_tags`

**Enums:** `proteus_prompt_category` (small, feature, large_architecture, audit, emergency, deployment, skill_builder), `proteus_execution_status` (pending, success, failure, noted)

**Backend routes** (`/api/proteus-labs/*`): Full CRUD for prompts, executions, results. Protected by `authenticateToken + requireExecutiveAccess`. Usage count auto-increments on execution.

**Frontend pages** (`/proteus-labs/*`):
- Dashboard: Search/filter library, recent prompts, most used, execution highlights
- Prompt Builder (`/proteus-labs/new`, `/proteus-labs/:id/edit`): Create/edit with auto-detected `{{token}}` variable support
- Prompt Detail (`/proteus-labs/:id`): Fill variables, generate resolved output, copy to clipboard, paste result back, track execution history
- Execution History (`/proteus-labs/history`): Global execution log with status filters and pagination

**Permissions:** ADMIN/OWNER only. Registered in `ROLE_ROUTE_ACCESS` in `userPermissions.ts`. Nav button in `Navigation.tsx` gated by role.

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `PORTAL_TOKEN_SECRET` | Yes | HMAC-SHA256 signing key for payload-based employee portal tokens. Must be set before any salaried portal links are generated. A cryptographically random 48-byte hex value is recommended. Set as a shared env var. |

## Phase E — Labor Cost Reconciliation Script

### Overview
`server/scripts/phaseECostReconciliation.ts` runs both costing models against real `punch_ledger` and `labor_allocations` data and produces a side-by-side report. Finance uses this to understand where cost attribution differs between the legacy model and the new allocation model before Phase F switches the live read path.

**Legacy model:** Total session hours × employee rate → full cost attributed to the single `chargeCodeId` on the `punch_ledger` row.

**Allocation model:** For each closed `labor_allocations` segment, segment hours × employee rate → cost attributed to that segment's `chargeCodeId`. Multiple segments per session produce a cost split across charge codes.

Both models use the same rate resolution chain: `hourlyRate` → `salary / 2080` → `defaultLaborRate` fallback (from `estimating_defaults`).

### Running the Script

```bash
# Current bi-weekly pay period (default, anchored to 2024-01-01)
npx tsx server/scripts/phaseECostReconciliation.ts

# Specific date range
npx tsx server/scripts/phaseECostReconciliation.ts --from 2025-01-01 --to 2025-01-31

# With JSON output file
npx tsx server/scripts/phaseECostReconciliation.ts --from 2025-01-01 --to 2025-01-31 --output /tmp/phase-e-results.json
```

### Interpreting the Output

| Column | Meaning |
|---|---|
| `SessionID` | `punch_ledger.id` |
| `EmpID` | `employees.id` |
| `Date` | Clock-in date |
| `Hours` | Total closed session hours |
| `Rate` | Resolved hourly rate |
| `CC (Legacy)` | Charge code on the `punch_ledger` row (legacy attribution) |
| `Cost(Legacy)` | Total session cost under the legacy model |
| `CC (Split)` | Charge code(s) from `labor_allocations` segments |
| `Cost(Split)` | Cost attributed to each charge code in the allocation model |
| `Delta` | `cost_legacy − cost_split`; should be ~$0.00 for healthy sessions |
| `Status` | `OK` = reconciles, `N/A` = no allocation rows (coverage gap), `ERR` = cost discrepancy (data integrity problem) |

**Session status meanings:**
- **OK** — allocation data exists and both models agree on total cost (within $0.01). This is the normal state.
- **N/A** — no `labor_allocations` rows found for this session. This is a coverage gap (pre-dual-write historical data), **not** an integrity error. Run `backfillLaborAllocations.ts` to fill these gaps.
- **ERR** — allocation data exists but the cost totals differ by more than $0.01. This is a data integrity problem that must be investigated before Phase F.

**Summary block:**
- *Total cost (legacy model)* and *Total cost (allocation model)* are summed only over sessions that have allocation data on both sides. They must match within $0.01 — same hours, same rates, just different attribution.
- *Cost reallocated across charge codes* is the financial insight: how much cost is moving from the legacy charge code to other codes due to mid-session job switches.

### Exit Codes
- `0` — all sessions with allocation data reconcile (safe to proceed to Phase F). N/A sessions do not affect exit code.
- `1` — one or more sessions with allocation data have a cost discrepancy (ERR status). Investigate before Phase F.

### Pre-requisites
Sessions without `labor_allocations` rows (pre-dual-write historical data) show as `N/A` and are excluded from integrity checks. Run `npx tsx server/scripts/backfillLaborAllocations.ts` first to generate allocation rows for those sessions before running this report.
