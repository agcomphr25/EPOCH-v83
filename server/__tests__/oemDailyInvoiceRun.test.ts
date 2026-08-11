import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('OEM daily invoice preparation workflow', () => {
  const routeSource = readFileSync(
    join(process.cwd(), 'server/src/routes/poShippingQC.ts'),
    'utf8',
  );
  const pageSource = readFileSync(
    join(process.cwd(), 'client/src/pages/OEMShipmentsPage.tsx'),
    'utf8',
  );

  it('builds a date-wide Central-time readiness snapshot without creating invoices', () => {
    expect(routeSource).toContain("'/oem-shipments/invoice-runs/preview'");
    expect(routeSource).toContain("AT TIME ZONE 'America/Chicago'");
    expect(routeSource).toContain("BOOL_OR(si.packing_slip_base64 IS NOT NULL)");
    expect(routeSource).toContain("blockers.push('Packing slip is missing')");
    expect(routeSource).toContain("blockers.push('One or more lines are missing unit pricing')");
  });

  it('keeps creation selective, review-only, and explicit about not emailing', () => {
    expect(pageSource).toContain('Prepare Daily Invoices');
    expect(pageSource).toContain('Create Selected Drafts');
    expect(pageSource).toContain('Nothing was posted or emailed');
    expect(pageSource).toContain('I reviewed the selected POs, invoice dates, line items, pricing, and totals');
    expect(pageSource).toContain("status: 'REVIEW'");
    expect(pageSource).toContain('for (const item of items)');
  });
});
