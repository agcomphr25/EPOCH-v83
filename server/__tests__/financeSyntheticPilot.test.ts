import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/auditLedgerService', () => ({
  canonicalize(value: unknown): string {
    const normalize = (candidate: unknown): unknown => {
      if (Array.isArray(candidate)) return candidate.map(normalize);
      if (candidate && typeof candidate === 'object') {
        const record = candidate as Record<string, unknown>;
        return Object.keys(candidate)
          .sort()
          .reduce<Record<string, unknown>>((result, key) => {
            result[key] = normalize(record[key]);
            return result;
          }, {});
      }
      return candidate;
    };
    return JSON.stringify(normalize(value));
  },
  recordAuditEvent: vi.fn(),
}));

import {
  buildFinanceSyntheticPilotScenario,
  FINANCE_SYNTHETIC_SCENARIO_ID,
  parseFinanceSyntheticVariant,
} from '../src/services/financeSyntheticPilot.service';

describe('SYN-P2-001 Finance Operations pilot', () => {
  it('never reuses the real P1 order FD740', () => {
    expect(FINANCE_SYNTHETIC_SCENARIO_ID).toBe('SYN-P2-001');
    expect(
      JSON.stringify(buildFinanceSyntheticPilotScenario('clean'))
    ).not.toContain('FD740');
  });

  it('produces a clean, read-only, nonpersistent P2 candidate', () => {
    const scenario = buildFinanceSyntheticPilotScenario('clean');
    expect(scenario).toMatchObject({ synthetic: true, persistent: false });
    expect(scenario.candidate).toMatchObject({
      status: 'CLEAN',
      eligibleForDraftPreparation: true,
      revenueStream: 'P2_NET30',
    });
    expect(
      Object.values(scenario.executionControls).every(
        (value) => value === false
      )
    ).toBe(true);
    expect(scenario.candidate.evidence.customerName).toContain('SYNTHETIC');
    expect(scenario.candidate.evidence.billingContact).toContain('.invalid');
  });

  it.each([
    ['missing-contact', 'Designated billing contact is missing.'],
    ['missing-terms', 'Customer payment terms are missing.'],
    ['quantity-mismatch', 'Shipped quantity does not match billable quantity.'],
    ['duplicate-risk', 'A possible duplicate invoice already exists.'],
  ] as const)('blocks the %s exception', (variant, blocker) => {
    const scenario = buildFinanceSyntheticPilotScenario(variant);
    expect(scenario.candidate.status).toBe('BLOCKED');
    expect(scenario.candidate.blockers).toContain(blocker);
  });

  it('revokes simulated approval when source evidence changes', () => {
    const scenario = buildFinanceSyntheticPilotScenario('source-changed');
    expect(scenario.approval.status).toBe('REVOKED');
    expect(scenario.approval.approvedEvidenceHash).not.toBe(
      scenario.approval.currentEvidenceHash
    );
  });

  it('fails unknown variants back to the clean fixture', () => {
    expect(parseFinanceSyntheticVariant('something-else')).toBe('clean');
  });

  it('mounts a pilot-only API and a clearly labeled training page', () => {
    const root = path.resolve(import.meta.dirname, '../..');
    const route = fs.readFileSync(
      path.join(root, 'server/src/routes/financeOperations.ts'),
      'utf8'
    );
    const page = fs.readFileSync(
      path.join(root, 'client/src/pages/FinanceOperationsPilotPage.tsx'),
      'utf8'
    );
    const app = fs.readFileSync(path.join(root, 'client/src/App.tsx'), 'utf8');

    expect(route).toContain(
      'router.use(...requireAdminOrOwner, requireFinancePilotUser)'
    );
    expect(route).toContain("router.get('/pilot-scenarios/syn-p2-001'");
    expect(page).toContain('Training simulation.');
    expect(page).toContain('All writes blocked');
    expect(app).toContain('path="/finance/operations-pilot"');
  });
});
