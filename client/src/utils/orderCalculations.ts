// Shared order calculation utilities
// Used by both OrderEntry and RefundRequest to ensure consistent calculations

export interface OrderCalculationData {
  // Stock model info
  stockModel?: {
    id: string;
    price: number;
  };
  
  // Features data
  features: Record<string, any>;
  
  // Discount info
  discountCode?: string;
  discountDetails?: {
    percent?: number;
    fixedAmount?: number;
    appliesTo: 'stock_model' | 'total_order';
    isActive: boolean;
  };
  
  // Override pricing
  priceOverride?: number | null;
  
  // Misc items
  miscItems?: Array<{
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  
  // Other options quantities
  otherOptionsQuantities?: Record<string, number>;
  
  // Shipping
  shipping?: number;
  
  // Feature definitions (needed for price lookups)
  featureDefs: Array<{
    id: string;
    name: string;
    displayName: string;
    type: string;
    options?: Array<{
      value: string;
      label: string;
      price?: number;
    }>;
    category?: string;
    subcategory?: string;
  }>;
}

export interface OrderCalculationResult {
  subtotal: number;
  discount: number;
  total: number;
  finalTotal: number; // total + shipping
}

export function calculateOrderTotals(data: OrderCalculationData): OrderCalculationResult {
  // Step 1: Calculate subtotal
  const subtotal = calculateSubtotal(data);
  
  // Step 2: Calculate discount
  const discount = calculateDiscount(data, subtotal);
  
  // Step 3: Calculate total after discount
  const total = subtotal - discount;
  
  // Step 4: Add shipping
  const finalTotal = total + (data.shipping || 0);
  
  return {
    subtotal,
    discount,
    total,
    finalTotal
  };
}

function calculateSubtotal(data: OrderCalculationData): number {
  // If price override is set, use that as the subtotal (APR Price Override behavior)
  if (data.priceOverride !== null && data.priceOverride !== undefined) {
    console.log('💰 Price calculation - Using APR Price Override as subtotal:', data.priceOverride);
    return data.priceOverride;
  }

  let total = 0;

  // Add stock model price (normal calculation when no override)
  if (data.stockModel) {
    const basePrice = data.stockModel.price || 0;
    total += basePrice;
    console.log('💰 Price calculation - Base price:', basePrice);
  }

  // Add feature prices from features object (but NOT bottom_metal, paint_options, rail_accessory, other_options as they are handled separately)
  Object.entries(data.features).forEach(([featureId, value]) => {
    // Skip features that have separate handling to avoid double counting
    if (featureId === 'bottom_metal' || featureId === 'paint_options' || featureId === 'rail_accessory' || featureId === 'other_options') {
      return;
    }

    if (value && value !== 'none') {
      const feature = data.featureDefs.find(f => f.id === featureId);
      if (feature?.options) {
        if (Array.isArray(value)) {
          // Handle multi-select features
          value.forEach(optionValue => {
            const option = feature.options!.find(opt => opt.value === optionValue);
            if (option?.price) {
              total += option.price;
            }
          });
        } else {
          // Handle single-select features
          const option = feature.options.find(opt => opt.value === value);
          if (option?.price) {
            total += option.price;
          }
        }
      }
    }
  });

  // Add bottom metal price (from features object)
  if (data.features.bottom_metal) {
    const bottomMetalFeature = data.featureDefs.find(f => f.id === 'bottom_metal');
    if (bottomMetalFeature?.options) {
      const option = bottomMetalFeature.options.find(opt => opt.value === data.features.bottom_metal);
      if (option?.price) {
        let bottomMetalPrice = option.price;
        
        // Special pricing: SepFG10 or SepCF25 seasonal sale + AG bottom metal = $100 instead of $149
        if ((data.discountCode === 'short_term_3' || data.discountCode === 'short_term_1') && data.features.bottom_metal.includes('ag_') && option.price === 149) {
          bottomMetalPrice = 100;
          const saleName = data.discountCode === 'short_term_3' ? 'SepFG10' : 'SepCF25';
          console.log(`💰 Special pricing applied: ${saleName} + AG bottom metal - price changed from $149 to $100`);
        }
        
        total += bottomMetalPrice;
        console.log('💰 Price calculation - Bottom metal:', data.features.bottom_metal, 'price:', bottomMetalPrice);
      }
    }
  }

  // Add paint options price (from features object)
  const currentPaint = data.features.metallic_finishes || data.features.paint_options || data.features.paint_options_combined;

  if (currentPaint && currentPaint !== 'none') {
    console.log('💰 Paint calculation - current paint:', currentPaint);
    console.log('💰 Paint calculation - from features object');

    const paintFeatures = data.featureDefs.filter(f => 
      f.displayName?.includes('Options') || 
      f.displayName?.includes('Camo') || 
      f.displayName?.includes('Cerakote') ||
      f.displayName?.includes('Terrain') ||
      f.displayName?.includes('Rogue') ||
      f.displayName?.includes('Standard') ||
      f.id === 'metallic_finishes' ||
      f.name === 'metallic_finishes' ||
      f.category === 'paint' ||
      f.subcategory === 'paint'
    );

    console.log('💰 Paint calculation - found features:', paintFeatures.length, paintFeatures.map(f => f.displayName));

    let paintPriceAdded = false;
    for (const feature of paintFeatures) {
      if (feature.options) {
        const option = feature.options.find(opt => opt.value === currentPaint);
        if (option?.price) {
          console.log('💰 Paint calculation - FOUND and ADDED:', option.label, 'price:', option.price);
          total += option.price;
          paintPriceAdded = true;
          break; // Only add price once
        }
      }
    }

    if (!paintPriceAdded) {
      console.log('💰 Paint calculation - NO PRICE FOUND for:', currentPaint);
    }
  }

  // Add rail accessory prices (from features object)
  const currentRails = Array.isArray(data.features.rail_accessory) ? data.features.rail_accessory : [];
  if (currentRails && currentRails.length > 0) {
    console.log('💰 Rails calculation - current rails:', currentRails);
    const railFeature = data.featureDefs.find(f => f.id === 'rail_accessory');
    console.log('💰 Rails calculation - found feature:', railFeature?.displayName || railFeature?.name);

    if (railFeature?.options) {
      console.log('💰 Rails calculation - available options:', railFeature.options.map(opt => `${opt.label}: ${opt.value} = $${opt.price}`));
      let railsTotal = 0;
      currentRails.forEach((optionValue: string) => {
        const option = railFeature.options!.find(opt => opt.value === optionValue);
        if (option?.price) {
          railsTotal += option.price;
          total += option.price;
          console.log('💰 Rails calculation - FOUND and ADDED:', option.label, 'price:', option.price);
        } else {
          console.log('💰 Rails calculation - NO PRICE FOUND for:', optionValue);
        }
      });
      console.log('💰 Rails calculation - Total rails price:', railsTotal);
    } else {
      console.log('💰 Rails calculation - NO FEATURE or OPTIONS found for rail_accessory');
    }
  } else {
    console.log('💰 Rails calculation - No rails selected');
  }

  // Add other options prices with quantities (from features object)
  const currentOtherOptions = Array.isArray(data.features.other_options) ? data.features.other_options : [];
  if (currentOtherOptions && currentOtherOptions.length > 0) {
    const otherFeature = data.featureDefs.find(f => f.id === 'other_options');
    if (otherFeature?.options) {
      let otherTotal = 0;
      currentOtherOptions.forEach((optionValue: string) => {
        const option = otherFeature.options!.find(opt => opt.value === optionValue);
        if (option?.price) {
          const quantity = data.otherOptionsQuantities?.[optionValue] || 1;
          const optionTotal = option.price * quantity;
          otherTotal += optionTotal;
          total += optionTotal;
        }
      });
      console.log('💰 Price calculation - Other options total:', otherTotal, 'from', currentOtherOptions, 'with quantities:', data.otherOptionsQuantities);
    }
  }

  // Add miscellaneous items total
  if (data.miscItems) {
    const miscTotal = data.miscItems.reduce((sum, item) => sum + item.total, 0);
    total += miscTotal;
    console.log('💰 Price calculation - Misc items total:', miscTotal);
  }

  console.log('💰 Price calculation - Final subtotal:', total);
  return total;
}

function calculateDiscount(data: OrderCalculationData, subtotal: number): number {
  if (!data.discountCode || data.discountCode === 'none') return 0;

  // Handle custom discount (OrderEntry specific, but keeping for compatibility)
  // This would need to be passed in the data if needed
  
  // Handle predefined discount codes using discountDetails
  if (data.discountDetails && data.discountDetails.isActive) {
    // For discounts that apply to stock model only
    if (data.discountDetails.appliesTo === 'stock_model') {
      const baseAmount = data.priceOverride !== null && data.priceOverride !== undefined 
        ? data.priceOverride 
        : (data.stockModel?.price || 0);

      // Handle percentage discounts
      if (data.discountDetails.percent) {
        return (baseAmount * data.discountDetails.percent) / 100;
      }

      // Handle fixed amount discounts
      if (data.discountDetails.fixedAmount) {
        return data.discountDetails.fixedAmount; // Already in dollars, no conversion needed
      }
    }
    // If appliesTo is 'total_order', apply to full subtotal
    else if (data.discountDetails.appliesTo === 'total_order') {
      // Handle percentage discounts on total order
      if (data.discountDetails.percent) {
        return (subtotal * data.discountDetails.percent) / 100;
      }

      // Handle fixed amount discounts on total order
      if (data.discountDetails.fixedAmount) {
        return data.discountDetails.fixedAmount; // Already in dollars, no conversion needed
      }
    }
  }

  return 0;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}