// src/utils/discountUtils.ts

export interface PersistentDiscount {
  type: string;
  amount: number;
}

export interface ShortTermSale {
  name: string;
  percent: number;
  startDate: string;
  endDate: string;
  appliesTo?: string; // "total" or "stock_model"
}

export interface DiscountBreakdown {
  type: string;
  amount: number;
}

export interface FinalPriceResult {
  finalPrice: number;
  breakdown: DiscountBreakdown[];
}

/**
 * Returns array of persistent discounts.
 */
export function getPersistentDiscount(customerType: string, isMilLeo: boolean): PersistentDiscount[] {
  const results: PersistentDiscount[] = [];

  switch (customerType) {
    case 'AGR–Gunbuilder':
      results.push({ type: 'Gunbuilder', amount: 0.20 });
      break;
    case 'AGR–Individual':
      results.push({ type: 'Industry', amount: 0.10 });
      if (isMilLeo) {
        results.push({ type: 'MIL/LEO', amount: 50 });
      }
      break;
    case 'OEM':
    case 'Distributor':
      // no discount
      break;
    default:
      throw new Error(`Unknown customer type: ${customerType}`);
  }

  return results;
}

/**
 * Filters and returns active short-term % discounts for a given date.
 */
export function getActiveShortTermDiscounts(date: Date, sales: ShortTermSale[]): { name: string; percent: number; appliesTo?: string }[] {
  const ts = date.getTime();
  return sales
    .filter(sale => {
      const start = new Date(sale.startDate).getTime();
      const end = new Date(sale.endDate).getTime();
      return start <= ts && ts <= end;
    })
    .map(sale => ({ name: sale.name, percent: sale.percent, appliesTo: sale.appliesTo }));
}

/**
 * Calculates final price with breakdown for all discounts.
 */
export function calculateFinalPrice(
  basePrice: number,
  customerType: string,
  isMilLeo: boolean,
  date: Date,
  shortTermSales: ShortTermSale[],
  featureCost: number = 0
): FinalPriceResult {
  let price = basePrice;
  const breakdown: DiscountBreakdown[] = [];

  // Persistent %
  const persistent = getPersistentDiscount(customerType, isMilLeo);
  persistent.forEach(d => {
    if (d.type !== 'MIL/LEO') {
      const amt = price * d.amount;
      price -= amt;
      breakdown.push({ type: d.type, amount: amt });
    }
  });

  // MIL/LEO flat
  persistent.forEach(d => {
    if (d.type === 'MIL/LEO') {
      const amt = d.amount;
      price -= amt;
      breakdown.push({ type: d.type, amount: amt });
    }
  });

  // Short-term sales
  const activeSales = getActiveShortTermDiscounts(date, shortTermSales);
  activeSales.forEach(sale => {
    let amt;
    if (sale.appliesTo === 'stock_model') {
      // Apply discount only to the base price (stock model)
      amt = basePrice * (sale.percent / 100);
    } else {
      // Apply discount to total price (stock model + features)
      amt = (basePrice + featureCost) * (sale.percent / 100);
    }
    price -= amt;
    breakdown.push({ type: sale.name, amount: amt });
  });

  return { finalPrice: price, breakdown };
}