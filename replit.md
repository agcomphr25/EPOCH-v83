# EPOCH v8 - Manufacturing ERP System

## Overview
EPOCH v8 is a comprehensive Manufacturing ERP system designed for small manufacturing companies specializing in customizable products. It provides end-to-end order management, inventory tracking, employee portal functionality, and quality control workflows. The system aims to streamline operations, enhance efficiency, and improve scalability for customizable product manufacturers. It is a full-stack TypeScript application with a React frontend and Express backend, featuring Progressive Web App (PWA) capabilities and deployable to both web and mobile platforms via Capacitor. The project's vision is to become the leading ERP solution for small-to-medium customizable product manufacturers.

## User Preferences
Preferred communication style: Simple, everyday language.
Production constraints: Do not modify mold capacities or employee settings to unrealistic values. Use actual production capacity constraints for accurate scheduling.
Order finalization rules: Orders with "None" or empty stock models cannot be finalized and sent to the Production Queue. The system will block finalization with a clear error message.
Order identification: FB Order Numbers (like AK046) are stored in the fb_order_number field, not as the primary order_id. The actual order_id remains the AG series format (e.g., AG589 has FB Order #AK046).
Data integrity: Prevent orders from being saved with null/empty modelId fields to maintain consistency between draft and finalized order tables.
UI Performance: Department progression buttons use cache-first approach with disabled automatic refetching to prevent UI reversion issues (resolved August 2025).
Default shipping charge: Should be 36.95 for new orders.
Critical requirement: All completed functionality must be hard-coded to prevent loss of features and data.
Shipping Label System: Successfully converted from problematic modal to dedicated page approach with enhanced customer data loading and UPS API integration (August 21, 2025).
Authentication: Completely disabled for all environments - no login required on deployed sites or development.
Navigation enhancement: STACITEST Dashboard includes 5 color-coded navigation cards for quick access to core functions.

## System Architecture
The application adopts a monorepo structure utilizing a full-stack TypeScript approach.

### Core Architectural Decisions
-   **Type Safety**: Achieved through shared TypeScript schemas using Drizzle and Zod for compile-time validation.
-   **Cross-Platform Deployment**: PWA capabilities integrated with Capacitor enable a single codebase for web and mobile platforms (iOS/Android).
-   **Dynamic Form Generation**: A dynamic form builder with signature capture allows non-technical users to create custom forms.
-   **Authentication**: A hybrid JWT + Session authentication system provides secure, flexible user authentication, including role-based access control and account lockout protection.
-   **Data Consistency**: A "Golden Rule" ensures the `features` object is the single source of truth for all feature-related data in order entry.
-   **Modular Routing**: The backend employs a modular routing system, splitting routes into specialized, maintainable modules.
-   **Atomic Order ID Reservation**: A database-based atomic reservation system ensures unique, sequential Order ID generation for concurrent users.
-   **UI/UX**: Utilizes ShadCN UI components with Tailwind CSS for a modern, responsive design and Framer Motion for subtle animations.

### Technical Implementations
-   **Frontend**: React 18 with TypeScript, built using Vite, featuring ShadCN UI components with Tailwind CSS for styling and Framer Motion for animations. Wouter-based routing is used.
-   **Backend**: Express.js with TypeScript, utilizing TanStack Query for server state management, Zod for runtime validation, and Axios for external API calls.
-   **Database**: PostgreSQL managed via Neon serverless, with Drizzle ORM for type-safe database operations and Drizzle-kit for schema migrations.
-   **Core Features**:
    -   **Order Management**: Dynamic product configuration, feature consolidation, and robust order editing with a unified system for both draft and finalized orders. Includes streamlined order-to-production process with direct finalization and auto-population to P1 Production Queue. Enhanced validation prevents data inconsistency between draft and finalized order tables by requiring valid modelId for all orders. Due date persistence system prevents auto-generation from overwriting user-set dates, with smart detection of manual changes and visual indicators.
    -   **Layup Scheduler**: Comprehensive auto-scheduling system with production queue auto-population, priority scoring, Monday-Thursday default scheduling with Friday visibility for manual adjustments. Features drag-and-drop, mold matching, employee capacity management, and automatic department progression. Includes lock/unlock functionality for schedules and automated cleanup of orphaned schedule entries when orders progress to other departments. Enhanced lock and push functionality now handles full schedule scope instead of just the currently visible week (UPDATED: August 20, 2025 PM - now pushes ALL scheduled orders across entire schedule, not just visible week).
    -   **Production Queue Manager**: Auto-populates production queue from finalized orders, calculates priority scores based on due date urgency, manages queue positions with manual adjustments, and provides comprehensive production flow management.
    -   **Department Manager**: Enhanced navigation with department-specific views and comprehensive order details via tooltips. Standardized department progression: P1 Production Queue → Layup/Plugging → Barcode → CNC (splits to Gunsmith or Finish based on features) → Gunsmith → Finish → Finish QC → Paint → Shipping QC → Shipping. CNC Department features dual-queue system with automatic routing based on order features. Gunsmith Department features due date categorization with color-coded priority levels (overdue, due today, due tomorrow, etc.) while maintaining original card grid layout and multi-select functionality. Finish Department features technician assignment (Tomas, AG, Timmy) with routing to Finish QC. Finish QC Department organizes orders by assigned technician with alphabetical/numerical sorting, displays texture and paint color information on cards, and provides multi-select progression to Paint department. Paint Department features multi-select functionality and progression to Shipping QC. Adjustable stock models correctly route to Finish department, not Gunsmith. Orders with "no_rail" bypass gunsmith work entirely, routing directly from CNC to Finish department. Fixed department progression button UI reversion issue with aggressive cache-first approach (August 2025).
    -   **Customer Management**: Comprehensive CRM with CSV import/update, integrated address validation, and enhanced contact/address display.
    -   **Inventory Management**: Enhanced with search, BOM integration, and part number display.
    -   **P1 & P2 Systems**: Distinct modules for P1 (regular) and P2 (OEM/supplier) orders, customers, purchase orders, and production order generation based on BOMs.
    -   **Barcode System**: Complete P1 order barcode generation (Code 39) with scanner integration, categorized queue management, multi-select functionality, and professional Avery 5160 label printing. Features fully scannable Code 39 barcodes with proper spacing, industry-standard encoding, display names for stock models, and labels that open in new tab/popup for viewing and printing. Optimized for production floor scanning with individual barcode recognition. Enhanced barcode scanning displays ALL order features and specifications with user-friendly names (converts "action_length" to "Action Length" and "short_action" to "Short Action").
    -   **Employee Management**: Full CRUD API for employee profiles, certifications, performance evaluations, and document management, including a secure employee portal with time clock and checklist functionality. Development mode bypass authentication for production floor access to employee data. Route /employee properly configured for Employee Dashboard access.
    -   **Quality Control**: Workflows for digital signature capture, validation, and comprehensive submissions management for checklists. Enhanced QC inspection reports dynamically integrate order-specific details including stock model, work order specifications (handedness, bottom metal, barrel inlet, action, action length), paint colors, custom options, swivel studs, shipping addresses, and all accessories from the actual order data.
    -   **Reporting**: Enhanced sales order PDF generation with customer information and readable feature names. Includes smart print filtering for production schedules.
    -   **Payment Tracking**: Integrated 'PAID' badge functionality with consistent payment data across the system.
    -   **Shipping Integration**: Complete UPS API integration with dedicated shipping label page (`/shipping/label/:orderId`). Features package details form, billing options (sender/receiver), customer address auto-population, and comprehensive error handling. UPS payload structure implemented correctly - requires UPS credential validation for full activation (August 2025).
    -   **Dashboard Navigation**: STACITEST Dashboard enhanced with 5 color-coded quick navigation cards providing immediate access to Order Entry (blue), All Orders (green), Draft Orders (yellow), Layup/Plugging queue (purple), and Customer Management (orange). Cards feature hover effects, responsive layout, and consistent theming.
    -   **Centralized Configuration**: `shared/company-config.ts` centralizes company information and certification templates.
    -   **Code Quality**: Integrated ESLint, Prettier, and lint-staged for consistent code formatting and quality checks. Custom feature validation system enforces the "Golden Rule" by checking for proper usage of the features object as single source of truth.

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
-   Multer

### Development Tools
-   Vite
-   TypeScript
-   ESLint/Prettier
-   Capacitor

### Third-Party Services
-   SmartyStreets (Address Validation)
-   Authorize.Net (Payment Gateway)
-   UPS API (Shipping)