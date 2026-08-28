/**
 * Normalises date fields in a database row so they are always returned as
 * "YYYY-MM-DD" strings (or null).  Pass the row and the list of keys that
 * hold date values; everything else is left untouched.
 *
 * Handles the three common shapes that come back from node-postgres / Drizzle:
 *   - null / undefined  → kept as null
 *   - empty string ""   → converted to null
 *   - JavaScript Date   → formatted to "YYYY-MM-DD"
 *   - string            → re-formatted to "YYYY-MM-DD" (no-op when already correct)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ENTITY REGISTRY — all tables that currently use formatDates()
 * ─────────────────────────────────────────────────────────────────────────────
 * Keep this list in sync with the DATE_COLUMNS constants in server/storage.ts.
 * Every entry here corresponds to one *_DATE_COLUMNS constant and one or more
 * formatDates() call-sites in that file.
 *
 *  Entity                      Constant                              Date columns
 *  ──────────────────────────  ────────────────────────────────────  ────────────────────────────────────────
 *  Vendor                      VENDOR_DATE_COLUMNS                   evaluationDate, startRenewalDate,
 *                                                                    approvalExpiration
 *  Employee                    EMPLOYEE_DATE_COLUMNS                 hireDate, dateOfBirth,
 *                                                                    driversLicenseExpiration
 *  VendorPO                    VENDOR_PO_DATE_COLUMNS                orderDate, expectedDeliveryDate,
 *                                                                    actualDeliveryDate
 *  VendorPOItem                VENDOR_PO_ITEM_DATE_COLUMNS           receivedDate
 *  InventoryItemCostHistory    INVENTORY_ITEM_COST_HISTORY_DATE_COLUMNS receivedDate
 *  PurchaseOrder               PURCHASE_ORDER_DATE_COLUMNS           poDate, expectedDelivery
 *  PurchaseOrderItem           PURCHASE_ORDER_ITEM_DATE_COLUMNS      dueDate
 *  ProductionOrder             PRODUCTION_ORDER_DATE_COLUMNS         orderDate, dueDate
 *  CuttingFabricInventory      CUTTING_FABRIC_INVENTORY_DATE_COLUMNS receivedDate, manufactureDate,
 *                                                                    expirationDate
 *  CuttingFabricInventoryTransaction CUTTING_FABRIC_INVENTORY_TRANSACTION_DATE_COLUMNS createdAt, updatedAt
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CHECKLIST — what to do when you add a NEW entity that has date columns
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. In server/storage.ts, define a new constant:
 *       const MY_ENTITY_DATE_COLUMNS = ['columnA', 'columnB'] as const;
 *     Place it near the other *_DATE_COLUMNS constants (around line 736).
 *
 *  2. In every storage method that returns rows for that entity, wrap the
 *     result with formatDates():
 *       return formatDates(row as Record<string, unknown>, MY_ENTITY_DATE_COLUMNS) as MyEntity;
 *     This applies to getAll, getById, create, update, and any join query
 *     that embeds the entity inline.
 *
 *  3. Add a row to the ENTITY REGISTRY table above so it stays current.
 *
 *  4. Add an entry to the FORMAT_DATES_REGISTRY constant below so the
 *     pattern is enforced at the code level and reviewers can see the full
 *     picture in one place.
 *
 * If you are unsure whether a column needs formatting, check whether Drizzle
 * returns it as a JavaScript Date object or as a raw string; both cases
 * require formatDates() to produce a consistent "YYYY-MM-DD" output.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Declarative registry of every entity whose date columns are normalised by
 * formatDates().  When a new entity is added, a new entry MUST be appended
 * here alongside the matching *_DATE_COLUMNS constant in server/storage.ts.
 *
 * This object is not used at runtime for formatting — the storage layer passes
 * the specific constant directly — but it serves as an authoritative checklist
 * and makes missing entries visible in code review.
 */
export const FORMAT_DATES_REGISTRY: Record<string, readonly string[]> = {
  Vendor:                      ['evaluationDate', 'startRenewalDate', 'approvalExpiration'],
  Employee:                    ['hireDate', 'dateOfBirth', 'driversLicenseExpiration'],
  VendorPO:                    ['orderDate', 'expectedDeliveryDate', 'actualDeliveryDate'],
  VendorPOItem:                ['receivedDate'],
  InventoryItemCostHistory:    ['receivedDate'],
  PurchaseOrder:               ['poDate', 'expectedDelivery'],
  PurchaseOrderItem:           ['dueDate'],
  ProductionOrder:             ['orderDate', 'dueDate'],
  CuttingFabricInventory:      ['receivedDate', 'manufactureDate', 'expirationDate'],
  CuttingFabricInventoryTransaction: ['createdAt', 'updatedAt'],
};

export function toDateOnlyString(value: unknown): string | null {
  if (value == null || value === '') return null;

  const date = value instanceof Date
    ? value
    : typeof value === 'string'
      ? new Date(value)
      : null;

  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function formatDates<T extends Record<string, unknown>>(
  row: T,
  dateColumns: readonly (keyof T)[],
): T {
  const result = { ...row };
  for (const col of dateColumns) {
    (result as Record<string, unknown>)[col as string] = toDateOnlyString(result[col]);
  }
  return result;
}
