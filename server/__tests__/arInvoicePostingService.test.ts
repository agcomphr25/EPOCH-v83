import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('arInvoicePostingService', () => {
  const source = readFileSync(
    join(process.cwd(), 'server/src/services/arInvoicePostingService.ts'),
    'utf8',
  );

  it('posts AR invoices through the shared accounting posting service', () => {
    expect(source).toContain('createOrReplaceAccountingPosting');
    expect(source).toContain("transactionType: 'AR_INVOICE'");
    expect(source).toContain("referenceType: 'ar_invoice'");
    expect(source).toContain("sourceDocumentType: 'AR_INVOICE'");
  });

  it('tags AR invoice journal lines with the classified revenue stream', () => {
    expect(source).toContain('classifyArInvoiceRevenueStream');
    expect(source).toContain('revenueStream: classification.revenueStream');
    expect(source).toContain('revenueRecognitionTiming: classification.recognitionTiming');
    expect(source).toContain('revenuePaymentTerms: classification.paymentTerms');
  });

  it('preserves production-line revenue account mapping', () => {
    expect(source).toContain('resolveRevenueAccountForProductionLine');
    expect(source).toContain('revenueAccountNumber: lineRevenueAccount.accountNumber');
    expect(source).toContain('revenueAccountName: lineRevenueAccount.accountName');
  });

  it('skips zero-value invoice lines so no-op display lines do not block posting', () => {
    expect(source).toContain('const lineCredit = money(line.lineTotal)');
    expect(source).toContain('if (lineCredit <= 0) continue');
    expect(source).toContain('creditAmount: lineCredit');
  });
});
