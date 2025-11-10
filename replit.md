# EPOCH v8 - Manufacturing ERP System

## Overview
EPOCH v8 is a comprehensive Manufacturing ERP system for small manufacturing companies specializing in customizable products. Its purpose is to streamline operations, enhance efficiency, and improve scalability through end-to-end order management, inventory tracking, an employee portal, and quality control workflows. The project aims to be a leading ERP solution for small-to-medium customizable product manufacturers, offering a full-stack TypeScript PWA with a React frontend and Express backend, deployable to web and mobile platforms. The system incorporates robust features like a Bill of Materials (BOM) system, Google OAuth integration, a global search function, and a comprehensive Parts List Management System to provide a complete and efficient solution. The business vision is to be the leading ERP solution for small-to-medium customizable product manufacturers.

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
The application utilizes a monorepo structure with a full-stack TypeScript approach, emphasizing type safety and cross-platform deployment.

### Core Architectural Decisions
-   **Type Safety**: Shared TypeScript schemas using Drizzle and Zod ensure type safety across the stack.
-   **Cross-Platform Deployment**: PWA capabilities with Capacitor enable deployment to web and mobile (iOS/Android).
-   **Dynamic Form Generation**: Includes a dynamic form builder with signature capture.
-   **Authentication**: Hybrid JWT + Session authentication with capability-based access control and account lockout, utilizing a simplified 3-role system (ADMIN, EMPLOYEE, OWNER).
-   **Data Consistency**: A `features` object acts as the single source of truth for all feature data in order entry.
-   **Modular Routing**: Backend routes are organized into specialized modules.
-   **Atomic Order ID Reservation**: A database-based atomic reservation system ensures unique, sequential Order ID generation.
-   **Asset Path Resolution**: Centralized asset path resolver (`server/src/utils/assetPaths.ts`) ensures consistent file access across development and production environments.
-   **UI/UX**: Leverages ShadCN UI components with Tailwind CSS and Framer Motion for animations.
-   **CI/CD**: Implemented with pre-commit hooks (Husky + lint-staged) and GitHub Actions.
-   **BOM System**: Robust Bill of Materials system with UUID-based architecture, revision control, and comprehensive CRUD operations, including recursive BOM explosion and where-used analysis.
-   **Google OAuth Integration**: Production-ready OAuth 2.0 flow with CSRF protection, secure state management, and secure token storage.
-   **Global Search System**: Multi-entity search across Customers, Orders, Vendors, Employees, and Inventory Items.
-   **Vendor Evaluation System**: Question-based evaluation with 4 criteria, automatic status, auto-dating, and a monthly reset.
-   **Linked Orders Management**: Functionality to link multiple orders for combined processing/shipping, including an approval code system for unlinking.
-   **Urgency/Priority System**: Implemented for manually flagged urgent orders with visual badges, production queue sorting, and dedicated dashboard metrics.
-   **Rush Fee System**: Redesigned to adjust due dates for "Expedite" and "Rush" orders, with corresponding visual badges and notifications.
-   **P1 Purchase Orders Queue**: Production Queue Manager displays open purchase orders with stock items needing layup, grouped by customer with PO filtering and granular quantity selection. Items with stock model "no stock" are automatically excluded from both the display and layup scheduler.
-   **Vendor Purchase Order Management**: Full CRUD operations for vendor POs and line items with Zod validation, integrated into existing architecture.
-   **Inventory CSV Import**: Transactional "Replace All" with two-phase validation and atomic database operations, ensuring data integrity. Includes batch inserts for large CSVs.
-   **Layup Schedule Enhancement**: Dual-view system (screen/print), production-relevant data columns (Action Length, Material, Badges), print-friendly checklist format, schedule barcode system, and integration with department workflow for approval and progression.
-   **Layup Schedule Week & Day Selection**: Interactive week navigation and day selection with a balanced round-robin distribution algorithm for orders.
-   **PO Product Stock Model Validation**: Exclusion of non-stock model PO products from production queues and layup processes.
-   **Parts List Management**: Enhanced inventory items with comprehensive MRP/COGS fields, SKU, purchase/usage information, and production line utilization flags. CSV import/export with intelligent parsing.
-   **Department Technician Assignment**: Employee profiles include department-specific assignment flags (e.g., `isFinishTechnician`) to control which technicians appear in department queue dropdowns, ensuring accurate technician selection for order progression.
-   **Follow-Up Order Signature Workflow**: Complete pricing calculation system for sign-order pages (`/sign-order/:token`) that mirrors OrderEntry logic exactly, including price overrides (APR/flattop), custom discounts (percent/flat), discount codes (persistent/short-term with appliesTo settings), feature pricing, misc items, payments, and balance due. Feature display names correctly handle special cases for handedness capitalization and paint options across all paint-related features.
-   **P1 PO Shipping QC Management**: Comprehensive tracking system for P1 purchase orders with department status tracking across the entire production pipeline. Non-stock PO items automatically bypass production and go directly to Shipping QC. Implemented with authentication middleware, optimized raw SQL queries to avoid Drizzle ORM LEFT JOIN issues, and real-time status badges for all PO items showing current department and production status.

### Technical Implementations
-   **Frontend**: React 18, TypeScript, Vite, ShadCN UI, Tailwind CSS, Framer Motion, Wouter.
-   **Backend**: Express.js, TypeScript, TanStack Query, Zod, Axios.
-   **Database**: PostgreSQL (Neon serverless), Drizzle ORM, Drizzle-kit.
-   **Key Features**: Order Management (dynamic configuration, linked orders, rush fees, urgency), Layup Scheduler, Production Queue Manager, Department Manager, Customer Management (CRM, CSV import, address autocomplete), Inventory Management (BOM integration), Metal Accessories Tracker, Barcode System, Employee Management (CRUD, portal, time clock), Quality Control (digital signature, checklists), Reporting, Payment Tracking, Shipping Integration, Communications System (inbox, email, SMS), Personalized Dashboards, Training Management System, AI-Powered Smart Sorting, Calendar Integration, Magic Link Authentication, and Global Search.

## Database Schema Standards

### Primary Key Pattern (CRITICAL)
**NEVER use `serial` data type for new tables.** PostgreSQL's `serial` is a creation-time macro that cannot be used in ALTER statements, causing migration failures with "type 'serial' does not exist" errors.

**Standard for ALL new tables:**
```typescript
// ✅ CORRECT - Use UUID for all new tables
import { uuid } from 'drizzle-orm/pg-core';

export const newTable = pgTable('new_table', {
  id: uuid('id').defaultRandom().primaryKey(),
  // ... other columns
});
```

**❌ FORBIDDEN - Never use serial for new tables:**
```typescript
// ❌ DO NOT DO THIS
import { serial } from 'drizzle-orm/pg-core';
id: serial('id').primaryKey()  // This will cause migration issues
```

**UUID Tables (CONVERTED):**
The following tables were converted from `serial` to `uuid` to resolve deployment issues:
- `bomDefinitions`, `bomItems` (converted 2025-01-08)

**Legacy Tables (DO NOT MODIFY):**
Many existing tables use `serial` IDs and should remain unchanged to avoid data loss:
- `allOrders`, `orders`, `orderStatusTypes`, `orderDepartmentTypes`
- `inventoryItems`, `employees`, `certifications`, `vendors`
- `payments`, `customers`, `linked_order_groups`, `followup_orders`
- `p2ProductionOrders` (references BOMs with UUID FKs)
- All other tables with integer IDs

**Migration Safety:**
- Never retroactively change existing `serial` columns to UUID
- Never change existing UUID columns to `serial`
- Use `npm run db:push` to sync schema changes (or `npm run db:push --force` if needed)
- Never manually write SQL migrations for ID column type changes

**Why UUID over serial:**
- Works reliably with Drizzle migrations (no ALTER TYPE issues)
- Safe for distributed writes and data imports
- No sequence drift or collision issues
- Future-proof for scaling

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