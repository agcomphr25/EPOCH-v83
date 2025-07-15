# EPOCH v8 - Manufacturing ERP System

## Overview

This is a full-stack manufacturing ERP system built with React, TypeScript, Express, and PostgreSQL. The application focuses on order management with features for generating order IDs, importing CSV data, and managing manufacturing orders. It uses modern web technologies including ShadCN UI components, Drizzle ORM, and TanStack Query for efficient data management.

## Recent Changes

- **July 15, 2025 (Early Morning)**: Debugged persistent Babel parsing error in OrderEntry.tsx component - identified and fixed malformed JSX structure on line 887 where div element was incomplete (missing closing >), created simplified test component to isolate issues, application now running successfully on port 5000
- **July 15, 2025 (Early Morning)**: Successfully resolved persistent React runtime error "Cannot read properties of null (reading 'useRef')" - identified root cause as mixed React import patterns in UI components, systematically fixed all React hook imports (use-toast.ts, use-mobile.tsx, QCManager.tsx, sidebar.tsx, carousel.tsx, DiscountAdmin.tsx, EnhancedReportBuilder.tsx), isolated error to OrderManagement->CSVImport component chain, restored full application functionality
- **July 14, 2025 (Afternoon)**: Successfully fixed Order ID generation system to create unique sequential IDs - updated algorithm to handle legacy formats (UNIQUE002, TEST001) and generate proper year-month format (AG001, AG002, etc.) with database integration and automatic incrementing
- **July 14, 2025 (Afternoon)**: Debugging All Orders page 404 issue - verified API endpoints work correctly, added multiple route aliases (/orders, /orders-list, /all-orders), investigating routing and component rendering
- **July 14, 2025 (Afternoon)**: Added Orders List page with navigation button - created comprehensive order listing with customer names, status badges, order dates, and edit/view actions accessible from main navigation bar
- **July 14, 2025 (Afternoon)**: Fixed Order ID generation to produce unique sequential IDs - replaced static mock "AP001" with proper year-month algorithm (AG001, AG002, etc.) that generates A=2025, G=July, with monthly sequence reset and database integration
- **July 14, 2025 (Afternoon)**: Removed all mock customers from database - cleaned up customer search to only show real customers entered by users, removed 10 sample customers with names like "John Smith", "Sarah Johnson", etc., and fixed customer address creation validation
- **July 14, 2025 (Afternoon)**: Fixed customer creation validation error - updated frontend to properly clean empty email strings and backend schema to handle optional email fields correctly
- **July 14, 2025 (Afternoon)**: Fixed critical Order Entry "Edit Order" and "Create Order" functionality - resolved JSON double-stringification error causing order creation failures and fixed customer dropdown not updating after adding new customers
- **July 14, 2025 (Afternoon)**: Updated onSingleSubmit function to use correct '/api/orders/draft' endpoint instead of non-existent '/api/orders' endpoint, ensuring proper order creation workflow
- **July 14, 2025 (Afternoon)**: Fixed CustomerSearchInput cache invalidation to properly refresh search results after creating new customers
- **July 14, 2025 (Early Morning)**: Successfully implemented Enhanced FormBuilder/ReportBuilder system with comprehensive drag-and-drop form creation, signature pad integration, PDF/CSV export capabilities, and PostgreSQL database schema
- **July 14, 2025 (Early Morning)**: Created complete Enhanced Forms module with EnhancedFormBuilderAdmin component supporting visual form builder, element positioning, signature capture, and database column integration
- **July 14, 2025 (Early Morning)**: Built EnhancedFormRenderer component with dynamic form rendering, signature pad support, conditional field visibility, form validation, and submission handling
- **July 14, 2025 (Early Morning)**: Developed EnhancedReportBuilder component with advanced filtering, summary statistics, multi-format exports (CSV, JSON, PDF), and comprehensive data visualization
- **July 14, 2025 (Early Morning)**: Added PostgreSQL schema with enhanced_form_categories, enhanced_forms, enhanced_form_versions, and enhanced_form_submissions tables with proper relationships
- **July 14, 2025 (Early Morning)**: Created comprehensive API routes for enhanced forms CRUD operations, category management, schema discovery, and submission handling
- **July 14, 2025 (Early Morning)**: Integrated enhanced forms pages into navigation and routing system with /enhanced-forms, /enhanced-reports, and /forms/render/:formId paths
- **July 14, 2025 (Early Morning)**: Built complete API client structure with categories.ts, schema.ts, enhancedForms.ts, and submissions.ts for TypeScript integration
- **July 13, 2025 (Late Evening)**: Successfully implemented PWA (Progressive Web App) capabilities with service worker, manifest.json, install prompts, offline indicators, and Capacitor configuration for mobile deployment
- **July 13, 2025 (Late Evening)**: Added InstallPWAButton component to navigation for app installation, OfflineIndicator for connection status, and comprehensive PWA utilities for service worker management
- **July 13, 2025 (Late Evening)**: Created proper PWA icons, manifest configuration, and integrated service worker with caching strategies for offline functionality
- **July 13, 2025 (Evening)**: Successfully implemented Module 8: API Integrations & Communications with complete frontend and backend scaffolding - includes address validation, PDF generation, and customer communication systems
- **July 13, 2025 (Evening)**: Created comprehensive AddressInput component with autocomplete, PdfViewer component with download functionality, and CommunicationPanel with email/SMS support 
- **July 13, 2025 (Evening)**: Added Module 8 database schema with customer_addresses, communication_logs, and pdf_documents tables with proper relationships and validation
- **July 13, 2025 (Evening)**: Implemented mock API endpoints for address autocomplete/validation, PDF generation (order-confirmation, packing-slip, invoice), and communication sending with logging
- **July 13, 2025 (Evening)**: Fixed Time Clock Admin button state issue by adding proper database query ordering to get most recent entries for accurate clock in/out status
- **July 13, 2025 (Afternoon)**: Completely redesigned P1 Order ID algorithm with year-month format - year-based first letter (2025=A, 2026=B, etc.), month-based second letter (Jan=A, Feb=B, etc.), sequential numbering within month, reset monthly to 001, continues after 999 to 1000+
- **July 13, 2025 (Afternoon)**: Updated Module 1 Order ID Generator with comprehensive testing suite - includes 16 test cases covering same month increment, monthly reset, year progression, edge cases, and algorithm validation
- **July 13, 2025 (Early Morning)**: Successfully implemented complete Inventory Manager CRUD system with create, read, update, and delete capabilities for inventory items
- **July 13, 2025 (Early Morning)**: Fixed modal form input issues with stable state management and React.memo optimization - all form fields now work properly
- **July 13, 2025 (Early Morning)**: Added comprehensive hardcoded category system with 19 inventory categories (Barrels, Stocks, Triggers, Scopes, Accessories, Hardware, Springs, Screws, Bolts, Nuts, Washers, Pins, Tools, Lubricants, Cleaning Supplies, Safety Equipment, Raw Materials, Finished Goods, Other)
- **July 13, 2025 (Early Morning)**: Created InventoryManager component with full CRUD operations, modal forms, stock status indicators, and table-based inventory display
- **July 13, 2025 (Early Morning)**: Successfully implemented Module 5: Inventory & Scanning Integration with complete database schema, API routes, React components, and navigation integration
- **July 13, 2025 (Early Morning)**: Created comprehensive inventory management system with scanner integration, dashboard overview, and employee management
- **July 13, 2025 (Early Morning)**: Added inventory database tables (inventory_items, inventory_scans, employees) with sample data and proper relationships
- **July 13, 2025 (Early Morning)**: Built InventoryScanner component with mock barcode scanning (Ctrl+S), form handling, and technician selection
- **July 13, 2025 (Early Morning)**: Created InventoryDashboard component with stock level monitoring, low stock alerts, and refresh functionality
- **July 13, 2025 (Early Morning)**: Successfully isolated and removed all FormBuilder and ReportBuilder code from active codebase - removed database tables, storage interface, API routes, components, pages, and navigation elements to prevent conflicts with existing work
- **July 12, 2025 (Late Evening)**: Successfully resolved critical draft loading issue - fixed URL parameter extraction to use window.location.search instead of wouter's location API, enabling proper draft form population when clicking "Edit" from Draft Orders page
- **July 12, 2025 (Evening)**: Implemented complete Stock Model management system with database table, API endpoints, and UI manager - replaced hardcoded stock models with dynamic database-driven system
- **July 12, 2025 (Evening)**: Updated pricing formula to include personalization feature option prices - QD accessories and other dropdown options now add their specific prices to order totals
- **July 12, 2025 (Evening)**: Fixed QD feature options prices not saving - updated schema validation to include price field in options array
- **July 12, 2025 (Evening)**: Fixed Order ID Generator to properly utilize Last Order ID field - now extracts numeric sequences from any format (e.g., "fg965" → "AQ966")
- **July 12, 2025 (Evening)**: Added price field to features database schema and Feature Manager interface - rail features now have pricing that flows to Order Summary calculations
- **July 12, 2025 (Evening)**: Fixed SelectItem error by correcting empty values in QD accessory feature options database
- **July 12, 2025 (Evening)**: Successfully removed Rush Option from Order Entry as requested - will be added separately as Personalization Option
- **July 12, 2025 (Early Morning)**: Successfully implemented sub-category system for paint_options category with complete database schema, API routes, and 6 sub-categories (Base Colors, Metallic Finishes, Special Effects, Camo Patterns, Custom Graphics, Protective Coatings)
- **July 11, 2025 (Evening)**: Fixed feature update validation errors by adding proper null handling for validation and placeholder fields in schema
- **July 11, 2025 (Evening)**: Connected Order Entry form to live Feature Manager data - features now load from database instead of hardcoded mock data
- **July 11, 2025 (Evening)**: Added support for all field types in Order Entry (dropdown, textarea, text, number) with proper form controls
- **July 11, 2025 (Evening)**: Enhanced Order Entry layout with Customer PO checkbox field (conditional text input) and Handedness dropdown (Right/Left)
- **July 11, 2025 (Evening)**: Reorganized Order Entry form flow: Order ID/Date/Due Date header row, then Customer → Customer PO → Stock Model → Handedness → Dynamic Features
- **July 11, 2025 (Evening)**: Improved Feature Manager error handling and form data sanitization to prevent read-only field conflicts
- **July 11, 2025**: Simplified Order Entry module to single order creation only - removed bulk CSV import functionality to avoid confusion with historical data import
- **July 11, 2025**: Clarified navigation descriptions: Order Management for viewing orders and importing historical data, Order Entry for creating single orders
- **July 11, 2025**: Implemented full CRUD capabilities for Customer Types and Persistent Discounts with database persistence
- **July 11, 2025**: Added comprehensive discount management system with tabbed interface for Quick Setup, Customer Types, and Persistent Discounts
- **July 11, 2025**: Successfully implemented complete Feature Manager system with categories, multiple field types, validation, and database persistence
- **July 11, 2025**: Created database schema with proper relationships and seeded initial data for immediate functionality
- **July 11, 2025**: Integrated comprehensive discount management module with real-time discount calculator and admin interface
- **July 11, 2025**: Added multi-page navigation system allowing users to switch between Order Management and Discount Management
- **July 11, 2025**: Connected discount calculator to live sales data from admin interface (fixed hardcoded sample data issue)
- **July 11, 2025**: Migrated from in-memory storage to PostgreSQL database using Neon - replaced MemStorage with DatabaseStorage implementation
- **July 11, 2025**: Successfully fixed P1 Order ID Generator algorithm - now correctly generates AN001 → AN002 within same period and properly advances periods every 14 days
- **July 11, 2025**: Replaced complex reverse-calculation logic with simpler forward-calculation approach for better reliability
- **January 11, 2025**: Updated application branding to "EPOCH v8" in the main header
- **January 11, 2025**: Successfully implemented Order ID Generator & CSV Import module with P1/P2 ID generation algorithms and comprehensive CSV data import functionality

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Full-Stack Monorepo Structure
- **Client**: React frontend with TypeScript, located in `/client`
- **Server**: Express.js backend with TypeScript, located in `/server`
- **Shared**: Common schemas and types, located in `/shared`
- **Database**: PostgreSQL with Drizzle ORM for data persistence

### Build System
- **Vite**: Frontend build tool and development server
- **ESBuild**: Backend bundling for production
- **TypeScript**: Type safety across the entire codebase

## Current Data State (Session Preserved)

### Feature Manager Data
- **Categories**: Custom Features, Finish Options, Personal Features, Test Category
- **Features**: Action Length (dropdown), Barrel Length (dropdown), Finish Type (dropdown), Special Instructions (textarea)
- **Database**: All features stored in PostgreSQL with proper validation and options

### Order Entry Integration
- **Dynamic Features**: Loading from database (no longer hardcoded)
- **Form Layout**: Order ID/Date/Due Date header + Customer/CustomerPO/StockModel/Handedness + Dynamic Features
- **Field Types**: Supports dropdown, textarea, text, number inputs
- **Customer PO**: Checkbox with conditional text input
- **Handedness**: Right/Left dropdown selection

### P1 Order ID System
- **Current Date**: July 13, 2025 (AG period)
- **Format**: Year-Month-Sequence (AG001, AG002, etc.)
- **Year Letters**: 2025=A, 2026=B, ..., 2047=W, 2048=AA, 2049=AB...
- **Month Letters**: Jan=A, Feb=B, ..., Dec=L
- **Sequence**: Monthly reset to 001, continues after 999 to 1000+
- **Algorithm**: Simplified year-month format with monthly sequence reset

## Key Components

### Frontend Architecture
- **React 18**: Modern React with hooks and functional components
- **ShadCN UI**: Comprehensive UI component library built on Radix UI
- **TanStack Query**: Server state management and data fetching
- **Wouter**: Lightweight client-side routing
- **Tailwind CSS**: Utility-first styling with custom design system

### Module 8: API Integrations & Communications
- **AddressInput**: Advanced address autocomplete with validation
- **PdfViewer**: Document preview and download functionality
- **CommunicationPanel**: Multi-channel customer communication system
- **Mock Integrations**: Address validation, PDF generation, email/SMS sending

### Backend Architecture
- **Express.js**: RESTful API server with middleware support
- **TypeScript**: Full type safety on the backend
- **Storage Interface**: Abstracted storage layer with in-memory implementation
- **Middleware**: Request logging, JSON parsing, and error handling

### Database Layer
- **Drizzle ORM**: Type-safe database interactions
- **PostgreSQL**: Production database (configured for Neon)
- **Schema**: Centralized database schema definition
- **Migrations**: Database versioning and schema management

## Data Flow

### Order Management Flow
1. **Order ID Generation**: Custom algorithms for P1 (bi-weekly cycling) and P2 (customer-based) order IDs
2. **CSV Import**: File upload → Papa Parse → Data validation → State management
3. **Data Display**: Real-time data visualization with sorting and filtering
4. **Export**: CSV export functionality for processed data

### State Management
- **TanStack Query**: Server state caching and synchronization
- **React Hooks**: Local component state management
- **Custom Hooks**: Reusable business logic (CSV import, mobile detection)

## External Dependencies

### Core Libraries
- **@neondatabase/serverless**: Database connectivity for Neon PostgreSQL
- **drizzle-orm**: Type-safe database operations
- **@tanstack/react-query**: Server state management
- **papaparse**: CSV parsing and processing
- **date-fns**: Date manipulation utilities

### UI Framework
- **@radix-ui/***: Accessible UI primitives
- **lucide-react**: Modern icon library
- **tailwindcss**: Utility-first CSS framework
- **class-variance-authority**: Type-safe component variants

### Development Tools
- **tsx**: TypeScript execution for development
- **@replit/vite-plugin-***: Replit-specific development enhancements
- **drizzle-kit**: Database schema management and migrations

## Deployment Strategy

### Development Environment
- **Vite Dev Server**: Hot module replacement and fast refresh
- **TSX**: Direct TypeScript execution for backend development
- **Replit Integration**: Optimized for Replit development environment

### Production Build
- **Frontend**: Vite build with static file generation
- **Backend**: ESBuild bundling with external package handling
- **Database**: PostgreSQL with connection pooling via Neon

### Environment Configuration
- **DATABASE_URL**: PostgreSQL connection string (required)
- **NODE_ENV**: Environment detection for conditional features
- **REPL_ID**: Replit-specific environment detection

### File Structure
```
/
├── client/           # React frontend
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Route components
│   │   ├── hooks/       # Custom React hooks
│   │   ├── lib/         # Utilities and configurations
│   │   └── utils/       # Business logic utilities
│   └── index.html
├── server/           # Express backend
│   ├── index.ts      # Server entry point
│   ├── routes.ts     # API route definitions
│   ├── storage.ts    # Data access layer
│   └── vite.ts       # Development server setup
├── shared/           # Common code
│   └── schema.ts     # Database schema and types
├── migrations/       # Database migrations
└── dist/            # Production build output
```

The application is designed for easy deployment on Replit with automatic database provisioning and environment setup. The storage interface allows for easy switching between in-memory (development) and PostgreSQL (production) implementations.