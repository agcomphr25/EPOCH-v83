import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('weekly cutting queue P2 demand lifecycle', () => {
  const routeSource = readFileSync(
    join(process.cwd(), 'server/src/routes/cuttingTable.ts'),
    'utf8'
  );

  it('excludes demand whose parent P2 purchase order is finished', () => {
    expect(routeSource).toMatch(
      /COALESCE\(UPPER\(p2\.status\), ''\) NOT IN \(\s*'CLOSED', 'COMPLETE', 'COMPLETED', 'SHIPPED', 'CANCELLED', 'CANCELED'\s*\)/
    );
  });

  it('reconciles shipment evidence across the complete PO revision family', () => {
    expect(routeSource).toMatch(
      /COALESCE\(family\.parent_po_id, family\.id\)\s*= COALESCE\(requested\.parent_po_id, requested\.id\)/
    );
    expect(routeSource).toMatch(
      /P2_SHIPPED_SERIALIZED_ITEM_MEMBERSHIP_SQL[\s\S]*\[shipmentEvidencePoIds\]/
    );
  });
});
