# EPOCH v8 - Manufacturing ERP System

A full-stack manufacturing ERP system built for small manufacturing companies, focusing on robust order management, inventory tracking, and streamlined operations.

## Tech Stack Architecture

### Frontend
- **React 18** with TypeScript
- **Vite** as build tool and development server
- **ShadCN UI** component library (built on Radix UI)
- **TailwindCSS** for styling
- **TanStack Query** for server state management
- **Wouter** for client-side routing

### Backend
- **Express.js** with TypeScript
- **PostgreSQL** database with Neon hosting
- **Drizzle ORM** for type-safe database operations
- **Zod** for schema validation

### Mobile
- **Capacitor** for mobile app deployment (optional)
- **PWA** capabilities for offline functionality

### Development Tools
- **TypeScript** for type safety across the stack
- **ESBuild** for production bundling
- **Drizzle Kit** for database migrations

## Project Structure

```
/
├── client/              # React frontend application
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Route components
│   │   ├── hooks/       # Custom React hooks
│   │   └── lib/         # Utilities and configurations
│   └── index.html
├── server/              # Express backend application
│   ├── db.ts           # Database connection
│   ├── storage.ts      # Data access layer
│   ├── routes.ts       # API endpoints
│   ├── schema.ts       # Database schema definitions
│   └── index.ts        # Server entry point
├── shared/              # Common types and utilities
│   └── schema.ts       # Re-exports from server schema
├── scripts/             # Debug and utility scripts
├── data/               # CSV files and data assets
├── docs/               # Documentation and assets
└── migrations/         # Database migration files
```

## Key Features

- **Order Management**: P1/P2 order ID generation, CSV import, draft orders
- **Inventory Tracking**: Real-time inventory with barcode scanning
- **Customer Management**: Customer types, persistent discounts, address validation
- **Quality Control**: QC definitions, submissions, and tracking
- **Time Tracking**: Employee time clock with administration
- **Maintenance**: Preventive maintenance scheduling and logging
- **Reporting**: Advanced form builder with PDF/CSV exports

## Development

### Prerequisites
- Node.js 18+
- PostgreSQL database (configured via DATABASE_URL)

### Getting Started
```bash
# Install dependencies
npm install

# Set up environment variables
export DATABASE_URL="your-postgres-connection-string"

# Push database schema
npm run db:push

# Start development server
npm run dev
```

### Database Management
```bash
# Push schema changes to database
npm run db:push

# Check TypeScript types
npm run check
```

## Architecture Decisions

### Database Schema Location
- **Primary Schema**: Located in `/server/schema.ts`
- **Shared Access**: Re-exported through `/shared/schema.ts` for client components
- **Rationale**: Keeps database definitions with server code while maintaining client access

### Framework Choice
- **Vite + React**: Chosen for development speed and modern tooling
- **Not Next.js**: Avoiding SSR complexity for this internal business application
- **Drizzle ORM**: Type-safe database operations with excellent TypeScript integration

### State Management
- **TanStack Query**: Server state caching and synchronization
- **React Hooks**: Local component state
- **No Redux**: Unnecessary complexity for this application size

## Deployment

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

The application is optimized for Replit deployment with automatic database provisioning and environment setup.