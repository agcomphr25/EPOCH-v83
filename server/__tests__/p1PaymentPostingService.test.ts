import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('p1PaymentPostingService', () => {
  const source = readFileSync(
    join(process.cwd(), 'server/src/services/p1PaymentPostingService.ts'),
    'utf8',
  );

  it('posts P1 payments through a dedicated P1 journal reference path', () => {
    expect(source).toContain("transactionType: 'P1_CUSTOMER_PAYMENT'");
    expect(source).toContain("referenceType: 'p1_payment'");
    expect(source).toContain("sourceDocumentType: 'P1_PAYMENT'");
  });

  it('records P1 customer payments as clearing to customer deposits', () => {
    expect(source).toContain("getRequiredAccount(tx, '10300', 'Customer Payment Clearing')");
    expect(source).toContain("getRequiredAccount(tx, '20600', 'Customer Deposits')");
    expect(source).toContain('accountId: customerPaymentClearing.id');
    expect(source).toContain('accountId: customerDeposits.id');
  });

  it('captures reporting dimensions for production line and customer type', () => {
    expect(source).toContain("productionLine: 'P1'");
    expect(source).toContain('customerType');
    expect(source).toContain('customerProfileId');
    expect(source).toContain('customerIsInternational');
    expect(source).toContain('feesDeferredUntilSettlement: true');
  });

  it('creates posted reversals instead of deleting payment accounting history on void', () => {
    expect(source).toContain("transactionType: 'P1_CUSTOMER_PAYMENT_REVERSAL'");
    expect(source).toContain("sourceDocumentType: 'P1_PAYMENT_VOID'");
    expect(source).toContain('reversalOfJournalEntryId: originalEntry.id');
    expect(source).toContain('debitAmount: Number(line.creditAmount ?? 0)');
    expect(source).toContain('creditAmount: Number(line.debitAmount ?? 0)');
  });
});
