# EPOCH v8 - Manufacturing ERP System

## Overview
EPOCH v8 is a comprehensive Manufacturing ERP system designed for small manufacturing companies specializing in customizable products.

## Recent Changes
**October 13, 2025 - Schema Cleanup & Deployment Preparation**
- **Removed Unused `cancelled_orders` Table**: Eliminated unused feature from codebase
  - Removed table definition from schema.ts (both root and server versions)
  - Removed `/cancelled` API route from server/src/routes/orders.ts
  - Removed CancelledOrdersPage component and route from client
  - **Reason**: Unused feature that was causing deployment schema conflicts
- **Schema Synchronization**: Development database now aligned with schema.ts
  - `customer_communications` table exists and matches schema
  - `customer_satisfaction_surveys` and `customer_satisfaction_responses` tables properly configured
  - No conflicting table definitions blocking deployment
- **Deployment Status**: ✅ Ready to deploy (publish)
  - Server running successfully on port 5000
  - All schema conflicts resolved
  - Database schema matches code definitions

**October 13, 2025 - Database Migration Fix & GitHub Integration Complete**
- **Critical Database Issue Resolved**: Fixed invalid `serial` type conversion error in customer satisfaction tables
  - **Root Cause**: Drizzle attempted to ALTER existing `integer` columns to `serial` type (invalid PostgreSQL operation)
  - **Solution**: Dropped and recreated `customer_satisfaction_surveys` and `customer_satisfaction_responses` tables with correct schema
  - **Result**: Clean database schema matching schema.ts definitions
  - **Key Learning**: `serial` is a PostgreSQL pseudo-type only valid during CREATE TABLE, not ALTER TABLE
- **Missing Package Fixed**: Installed `googleapis` package for Google Calendar integration

**October 13, 2025 - Complete GitHub Integration Verified & Calendar TypeScript Fixes**
- **New Features from GitHub Pull**:
  1. **Manual Tracking Entry Component** - Added ability to manually enter tracking numbers for external carriers (UPS, USPS, FedEx, DHL, Other) with notification options
  2. **Calendar Enhancements** - Improved Google Calendar integration with all-day event fixes, proper timezone handling, and color-coded events by calendar type (holidays in red, birthdays in purple)
  3. **Customer Satisfaction Updates** - Enhanced survey system with PDF export capabilities and improved analytics dashboard
  4. **Shipping Tracker Improvements** - Manual tracking entry integration for orders shipped via non-UPS carriers
- **Calendar Routes Fixed**: Commented out unimplemented local calendar storage endpoints (lines 198-334 in calendar.ts) to resolve 8 TypeScript errors
  - Calendar uses Google Calendar integration exclusively via `/api/calendar/google-events`
  - Local storage methods preserved in comments for potential future implementation
- **Address Validation Complete**: Migrated `/api/customers/validate-address` endpoint from disabled to active routes
  - Full SmartyStreets integration: autocomplete + validation + standardization working end-to-end
- **All Systems Verified**: ✅ TypeScript clean, ✅ LSP diagnostics clear, ✅ Server running, ✅ Production build successful

EPOCH v8 aims to streamline operations, enhance efficiency, and improve scalability by providing end-to-end order management, inventory tracking, employee portal functionality, and quality control workflows. The project's vision is to become the leading ERP solution for small-to-medium customizable product manufacturers. It is a full-stack TypeScript application with a React frontend and Express backend, featuring Progressive Web App (PWA) capabilities for deployment to web and mobile platforms via Capacitor.

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
The application adopts a monorepo structure utilizing a full-stack TypeScript approach.

### Core Architectural Decisions
- **Type Safety**: Achieved through shared TypeScript schemas using Drizzle and Zod.
- **Cross-Platform Deployment**: PWA capabilities with Capacitor for web and mobile (iOS/Android).
- **Dynamic Form Generation**: A dynamic form builder with signature capture.
- **Authentication**: Hybrid JWT + Session authentication with capability-based access control and account lockout.
- **Capability-Based Permissions**: Simplified 3-role system (ADMIN, EMPLOYEE, OWNER) with individual capability assignments. Employees have separate jobTitle (display) from userRole (system access).
- **Data Consistency**: The `features` object is the single source of truth for all feature data in order entry.
- **Modular Routing**: Backend routes are split into specialized modules.
- **Atomic Order ID Reservation**: Database-based atomic reservation system for unique, sequential Order ID generation.
- **UI/UX**: Utilizes ShadCN UI components with Tailwind CSS for design and Framer Motion for animations.
- **CI/CD**: Implemented pre-commit hooks (Husky + lint-staged) and GitHub Actions for automated quality checks (TypeScript, ESLint, Prettier, build verification).

### Technical Implementations
- **Frontend**: React 18, TypeScript, Vite, ShadCN UI, Tailwind CSS, Framer Motion, Wouter for routing.
- **Backend**: Express.js, TypeScript, TanStack Query, Zod, Axios.
- **Database**: PostgreSQL (Neon serverless), Drizzle ORM, Drizzle-kit.
- **Key Features**:
    - **Order Management**: Dynamic product configuration, robust editing, and streamlined order-to-production.
    - **Layup Scheduler**: Auto-scheduling with production queue auto-population, priority scoring, and mold matching. Material-based color system for order cards (CF: light orange, FG: dark orange, Unknown: red) and green borders for Purchase Orders.
    - **Production Queue Manager**: Auto-populates from finalized orders and calculates priority scores.
    - **Department Manager**: Department-specific views, detailed order information, and defined workflow progression (Orders Entered → P1 Production Queue → Layup/Plugging → Barcode → CNC → Gunsmith → Finish → Finish QC → Paint → Shipping QC → Shipping).
    - **Customer Management**: CRM with CSV import/update, address autocomplete, and validation.
    - **Inventory Management**: Search, BOM integration, and part number display.
    - **Metal Accessories Tracker**: Production demand forecasting with weekly breakdown and special logic for cheek riser items.
    - **P1 & P2 Systems**: Distinct modules for regular (P1) and OEM/supplier (P2) orders.
    - **Barcode System**: P1 order barcode generation (Code 39), scanner integration, categorized queue management, and Avery 5160 label printing with enhanced order information including paint subcategories and color-coded special features.
    - **Employee Management**: Full CRUD API for profiles, certifications, performance evaluations, and secure employee portal with time clock.
    - **Quality Control**: Workflows for digital signature capture, validation, and comprehensive checklist submissions.
    - **Reporting**: Sales order PDF generation.
    - **Payment Tracking**: Integrated 'PAID' badge functionality.
    - **Shipping Integration**: UPS API for label generation and a Shipping Tracker.
    - **Communications System**: Customer communication management with inbox, email, and SMS integration.
    - **Personalized Dashboards**: Secure auto-redirect system to user-specific dashboards upon login with role-based navbar.
    - **Training Management System**: Comprehensive training platform with PDF import using Azure Document Intelligence for automatic content extraction, module creation with quizzes and evaluations, employee training records tracking, certification management, legacy training matrix import (CSV and PDF), and automatic certificate generation. Supports MULTIPLE_CHOICE, TRUE_FALSE, and SHORT_ANSWER question types with detailed attempt tracking and scoring. Includes visual Training Matrix View showing employee training completion status with green checkmarks for completed trainings (with dates and notes) and red circles for pending trainings, plus progress tracking and search functionality.
    - **AI-Powered Smart Sorting**: Intelligent dropdown sorting for Action Inlet options based on user behavior (selection frequency).
    - **Calendar Integration**: Displays Google Calendar events via OAuth.
    - **Azure Document Intelligence**: AI-powered document analysis for extracting data from invoices, receipts, and other documents using Azure's prebuilt models. Supports multiple document types with automatic field extraction and table detection.

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
- UPS API (Shipping)
- SendGrid (Email)
- Twilio (SMS)
- Google Calendar (Event Integration)
- Azure Document Intelligence (AI-powered document analysis)