# EPOCH v8 - Manufacturing ERP System

## Overview


EPOCH v8 is a comprehensive Manufacturing ERP system designed for small manufacturing companies specializing in customizable products. Its primary purpose is to streamline operations, enhance efficiency, and improve scalability through end-to-end order management, inventory tracking, an employee portal, and quality control workflows. The project aims to become a leading ERP solution in its niche, offering a full-stack TypeScript PWA with a React frontend and Express backend, deployable to web and mobile platforms via Capacitor.



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


The application employs a monorepo structure utilizing a full-stack TypeScript approach.

### Core Architectural Decisions

- **Type Safety**: Achieved through shared TypeScript schemas using Drizzle and Zod.
- **Cross-Platform Deployment**: PWA capabilities combined with Capacitor enable deployment to web, iOS, and Android.
- **Dynamic Form Generation**: Includes a dynamic form builder with integrated signature capture.
- **Authentication**: A hybrid JWT + Session authentication system with capability-based access control and account lockout mechanisms.
- **Capability-Based Permissions**: A streamlined 3-role system (ADMIN, EMPLOYEE, OWNER) allows for granular capability assignments.
- **Data Consistency**: The `features` object serves as the single source of truth for all feature data within order entry.
- **Modular Routing**: Backend routes are organized into specialized, modular components.
- **Atomic Order ID Reservation**: A database-based atomic reservation system ensures the generation of unique, sequential Order IDs.

- **UI/UX**: Leverages ShadCN UI components with Tailwind CSS for design and Framer Motion for animations.
- **CI/CD**: Implemented using pre-commit hooks (Husky + lint-staged) and GitHub Actions for automated quality checks.

### Technical Implementations

- **Frontend**: React 18, TypeScript, Vite, ShadCN UI, Tailwind CSS, Framer Motion, Wouter.
- **Backend**: Express.js, TypeScript, TanStack Query, Zod, Axios.
- **Database**: PostgreSQL (Neon serverless), Drizzle ORM, Drizzle-kit.
- **Key Features**: Comprehensive Order Management (dynamic configuration, vendor contact), Layup Scheduler (auto-scheduling, priority scoring), Production Queue Manager, Department Manager, Customer Management (CRM, CSV import, address autocomplete), Inventory Management (BOM integration, vendor management), Metal Accessories Tracker, Barcode System (P1 generation, scanning, label printing), Employee Management (CRUD, portal, time clock), Quality Control (digital signature, checklists), Reporting (sales order PDF), Payment Tracking, Shipping Integration (UPS API, tracking), Communications System (inbox, email, SMS), Personalized Dashboards, Training Management System (modules, quizzes, certifications, matrix), AI-Powered Smart Sorting, Calendar Integration, Azure Document Intelligence, and Magic Link Authentication.

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
- SendGrid (Email, Magic Link delivery)
- Twilio (SMS)
- Google Calendar (Event Integration)
- Google APIs (`googleapis` package)
- Azure Document Intelligence (AI-powered document analysis)