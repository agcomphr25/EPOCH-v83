import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runMigrationSafetyCheck } from '../utils/migrationSafetyCheck';

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

describe('P2 material deposit CLIN, terms, and contact enhancement', () => {
  it('adds only additive invoice contact columns', () => {
    const migration = read('migrations/0287_p2_deposit_invoice_clin_contact.sql');
    expect(() => runMigrationSafetyCheck(migration, '0287_p2_deposit_invoice_clin_contact.sql')).not.toThrow();
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS point_of_contact_name');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS point_of_contact_phone');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS point_of_contact_email');
    expect(migration).not.toMatch(/\bDROP\b|\bTRUNCATE\b/i);
  });

  it('stores CLIN calculation snapshots on independent invoice lines', () => {
    const service = read('server/src/services/p2ProjectDepositService.ts');
    expect(service).toContain("calculationMethod: 'FIXED_AMOUNT' | 'PERCENTAGE'");
    expect(service).toContain('clinNumber: allocation.clin.clinNumber');
    expect(service).toContain('contractLineValue: allocation.contractLineValue ?? null');
    expect(service).toContain('Each CLIN may only appear once');
  });

  it('derives deposit CLIN choices and values from the linked customer PO', () => {
    const service = read('server/src/services/p2ProjectDepositService.ts');
    const component = read('client/src/components/p2/P2ProjectDepositsCard.tsx');
    expect(service).toContain('FROM p2_billing_allocations');
    expect(service).toContain('FROM p2_purchase_order_items');
    expect(service).toContain('quantity::numeric * unit_price::numeric');
    expect(service).toContain('onConflictDoUpdate');
    expect(service).toContain('clin.contractLineValue ?? allocation.contractLineValue');
    expect(component).toContain('updateAllocationClin');
    expect(component).toContain('Full PO line value');
    expect(component).toContain('Quantity × unit price from the selected PO line.');
  });

  it('supports a PO linked from the PO side when projects.po_id is empty', () => {
    const service = read('server/src/services/p2ProjectDepositService.ts');
    expect(service).toContain('po.project_id = ${projectId}::uuid');
    expect(service).toContain('po.is_current_revision DESC');
    expect(service).toContain('poId: effectivePo?.id ?? storedProject.poId');
  });

  it('renders the point of contact and CLIN reference on the customer PDF', () => {
    const pdf = read('server/utils/pdf/arInvoicePdf.ts');
    expect(pdf).toContain("'POINT OF CONTACT'");
    expect(pdf).toContain("isMaterialDeposit ? 'CLIN' : 'Part #'");
    expect(pdf).toContain('line.dimensionTags?.clinNumber');
    expect(pdf).toContain("line.dimensionTags?.clinNumber || ''");
  });
});
