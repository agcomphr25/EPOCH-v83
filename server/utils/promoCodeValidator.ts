import type { ShortTermSale } from '../schema';

export interface PromoCodeValidationResult {
  isValid: boolean;
  reason?: string;
  promoCode?: ShortTermSale;
  appliedDiscount?: number;
}

export function validatePromoCode(
  promoCode: ShortTermSale | null | undefined,
  currentDate: Date = new Date()
): PromoCodeValidationResult {
  if (!promoCode) {
    return { isValid: false, reason: 'Promo code not found' };
  }

  if (promoCode.overrideActive) {
    return {
      isValid: true,
      promoCode,
      appliedDiscount: promoCode.percent,
      reason: 'Applied via administrative override',
    };
  }

  if (promoCode.isActive !== 1) {
    return { isValid: false, reason: 'Promo code is inactive' };
  }

  const startDate = new Date(promoCode.startDate);
  const endDate = new Date(promoCode.endDate);

  if (currentDate < startDate) {
    return { isValid: false, reason: 'Promo code has not started yet' };
  }

  if (currentDate > endDate) {
    return { isValid: false, reason: 'Promo code has expired' };
  }

  return {
    isValid: true,
    promoCode,
    appliedDiscount: promoCode.percent,
  };
}

export function isPromoCodeExpired(promoCode: ShortTermSale, currentDate: Date = new Date()): boolean {
  const endDate = new Date(promoCode.endDate);
  return currentDate > endDate;
}
