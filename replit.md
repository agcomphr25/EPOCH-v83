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