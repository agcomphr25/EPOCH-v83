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
- **BOM System**: Robust Bill of Materials with UUID architecture and revision control.
- **Order Management**: Atomic order ID reservation, rush fees, urgency/priority system, path-based signature email architecture, and card-before-save flow.
- **Inventory & Production**: Parts list management, Purchase Orders, vendor POs, inventory CSV import, enhanced layup scheduling, and FIFO-based packet building with AS9100 traceability via barcode scanning. Includes dynamic inventory thresholds and demand-filtered BOM assignment. Three-layer Parts Request/Order/Receiving architecture.
- **Quality Control**: Nonconformance Record System, Vendor Evaluation System, and Hard QC Stop enforcement with authorized deviation approval workflow.
- **P2 Serialized Item Tracking**: Complete serialized item tracking for P2 purchase orders with customizable workflows, barcode scanning, traceability gating, Traveler Viewer, Electronic Signature System, department data editing (self-edit while in department, admin-only after close), and notes at any workflow stage. Supports late-finalization pattern: items carry `buildFamilyKey` (generic identity) through production, with `sku`, `drawingName`, `customerSerialNumber`, and `partRoutingId`/`partRoutingRevision` assigned at Shipping QC finalization gate. `finalizedAt`/`finalizedBy` provide audit-grade identity lock. Traveler step completion now syncs P2 serialized item department via `syncP2SerializedItemOnStepComplete` in `server/src/routes/travelers.ts` — both regular step signing and admin force-sign trigger the sync with race-condition guard (WHERE currentStageIndex match) and department alias normalization. **Captured Data Display**: Shared `TravelerCapturedData` component (`client/src/components/p2/TravelerCapturedData.tsx`) renders full step/task/field data from travelers in both P2TravelersTab (expandable inline rows) and P2TravelerViewer (dedicated "Captured Data" tab). Supports lookup by traveler ID or serial number via `GET /api/travelers/by-serial/:serialNumber`. **Material Traceability Enrichment**: The Traveler Viewer Material Traceability tab enriches raw traceability records with data from `inventory_items` (material name, AG part #, source, supplier part #) and `cutting_fabric_inventory` (fabric type, nickname, lot/roll/batch numbers, ICN, manufacture/expiration dates, freezer/location, supplier PO, status). Matching is done server-side in `p2TravelerViewer.ts` by `inventoryPartId` for inventory items and by value matching (lot/roll/batch/barcode/ICN) for fabric inventory.
- **Financial & Reporting**: Cost Center Management, dynamic discount system, Credit Memo Management, Payment Analytics, Historical Data Module, and Refund Request/Queue.
- **PDF Management**: Centralized PDF configuration, flexible Template Library System, and unified `orderPdfService` for intent-based PDF generation using frozen order snapshots. Supports "Resend Signature Email" and "Send Updated Order for Signature" with supersession tracking.
- **Smart Data Entry**: Streamlined traceability with recent lot number recall, autocomplete, and barcode quick-fill.
- **Control Centers**: Unified interfaces for P2 Purchase Orders and Cutting Table with dashboards, wizards, and progress tracking. P2 PO BOM completion auto-generates production orders including Cutting Table packet demands — any BOM component with `is_packet=true` in inventory automatically creates a Cutting Table production order regardless of item type, which then appears in the Weekly Cutting Schedule P2 packet demands section. P2 Control Center includes a Shipping tab (`P2ShippingTab`) showing units in the shipping pipeline (Final QC, Shipping, Completed), grouped by PO, with inline finalization (SKU/Drawing assignment) and status tracking. Production Timer endpoints (`server/src/routes/productionTimers.ts`) use a shared `resolveUserId` helper that resolves identity from session auth, numeric ID, username, or employee badge code (employeeCode → employees → linked users record) — ensuring timer start/pause/resume/advance/stop all work from badge-authenticated P2 traveler shortcut pages in production.
- **Order Audit System**: Comprehensive audit tracking for P1 orders and P2 serialized items with configurable event categories, field change detection, and department transition timing.
- **Media Library System**: Centralized image storage with camera capture, file upload, reference-based attachments, and hierarchical folder organization with role-based access control.
- **Document Scanner**: Built-in scanning with OpenCV.js for automatic edge detection, perspective correction, image enhancement, and PDF conversion.
- **Voice Notes System**: Voice-activated note recording for production issues with automatic order ID extraction, issue categorization, and resolution tracking.
- **Customer Watch Rules System**: Configurable monitoring rules for tracking customer orders through departments with multi-person visibility sharing.
- **Time Clock Integration**: External Time Clock system integration with canonical identity management, punch event mirroring, and labor analytics.
- **Attention & State-Confidence System**: Cross-domain system tracking confidence in the current state of work using `lastConfirmedAt`, `lastConfirmedByUserId`, `confirmationNote`, and `attentionRisk` fields. Features "Confirm Status" actions, configurable staleness rules, and an Admin Attention Dashboard.
- **Real-Time WebSocket Notifications**: WebSocket server attached to the HTTP server on `/ws/notifications` for targeted notifications on ticket assignment/unassignment.
- **Fillable PDF Templates System**: MVP for customer fill-and-sign workflow, allowing admins to upload PDF templates with field definitions and create instances for customers via public signature links.
- **Central QR Code System**: Generates and resolves QR codes to entity-specific routes based on user role, logs scan events, and provides admin CRUD UI.
- **Asset Management & Work Order System**: Comprehensive asset tracking with hierarchical categories, physical locations, and generalized work orders. Supports state transitions, parts tracking, file attachments, and downtime tracking. Integrates with Preventive Maintenance schedules.
- **Routing Document Management System**: AI-powered document management for P2 Control Center supporting work instructions, spec sheets, and traveler templates.
- **Form Draft Persistence & Unsaved Changes Warning**: Reusable hooks (`useFormDraft`, `useUnsavedChangesWarning`) for localStorage-based auto-save drafts and browser `beforeunload` warnings.
- **Centralized Address Domain Service**: All address creation and updates flow through `addressService.ts` which normalizes inputs and validates via SmartyStreets US Street API, returning validation status.
- **Canonical Material & Source Snapshot**: `production_orders` table includes `material_canonical` (TEXT, derived from stock model ID prefix at creation) and `source_snapshot` (JSONB, immutable record of PO state at creation). Canonical material is derived by `server/src/utils/deriveCanonicalMaterial.ts` from stock model ID prefixes (cf_=Carbon Fiber, fg_=Fiberglass, m1a_=M1A, apr_=APR, mesa_=Fiberglass). Both creation paths (route handler at `server/src/routes/index.ts` and `storage.generateProductionOrdersFromPO`) set these fields. The `validColumns` whitelists and `productionOrdersColumns` in `server/storage.ts` include both new fields.
- **Training Builder Module**: Self-contained training program management using Train-the-Trainer methodology, including structured program definitions, task-based learning, content library, employee assignments, session tracking, and certification workflow.
- **Epoch 4-Step Training System**: Comprehensive training management using the 4-step methodology, with AI-generated training plans and quizzes, sequential step completion, and automatic traveler authorization.
- **Employee Onboarding System**: Admin-driven employee onboarding with configurable paths, intake forms, session lifecycle management, and atomic finalization. Features include configurable paths with fillable PDF templates, fixed-schema demographics, tablet-first UI, step locking, session lifecycle management, transactional finalization, re-hire workflows, preflight validation, comprehensive audit trail, PDF bundle generation, email distribution, employment periods tracking, and employer signature system.

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