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

-   **Atomic Order ID Reservation**: A database-based atomic reservation system ensures unique, sequential Order ID generation.
-   **Asset Path Resolution**: Centralized asset path resolver ensures consistent file access.
-   **UI/UX**: Leverages ShadCN UI components with Tailwind CSS and Framer Motion for animations.
-   **CI/CD**: Implemented with pre-commit hooks (Husky + lint-staged) and GitHub Actions.
-   **BOM System**: Robust Bill of Materials system with UUID-based architecture, revision control, and comprehensive CRUD operations.
-   **Google OAuth Integration**: Production-ready OAuth 2.0 flow with CSRF protection, secure state management, and token storage.
-   **Global Search System**: Multi-entity search across Customers, Orders, Vendors, Employees, and Inventory Items.
-   **Vendor Evaluation System**: Question-based evaluation with 4 criteria, automatic status, auto-dating, and a monthly reset.
-   **Linked Orders Management**: Functionality to link multiple orders for combined processing/shipping.
-   **Urgency/Priority System**: Implemented for manually flagged urgent orders with visual badges and production queue sorting.
-   **Rush Fee System**: Adjusts due dates for "Expedite" and "Rush" orders with visual badges and notifications.
-   **P1 Purchase Orders Queue**: Displays open purchase orders with stock items needing layup, grouped by customer.
-   **Vendor Purchase Order Management**: Full CRUD operations for vendor POs and line items with Zod validation.
-   **Inventory CSV Import**: Transactional "Replace All" with two-phase validation and atomic database operations.
-   **Layup Schedule Enhancement**: Dual-view system (screen/print), production-relevant data columns, print-friendly checklist format, schedule barcode system, and department workflow integration.
-   **Layup Schedule Week & Day Selection**: Interactive week navigation and day selection with a balanced round-robin distribution algorithm.
-   **PO Product Stock Model Validation**: Exclusion of non-stock model PO products from production queues and layup processes.
-   **Parts List Management**: Enhanced inventory items with MRP/COGS fields, SKU, purchase/usage information, and production line utilization flags.
-   **Department Technician Assignment**: Employee profiles include department-specific assignment flags to control technician visibility in dropdowns.
-   **Follow-Up Order Signature Workflow**: Complete pricing calculation system for sign-order pages, mirroring OrderEntry logic.
-   **P1 PO Shipping QC Management**: Comprehensive tracking system for P1 purchase orders with department status tracking. Includes authentication middleware, optimized SQL queries, real-time status badges, cross-PO item selection, and fulfillment tracking.
-   **P1 PO Shipping Workflow**: Complete UPS integration for creating labels with configurable service levels and billing options. Features a floating "Ship Selected" button and a comprehensive OEM Shipments history page with search/filtering, pagination, and document downloads.
-   **P1 PO Feature Display**: Production orders display full feature data (action_length, barrel_inlet, handedness, etc.) by parsing specifications JSONB column from production_orders table and mapping to expected features field for department queue rendering. The getAllOrders() method merges production orders with regular orders and maps camelCase PO specifications to snake_case feature keys (actionLength→action_length, bottomMetal→bottom_metal, etc.).
-   **P1 PO Department Progression**: Both `/api/orders/progress-department` and `/api/orders/update-department` endpoints use database query-based detection to correctly identify production orders with customer-based order IDs (ABC00199-0001 format), ensuring proper updates to production_orders table. The update-department endpoint now checks production_orders table first before checking finalized/draft orders.
-   **Production Deployment**: Uses `tsx` to run TypeScript directly in production instead of esbuild bundling, avoiding ESM module exit issues. Static files served from `dist/public/` with error handling for JSON parsing.
-   **Nonconformance Record System**: Comprehensive quality issue tracking with 12 specific issue/cause categories including customer requests, order errors, incorrect LOP, hardware issues, CNC/inlet errors, paint/finish issues, shipping damage, broken stocks, and QD/swivel/rail issues.



### Technical Implementations
-   **Frontend**: React 18, TypeScript, Vite, ShadCN UI, Tailwind CSS, Framer Motion, Wouter.
-   **Backend**: Express.js, TypeScript, TanStack Query, Zod, Axios.
-   **Database**: PostgreSQL (Neon serverless), Drizzle ORM, Drizzle-kit.

-   **Key Features**: Order Management (dynamic configuration, linked orders, rush fees, urgency), Layup Scheduler, Production Queue Manager, Department Manager, Customer Management (CRM, CSV import, address autocomplete), Inventory Management (BOM integration), Metal Accessories Tracker, Barcode System, Employee Management (CRUD, portal, time clock), Quality Control (digital signature, checklists), Reporting, Payment Tracking, Shipping Integration, Communications System (inbox, email, SMS), Personalized Dashboards, Training Management System, AI-Powered Smart Sorting, Calendar Integration, Magic Link Authentication, and Global Search.

### Database Schema Standards
-   **Primary Key Pattern (CRITICAL)**: ALL new tables MUST use UUID for primary keys (`id: uuid('id').defaultRandom().primaryKey()`). `serial` data type is strictly forbidden for new tables to prevent migration failures.
-   **Legacy Tables**: Existing tables using `serial` IDs (e.g., `allOrders`, `inventoryItems`) should not be modified.
-   **Migration Safety**: Never change existing ID column types (serial to UUID or vice-versa). Use `npm run db:push` for schema sync.


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