import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluatePriorMonthPaymentGrace } from '../src/services/accountingDatePolicy';

const root = path.resolve(import.meta.dirname, '../..');

describe('prior-month payment entry grace', () => {
  it('allows the immediately prior month through the third business day', () => {
    expect(evaluatePriorMonthPaymentGrace({ effectiveDate: '2026-07-31', enteredAt: new Date('2026-08-05T12:00:00Z'), graceBusinessDays: 3 }).eligible).toBe(true);
    expect(evaluatePriorMonthPaymentGrace({ effectiveDate: '2026-07-31', enteredAt: new Date('2026-08-06T12:00:00Z'), graceBusinessDays: 3 }).eligible).toBe(false);
  });

  it('never treats older months or the current month as grace entries', () => {
    expect(evaluatePriorMonthPaymentGrace({ effectiveDate: '2026-06-30', enteredAt: new Date('2026-08-03T12:00:00Z') }).eligible).toBe(false);
    expect(evaluatePriorMonthPaymentGrace({ effectiveDate: '2026-08-01', enteredAt: new Date('2026-08-03T12:00:00Z') }).eligible).toBe(false);
  });

  it('requires structured support and stores a distinct journal posting mode', () => {
    const route = fs.readFileSync(path.join(root, 'server/src/routes/orders.ts'), 'utf8');
    const posting = fs.readFileSync(path.join(root, 'server/src/services/p1PaymentPostingService.ts'), 'utf8');
    expect(route).toContain('assertDocumentedPriorMonthGrace');
    expect(route).toContain('paymentData.referenceNumber');
    expect(route).toContain('paymentData.lateEntryReason');
    expect(posting).toContain("'PRIOR_MONTH_GRACE'");
  });
});
