import { describe, expect, it } from 'vitest';
import {
  inventoryBalanceIneligibilityReason,
  isInventoryBalanceEligible,
} from '../../shared/inventoryBalanceEligibility';

describe('inventory balance eligibility', () => {
  it('keeps ordinary purchased and manufactured inventory eligible', () => {
    expect(isInventoryBalanceEligible({ type: 'Purchased' })).toBe(true);
    expect(isInventoryBalanceEligible({ type: 'Manufactured' })).toBe(true);
  });

  it('keeps Customer-Supplied custody eligible and distinct from Non-Inventory', () => {
    expect(isInventoryBalanceEligible({ utilizedInCustomerSupplied: true })).toBe(true);
    expect(inventoryBalanceIneligibilityReason({ utilizedInCustomerSupplied: true })).toBeNull();
  });

  it('makes Non-Inventory ineligible for balances, reservations, and allocations', () => {
    const item = { utilizedInNonInventory: true };
    expect(isInventoryBalanceEligible(item)).toBe(false);
    expect(inventoryBalanceIneligibilityReason(item)).toBe('NON_INVENTORY');
  });

  it('preserves the existing Service no-balance rule', () => {
    expect(isInventoryBalanceEligible({ utilizedInServices: true })).toBe(false);
    expect(isInventoryBalanceEligible({ type: 'Service' })).toBe(false);
    expect(inventoryBalanceIneligibilityReason({ type: 'services' })).toBe('SERVICE');
  });

  it('fails closed when the inventory item does not exist', () => {
    expect(isInventoryBalanceEligible(undefined)).toBe(false);
    expect(inventoryBalanceIneligibilityReason(undefined)).toBe('ITEM_NOT_FOUND');
  });
});
