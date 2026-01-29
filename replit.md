# EPOCH v8 - Manufacturing ERP System

## Overview
EPOCH v8 is a comprehensive Manufacturing ERP system designed for small manufacturing companies specializing in customizable products. Its primary purpose is to streamline operations, enhance efficiency, and improve scalability through end-to-end order management, robust inventory tracking, an employee portal, quality control workflows, a powerful Bill of Materials (BOM) system, Google OAuth integration, global search, and a comprehensive Parts List Management System. The vision is to be the leading ERP solution for small-to-medium customizable product manufacturers, offering a full-stack TypeScript PWA with a React frontend and Express backend, deployable to web and mobile platforms.

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
- **Type Safety & Data Consistency**: Utilizes shared TypeScript schemas (Drizzle, Zod) and a `features` object as a single source of truth.
- **Authentication**: Hybrid JWT + Session authentication with a 3-role (ADMIN, EMPLOYEE, OWNER) capability-based access control system.
- **UI/UX**: Modern UI using ShadCN UI, Tailwind CSS, and Framer Motion for a dynamic user experience.
- **BOM System**: Robust Bill of Materials with UUID architecture and revision control.
- **Order Management**: Features atomic order ID reservation, rush fees, and an urgency/priority system.
- **Signature Email Link Architecture**: Path-based signature URLs using `publicSignatureId` field to eliminate email client URL corruption.
- **Inventory & Production**: Includes parts list management, Purchase Orders, vendor POs, inventory CSV import, and enhanced layup scheduling.
- **Quality Control**: Nonconformance Record System and Vendor Evaluation System with automated scoring.
- **Cutting Table Operations**: FIFO-based packet building with two-phase allocation, AS9100 traceability via barcode scanning, dynamic inventory thresholds, packet scheduling, demand-filtered BOM assignment, and fabric inventory with conformance document support.
- **Bottom Metal Demand Tracking**: Explicit `bottom_metal_demands` table replaces fragile JSON feature string matching for machine shop demand reporting. Orders track `bottomMetalSource` (AG_SUPPLIES or CUSTOMER_OWNS). Idempotent `reconcileBottomMetalDemand` helper ensures demand records stay consistent with order features.
- **Barcode Strategy**: CODE128 for serialized items, CODE39 for regular orders.
- **P2 Serialized Item Tracking**: Complete P2 purchase order serialized item tracking with customizable workflows, barcode scanning, fail-closed traceability gating, a Traveler Viewer, and Electronic Signature System.
- **Financial & Reporting**: Cost Center Management, dynamic discount system, Credit Memo Management, Payment Analytics, Historical Data Module, and Refund Request/Queue.
- **Help Center**: FAQ-based system accessible via navbar.
- **PDF Management**: Centralized PDF configuration, flexible Template Library System, and unified `orderPdfService` with intent-based PDF generation using frozen order snapshots to prevent data drift.
- **Signature Email Workflow**: Supports "Resend Signature Email" (same document) and "Send Updated Order for Signature" (new snapshot, new `publicSignatureId`), with supersession tracking to ensure only one active unsigned `followup_order` per order.
- **Smart Data Entry**: Streamlined traceability with recent lot number recall, autocomplete, and barcode quick-fill.
- **Control Centers**: Unified interfaces for P2 Purchase Orders and Cutting Table with dashboards, wizards, and progress tracking.
- **Order Audit System**: Comprehensive audit tracking for P1 orders and P2 serialized items, including configurable event categories, field change detection, department transition timing, and a unified Audit Drawer.
- **Media Library System**: Centralized image storage with camera capture, file upload, reference-based attachments, and hierarchical folder organization with role-based access control. Includes a folder sidebar, document upload, and move-to-folder functionality using `media_folders` table for unlimited nesting.
- **Document Scanner**: Built-in scanning with OpenCV.js for automatic edge detection, perspective correction, image enhancement, and PDF conversion.
- **Voice Notes System**: Voice-activated note recording for production issues, with automatic order ID extraction, issue categorization, resolution tracking, and analytics dashboard.
- **Customer Watch Rules System**: Configurable monitoring rules for tracking customer orders through departments, with multi-person visibility sharing and dashboard integration.
- **Time Clock Integration**: External Time Clock system integration with canonical identity management, punch event mirroring, and labor analytics.
- **Filtered Orders Report**: Advanced order filtering and export tool with multi-select status, date range, customer exclusion, and CSV export.
- **Survey Engine**: Generic, reusable survey system with UUID-based tables, respondent and context abstraction.
- **P2 Projects Module**: Multi-step workflow tracking for P2 purchase orders with sequential step enforcement, project manager assignments, reminders, activity logging, and automatic notifications.
- **Ticket Assignment System**: Separate owner (creator) and assignee tracking for tickets, with internal message notifications and automated stale ticket reminders.
- **Ticket Engagement Tracking**: Non-invasive engagement auditing for tickets using `TICKET_VIEWED` and `TICKET_ACKNOWLEDGED` events via `auditService`. Tracks `viewedBy` JSONB field for determining `hasSeenLatestUpdate`. Session-based deduplication prevents excessive logging. Engagement metrics are exposed in ticket responses for admin visibility.
- **Attention & State-Confidence System**: Cross-domain system for tracking confidence in the current state of work without surveillance-style metrics. Answers "Do we have confidence in the current state of work?" through:
  - **Shared Engagement Primitives**: All applicable entities (tickets, orders, QC items, production delays) track `lastConfirmedAt`, `lastConfirmedByUserId`, `confirmationNote`, and `attentionRisk` fields.
  - **State Confirmation**: Low-friction "Confirm Status" action marks state as still accurate without requiring comments, resets `attentionRisk`.
  - **Staleness Rules**: Configurable thresholds per entity type and status (via `stalenessConfig` table). Computes risk levels (low/medium/high) based on time since last confirmation.
  - **Audit Events**: `ENTITY_VIEWED`, `ENTITY_CONFIRMED`, `ENTITY_STATE_STALE`, `ATTENTION_RISK_ESCALATED` logged via auditService.
  - **Production Delays Table**: New `productionDelays` table for active blockers requiring periodic confirmation with delay type, department, and resolution tracking.
  - **Admin Attention Dashboard**: Unified dashboard (`/admin/attention`) showing risk levels across all domains with confirm actions. Explicitly does NOT show page clicks, mouse activity, or time-on-page.
  - **Core Principle**: Measures awareness, confirmation, and staleness of state. Does NOT measure effort.
- **PDF Signature Tool**: Internal utility for signing PDFs with drag-and-drop signature positioning.
- **Fillable PDF Templates System**: MVP for customer fill-and-sign workflow. Admin uploads PDF templates with field definitions, creates instances for customers via public signature links. Customer fills form fields and signs via signature canvas. Uses `pdf-lib` for PDF manipulation.
- **Central QR Code System**: Generates QR codes with public identifiers, resolves them to entity-specific routes based on user role, logs all scan events via audit service, and provides admin CRUD UI. Supports 10 entity types. Enforces environment safety with QR_ENV_MISMATCH audit events.
- **Routing Document Management System**: AI-powered document management for P2 Control Center supporting work instructions, spec sheets, and traveler templates, including AI parsing, generation, template learning, and linking to part routings and certifications.
- **Training Builder Module**: Self-contained training program management system using Train-the-Trainer methodology, including structured program definitions, task-based learning, content library, employee assignments, session tracking, 4-Step Training Model integration, S-O-A Coaching Feedback, Quiz Management, and Certification Workflow.
- **Training Content Library**: Central repository for training materials with category management, document upload with AI content extraction, AI Training Topic Generator, trainee assignment interface with AI-powered 4-day training plan generation, and progress tracking.
- **Epoch 4-Step Training System**: Comprehensive training management system using the Train-the-Trainer 4-step methodology: Step 1 (Trainer Does/Explains) → Step 2 (Trainer Does/Trainee Explains) → Step 3 (Trainee Does/Trainer Coaches) → Step 4 (Trainee Does/Trainer Observes). Includes AI-generated training plans and quizzes for each step, sequential step completion with quiz requirements, automatic traveler authorization upon completion, and a dedicated Trainee Portal.
- **Employee Onboarding System (Phase 0)**: Admin-driven employee onboarding with configurable paths and fillable PDF documents. Database tables: `onboarding_paths` (onboarding workflow templates), `onboarding_forms` (intake form definitions), `onboarding_sessions` (active onboarding instances linked to employees), `onboarding_session_documents` (documents within a session), `onboarding_session_captures` (signatures and other captured data). Reuses existing fillable PDF system, signature capture, media library, and audit logging infrastructure. Navigation accessible via Employees > Onboarding (Admin-only). Audit entity types: `employee`, `employee_onboarding`. Media folder seed script at `server/scripts/seedOnboardingFolder.ts` (requires media_folders table).

### Technical Implementations
- **Frontend**: React 18, TypeScript, Vite, ShadCN UI, Tailwind CSS, Framer Motion, Wouter.
- **Backend**: Express.js, TypeScript, TanStack Query, Zod, Axios.
- **Database**: PostgreSQL (Neon serverless), Drizzle ORM, Drizzle-kit.
- **Security**: Dual-condition authentication bypass for development, global API authentication, JWT secret in production, bcrypt password hashing, Zod input validation, backend middleware mirroring frontend permissions, admin-only routes, and feature flags.
- **Database Schema Standards**: All new tables use UUID for primary keys.

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
- SendGrid (Email, Magic Link delivery)
- Twilio (SMS)
- Google Calendar (Event Integration)
- Google Drive (File Access and PDF Processing)
- Google APIs
- Azure Document Intelligence (AI-powered document analysis)
- Microsoft Azure AD / MSAL (OAuth authentication)