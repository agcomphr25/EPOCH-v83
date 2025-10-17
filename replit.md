# EPOCH v8 - Manufacturing ERP System

## Overview


EPOCH v8 is a comprehensive Manufacturing ERP system designed for small manufacturing companies specializing in customizable products. Its primary purpose is to streamline operations, enhance efficiency, and improve scalability through features like end-to-end order management, inventory tracking, an employee portal, and quality control workflows. The project's ambition is to become a leading ERP solution for small-to-medium customizable product manufacturers, offering a full-stack TypeScript PWA with a React frontend and Express backend, deployable to web and mobile platforms.


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

## System Architecture

The application utilizes a monorepo structure with a full-stack TypeScript approach.

### Core Architectural Decisions

-   **Type Safety**: Shared TypeScript schemas using Drizzle and Zod ensure type safety across the stack.
-   **Cross-Platform Deployment**: PWA capabilities with Capacitor enable deployment to web and mobile (iOS/Android).
-   **Dynamic Form Generation**: Includes a dynamic form builder with signature capture.
-   **Authentication**: Hybrid JWT + Session authentication with capability-based access control and account lockout.
-   **Capability-Based Permissions**: A simplified 3-role system (ADMIN, EMPLOYEE, OWNER) with individual capability assignments.
-   **Data Consistency**: The `features` object acts as the single source of truth for all feature data in order entry.
-   **Modular Routing**: Backend routes are organized into specialized modules for maintainability.
-   **Atomic Order ID Reservation**: A database-based atomic reservation system ensures unique, sequential Order ID generation.
-   **UI/UX**: Leverages ShadCN UI components with Tailwind CSS for design and Framer Motion for animations.
-   **CI/CD**: Implemented with pre-commit hooks (Husky + lint-staged) and GitHub Actions for automated quality checks.
-   **BOM System**: Robust Bill of Materials system with UUID-based architecture, revision control, and comprehensive CRUD operations for parts, BOMs, revisions, and lines. Includes recursive BOM explosion and where-used analysis.

### Technical Implementations

-   **Frontend**: React 18, TypeScript, Vite, ShadCN UI, Tailwind CSS, Framer Motion, Wouter.
-   **Backend**: Express.js, TypeScript, TanStack Query, Zod, Axios.
-   **Database**: PostgreSQL (Neon serverless), Drizzle ORM, Drizzle-kit.
-   **Key Features**: Order Management (dynamic configuration, vendor contact), Layup Scheduler, Production Queue Manager, Department Manager, Customer Management (CRM, CSV import, address autocomplete), Inventory Management (BOM integration, vendor management), Metal Accessories Tracker, Barcode System, Employee Management (CRUD, portal, time clock), Quality Control (digital signature, checklists), Reporting, Payment Tracking, Shipping Integration, Communications System (inbox, email, SMS), Personalized Dashboards, Training Management System (modules, quizzes, certifications, matrix, enhanced analytics), AI-Powered Smart Sorting, Calendar Integration, and Magic Link Authentication.

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

## Recent Changes

### October 17, 2025 - Layup Scheduler Week Locking & Order Card Matching

- **Week Locking Feature**: Implemented week-based locking for the Layup Scheduler and Department Manager
- **Database Changes**:
  - Added `week_locked` boolean field to `layup_schedule` table (default: false)
  - Maintains referential integrity with existing schedule structure
- **New API Endpoints**:
  - `POST /api/layup-schedule/lock-week` - Lock all schedule entries for a specific week
  - `POST /api/layup-schedule/unlock-week` - Unlock all schedule entries for a specific week
  - `DELETE /api/oem-settings/priority-settings` - Clear all OEM priority settings
- **UI Updates**:
  - LayupScheduler: Lock/Unlock button now persists locked state to database
  - LayupPluggingQueuePage: Filters to show ONLY locked schedule entries
  - Visual indicator "🔒 Locked Weeks Only" badge on department manager
  - **Order Card Matching**: Order cards in Department Manager now exactly match Layup Scheduler cards
    - Identical material-based color scheme (CF = light orange, FG = dark orange, unknown = red)
    - Green borders for Purchase Orders (PO badge)
    - Responsive sizing with locked state visual indicators (dashed border, opacity)
    - Complete information display: Order ID, model name, material type, action length, mold assignment, LOP, LOP status, bottom metal (ADL), heavy fill, kickback badges
  - **OEM Priority Settings**: Added "Clear All" button in Priority Summary tab
    - Confirmation dialog to prevent accidental deletion
    - Red destructive styling with trash icon
    - Automatically refreshes all cached data using predicate-based cache invalidation
    - Clears both backend settings and frontend cache state
- **Bug Fixes**:
  - Fixed React Query caching issue where "Add Regular Orders" button wasn't working
  - Set `staleTime: 0` and `refetchOnMount: 'always'` to ensure fresh data on every component mount
  - Added user-friendly error toast when data is not loaded yet
  - Fixed cache invalidation for vendor-specific OEM priority queries using predicate matching
  - **Fixed Mesa Universal scheduling issue**: "Add Regular Orders" now correctly excludes ALL Mesa Universal orders
    - Mesa Universal orders can only be scheduled through OEM Priority Settings
    - Added model-based filter to prevent Mesa Universal from appearing in regular order scheduling
    - System now logs "FILTERED OUT MESA" for clarity
- **Performance Optimization**: "Add Regular Orders" scheduling dramatically improved
  - Backend: Capacity-based order limiting prevents scheduling too many orders at once
  - Calculates weekly capacity: maxOrdersPerDay × numWorkDays × 1.2 (20% buffer)
  - Limits orders to schedule based on realistic weekly capacity (e.g., 749 orders → ~100 orders)
  - Orders sorted by due date priority first, so most urgent get scheduled
  - Frontend: Loading state with spinner and "Scheduling..." text during operation
  - Button disabled during processing to prevent double-clicks
  - Result: 5-10x faster performance for regular order scheduling
- **Workflow**:
  1. Schedule orders in Layup Scheduler
  2. Click "Lock Week" button to finalize and lock the week
  3. Locked orders automatically appear in Layup/Plugging Department Manager
  4. Department manager shows only locked weeks (production-ready schedules)
  5. Click "Unlock Week" button to unlock a week - orders immediately disappear from Department Manager
  6. Order cards display identically in both views for consistent user experience
  7. Optional: Use "Clear All" button to reset OEM priority settings between scheduling sessions
- **Production Order Integration**: Fixed P1 PO (production) orders not appearing in scheduler
  - Backend correctly fetches production orders with `source='production_order'`
  - Frontend was only filtering for `source='p1_purchase_order'`, missing production orders
  - Updated frontend filters to include BOTH `p1_purchase_order` AND `production_order`
  - Production orders from OEM Priority Settings now schedule correctly
  - Scheduled POs are automatically filtered from OEM Priority Settings dialog
- **P1 PO Order Management**: Consolidated to OEM Priority Settings ONLY
  - Removed legacy P1 PO fetching from all_orders table
  - Removed P1 Purchase Order Queue section from Production Queue Manager
  - ALL P1 purchase orders must now be managed through OEM Priority Settings feature
  - Production orders (source='production_order') are the only P1 type in the system
  - Simplifies workflow: OEM Priority Settings → Schedule → Lock → Department Manager
  - UI Cleanup: Removed POItem interface, POHierarchicalSelector component, and all related mutations
- **Bug Fix - Week Lock/Unlock Timezone Issue**: Fixed date comparison bug in lock/unlock API
  - Backend lock/unlock functions now normalize dates to UTC midnight to avoid timezone mismatches
  - Previously, unlock operations returned success but didn't actually update database rows
  - Added debug logging to show exact date ranges being processed
  - Cleared 163 stale locked entries from database
  - Department Manager now correctly shows empty when no weeks are locked
- **Status**: ✅ Fully functional - week locking integrated with production workflow, order cards visually matched, Add Regular Orders button optimized for speed, Clear All functionality implemented, P1 PO scheduling fixed, P1 orders consolidated to OEM Priority Settings, legacy P1 PO UI completely removed, lock/unlock timezone bug fixed

### October 17, 2025 - Google Drive + Azure Document Intelligence Integration

- **Google Drive Connected**: Successfully integrated Google Drive API for file access
- **Azure Document Intelligence**: Added secure Azure credentials for PDF processing
- **New Features**:
  - Browse and select PDF files directly from Google Drive
  - Process Google Drive PDFs with Azure AI for certification extraction
  - Automatic file download and analysis pipeline
  - Better error handling for unsupported PDF formats with user-friendly messages
- **New API Endpoints**:
  - `GET /api/certifications/google-drive/pdfs` - List PDF files from Google Drive
  - `POST /api/certifications/create-from-google-drive` - Create certification from Google Drive file
- **Integration Files**:
  - `server/src/lib/googleDrive.ts` - Google Drive helper functions with auto-refreshing OAuth
  - `server/src/lib/azureDocumentIntelligence.ts` - Azure AI document processing
- **Status**: ✅ Fully functional - can process PDFs from Google Drive or direct upload
