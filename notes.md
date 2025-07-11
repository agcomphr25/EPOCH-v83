# Project Notes

## Business Requirements & Decisions

### Discount Management System
- **Date**: July 11, 2025
- **Decision**: OEM customers excluded from persistent discounts - they will receive separate set pricing
- **Implementation**: OEM filtered out from persistent discount dropdowns but remains as customer type
- **Rationale**: OEM pricing structure differs from standard discount model

### Customer Types
- **AGR–Individual**: Individual agricultural customers
- **AGR–Gunbuilder**: Professional gunbuilder customers  
- **Distributor**: Distribution partners
- **OEM**: Original Equipment Manufacturer (set pricing, no persistent discounts)

### Persistent Discount Structure
- **Multiple tiers per customer type**: e.g., GB-20, GB-25, GB-30 for different gunbuilder discount levels
- **Custom naming**: Flexible discount names for easy identification
- **Optional descriptions**: Additional context for each discount tier

## Technical Implementation Notes

### Database Schema
- Persistent discounts support multiple named tiers per customer type
- OEM customer type preserved but excluded from persistent discount creation
- Migration handled existing data with meaningful default names

### API Structure
- Full CRUD operations for customer types and persistent discounts
- Proper relationships between customer types and discounts
- Database-backed storage with PostgreSQL

### Quick Setup Tab Changes
- **Date**: July 11, 2025
- **Decision**: Transformed Quick Setup tab to focus on Short-Term Sales management only
- **Changes Made**:
  - Removed persistent discount functionality from Quick Setup
  - Added sale status tracking (Active, Upcoming, Expired)
  - Enhanced short-term sales interface with full CRUD operations
- **Rationale**: Ad-hoc discounts will be implemented in future order creation form for better workflow integration

## Future Tasks & Ideas

### Ad-Hoc Discount System
- **Status**: To be implemented in order creation form
- **Note**: Removed from Quick Setup, will be integrated into order workflow for practical application

### MIL/LEO Discount System
- **Status**: To be implemented separately from persistent discounts
- **Note**: Removed from persistent discount structure per user request

### OEM Set Pricing
- **Status**: To be implemented later
- **Note**: Separate pricing structure outside of discount system

---

*Last Updated: July 11, 2025*
There is a persisten discount option set up for Distributors in case they need to get an ad-hoc discount on something, just not being used yet.