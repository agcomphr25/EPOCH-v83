# EPOCH v8 - Manufacturing ERP System

## Overview
EPOCH v8 is a comprehensive Manufacturing ERP system designed for small manufacturing companies specializing in customizable products. It provides end-to-end order management, inventory tracking, employee portal functionality, and quality control workflows. The system is a full-stack TypeScript application with a React frontend and Express backend, featuring Progressive Web App (PWA) capabilities and deployable to both web and mobile platforms via Capacitor. Its business vision is to streamline operations for customizable product manufacturers, enhancing efficiency and scalability.

## User Preferences
Preferred communication style: Simple, everyday language.

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
    -   **Department Queue Management**: Enhanced navigation with separate "Shipping QC" and "Shipping" department options. Features CSS-based hover tooltips that display comprehensive order details including all customizations and features without glitching or performance issues.
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