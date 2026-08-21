import { readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import { insertVendorSchema } from '../schema';

describe('vendor active status', () => {
  it('defaults new vendors to active and accepts an inactive vendor', () => {
    expect(insertVendorSchema.parse({ name: 'New Vendor' }).isActive).toBe(
      true
    );
    expect(
      insertVendorSchema.parse({ name: 'Inactive Vendor', isActive: false })
        .isActive
    ).toBe(false);
  });

  it('exposes the status in the vendor editor and vendor list', () => {
    const source = readFileSync(
      join(process.cwd(), 'client', 'src', 'pages', 'VendorManagement.tsx'),
      'utf8'
    );

    expect(source).toContain('data-testid="select-vendor-status"');
    expect(source).toContain('data-testid="header-vendor-status"');
    expect(source).toContain('data-testid={`text-vendor-status-${vendor.id}`}');
    expect(source).toContain(
      "vendor.isActive !== false ? 'Active' : 'Inactive'"
    );
  });
});
