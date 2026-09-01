import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const managerSource = readFileSync(
  new URL('../components/inventory/VendorPOManager.tsx', import.meta.url),
  'utf8'
);
const routeSource = readFileSync(
  new URL('../../../server/src/routes/vendorPOs.ts', import.meta.url),
  'utf8'
);
const storageSource = readFileSync(
  new URL('../../../server/storage.ts', import.meta.url),
  'utf8'
);

describe('vendor PO archive classification', () => {
  it('keeps cancelled and voided statuses out of the Fulfilled tab', () => {
    expect(managerSource).toContain(
      "const CLOSED_STATUSES = ['Declined', 'Expired', 'Fully Received'];"
    );
  });

  it('includes cancelled and voided records in archive lists and counts', () => {
    expect(storageSource).toContain(
      "inArray(vendorPOs.status, ['Cancelled', 'Voided'])"
    );
    expect(storageSource).toContain(
      "notInArray(vendorPOs.status, ['Cancelled', 'Voided'])"
    );
    expect(routeSource).toContain(
      "archived = true OR status IN ('Cancelled','Voided')"
    );
  });
});
