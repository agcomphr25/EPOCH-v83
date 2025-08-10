# EPOCH v8 - Manufacturing ERP System

## Overview
EPOCH v8 is a comprehensive Manufacturing ERP system designed for small manufacturing companies specializing in customizable products. It provides end-to-end order management, inventory tracking, employee portal functionality, and quality control workflows. The system is a full-stack TypeScript application with a React frontend and Express backend, featuring Progressive Web App (PWA) capabilities and deployable to both web and mobile platforms via Capacitor. Its business vision is to streamline operations for customizable product manufacturers, enhancing efficiency and scalability.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes
**August 10, 2025**: Fixed Mesa Universal mold assignment bug and implemented comprehensive production flow workflow:
- FIXED CRITICAL BUG: Mesa Universal orders were incorrectly assigned to APR molds instead of Mesa molds
- Updated "Auto Schedule" button to use backend algorithmic scheduler instead of old frontend logic
- Added comprehensive mold compatibility debugging with explicit APR mold exclusion for Mesa Universal orders
- Algorithmic scheduler now properly assigns Mesa Universal orders → ONLY Mesa molds (never APR molds)
- System processes 1008 orders with 400 Mesa Universal orders correctly constrained to 2 Mesa Universal molds
- Console shows detailed mold compatibility analysis: "Mesa Universal → APR-1: isMesa=false, isAPR=true" (rejected)
- Implemented balanced scheduling algorithm that prevents Mesa Universal orders from dominating capacity
- Added product name fallback matching for orders with undefined stockModelId
- System now schedules 148+ orders (60 Mesa Universal + 88 other stock models) vs. previous 60 Mesa-only scheduling
- Integrated employee production rate constraints from employee_layup_settings table
- Daily capacity limits: Theresa Flores (10 parts/day) + Jessica Pena (10.25 parts/day) = 20.25 parts/day total
- Scheduler now respects both mold capacity AND employee capacity constraints for realistic production planning
- Added daily capacity utilization tracking showing actual vs. maximum capacity per workday

**August 10, 2025**: Implemented comprehensive production flow workflow:
- Built complete end-to-end production pipeline from order finalization to department progression
- Regular orders and P1 purchase orders automatically flow to production queue upon finalization
- Production queue organized by due date and priority score with 1008+ order processing capacity
- Algorithmic layup scheduler automatically processes queue with intelligent mold-to-stock model matching
- Implemented Monday-Thursday only scheduling constraint with intelligent work day filtering
- Created "Save Schedule" functionality that saves layup schedule AND pushes current week orders to Layup/Plugging Department Manager
- Added backend `/api/push-to-layup-plugging` endpoint for department workflow progression
- Orders can now be multi-selected in department managers and pushed to next department in sequence
- Disabled old client-side scheduler that was causing "no compatible molds" errors
- System now uses only the algorithmic scheduler backend for consistent, error-free scheduling
- Complete production workflow: Finalized Orders → Production Queue → Layup Scheduler → Department Manager → Multi-select Progress → Next Department

**August 8, 2025**: Fixed All Orders page display issue:
- Resolved critical bug where All Orders page only showed 67 order drafts instead of all 655 finalized orders
- Updated getAllOrders() method to query the correct allOrders table instead of orderDrafts table
- Fixed database schema mismatch by removing non-existent columns (finalizedAt, finalizedBy) that were causing SQL errors
- Enhanced order data enrichment with customer names and product information for frontend compatibility
- All Orders page now properly displays complete order history with full department progression tracking

**August 8, 2025**: Integrated complete Authorize.Net credit card processing system:
- Added secure payment processing backend with Authorize.Net API integration
- Created credit card transactions database table for complete payment tracking
- Built Payment Management page with real-time credit card form validation and formatting
- Added Payment Management to Finance navigation dropdown menu
- Implemented secure API endpoints for processing payments, viewing transaction history, and voiding transactions
- Fixed Finance Dashboard JavaScript error where `apData.reduce` was called on non-array data
- System now supports real credit card payments with auth codes, AVS, CVV results, and test/production mode
- Enhanced business management system with comprehensive payment processing capabilities

**August 4, 2025**: Added conditional Rails and QD feature filtering for Chalk stock models:
- Implemented hard-coded feature parameters for Stock Models containing "Chalk" in the name
- Chalk models now only show limited Rails options: "4" ARCA Rail", "AG Pic", and "AG Pic w/Int Stud"
- Chalk models now only show limited QD options: "No QDs", "QDs - 1 Right (Butt)", and "QDs - 1 Left (Butt)"
- Added visual indicator showing "Chalk Model - Limited Options" badge when Chalk model is selected  
- Enhanced Order Entry form with conditional logic based on selected stock model type
- Added "Glenn Test Fork" button to Order Entry form for GitHub fork demonstration
- System automatically detects Chalk models (CF Chalk Branch, CF Adj Chalk Branch, FG Chalk Branch, FG Adj Chalk Branch)

**August 4, 2025**: Fixed P1 Purchase Order Integration in Layup Scheduler:
- Resolved critical issue where P1 purchase order stocks disappeared from LayupScheduler after auto-scheduling
- Fixed conflicting auto-scheduling processes that were overwriting P1 purchase order assignments
- Added logic to preserve existing P1 purchase order assignments when applying regular order schedules
- Implemented distinctive purple styling for P1 purchase order items in the scheduler
- Modified calendar cell rendering to use processedOrders for complete order visibility
- Enhanced Purchase Order Management cards with quantity display and package icons
- Added POQuantityDisplay component with real-time item quantity calculation

**August 3, 2025**: Enhanced shipping management system with comprehensive improvements:
- Implemented automatic customer address population for shipping labels from order and customer_addresses table
- Added package value/cost integration with automatic calculation from order pricing (finalPrice/basePrice)
- Enhanced UPS API integration with declared value and insurance options for customs and shipping protection
- Improved shipping label fallback system with customer information auto-population and package value display
- Created customer address preview endpoint for pre-shipping validation

**August 1, 2025**: Enhanced Waste Management Form in P2 Forms section:
- Replaced complex form with simplified, user-friendly version matching PDF structure exactly
- Implemented smart dropdown functionality for chemical names with persistent storage
- Added container size dropdown with predefined options (5 gal, 1 gal, Pint, etc.) and custom entry capability  
- Changed SDS field from text input to simple Yes/No checkbox
- Added comprehensive "Saved Drafts" functionality allowing users to save, load, and manage form drafts
- All custom chemicals and container sizes persist across sessions using localStorage
- Fixed draft loading issues to prevent duplicate/unremovable entries

## System Architecture
The application adopts a monorepo structure utilizing a full-stack TypeScript approach.

### Core Architectural Decisions
-   **Type Safety**: Achieved through shared TypeScript schemas using Drizzle and Zod, eliminating type mismatches and providing compile-time validation across frontend and backend.
-   **Cross-Platform Deployment**: PWA capabilities integrated with Capacitor enable a single codebase for both web and mobile platforms (iOS/Android).
-   **Dynamic Form Generation**: A dynamic form builder with signature capture allows non-technical users to create custom forms.
-   **Authentication**: A hybrid JWT + Session authentication system provides secure, flexible user authentication, including role-based access control and account lockout protection.
-   **Data Consistency**: A "Golden Rule" ensures the `features` object is the single source of truth for all feature-related data in order entry, preventing data inconsistencies.
-   **Modular Routing**: The backend employs a modular routing system, splitting routes into specialized, maintainable modules for better organization and collaborative development.
-   **Atomic Order ID Reservation**: A database-based atomic reservation system eliminates race conditions and ensures unique, sequential Order ID generation for concurrent users.

### Technical Implementations
-   **Frontend**: React 18 with TypeScript, built using Vite, featuring ShadCN UI components with Tailwind CSS for styling and Framer Motion for animations. Wouter-based routing is used for navigation.
-   **Backend**: Express.js with TypeScript, utilizing TanStack Query for server state management, Zod for runtime validation, and Axios for external API calls.
-   **Database**: PostgreSQL managed via Neon serverless, with Drizzle ORM for type-safe database operations and Drizzle-kit for schema migrations.
-   **Core Features**:
    -   **Order Management**: Includes dynamic product configuration, a comprehensive feature consolidation system, and robust order editing capabilities. Features like Rails, Paint, Bottom Metal, and Handedness persist correctly.
    -   **Layup Scheduler**: Implements an advanced auto-scheduling algorithm for production orders, prioritizing by score and due date, with a Monday-Thursday work week distribution. It supports drag-and-drop scheduling, mold filtering, and employee capacity management. Visual indicators include a 4-color status system for production pipeline overview based on due dates.
    -   **Department Manager**: Enhanced navigation with separate "Shipping QC" and "Shipping" department options. Features CSS-based hover tooltips that display comprehensive order details including all customizations and features without glitching or performance issues. The Layup/Plugging Department Manager specifically displays orders from the automatically generated layup schedule and allows users to progress those orders through the production pipeline to the next department (Barcode). It mirrors the layup schedule for execution, separate from the Layup Scheduler which handles the automatic scheduling logic.
    -   **Customer Management**: Comprehensive CRM with CSV import/update, integrated SmartyStreets address validation and autocomplete.
    -   **Inventory Management**: Enhanced with search functionality, BOM integration, and part number display.
    -   **P1 & P2 Systems**: Distinct modules for P1 (regular) and P2 (OEM/supplier) orders, customers, purchase orders, and production order generation based on BOMs.
    -   **Barcode System**: Integrated P1 order barcode generation (Code 39) with scanner integration for order details and Avery label printing.
    -   **Employee Management**: Full CRUD API for employee profiles, certifications, performance evaluations, and document management, including a secure employee portal with time clock and checklist functionality.
    -   **Quality Control**: Workflows for digital signature capture, validation, and comprehensive submissions management for checklists like Purchase Review.
    -   **Centralized Configuration**: `shared/company-config.ts` centralizes company information and certification templates for consistency.
    -   **Code Quality**: Integrated ESLint, Prettier, and lint-staged for consistent code formatting and quality checks.

## External Dependencies

### Database
-   **PostgreSQL**: Primary data store (via Neon serverless)
-   **Drizzle ORM**: For database interactions and schema management

### UI Framework
-   **React 18**: Frontend UI library
-   **ShadCN UI**: Component library
-   **Tailwind CSS**: Utility-first CSS framework
-   **Framer Motion**: Animation library

### Backend Dependencies
-   **Express.js**: Web application framework
-   **TanStack Query**: Server state management
-   **Zod**: Runtime type validation
-   **Axios**: HTTP client
-   **Multer**: For file uploads (e.g., employee documents)

### Development Tools
-   **Vite**: Build tool and development server
-   **TypeScript**: Programming language
-   **ESLint/Prettier**: Code quality and formatting
-   **Capacitor**: Cross-platform mobile deployment

### Third-Party Services
-   **SmartyStreets**: Address validation and autocomplete API