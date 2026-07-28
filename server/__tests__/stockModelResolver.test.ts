import { describe, expect, it } from 'vitest';

import {
  firstStockModelReference,
  StockModelResolver,
} from '../src/helpers/stockModelResolver';

const records = [
  { id: '71', name: 'fixture_model_alpha', displayName: 'Fixture Model Alpha' },
  { id: '84', name: 'fixture_model_beta', displayName: 'Fixture Model Beta' },
  { id: '85', name: 'mesa_universal', displayName: 'Mesa Universal' },
  { id: '86', name: 'adj_gladius', displayName: 'Adjustable Gladius' },
];

describe('StockModelResolver', () => {
  const resolver = new StockModelResolver(records);

  it.each(records)('resolves numeric fixture ID $id to its verified fixture record', record => {
    expect(resolver.resolve(record.id)).toEqual({
      ...record,
      canonicalKey: record.name,
    });
  });

  it('resolves canonical internal names and normalized display names', () => {
    expect(resolver.resolve('mesa_universal')?.id).toBe('85');
    expect(resolver.resolve('Mesa-Universal')?.id).toBe('85');
  });

  it('uses approved aliases only when they identify one model', () => {
    expect(resolver.resolve('cf_adj_gladius')?.id).toBe('86');
  });

  it('does not use broad substring matching', () => {
    expect(resolver.resolve('mesa')).toBeNull();
    expect(resolver.resolve('universal')).toBeNull();
  });

  it('refuses an ambiguous normalized display name', () => {
    const ambiguous = new StockModelResolver([
      ...records,
      { id: '87', name: 'fixture_duplicate_one', displayName: 'Fixture Duplicate' },
      { id: '88', name: 'fixture_duplicate_two', displayName: 'Fixture Duplicate' },
    ]);
    expect(ambiguous.resolve('Fixture Duplicate')).toBeNull();
  });

  it('matches demand and mold entries through the same resolved identity', () => {
    const demand = resolver.resolve('85')!;
    const mold = resolver.resolve('Mesa Universal')!;
    expect(resolver.areCompatible(demand, mold)).toBe(true);
  });
});

describe('firstStockModelReference', () => {
  it('honors authoritative field priority and never substitutes a PO item ID', () => {
    expect(firstStockModelReference([
      { source: 'purchase_order_items.stock_model_id', value: '84' },
      { source: 'production_orders.specifications.stockModel', value: 'fixture_model_alpha' },
    ])).toEqual({
      source: 'purchase_order_items.stock_model_id',
      value: '84',
    });
  });

  it('returns null when authoritative model fields are empty', () => {
    expect(firstStockModelReference([
      { source: 'purchase_order_items.stock_model_id', value: null },
      { source: 'specifications.stockModel', value: '' },
    ])).toBeNull();
  });
});
