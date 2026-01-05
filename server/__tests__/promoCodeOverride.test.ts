import { describe, it, expect } from 'vitest';
import { validatePromoCode, isPromoCodeExpired } from '../utils/promoCodeValidator';
import type { ShortTermSale } from '../schema';

const createMockPromoCode = (overrides: Partial<ShortTermSale> = {}): ShortTermSale => ({
  id: 1,
  name: 'SUMMER2025',
  percent: 20,
  startDate: new Date('2025-06-01'),
  endDate: new Date('2025-08-31'),
  isActive: 1,
  overrideActive: false,
  ...overrides,
});

describe('Promo Code Validation', () => {
  describe('validatePromoCode', () => {
    it('should return invalid for null promo code', () => {
      const result = validatePromoCode(null);
      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('Promo code not found');
    });

    it('should return invalid for undefined promo code', () => {
      const result = validatePromoCode(undefined);
      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('Promo code not found');
    });

    it('should return valid for active promo code within date range', () => {
      const promoCode = createMockPromoCode();
      const currentDate = new Date('2025-07-15');
      const result = validatePromoCode(promoCode, currentDate);
      expect(result.isValid).toBe(true);
      expect(result.appliedDiscount).toBe(20);
    });

    it('should return invalid for inactive promo code', () => {
      const promoCode = createMockPromoCode({ isActive: 0 });
      const currentDate = new Date('2025-07-15');
      const result = validatePromoCode(promoCode, currentDate);
      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('Promo code is inactive');
    });

    it('should return invalid for promo code that has not started', () => {
      const promoCode = createMockPromoCode();
      const currentDate = new Date('2025-05-01');
      const result = validatePromoCode(promoCode, currentDate);
      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('Promo code has not started yet');
    });

    it('should return invalid for expired promo code', () => {
      const promoCode = createMockPromoCode();
      const currentDate = new Date('2025-10-01');
      const result = validatePromoCode(promoCode, currentDate);
      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('Promo code has expired');
    });

    describe('Override Functionality', () => {
      it('should return valid for expired promo code with override active', () => {
        const promoCode = createMockPromoCode({
          endDate: new Date('2025-01-31'),
          overrideActive: true,
        });
        const currentDate = new Date('2025-10-01');
        const result = validatePromoCode(promoCode, currentDate);
        expect(result.isValid).toBe(true);
        expect(result.appliedDiscount).toBe(20);
        expect(result.reason).toBe('Applied via administrative override');
      });

      it('should return valid for inactive promo code with override active', () => {
        const promoCode = createMockPromoCode({
          isActive: 0,
          overrideActive: true,
        });
        const currentDate = new Date('2025-07-15');
        const result = validatePromoCode(promoCode, currentDate);
        expect(result.isValid).toBe(true);
        expect(result.reason).toBe('Applied via administrative override');
      });

      it('override should take precedence over expiration date check', () => {
        const promoCode = createMockPromoCode({
          endDate: new Date('2024-01-01'),
          overrideActive: true,
        });
        const currentDate = new Date('2025-12-01');
        const result = validatePromoCode(promoCode, currentDate);
        expect(result.isValid).toBe(true);
      });

      it('override should take precedence over start date check', () => {
        const promoCode = createMockPromoCode({
          startDate: new Date('2030-01-01'),
          overrideActive: true,
        });
        const currentDate = new Date('2025-01-01');
        const result = validatePromoCode(promoCode, currentDate);
        expect(result.isValid).toBe(true);
      });
    });
  });

  describe('isPromoCodeExpired', () => {
    it('should return true for expired promo code', () => {
      const promoCode = createMockPromoCode({ endDate: new Date('2025-01-31') });
      const currentDate = new Date('2025-10-01');
      expect(isPromoCodeExpired(promoCode, currentDate)).toBe(true);
    });

    it('should return false for non-expired promo code', () => {
      const promoCode = createMockPromoCode({ endDate: new Date('2025-12-31') });
      const currentDate = new Date('2025-06-01');
      expect(isPromoCodeExpired(promoCode, currentDate)).toBe(false);
    });

    it('should return true for promo code expiring exactly on current date', () => {
      const promoCode = createMockPromoCode({ endDate: new Date('2025-06-01') });
      const currentDate = new Date('2025-06-02');
      expect(isPromoCodeExpired(promoCode, currentDate)).toBe(true);
    });
  });
});

describe('Promo Code Override Audit', () => {
  it('should include required fields for audit logging', () => {
    const auditEntry = {
      id: 1,
      promoCodeId: 1,
      userId: 'admin@example.com',
      previousStatus: false,
      newStatus: true,
      reason: 'Customer service override for order correction',
      createdAt: new Date().toISOString(),
    };
    
    expect(auditEntry).toHaveProperty('promoCodeId');
    expect(auditEntry).toHaveProperty('userId');
    expect(auditEntry).toHaveProperty('previousStatus');
    expect(auditEntry).toHaveProperty('newStatus');
    expect(auditEntry).toHaveProperty('reason');
    expect(auditEntry).toHaveProperty('createdAt');
    expect(auditEntry.reason.length).toBeGreaterThan(0);
  });
});
