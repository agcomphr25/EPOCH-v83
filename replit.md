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
- **Inventory & Production**: Parts list management, Purchase Orders, vendor POs, inventory CSV import, enhanced layup scheduling, and FIFO-based packet building with AS9100 traceability via barcode scanning. Includes dynamic inventory thresholds and demand-filtered BOM assignment.
- **Quality Control**: Nonconformance Record System, Vendor Evaluation System, and Hard QC Stop enforcement with authorized deviation approval workflow.
- **P2 Serialized Item Tracking**: Complete serialized item tracking for P2 purchase orders with customizable workflows, barcode scanning, traceability gating, Traveler Viewer, Electronic Signature System, department data editing, and notes at any workflow stage. Supports late-finalization pattern. Traveler step completion now syncs P2 serialized item department.
- **Communication Governance Layer**: Centralized email control plane with templating, logging, audit capabilities, template version history tracking (email_template_versions table with automatic snapshotting on edit), edit permission control (edit_email_templates capability enforced for ADMIN/OWNER roles), edit audit logging (email_template_edit_logs table), and governed WYSIWYG template editor UI at /email-templates with TipTap rich editor, HTML source view, preview, test send, and version history with restore capability. Phase 4D HTML Safety Layer: sanitize-html strips dangerous tags/attributes, allowedStyles whitelist blocks CSS injection, inline JS detection rejects javascript:/event handlers/vbscript: before sanitization, placeholder validation rejects unknown {{variables}} not in allowedVariables, max HTML body 500KB and subject 998 chars enforced via Zod, and /validate dry-run endpoint with structured error codes (INLINE_JS_DETECTED, UNKNOWN_PLACEHOLDERS, SCHEMA_VALIDATION_FAILED). Phase 4E partial: Server-side Vendor PO PDF generation via pdf-lib (server/utils/pdf/vendorPoPdf.ts), attachment rules evaluation in buildAttachments (attachVendorPOPDF flag on vendor_po_issue/vendor_po_resend templates triggers PDF generation and attachment), and system notice injection layer in send.ts prepends "system-generated message from EPOCH" banner to both HTML and plain text before SendGrid dispatch.
- **Financial & Reporting**: Cost Center Management, dynamic discount system, Credit Memo Management, Payment Analytics, Historical Data Module, and Refund Request/Queue.
- **PDF Management**: Centralized PDF configuration, flexible Template Library System, and unified `orderPdfService` for intent-based PDF generation using frozen order snapshots.
- **Smart Data Entry**: Streamlined traceability with recent lot number recall, autocomplete, and barcode quick-fill.
- **Control Centers**: Unified interfaces for P2 Purchase Orders and Cutting Table with dashboards, wizards, and progress tracking. Includes P2 Control Center Shipping tab and Production Timer endpoints with badge authentication.
- **Order Audit System**: Comprehensive audit tracking for P1 orders and P2 serialized items with configurable event categories, field change detection, and department transition timing.
- **Media Library System**: Centralized image storage with camera capture, file upload, reference-based attachments, and hierarchical folder organization with role-based access control.
- **Document Scanner**: Built-in scanning with OpenCV.js for automatic edge detection, perspective correction, image enhancement, and PDF conversion.
- **Voice Notes System**: Voice-activated note recording for production issues with automatic order ID extraction, issue categorization, and resolution tracking.
- **Customer Watch Rules System**: Configurable monitoring rules for tracking customer orders through departments with multi-person visibility sharing.
- **Time Clock Integration**: External Time Clock system integration with canonical identity management, punch event mirroring, and labor analytics.
- **Attention & State-Confidence System**: Cross-domain system tracking confidence in the current state of work using `lastConfirmedAt`, `lastConfirmedByUserId`, `confirmationNote`, and `attentionRisk` fields.
- **Real-Time WebSocket Notifications**: WebSocket server for targeted notifications.
- **Fillable PDF Templates System**: MVP for customer fill-and-sign workflow with public signature links.
- **Central QR Code System**: Generates and resolves QR codes to entity-specific routes based on user role, logs scan events, and provides admin CRUD UI.
- **Asset Management & Work Order System**: Comprehensive asset tracking with hierarchical categories, physical locations, generalized work orders, and integration with Preventive Maintenance.
- **Routing Document Management System**: AI-powered document management for P2 Control Center supporting work instructions, spec sheets, and traveler templates.
- **Form Draft Persistence & Unsaved Changes Warning**: Reusable hooks for localStorage-based auto-save drafts and browser `beforeunload` warnings.
- **Centralized Address Domain Service**: All address creation and updates flow through a service that normalizes and validates via SmartyStreets US Street API.
- **Canonical Material & Source Snapshot**: `production_orders` table includes `material_canonical` (derived from stock model ID prefix) and `source_snapshot` (immutable record of PO state at creation). `material_canonical` is the unified single source of truth for P1 material display across Barcode Queue, barcode label generation, and Layup Schedule. All P1 read paths prefer `materialCanonical` with `deriveCanonicalMaterial()` as fallback. Client-side `deriveMaterial()` in `deriveOrderLabels.ts` is retained only as a secondary fallback for non-P1 orders. Admin Inspector at `/admin/inspector/production-order` exposes source_snapshot, canonical fields, and PO links in a read-only view.
- **Training Builder Module**: Self-contained training program management using Train-the-Trainer methodology.
- **Epoch 4-Step Training System**: Comprehensive training management using the 4-step methodology, with AI-generated training plans and quizzes.
- **Employee Onboarding System**: Admin-driven employee onboarding with configurable paths, intake forms, session lifecycle management, and atomic finalization.

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