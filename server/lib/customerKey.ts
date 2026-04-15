import { sql, SQL, AnyColumn } from 'drizzle-orm';
import { customers } from '../schema';

/**
 * Normalize a customer name (or any free-form customer identifier) into a
 * canonical uppercase underscore-separated key.
 *
 * Matches SQL: UPPER(REPLACE(TRIM(value), ' ', '_'))
 * — trims leading/trailing whitespace, uppercases, then replaces each space
 *   character with an underscore (one-for-one, no collapsing of multiple spaces).
 *
 * Examples:
 *   "Acme Corp"   → "ACME_CORP"
 *   "  john doe " → "JOHN_DOE"
 *   "Acme  Corp"  → "ACME__CORP"  (double space → double underscore, matches SQL)
 */
export function normalizeKey(value: string): string {
  return value.trim().toUpperCase().replace(/ /g, '_');
}

/**
 * Returns a Drizzle SQL fragment that compares a normalized version of `field`
 * (a Drizzle column or SQL expression) against the normalized customer_key
 * stored in the customers table.
 *
 * Both sides apply: UPPER(REPLACE(TRIM(...), ' ', '_'))
 *
 * Usage:
 *   db.select().from(allOrders)
 *     .innerJoin(customers, matchCustomer(allOrders.customerId))
 */
export function matchCustomer(field: AnyColumn | SQL): SQL {
  return sql`UPPER(REPLACE(TRIM(${field}), ' ', '_')) = UPPER(REPLACE(TRIM(${customers.customerKey}), ' ', '_'))`;
}
