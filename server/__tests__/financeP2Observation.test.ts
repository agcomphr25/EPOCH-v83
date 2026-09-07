import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { evaluateP2ArCandidate } from '../src/services/financeP2CandidatePolicy';
import { runMigrationSafetyCheck } from '../utils/migrationSafetyCheck';

const root = path.resolve(import.meta.dirname, '../..');
const read = (...parts: string[]) =>
  fs.readFileSync(path.join(root, ...parts), 'utf8');

function cleanInput() {
  return {
    packingSlipStatus: 'SHIPPED',
    shipDate: '2099-01-15',
    customerId: 'P2-CUSTOMER',
    poNumber: 'PO-1',
    paymentTerms: 'NET_30',
    billingContact: 'billing@example.com',
    billingContactDesignated: true,
    shippedQuantity: 10,
    billableQuantity: 10,
    lineCount: 1,
    pricingComplete: true,
    existingInvoiceCount: 0,
    isNoChargeReplacement: false,
  };
}

describe('real P2 Finance Operations observation', () => {
  it('shares a zero-tolerance deterministic candidate policy', () => {
    expect(evaluateP2ArCandidate(cleanInput())).toMatchObject({
      status: 'CLEAN',
      eligibleForDraftPreparation: true,
      blockers: [],
    });
    expect(
      evaluateP2ArCandidate({
        ...cleanInput(),
        billingContactDesignated: false,
      }).blockers
    ).toContain(
      'Available customer email is not explicitly designated for billing.'
    );
  });

  it('uses SELECT-only observation and cannot call invoice creation', () => {
    const service = read(
      'server',
      'src',
      'services',
      'financeP2Observation.service.ts'
    );
    expect(service).toContain("mode: 'OBSERVE_ONLY'");
    expect(service).toContain('productionWrites: false');
    expect(service).not.toContain('createInvoiceFromPackingSlip');
    expect(service).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE)\b/i
    );
  });

  it('adds a safe shared P1/P2 recipient model', () => {
    const migrationPath = path.join(
      root,
      'migrations',
      '0327_finance_billing_recipients.sql'
    );
    const migration = fs.readFileSync(migrationPath, 'utf8');
    expect(() =>
      runMigrationSafetyCheck(migration, migrationPath)
    ).not.toThrow();
    expect(migration).toContain("customer_scope IN ('P1', 'P2')");
    expect(migration).toContain("delivery_role IN ('TO', 'CC')");
    expect(migration).not.toMatch(/DELETE\s+FROM|DROP\s+TABLE|TRUNCATE/i);
  });

  it('requires reasons and records recipient changes in the finance ledger', () => {
    const route = read('server', 'src', 'routes', 'financeOperations.ts');
    const service = read(
      'server',
      'src',
      'services',
      'financeBillingRecipients.service.ts'
    );
    expect(route).toContain('changeReason: z.string().trim().min(3)');
    expect(route).not.toContain("router.delete('/billing-recipients");
    expect(service).toContain("'FINANCE_BILLING_RECIPIENT_CREATED'");
    expect(service).toContain("'FINANCE_BILLING_RECIPIENT_DEACTIVATED'");
    expect(service).toContain('recordFinanceDecision');
  });

  it('mounts separate observation and recipient-management pages', () => {
    const app = read('client', 'src', 'App.tsx');
    expect(app).toContain('path="/finance/p2-observation"');
    expect(app).toContain('path="/finance/billing-recipients"');
  });
});
