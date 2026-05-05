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
*   **Required Environment Variables:**
    *   `DATABASE_URL`: PostgreSQL connection string.
    *   `PORTAL_TOKEN_SECRET`: HMAC-SHA256 signing key for employee portal tokens (random 48-byte hex recommended).
    *   `SALARIED_DRAFT_ENTRY_ENABLED`: Feature flag for salaried manual time entry (`true`/`false`, defaults `false`).
    *   `PUNCH_LEDGER_CUTOVER_DATE`: ISO date (YYYY-MM-DD) for payroll hour computation switch (default `2024-01-01`).
    *   `TIMEKEEPING_DCAA_EFFECTIVE_DATE`: ISO date for DCAA compliance scoring (default `2026-06-01`).

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
*   **Shared Types/Schemas:** `server/src/lib/` (e.g., `timekeeping-zod.ts`)
*   **User Permissions (Source of Truth):** `userPermissions.ts`
*   **Architecture Constitution:** `docs/EPOCH_ARCHITECTURE_CONSTITUTION.md`
*   **Payroll Export Design:** `docs/payroll-export-design.md`
*   **Financial Review Config:** `client/src/config/financialReviewConfig.json`
*   **User Identity Layer:** `server/identity/userIdentity.ts`
*   **PWA Service Worker:** `client/public/sw.js`
*   **Offline Mutation Queue (IndexedDB):** `client/src/offline/`
*   **Control Tower Service:** `server/src/services/controlTowerService.ts`
*   **CMMC Control Taxonomy & Evidence Mapping:** `server/src/services/cmmcControlTaxonomy.ts`, `server/src/services/cmmcEvidenceMapping.ts`

## Architecture decisions

*   **Unified Labor Pipeline:** The single authorized labor pipeline is `punch_ledger` → `charge_codes` → `labor_approvals` → GL → payroll → DCAA. All cost attribution must follow this FK chain.
*   **UUID Primary Keys:** All new database tables use UUIDs for primary keys to ensure global uniqueness and prevent integer overflow issues.
*   **PWA & Offline-First:** Implemented a robust PWA architecture with a service worker and IndexedDB-based offline mutation queue to ensure high availability and responsiveness, especially for manufacturing floor tablets.
*   **Capability-Based Access Control:** A database-driven permission layer (`perm_capabilities`, `perm_roles`, `perm_role_capabilities`, `perm_user_overrides`) complements file-based permissions for fine-grained, dynamic access management.
*   **Atomic Order ID Reservation:** Order IDs are reserved atomically to prevent race conditions and ensure unique identifiers for each order.
*   **No Dual-Pool Patterns:** Explicitly deprecated standalone modules and dual-pool database connection patterns (e.g., `modules/timekeeping/`). All system components must use the single `db` instance from the main server.
*   **"Delete-First" Agent Implementation:** When re-architecting, the approach is to delete deprecated patterns and redesign, rather than creating compatibility layers, to maintain architectural purity and prevent technical debt.

## Product

*   **Order Management:** End-to-end order processing with atomic ID reservation, rush fees, priority system, path-based signature emails, and card-before-save flows.
*   **Inventory & Production:** Parts list management, POs, inventory CSV import, FIFO packet building with AS9100 traceability, dynamic inventory thresholds, demand-filtered BOM assignment, and cutting table management with barcode scanning.
*   **Quality Control:** Nonconformance Record System, Vendor Evaluation, Hard QC Stops with authorized deviation workflows.
*   **Employee Portal:** Employee-facing interface for timekeeping, PTO requests, and salaried time entry.
*   **BOM System:** Supports both robust revision-controlled BOMs and a simpler P2 BOM Wizard, with a fallback mechanism for production order generation.
*   **Timekeeping & Payroll:** DCAA-compliant employee time certification (hourly/salaried), salaried manual draft time entry, WAD-based labor charging enforcement, and a robust payroll export system with audit trails.
*   **Project & Task Management:** Flexible project workflow steps (skip, reopen, status tracking), P2 Pipeline Board (Kanban), PM Control Center for project health visibility.
*   **Financial & Reporting:** Cost Center Management, dynamic discounts, Credit Memo Management, Payment Analytics, Historical Data Module, Refund Request/Queue, AR Invoice and Payment Allocation systems, Monthly Financial Review module, AR Aging Dashboard.
*   **Forecast & Simulation:** Discrete Event Simulation (DES) forecast engine, self-learning cycle time engine, and forecast accuracy tracking.
*   **Compliance & Security:** Document Vault with CUI/ITAR classification, CMMC 2.0 Level 2 readiness system, comprehensive audit systems.
*   **AI Integration:** AI-powered prompt library, AI + Template-driven Production Control Wizard for routing/traveler/QC template recommendations.
*   **User Interface:** Modern, responsive UI with ShadCN UI, Tailwind CSS, and Framer Motion for animations.

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

*   **DCAA Compliance:** Before implementing anything touching labor, WAD, GL, burden, payroll, traveler, PM dashboard, DCAA, or compliance, **you must read `docs/EPOCH_ARCHITECTURE_CONSTITUTION.md`**. Failure to do so is a constitution violation.
*   **Timekeeping `punch_ledger` vs. `timekeeping.punches`:** Hour computations for payroll use `punch_ledger` for periods on or after `PUNCH_LEDGER_CUTOVER_DATE` and `timekeeping.punches` for periods before. Never both.
*   **Legacy Payroll Export:** The `GET /api/timekeeping/admin/export/gusto` route now serves pre-generated, immutable CSV batches with checksum verification, not fresh computations.
*   **P2 PO Locking:** Locked P2 Purchase Orders (via `locked_at`/`locked_by`) block all edit/delete actions except for attachment management.
*   **BOM PKs:** All BOM primary keys are UUIDs; never use `parseInt()` when referencing them.
*   **P2 Employee Data:** Portal employees require both a `timekeeping.employees` record (linked via `epochEmployeeId`) and a `users` record (linked via `users.employeeId`) for `createdBy` FKs; missing either results in a 403.
*   **WAD Labor Charging Phase 1 (WARN):** Budget overrun or certification issues are currently only warnings and do not block sessions, but are recorded for supervisor review.

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
*   **SmartyStreets API Documentation:** _Populate as you build_
*   **NIST SP 800-171 Rev 2:** [https://csrc.nist.gov/publications/detail/sp/800-171/rev-2/final](https://csrc.nist.gov/publications/detail/sp/800-171/rev-2/final)