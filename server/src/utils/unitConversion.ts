/**
 * Unit Conversion Utility
 * Handles automatic conversions between purchase units and usage units for COGS calculations
 */

// Weight conversion factors (all to grams)
const WEIGHT_TO_GRAMS: Record<string, number> = {
  'g': 1,
  'gram': 1,
  'grams': 1,
  'kg': 1000,
  'kilogram': 1000,
  'kilograms': 1000,
  'oz': 28.3495,
  'ounce': 28.3495,
  'ounces': 28.3495,
  'lb': 453.592,
  'lbs': 453.592,
  'pound': 453.592,
  'pounds': 453.592,
  'LB': 453.592,
  'KG': 1000,
};

// Volume conversion factors (all to milliliters)
const VOLUME_TO_ML: Record<string, number> = {
  'ml': 1,
  'milliliter': 1,
  'milliliters': 1,
  'L': 1000,
  'liter': 1000,
  'liters': 1000,
  'gal': 3785.41,
  'gallon': 3785.41,
  'gallons': 3785.41,
  'GAL': 3785.41,
  'qt': 946.353,
  'quart': 946.353,
  'quarts': 946.353,
  'pt': 473.176,
  'pint': 473.176,
  'pints': 473.176,
  'fl oz': 29.5735,
  'fluid ounce': 29.5735,
  'fluid ounces': 29.5735,
};

// Length conversion factors (all to millimeters)
const LENGTH_TO_MM: Record<string, number> = {
  'mm': 1,
  'millimeter': 1,
  'millimeters': 1,
  'cm': 10,
  'centimeter': 10,
  'centimeters': 10,
  'm': 1000,
  'meter': 1000,
  'meters': 1000,
  'M': 1000,
  'in': 25.4,
  'inch': 25.4,
  'inches': 25.4,
  'ft': 304.8,
  'foot': 304.8,
  'feet': 304.8,
  'FT': 304.8,
};

// Area conversion factors (all to square millimeters)
const AREA_TO_SQ_MM: Record<string, number> = {
  'sq mm': 1,
  'sq cm': 100,
  'sq m': 1000000,
  'sq in': 645.16,
  'sq ft': 92903.04,
};

// Count units (no conversion needed)
const COUNT_UNITS = new Set([
  'ea', 'each', 'pc', 'piece', 'pieces', 'item', 'items', 'unit', 'units'
]);

export interface ConversionResult {
  value: number;
  sourceUnit: string;
  targetUnit: string;
  conversionFactor: number;
}

/**
 * Convert quantity from source unit to target unit
 * @param quantity - The quantity to convert
 * @param sourceUnit - The unit to convert from
 * @param targetUnit - The unit to convert to
 * @returns Conversion result with converted value and factor
 */
export function convertUnits(
  quantity: number,
  sourceUnit: string,
  targetUnit: string
): ConversionResult {
  const source = sourceUnit.trim().toLowerCase();
  const target = targetUnit.trim().toLowerCase();

  // Same unit, no conversion needed
  if (source === target) {
    return {
      value: quantity,
      sourceUnit,
      targetUnit,
      conversionFactor: 1,
    };
  }

  // Count units - treat all as equivalent
  if (COUNT_UNITS.has(source) && COUNT_UNITS.has(target)) {
    return {
      value: quantity,
      sourceUnit,
      targetUnit,
      conversionFactor: 1,
    };
  }

  // Try weight conversion
  if (WEIGHT_TO_GRAMS[source] && WEIGHT_TO_GRAMS[target]) {
    const conversionFactor = WEIGHT_TO_GRAMS[source] / WEIGHT_TO_GRAMS[target];
    return {
      value: quantity * conversionFactor,
      sourceUnit,
      targetUnit,
      conversionFactor,
    };
  }

  // Try volume conversion
  if (VOLUME_TO_ML[source] && VOLUME_TO_ML[target]) {
    const conversionFactor = VOLUME_TO_ML[source] / VOLUME_TO_ML[target];
    return {
      value: quantity * conversionFactor,
      sourceUnit,
      targetUnit,
      conversionFactor,
    };
  }

  // Try length conversion
  if (LENGTH_TO_MM[source] && LENGTH_TO_MM[target]) {
    const conversionFactor = LENGTH_TO_MM[source] / LENGTH_TO_MM[target];
    return {
      value: quantity * conversionFactor,
      sourceUnit,
      targetUnit,
      conversionFactor,
    };
  }

  // Try area conversion
  if (AREA_TO_SQ_MM[source] && AREA_TO_SQ_MM[target]) {
    const conversionFactor = AREA_TO_SQ_MM[source] / AREA_TO_SQ_MM[target];
    return {
      value: quantity * conversionFactor,
      sourceUnit,
      targetUnit,
      conversionFactor,
    };
  }

  throw new Error(
    `Cannot convert from "${sourceUnit}" to "${targetUnit}". Units are incompatible or not supported.`
  );
}

/**
 * Calculate COGS per item from vendor pricing
 * Example: $491.20 for 80lb box, consumptionRate = 50g per item
 * Result: $491.20 / 80lb = $6.14/lb = $0.0135/g * 50g = $0.68 per item
 * 
 * @param vendorPrice - Price from vendor (e.g., $491.20)
 * @param purchaseQuantity - Quantity in purchase unit (e.g., 80)
 * @param purchaseUnit - Purchase unit (e.g., "lb")
 * @param consumptionRate - Amount used per item (e.g., 50)
 * @param usageUnit - Usage unit (e.g., "g")
 * @returns COGS per manufactured item
 */
export function calculateCOGS(
  vendorPrice: number,
  purchaseQuantity: number,
  purchaseUnit: string,
  consumptionRate: number,
  usageUnit: string
): number {
  if (vendorPrice <= 0) {
    throw new Error('Vendor price must be greater than 0');
  }
  if (purchaseQuantity <= 0) {
    throw new Error('Purchase quantity must be greater than 0');
  }
  if (consumptionRate <= 0) {
    throw new Error('Consumption rate must be greater than 0');
  }

  // Step 1: Calculate cost per purchase unit
  // $491.20 / 80 = $6.14 per lb
  const costPerPurchaseUnit = vendorPrice / purchaseQuantity;

  // Step 2: Convert purchase unit to usage unit
  // Convert 1 lb to grams: 1 lb = 453.592 g
  const conversion = convertUnits(1, purchaseUnit, usageUnit);

  // Step 3: Calculate cost per usage unit
  // $6.14 per lb / 453.592 = $0.0135 per g
  const costPerUsageUnit = costPerPurchaseUnit / conversion.value;

  // Step 4: Calculate COGS per item
  // $0.0135 per g * 50g = $0.68 per item
  const cogsPerItem = costPerUsageUnit * consumptionRate;

  return cogsPerItem;
}

/**
 * Format a lead time in days to a human-readable string
 * @param days - Number of days
 * @returns Human-readable string (e.g., "3 days", "4 weeks", "2 months")
 */
export function formatLeadTime(days: number | null | undefined): string {
  if (!days || days <= 0) {
    return '-';
  }

  if (days === 1) return '1 day';
  if (days < 7) return `${days} days`;
  if (days === 7) return '1 week';
  if (days < 30) {
    const weeks = Math.round(days / 7);
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
  }
  if (days < 365) {
    const months = Math.round(days / 30);
    return `${months} ${months === 1 ? 'month' : 'months'}`;
  }
  const years = Math.round(days / 365);
  return `${years} ${years === 1 ? 'year' : 'years'}`;
}

/**
 * Parse a human-readable lead time string to days
 * Supports: "3 days", "4 weeks", "2 months", etc.
 * @param leadTimeStr - Human-readable lead time
 * @returns Number of days, or null if invalid
 */
export function parseLeadTimeToDays(leadTimeStr: string): number | null {
  if (!leadTimeStr || leadTimeStr.trim() === '') return null;

  const str = leadTimeStr.trim().toLowerCase();
  const match = str.match(/^(\d+)\s*(day|days|week|weeks|month|months|year|years)$/);

  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  if (unit.startsWith('day')) return value;
  if (unit.startsWith('week')) return value * 7;
  if (unit.startsWith('month')) return value * 30;
  if (unit.startsWith('year')) return value * 365;

  return null;
}
