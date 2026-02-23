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
- **Order Management**: Atomic order ID reservation, rush fees, urgency/priority system, path-based signature email architecture to prevent URL corruption, and card-before-save flow (PENDING_PAYMENT status) allowing credit card processing before formal order finalization.
- **Inventory & Production**: Parts list management, Purchase Orders, vendor POs, inventory CSV import, enhanced layup scheduling, and FIFO-based packet building with AS9100 traceability via barcode scanning. Includes dynamic inventory thresholds and demand-filtered BOM assignment. Three-layer Parts Request/Order/Receiving architecture: Parts Requests (planning) → Order Batches with Order Lines + Allocations (purchasing) → Receiving (physical intake via order lines only). Request statuses are derived/cached fields updated through allocation cascades. Tables: parts_request_order_lines, parts_request_order_allocations.
- **Quality Control**: Nonconformance Record System, Vendor Evaluation System with automated scoring, and Hard QC Stop enforcement with authorized deviation approval workflow on travelers.
- **P2 Serialized Item Tracking**: Complete serialized item tracking for P2 purchase orders with customizable workflows, barcode scanning, traceability gating, Traveler Viewer, and Electronic Signature System.
- **Financial & Reporting**: Cost Center Management, dynamic discount system, Credit Memo Management, Payment Analytics, Historical Data Module, and Refund Request/Queue.
- **PDF Management**: Centralized PDF configuration, flexible Template Library System, and unified `orderPdfService` for intent-based PDF generation using frozen order snapshots. Supports "Resend Signature Email" and "Send Updated Order for Signature" with supersession tracking.
- **Smart Data Entry**: Streamlined traceability with recent lot number recall, autocomplete, and barcode quick-fill.
- **Control Centers**: Unified interfaces for P2 Purchase Orders and Cutting Table with dashboards, wizards, and progress tracking.
- **Order Audit System**: Comprehensive audit tracking for P1 orders and P2 serialized items with configurable event categories, field change detection, and department transition timing.
- **Media Library System**: Centralized image storage with camera capture, file upload, reference-based attachments, and hierarchical folder organization with role-based access control.
- **Document Scanner**: Built-in scanning with OpenCV.js for automatic edge detection, perspective correction, image enhancement, and PDF conversion.
- **Voice Notes System**: Voice-activated note recording for production issues with automatic order ID extraction, issue categorization, and resolution tracking.
- **Customer Watch Rules System**: Configurable monitoring rules for tracking customer orders through departments with multi-person visibility sharing.
- **Time Clock Integration**: External Time Clock system integration with canonical identity management, punch event mirroring, and labor analytics.
- **Attention & State-Confidence System**: Cross-domain system tracking confidence in the current state of work by using `lastConfirmedAt`, `lastConfirmedByUserId`, `confirmationNote`, and `attentionRisk` fields across entities. Features "Confirm Status" actions, configurable staleness rules, and an Admin Attention Dashboard.
- **Real-Time WebSocket Notifications**: WebSocket server (ws library) attached to the HTTP server on `/ws/notifications`. Authenticates via JWT token, session token (query param), or session cookie. Tracks connected users with multi-tab support, sends targeted notifications on ticket assignment/unassignment. Client-side hook with exponential backoff reconnection and toast display. Key files: `server/src/services/notificationManager.ts`, `client/src/hooks/useWebSocketNotifications.ts`.
- **Fillable PDF Templates System**: MVP for customer fill-and-sign workflow, allowing admins to upload PDF templates with field definitions and create instances for customers via public signature links.
- **Central QR Code System**: Generates and resolves QR codes to entity-specific routes based on user role, logs scan events, and provides admin CRUD UI.
- **Asset Management & Work Order System**: Comprehensive asset tracking with hierarchical categories, physical locations with move history, and generalized work orders (Maintenance Events). Work orders support state transitions (open → in_progress → completed → closed), parts tracking with inventory cost snapshots, file attachments, and downtime tracking. Integrates with Preventive Maintenance schedules to generate preventive work orders. Admin-only access for create/edit operations. Tables: asset_categories, asset_locations, assets, asset_location_history, work_orders, work_order_parts, work_order_attachments.
- **Routing Document Management System**: AI-powered document management for P2 Control Center supporting work instructions, spec sheets, and traveler templates.
- **Form Draft Persistence & Unsaved Changes Warning**: Reusable `useFormDraft` and `useUnsavedChangesWarning` hooks (`client/src/hooks/`) provide localStorage-based auto-save drafts and browser beforeunload warnings. Currently integrated into the New Vendor modal (`VendorManagement.tsx`) and Order Entry form (`OrderEntry.tsx`) for create/new mode only (not edit mode). Drafts are saved with debounced auto-save on input changes and cleared on successful submission. Users see a restore/discard banner when reopening a form with a saved draft.
- **Centralized Address Domain Service**: All address creation and updates flow through `server/src/domain/address/addressService.ts` which normalizes inputs (trimming, state abbreviation, ZIP cleanup, ISO country codes) and validates via SmartyStreets US Street API. Returns validation status (raw/standardized/validated/invalid/overridden) with DPV match codes. Integrated into all address routes: `POST /api/customers/:id/addresses`, `POST/PUT /api/vendors`, and legacy `POST/PUT /api/addresses`. Frontend `AddressValidationModal` component shows validation failures with options to use suggested address, edit, or override with required reason. Shipping label creation has a soft gate that blocks labels for addresses with `invalid` validation status. Database columns: `validation_status`, `validated_at`, `validation_provider`, `dpv_match_code`, `override_reason` on both `customer_addresses` and `vendors` tables. Backfill script at `server/scripts/backfillAddressValidation.ts` processes unvalidated addresses in batches.
- **Training Builder Module**: Self-contained training program management using the Train-the-Trainer methodology, including structured program definitions, task-based learning, content library, employee assignments, session tracking, and certification workflow.
- **Epoch 4-Step Training System**: Comprehensive training management using the 4-step methodology, with AI-generated training plans and quizzes, sequential step completion, and automatic traveler authorization.
- **Employee Onboarding System**: Admin-driven employee onboarding with configurable paths, intake forms, session lifecycle management, and atomic finalization. Features include:
  - Configurable onboarding paths with ordered fillable PDF templates (signature auth template + HR documents)
  - Path configuration supports ordered template selection with up/down reordering, replacing legacy folder-based approach
  - Session creation respects configured template order, creating fillable instances in sequence
  - Backward compatibility: Legacy folder-based paths still work (documentFolderId fallback mode)
  - Path purposes: ONBOARDING (new employees) and REHIRE (bringing back inactive employees)
  - Simplified 4-step wizard UI: Signature Authorization, Demographics Intake, HR Documents, Review & Complete
  - Fixed-schema demographics system with dedicated API endpoints and automatic re-hire prefill from existing employee records
  - Tablet-first Demographics Intake UI with 5 card-based sections: Basic Information, Home Address, Transportation, Identification (sensitive), Payroll Information (sensitive)
  - Demographics fields include: full name, preferred name, email, phone, address (street, apt/unit, city, state, zip), vehicle (type, make/model), driver's license (number, state, expiration), and bank information (name, routing, account, type)
  - Step locking: Demographics step locked until Digital Signature Authorization is complete
  - Sticky bottom action bar with "Save & Continue" and "Save for Later" actions
  - Session lifecycle (in_progress, paused, completed) with pause/resume support
  - Transactional finalization with mapDemographicsToEmployee() helper that prefers demographicsData over legacy intakeData, atomically creates/updates employee records, activates user accounts, and attaches signed documents
  - Re-hire workflows: Select inactive employees, reactivate employee records, auto-reactivate linked user accounts
  - Preflight validation with detailed error reporting
  - Comprehensive audit trail (ONBOARDING_STARTED, PAUSED, RESUMED, FINALIZATION_BLOCKED, EMPLOYEE_CREATED, USER_ACTIVATED, EMPLOYEE_DOCUMENT_ATTACHED, ONBOARDING_COMPLETED, FINALIZATION_FAILED, ONBOARDING_BUNDLE_GENERATED, ONBOARDING_BUNDLE_EMAILED, ONBOARDING_BUNDLE_EMAIL_BLOCKED, ONBOARDING_BUNDLE_EMAIL_FAILED, REHIRE_STARTED, EMPLOYEE_REHIRED, USER_REACTIVATED, REHIRE_COMPLETED, REHIRE_FINALIZATION_FAILED, EMPLOYMENT_STARTED, EMPLOYMENT_ENDED)
  - PDF bundle generation: Combines cover page, intake summary, signed documents, captured images, and audit summary into a single downloadable PDF stored in object storage with media library reference
  - Email distribution: Controlled email delivery of PDF bundles to employees with CC options (admin, HR), preflight validation, and direct attachment (no public URLs)
  - Employment Periods: First-class tracking of time-bounded employment engagements with derived active status via isEmployeeActive helper function
  - Employer Signature System: Dual-signer workflow for HR documents requiring both employee and employer signatures. Authorized employer signers (Admin/Owner roles) are managed via Onboarding Settings. Templates can be marked as requiring employer signature, and finalization is blocked until all required employer signatures are obtained. Pending Employer Signatures queue shows documents awaiting employer signature.

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