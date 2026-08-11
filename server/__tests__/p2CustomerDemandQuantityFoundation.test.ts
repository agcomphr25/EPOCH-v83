import { readFileSync } from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  P2DemandQuantityError,
  validateDemandDelta,
} from '../src/services/p2CustomerDemandQuantityPolicy';

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

describe('P2 customer-demand quantity policy', () => {
  it.each([
    ['CUSTOMER_CANCELLATION', -2],
    ['CUSTOMER_REINSTATEMENT', 2],
    ['SCOPE_DECREASE', -1],
    ['SCOPE_INCREASE', 1],
    ['LINE_SUPERSESSION', -1],
    ['REPLACEMENT_DEMAND', 1],
    ['QUANTITY_CORRECTION', -1],
    ['QUANTITY_CORRECTION', 1],
  ] as const)('accepts %s with controlled direction', (type, delta) => {
    expect(() => validateDemandDelta(type, delta)).not.toThrow();
  });

  it.each([
    ['CUSTOMER_CANCELLATION', 1],
    ['CUSTOMER_REINSTATEMENT', -1],
    ['SCOPE_DECREASE', 1],
    ['SCOPE_INCREASE', -1],
  ] as const)('rejects %s in the wrong direction', (type, delta) => {
    expect(() => validateDemandDelta(type, delta)).toThrow(
      P2DemandQuantityError
    );
  });

  it('uses an additive immutable ledger without guessing historical lineage', () => {
    const migration = read(
      'migrations/0262_p2_customer_demand_quantity_ledger.sql'
    );
    expect(migration).toContain(
      'ADD COLUMN IF NOT EXISTS demand_line_identity UUID'
    );
    expect(migration).toContain('WHERE demand_line_identity IS NULL');
    expect(migration).toContain('prevent_p2_demand_event_mutation');
    const identityUpdate = migration.slice(
      migration.indexOf('UPDATE p2_purchase_order_items'),
      migration.indexOf('ALTER TABLE p2_purchase_order_items', 100)
    );
    expect(identityUpdate).not.toMatch(/JOIN/i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+p2_purchase_order_items/i);
  });

  it('keeps customer-demand events distinct from fulfillment cancellation', () => {
    const migration = read(
      'migrations/0262_p2_customer_demand_quantity_ledger.sql'
    );
    expect(migration).toContain("'CUSTOMER_CANCELLATION'");
    expect(migration).not.toContain("'PRODUCTION_ORDER_CANCELLATION'");
    expect(migration).not.toContain("'PURCHASE_SUPPLY_CANCELLATION'");
    expect(migration).not.toContain("'RESERVATION_RELEASE'");
  });

  it('declares the demand event composite key columns in foreign-key order', () => {
    const migration = read(
      'migrations/0262_p2_customer_demand_quantity_ledger.sql'
    );
    const eventTable = migration.slice(
      migration.indexOf(
        'CREATE TABLE IF NOT EXISTS p2_customer_demand_quantity_events'
      ),
      migration.indexOf(
        'DO $$ BEGIN',
        migration.indexOf(
          'CREATE TABLE IF NOT EXISTS p2_customer_demand_quantity_events'
        )
      )
    );

    expect(eventTable.indexOf('po_item_id INTEGER')).toBeLessThan(
      eventTable.indexOf('demand_line_identity UUID')
    );
    expect(migration).toContain(
      'FOREIGN KEY (po_item_id,demand_line_identity)\n      REFERENCES p2_purchase_order_items(id,demand_line_identity)'
    );
  });

  it('removes part-number and row-position inference from future revision lineage', () => {
    const route = read('server/src/routes/index.ts');
    const block = route.slice(
      route.indexOf('const takeSourceMatch'),
      route.indexOf('// Fall back to copying source')
    );
    expect(block).toContain('sourceItemId');
    expect(block).not.toContain('partNumber.toLowerCase');
    expect(block).not.toContain('unusedSourceIndexes');
    expect(block).not.toContain('sourceItems[index]');
  });

  it('registers the migration as safe and critical', () => {
    const runner = read('server/scripts/migrations/runSafeBootMigrations.ts');
    expect(
      runner.match(/0262_p2_customer_demand_quantity_ledger\.sql/g)
    ).toHaveLength(2);
  });
});
