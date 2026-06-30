import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('accountingPostingService', () => {
  const source = readFileSync(
    join(process.cwd(), 'server/src/services/accountingPostingService.ts'),
    'utf8',
  );

  it('defines a shared balanced posting boundary for future accounting modules', () => {
    expect(source).toContain('export async function createOrReplaceAccountingPosting');
    expect(source).toContain('export function validateBalancedPosting');
    expect(source).toContain('Accounting posting is imbalanced');
    expect(source).toContain('Accounting posting total must be positive');
  });

  it('requires stable source references and accounting period checks before writes', () => {
    expect(source).toContain('Accounting posting requires referenceId or referenceUuid');
    expect(source).toContain('assertPostingAllowedForPeriod({ effectiveDate, user: actor, postingMode })');
    expect(source).toContain("postingMode = input.postingMode ?? 'STANDARD'");
  });

  it('blocks mutation of exported or posted entries through the replacement path', () => {
    expect(source).toContain("existingEntry?.status === 'EXPORTED'");
    expect(source).toContain("existingEntry?.status === 'POSTED' && postingMode !== 'REVERSAL'");
    expect(source).toContain('cannot be replaced outside a reversal flow');
  });

  it('centralizes account lookup by account number with account-name fallback', () => {
    expect(source).toContain('export async function getRequiredAccountingAccount');
    expect(source).toContain('eq(chartOfAccounts.accountNumber, accountNumber)');
    expect(source).toContain('eq(chartOfAccounts.accountName, accountName)');
  });

  it('supports standardized reversal line construction without deleting accounting history', () => {
    expect(source).toContain('export function buildReversalLines');
    expect(source).toContain('debitAmount: money(line.creditAmount)');
    expect(source).toContain('creditAmount: money(line.debitAmount)');
  });
});
