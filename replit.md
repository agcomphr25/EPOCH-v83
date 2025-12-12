# EPOCH v8 - Manufacturing ERP System

## Overview
EPOCH v8 is a comprehensive Manufacturing ERP system designed for small manufacturing companies specializing in customizable products. Its primary purpose is to streamline operations, enhance efficiency, and improve scalability. Key capabilities include end-to-end order management, robust inventory tracking, an employee portal, and quality control workflows, a powerful Bill of Materials (BOM) system, Google OAuth integration, global search, and a comprehensive Parts List Management System. The business vision is to establish EPOCH v8 as the leading ERP solution for small-to-medium customizable product manufacturers, offering a full-stack TypeScript PWA with a React frontend and Express backend, deployable to web and mobile platforms.

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
Tikka compatibility guardrails: On the Order Entry page, Tikka stock models ONLY show Tikka options for action inlet, barrel inlet, and bottom metal (with a green "Tikka only" badge). Non-Tikka stock models hide all Tikka options from these dropdowns. When switching between Tikka and non-Tikka models, incompatible selections are automatically cleared with a toast notification.
Navbar-permissions alignment: The userPermissions.ts file is the source of truth for user route access. Navigation.tsx filters navbar items based on these permissions. Users not in the permissions list default to only seeing the Employee Portal. Each user sees only their own dashboard in the User Dashboards dropdown (admins see all). Any new navbar items must be added to both Navigation.tsx AND the appropriate user permission lists in userPermissions.ts to stay in sync.

## System Architecture
The application is built as a monorepo using a full-stack TypeScript approach, emphasizing type safety and cross-platform compatibility.

### Core Architectural Decisions
- **Type Safety & Data Consistency**: Utilizes shared TypeScript schemas (Drizzle, Zod) and a `features` object as a single source of truth.
- **Cross-Platform Deployment**: PWA capabilities are supported with Capacitor for web, iOS, and Android.
- **Authentication**: Hybrid JWT + Session authentication with a 3-role (ADMIN, EMPLOYEE, OWNER) capability-based access control system.
- **UI/UX**: Employs ShadCN UI components, Tailwind CSS, and Framer Motion for a modern and animated user experience.
- **BOM System**: Robust Bill of Materials system with UUID-based architecture and revision control.
- **Order Management**: Features atomic order ID reservation, rush fee adjustments, and an urgency/priority system.
- **Inventory & Production**: Includes comprehensive parts list management, P1 Purchase Orders Queue, vendor purchase order management with Zod validation, inventory CSV import with two-phase validation, and enhanced layup scheduling.
- **Quality Control**: Implements a Nonconformance Record System and a Vendor Evaluation System with automated scoring and monthly resets.
- **Cutting Table Operations**: Features FIFO-based packet building with two-phase allocation, AS9100 traceability via barcode scanning, dynamic inventory status thresholds, and a packet scheduling system.
- **Barcode Strategy**: Uses CODE128 for serialized items (P1-SWS2502-147-1) and CODE39 for regular order barcodes (EJ234), with an automatic helper function at `client/src/lib/barcodeFormat.ts`.
- **P2 Serialized Item Tracking**: Complete P2 purchase order serialized item tracking with customizable department workflows, barcode scanning, fail-closed traceability gating, and an AS9100-compliant Traveler Viewer System and Electronic Signature System.
- **Financial & Reporting**: Incorporates a Cost Center Management System, dynamic discount system, Credit Memo Management with immediate balance updates, Payment Analytics with month-over-month comparison, and Refund Request/Queue system with Accept.Blue integration for automated refund processing.
- **Help Center**: FAQ-based help system accessible to all users via navbar Help button. Covers Order Entry, Production Queue, BOM, and other key workflow areas with searchable Q&A format.
- **PDF Management**: Centralized PDF configuration and a flexible PDF Template Library System.
- **Smart Data Entry**: Streamlined traceability data entry with recent lot number recall, autocomplete, and barcode quick-fill lookup.
- **Control Centers**: Unified interfaces for P2 Purchase Orders and Cutting Table operations, offering dashboards, guided wizards, scheduling, and progress tracking.

### Technical Implementations
- **Frontend**: React 18, TypeScript, Vite, ShadCN UI, Tailwind CSS, Framer Motion, Wouter.
- **Backend**: Express.js, TypeScript, TanStack Query, Zod, Axios.
- **Database**: PostgreSQL (Neon serverless), Drizzle ORM, Drizzle-kit.
- **Key Features**: Order Management, Layup Scheduler, Production Queue Manager, Department Manager, Customer Management, Inventory Management, Barcode System, Employee Management, Quality Control, Reporting, Payment Tracking, Shipping Integration, Communications System, Personalized Dashboards, Training Management System, AI-Powered Smart Sorting, Calendar Integration, Magic Link Authentication, Global Search, and P2 Projects Module.
- **P2 Projects Module**: Multi-step workflow tracking for P2 purchase orders with sequential step enforcement (RFQ Risk Assessment → Quote → Purchase Review → Pre-production Checklist → P2 Order). Features project manager assignments, customizable reminder days per project, activity logging, and automatic notifications to project managers when steps are completed. Steps can only be completed in order - all previous steps must be completed before advancing. Routes at `/projects` and `/projects/:id`.

### Database Schema Standards
- **Primary Key Pattern**: All new tables must use UUID for primary keys; `serial` is forbidden for new tables.
- **Migration Safety**: Existing tables with `serial` IDs should not be modified, and existing ID column types must never be changed.

### Security Architecture
- **Authentication Model**: Dual-condition authentication bypass requiring `NODE_ENV != 'production'` AND `DEV_AUTH_BYPASS=true`.
- **Global API Authentication**: All `/api` routes require authentication except public routes.
- **JWT Secret**: Required in production.
- **Password Hashing**: Uses bcrypt with 12 salt rounds.
- **Input Validation**: Zod schemas validate all user input.
- **Bypass Routes**: Legacy bypass routes use `softAuth` middleware requiring `DEV_AUTH_BYPASS=true` for bypass.
- **Route Authorization**: Backend middleware mirrors frontend `userPermissions.ts`.
- **Admin-Only Routes**: Credit memos, vendors, cost accounting, discounts, and user management require admin role.
- **Development Mode**: `DEV_AUTH_BYPASS=true` only in development.
- **Production Deployment**: `NODE_ENV=production` and `DEV_AUTH_BYPASS` NOT set.

### Feature Flags
Experimental features are gated behind environment variables for controlled rollout.

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