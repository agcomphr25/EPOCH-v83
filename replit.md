# EPOCH v8 - Manufacturing ERP System

## Overview

This is a full-stack manufacturing ERP system built with React, TypeScript, Express, and PostgreSQL. The application focuses on order management with features for generating order IDs, importing CSV data, and managing manufacturing orders. It uses modern web technologies including ShadCN UI components, Drizzle ORM, and TanStack Query for efficient data management.

## Recent Changes

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
- **Current Period**: AP (July 1-14, 2025)
- **Last Order**: AP001
- **Next Order**: AP002
- **Algorithm**: Bi-weekly cycling with proper period advancement

## Key Components

### Frontend Architecture
- **React 18**: Modern React with hooks and functional components
- **ShadCN UI**: Comprehensive UI component library built on Radix UI
- **TanStack Query**: Server state management and data fetching
- **Wouter**: Lightweight client-side routing
- **Tailwind CSS**: Utility-first styling with custom design system

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