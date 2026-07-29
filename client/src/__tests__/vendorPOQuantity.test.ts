import { describe, expect, it } from 'vitest';
import { parseVendorPOQuantity } from '@/lib/vendorPOQuantity';

describe('parseVendorPOQuantity', () => {
  it('preserves decimal quantities', () => {
    expect(parseVendorPOQuantity('26.65')).toBe(26.65);
    expect(parseVendorPOQuantity('0.125')).toBe(0.125);
  });

  it('accepts whole quantities without forcing all quantities to integers', () => {
    expect(parseVendorPOQuantity('266')).toBe(266);
    expect(parseVendorPOQuantity(12)).toBe(12);
  });

  it('rejects blank, zero, negative, and invalid quantities', () => {
    expect(parseVendorPOQuantity('')).toBeNull();
    expect(parseVendorPOQuantity('0')).toBeNull();
    expect(parseVendorPOQuantity('-1')).toBeNull();
    expect(parseVendorPOQuantity('not-a-number')).toBeNull();
  });
});
