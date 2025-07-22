# EPOCH v8 - Manufacturing ERP System

## Overview

EPOCH v8 is a comprehensive Manufacturing ERP system designed specifically for small manufacturing companies specializing in customizable products. The application provides end-to-end order management, inventory tracking, employee portal functionality, and quality control workflows. Built as a full-stack TypeScript application with React frontend and Express backend, it features Progressive Web App (PWA) capabilities and is deployable to both web and mobile platforms via Capacitor.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes (July 2025)

**July 22, 2025 - Layup Scheduler Drag & Drop System Implementation (IN PROGRESS)**
- ✅ **Fixed Drag and Drop Scope**: Moved DndContext to wrap both sidebar queue and calendar for proper drag functionality
- ✅ **Corrected Draggable Components**: Changed from useSortable to useDraggable for cross-container drag operations
- ✅ **Enhanced Calendar Display**: Added visual indicators and debugging to calendar cells showing "Empty cell" status
- ✅ **Restored Automatic Assignment**: Fixed auto-schedule system that applies optimal order placement on component load
- 🔄 **Troubleshooting Display Issue**: Calendar cells show properly but assigned orders not displaying - investigating assignment logic
- 🔄 **Manual Test Controls**: Added Test Assignment button with enhanced debugging to isolate display vs logic issues

**July 22, 2025 - P1 Purchase Orders Integration with Layup Scheduler (COMPLETED)**
- ✅ **Unified Layup Queue API**: Created `/api/layup-queue` endpoint combining regular orders and P1 Purchase Order items  
- ✅ **Smart Priority Scoring**: P1 orders get calculated priority scores based on due date urgency (closer dates = higher priority)
- ✅ **Automatic Mold Assignment**: P1 stock model items automatically map to configured molds using existing mold configuration
- ✅ **Visual Distinction**: P1 orders display as green cards with "P1" label, regular orders remain blue for clear identification
- ✅ **Drag and Drop Integration**: Both order types work identically in the scheduling interface with persistent positioning
- ✅ **Navigation Consistency**: Updated nav label from "Purchase Orders" to "P1 Purchase Orders" to match "P2 Purchase Orders"
- ✅ **Real-Time Updates**: Queue refreshes every 30 seconds to include new P1 PO items automatically

**July 22, 2025 - Fixed All Orders Edit Button Issue (COMPLETED)**
- ✅ **Root Cause Identification**: Edit button in All Orders list was passing database record ID instead of order ID to the order entry page
- ✅ **Link Parameter Fix**: Changed `/order-entry?draft=${order.id}` to `/order-entry?draft=${order.orderId}` in OrdersList component
- ✅ **Data Loading Restoration**: Order entry page now correctly loads existing order data when editing from All Orders list
- ✅ **Backend Compatibility**: Confirmed backend API endpoint `/api/orders/draft/:id` supports both database IDs and order IDs for flexibility
- ✅ **Prevention Documentation**: Added code comment explaining why order.orderId must be used to prevent future regression

**July 22, 2025 - Customer CSV Import with Update Capability (COMPLETED)**
- ✅ **Smart Customer Import**: Enhanced CSV import to check for existing customers by name and update their records instead of creating duplicates
- ✅ **Flexible Column Detection**: Supports Name (required), Email (optional), and Phone (optional) columns with case-insensitive header matching
- ✅ **Update vs Create Logic**: Automatically updates existing customers with new email/phone data while creating new customers for unmatched names
- ✅ **Enhanced Feedback**: Provides detailed import results showing count of new customers created vs existing customers updated
- ✅ **Error Handling**: Comprehensive error reporting for failed rows with specific error messages
- ✅ **Backend API Endpoint**: Created `/api/customers/import/csv` endpoint with robust data validation and processing
- ✅ **UI Enhancement**: Updated Customer Management interface with improved CSV preview showing customer data format

**July 22, 2025 - Order Entry Payment Reset and Edit Functionality Fix (COMPLETED)**
- ✅ **Payment Reset Enhancement**: Fixed payment fields persisting after order creation by adding payment state variables to resetForm function and improving conditional rendering
- ✅ **Edit Functionality Implementation**: Added URL parameter detection (?draft=id) to load existing orders for editing with comprehensive field population
- ✅ **Individual Feature State Loading**: Enhanced loadExistingOrder to populate individual feature states from the features object with detailed debugging
- ✅ **Customer and Model Loading**: Verified customer lookup and stock model population working correctly
- ✅ **Critical Rails/Other Options Fix**: Fixed Rails and Other Options not saving during order creation by merging all feature state variables (railAccessory, otherOptions, paintOptions, bottomMetal, handedness) into the features object before submission
- ✅ **Enhanced Feature Persistence**: Modified handleSubmit to create completeFeatures object that combines main features state with separate state variables, ensuring all form selections persist correctly
- ✅ **Array Field Support**: Added proper array handling for multi-select features (Rails, Other Options) in both save and load operations
- ✅ **Comprehensive Debugging**: Added console logging for feature saving ("Complete features being saved") and loading with field-specific debugging
- ✅ **Verification Complete**: Confirmed all fields including Rails, Other Options, Paint, Bottom Metal, and Handedness now save and load correctly during edit operations

**July 22, 2025 - P2 Production Orders Generation System Implementation (COMPLETED)**
- ✅ **Complete P2 Production Orders System**: Built comprehensive BOM-based production order generation from P2 Purchase Orders
- ✅ **BOM Integration**: SKU dropdown in P2 PO items now fetches from BOM Administration showing "SKU - Model Name" format
- ✅ **Automated Generation**: "Generate Production Orders" button creates individual production orders for each BOM component
- ✅ **Quantity Calculations**: Multiplies BOM item quantities by P2 PO quantities for accurate production requirements
- ✅ **Department Routing**: Uses BOM item's firstDept field to route production orders to correct departments
- ✅ **Unique Order IDs**: Generates P2-{PO#}-{item#}-{bomItem#} format for clear traceability
- ✅ **Production Tracking**: Complete status tracking (PENDING, IN_PROGRESS, COMPLETED, CANCELLED) with due dates
- ✅ **Database Schema**: Created p2_production_orders table with full referential integrity to P2 POs, BOM definitions, and BOM items
- ✅ **Visual Interface**: Production orders table displays generated orders with SKU, part names, departments, quantities, and status badges
- ✅ **Bug Fix**: Resolved variable naming conflict (`bomItems2`) that was preventing production order generation
- ✅ **System Verification**: Confirmed complete functionality with successful production order creation and display

**July 22, 2025 - P2 Purchase Orders Module Implementation**
- ✅ **Complete P2 System**: Built comprehensive P2 Purchase Orders module with separate customer database and purchase order management
- ✅ **Two-Level Workflow**: Implemented proven two-level architecture (create basic PO, then manage items separately) matching regular PO system
- ✅ **SKU Number Field**: Changed "Part Number" to "SKU Number" in P2 purchase order items per user preference
- ✅ **Independent Database**: Created separate p2_customers, p2_purchase_orders, and p2_purchase_order_items tables
- ✅ **Complete CRUD Operations**: Full create, read, update, delete functionality for P2 customers, purchase orders, and line items
- ✅ **Part Tracking**: Part #, Quantity, and Price tracking with automatic total calculation
- ✅ **Navigation Integration**: Added P2 Purchase Orders menu item for easy access

**July 22, 2025 - Enhanced Inventory Management with Search Functionality**
- ✅ **Inventory Search Field**: Added comprehensive search functionality to Inventory Items Management card
- ✅ **Multi-Field Search**: Search across AG Part #, Name, Source, Supplier Part #, Department, Secondary Source, and Notes
- ✅ **Real-Time Filtering**: Instant search results as users type with case-insensitive matching
- ✅ **Item Count Display**: Shows filtered item count in card header for better visibility
- ✅ **Searchable BOM Selection**: Enhanced Add BOM Item modal with searchable combobox for inventory item selection

**July 22, 2025 - Enhanced Layup Scheduler Employee Configuration and Mold Setup**
- ✅ **Employee Persistence Fix**: Employees now properly persist in the list after being added, with data refresh ensuring they stay visible
- ✅ **Save Button Implementation**: Added green "Save Changes" button that appears when modifying Production Rate or Daily Hours for existing employees
- ✅ **Batch Change Management**: Employee setting changes are tracked locally until user clicks Save, then all changes are applied together
- ✅ **Mold Configuration Clarity**: Enhanced Mold Configuration modal with clear labels, help text, and comprehensive explanation of Instance Number concept
- ✅ **Improved User Experience**: Added detailed instructions explaining Model Name (mold model), Instance Number (for multiple molds of same model), and Daily Capacity (units per day)

**July 22, 2025 - Enhanced BOM Administration with Part Number Display**
- ✅ **Part Number Column**: Added AG Part Number column to BOM Components table for better part identification
- ✅ **Enhanced Search**: Updated search functionality to include part numbers alongside part names and departments
- ✅ **Inventory Integration**: Linked BOM items to inventory database to display actual AG Part Numbers
- ✅ **Visual Formatting**: Used monospace font for part numbers to improve readability and scanning

**July 22, 2025 - Fixed BOM Administration Edit vs Add Item Issue**
- ✅ **Issue Resolution**: Confirmed BOM Administration "Add Item" vs "Edit Item" functionality working correctly
- ✅ **Backend Verification**: POST requests properly create new BOM items, PUT requests update existing items
- ✅ **User Testing**: Verified through logs that new items get unique IDs (2, 3, 4, 5, 6, 7) and edits modify existing items

**July 22, 2025 - Implemented Atomic Order ID Reservation System (Option 3)**
- ✅ **Race Condition Elimination**: Implemented database-based Order ID reservation system preventing duplicate IDs during concurrent order creation
- ✅ **Atomic Generation**: Created retry logic with unique constraint validation ensuring each Order ID is reserved exactly once
- ✅ **Sequential Integrity**: Preserved existing AG001, AG002 format while supporting multiple concurrent users
- ✅ **Expiration Management**: 5-minute reservation timeout with automatic cleanup of orphaned reservations
- ✅ **Reservation Tracking**: Order IDs marked as "used" when orders are actually created, preventing reuse
- ✅ **Concurrent Testing**: Verified 5 parallel requests generate unique sequential IDs (AG206-AG210) with zero duplicates
- ✅ **Fallback System**: Robust error handling with timestamp-based fallback IDs if all retries fail
- ✅ **Database Schema**: Created `order_id_reservations` table with proper indexes for efficient cleanup operations

**July 22, 2025 - Verified Existing Order Creation System Working Correctly**
- ✅ **System Analysis**: Confirmed existing order creation system was already functioning properly
- ✅ **Database Verification**: Verified 189+ finalized orders already exist in system with correct status
- ✅ **Order Flow Validation**: Confirmed orders save to `orderDrafts` table with FINALIZED status and appear in All Orders list
- ✅ **No Duplication**: Avoided creating duplicate functionality - existing system saves orders with proper workflow status
- ✅ **Runtime Error Resolution**: Fixed `paintOptions` initialization error by reordering variable declarations
- ✅ **TypeScript Diagnostics**: Resolved LSP diagnostic errors in OrderEntry component
- ✅ **Application Stability**: Confirmed all API endpoints working correctly with proper error handling

**July 22, 2025 - Implemented Comprehensive Feature Mapping Prevention System**
- ✅ **Root Cause Analysis**: Identified feature ID mismatches between form controls and Order Summary displays
- ✅ **Systematic Fix**: Corrected all incorrect feature IDs (qd_quick_detach→qd_accessory, lop→length_of_pull, texture→texture_options)
- ✅ **Prevention System**: Created centralized feature mapping utilities and validation hooks
- ✅ **Documentation**: Added comprehensive FEATURE_MAPPING_GUIDE.md with debugging procedures
- ✅ **Development Validation**: Implemented runtime validation to detect feature ID mismatches during development
- ✅ **Consistent Data Flow**: Ensured form controls and Order Summary use identical data sources
- ✅ **Paint Options Fix**: Resolved form/Order Summary inconsistency by standardizing on paintOptions state variable

**July 21, 2025 - Fixed Order Entry Page Database Errors and Restored Correct Form Layout**
- ✅ Fixed NaN database errors in draft order route by adding proper ID validation
- ✅ Restored Order Entry form to clean, working state matching the original screenshot
- ✅ Implemented proper 2-column layout for product features section
- ✅ Added correct Customer PO and FB Order field functionality with enable/disable toggles
- ✅ Fixed Stock Model selection with proper dropdown and model buttons
- ✅ Organized form fields in correct order: Handedness, Action Length, Action Inlet, Bottom Metal, etc.
- ✅ Maintained clean Order Summary section with detailed pricing breakdown
- ✅ Resolved backend route parsing issues that were causing 500 errors
- ✅ Application working correctly with proper form validation and submission

**July 21, 2025 - Fixed Order Entry Page Internal Server Error**
- ✅ Resolved internal server error when refreshing order entry page
- ✅ Fixed order ID generation API endpoints (/api/orders/last-id and /api/orders/generate-id)
- ✅ Restored database connectivity for order ID operations  
- ✅ Added proper error handling with fallback responses instead of 500 errors
- ✅ Fixed TypeScript type errors in OrderEntry component
- ✅ Confirmed all API endpoints working correctly with test data

**July 20, 2025 - Completed P1 Order Barcode Label System & Scanner Integration**
- ✅ Implemented exact 5-line Avery label format as specified
- ✅ Fixed action length extraction from features.action_length field instead of shank_length
- ✅ Added proper action length abbreviations: Long→LA, Medium→MA, Short→SA
- ✅ Enhanced paint option extraction to show subcategory values only (no prefix)
- ✅ Verified actual scannable Code 39 barcode images on labels
- ✅ Confirmed proper label formatting: "SA CF Chalkbranch" format on first line
- ✅ Successfully tested complete barcode system functionality
- ✅ Connected inventory scanner to order barcode scanner with seamless handoff
- ✅ Enhanced barcode scanner to show order details with payment status (pricing hidden for security)
- ✅ Implemented department-based parts request organization
- ✅ Created missing parts_requests database table

## System Architecture

### Overall Architecture Pattern
The application follows a monorepo structure with a full-stack TypeScript approach:
- **Frontend**: React 18 with TypeScript, built using Vite
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Shared**: Common TypeScript schemas and types
- **Mobile**: Capacitor for cross-platform deployment

### Key Architectural Decisions

**Problem**: Need for type safety across frontend and backend
**Solution**: Shared TypeScript schemas using Drizzle and Zod
**Rationale**: Eliminates type mismatches and provides compile-time validation

**Problem**: Complex form generation and data collection
**Solution**: Dynamic form builder with signature capture capabilities
**Rationale**: Allows non-technical users to create custom forms without development

**Problem**: Mobile and desktop deployment
**Solution**: PWA with Capacitor integration
**Rationale**: Single codebase for web and mobile platforms

## Key Components

### Frontend Components
- **Navigation System**: Wouter-based routing with dynamic navigation
- **Form Builder**: Drag-and-drop interface for creating custom forms
- **Data Tables**: Comprehensive CRUD operations for all entities
- **PWA Features**: Service worker, offline support, install prompts
- **UI Framework**: ShadCN UI components with Tailwind CSS

### Backend Services
- **API Routes**: RESTful endpoints for all data operations
- **Database Layer**: Drizzle ORM with PostgreSQL
- **File Storage**: CSV import/export functionality
- **External Integrations**: Address validation, PDF generation

### Database Schema
- **Core Tables**: Users, orders, customers, inventory
- **Feature System**: Dynamic product configuration
- **Forms System**: Custom form definitions and submissions
- **Employee Management**: Time tracking, onboarding, QC workflows
- **Enhanced Forms**: Advanced form builder with versioning
- **Inventory Management**: Restructured with AG Part#, Name, Source, Supplier Part#, Cost per, Order Date, Dept., Secondary Source, Notes fields with CSV import/export capabilities
- **P2 Product Receiving**: Specialized workflow for P2 products with Code 39 barcode generation, detailed tracking (manufacturing date, expiration date, batch number, lot number, aluminum heat number), and multi-label printing capability
- **OEM Production Orders**: Separate production order system for OEM customers generating stock orders from Purchase Orders, tracked independently from regular P1 orders with duplicate prevention and unified customer database integration
- **P1 Order Barcode System**: Comprehensive barcode generation and scanning system for all P1 orders with unique Code 39 barcodes (format: P1-{OrderID}), automated barcode generation for new orders, barcode scanner interface for viewing order pricing summaries with hidden pricing details for security, payment status tracking, line item breakdown without pricing visibility, and integrated barcode display/printing functionality in order management
- **Avery Label Printing**: Professional barcode label printing system for Avery 5160 labels (2.625" x 1") with exact 5-line format: (1) Action Length abbreviation + Stock Model (e.g., "SA CF Chalkbranch"), (2) Scannable Code 39 barcode image, (3) Paint subcategory only (e.g., "Carbon Black Camo"), (4) Customer Name, (5) Due Date. Action length extraction from features.action_length field with LA/MA/SA abbreviations. Labels optimized for high-quality printing with proper barcode resolution and spacing.

## Data Flow

### Order Management Flow
1. Customer creation/selection via search interface
2. Product configuration using dynamic features system with comprehensive state management
3. Feature consolidation: All form selections (features, railAccessory, otherOptions, paintOptions, bottomMetal, handedness) merged into unified features object
4. Order draft creation with automatic ID generation and complete feature persistence
5. Edit functionality: URL parameter-based loading (?draft=id) with full feature state restoration
6. Order processing through various status states
7. Inventory tracking and updates

### Form System Flow
1. Form definition creation via drag-and-drop builder
2. Form rendering with dynamic field types
3. Submission collection with validation
4. Report generation with filtering and export options

### Employee Workflow
1. Time clock entry with automatic status tracking
2. Task assignment and completion tracking
3. QC workflow execution with signature capture
4. Document management and onboarding

## External Dependencies

### Database
- **PostgreSQL**: Primary data store via Neon serverless
- **Drizzle ORM**: Type-safe database operations
- **Migration System**: Schema versioning and updates

### UI Framework
- **React 18**: Component-based UI framework
- **ShadCN UI**: Component library built on Radix UI
- **Tailwind CSS**: Utility-first styling
- **Framer Motion**: Animation library

### Backend Dependencies
- **Express.js**: Web application framework
- **TanStack Query**: Server state management
- **Zod**: Runtime type validation
- **Axios**: HTTP client for external APIs

### Development Tools
- **Vite**: Build tool and development server
- **TypeScript**: Type-safe JavaScript
- **ESLint/Prettier**: Code formatting and linting

## Deployment Strategy

### Development Environment
- **Local Development**: Vite dev server with hot reload
- **Database**: Neon PostgreSQL with connection pooling
- **Environment Variables**: DATABASE_URL configuration

### Production Deployment
- **Web Deployment**: Static site generation with Express API
- **Mobile Deployment**: Capacitor builds for iOS/Android
- **PWA Features**: Service worker caching and offline support

### Build Process
- **Frontend Build**: Vite production build to dist/public
- **Backend Build**: ESBuild bundling for Node.js deployment
- **Database Migration**: Drizzle-kit push for schema updates

### Mobile Configuration
- **Capacitor**: Cross-platform mobile deployment
- **App Configuration**: Splash screens, status bars, push notifications
- **Platform-specific**: iOS and Android build configurations

## Key Features

### Manufacturing-Specific Features
- **P1 Order ID System**: Unique alphanumeric order identification
- **Dynamic Product Configuration**: Feature-based product customization
- **Quality Control Workflows**: Digital signature capture and validation
- **Inventory Management**: Real-time stock tracking with barcode scanning
- **Tikka Lug Options**: Set/Loose selection with proper persistence in order drafts

### Business Process Features
- **Customer Management**: CRM with communication tracking and SmartyStreets address validation
- **Enhanced Discount System**: Persistent and temporary discount management with targeted application (stock model vs total order), plus flexible Custom discount option for ad-hoc percentage or fixed dollar amount discounts
- **Employee Portal**: Time tracking, onboarding, and task management
- **Reporting System**: Multi-format export capabilities (PDF, CSV, JSON)
- **Address Management**: Real-time address autocomplete and validation via SmartyStreets API

### Technical Features
- **Offline Capability**: PWA with service worker caching
- **Real-time Updates**: TanStack Query for optimistic updates
- **Type Safety**: End-to-end TypeScript with shared schemas
- **Responsive Design**: Mobile-first UI with touch optimization