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

## System Architecture
The application is a full-stack TypeScript monorepo designed for type safety, data consistency, and cross-platform compatibility with PWA support via Capacitor.

### Core Architectural Decisions
- **Type Safety & Data Consistency**: Shared TypeScript schemas (Drizzle, Zod) and a `features` object as a single source of truth.
- **Authentication**: Hybrid JWT + Session authentication with a 3-role (ADMIN, EMPLOYEE, OWNER) capability-based access control system.
- **UI/UX**: Modern UI using ShadCN UI, Tailwind CSS, and Framer Motion.
- **BOM System**: Two BOM systems — (1) Robust BOMs (`boms`/`bom_revisions`/`bom_lines`) with revision control, (2) P2 BOM Wizard (`bom_definitions`/`bom_items`) for simpler definitions. Production order generation checks both systems (robust first, then P2 BOM Wizard fallback). All BOM PKs are UUIDs — never use parseInt().
- **Order Management**: Atomic order ID reservation, rush fees, urgency/priority system, path-based signature email architecture, and card-before-save flow.
- **Inventory & Production**: Parts list management, Purchase Orders, vendor POs, inventory CSV import, enhanced layup scheduling, and FIFO-based packet building with AS9100 traceability via barcode scanning. Includes dynamic inventory thresholds and demand-filtered BOM assignment. Cutting Table Dashboard supports packet barcode printing (MFG-{id}-{partNumber} format), scan-to-start workflow with BOM material display/ply schedule/cuts config, and BOM-validated material roll scanning (rejects non-matching materials). FIFO inventory recommendations shown when packet is scanned.
- **Quality Control**: Nonconformance Record System, Vendor Evaluation System, and Hard QC Stop enforcement with authorized deviation approval workflow.
- **P2 Serialized Item Tracking**: Complete serialized item tracking for P2 purchase orders with customizable workflows, barcode scanning, traceability gating, Traveler Viewer, Electronic Signature System, department data editing, and notes at any workflow stage.
- **Communication Governance Layer**: Centralized email control plane with templating, logging, audit capabilities, and robust HTML safety features including sanitization, style whitelisting, inline JS detection, placeholder validation, and size limits. Includes admin-editable Sign Order Page content settings (singleton `sign_order_page_settings` table) with a dedicated settings UI at `/sign-order-page-settings`.
- **Financial & Reporting**: Cost Center Management, dynamic discount system, Credit Memo Management, Payment Analytics, Historical Data Module, and Refund Request/Queue.
- **PDF Management**: Centralized PDF configuration, flexible Template Library System, and unified `orderPdfService` for intent-based PDF generation using frozen order snapshots.
- **Smart Data Entry**: Streamlined traceability with recent lot number recall, autocomplete, and barcode quick-fill.
- **Control Centers**: Unified interfaces for P2 Purchase Orders and Cutting Table with dashboards, wizards, and progress tracking, including P2 Control Center Shipping tab, Production Timer endpoints, and Off-System Production completion (marks items complete outside digital travelers, auto-creates completed traveler records for management visibility).
- **Order Audit System**: Comprehensive audit tracking for P1 orders and P2 serialized items with configurable event categories, field change detection, and department transition timing.
- **Media Library System**: Centralized image storage with camera capture, file upload, reference-based attachments, and hierarchical folder organization with role-based access control.
- **Document Scanner**: Built-in scanning with OpenCV.js for automatic edge detection, perspective correction, image enhancement, and PDF conversion.
- **Voice Notes System**: Voice-activated note recording for production issues with automatic order ID extraction, issue categorization, and resolution tracking.
- **Customer Watch Rules System**: Configurable monitoring rules for tracking customer orders through departments with multi-person visibility sharing.
- **Time Clock Integration**: External Time Clock system integration with canonical identity management, punch event mirroring, and labor analytics.
- **Accounting Shadow Layer**: Double-entry journal for wire payments, restricted to ADMIN.
- **Attention & State-Confidence System**: Cross-domain system tracking confidence in the current state of work using `lastConfirmedAt`, `lastConfirmedByUserId`, `confirmationNote`, and `attentionRisk` fields.
- **Real-Time WebSocket Notifications**: WebSocket server for targeted notifications.
- **Fillable PDF Templates System**: MVP for customer fill-and-sign workflow with public signature links.
- **Central QR Code System**: Generates and resolves QR codes to entity-specific routes based on user role, logs scan events, and provides admin CRUD UI.
- **Asset Management & Work Order System**: Comprehensive asset tracking with hierarchical categories, physical locations, generalized work orders, and integration with Preventive Maintenance.
- **Routing Document Management System**: AI-powered document management for P2 Control Center supporting work instructions, spec sheets, and traveler templates.
- **Executive Rundown System**: Glenn-only personal task management with daily rundown groups, priority tiers, carry-forward of overdue items, and rapid capture.
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
- **AR Invoice System (Phase 1)**: Historical invoice tracking module for P2 customers. Tables: `ar_invoices` and `ar_invoice_lines` (UUID PKs, cascade delete). Routes: `server/src/routes/arInvoices.ts` mounted at `/api/ar-invoices` with full CRUD. Server-side total calculation (subtotal + tax = totalAmount). Protected by `authenticateToken` + `requireAdminAccess`. UI: Invoice list (`/finance/invoices`), create/edit form (`/finance/invoices/new`, `/finance/invoices/:id/edit`), detail view (`/finance/invoices/:id`). Navigation under Finance dropdown. Permissions for ADMIN/OWNER roles. Separate from existing `invoice_numbers` packing slip system — uses `ar_` table prefix.

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