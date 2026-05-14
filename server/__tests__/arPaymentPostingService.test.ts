import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('arPaymentPostingService', () => {
  const source = readFileSync(
    join(process.cwd(), 'server/src/services/arPaymentPostingService.ts'),
    'utf8',
  );

  it('posts modern AR payments through the UUID journal reference path', () => {
    expect(source).toContain("transactionType: 'AR_PAYMENT'");
    expect(source).toContain("referenceType: 'ar_payment'");
    expect(source).toContain('referenceId: 0');
    expect(source).toContain('referenceUuid: paymentId');
  });

  it('uses customer payment clearing and accounts receivable as the first cash-receipt posting policy', () => {
    expect(source).toContain("getRequiredAccount(tx, '10300', 'Customer Payment Clearing')");
    expect(source).toContain("getRequiredAccount(tx, '11000', 'Accounts Receivable')");
    expect(source).toContain('accountId: customerPaymentClearing.id');
    expect(source).toContain('accountId: accountsReceivable.id');
  });

  it('creates posted reversal entries instead of deleting payment accounting history on void', () => {
    expect(source).toContain("transactionType: 'AR_PAYMENT_REVERSAL'");
    expect(source).toContain("postingMode: 'REVERSAL'");
    expect(source).toContain('reversalOfJournalEntryId: originalEntry.id');
    expect(source).toContain('debitAmount: Number(line.creditAmount ?? 0)');
    expect(source).toContain('creditAmount: Number(line.debitAmount ?? 0)');
  });
});
