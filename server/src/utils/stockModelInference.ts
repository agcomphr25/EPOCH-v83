// Shared utility for inferring stock models from order features
// This logic is used both in the production queue API and the algorithmic scheduler

export function inferStockModelFromFeatures(order: any): { stockModelId: string; product: string } {
  let stockModelId = order.stockModelId || order.modelId;
  let product = 'Unknown Product';
  
  // CRITICAL FIX: Only check for Mesa Precision Summit if no valid model ID exists
  // Don't override existing valid model IDs like 'privateer-tikka'
  // IMPORTANT: Be very strict about Mesa Universal classification to prevent over-classification
  if (!stockModelId && order.features && typeof order.features === 'object') {
    const features = order.features;
    
    // Check action_inlet for Mesa Precision Summit
    if (features.action_inlet === 'mesa_precision_summit') {
      // Production-safe logging - only in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`🏔️ MESA PRECISION SUMMIT (action_inlet): ${order.orderId || order.order_id} → Mesa Universal`);
      }
      return { stockModelId: 'mesa_universal', product: 'Mesa Universal' };
    }
    
    // Check special instructions for Mesa Precision Summit
    if (features.specialInstructions && typeof features.specialInstructions === 'string') {
      const instructions = features.specialInstructions.toLowerCase();
      if (instructions.includes('mesa precision summit') || instructions.includes('mesa_precision_summit')) {
        // Production-safe logging - only in development
        if (process.env.NODE_ENV === 'development') {
          console.log(`🏔️ MESA PRECISION SUMMIT (specialInstructions): ${order.orderId || order.order_id} → Mesa Universal`);
        }
        return { stockModelId: 'mesa_universal', product: 'Mesa Universal' };
      }
    }
  }
  
  // PRIORITY: Respect existing valid stockModelId field first
  if (stockModelId && stockModelId !== 'universal' && stockModelId !== 'UNPROCESSED') {
    product = stockModelId;
    // Production-safe logging - only in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`✅ EXISTING MODEL ID: ${order.orderId || order.order_id} → ${stockModelId} (preserved)`);
    }
    return { stockModelId, product };
  }
  
  // STRICT: Only classify as Mesa if explicitly Mesa production order with Mesa in itemName
  if (order.source === 'mesa_production_order' && order.itemName?.toLowerCase().includes('mesa')) {
    stockModelId = 'mesa_universal';
    product = 'Mesa Universal';
    // Production-safe logging - only in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`🎯 MESA INFERENCE: ${order.orderId || order.order_id} → Mesa Universal (itemName: ${order.itemName})`);
    }
    return { stockModelId, product };
  }
  
  // Try to extract from features object
  if (order.features?.stockModel) {
    stockModelId = order.features.stockModel;
    product = order.features.stockModel;
    return { stockModelId, product };
  }
  
  // ENHANCED: Infer stock model from features when model_id is NULL
  if (order.features && typeof order.features === 'object') {
    const features = order.features;
    
    // Check for specific action inlets that indicate stock model types
    if (features.action_inlet || features.action) {
      const action = features.action_inlet || features.action;
      
      // CF models typically have modern actions like Terminus, Defiance, etc.
      if (action && typeof action === 'string') {
        const actionLower = action.toLowerCase();
        
        if (actionLower.includes('terminus') || actionLower.includes('defiance') || 
            actionLower.includes('impact') || actionLower.includes('big_horn')) {
          stockModelId = 'cf_alpine_hunter'; // Most common CF model
          product = 'CF Alpine Hunter';
        }
        // Traditional Remington 700 actions often go with FG or wood stocks
        else if (actionLower.includes('remington') || actionLower.includes('rem')) {
          stockModelId = 'fg_alpine_hunter'; // Most common FG model
          product = 'FG Alpine Hunter';
        }
        // Defiance actions with specific features
        else if (actionLower.includes('def_dev_hunter_rem')) {
          stockModelId = 'fg_alpine_hunter';
          product = 'FG Alpine Hunter';
        }
      }
    }
    
    // Check for barrel inlets that might indicate specific models
    if (!stockModelId || stockModelId === 'universal' || stockModelId === 'UNPROCESSED') {
      const barrel = features.barrel_inlet;
      if (barrel && typeof barrel === 'string') {
        const barrelLower = barrel.toLowerCase();
        
        // Heavy barrels often go with tactical/precision stocks
        if (barrelLower.includes('sendero') || barrelLower.includes('heavy') || barrelLower.includes('varmint') || barrelLower.includes('carbon')) {
          stockModelId = 'cf_alpine_hunter';
          product = 'CF Alpine Hunter';
          console.log(`🎯 BARREL INFERENCE: ${barrel} → CF Alpine Hunter`);
        }
        // Standard/sporter barrels
        else if (barrelLower.includes('sporter') || barrelLower.includes('standard')) {
          stockModelId = 'fg_alpine_hunter';
          product = 'FG Alpine Hunter';
          console.log(`🎯 BARREL INFERENCE: ${barrel} → FG Alpine Hunter`);
        }
      }
    }
    
    // Final fallback based on other features
    if (!stockModelId || stockModelId === 'universal' || stockModelId === 'UNPROCESSED') {
      // If it has modern features like QDs, rails, etc., likely CF
      if (features.qd_accessory || features.rail_accessory || features.bottom_metal) {
        stockModelId = 'cf_alpine_hunter';
        product = 'CF Alpine Hunter';
        console.log(`🎯 FEATURE INFERENCE: Modern features detected → CF Alpine Hunter`);
      }
      // Paint options containing "carbon" suggest CF
      else if (features.paint_options && features.paint_options.toLowerCase().includes('carbon')) {
        stockModelId = 'cf_alpine_hunter';
        product = 'CF Alpine Hunter';
        console.log(`🎯 PAINT INFERENCE: ${features.paint_options} → CF Alpine Hunter`);
      }
      // REMOVED: No automatic defaults - let orders with unclear stock models be flagged
      else {
        // Don't assign a default - leave it to be handled as 'needs_information'
        console.log(`❓ UNCLEAR STOCK MODEL: ${order.orderId || order.order_id} → No clear inference possible`);
      }
    }
  }
  
  // Try to extract from item name or product name
  if (!stockModelId || stockModelId === 'universal' || stockModelId === 'UNPROCESSED') {
    if (order.itemName) {
      stockModelId = order.itemName.toLowerCase().replace(/\s+/g, '_');
      product = order.itemName;
    }
    else if (order.product && order.product !== 'Unknown Product') {
      stockModelId = order.product.toLowerCase().replace(/\s+/g, '_');
      product = order.product;
    }
  }
  
  // CRITICAL FIX: If stockModelId is still null/undefined but we have a valid product name,
  // use the product name as the stockModelId for mold matching
  if ((!stockModelId || stockModelId === 'universal' || stockModelId === 'UNPROCESSED') && product && product !== 'Unknown Product') {
    stockModelId = product.toLowerCase().replace(/\s+/g, '_');
    console.log(`🔧 FIXED: Setting stockModelId from product: "${product}" → "${stockModelId}"`);
  }
  
  // REMOVED: No automatic fallback - orders need proper classification
  // If no clear stock model can be determined, mark as needs information
  if (!stockModelId || stockModelId === 'UNPROCESSED') {
    console.log(`❓ NEEDS INFORMATION: ${order.orderId || order.order_id} → No clear stock model identified`);
    stockModelId = 'needs_information';
    product = 'Needs Information';
  }
  
  return { stockModelId, product };
}