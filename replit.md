# EPOCH v8 - Manufacturing ERP System

## Overview
EPOCH v8 is a comprehensive Manufacturing ERP system designed for small manufacturing companies specializing in customizable products. It aims to streamline operations, enhance efficiency, and improve scalability by providing end-to-end order management, inventory tracking, employee portal functionality, and quality control workflows. The project's vision is to become the leading ERP solution for small-to-medium customizable product manufacturers. It is a full-stack TypeScript application with a React frontend and Express backend, featuring Progressive Web App (PWA) capabilities for deployment to web and mobile platforms via Capacitor.

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