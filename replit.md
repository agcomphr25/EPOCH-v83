# EPOCH v8 - Manufacturing ERP System

## Overview

EPOCH v8 is a comprehensive Manufacturing ERP system designed for small manufacturing companies specializing in customizable products. Its primary goal is to streamline operations, enhance efficiency, and improve scalability through end-to-end order management, inventory tracking, an employee portal, and quality control workflows. The system is a full-stack TypeScript PWA with a React frontend and Express backend, deployable to web and mobile platforms. Key capabilities include a robust Bill of Materials (BOM) system, Google OAuth integration, a global search function, and a comprehensive Parts List Management System. The business vision is to be the leading ERP solution for small-to-medium customizable product manufacturers.

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

## System Architecture
The application uses a monorepo structure with a full-stack TypeScript approach, prioritizing type safety and cross-platform deployment.

### Core Architectural Decisions
-   **Type Safety**: Shared TypeScript schemas (Drizzle, Zod) ensure type safety across the stack.
-   **Cross-Platform Deployment**: PWA capabilities with Capacitor for web and mobile (iOS/Android).
-   **Authentication**: Hybrid JWT + Session authentication with capability-based access control and a 3-role system (ADMIN, EMPLOYEE, OWNER).
-   **Data Consistency**: A `features` object acts as the single source of truth for feature data.
-   **Modular Routing**: Backend routes are organized into specialized modules.
-   **Atomic Order ID Reservation**: Database-based atomic reservation system for unique, sequential Order ID generation.
-   **Asset Path Resolution**: Centralized asset path resolver for consistent file access.
-   **UI/UX**: Leverages ShadCN UI components with Tailwind CSS and Framer Motion for animations.
-   **CI/CD**: Implemented with pre-commit hooks (Husky + lint-staged) and GitHub Actions.
-   **BOM System**: Robust Bill of Materials system with UUID-based architecture and revision control.
-   **Google OAuth Integration**: Production-ready OAuth 2.0 flow with CSRF protection and secure state management.
-   **Global Search System**: Multi-entity search across Customers, Orders, Vendors, Employees, and Inventory Items.
-   **Vendor Evaluation System**: Question-based evaluation with 4 criteria, automatic status, and monthly reset.
-   **Linked Orders Management**: Functionality to link multiple orders for combined processing/shipping.
-   **Urgency/Priority System**: For manually flagged urgent orders with visual badges and production queue sorting.
-   **Rush Fee System**: Adjusts due dates for "Expedite" and "Rush" orders with visual badges and notifications.
-   **P1 Purchase Orders Queue**: Displays open purchase orders with stock items needing layup, grouped by customer.
-   **Vendor Purchase Order Management**: Full CRUD operations for vendor POs and line items with Zod validation.
-   **Inventory CSV Import**: Transactional "Replace All" with two-phase validation and atomic database operations.
-   **Layup Schedule Enhancement**: Dual-view system (screen/print), production-relevant data columns, print-friendly checklist format, schedule barcode system, and department workflow integration with interactive week/day selection and round-robin distribution.
-   **PO Product Stock Model Validation**: Exclusion of non-stock model PO products from production queues and layup processes.
-   **Parts List Management**: Enhanced inventory items with MRP/COGS fields, SKU, purchase/usage information, and production line utilization flags.
-   **Department Technician Assignment**: Employee profiles include department-specific assignment flags.
-   **Follow-Up Order Signature Workflow**: Complete pricing calculation system for sign-order pages.
-   **P1 PO Shipping QC Management**: Comprehensive tracking system for P1 purchase orders with department status tracking, UPS integration for label creation, and OEM Shipments history.
-   **P1 PO Feature Display**: Production orders display full feature data parsed from specifications JSONB column.
-   **P1 PO Department Progression**: Backend endpoints (`/api/orders/progress-department`, `/api/orders/update-department`) use database query-based detection for production orders, ensuring proper updates to the `production_orders` table.
-   **P1 PO Department Queue Visibility**: `isOrderInDepartment()` utility handles production orders by checking for `productionStatus` field, ensuring P1 PO items appear in all relevant department queues.
-   **P1 PO Shipping QC Tab Separation**: P1 PO orders appear exclusively in the "PO Orders" tab in Shipping QC.
-   **Production Deployment**: Uses `tsx` to run TypeScript directly in production; static files served from `dist/public/`.
-   **Nonconformance Record System**: Comprehensive quality issue tracking with 12 specific issue/cause categories.
-   **Cutting Table Packet Building**: FIFO-based packet production workflow with automatic inventory consumption, two-phase allocation (simulation before commit), material linkage validation, expiration-based priority indicators, and real-time inventory balance tracking. Includes Recipe Summary, Build Session, and enhanced Fabric Inventory management with sortable views.
-   **Dynamic Discount System**: Orders save discount metadata (type, value, scope) at creation for dynamic recalculation while preserving original intent.
-   **Cutting Table Inventory Integration**: Fabric inventory items are linked to Cut Management for selection and tracking.
-   **Cutting Table Production Progress Tracker**: Automatic calculation of remaining cuts needed to hit weekly production goals. System compares actual cut records against submitted targets, displaying visual progress with color-coded bars and real-time updates.

### Technical Implementations
-   **Frontend**: React 18, TypeScript, Vite, ShadCN UI, Tailwind CSS, Framer Motion, Wouter.
-   **Backend**: Express.js, TypeScript, TanStack Query, Zod, Axios.
-   **Database**: PostgreSQL (Neon serverless), Drizzle ORM, Drizzle-kit.
-   **Key Features**: Order Management (dynamic configuration, linked orders, rush fees, urgency), Layup Scheduler, Production Queue Manager, Department Manager, Customer Management (CRM, CSV import, address autocomplete), Inventory Management (BOM integration), Metal Accessories Tracker, Barcode System, Employee Management (CRUD, portal with certifications display, time clock), Quality Control (digital signature, checklists), Reporting, Payment Tracking, Shipping Integration, Communications System (inbox, email, SMS), Personalized Dashboards, Training Management System (PDF extraction, in-house certification forms, employee portal integration), AI-Powered Smart Sorting, Calendar Integration, Magic Link Authentication, and Global Search.

### Database Schema Standards
-   **Primary Key Pattern (CRITICAL)**: ALL new tables MUST use UUID for primary keys (`id: uuid('id').defaultRandom().primaryKey()`). `serial` data type is strictly forbidden for new tables.
-   **Legacy Tables**: Existing tables using `serial` IDs should not be modified.
-   **Migration Safety**: Never change existing ID column types. Use `npm run db:push` for schema sync.

## Recent Changes

**2025-11-18** (1:55 PM):
- **Fixed certifications table deployment issue**: Changed `certifications` and `employee_certifications` tables from `serial()` to `integer().generatedAlwaysAsIdentity()` to match production database structure and avoid "type serial does not exist" migration errors. Updated schemas to include all production columns (`validity_period_months`, `is_required`, `requirements_data`, `work_instructions`, `issuing_authority`, `status`, `trainer_name`, `trainer_signature`, `training_date`, `critical_points_completed`, `completed_by_user_id`, `form_completed_at`, `work_instructions_completed`, `uploaded_files`) for zero-conflict deployments.

**2025-11-17** (5:37 PM):
- **Dynamic discount system implemented**: Orders save discount metadata (type, value, scope) at creation for dynamic recalculation while preserving original intent. Percentage discounts automatically adjust when stock model prices change.

## External Dependencies

### Database
-   PostgreSQL
-   Drizzle ORM

### UI Framework
-   React 18
-   ShadCN UI
-   Tailwind CSS
-   Framer Motion

### Backend Dependencies
-   Express.js
-   TanStack Query
-   Zod
-   Axios

### Third-Party Services
-   SmartyStreets (Address Validation)
-   Authorize.Net (Payment Gateway)
-   UPS API (Shipping)
-   SendGrid (Email, Magic Link delivery)
-   Twilio (SMS)
-   Google Calendar (Event Integration)
-   Google Drive (File Access and PDF Processing)
-   Google APIs (`googleapis` package)
-   Azure Document Intelligence (AI-powered document analysis)
-   Microsoft Azure AD / MSAL (`@azure/msal-node` - OAuth authentication)