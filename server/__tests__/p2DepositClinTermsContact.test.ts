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

  it('stores distinct PO line and optional CLIN snapshots on independent invoice lines', () => {
    const service = read('server/src/services/p2ProjectDepositService.ts');
    expect(service).toContain("calculationMethod: 'FIXED_AMOUNT' | 'PERCENTAGE'");
    expect(service).toContain('poLineNumber: allocation.clin.poLineNumber');
    expect(service).toContain('clinNumber: allocation.customerClin?.trim() || allocation.clin.customerClin || null');
    expect(service).toContain('contractLineValue: allocation.contractLineValue ?? null');
    expect(service).toContain('Each PO line may only appear once');
  });

  it('derives deposit CLIN choices and values from the linked customer PO', () => {
    const service = read('server/src/services/p2ProjectDepositService.ts');
    const component = read('client/src/components/p2/P2ProjectDepositsCard.tsx');
    expect(service).toContain('FROM p2_billing_allocations');
    expect(service).toContain('FROM p2_purchase_order_items');
    expect(service).toContain('quantity::numeric * unit_price::numeric');
    expect(service).toContain("NULLIF(BTRIM(customer_po_line), '')");
    expect(service).toContain('onConflictDoUpdate');
    expect(service).toContain('clin.contractLineValue ?? allocation.contractLineValue');
    expect(component).toContain('updateAllocationClin');
    expect(component).toContain('PO Line *');
    expect(component).toContain('CLIN / SLIN (optional)');
    expect(component).toContain('Full PO line value');
    expect(component).toContain('Quantity × unit price from the selected PO line.');
  });

  it('adds an optional customer CLIN field without conflating it with the PO line', () => {
    const migration = read('migrations/0290_p2_po_line_and_clin_distinction.sql');
    const boot = read('server/scripts/migrations/runSafeBootMigrations.ts');
    const schema = read('server/schema.ts');
    expect(() => runMigrationSafetyCheck(migration, '0290_p2_po_line_and_clin_distinction.sql')).not.toThrow();
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS customer_clin');
    expect(schema).toContain("customerPoLine: text('customer_po_line')");
    expect(schema).toContain("customerClin: text('customer_clin')");
    expect(boot).toContain("'0290_p2_po_line_and_clin_distinction.sql'");
  });

  it('installs the audited PO00021498 line-number correction at boot', () => {
    const migration = read('migrations/0289_correct_po00021498_customer_line_numbers.sql');
    const boot = read('server/scripts/migrations/runSafeBootMigrations.ts');
    expect(() => runMigrationSafetyCheck(migration, '0289_correct_po00021498_customer_line_numbers.sql')).not.toThrow();
    expect(migration).toContain("po.po_number = 'PO00021498'");
    expect(migration).toContain("AG-PRIV-01%' THEN '1'");
    expect(migration).toContain("AG-LAUN-01%' THEN '2'");
    expect(migration).toContain('INSERT INTO schema_change_log');
    expect(migration).toContain("'OVERRIDE'");
    expect(boot).toContain("'0289_correct_po00021498_customer_line_numbers.sql'");
  });

  it('supports a PO linked from the PO side when projects.po_id is empty', () => {
    const service = read('server/src/services/p2ProjectDepositService.ts');
    expect(service).toContain('po.project_id = ${projectId}::uuid');
    expect(service).toContain('po.is_current_revision DESC');
    expect(service).toContain('poId: effectivePo?.id ?? storedProject.poId');
  });

  it('renders the point of contact and separate PO Line and CLIN references on the customer PDF', () => {
    const pdf = read('server/utils/pdf/arInvoicePdf.ts');
    const component = read('client/src/components/p2/P2ProjectDepositsCard.tsx');
    expect(pdf).toContain("'ACCOUNTING POINT OF CONTACT'");
    expect(component).toContain('Accounting Point of Contact');
    expect(pdf).toContain("isMaterialDeposit ? 'PO Line' : 'Part #'");
    expect(pdf).toContain("'CLIN / SLIN'");
    expect(pdf).toContain('line.dimensionTags?.poLineNumber');
    expect(pdf).toContain('line.dimensionTags?.clinNumber');
    expect(pdf).toContain("line.dimensionTags?.clinNumber || '-'");
  });
});
