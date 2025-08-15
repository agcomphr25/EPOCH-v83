# EPOCH v8 - Manufacturing ERP System

## Overview
EPOCH v8 is a comprehensive Manufacturing ERP system for small manufacturing companies specializing in customizable products. It provides end-to-end order management, inventory tracking, employee portal functionality, and quality control workflows. The system aims to streamline operations for customizable product manufacturers, enhancing efficiency and scalability. It is a full-stack TypeScript application with a React frontend and Express backend, featuring Progressive Web App (PWA) capabilities and deployable to both web and mobile platforms via Capacitor. The project's vision is to become the leading ERP solution for small-to-medium customizable product manufacturers, enabling them to scale operations efficiently and competitively.

## User Preferences
Preferred communication style: Simple, everyday language.
Production constraints: Do not modify mold capacities or employee settings to unrealistic values. Use actual production capacity constraints for accurate scheduling.
Order finalization rules: Orders with "None" or empty stock models cannot be finalized and sent to the Production Queue. The system will block finalization with a clear error message.

## Interface Components Reference
**IMPORTANT: Multiple Order List Interfaces Exist**

The system has several different order list components. When the user refers to "All Orders" interface, clarify which specific component they're viewing:

1. **OrdersList.tsx** (`client/src/pages/OrdersList.tsx`)
   - Primary orders interface accessed via main navigation
   - Features: Department filter, Sort by (Order Date, Due Date, Order ID, Customer, Model, Department), Order dropdown (Newest/Oldest First)
   - Table columns: Order ID, Current Department, Customer, Model, Order Date, Due Date, Actions
   - Has kickback badges, payment status, and comprehensive search

2. **AllOrdersPage.tsx** (`client/src/pages/AllOrdersPage.tsx`)
   - Alternative orders page with simpler interface
   - Features: Department filter, Sort by (Order Date, Due Date, Customer, Model)
   - Different table layout and functionality

3. **AllOrdersList.tsx** (`client/src/components/AllOrdersList.tsx`)  
   - Component version with enhanced features
   - Features: Search, Department filter, Sort by (Order Date, Due Date, Customer, Model)
   - Table columns: Order ID, Payment Status, Order Date, Customer, Product, Current Department, Due Date, Status, Actions
   - Includes payment badges, kickback tracking, communication tools

**Best Practice**: When user mentions "All Orders", ask them to specify which interface they're referring to by describing visible features (e.g., "the one with Payment Status column" or "the one with the Order dropdown showing Newest First").

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
    -   **Order Management**: Dynamic product configuration, feature consolidation, and robust order editing with a unified system for both draft and finalized orders.
    -   **Layup Scheduler**: Advanced auto-scheduling algorithm for production orders, prioritizing by score and due date, with Monday-Thursday work week distribution. Supports drag-and-drop, mold filtering, employee capacity management, and visual status indicators.
    -   **Department Manager**: Enhanced navigation with department-specific views (e.g., Shipping QC, Shipping). Displays comprehensive order details via tooltips.
    -   **Customer Management**: Comprehensive CRM with CSV import/update, integrated address validation, and enhanced contact/address display.
    -   **Inventory Management**: Enhanced with search, BOM integration, and part number display.
    -   **P1 & P2 Systems**: Distinct modules for P1 (regular) and P2 (OEM/supplier) orders, customers, purchase orders, and production order generation based on BOMs.
    -   **Barcode System**: Integrated P1 order barcode generation (Code 39) with scanner integration and Avery label printing.
    -   **Employee Management**: Full CRUD API for employee profiles, certifications, performance evaluations, and document management, including a secure employee portal with time clock and checklist functionality.
    -   **Quality Control**: Workflows for digital signature capture, validation, and comprehensive submissions management for checklists.
    -   **Reporting**: Enhanced sales order PDF generation with customer information and readable feature names.
    -   **Payment Tracking**: Integrated 'PAID' badge functionality with consistent payment data across the system.
    -   **Shipping Integration**: Full UPS API integration for label creation, rate calculation, and tracking.
    -   **Centralized Configuration**: `shared/company-config.ts` centralizes company information and certification templates.
    -   **Code Quality**: Integrated ESLint, Prettier, and lint-staged for consistent code formatting and quality checks.

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