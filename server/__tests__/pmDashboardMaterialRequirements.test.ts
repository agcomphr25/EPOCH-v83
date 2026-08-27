import { readFileSync } from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const routeSource = readFileSync(
  path.join(process.cwd(), 'server/src/routes/pmDashboard.ts'),
  'utf8',
);
const pageSource = readFileSync(
  path.join(process.cwd(), 'client/src/pages/PMControlCenterPage.tsx'),
  'utf8',
);

describe('PM dashboard material requirements', () => {
  it('extends BOM quantity-per by the project work-order quantity', () => {
    expect(routeSource).toContain('SUM(wo.quantity::numeric * bl.qty_per::numeric)');
    expect(routeSource).toContain('SUM(wo.quantity::numeric * bi.quantity::numeric)');
  });

  it('uses released Robust BOM revisions before the legacy P2 BOM fallback', () => {
    expect(routeSource).toContain('br.is_released = true');
    expect(routeSource).toContain('NOT EXISTS (');
  });

  it('uses recursive launched demand, including fractional child usage, when available', () => {
    expect(routeSource).toContain('SUM(d.gross_required_quantity::numeric)');
    expect(routeSource).toContain("d.disposition = 'BUY'");
    expect(routeSource).toContain("pl.status = 'COMPLETE'");
    expect(routeSource).toContain('SUM(wo.quantity::numeric * bl.qty_per::numeric)');
    expect(pageSource).toContain('const requestQuantity = Math.ceil(shortage)');
  });

  it('returns and displays inventory on-hand quantity', () => {
    expect(routeSource).toContain('SUM(quantity_on_hand)::numeric AS qty_on_hand');
    expect(routeSource).toContain('AS "qtyOnHand"');
    expect(pageSource).toContain('On Hand <SortIcon field="qtyOnHand" />');
  });

  it('returns lead time and exposes expandable request selection details', () => {
    expect(routeSource).toContain('ii.lead_time_days AS "leadTimeDays"');
    expect(pageSource).toContain('Uncovered demand');
    expect(pageSource).toContain('row.leadTimeDays == null');
    expect(pageSource).toContain('Create parts request for ${shortage}');
    expect(pageSource).toContain("apiRequest('/api/inventory/parts-requests'");
  });
});
