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
- **CI/CD**: Implemented pre-commit hooks (Husky + lint-staged) and GitHub Actions for automated quality checks.

### Technical Implementations
- **Frontend**: React 18, TypeScript, Vite, ShadCN UI, Tailwind CSS, Framer Motion, Wouter for routing.
- **Backend**: Express.js, TypeScript, TanStack Query, Zod, Axios.
- **Database**: PostgreSQL (Neon serverless), Drizzle ORM, Drizzle-kit.
- **Key Features**:
    - **Order Management**: Dynamic product configuration, robust editing, and streamlined order-to-production with a new single-step vendor contact addition workflow.
    - **Layup Scheduler**: Auto-scheduling with production queue auto-population, priority scoring, and mold matching.
    - **Production Queue Manager**: Auto-populates from finalized orders and calculates priority scores.
    - **Department Manager**: Department-specific views, detailed order information, and defined workflow progression.
    - **Customer Management**: CRM with CSV import/update, address autocomplete, and validation.
    - **Inventory Management**: Search, BOM integration, part number display, and a comprehensive tabbed vendor management system.
    - **Metal Accessories Tracker**: Production demand forecasting with weekly breakdown.
    **Barcode System**: P1 order barcode generation, scanner integration, categorized queue management, and label printing.
    - **Employee Management**: Full CRUD API for profiles, certifications, performance evaluations, and secure employee portal with time clock.
    - **Quality Control**: Workflows for digital signature capture, validation, and comprehensive checklist submissions.
    - **Reporting**: Sales order PDF generation.
    - **Payment Tracking**: Integrated 'PAID' badge functionality.
    - **Shipping Integration**: UPS API for label generation and a Shipping Tracker with manual tracking entry.
    - **Communications System**: Customer communication management with inbox, email, and SMS integration.
    - **Personalized Dashboards**: Secure auto-redirect system to user-specific dashboards upon login with role-based navbar.
    - **Training Management System**: Comprehensive platform with PDF import, module creation, quizzes, evaluations, employee training records, certification management, and a visual Training Matrix View. Enhanced with direct clickable links in notifications.
    - **AI-Powered Smart Sorting**: Intelligent dropdown sorting for Action Inlet options.
    - **Calendar Integration**: Displays Google Calendar events via OAuth.
    - **Azure Document Intelligence**: AI-powered document analysis for extracting data from documents.
    - **Magic Link Authentication**: Secure passwordless authentication system for customers with time-limited, single-use email links for login, order confirmation, password reset, and custom actions. Features SHA-256 token hashing and SendGrid email delivery.

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
- SendGrid (Email - includes Magic Link delivery)
- Twilio (SMS)
- Google Calendar (Event Integration)
- Google APIs (`googleapis` package)
- Azure Document Intelligence (AI-powered document analysis)

## Recent Changes

### October 16, 2025 - Training Matrix Enhanced with 3-Tab Interface
- **3-Tab Interface Implementation**: Training Matrix View now features three tabs for comprehensive employee development tracking
  - **Standards Training Tab**: Displays existing training module completion matrix (preserved original functionality)
  - **Certifications Tab**: Shows employee certifications across 15 department-specific categories
  - **Evaluations Tab**: Displays employee performance evaluations with biannual tracking
- **Department-Specific Certifications**: Created 15 certification types including Cutting Table, Cores, Lay-up, Mold Assembly, Tube Procedure, Lathe Cert., Using the Ovens, Breakout, Finish, CNC Operations, QC Standards, Shipping, Paint Booth Methods, Mold/Mandrel Maintenance, and Customer Satisfaction
- **New API Endpoints**:
  - GET `/api/employees/certifications-matrix` - Returns all employee certifications in flattened matrix format
  - GET `/api/employees/evaluations` - Returns all employee evaluations with filtering by active employees
- **UI/UX Improvements**: 
  - Consistent matrix table pattern across all three tabs
  - Loading states for each tab
  - Proper data-testid attributes for testing
  - Preserves existing sorting, sticky columns, and completion badges from Standards tab
- **Status**: ✅ Fully functional and architect-approved
- **Architect Recommendations**: Add explicit empty/error states for new tabs, consider lazy-loading non-active tabs for performance optimization

### October 16, 2025 - Customer Satisfaction Analytics Enhanced with Question-Level Insights
- **Question-Level Analytics**: Analytics tab now displays detailed breakdown for each survey question with average scores and response counts
- **3-Month Trend Tracking**: Each question shows trend data across the last 3 months with visual indicators (Up/Down/Stable)
- **Backend Enhancements**: 
  - Analytics endpoint now calculates question-level averages and monthly trends
  - Fixed month boundary logic to include all responses from the last day of each month
  - Survey question mapping now correctly uses filtered surveyId when provided
- **Frontend Display**: 
  - New Question Breakdown section below summary cards
  - Progress bars visualizing average scores per question
  - 3-column monthly trend display with month-over-month comparison
  - Responsive design with proper testid attributes
- **Status**: ✅ Fully functional and architect-approved

### October 16, 2025 - Customer Satisfaction Survey Date Display Enhancement
- **Enhanced Survey Responses Display**: Survey Responses tab now displays user-selected survey date (surveyDate) instead of submission timestamp
- **Database Schema**: Added `survey_date` timestamp column to `customer_satisfaction_responses` table in both root and server schema files
- **Backend Updates**: API endpoints now handle surveyDate field conversion (ISO string to Date object) and include it in response payload
- **Frontend Display Logic**: Implemented fallback priority: surveyDate → submittedAt → createdAt to ensure dates display for all responses (legacy and new)
- **Schema Consistency**: Critical fix applied to synchronize both schema.ts files (root and server/schema.ts) to prevent Drizzle ORM caching issues
- **Status**: ✅ Fully functional and architect-approved

### October 16, 2025 - Training Navigation Fixed
- **Removed hardcoded training module links** from navigation dropdown
- **Issue**: Individual module links (training/2, training/3, etc.) were pointing to wrong IDs after production migration
- **Solution**: Cleaned up navigation to only show "All Training Modules" which dynamically displays all available modules
- **Navigation now includes**: All Training Modules, Training Management, Training Matrix, Import Training Matrix, Manage Training Assignments
- **Result**: Simplified navigation and eliminated duplicate/broken module links

### October 16, 2025 - Production Database Training Data Migration Complete
- **Successfully migrated ALL training data** from development to production database
- **Training Modules Migration**:
  - ✅ 10 Training Modules (complete training curriculum)
  - ✅ 45 Training Questions (quiz content)
  - ✅ 180 Question Options (multiple choice answers)
  - ✅ 11 Training Matrix base entries (job role requirements)
- **Employee Migration**:
  - ✅ 19 Real employees migrated to production (Fixed PostgreSQL sequence issue)
  - ✅ Employee ID mapping preserved by name matching
- **Training Matrix Employee Assignments**:
  - ✅ 422 employee-specific training matrix entries successfully migrated
  - ✅ All employee-training relationships preserved
- **Migration Scripts Created**:
  - `migrate-training-data.ts` - Core training content migration
  - `migrate-employees-final.ts` - Employee records with sequence fix
  - `migrate-training-matrix-by-name.ts` - Employee training assignments
- **Production Status**: ✅ Complete training system now accessible in deployed application
- **Database URLs**:
  - Development: ep-sweet-smoke-adiyfj99 (source database)
  - Production: ep-wispy-sun-adm062ft (orders, customers, employees, complete training system)

### October 16, 2025 - Magic Link Authentication System Verified & Integrated
- **Added passwordless authentication system** for secure customer interactions
- **Security Features**: 
  - Cryptographically secure token generation using crypto.randomBytes
  - SHA-256 token hashing before database storage
  - One-time use enforcement with expiration tracking
  - Authentication-protected endpoints for link generation (bypassed in development)
- **Database**: `magic_link_tokens` table with 10 columns (id, token, email, purpose, metadata, expires_at, used_at, ip_address, user_agent, created_at)
- **API Endpoints**: All working and tested
  - POST `/api/magic-link/generate` - Creates magic link with 30min expiration
  - GET `/api/magic-link/verify` - Validates token (one-time use, expiration check)
  - POST `/api/magic-link/send` - Sends magic link via email
  - POST `/api/magic-link/cleanup` - Removes expired tokens
- **Email Integration**: SendGrid integration with customizable HTML templates
  - Updated communications API to support optional customerId for system-generated emails
  - Supports both plain text and HTML email content
- **Use Cases**: Customer login, order confirmation, password reset, document signing, and custom actions
- **Integration Fixes Applied**:
  - Copied missing `server/auth.ts` file with AuthService class from GitHub export
  - Updated email schema to make customerId optional/nullable for magic link emails
  - Added html field support to communications email endpoint
- **Status**: ✅ Fully functional and architect-approved
- **Known Limitation**: SendGrid requires API key permissions and sender verification configuration (external service setup)
- **Documentation**: Comprehensive usage guide at `server/utils/MAGIC_LINK_USAGE.md`