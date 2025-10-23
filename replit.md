# EPOCH v8 - Manufacturing ERP System

## Overview
EPOCH v8 is a comprehensive Manufacturing ERP system for small manufacturing companies specializing in customizable products. Its purpose is to streamline operations, enhance efficiency, and improve scalability through end-to-end order management, inventory tracking, an employee portal, and quality control workflows. The project aims to be a leading ERP solution for small-to-medium customizable product manufacturers, offering a full-stack TypeScript PWA with a React frontend and Express backend, deployable to web and mobile platforms.

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

## Recent Changes
- **Order Status Filter and Email Resend** (Oct 23, 2025): Added PENDING_SIGNATURE status filter to All Orders page with complete filtering logic combining department and status filters. Implemented hover-activated resend email button for PENDING_SIGNATURE orders, allowing staff to re-trigger customer confirmation emails via POST `/api/followup-orders/:orderId/resend-email` with validation.
- **Asset Path Resolution System** (Oct 23, 2025): Implemented robust asset path resolver (`server/src/utils/assetPaths.ts`) that works consistently across development and production environments. All logo loading functions now use this centralized resolver instead of fragile relative paths.
- **Email Branding and Contact** (Oct 23, 2025): Company logo now properly appears in email header using base64 encoding. Contact email updated from info@agcomposites.com to sales@agcomposites.com throughout all email templates.
- **Display Names on Sign Page** (Oct 23, 2025): Customer sign page now shows user-friendly display names for stock models and features instead of technical IDs (e.g., "CF Chalk Branch" instead of "cf_chalk_branch").
- **Discount Display on Sales Order PDF** (Oct 23, 2025): Added discount information to sales order PDFs. When an order has a custom discount (percentage or fixed amount), it now appears between the subtotal and shipping with red text showing the discount code/percentage and amount deducted. The features table height dynamically adjusts to accommodate the discount line.
- **Customer Information on Sign Page** (Oct 23, 2025): Added comprehensive customer information display to the review and sign sales order page, including customer name, email, phone number, and complete shipping address with proper formatting.
- **Standard Terms and Conditions** (Oct 23, 2025): Updated both email and PDF to include specific standardized Terms and Conditions requiring customer review of specs, 30-day change policy, Remington clone disclaimer, estimated completion date notice, and confirmation requirement before production begins.
- **PDF Dynamic Sizing** (Oct 23, 2025): Features box in sales order PDFs now dynamically resizes based on the number of features present in the order, preventing content overflow.
- **Customer Sign Page Security** (Oct 23, 2025): Navigation bar is hidden on customer sign order pages (/sign-order/:token) to prevent unauthorized access to internal systems.
- **Business Address Correction** (Oct 23, 2025): Corrected business address from "Owens Crossroads" to "Owens Cross Roads" in all PDF documents.

## System Architecture
The application utilizes a monorepo structure with a full-stack TypeScript approach.

### Core Architectural Decisions
-   **Type Safety**: Shared TypeScript schemas using Drizzle and Zod ensure type safety across the stack.
-   **Cross-Platform Deployment**: PWA capabilities with Capacitor enable deployment to web and mobile (iOS/Android).
-   **Dynamic Form Generation**: Includes a dynamic form builder with signature capture.
-   **Authentication**: Hybrid JWT + Session authentication with capability-based access control and account lockout, utilizing a simplified 3-role system (ADMIN, EMPLOYEE, OWNER).
-   **Data Consistency**: A `features` object acts as the single source of truth for all feature data in order entry.
-   **Modular Routing**: Backend routes are organized into specialized modules.
-   **Atomic Order ID Reservation**: A database-based atomic reservation system ensures unique, sequential Order ID generation.
-   **Asset Path Resolution**: Centralized asset path resolver (`server/src/utils/assetPaths.ts`) ensures consistent file access across development and production environments.
-   **UI/UX**: Leverages ShadCN UI components with Tailwind CSS and Framer Motion for animations.
-   **CI/CD**: Implemented with pre-commit hooks (Husky + lint-staged) and GitHub Actions.
-   **BOM System**: Robust Bill of Materials system with UUID-based architecture, revision control, and comprehensive CRUD operations, including recursive BOM explosion and where-used analysis.
-   **Google OAuth Integration**: Production-ready OAuth 2.0 flow with CSRF protection, secure state management, and secure token storage.
-   **Global Search System**: Multi-entity search across Customers, Orders, Vendors, Employees, and Inventory Items.
-   **Vendor Evaluation System**: Question-based evaluation with 4 criteria, automatic status, auto-dating, and a monthly reset.
-   **Linked Orders Management**: Functionality to link multiple orders for combined processing/shipping, including an approval code system for unlinking.

### Technical Implementations
-   **Frontend**: React 18, TypeScript, Vite, ShadCN UI, Tailwind CSS, Framer Motion, Wouter.
-   **Backend**: Express.js, TypeScript, TanStack Query, Zod, Axios.
-   **Database**: PostgreSQL (Neon serverless), Drizzle ORM, Drizzle-kit.
-   **Key Features**: Order Management (dynamic configuration, linked orders), Layup Scheduler, Production Queue Manager, Department Manager, Customer Management (CRM, CSV import, address autocomplete), Inventory Management (BOM integration), Metal Accessories Tracker, Barcode System, Employee Management (CRUD, portal, time clock), Quality Control (digital signature, checklists), Reporting, Payment Tracking, Shipping Integration, Communications System (inbox, email, SMS), Personalized Dashboards, Training Management System, AI-Powered Smart Sorting, Calendar Integration, Magic Link Authentication, and Global Search.

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
-   Microsoft Azure AD / MSAL (`@azure/msal-node` - OAuth authentication)