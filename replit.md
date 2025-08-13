# EPOCH v8 - Manufacturing ERP System

## Overview
EPOCH v8 is a comprehensive Manufacturing ERP system for small manufacturing companies specializing in customizable products. It provides end-to-end order management, inventory tracking, employee portal functionality, and quality control workflows. The system aims to streamline operations for customizable product manufacturers, enhancing efficiency and scalability. It is a full-stack TypeScript application with a React frontend and Express backend, featuring Progressive Web App (PWA) capabilities and deployable to both web and mobile platforms via Capacitor.

## User Preferences
Preferred communication style: Simple, everyday language.
Production constraints: Do not modify mold capacities or employee settings to unrealistic values. Use actual production capacity constraints for accurate scheduling.

## Recent Changes (August 13, 2025)
### Customer Management Enhancements - FULLY IMPLEMENTED

#### 1. Contact Field Implementation - COMPLETE
- **Issue Identified**: Contact field in edit customer modal not saving or displaying
- **Root Causes Fixed**:
  - Missing `contact` column in customers database table
  - Missing `contact` field in database schema definition  
  - Missing `contact` field in API query selection
  - Missing `contact` field display in customer management table
- **Implementation Details**:
  - **Database Schema**: Added `contact: text('contact')` to customers table definition in `server/schema.ts`
  - **Database Column**: Added contact column using `ALTER TABLE customers ADD COLUMN contact text;`
  - **API Query**: Updated `getAllCustomers()` in `server/storage.ts` to include contact field in select statement
  - **UI Display**: Added contact field display in customer management table (`client/src/pages/CustomerManagement.tsx`)
- **Verification**: Contact field now saves, loads, and displays correctly across all interfaces
- **User Confirmation**: Contact field functionality confirmed working by user

#### 2. Address Display Enhancement - COMPLETE
- **Issue Identified**: Suite/apartment information (street2) not visible in customer list, only in edit modal
- **Implementation Details**:
  - **UI Enhancement**: Modified address display in customer table to show both street and street2 fields
  - **Code Location**: Updated `client/src/pages/CustomerManagement.tsx` line 1525-1530
  - **Display Format**: Street address now shows as "123 Main St, Suite 200" instead of just "123 Main St"
- **Result**: Complete address information now visible in both customer list and edit modal

#### 3. Database Schema Synchronization - COMPLETE
- **Issues Resolved**:
  - Database schema mismatch between code definition and actual database structure
  - Missing columns causing silent save failures
- **Actions Taken**:
  - Verified database column existence using SQL information_schema queries
  - Added missing `street2` and `contact` columns to match schema definitions
  - Ensured all schema changes reflected in API responses

### Technical Implementation Details

#### Files Modified:
1. **`server/schema.ts`** (Lines 1428-1437):
   - Added `contact: text('contact')` to customers table definition
   - Schema now properly defines contact field for type safety

2. **`server/storage.ts`** (Lines 2535-2551):
   - Updated `getAllCustomers()` function to include contact field in select statement
   - Added `contact: customers.contact` to explicit field selection

3. **`client/src/pages/CustomerManagement.tsx`** (Multiple locations):
   - Lines 1511-1517: Added contact field display in customer table
   - Lines 1525-1530: Enhanced address display to include street2 field
   - Contact shows as "Contact: [Name]" under customer info
   - Address shows as "[Street], [Suite/Apt]" when street2 exists

#### Database Commands Executed:
```sql
-- Added missing contact column
ALTER TABLE customers ADD COLUMN contact text;

-- Added missing street2 column (was already present but verified)
ALTER TABLE customer_addresses ADD COLUMN street2 text;

-- Verification queries used
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'customers' 
ORDER BY ordinal_position;
```

#### API Endpoints Enhanced:
- **GET /api/customers**: Now returns contact field in response
- **PUT /api/customers/update-bypass/:id**: Contact field saves correctly
- All customer-related endpoints now handle contact field properly

#### User Experience Improvements:
- Contact field visible in customer table alongside email/phone
- Complete address (including suite/apt) visible in customer list
- Edit modal pre-populates contact field correctly
- Consistent data display between table and modal views

### PAID Badge Implementation - COMPLETE (August 13, 2025)
- **Issue Identified**: User requested PAID badge functionality for All Orders list
- **Implementation**: Successfully added green PAID badge to orders with payment data
- **Technical Details**:
  - Added payment fields to Order interface (`isPaid`, `paymentType`, `paymentAmount`, `paymentDate`)
  - PAID badge displays next to Order ID with payment details in tooltip
  - Badge shows payment amount, method, and date on hover
  - Found 32 paid orders in database showing PAID badges

#### Critical Discovery: Dual Payment Systems
- **Issue Found**: Two separate payment tracking systems causing data inconsistency
- **System 1**: Main `all_orders` table payment fields (32 records)
  - Fields: `is_paid`, `payment_amount`, `payment_type`, `payment_date`
  - Used by: PAID badge display, main order data
- **System 2**: Separate `payments` table (3 records only)
  - Used by: `/api/orders/[orderId]/payments` endpoint, individual order payment pages
- **Example Inconsistency**: AG803 shows PAID badge (System 1 data) but empty payments list (System 2)
- **Current Logic**: PAID badge requires both `isPaid = true` AND `paymentAmount > 0`

### P1 Production Orders Flow - FULLY RESTORED (August 12, 2025)
- **Issue Identified**: Original restoration missed 368 non-Pure Precision orders from P1 Production Queue
- **Root Cause**: When reversing changes, only restored 400 Pure Precision orders from production_orders table
- **Complete Restoration**: Added missing 368 orders from diverse customers (101, 106, 107, 122, 138, 152, etc.)
- **Final State**: 768 total P1 Production Queue orders restored:
  - 400 Pure Precision orders (customer_id: 154)
  - 368 Non-Pure Precision orders (various customers)
- **Verification**: `/api/p1-layup-queue` endpoint now returns all 768 orders correctly
- **Data Integrity**: All original P1 Production Queue orders now restored with proper customer distribution

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

### Technical Implementations
-   **Frontend**: React 18 with TypeScript, built using Vite, featuring ShadCN UI components with Tailwind CSS for styling and Framer Motion for animations. Wouter-based routing is used.
-   **Backend**: Express.js with TypeScript, utilizing TanStack Query for server state management, Zod for runtime validation, and Axios for external API calls.
-   **Database**: PostgreSQL managed via Neon serverless, with Drizzle ORM for type-safe database operations and Drizzle-kit for schema migrations.
-   **Core Features**:
    -   **Order Management**: Dynamic product configuration, feature consolidation, and robust order editing.
    -   **Layup Scheduler**: Advanced auto-scheduling algorithm for production orders, prioritizing by score and due date, with Monday-Thursday work week distribution. Supports drag-and-drop, mold filtering, employee capacity management, and visual status indicators.
    -   **Department Manager**: Enhanced navigation with separate "Shipping QC" and "Shipping" department options. Features CSS-based hover tooltips displaying comprehensive order details. The Layup/Plugging Department Manager specifically displays orders from the automatically generated layup schedule and allows progression to the next department.
    -   **Customer Management**: Comprehensive CRM with CSV import/update, integrated SmartyStreets address validation and autocomplete.
    -   **Inventory Management**: Enhanced with search, BOM integration, and part number display.
    -   **P1 & P2 Systems**: Distinct modules for P1 (regular) and P2 (OEM/supplier) orders, customers, purchase orders, and production order generation based on BOMs.
    -   **Barcode System**: Integrated P1 order barcode generation (Code 39) with scanner integration and Avery label printing.
    -   **Employee Management**: Full CRUD API for employee profiles, certifications, performance evaluations, and document management, including a secure employee portal with time clock and checklist functionality.
    -   **Quality Control**: Workflows for digital signature capture, validation, and comprehensive submissions management for checklists.
    -   **Centralized Configuration**: `shared/company-config.ts` centralizes company information and certification templates.
    -   **Code Quality**: Integrated ESLint, Prettier, and lint-staged for consistent code formatting and quality checks.

## External Dependencies

### Database
-   **PostgreSQL**
-   **Drizzle ORM**

### UI Framework
-   **React 18**
-   **ShadCN UI**
-   **Tailwind CSS**
-   **Framer Motion**

### Backend Dependencies
-   **Express.js**
-   **TanStack Query**
-   **Zod**
-   **Axios**
-   **Multer**

### Development Tools
-   **Vite**
-   **TypeScript**
-   **ESLint/Prettier**
-   **Capacitor**

### Third-Party Services
-   **SmartyStreets**
-   **Authorize.Net**