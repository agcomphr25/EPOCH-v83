import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const page = fs.readFileSync(
  path.join(process.cwd(), 'client/src/pages/ConsolidatedNeedsListPage.tsx'),
  'utf8'
);
const route = fs.readFileSync(
  path.join(process.cwd(), 'server/src/routes/inventory.ts'),
  'utf8'
);

describe('consolidated needs approval workflow', () => {
  it('keeps single-line approval one click while using the governed request endpoint', () => {
    const approvalMutation = page.slice(
      page.indexOf('const approveRequestsMutation'),
      page.indexOf('// Bulk update mutation')
    );

    expect(approvalMutation).toContain(
      '/api/inventory/parts-requests/${request.id}'
    );
    expect(approvalMutation).toContain("status: 'APPROVED'");
    expect(approvalMutation).not.toContain('/parts-requests/bulk');
    expect(page).toContain('onClick={() => approveRequests([request])}');
  });

  it('shows exact request dates instead of relative month-age labels', () => {
    expect(page).toContain('const formatRequestedOn');
    expect(page).toContain('`Requested ${formatRequestedOn(requestDate)}`');
    expect(page).not.toContain('return `${Math.floor(days / 30)}mo`');
    expect(page).toContain('label="First requested"');
  });

  it('sorts invalid or missing request dates last', () => {
    expect(page).toContain('Number.POSITIVE_INFINITY');
    expect(page).toContain(
      'requestTimestamp(a.requestDate) - requestTimestamp(b.requestDate)'
    );
  });

  it('allows the literal bulk route to fall through the earlier parameter route', () => {
    const singleRoute = route.slice(
      route.indexOf("router.put('/parts-requests/:id'"),
      route.indexOf("router.delete('/parts-requests/:id'")
    );
    expect(singleRoute).toContain(
      "if (req.params.id === 'bulk') return next()"
    );
  });
});
