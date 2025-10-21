# EPOCH v8 - Manufacturing ERP System

## Overview
EPOCH v8 is a comprehensive Manufacturing ERP system for small manufacturing companies specializing in customizable products. It aims to streamline operations, enhance efficiency, and improve scalability through end-to-end order management, inventory tracking, an employee portal, and quality control workflows. The project's ambition is to become a leading ERP solution for small-to-medium customizable product manufacturers, offering a full-stack TypeScript PWA with a React frontend and Express backend, deployable to web and mobile platforms.

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
-   **Key Features**: Order Management (dynamic configuration, vendor contact), Layup Scheduler, Production Queue Manager, Department Manager, Customer Management (CRM, CSV import, address autocomplete), Inventory Management (BOM integration, vendor management), Metal Accessories Tracker, Barcode System, Employee Management (CRUD, portal, time clock), Quality Control (digital signature, checklists), Reporting, Payment Tracking, Shipping Integration, Communications System (inbox, email, SMS), Personalized Dashboards, Training Management System (modules, quizzes, certifications, matrix, enhanced analytics), AI-Powered Smart Sorting, Calendar Integration, Magic Link Authentication, and Global Search (unified search across customers, orders, vendors, employees, and inventory).

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



### October 21, 2025 - Linked Orders, Department Progression Fix & Bulk Fulfill

#### Bulk Fulfill Functionality
- **Floating Action Bar**: When orders are selected in Shipping department, a sticky action bar appears at the bottom of the screen
- **Multi-Select Support**: Users can select multiple orders via checkboxes and mark them all as fulfilled with a single click
- **Bulk Fulfill Button**: Green-themed "Mark as Fulfilled" button shows count of selected orders
- **Loading States**: Button displays "Fulfilling..." during the mutation process
- **Smart UI**: Action bar includes "Clear Selection" button and order count display
- **Success Feedback**: Toast notifications confirm how many orders were fulfilled
- **Integration**: Works alongside existing BulkShippingActions for consolidated shipping labels
- **Implementation**: Uses concurrent API calls via Promise.all for efficient batch processing

#### Department Progression Bug Fix
- **Issue**: Finish department was incorrectly sending orders to Paint, skipping Finish QC entirely
- **Root Cause**: FinishQueuePage.tsx had `progressMutation` hardcoded to send orders to 'Paint' instead of 'Finish QC'
- **Fix**: Updated progressMutation to correctly route orders to Finish QC
- **Correct Flow**: Finish → Finish QC → Paint (with optional "Skip to Paint" button for special cases)
- **Changes**: Updated button labels to clearly indicate "Progress to Finish QC" vs "Skip to Paint"

#### Linked Orders Management in All Orders List
- **CSR-Focused Integration**: Link Orders functionality added to All Orders List Actions dropdown for CSR workflow
- **Available in ALL Order List Views**: Implemented in both AllOrdersList.tsx (/all-orders) and OrdersList.tsx (/orders-list) components
- **Main CSR Page**: /orders-list route now has full Link Orders functionality in the dropdown menu
- **LinkOrdersDialog Component**: Comprehensive dialog for managing linked orders with:
  - View current link status and all orders in group
  - Create new link groups with optional 4-digit code protection
  - Add orders to existing groups
  - Unlink orders with code validation when required
  - Support for linking 2+ orders that must ship together or be processed as a group
- **Actions Dropdown Menu**: Added "Link Orders" option with chain link icon (🔗) to three-dot menu (⋮) in Actions column
- **Approval Code System**: Simple 4-character alphanumeric codes (e.g., "1234", "AB12") for customer service protection
  - CSR who creates the link sets optional 4-digit code
  - Code stored as plain text (not hashed) for simplicity
  - CSR provides code verbally/via message to anyone who needs to unlink
  - Input validation enforces exactly 4 letters or numbers
  - Auto-converts to uppercase, filters out special characters
- **User Experience**: CSRs can manage linked orders directly from where they work (All Orders List pages)
- **Database Schema**: linked_order_groups and linked_orders tables with approval code protection
- **API Routes**: Full CRUD operations at `/api/linked-orders/*` with server-side validation
- **Shipping Integration**: Mark-shipped endpoint validates linked orders ship together or requires approval code



### October 20, 2025 - User Settings & Integration Management Complete

#### User Integration Settings
- **Settings Page**: New `/settings` route with tabbed interface for user preferences and integrations
- **Per-User OAuth Integrations**: Each user can connect their own Google and Outlook accounts independently
- **Supported Integrations**:
  - Google Gmail: Connect Gmail for email management
  - Google Calendar: Sync calendar events
  - Google Drive: Access files and documents
  - Google Sheets: Manage spreadsheets
  - Outlook: Connect Outlook email and calendar
- **Connection Status Indicators**: Visual badges showing connection status for each integration
- **Account Display**: Shows connected account email and last sync timestamp
- **Database Schema**: New `userIntegrations` table stores OAuth tokens, refresh tokens, and connection metadata per user
- **API Endpoints**: RESTful API at `/api/user-integrations` for CRUD operations on user integrations
- **Security**: OAuth tokens stored securely with user-specific access control via authentication middleware
- **UI Components**: Built with ShadCN UI components including Cards, Tabs, Badges for consistent design
- **Future Enhancement**: OAuth connection flow to be implemented for actual Google/Outlook authentication


### October 20, 2025 - Global Search System & Vendor Evaluation Complete

#### Global Search Implementation
- **Navbar Search Button**: Search button with keyboard shortcut display (Cmd/Ctrl+K) in navigation bar
- **Keyboard Shortcut**: Global Cmd/Ctrl+K shortcut to open search from anywhere
- **Multi-Entity Search**: Searches across 5 entity types - Customers, Orders, Vendors, Employees, Inventory Items
- **Smart Results Display**: Grouped results by type with icons, matched field highlighting, and direct navigation
- **API Endpoint**: `/api/global-search` with debounced queries (300ms) for performance
- **Search Capabilities**:
  - Customers: name, company, email, phone
  - Orders: order ID, customer PO, FB order number, tracking number
  - Vendors: name, email, phone, address
  - Employees: name, email, phone, job title
  - Inventory: AG part number, name, source, supplier part number
- **UI Features**: Keyboard navigation (arrow keys), Enter to select, Esc to close, clear button
- **Components**: GlobalSearch.tsx (dialog UI) integrated into Navigation.tsx

#### Vendor Evaluation System
- **Question-Based Evaluation Form**: Redesigned vendor evaluation tab with accordion-based UI
- **4 Evaluation Criteria**: Quality (1-8), Delivery (2 questions), Cost (1-5), Communication (1-5)
- **Automatic Evaluation Status**: Backend automatically marks vendor as "Evaluated" when all 4 criteria are completed
- **Auto-Date Setting**: Evaluation date automatically set to today when evaluation is completed
- **Monthly Reset System**: Automated cron job resets all vendor evaluations on the 1st of each month at 12:01 AM
- **Implementation Details**:
  - Evaluation scores stored temporarily in notes field with structured format
  - Backend parses notes to detect completion of all criteria
  - Monthly reset ensures compliance with monthly evaluation requirements