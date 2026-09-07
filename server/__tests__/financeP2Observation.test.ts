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

  it('adds invoice preferences to ordinary P1/P2 customer contacts', () => {
    const migrationPath = path.join(
      root,
      'migrations',
      '0328_customer_invoice_contact_preferences.sql'
    );
    const migration = fs.readFileSync(migrationPath, 'utf8');
    expect(() =>
      runMigrationSafetyCheck(migration, migrationPath)
    ).not.toThrow();
    expect(migration).toContain('ALTER TABLE customer_contacts');
    expect(migration).toContain('ALTER TABLE p2_customer_contacts');
    expect(migration).toContain("invoice_delivery_role IN ('TO', 'CC')");
    expect(migration).not.toMatch(/DELETE\s+FROM|DROP\s+TABLE|TRUNCATE/i);
  });

  it('uses customer profiles rather than a pilot-only recipient API', () => {
    const route = read('server', 'src', 'routes', 'financeOperations.ts');
    const observer = read(
      'server',
      'src',
      'services',
      'financeP2Observation.service.ts'
    );
    expect(route).not.toContain("'/billing-recipients'");
    expect(observer).toContain('FROM p2_customer_contacts');
    expect(observer).not.toContain('FROM finance_billing_recipients');
  });

  it('keeps observation separate but removes recipient management from finance', () => {
    const app = read('client', 'src', 'App.tsx');
    expect(app).toContain('path="/finance/p2-observation"');
    expect(app).not.toContain('path="/finance/billing-recipients"');
  });

  it('uses all designated customer contacts when an invoice is prepared for email', () => {
    const route = read('server', 'src', 'routes', 'arInvoices.ts');
    const invoicePage = read('client', 'src', 'pages', 'InvoiceDetailPage.tsx');
    expect(route).toContain('eq(customerContacts.receivesInvoices, true)');
    expect(route).toContain('eq(p2CustomerContacts.receivesInvoices, true)');
    expect(route).toContain('deliveryRole: customerContacts.invoiceDeliveryRole');
    expect(route).toContain('deliveryRole: p2CustomerContacts.invoiceDeliveryRole');
    expect(invoicePage).toContain(
      'setSelectedRecipients(recipients.map((recipient) => recipient.email))'
    );
  });
});
