import { db } from '../../db';
import { customers } from '../../schema';
import { eq, sql } from 'drizzle-orm';

/**
 * Resolve a text customer_id to the integer PK of the master customers table.
 *
 * Resolution order:
 * 1. Purely numeric string → treat as customers.id directly (integer PK lookup).
 * 2. Exact case-insensitive match on customers.customer_key.
 * 3. Exact case-insensitive match on customers.name.
 *
 * Returns null when no match is found (non-fatal — the text customerId remains
 * the primary reference for backward compatibility).
 */
export async function resolveCustomersIntegerId(customerId: string | null | undefined): Promise<number | null> {
  if (!customerId || customerId.trim() === '') return null;
  const trimmed = customerId.trim();

  // Fast path: if the value is a pure integer string it may already be the PK.
  const asInt = parseInt(trimmed, 10);
  if (!isNaN(asInt) && String(asInt) === trimmed) {
    const [row] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.id, asInt))
      .limit(1);
    if (row) return row.id;
  }

  const normalized = trimmed.toLowerCase();
  const [match] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(
      sql`lower(trim(coalesce(${customers.customerKey}, ''))) = ${normalized}
          OR lower(trim(${customers.name})) = ${normalized}`
    )
    .limit(1);

  return match?.id ?? null;
}
