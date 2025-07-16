# EPOCH v8 - Complete System Architecture & Structure

## Table of Contents
1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Database Architecture](#database-architecture)
4. [Frontend Architecture](#frontend-architecture)
5. [Backend Architecture](#backend-architecture)
6. [Module Breakdown](#module-breakdown)
7. [API Documentation](#api-documentation)
8. [File Structure](#file-structure)
9. [Data Flow](#data-flow)
10. [Security & Authentication](#security--authentication)
11. [Deployment Architecture](#deployment-architecture)
12. [Integration Points](#integration-points)

---

## System Overview

EPOCH v8 is a comprehensive Manufacturing ERP system designed for small manufacturing companies specializing in customizable products. The system provides end-to-end order management, inventory tracking, quality control, employee management, and dynamic form generation capabilities.

### Core Features
- **Order Management**: Complete order lifecycle from creation to fulfillment
- **Inventory Tracking**: Real-time inventory management with barcode scanning
- **Quality Control**: Comprehensive QC workflows with digital signatures
- **Employee Portal**: Time tracking, onboarding, and task management
- **Dynamic Forms**: Advanced form builder with signature capture
- **Customer Management**: CRM functionality with communication tracking
- **Reporting & Analytics**: Comprehensive reporting with multiple export formats
- **Progressive Web App**: Mobile-ready with offline capabilities

---

## Technology Stack

### Frontend
- **React 18** - Modern component-based UI framework
- **TypeScript** - Type-safe JavaScript development
- **Vite** - Fast build tool and development server
- **TanStack Query** - Server state management and data fetching
- **Wouter** - Lightweight client-side routing
- **ShadCN UI** - Component library built on Radix UI primitives
- **Tailwind CSS** - Utility-first styling framework
- **Framer Motion** - Animation library
- **React Hook Form** - Form handling with validation

### Backend
- **Node.js** - JavaScript runtime
- **Express.js** - Web application framework
- **TypeScript** - Type-safe server development
- **Drizzle ORM** - Type-safe database operations
- **PostgreSQL** - Production database (Neon hosted)
- **WebSocket** - Real-time communication
- **Passport.js** - Authentication middleware

### Development Tools
- **TSX** - TypeScript execution for development
- **ESBuild** - Fast JavaScript bundler
- **Drizzle Kit** - Database schema management
- **Replit** - Cloud development environment

### External Integrations
- **Neon Database** - Managed PostgreSQL hosting
- **Address Validation APIs** - Address autocomplete and validation
- **PDF Generation** - Document generation services
- **Email/SMS APIs** - Customer communication
- **PWA Service Workers** - Offline functionality

---

## Database Architecture

### Core Tables

#### Customer Management
```sql
customers (25 tables total)
├── customers - Customer master records
├── customer_addresses - Shipping/billing addresses
├── customer_types - Customer classifications
└── communication_logs - Customer communication history
```

#### Order Management
```sql
order_system
├── order_drafts - Manufacturing orders (draft & completed)
├── orders - Legacy order records
├── csv_data - Imported order data
└── pdf_documents - Generated order documents
```

#### Product & Feature Management
```sql
product_system
├── stock_models - Product model definitions
├── feature_categories - Feature groupings
├── feature_sub_categories - Sub-category organization
└── features - Individual product features/options
```

#### Inventory Management
```sql
inventory_system
├── inventory_items - Item master records
├── inventory_scans - Scanning transactions
└── employees - Staff records for inventory tracking
```

#### Quality Control
```sql
qc_system
├── qc_definitions - Quality check definitions
├── qc_submissions - QC inspection results
├── maintenance_schedules - Equipment maintenance
└── maintenance_logs - Maintenance completion records
```

#### Employee Management
```sql
employee_system
├── employees - Employee master records
├── time_clock_entries - Time tracking
├── checklist_items - Daily task checklists
└── onboarding_docs - Document signing workflow
```

#### Form System
```sql
forms_system
├── forms - Basic form definitions
├── form_submissions - Basic form data
├── enhanced_forms - Advanced dynamic forms
├── enhanced_form_categories - Form organization
├── enhanced_form_versions - Form version control
└── enhanced_form_submissions - Advanced form data
```

#### Discounts & Sales
```sql
pricing_system
├── persistent_discounts - Long-term customer discounts
└── short_term_sales - Temporary promotions
```

#### System Management
```sql
system_tables
└── users - System user accounts
```

### Key Relationships
- `customers` ↔ `customer_addresses` (1:many)
- `order_drafts` → `customers` (many:1)
- `features` → `feature_categories` (many:1)
- `features` → `feature_sub_categories` (many:1)
- `qc_submissions` → `qc_definitions` (many:1)
- `enhanced_form_submissions` → `enhanced_forms` (many:1)

---

## Frontend Architecture

### Component Structure
```
client/src/
├── components/
│   ├── ui/ - ShadCN UI components
│   ├── forms/ - Form-related components
│   ├── charts/ - Data visualization
│   └── layout/ - Layout components
├── pages/ - Route components
├── hooks/ - Custom React hooks
├── lib/ - Utilities and configurations
├── utils/ - Business logic utilities
└── assets/ - Static assets
```

### Key Components

#### Navigation & Layout
- **Navigation** - Main navigation bar with module links
- **InstallPWAButton** - PWA installation prompt
- **OfflineIndicator** - Connection status display

#### Order Management
- **OrderEntry** - Single order creation form
- **OrdersList** - Comprehensive order listing
- **DraftOrders** - Draft order management
- **OrderManagement** - CSV import and bulk operations

#### Feature Management
- **FeatureManager** - Dynamic feature configuration
- **StockModels** - Product model management
- **DiscountManagement** - Pricing and discount configuration

#### Inventory
- **InventoryManager** - CRUD operations for inventory
- **InventoryScanner** - Barcode scanning interface
- **InventoryDashboard** - Stock level monitoring

#### Forms
- **EnhancedFormBuilder** - Visual form designer
- **EnhancedFormRenderer** - Dynamic form display
- **EnhancedReportBuilder** - Report generation interface

#### Employee Portal
- **TimeClockAdmin** - Time tracking management
- **EmployeeChecklistPage** - Daily task management
- **OnboardingPage** - Document signing workflow

### State Management
- **TanStack Query** - Server state caching and synchronization
- **React Context** - CSV import state management
- **Local State** - Component-level state with hooks

### Routing Structure
```
/ - Order Management (main dashboard)
/order-entry - Single order creation
/orders-list - All orders view
/draft-orders - Draft orders management
/discounts - Discount management
/feature-manager - Feature configuration
/stock-models - Product model management
/inventory/* - Inventory management pages
/enhanced-forms/* - Advanced form system
/employee/* - Employee portal pages
/qc/* - Quality control workflows
/maintenance/* - Equipment maintenance
```

---

## Backend Architecture

### API Structure
```
server/
├── index.ts - Server entry point
├── routes.ts - API route definitions
├── storage.ts - Data access layer
├── db.ts - Database connection
└── vite.ts - Development server setup
```

### Storage Interface
The system uses an abstracted storage interface (`IStorage`) that provides:
- **CRUD Operations** for all entities
- **Search Functionality** for customers and inventory
- **Relationship Management** between entities
- **Transaction Support** for complex operations

### API Endpoints

#### Customer Management
```
GET    /api/customers - List all customers
GET    /api/customers/search?query= - Search customers
GET    /api/customers/:id - Get customer details
POST   /api/customers - Create customer
PUT    /api/customers/:id - Update customer
DELETE /api/customers/:id - Delete customer
```

#### Order Management
```
GET    /api/orders/draft - Get draft orders
POST   /api/orders/draft - Create draft order
PUT    /api/orders/draft/:orderId - Update draft order
DELETE /api/orders/draft/:orderId - Delete draft order
GET    /api/orders/last-id - Get last order ID
```

#### Feature Management
```
GET    /api/feature-categories - List categories
POST   /api/feature-categories - Create category
GET    /api/features - List all features
POST   /api/features - Create feature
PUT    /api/features/:id - Update feature
```

#### Inventory Management
```
GET    /api/inventory/items - List inventory items
POST   /api/inventory/items - Create item
PUT    /api/inventory/items/:id - Update item
POST   /api/inventory/scans - Record scan
```

### Middleware Stack
1. **Express JSON Parser** - Request body parsing
2. **Request Logging** - API call tracking
3. **Error Handling** - Centralized error management
4. **Validation** - Zod schema validation
5. **Authentication** - Passport.js integration (configured)

---

## Module Breakdown

### Module 1: Order ID Generator & CSV Import
**Purpose**: Generate unique order IDs and import historical data
- **P1 Order ID Algorithm**: Year-month format (AG001, AG002...)
- **CSV Import**: Papa Parse integration for bulk data import
- **Data Validation**: Schema validation for imported data

### Module 2: Feature Manager
**Purpose**: Dynamic product feature configuration
- **Categories**: Organize features into logical groups
- **Field Types**: Support for dropdown, text, number, textarea
- **Validation**: Custom validation rules per feature
- **Pricing**: Individual feature pricing support

### Module 3: Discount Management
**Purpose**: Customer pricing and discount administration
- **Customer Types**: Classification-based discounts
- **Persistent Discounts**: Long-term customer rates
- **Short-term Sales**: Temporary promotions
- **Discount Calculator**: Real-time pricing calculations

### Module 4: Order Entry System
**Purpose**: Single order creation and management
- **Dynamic Forms**: Feature-driven order forms
- **Customer Integration**: Live customer search and creation
- **Stock Model Selection**: Product model configuration
- **Price Calculation**: Real-time order totaling

### Module 5: Inventory & Scanning
**Purpose**: Inventory management with barcode integration
- **Item Management**: Full CRUD for inventory items
- **Barcode Scanning**: Mock scanning with Ctrl+S
- **Stock Tracking**: On-hand, committed, reorder points
- **Dashboard**: Visual stock level monitoring

### Module 6: Quality Control
**Purpose**: Manufacturing quality assurance workflows
- **QC Definitions**: Configurable quality checks
- **Line-specific Checks**: P1/P2 production line support
- **Digital Signatures**: Electronic signature capture
- **Pass/Fail Tracking**: Quality metrics and reporting

### Module 7: Employee Portal
**Purpose**: Employee management and self-service
- **Time Clock**: Clock in/out with status tracking
- **Daily Checklists**: Task management system
- **Onboarding**: Document signing workflow
- **Maintenance**: Equipment maintenance scheduling

### Module 8: API Integrations
**Purpose**: External service integrations
- **Address Validation**: Autocomplete and verification
- **PDF Generation**: Document generation for orders
- **Communication**: Email/SMS customer notifications
- **File Management**: Document storage and retrieval

### Module 9: Enhanced Forms
**Purpose**: Advanced form builder and reporting
- **Visual Form Builder**: Drag-and-drop form creation
- **Signature Capture**: Digital signature integration
- **Version Control**: Form versioning system
- **Advanced Reporting**: Multi-format export capabilities

### Module 10: PWA Capabilities
**Purpose**: Progressive web app functionality
- **Service Workers**: Offline caching strategies
- **Install Prompts**: App installation flow
- **Offline Indicators**: Connection status monitoring
- **Mobile Optimization**: Touch-friendly interfaces

---

## Data Flow

### Order Creation Flow
1. **User Access** → Order Entry page
2. **Customer Selection** → Search existing or create new
3. **Product Configuration** → Select stock model and features
4. **Pricing Calculation** → Real-time price updates
5. **Order Submission** → Save as draft or finalize
6. **ID Generation** → Unique order ID assignment
7. **Database Storage** → Persist order data

### Inventory Management Flow
1. **Item Setup** → Create/configure inventory items
2. **Barcode Scanning** → Record inventory transactions
3. **Stock Updates** → Automatic quantity adjustments
4. **Reorder Monitoring** → Low stock alerts
5. **Dashboard Updates** → Real-time inventory status

### Quality Control Flow
1. **QC Definition** → Configure quality checks per line
2. **Order Assignment** → Link QC tasks to orders
3. **Inspection Execution** → Complete quality checks
4. **Signature Capture** → Digital approval process
5. **Results Storage** → Pass/fail documentation
6. **Reporting** → Quality metrics and trends

---

## Security & Authentication

### Authentication Strategy
- **Local Authentication** - Username/password with Passport.js
- **Session Management** - Express sessions with PostgreSQL storage
- **Password Security** - Bcrypt hashing for passwords
- **CORS Protection** - Cross-origin request security

### Data Security
- **Input Validation** - Zod schema validation on all inputs
- **SQL Injection Protection** - Drizzle ORM parameterized queries
- **XSS Prevention** - React's built-in XSS protection
- **HTTPS Enforcement** - TLS encryption for all connections

### Access Control
- **Role-based Access** - Employee role-based permissions
- **Route Protection** - Authentication required for sensitive areas
- **API Security** - Authenticated API endpoints
- **Data Isolation** - Customer data segregation

---

## Deployment Architecture

### Development Environment
- **Replit Cloud IDE** - Cloud-based development
- **Hot Module Replacement** - Instant development feedback
- **TypeScript Compilation** - Real-time type checking
- **Database Seeding** - Sample data for development

### Production Deployment
- **Frontend**: Vite build → Static file serving
- **Backend**: ESBuild bundling → Node.js execution
- **Database**: Neon PostgreSQL → Connection pooling
- **CDN**: Static asset delivery optimization

### Environment Configuration
```bash
DATABASE_URL - PostgreSQL connection string
NODE_ENV - Environment detection
PORT - Server port (default: 5000)
```

### Monitoring & Logging
- **Express Logging** - API request/response logging
- **Error Tracking** - Centralized error handling
- **Performance Monitoring** - Response time tracking
- **Database Monitoring** - Connection pool metrics

---

## Integration Points

### External Services
1. **Address Validation APIs**
   - Autocomplete suggestions
   - Address verification
   - Standardization services

2. **PDF Generation Services**
   - Order confirmations
   - Packing slips
   - Invoices
   - Custom reports

3. **Communication Services**
   - Email notifications
   - SMS alerts
   - Delivery confirmations

### Internal Integrations
1. **Database Synchronization**
   - Real-time data updates
   - Cross-module data sharing
   - Referential integrity

2. **Form System Integration**
   - Dynamic form generation
   - Cross-module form usage
   - Data collection workflows

3. **Reporting Integration**
   - Cross-module reporting
   - Data aggregation
   - Export capabilities

---

## Performance Optimizations

### Frontend Optimizations
- **Code Splitting** - Module-based loading
- **Image Optimization** - WebP format support
- **Caching Strategies** - TanStack Query caching
- **Bundle Optimization** - Tree shaking and minification

### Backend Optimizations
- **Database Indexing** - Optimized query performance
- **Connection Pooling** - Efficient database connections
- **Query Optimization** - Efficient Drizzle ORM queries
- **Response Compression** - Gzip compression

### Caching Strategy
- **Browser Caching** - Static asset caching
- **API Response Caching** - TanStack Query caching
- **Database Query Caching** - Prepared statement caching
- **CDN Caching** - Geographic content distribution

---

## Future Enhancements

### Planned Features
1. **Advanced Analytics** - Business intelligence dashboards
2. **Mobile App** - Native mobile application
3. **API Gateway** - Microservices architecture
4. **Real-time Notifications** - WebSocket-based updates
5. **Advanced Workflow Engine** - Business process automation

### Scalability Considerations
1. **Horizontal Scaling** - Load balancer implementation
2. **Database Sharding** - Data partitioning strategies
3. **Microservices Migration** - Service decomposition
4. **Container Orchestration** - Kubernetes deployment
5. **Global CDN** - Worldwide content delivery

---

*This document serves as the complete architectural reference for the EPOCH v8 Manufacturing ERP System. Last updated: July 14, 2025*