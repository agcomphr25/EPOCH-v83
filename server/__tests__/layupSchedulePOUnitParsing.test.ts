import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseP1POUnitOrderId } from '../src/utils/parseP1POUnitOrderId';

describe('parseP1POUnitOrderId', () => {
  it('preserves hyphenated P1 purchase-order numbers', () => {
    expect(parseP1POUnitOrderId('PO-RFPO-003307-175-20')).toEqual({
      poNumber: 'RFPO-003307',
      poItemId: 175,
      unitNumber: 20,
    });
  });

  it('supports older non-hyphenated PO numbers', () => {
    expect(parseP1POUnitOrderId('PO-P18321-23-1')).toEqual({
      poNumber: 'P18321',
      poItemId: 23,
      unitNumber: 1,
    });
  });

  it('rejects malformed unit IDs', () => {
    expect(parseP1POUnitOrderId('RFPO-003307')).toBeNull();
    expect(parseP1POUnitOrderId('PO-RFPO-003307-item-unit')).toBeNull();
  });
});

describe('layup schedule PO progression scope', () => {
  const route = fs.readFileSync(
    path.resolve(process.cwd(), 'server/src/routes/layupSchedule.ts'),
    'utf8'
  );

  it('updates only each submitted existing PO unit, never the entire PO', () => {
    expect(route).toContain('WHERE order_id = $1');
    expect(route).toContain("SET current_department = 'Layup/Plugging'");
    expect(route).not.toContain('WHERE po_number = ANY($1::text[])');
  });

  it('does not create demand or silently progress PO units to Barcode while saving', () => {
    const saveStart = route.indexOf("router.post('/save'");
    const saveRoute = route.slice(saveStart, route.indexOf("router.get('/current-week'", saveStart));

    expect(saveRoute).not.toContain('INSERT INTO production_orders');
    expect(saveRoute).not.toContain('INSERT INTO all_orders');
    expect(saveRoute).not.toContain("SET current_department = 'Barcode'");
  });

  it('resolves the selected quantity from existing production orders and fails explicitly', () => {
    expect(route).toContain('FROM production_orders prod');
    expect(route).toContain('LIMIT $3');
    expect(route).toContain('rows.length !== item.quantity');
    expect(route).toContain('eligible existing production unit(s) could be resolved');
  });

  it('never treats production or PO line IDs as stock-model identity', () => {
    expect(route).not.toContain('row.stock_model_id || row.item_id');
    expect(route).not.toContain('{ source: \'production_orders.item_id\'');
    expect(route).not.toContain('{ source: \'purchase_order_items.item_id\'');
  });

  it('uses one resolver for demand and mold entries and returns traceable preview fields', () => {
    expect(route).toContain('new StockModelResolver(stockModelsList)');
    expect(route).toContain('stockModelResolver.resolve(m.model_name)');
    expect(route).toContain('stockModelResolver.resolve(originalRef?.value)');
    expect(route).toContain('stockModelDisplayName: item.stockModelDisplayName');
    expect(route).toContain('originalRef: item.originalRef');
  });

  it('distinguishes unresolved identity, incompatible molds, and exhausted capacity', () => {
    expect(route).toContain("errorCode: 'STOCK_MODEL_UNRESOLVED'");
    expect(route).toContain("errorCode: 'NO_COMPATIBLE_MOLD'");
    expect(route).toContain("errorCode: 'NO_AVAILABLE_CAPACITY'");
  });

  it('preserves snake-case and camel-case action length and inlet fields', () => {
    expect(route).toContain('features.action_length || features.actionLength');
    expect(route).toContain('features.action_inlet || features.actionInlet');
    expect(route).toContain('specifications.action_length || specifications.actionLength');
    expect(route).toContain('specifications.action_inlet || specifications.actionInlet');
  });

  it('replaces only matching schedule rows so a repeated save is idempotent', () => {
    expect(route).toContain('DELETE FROM layup_schedule');
    expect(route).toContain('WHERE order_id = ANY($1::text[])');
    expect(route).toContain('INSERT INTO layup_schedule');
  });

  it('maps eligible regular orders from the production pg QueryResult rows', () => {
    const saveStart = route.indexOf("router.post('/save'");
    const saveRoute = route.slice(saveStart, route.indexOf("router.get('/current-week'", saveStart));

    expect(saveRoute).toContain('const eligibleResult = await client.query<{ order_id: string }>');
    expect(saveRoute).toContain('eligibleResult.rows.map(row => row.order_id)');
    expect(saveRoute).not.toContain('eligibleRows.map');
    expect(saveRoute).not.toContain(') as any[]');
  });
});
