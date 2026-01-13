# EPOCH v8 - Manufacturing ERP System

## Overview
EPOCH v8 is a comprehensive Manufacturing ERP system for small manufacturing companies specializing in customizable products. It aims to streamline operations, enhance efficiency, and improve scalability through end-to-end order management, robust inventory tracking, an employee portal, quality control workflows, a powerful Bill of Materials (BOM) system, Google OAuth integration, global search, and a comprehensive Parts List Management System. The vision is to be the leading ERP solution for small-to-medium customizable product manufacturers, offering a full-stack TypeScript PWA with a React frontend and Express backend, deployable to web and mobile platforms.

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
The application is a full-stack TypeScript monorepo, emphasizing type safety, data consistency, and cross-platform compatibility with PWA support via Capacitor.

### Core Architectural Decisions
- **Type Safety & Data Consistency**: Utilizes shared TypeScript schemas (Drizzle, Zod) and a `features` object as a single source of truth.
- **Authentication**: Hybrid JWT + Session authentication with a 3-role (ADMIN, EMPLOYEE, OWNER) capability-based access control system.
- **UI/UX**: Modern UI using ShadCN UI, Tailwind CSS, and Framer Motion for a dynamic user experience.
- **BOM System**: Robust Bill of Materials with UUID architecture and revision control.
- **Order Management**: Features atomic order ID reservation, rush fees, and an urgency/priority system.
- **Inventory & Production**: Includes parts list management, P1 Purchase Orders, vendor POs with Zod validation, inventory CSV import, and enhanced layup scheduling.
- **Quality Control**: Nonconformance Record System and Vendor Evaluation System with automated scoring.
- **Cutting Table Operations**: FIFO-based packet building with two-phase allocation, AS9100 traceability via barcode scanning, dynamic inventory thresholds, packet scheduling, demand-filtered BOM assignment, and fabric inventory with conformance document support (external URLs or App Storage uploads).
- **Barcode Strategy**: CODE128 for serialized items, CODE39 for regular orders, with an automatic helper function.
- **P2 Serialized Item Tracking**: Complete P2 purchase order serialized item tracking with customizable workflows, barcode scanning, fail-closed traceability gating, a Traveler Viewer, and Electronic Signature System.
- **Financial & Reporting**: Cost Center Management, dynamic discount system, Credit Memo Management, Payment Analytics, and Refund Request/Queue with Accept.Blue integration.
- **Help Center**: FAQ-based system accessible via navbar, covering key workflows.
- **PDF Management**: Centralized PDF configuration and a flexible Template Library System.
- **Smart Data Entry**: Streamlined traceability with recent lot number recall, autocomplete, and barcode quick-fill.
- **Control Centers**: Unified interfaces for P2 Purchase Orders and Cutting Table with dashboards, wizards, and progress tracking.
- **Order Audit System**: Comprehensive audit tracking for P1 orders and P2 serialized items, including configurable event categories, field change detection, department transition timing, and a unified Audit Drawer.
- **Media Library System**: Centralized image storage with camera capture, file upload, and reference-based attachments linking media to entities.
- **Document Scanner**: Built-in scanning with OpenCV.js for automatic edge detection, perspective correction, image enhancement, and PDF conversion.
- **Voice Notes System**: Voice-activated note recording for production issues, with automatic order ID extraction, issue categorization, resolution tracking, and analytics dashboard.
- **Customer Watch Rules System**: Configurable monitoring rules for tracking customer orders through departments, with multi-person visibility sharing and dashboard integration.
- **Time Clock Integration**: External Time Clock system integration with canonical identity management, punch event mirroring, and labor analytics, including Missed Punch Awareness for detecting anomalies.
- **Filtered Orders Report**: Advanced order filtering and export tool with multi-select status, date range, customer exclusion, and CSV export.
- **Survey Engine**: Generic, reusable survey system with UUID-based tables, respondent and context abstraction, designed for broad reuse.
- **P2 Projects Module**: Multi-step workflow tracking for P2 purchase orders with sequential step enforcement, project manager assignments, reminders, activity logging, and automatic notifications.
- **Ticket Assignment System**: Separate owner (creator) and assignee tracking for tickets, with internal message notifications on assignment and automated stale ticket reminders (48-hour inactivity threshold, 24-hour cooldown, max 3 reminders).
- **PDF Signature Tool**: Internal utility for signing PDFs with drag-and-drop signature positioning, using percentage-based coordinates for zoom-independent placement. Available to all authenticated employees via UNIVERSAL_ACCESS_ROUTES.
- **Routing Document Management System**: AI-powered document management for P2 Control Center supporting work instructions, spec sheets, and traveler templates. Features include: (1) Document upload with presigned URLs via Object Storage, (2) AI document parsing with OpenAI to extract routing steps, data fields, quality checkpoints, and certification requirements, (3) AI-powered document generation from templates and reference documents, (4) Template learning system that analyzes existing documents to create reusable templates, (5) Spec sheet management with version control, (6) Document-to-routing linking for parts, (7) Certification task linking to specific departments/traveler steps, (8) Document distribution logging for print/email tracking. Database tables: `routing_documents`, `spec_sheets`, `document_templates`, `template_fields`, `routing_document_links`, `certification_task_links`, `document_distribution_logs`. API routes under `/api/routing-documents`. Frontend at `/routing-document-management`.
- **Training Builder Module**: Self-contained training program management system accessible from the Training Control Center using Train-the-Trainer methodology. Features include: structured program definitions with department/role targeting, task-based learning objectives with day-based organization, Content Library for browsing existing modules and quiz questions, drag-to-reorder tasks, employee assignments with due dates, session tracking with supervisor signoff, and progress monitoring. **Train-the-Trainer Components**: (1) Work Instructions with procedural steps, critical points, safety considerations, PPE requirements, and quality checkpoints for standardized task documentation (`work_instructions`, `training_task_work_instructions` tables); (2) 4-Step Training Model integration - Phase 1: Trainer Does/Trainer Explains, Phase 2: Trainer Does/Trainee Explains, Phase 3: Trainee Does/Trainer Coaches, Phase 4: Trainee Does/Trainer Observes; (3) S-O-A Coaching Feedback system - Strength (what trainee did well), Opportunity (what to improve), Action (what to do differently) with database persistence (`training_soa_feedback` table); (4) Quiz Management System with quiz creation, multiple-choice questions, daily quiz selection by facility, quiz attempt tracking, and competency verification; (5) Certification Workflow with trainer observation signoff, quiz completion tracking, and dual trainer/trainee signoff for Training Matrix integration. Database tables: `training_programs`, `training_program_tasks`, `training_assignments`, `training_builder_sessions`, `training_builder_task_progress`, `work_instructions`, `training_task_work_instructions`, `training_soa_feedback`, `training_builder_quizzes`, `training_builder_quiz_questions`, `training_daily_quiz_selections`, `training_builder_quiz_attempts`, `training_certifications`. API routes under `/api/training/programs`, `/api/training/assignments`, `/api/training/sessions`, `/api/training/work-instructions`, `/api/training/quizzes`, `/api/training/daily-quizzes`, `/api/training/quiz-attempts`, `/api/training/certifications`. Frontend components in `client/src/modules/training-builder/`.

### Technical Implementations
- **Frontend**: React 18, TypeScript, Vite, ShadCN UI, Tailwind CSS, Framer Motion, Wouter.
- **Backend**: Express.js, TypeScript, TanStack Query, Zod, Axios.
- **Database**: PostgreSQL (Neon serverless), Drizzle ORM, Drizzle-kit.
- **Security**: Dual-condition authentication bypass for development, global API authentication, JWT secret in production, bcrypt password hashing, Zod input validation, backend middleware mirroring frontend permissions, admin-only routes, and feature flags for experimental features.
- **Database Schema Standards**: All new tables use UUID for primary keys; existing `serial` IDs are untouched.

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
- Google APIs (`googleapis` package)
- Azure Document Intelligence (AI-powered document analysis)
- Microsoft Azure AD / MSAL (`@azure/msal-node` - OAuth authentication)