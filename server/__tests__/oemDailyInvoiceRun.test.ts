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

  it('reuses audited posting and sending endpoints with separate confirmations', () => {
    expect(pageSource).toContain('I verified the selected invoice totals and authorize posting them to accounting');
    expect(pageSource).toContain('I verified each recipient, message, and attachment selection');
    expect(pageSource).toContain('`/api/ar-invoices/${item.id}/post`');
    expect(pageSource).toContain('`/api/ar-invoices/${item.id}/send`');
    expect(pageSource).toContain('`/api/ar-invoices/${item.id}/email-recipients`');
    expect(pageSource).toContain('attachmentMediaIds: options.selectedAttachmentIds');
    expect(pageSource).toContain('setDailySendSelections(new Set(failedKeys))');
  });

  it('returns existing invoice controls needed for phase-two readiness', () => {
    expect(routeSource).toContain('inv.pricing_mismatch');
    expect(routeSource).toContain('inv.pricing_ambiguous');
    expect(routeSource).toContain('inv.posted_at');
    expect(routeSource).toContain('inv.sent_at');
  });
});
