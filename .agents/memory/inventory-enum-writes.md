---
name: Inventory enum writes
description: Why inventory classification values must be explicitly cast when written to PostgreSQL enums.
---

Cast inventory item type, manufactured category, and manufacturing level values to their PostgreSQL enum types at the shared inventory write boundary for both inserts and updates.

**Why:** A production project source-part operation rejected an `item_type` expression as text even though the equivalent ORM write was accepted in development. Relying on implicit parameter coercion is therefore not portable across the project's database execution paths.

**How to apply:** Any shared or new inventory write path that binds these classification values must preserve the explicit enum casts. Keep `null` and omitted values unchanged.