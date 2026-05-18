# EPOCH v8 - Manufacturing ERP System

EPOCH v8 is a comprehensive Manufacturing ERP system designed to streamline operations, enhance efficiency, and improve scalability for small manufacturing companies specializing in customizable products.

## Run & Operate

*   **Install Dependencies:** `npm install`
*   **Run Development Server:** `npm run dev`
*   **Build Project:** `npm run build`
*   **Typecheck:** `npm run typecheck`
*   **Generate Drizzle Migrations:** `drizzle-kit generate:pg`
*   **Push DB Schema:** `drizzle-kit push:pg`
*   **Run Phase E Cost Reconciliation Script:** `npx tsx server/scripts/phaseECostReconciliation.ts [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--output /path/to/file.json]`
*   **Backfill Traveler Signature Names (Task #203):** `npx tsx server/scripts/backfillTravelerSignatureNames.ts [--dry-run]` — finds traveler signatures whose `signed_by_name` is null, empty, or equals the raw badge code/identifier, looks up the employee by `badgeScan`/`signedBy` using the dash-stripped `REPLACE()` match, and updates `signed_by_name` to the employee's full name. Idempotent.
*   **Backfill Stuck Badge-Gate Tasks (Task #212):** `npx tsx server/scripts/backfillBadgeGateTasks.ts [--dry-run]` — finds traveler steps in `IN_PROGRESS` whose START-phase badge-named (`/badge/i`) CHECK/GATE_CHECK tasks are still `NOT_STARTED` (the result of an old bug that excluded `requiresCertification` tasks from auto-completion at step start) and marks them COMPLETED, attributing the completion to the step's `startedBy`/`startedAt`. Idempotent: re-runs are no-ops because already-COMPLETED tasks are skipped.
*   **Backfill RCC Putaway Adjustment Ledger (Task #260):** `npx tsx server/scripts/backfillRccAdjustmentLedger.ts [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--dry-run]` — scans `material_lot_transactions` rows of type `ADJUST` with `referenceType='received_unit_adjustment'` (RCC putaway/edit corrections) and writes any missing `inventory_transaction_ledger` ADJUST rows so corrected receipts (e.g. PO `PCV-20260514`) appear in the Material Traceability Viewer. Keyed by `receiving:rcc-adjust:${unitId}:${newQuantity}` to match the live writer; cross-source dedupe also skips rows the generic MLT backfill already covered. Idempotent.
*   **Backfill Superseded WAD Work Orders (Task #258):** `npx tsx server/scripts/backfillSupersededWadWorkOrders.ts [--dry-run]` — sweeps every project with at least one linked P2 PO (`projects.po_id` or `project_steps.linked_p2_order_id`) and cancels any active `production_work_orders` row whose `part_number` is already covered by a P2 PO item on that project. Each cancellation writes a `WAD_WO_SUPERSEDED_BY_P2` event to the unified audit ledger (`auditEventService.recordAuditEvent`) capturing the superseding P2 PO numbers. Idempotent: re-runs are no-ops because already-CANCELLED WAD WOs are skipped.
*   **Backfill Inventory Transaction Ledger (Task #183):** `npx tsx server/scripts/backfillInventoryTransactionLedger.ts [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--dry-run] [--source mlt|consumption|reservations|all]` — reconstructs ledger rows from `material_lot_transactions`, `traveler_material_consumption`, and `material_lot_reservations` so historical traveler chains (e.g. `roc2600007`) appear in the Material Traceability Viewer. Idempotent: re-runs are no-ops because each source row is keyed by `(sourceModule='backfill:<table>', sourceRecordId=<row id>)`. Note: `cutting_packet_session_lots` is intentionally NOT a source — cutting fabric has its own dedicated ledger.
*   **Required Environment Variables:**
    *   `DATABASE_URL`: PostgreSQL connection string.
    *   `PORTAL_TOKEN_SECRET`: HMAC-SHA256 signing key for employee portal tokens.
    *   `SALARIED_DRAFT_ENTRY_ENABLED`: Feature flag for salaried manual time entry (`true`/`false`).
    *   `PUNCH_LEDGER_CUTOVER_DATE`: ISO date (YYYY-MM-DD) for payroll hour computation switch.
    *   `TIMEKEEPING_DCAA_EFFECTIVE_DATE`: ISO date for DCAA compliance scoring.

## Stack

*   **Frontend:** React 18, TypeScript, Vite, ShadCN UI, Tailwind CSS, Framer Motion, Wouter.
*   **Backend:** Express.js, TypeScript, TanStack Query, Zod, Axios.
*   **Database:** PostgreSQL (Neon serverless).
*   **ORM:** Drizzle ORM, Drizzle-kit.
*   **Validation:** Zod.
*   **Build Tool:** Vite.

## Where things live

*   **Frontend Source:** `client/src/`
*   **Backend Source:** `server/src/`
*   **Database Schema:** `server/src/schema.ts`
*   **Migrations:** `migrations/`
*   **Shared Types/Schemas:** `server/src/lib/`
*   **User Permissions (Source of Truth):** `userPermissions.ts`
*   **Architecture Constitution:** `docs/EPOCH_ARCHITECTURE_CONSTITUTION.md`
*   **Written Policies Library:** `docs/policies/`, `server/src/services/policiesService.ts`
*   **Unified Audit Ledger:** `server/src/services/auditLedgerService.ts`, `docs/audit-evidence-policy.md`
*   **Burden Rates Engine:** `server/src/services/burdenRatesService.ts`, `docs/burden-rates-methodology.md`
*   **PWA Service Worker:** `client/public/sw.js`
*   **Offline Mutation Queue:** `client/src/offline/`

## Architecture decisions

*   **Unified Labor Pipeline:** `punch_ledger` → `charge_codes` → `labor_approvals` → GL → payroll → DCAA is the single authorized labor pipeline, ensuring all cost attribution follows this FK chain.
*   **UUID Primary Keys:** All new database tables use UUIDs for primary keys for global uniqueness and to prevent integer overflow.
*   **PWA & Offline-First:** Implemented with a service worker and IndexedDB-based offline mutation queue for high availability and responsiveness on manufacturing floor tablets.
*   **Capability-Based Access Control:** A database-driven permission layer (`perm_capabilities`, `perm_roles`, `perm_role_capabilities`, `perm_user_overrides`) provides fine-grained, dynamic access management.
*   **Atomic Order ID Reservation:** Order IDs are reserved atomically to prevent race conditions and ensure unique identifiers.
*   **Immutable Audit Trail:** Critical financial exports generate and store immutable CSVs with SHA-256 checksums for DCAA audit evidence.
*   **Indirect Burden Before GL:** Indirect cost pools are applied to direct labor cost records via the Burden Rates Engine before posting to GL, enforcing complete burdening of labor.

## Product

*   **Order Management:** End-to-end processing with atomic ID reservation, rush fees, priority, signature emails, and card-before-save flows.
*   **Inventory & Production:** Parts management, POs, inventory CSV import, FIFO packet building with AS9100 traceability, dynamic thresholds, BOM assignment, and cutting table management.
*   **Quality Control:** Nonconformance Record System, Vendor Evaluation, Hard QC Stops with authorized deviation workflows.
*   **Purchasing Controls:** Multi-stage approval, requisition-gated PO issuance, compliance checks (FAR/DFARS, debarment).
*   **Employee Portal:** Employee-facing interface for timekeeping, PTO requests, and salaried time entry.
*   **BOM System:** Supports both robust revision-controlled BOMs and a simpler P2 BOM Wizard.
*   **Timekeeping & Payroll:** DCAA-compliant time certification, salaried manual draft entry, WAD-based labor charging, and auditable payroll export.
*   **Project & Task Management:** Flexible project workflow, Kanban board, and PM Control Center.
*   **Financial & Reporting:** Cost Center Management, dynamic discounts, Credit Memo Management, Payment Analytics, Historical Data Module, Refund Request/Queue, AR Invoice and Payment Allocation, Monthly Financial Review, AR Aging Dashboard.
*   **Forecast & Simulation:** Discrete Event Simulation engine, self-learning cycle time engine, and forecast accuracy tracking.
*   **Compliance & Security:** Document Vault (CUI/ITAR), CMMC 2.0 Level 2 readiness, audit systems, Written Policies Library with immutable versions and employee acknowledgments.
*   **AI Integration:** AI-powered prompt library, AI + Template-driven Production Control Wizard for recommendations.
*   **User Interface:** Modern, responsive UI with ShadCN UI, Tailwind CSS, and Framer Motion.

## User preferences

*   Preferred communication style: Simple, everyday language.
*   Production constraints: Do not modify mold capacities or employee settings to unrealistic values. Use actual production capacity constraints for accurate scheduling.
*   Order finalization rules: Orders with "None" or empty stock models cannot be finalized and sent to the Production Queue. The system will block finalization with a clear error message.
*   Order identification: FB Order Numbers (like AK046) are stored in the fb_order_number field, not as the primary order_id. The actual order_id remains the AG series format (e.g., AG589 has FB Order #AK046).
*   Data integrity: Prevent orders from being saved with null/empty modelId fields to maintain consistency between draft and finalized order tables.
*   UI Performance: Department progression buttons use cache-first approach with disabled automatic refetching to prevent UI reversion issues.
*   Default shipping charge: Should be 36.95 for new orders.
*   Critical requirement: All completed functionality must be hard-coded to prevent loss of features and data.
*   Search standardization: All department queue pages use unified OrderSearchBox component with "Search orders by Order ID or FishBowl Number..." placeholder for consistent user experience.
*   Navigation dropdown behavior: All navbar dropdown menus close automatically after selection.
*   Balance due access: Customer balance due tracking is restricted to username "glennj" only for security. Balance Due column appears in Customer Management only when glennj is logged in.
*   EPOCH Overview: User preference to maintain EPOCH-Overview.md as a living document - update periodically when requested as system grows.
*   Tikka compatibility guardrails: On the Order Entry page, Tikka stock models ONLY show Tikka options for action inlet, barrel inlet, and bottom metal (with a green "Tikka only" badge). Non-Tikka stock models hide all Tikka options from these dropdowns. When switching between Tikka and non-Tikka models, incompatible selections are automatically cleared with a toast notification.
*   Navbar-permissions alignment: The userPermissions.ts file is the source of truth for user route access. Navigation.tsx filters navbar items based on these permissions. Users not in the permissions list default to only seeing the Employee Portal. Each user sees only their own dashboard in the User Dashboards dropdown (admins see all). Any new navbar items must be added to both Navigation.tsx AND the appropriate user permission lists in userPermissions.ts to stay in sync.

## Gotchas

*   **DCAA Compliance:** Before implementing anything touching labor, WAD, GL, burden, payroll, traveler, PM dashboard, DCAA, or compliance, **you must read `docs/EPOCH_ARCHITECTURE_CONSTITUTION.md`**.
*   **Timekeeping `punch_ledger` vs. `timekeeping.punches`:** Use `punch_ledger` for periods on or after `PUNCH_LEDGER_CUTOVER_DATE` and `timekeeping.punches` for periods before.
*   **Legacy Payroll Export:** `GET /api/timekeeping/admin/export/gusto` serves pre-generated, immutable CSV batches, not fresh computations.
*   **P2 PO Locking:** Locked P2 Purchase Orders block all edit/delete actions except attachment management.
*   **BOM PKs:** All BOM primary keys are UUIDs; never use `parseInt()`.
*   **P2 Employee Data:** Portal employees require both `timekeeping.employees` and `users` records.
*   **Timekeeping Dual-Pool Deprecation:** Do NOT introduce new imports from `modules/timekeeping/` or `tkDb`.
*   **Purchasing Controls Gate:** `POST /api/vendor-pos/:id/issue` enforces requisition-linkage, FAR flowdown checklist, and vendor debarment check freshness.
*   **Receiving → Inventory Transaction Ledger (Task #229 / #248):** Every receiving entry point — `POST /api/inventory/parts-requests/receive`, `POST /api/vendor-pos/items/:itemId/receive`, `POST /api/material-lots`, and the Receiving Control Center accept-unit path (`handleAcceptedUnit`) — MUST write a `RECEIVE` row to `inventory_transaction_ledger` inside the same `db.transaction` as its inventory mutations, so the ledger and the source-of-truth tables cannot diverge. Idempotency keys: `receiving:vendor-po` → `${poLineItemId}:${newCumulativeReceivedQuantity}` (vendor-PO storage treats the incoming `receivedQuantity` as a per-action delta and writes `newCumulative = prev + delta` under FOR UPDATE); `receiving:parts-request` → `${receiptId}:${orderLineId}` (composite of parent receipt id and business order-line id); `material-lots:create` → `${lot.id}`. The ITL `inventory_item_id` FK is NOT NULL — when a receiving line carries an AG part number but no matching `inventory_items` row, the receiver MUST call `ensureInventoryItemForReceipt(tx, …)` from `server/src/services/ensureInventoryItemForReceipt.ts` to atomically create a placeholder row and then write the ledger entry; silent `console.warn` + skip is forbidden. Truly ad-hoc lines (no AG part number) still bypass the ITL because there is no part identity to track. Use `recordInventoryLedgerEntry(input, tx)` from `server/src/services/inventoryTransactionLedgerService.ts`; the reference pattern is `handleAcceptedUnit` in `server/src/routes/receiving.ts`.

## Pointers

*   **EPOCH Architecture Constitution:** `docs/EPOCH_ARCHITECTURE_CONSTITUTION.md`
*   **Drizzle ORM Documentation:** [https://orm.drizzle.team/docs/overview](https://orm.drizzle.team/docs/overview)
*   **Zod Documentation:** [https://zod.dev/](https://zod.dev/)
*   **React Documentation:** [https://react.dev/](https://react.dev/)
*   **Tailwind CSS Documentation:** [https://tailwindcss.com/docs](https://tailwindcss.com/docs)
*   **ShadCN UI Documentation:** [https://ui.shadcn.com/docs](https://ui.shadcn.com/docs)
*   **Framer Motion Documentation:** [https://www.framer.com/motion/](https://www.framer.com/motion/)
*   **TanStack Query Documentation:** [https://tanstack.com/query/latest](https://tanstack.com/query/latest)
*   **Express.js Documentation:** [https://expressjs.com/](https://expressjs.com/)
*   **Dexie.js (IndexedDB wrapper) Documentation:** [https://dexie.org/](https://dexie.org/)
*   **NIST SP 800-171 Rev 2:** [https://csrc.nist.gov/publications/detail/sp/800-171/rev-2/final](https://csrc.nist.gov/publications/detail/sp/800-171/rev-2/final)
*   **Wouter Documentation:** [https://www.npmjs.com/package/wouter](https://www.npmjs.com/package/wouter)