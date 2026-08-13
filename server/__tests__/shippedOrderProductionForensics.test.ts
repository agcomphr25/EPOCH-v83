import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('shipped-order production forensic report', () => {
  const source = readFileSync(
    join(process.cwd(), 'server/src/routes/admin.ts'),
    'utf8',
  );

  it('is an authenticated, read-only report backed by durable shipment evidence', () => {
    expect(source).toContain("'/domain-truth/shipped-in-production'");
    expect(source).toContain("requireRole('ADMIN', 'OWNER')");
    expect(source).toContain('ao.shipped_date IS NOT NULL');
    expect(source).toContain('ao.shipping_completed_at IS NOT NULL');
    expect(source).toContain("NULLIF(TRIM(COALESCE(ao.tracking_number, '')), '') IS NOT NULL");
    expect(source).toContain('readOnly: true');
  });

  it('surfaces the known 0167 collision and open-Shipping signatures', () => {
    expect(source).toContain('has_duplicate_numeric_id');
    expect(source).toContain('colliding_order_ids');
    expect(source).toContain("activity.source_route = 'migrations/0167_repair_customer_signature_fulfilled_orders.sql'");
    expect(source).toContain("'LIKELY_0167_ID_COLLISION'");
    expect(source).toContain("'OPEN_SHIPPING_TRANSITION_DRIFT'");
  });

  it('does not contain a mutation statement in the report route', () => {
    const routeStart = source.indexOf("'/domain-truth/shipped-in-production'");
    const routeEnd = source.indexOf("router.get(\n  '/domain-truth/order/:orderId'", routeStart);
    const route = source.slice(routeStart, routeEnd);

    expect(route).not.toMatch(/\bUPDATE\s+all_orders\b/i);
    expect(route).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(route).not.toMatch(/\bINSERT\s+INTO\b/i);
  });
});
