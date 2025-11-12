# EPOCH v8 - Manufacturing ERP System

## Overview
EPOCH v8 is a comprehensive Manufacturing ERP system designed for small manufacturing companies specializing in customizable products. Its primary goal is to streamline operations, enhance efficiency, and improve scalability through end-to-end order management, inventory tracking, an employee portal, and quality control workflows. The system aims to be a leading ERP solution by offering a full-stack TypeScript PWA with a React frontend and Express backend, deployable to both web and mobile platforms. Key capabilities include a robust Bill of Materials (BOM) system, Google OAuth integration, a global search function, and a comprehensive Parts List Management System.

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
-   **Asset Path Resolution**: Centralized asset path resolver ensures consistent file access.
-   **UI/UX**: ShadCN UI with Tailwind CSS and Framer Motion.
-   **CI/CD**: Implemented with pre-commit hooks (Husky + lint-staged) and GitHub Actions.
-   **BOM System**: Robust Bill of Materials with UUID-based architecture, revision control, and recursive explosion/where-used analysis.
-   **Google OAuth Integration**: Production-ready OAuth 2.0 flow with CSRF protection and secure token storage.
-   **Global Search System**: Multi-entity search across Customers, Orders, Vendors, Employees, and Inventory.
-   **Vendor Evaluation System**: Question-based evaluation with 4 criteria, automatic status, and monthly reset.
-   **Linked Orders Management**: Functionality to link multiple orders for combined processing.
-   **Urgency/Priority System**: Manually flagged urgent orders with visual badges and production queue sorting.
-   **Rush Fee System**: Adjusts due dates for "Expedite" and "Rush" orders.
-   **P1 Purchase Orders Queue**: Displays open purchase orders with stock items needing layup, excluding "no stock" items.
-   **Vendor Purchase Order Management**: Full CRUD operations for vendor POs and line items.
-   **Inventory CSV Import**: Transactional "Replace All" with two-phase validation and batch inserts.
-   **Layup Schedule Enhancement**: Dual-view system with production-relevant data, print-friendly format, and barcode system. Includes interactive week/day selection with a round-robin algorithm.
-   **Parts List Management**: Enhanced inventory items with MRP/COGS fields and production line utilization flags; CSV import/export.
-   **Department Technician Assignment**: Employee profiles include department-specific assignment flags.
-   **Follow-Up Order Signature Workflow**: Complete pricing calculation system for sign-order pages, mirroring OrderEntry logic.
-   **P1 PO Shipping QC Management**: Tracks P1 purchase orders through production; non-stock items bypass production to Shipping QC. Features authentication, optimized raw SQL, real-time status badges, and accordion-wrapped UI for cross-PO item selection for shipping. Includes fulfillment tracking for external shipments.
-   **P1 PO Shipping Workflow**: Complete UPS integration with multi-step shipping dialog, configurable service levels, and billing options. Floating "Ship Selected" button for combining items from different POs. Database schema includes `shipment_records` and `shipment_items` for tracking. OEM Shipments history page with comprehensive search/filtering and document downloads (labels, packing slips).

### Technical Implementations
-   **Frontend**: React 18, TypeScript, Vite, ShadCN UI, Tailwind CSS, Framer Motion, Wouter.
-   **Backend**: Express.js, TypeScript, TanStack Query, Zod, Axios.
-   **Database**: PostgreSQL (Neon serverless), Drizzle ORM, Drizzle-kit.

### Database Schema Standards
-   **Primary Key Pattern**: All new tables must use `uuid('id').defaultRandom().primaryKey()` for `id` columns. `serial` is forbidden for new tables to prevent migration issues. Existing `serial` IDs in legacy tables (e.g., `allOrders`, `inventoryItems`) should not be modified.

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