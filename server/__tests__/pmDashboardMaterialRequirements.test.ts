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
    expect(routeSource).toContain('SUM(wo.quantity::numeric * bl.qty_per)');
    expect(routeSource).toContain('SUM(wo.quantity::numeric * bi.quantity::numeric)');
  });

  it('uses released Robust BOM revisions before the legacy P2 BOM fallback', () => {
    expect(routeSource).toContain('br.is_released = true');
    expect(routeSource).toContain('NOT EXISTS (');
  });

  it('returns and displays inventory on-hand quantity', () => {
    expect(routeSource).toContain('SUM(quantity_on_hand)::numeric AS qty_on_hand');
    expect(routeSource).toContain('AS "qtyOnHand"');
    expect(pageSource).toContain('On Hand <SortIcon field="qtyOnHand" />');
  });
});
