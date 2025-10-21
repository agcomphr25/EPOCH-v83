# EPOCH v8 - Manufacturing ERP System

## Overview
EPOCH v8 is a comprehensive Manufacturing ERP system designed for small manufacturing companies specializing in customizable products. Its primary purpose is to streamline operations, enhance efficiency, and improve scalability through end-to-end order management, inventory tracking, an employee portal, and quality control workflows. The project aims to become a leading ERP solution for small-to-medium customizable product manufacturers, offering a full-stack TypeScript PWA with a React frontend and Express backend, deployable to web and mobile platforms.

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
-   **Authentication**: Hybrid JWT + Session authentication with capability-based access control and account lockout. A simplified 3-role system (ADMIN, EMPLOYEE, OWNER) is used with individual capability assignments.
-   **Data Consistency**: A `features` object acts as the single source of truth for all feature data in order entry.
-   **Modular Routing**: Backend routes are organized into specialized modules for maintainability.
-   **Atomic Order ID Reservation**: A database-based atomic reservation system ensures unique, sequential Order ID generation.
-   **UI/UX**: Leverages ShadCN UI components with Tailwind CSS for design and Framer Motion for animations.
-   **CI/CD**: Implemented with pre-commit hooks (Husky + lint-staged) and GitHub Actions for automated quality checks.
-   **BOM System**: Robust Bill of Materials system with UUID-based architecture, revision control, and comprehensive CRUD operations for parts, BOMs, revisions, and lines, including recursive BOM explosion and where-used analysis.
-   **Google OAuth Integration**: Production-ready OAuth 2.0 flow with CSRF protection, secure state management, comprehensive Google API scopes, and secure token storage for user integrations.
-   **Global Search System**: Multi-entity search across Customers, Orders, Vendors, Employees, and Inventory Items with smart results display and keyboard navigation.
-   **Vendor Evaluation System**: Question-based evaluation with 4 criteria, automatic evaluation status, auto-dating, and a monthly reset cron job.
-   **Linked Orders Management**: Functionality to link multiple orders that must ship or be processed together, including an approval code system for unlinking.

### Technical Implementations
-   **Frontend**: React 18, TypeScript, Vite, ShadCN UI, Tailwind CSS, Framer Motion, Wouter.
-   **Backend**: Express.js, TypeScript, TanStack Query, Zod, Axios.
-   **Database**: PostgreSQL (Neon serverless), Drizzle ORM, Drizzle-kit.
-   **Key Features**: Order Management (dynamic configuration, vendor contact, linked orders), Layup Scheduler, Production Queue Manager, Department Manager, Customer Management (CRM, CSV import, address autocomplete), Inventory Management (BOM integration, vendor management), Metal Accessories Tracker, Barcode System, Employee Management (CRUD, portal, time clock), Quality Control (digital signature, checklists), Reporting, Payment Tracking, Shipping Integration, Communications System (inbox, email, SMS), Personalized Dashboards, Training Management System (modules, quizzes, certifications, matrix, enhanced analytics), AI-Powered Smart Sorting, Calendar Integration, Magic Link Authentication, and Global Search.

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

## Recent Changes

### October 21, 2025 - Microsoft OAuth Login, Security Fix, P1 Queue Bug Fix & Customer Notifications

#### Microsoft OAuth User Authentication
- **Production-Ready OAuth 2.0**: Full OAuth implementation for user login with Microsoft accounts
  - Routes: `/api/auth/microsoft/login` (initiate), `/callback` (exchange code for tokens)
  - Uses `@azure/msal-node` (Microsoft Authentication Library) for OAuth client
  - Scopes: `user.read`, `openid`, `profile`, `email`
- **Security**: Cryptographically secure OAuth flow with CSRF protection
  - Random 64-character hex state tokens using crypto.randomBytes(32)
  - In-memory state store with 5-minute expiration and automatic cleanup
  - Single-use tokens that are deleted after validation
  - State validation in callback prevents token replay attacks
- **Auto-User Provisioning**: Seamless onboarding for new Microsoft users
  - Checks if user exists by email address in database
  - Auto-creates new user accounts on first Microsoft sign-in:
    - Username derived from email (part before @)
    - Random secure password (64-character hex, user won't need it)
    - Default 'EMPLOYEE' role assigned
    - Account marked as active
  - Respects `is_active` flag - blocks deactivated accounts
- **Session Management**: Consistent with existing authentication system
  - Creates 7-day session in user_sessions table
  - Sets HTTP-only cookie with production-safe settings
  - Uses same session infrastructure as username/password login
- **Frontend Integration**: "Sign in with Microsoft" button on login page
  - Microsoft logo (4-color Windows icon as inline SVG)
  - Clean "OR CONTINUE WITH" divider
  - Full-page redirect to OAuth endpoint
  - Styled success/error pages for all callback scenarios
- **UX Flow**: Professional OAuth experience
  - Redirects to Microsoft login page
  - User authenticates with Microsoft account
  - Returns to app with success page and auto-redirect to dashboard
  - Error pages for: invalid state, expired state, inactive account, generic failures
- **Architect Reviewed**: Passed security review after critical fix applied

#### Critical Security Fix: Session Token Generation
- **Vulnerability Fixed**: Replaced insecure Math.random() session tokens with cryptographically secure generation
  - **Affected Routes**: Both `auth.ts` (username/password) and `microsoftAuth.ts` (OAuth) had this vulnerability
  - **Old Method**: `Math.random().toString(36) + Date.now().toString(36)` (predictable, low entropy, brute-forceable)
  - **New Method**: `crypto.randomBytes(32).toString('hex')` (256-bit cryptographically secure)
- **Impact**: All user sessions now use 64-character hex tokens with 256-bit entropy
- **Scope**: System-wide security improvement affecting all authentication methods
- **Verification**: Architect-approved, no remaining Math.random() usage in security-critical code

#### P1 Production Queue Bug Fix
- **Issue Fixed**: Confusing naming in P1 Production Queue progression button
  - Button text said "Progress to Barcode" but actually progressed to "Layup/Plugging" (correct flow)
  - Renamed mutation from `progressToBarcodeMutation` to `progressToLayupPluggingMutation`
  - Updated button text to accurately show "Progress to Layup/Plugging"
- **Correct Department Flow Confirmed**: P1 Production Queue → Layup/Plugging → Barcode → CNC
- **Scope**: UI clarity improvement - routing was already correct, only naming was misleading

#### UPS Shipping Label API Fixes
- **Issue Fixed**: 500 error when creating shipping labels via UPS API
  - Missing required phone number in ShipTo (recipient) section of UPS shipment payload
  - Added Phone field to ShipTo object with customer phone or fallback to company phone (256-723-8381)
- **Consolidated Shipping Fix**: Missing service code validation
  - Added validation to ensure service code is provided before creating consolidated shipping labels
  - Provides clear error message: "Missing or invalid shipping service code. Please select a shipping service."
- **Impact**: Shipping label creation and consolidated shipping now work correctly with UPS API
- **Scope**: Production bug fixes for shipping functionality

#### Customer Shipping Notification Fix
- **Issue Fixed**: Customers were not being notified when orders shipped
  - System was only attempting SMS notifications (not email)
  - No notification sent at all if customer had no phone number
- **Solution**: Enhanced notification system to send both email AND SMS
  - Sends email notification if customer email available
  - Sends SMS notification if customer phone available
  - Sends both if both are available
  - Updated to use intelligent fallback (send whatever is available)
- **Impact**: Customers now receive shipping notifications via all available contact methods
- **Scope**: Critical communication bug fix