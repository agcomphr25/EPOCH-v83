import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('vendor PO void control', () => {
  const routeSource = readFileSync(join(process.cwd(), 'server/src/routes/vendorPOs.ts'), 'utf8');
  const schemaSource = readFileSync(join(process.cwd(), 'server/schema.ts'), 'utf8');
  const clientSource = readFileSync(
    join(process.cwd(), 'client/src/components/inventory/VendorPOManager.tsx'),
    'utf8',
  );

  it('retains POs through a dedicated void endpoint and retires hard deletion', () => {
    expect(routeSource).toContain("router.post('/:id/void'");
    expect(routeSource).toContain("status: 'Voided'");
    expect(routeSource).toContain("'VENDOR_PO_VOIDED'");
    expect(routeSource).not.toContain('await storage.deleteVendorPO(id)');
    expect(routeSource).toContain('Vendor POs are voided, not deleted');
  });

  it('stores void attribution and requires voided records to remain closed', () => {
    expect(schemaSource).toContain("voidedAt: timestamp('voided_at')");
    expect(schemaSource).toContain("voidedBy: text('voided_by')");
    expect(schemaSource).toContain("voidReason: text('void_reason')");
    expect(routeSource).toContain('Cannot receive against a voided vendor PO');
    expect(routeSource).toContain("'Declined','Expired','Cancelled','Voided','Fully Received'");
  });

  it('presents Void rather than Delete in the vendor PO workflow', () => {
    expect(clientSource).toContain("apiRequest(`/api/vendor-pos/${id}/void`");
    expect(clientSource).toContain("method: 'POST'");
    expect(clientSource).toContain('Void PO');
    expect(clientSource).not.toContain('This permanently deletes the vendor purchase order');
  });
});
