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

  it('updates only submitted PO unit order IDs, never the entire PO', () => {
    expect(route).toContain('const selectedPOOrderIds = new Set<string>()');
    expect(route).toContain('WHERE order_id = ANY($1::text[])');
    expect(route).toContain('[Array.from(selectedPOOrderIds)]');
    expect(route).not.toContain('WHERE po_number = ANY($1::text[])');
  });
});
