# EPOCH v8 - Manufacturing ERP System

## Overview
EPOCH v8 is a comprehensive Manufacturing ERP system designed for small manufacturing companies specializing in customizable products. It aims to streamline operations, enhance efficiency, and improve scalability by providing end-to-end order management, inventory tracking, employee portal functionality, and quality control workflows. The project's vision is to become the leading ERP solution for small-to-medium customizable product manufacturers. It is a full-stack TypeScript application with a React frontend and Express backend, featuring Progressive Web App (PWA) capabilities for deployment to web and mobile platforms via Capacitor.

## Recent Changes
**October 13, 2025 - Barcode Label Positioning Update**
- **Avery 5160 Label Adjustment**: Moved barcode labels down 0.5 inch on the page by adjusting top margin from 0.5in to 1.0in for better alignment with Avery label sheets

**October 13, 2025 - OEM Priority Clarification & Material-Based Colors**
- **Clarified OEM Priority Settings**: OEM priority settings are ONLY for Purchase Orders (items with `poId` or `productionOrderId`), NOT for regular production orders. This prevents confusion between:
  - **Purchase Orders (OEM Priority)**: Items from purchase orders with GREEN BORDERS and "PO" badge for priority indication
  - **Production Orders**: Regular P1 production orders with standard borders
- **Material-Based Color System**: ALL cards (both Purchase Orders and Production Orders) now use material-based background colors:
  - **CF (Carbon Fiber)**: Light orange background (orange-200)
  - **FG (Fiberglass)**: Dark orange background (orange-600)
  - **Unknown Material**: RED background (red-100) - indicates orders that need attention/review
  - **Purchase Orders**: Same material colors but with GREEN BORDERS to indicate OEM priority
- **Updated LayupScheduler Logic**: Removed incorrect association between `source === 'production_order'` and OEM priority
- **Badge Update**: Changed "OEM" badge to "PO" badge for purchase order items to avoid confusion
- **Documentation**: Added clear distinction in code comments and system documentation

**October 11, 2025 - CI/CD Implementation & Code Quality Automation**
- **Implemented Three-Layer Protection System**:
  1. **Pre-Commit Hooks (Husky + lint-staged)** - ✅ ACTIVE - Blocks commits with TypeScript/ESLint errors
  2. **GitHub Actions CI/CD** - ✅ ACTIVE - Automated PR checks for TypeScript, ESLint, Prettier, and build verification
  3. **Branch Protection** - ⏳ PENDING - Configuration documented in CI_CD_SETUP.md (waiting for co-worker to return)
- **Added npm Scripts**: `lint`, `lint:fix`, `format` for code quality maintenance
- **Created Documentation**: CI_CD_SETUP.md with complete usage guide and troubleshooting
- **Purpose**: Prevent incomplete code (like the GitHub pull issue) from reaching main branch
- **⚠️ TODO**: Enable GitHub Branch Protection when co-worker returns (see CI_CD_SETUP.md for instructions)

**October 11, 2025 - TypeScript Error Cleanup & GitHub Pull Fixes**
- **GitHub Pull Integration Completed**: Merged incomplete capability-based permission system code from GitHub
- **TypeScript Errors Reduced**: From 126 errors to 46 (63% reduction)
  - Fixed missing User/UserSession type exports in schema.ts
  - Removed incomplete calendar feature imports (calendarEvents, calendarEventAttendees)
  - Fixed User creation password field (changed InsertUser to use password instead of passwordHash)
  - Added null safety checks for discount.percent before comparisons
  - Fixed Customer contact field missing from select statements
- **Remaining 46 errors**: Mostly Drizzle ORM type compatibility issues (version mismatches) that don't affect runtime
- **Root Cause Identified**: Partial commits to GitHub where imports/references were added but corresponding type definitions weren't committed
- **Capability-Based Permission System Status**:
  - Restructured from role-based to capability-based permissions
  - Simplified from 4 roles (ADMIN, HR, MANAGER, EMPLOYEE) to 3 roles (ADMIN, EMPLOYEE, OWNER)
  - Separated employee display (jobTitle) from system access (userRole)
  - Migrated capabilities from Employees to Users table
  - Created user_capabilities table with full CRUD operations
  - Added capability management UI in User Management page
  - Fixed critical route ordering issue
- **Next Step**: Populate capabilities table with system permissions before assigning to users

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
Navigation dropdown behavior: All navbar dropdown menus close automatically after selection. Fixed by removing conflicting auto-expand useEffect that was re-opening dropdowns 100ms after closing. Dropdowns now use direct button elements with onClick handlers that call closeAllDropdowns() then navigate programmatically.

## System Architecture
The application adopts a monorepo structure utilizing a full-stack TypeScript approach.

### Core Architectural Decisions
-   **Type Safety**: Achieved through shared TypeScript schemas using Drizzle and Zod.
-   **Cross-Platform Deployment**: PWA capabilities with Capacitor for web and mobile (iOS/Android).
-   **Dynamic Form Generation**: A dynamic form builder with signature capture.
-   **Authentication**: Hybrid JWT + Session authentication with capability-based access control and account lockout.
-   **Capability-Based Permissions**: Simplified 3-role system (ADMIN, EMPLOYEE, OWNER) with individual capability assignments. Employees have separate jobTitle (display) and userRole (system access) fields, allowing specific permissions to be granted/revoked on a per-employee basis independently of their job title.
-   **Data Consistency**: The `features` object is the single source of truth for all feature data in order entry.
-   **Modular Routing**: Backend routes are split into specialized modules.
-   **Atomic Order ID Reservation**: Database-based atomic reservation system for unique, sequential Order ID generation.
-   **UI/UX**: Utilizes ShadCN UI components with Tailwind CSS for design and Framer Motion for animations.

### Technical Implementations
-   **Frontend**: React 18, TypeScript, Vite, ShadCN UI, Tailwind CSS, Framer Motion, Wouter for routing.
-   **Backend**: Express.js, TypeScript, TanStack Query, Zod, Axios.
-   **Database**: PostgreSQL (Neon serverless), Drizzle ORM, Drizzle-kit.
-   **Key Features**:
    -   **Order Management**: Dynamic product configuration, feature consolidation, robust order editing, and streamlined order-to-production with auto-population to P1 Production Queue.
    -   **Layup Scheduler**: Auto-scheduling with production queue auto-population, priority scoring, mold matching, employee capacity management, and automatic department progression.
    -   **Production Queue Manager**: Auto-populates from finalized orders, calculates priority scores, and manages queue positions.
    -   **Department Manager**: Department-specific views, comprehensive order details, and critical workflow progression (**CORRECT ORDER**: Orders Entered → P1 Production Queue → Layup/Plugging → Barcode → CNC → **Gunsmith** → **Finish** → **Finish QC** → **Paint** → Shipping QC → Shipping). **FULFILLED orders are automatically excluded from all department filters** - they only appear in the Shipping Tracker.
    -   **Customer Management**: CRM with CSV import/update and address validation.
    -   **Inventory Management**: Search, BOM integration, and part number display.
    -   **Metal Accessories Tracker**: Production demand forecasting with weekly breakdown, clickable demand details showing order lists, and special logic for cheek riser items (calculated based on adjustable stock models).
    -   **P1 & P2 Systems**: Distinct modules for regular (P1) and OEM/supplier (P2) orders.
    -   **Barcode System**: P1 order barcode generation (Code 39) with scanner integration, categorized queue management, and Avery 5160 label printing.
    -   **Employee Management**: Full CRUD API for profiles, certifications, performance evaluations, and secure employee portal with time clock.
    -   **Quality Control**: Workflows for digital signature capture, validation, and comprehensive checklist submissions.
    -   **Reporting**: Sales order PDF generation with customer information and readable feature names.
    -   **Payment Tracking**: Integrated 'PAID' badge functionality.
    -   **Shipping Integration**: UPS OAuth 2.0 API integration for label generation and a Shipping Tracker with search functionality.
    -   **Communications System**: Customer communication management with inbox, email (SendGrid) and SMS (Twilio) integration.
    -   **Personalized Dashboards**: Secure auto-redirect system where each user is routed to their specific dashboard upon login. Role-based navbar system for access control.
    -   **Training System**: Certification and quiz system for employee training modules with PDF viewer and automatic certificate generation.
    -   **AI-Powered Smart Sorting**: Intelligent dropdown sorting system that learns from user behavior. Tracks selection frequency and dynamically reorders Action Inlet options to show most frequently selected items first, with alphabetical sorting as secondary criteria.

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
-   SendGrid (Email)
-   Twilio (SMS)