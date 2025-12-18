# EPOCH v8 - Manufacturing ERP System Overview

*Last Updated: December 17, 2025*

## What is EPOCH?

EPOCH v8 is a **Manufacturing ERP (Enterprise Resource Planning) system** designed specifically for small manufacturing companies that specialize in customizable products. It's a full-stack web application that streamlines operations from order intake through production, shipping, and customer management.

---

## Core Capabilities

### Order Management
- End-to-end order tracking from entry through production to shipping
- Rush fee adjustments and urgency/priority system
- Order audit trail with comprehensive change tracking
- FishBowl order number integration (FB Order Numbers like AK046)
- Tikka compatibility guardrails for stock model selection

### Production & Manufacturing
- Production Queue Manager for workflow tracking
- Department Manager with progression tracking
- Layup Scheduling for production planning
- Bill of Materials (BOM) system with revision control
- Cutting Table Operations with FIFO-based packet building
- AS9100 traceability via barcode scanning
- P2 Projects Module with multi-step workflow tracking

### Inventory Management
- Parts List Management with P1 Purchase Orders Queue
- Vendor Purchase Order management with Zod validation
- CSV import with two-phase validation
- P2 Serialized Item Tracking for components with customizable workflows
- Dynamic inventory status thresholds

### Quality Control
- Nonconformance Record System for defect tracking
- Vendor Evaluation System with automated scoring and monthly resets
- Quality approval workflows
- Electronic Signature System for AS9100 compliance

### Customer & Financial
- Customer Management with balance tracking (restricted access)
- Payment Analytics with month-over-month comparison
- Credit Memo Management with immediate balance updates
- Refund Request/Queue with Accept.Blue integration
- Cost Center Management and dynamic discount system
- Authorize.Net payment gateway integration

### Communications
- Internal messaging system
- Customer satisfaction surveys
- Email integration via SendGrid
- SMS via Twilio
- Magic Link authentication for secure login

### Employee Features
- Employee Portal with role-based access
- Training Management System
- Personalized Dashboards
- Voice Notes System for production issue tracking (restricted access)
- Customer Watch Rules for monitoring specific orders
- Help Center with searchable FAQ

### Document Management
- Media Library with camera capture and file uploads
- Signed Documents Library with edit/delete capabilities
- PDF signing and viewing
- Centralized PDF Template Library
- Smart deletion (preserves shared media files)

### Integrations
- Google Calendar for event integration
- Google Drive for file access
- Azure Document Intelligence for AI-powered document analysis
- SmartyStreets for address validation
- UPS API for shipping

---

## Technical Architecture

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Tailwind CSS, ShadCN UI, Framer Motion |
| Backend | Express.js, TypeScript, TanStack Query, Zod |
| Database | PostgreSQL (Neon serverless), Drizzle ORM |
| PWA | Vite PWA plugin, Workbox, Capacitor for mobile |

### Key Technical Features
- **Barcode System**: CODE128 for serialized items, CODE39 for regular orders
- **Authentication**: Hybrid JWT + Session with 3-role access control (ADMIN, EMPLOYEE, OWNER)
- **All timestamps displayed in Central timezone**

---

## Access Control

| Role | Access Level |
|------|--------------|
| ADMIN | Full system access including financial, vendor, and user management |
| OWNER | Business oversight with financial reporting access |
| EMPLOYEE | Department-specific access via Employee Portal |

Special access restrictions:
- Balance Due tracking: `glennj` only
- Voice Notes: `agrace`, `glennj`, `tasham` only
- Media Library: ADMIN and OWNER roles only

---

## Recent Additions

- Media Library with PDF viewing, download, and camera capture
- Signed Documents Library with full CRUD operations
- Customer Watch Rules System for order monitoring
- Voice Notes System for production issue tracking
- Order Audit System with timeline views
- Help Center with FAQ format

---

*This document is maintained as a living overview of EPOCH capabilities. Request updates as the system grows.*
