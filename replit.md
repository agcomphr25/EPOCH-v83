# EPOCH v8 - Manufacturing ERP System

## Overview

EPOCH v8 is a comprehensive Manufacturing ERP system designed specifically for small manufacturing companies specializing in customizable products. The application provides end-to-end order management, inventory tracking, employee portal functionality, and quality control workflows. Built as a full-stack TypeScript application with React frontend and Express backend, it features Progressive Web App (PWA) capabilities and is deployable to both web and mobile platforms via Capacitor.

## User Preferences

Preferred communication style: Simple, everyday language.

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

## Data Flow

### Order Management Flow
1. Customer creation/selection via search interface
2. Product configuration using dynamic features system
3. Order draft creation with automatic ID generation
4. Order processing through various status states
5. Inventory tracking and updates

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