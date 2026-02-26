import { Router, Request, Response } from 'express';

import { db, pool, rawSql } from '../../db';
import { molds, productionQueue, allOrders, purchaseOrderItems, poProducts, layupSchedule, stockModels } from '../../schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { format, addDays, startOfWeek, getDay } from 'date-fns';
import { deriveCanonicalMaterial } from '../utils/deriveCanonicalMaterial';

const router = Router();

// Debug endpoint to check raw mold data
router.get('/debug-molds', async (req: Request, res: Response) => {
  try {
    const result = await rawSql`SELECT mold_id, stock_models FROM molds WHERE mold_id = 'Mesa Universal-1' LIMIT 1`;
    const drizzleResult = await db.select({ moldId: molds.moldId, stockModels: molds.stockModels }).from(molds).limit(3);
    
    res.json({
      rawSql: result,
      drizzle: drizzleResult,
      rawSqlType: typeof result,
      rawSqlIsArray: Array.isArray(result),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all molds with their settings
router.get('/molds', async (req: Request, res: Response) => {
  try {
    const allMolds = await db.select().from(molds).orderBy(molds.modelName, molds.instanceNumber);
    res.json({ success: true, molds: allMolds });
  } catch (error: any) {
    console.error('Error fetching molds:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bulk enable/disable molds by model name (MUST come before /molds/:id)
router.patch('/molds/bulk/by-model', async (req: Request, res: Response) => {
  try {
    const { modelName, enabled, isActive, multiplier } = req.body;
    
    if (!modelName) {
      return res.status(400).json({ success: false, error: 'modelName is required' });
    }
    
    const updateData: any = { updatedAt: new Date() };
    if (typeof enabled === 'boolean') updateData.enabled = enabled;
    if (typeof isActive === 'boolean') updateData.isActive = isActive;
    if (typeof multiplier === 'number' && multiplier > 0) updateData.multiplier = multiplier;
    
    const result = await db.update(molds)
      .set(updateData)
      .where(eq(molds.modelName, modelName))
      .returning();
    
    console.log(`✅ Bulk updated ${result.length} molds for model ${modelName}:`, updateData);
    res.json({ success: true, updatedCount: result.length, molds: result });
  } catch (error: any) {
    console.error('Error bulk updating molds:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update a mold's settings (enabled, multiplier, isActive)
router.patch('/molds/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { enabled, multiplier, isActive, stockModels: newStockModels } = req.body;
    
    console.log(`🔧 Updating mold id=${id} with:`, { enabled, multiplier, isActive, stockModels: newStockModels });
    
    // Build dynamic UPDATE query using raw SQL (Drizzle .returning() doesn't work with this DB)
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    let paramIndex = 1;
    
    if (typeof enabled === 'boolean') {
      setClauses.push(`enabled = $${paramIndex++}`);
      params.push(enabled);
    }
    if (typeof isActive === 'boolean') {
      setClauses.push(`is_active = $${paramIndex++}`);
      params.push(isActive);
    }
    if (typeof multiplier === 'number' && multiplier > 0) {
      setClauses.push(`multiplier = $${paramIndex++}`);
      params.push(multiplier);
    }
    if (Array.isArray(newStockModels)) {
      setClauses.push(`stock_models = $${paramIndex++}`);
      params.push(newStockModels);
    }
    
    params.push(parseInt(id));
    
    const updateQuery = `
      UPDATE molds 
      SET ${setClauses.join(', ')} 
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(updateQuery, params);
    const rows = result?.rows || result || [];
    
    if (!Array.isArray(rows) || rows.length === 0) {
      console.log(`❌ Mold id=${id} not found or update failed`);
      return res.status(404).json({ success: false, error: 'Mold not found' });
    }
    
    console.log(`✅ Updated mold ${id}:`, rows[0]);
    res.json({ success: true, mold: rows[0] });
  } catch (error: any) {
    console.error('Error updating mold:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update a mold's stock_models
router.patch('/molds/:moldId/stock-models', async (req: Request, res: Response) => {
  try {
    const { moldId } = req.params;
    const { stockModels: newStockModels } = req.body;
    
    if (!Array.isArray(newStockModels)) {
      return res.status(400).json({ success: false, error: 'stockModels must be an array of strings' });
    }
    
    const result = await db.update(molds)
      .set({ stockModels: newStockModels, updatedAt: new Date() })
      .where(eq(molds.moldId, moldId))
      .returning();
    
    if (result.length === 0) {
      return res.status(404).json({ success: false, error: 'Mold not found' });
    }
    
    res.json({ success: true, mold: result[0] });
  } catch (error: any) {
    console.error('Error updating mold stock_models:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bulk update stock_models for all molds with a given model_name
router.post('/molds/bulk-update-stock-models', async (req: Request, res: Response) => {
  try {
    const { modelName, stockModels: newStockModels } = req.body;
    
    if (!modelName || !Array.isArray(newStockModels)) {
      return res.status(400).json({ success: false, error: 'modelName and stockModels array required' });
    }
    
    const result = await db.update(molds)
      .set({ stockModels: newStockModels, updatedAt: new Date() })
      .where(eq(molds.modelName, modelName))
      .returning();
    
    res.json({ success: true, updatedCount: result.length, molds: result });
  } catch (error: any) {
    console.error('Error bulk updating mold stock_models:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Direct SQL update for mold stock_models (bypasses ORM issues)
router.post('/molds/update-by-model-name', async (req: Request, res: Response) => {
  try {
    const { modelName, stockModels: newStockModels } = req.body;
    
    if (!modelName || !Array.isArray(newStockModels)) {
      return res.status(400).json({ success: false, error: 'modelName and stockModels array required' });
    }
    
    // First check how many molds match
    const checkResult = await rawSql`
      SELECT mold_id, model_name FROM molds WHERE model_name = ${modelName}
    `;
    console.log(`🔍 Found ${checkResult.length} molds with model_name='${modelName}':`, checkResult.slice(0, 3));
    
    if (checkResult.length === 0) {
      return res.json({ success: true, updatedCount: 0, molds: [], message: 'No molds found with that model_name' });
    }
    
    // Use direct Drizzle update - just pass the array directly
    console.log(`🔧 Updating with stockModels:`, newStockModels);
    
    const updateResult = await db.update(molds)
      .set({ 
        stockModels: newStockModels,
        updatedAt: new Date()
      })
      .where(eq(molds.modelName, modelName));
    console.log(`🔧 Drizzle UPDATE result:`, JSON.stringify(updateResult, null, 2));
    
    // Verify the update worked
    const verifyResult = await rawSql`
      SELECT mold_id, model_name, stock_models FROM molds WHERE model_name = ${modelName}
    `;
    console.log(`✅ After update, molds have:`, verifyResult.slice(0, 3));
    
    res.json({ success: true, updatedCount: checkResult.length, molds: verifyResult });
  } catch (error: any) {
    console.error('Error updating mold stock_models via SQL:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Auto-populate stock_models based on model_name (for initial setup)
router.post('/molds/auto-populate-stock-models', async (req: Request, res: Response) => {
  try {
    // Get all unique model_names and the expected stock_models from the stock_models table
    const stockModelsList = await db.select().from(stockModels);
    
    // Create a mapping from display_name variations to stock_model keys
    const modelToStockModels: Record<string, string[]> = {};
    
    for (const sm of stockModelsList) {
      const key = sm.key; // e.g., "mesa_universal"
      const displayName = sm.displayName || ''; // e.g., "Mesa Universal"
      
      // Normalize display name to lowercase with underscores for matching
      const normalizedDisplay = displayName.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
      const normalizedKey = key.toLowerCase();
      
      // Add to mapping - match by display name
      if (displayName) {
        if (!modelToStockModels[displayName]) {
          modelToStockModels[displayName] = [];
        }
        if (!modelToStockModels[displayName].includes(key)) {
          modelToStockModels[displayName].push(key);
        }
      }
    }
    
    // Get all molds grouped by model_name
    const allMolds = await db.select().from(molds);
    const moldsByModel = new Map<string, typeof allMolds>();
    for (const m of allMolds) {
      if (!moldsByModel.has(m.modelName)) {
        moldsByModel.set(m.modelName, []);
      }
      moldsByModel.get(m.modelName)!.push(m);
    }
    
    const updates: { modelName: string; stockModels: string[]; count: number }[] = [];
    
    for (const [modelName, moldList] of moldsByModel) {
      // Try to find matching stock models
      const matchingStockModels = modelToStockModels[modelName] || [];
      
      // If no direct match, try fuzzy matching
      if (matchingStockModels.length === 0) {
        const normalizedModelName = modelName.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
        
        for (const sm of stockModelsList) {
          const smKey = sm.key.toLowerCase();
          const smDisplay = (sm.displayName || '').toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
          
          if (smKey.includes(normalizedModelName) || normalizedModelName.includes(smKey) ||
              smDisplay.includes(normalizedModelName) || normalizedModelName.includes(smDisplay)) {
            if (!matchingStockModels.includes(sm.key)) {
              matchingStockModels.push(sm.key);
            }
          }
        }
      }
      
      if (matchingStockModels.length > 0) {
        await db.update(molds)
          .set({ stockModels: matchingStockModels, updatedAt: new Date() })
          .where(eq(molds.modelName, modelName));
        
        updates.push({ modelName, stockModels: matchingStockModels, count: moldList.length });
      }
    }
    
    res.json({ 
      success: true, 
      message: 'Stock models auto-populated based on model_name matching',
      updates,
      totalMoldsUpdated: updates.reduce((sum, u) => sum + u.count, 0)
    });
  } catch (error: any) {
    console.error('Error auto-populating stock_models:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

interface GenerateScheduleRequest {
  selectedOrderIds: string[]; // Regular production queue order IDs
  selectedPOItems: {
    poNumber: string;
    itemId: number;
    stockModel: string;
    quantity: number;
  }[];
  workDays?: number[]; // Optional: Days to schedule (1=Mon, 2=Tue, etc). Defaults to [1,2,3,4]
  weekStart?: string; // Optional: ISO date string for week start. Defaults to next Monday
}

// Generate layup schedule preview based on selected items
router.post('/generate', async (req: Request, res: Response) => {
  try {
    console.log('🔄 GENERATE SCHEDULE: Starting schedule generation...');
    
    const { selectedOrderIds = [], selectedPOItems = [], workDays = [1, 2, 3, 4], weekStart }: GenerateScheduleRequest = req.body;
    
    const totalItems = selectedOrderIds.length + selectedPOItems.length;
    console.log(`📊 Total items to schedule: ${totalItems} (${selectedOrderIds.length} regular orders, ${selectedPOItems.length} PO items)`);
    console.log('📦 Selected PO Items received:', JSON.stringify(selectedPOItems.slice(0, 5), null, 2));
    console.log('📦 PO Items total quantity:', selectedPOItems.reduce((sum, item) => sum + item.quantity, 0));
    
    if (totalItems === 0) {
      return res.status(400).json({
        success: false,
        error: 'No items selected for scheduling',
      });
    }
    
    // Fetch stock models with display names for material detection
    const stockModelsList = await db.select({
      name: stockModels.name,
      displayName: stockModels.displayName,
    }).from(stockModels);
    
    // Create a map of model name -> display name for quick lookup
    const stockModelDisplayMap = new Map(
      stockModelsList.map(m => [m.name, m.displayName || ''])
    );
    
    console.log(`📦 Loaded ${stockModelDisplayMap.size} stock models for material detection`);
    
    // Fetch ALL molds (don't filter by enabled status since database has them disabled)
    // Use pool.query for proper PostgreSQL array handling (rawSql/Neon driver returns empty arrays)
    const rawMolds = await pool.query(`
      SELECT id, mold_id, model_name, stock_models, instance_number, enabled, multiplier, is_active
      FROM molds
    `);
    
    // Debug: Log raw data to see what format stock_models is in
    if (rawMolds.length > 0) {
      console.log('🔍 RAW MOLD DATA (first 3):', rawMolds.slice(0, 3).map((m: any) => ({
        mold_id: m.mold_id,
        stock_models: m.stock_models,
        stock_models_type: typeof m.stock_models,
        stock_models_raw: JSON.stringify(m.stock_models),
      })));
    }
    
    // Parse stock_models from PostgreSQL array format "{a,b,c}" to JavaScript array
    const activeMolds = rawMolds.map((m: any) => ({
      id: m.id,
      moldId: m.mold_id,
      modelName: m.model_name,
      stockModels: typeof m.stock_models === 'string' 
        ? m.stock_models.replace(/^\{|\}$/g, '').split(',').filter((s: string) => s.length > 0)
        : (Array.isArray(m.stock_models) ? m.stock_models : []),
      instanceNumber: m.instance_number,
      enabled: m.enabled,
      multiplier: m.multiplier || 1,
      isActive: m.is_active,
    }));
    
    console.log(`🏭 Found ${activeMolds.length} active molds`);
    if (activeMolds.length > 0) {
      console.log('🔍 Sample molds:', activeMolds.slice(0, 3).map((m: any) => ({ 
        moldId: m.moldId, 
        modelName: m.modelName, 
        stockModels: m.stockModels,
        stockModelsType: typeof m.stockModels,
        stockModelsIsArray: Array.isArray(m.stockModels),
        capacity: m.multiplier
      })));
    }
    
    // Fetch regular orders details from all_orders table
    let regularOrders: any[] = [];
    if (selectedOrderIds.length > 0) {
      console.log(`🔍 Fetching ${selectedOrderIds.length} regular orders:`, selectedOrderIds.slice(0, 5));
      
      const ordersResults = await db
        .select({
          orderId: allOrders.orderId,
          fbOrderNumber: allOrders.fbOrderNumber,
          stockModel: allOrders.modelId,
          customerId: allOrders.customerId,
          customerName: allOrders.customerId, // Using customerId as customerName for now
          dueDate: allOrders.dueDate,
          features: allOrders.features,
        })
        .from(allOrders)
        .where(inArray(allOrders.orderId, selectedOrderIds));
      
      console.log(`📦 Found ${ordersResults.length} regular orders in database`);
      if (ordersResults.length > 0) {
        console.log('🔍 Sample order:', ordersResults[0]);
        console.log('🔍 Regular order stock models:', ordersResults.slice(0, 5).map(o => ({ orderId: o.orderId, stockModel: o.stockModel })));
      }
      
      // Process badge information
      regularOrders = ordersResults.map(order => {
        const features = order.features as any || {};
        const otherOptions = Array.isArray(features.other_options) ? features.other_options : [];
        
        // Extract action length
        let actionLength = features.action_length;
        if (!actionLength || actionLength === 'none') {
          // Try to derive from action_inlet
          const actionInlet = features.action_inlet;
          if (actionInlet) {
            if (actionInlet.includes('short')) {
              actionLength = 'SA';
            } else if (actionInlet.includes('long')) {
              actionLength = 'LA';
            }
          }
        }
        
        // Use material_canonical as single source of truth for P1 material
        let material: string | null = order.materialCanonical || null;
        if (!material) {
          material = deriveCanonicalMaterial(order.stockModel || '') || null;
        }
        
        // Determine badges
        const lop = features.length_of_pull;
        // LOP badge: any non-empty, non-standard value (matching frontend logic)
        const hasLOP = lop && 
          lop !== 'none' && 
          lop !== 'standard' && 
          lop !== 'std' && 
          lop !== 'no_lop_change' &&
          lop.trim() !== '';
        
        const lopValue = hasLOP ? lop : null;
        
        const bottomMetal = features.bottom_metal;
        const hasADL = bottomMetal && typeof bottomMetal === 'string' && bottomMetal.toLowerCase().includes('adl');
        
        const hasHeavyFill = otherOptions.includes('heavy_fill');
        
        return {
          ...order,
          actionLength,
          actionInlet: features.action_inlet || null,
          material,
          hasLOP,
          lopValue,
          hasADL,
          hasHeavyFill,
        };
      });
    }
    
    // Fetch PO item details and prepare for scheduling
    const poItems: any[] = [];
    
    if (selectedPOItems.length > 0) {
      console.log(`🔍 Preparing ${selectedPOItems.length} PO items for scheduling`);
      
      // Fetch action length from po_products table
      const itemIds = selectedPOItems.map(item => item.itemId);
      const poProductsData = await db
        .select({
          id: poProducts.id,
          actionLength: poProducts.actionLength,
          actionInlet: poProducts.actionInlet,
          stockModel: poProducts.stockModel,
        })
        .from(poProducts)
        .where(inArray(poProducts.id, itemIds));
      
      console.log(`📦 Fetched ${poProductsData.length} PO products with action length data`);
      
      // Create a map for quick lookup
      const poProductMap = new Map(poProductsData.map(p => [p.id, p]));
      
      // Expand by quantity for scheduling
      selectedPOItems.forEach(item => {
        const poProductData = poProductMap.get(item.itemId);
        
        // Extract action length from po_products
        let actionLength = poProductData?.actionLength || null;
        if (!actionLength || actionLength === 'none') {
          // Try to derive from action_inlet
          const actionInlet = poProductData?.actionInlet;
          if (actionInlet) {
            if (actionInlet.includes('short')) {
              actionLength = 'SA';
            } else if (actionInlet.includes('long')) {
              actionLength = 'LA';
            }
          }
        }
        
        // Use material_canonical as single source of truth for P1 material
        let material: string | null = (item as any).materialCanonical || null;
        if (!material) {
          material = deriveCanonicalMaterial(item.stockModel || '') || null;
        }
        
        for (let i = 0; i < item.quantity; i++) {
          poItems.push({
            orderId: `PO-${item.poNumber}-${item.itemId}-${i + 1}`,
            fbOrderNumber: item.poNumber,
            stockModel: item.stockModel,
            customerId: null,
            customerName: 'Purchase Order',
            dueDate: null,
            quantity: 1,
            actionLength,
            actionInlet: poProductData?.actionInlet || null,
            material,
            hasLOP: false,
            hasADL: false,
            hasHeavyFill: false,
          });
        }
      });
    }
    
    const allItems = [...regularOrders, ...poItems];
    console.log(`📦 Prepared ${allItems.length} items for scheduling (${regularOrders.length} regular + ${poItems.length} PO units)`);
    
    // Use provided week start or calculate next Monday
    let weekStartDate: Date;
    if (weekStart) {
      weekStartDate = new Date(weekStart);
      console.log(`📅 Using provided week start: ${format(weekStartDate, 'yyyy-MM-dd')}`);
    } else {
      const today = new Date();
      weekStartDate = startOfWeek(addDays(today, 7), { weekStartsOn: 1 });
      console.log(`📅 Using calculated next Monday: ${format(weekStartDate, 'yyyy-MM-dd')}`);
    }
    const nextMonday = weekStartDate; // For backward compatibility with existing code
    
    // Initialize schedule by day (using selected work days)
    const scheduledItems: any[] = [];
    const overflowItems: any[] = [];
    
    // Track capacity usage per mold per day
    const moldDayCapacity: { [key: string]: { [day: number]: number } } = {};
    activeMolds.forEach(mold => {
      moldDayCapacity[mold.moldId] = {};
      workDays.forEach(day => {
        moldDayCapacity[mold.moldId][day] = 0;
      });
    });
    
    // Round-robin day index for even distribution
    let currentDayIndex = 0;
    
    // Try to schedule each item
    for (const item of allItems) {
      let scheduled = false;
      
      // Find compatible molds for this stock model
      // Handle both array and string formats for mold.stockModels (in case Drizzle returns different formats)
      // Also fallback to model_name matching if stockModels is empty (database driver workaround)
      const compatibleMolds = activeMolds.filter(mold => {
        if (!item.stockModel) return false;
        
        // Model name alias mappings for stock models with non-standard naming
        // Includes carbon fiber (cf_) and fiberglass (fg_) variants
        const modelAliases: Record<string, string[]> = {
          'adjustable_gladius': ['adj_amor', 'adj_gladius', 'adjustable_amor', 'cf_adj_armor', 'cf_adj_gladius', 'fg_adj_armor', 'fg_adj_gladius'],
          'adjustable_alpine_hunter': ['adj_alpine_hunter', 'adj_alpine', 'cf_adj_alp_hunter', 'cf_adj_alpine_hunter', 'cf_adj_alpine', 'fg_adj_alp_hunter', 'fg_adj_alpine_hunter', 'fg_adj_alpine'],
          'alpine_hunter': ['cf_alpine_hunter', 'fg_alpine_hunter'],
        };
        
        // Normalize function: "Mesa Universal" -> "mesa_universal"
        const normalizeModelName = (name: string) => 
          name.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
        
        // Check if stock model matches any alias
        const getCanonicalName = (stockModel: string): string => {
          const normalized = stockModel.toLowerCase();
          for (const [canonical, aliases] of Object.entries(modelAliases)) {
            if (aliases.includes(normalized) || normalized === canonical) {
              return canonical;
            }
          }
          return normalized;
        };
        
        const canonicalStockModel = getCanonicalName(item.stockModel);
        
        // First try stockModels array matching
        if (mold.stockModels && mold.stockModels.length > 0) {
          // If it's an array, use includes
          if (Array.isArray(mold.stockModels)) {
            // Check both original and canonical names
            return mold.stockModels.includes(item.stockModel) || 
                   mold.stockModels.some(m => getCanonicalName(m) === canonicalStockModel);
          }
          
          // If it's a string (postgres array format like "{a,b,c}"), parse and check
          if (typeof mold.stockModels === 'string') {
            const modelsStr = mold.stockModels as string;
            // Handle postgres array format: {model1,model2,model3}
            const cleanedModels = modelsStr.replace(/^\{|\}$/g, '').split(',');
            return cleanedModels.includes(item.stockModel) ||
                   cleanedModels.some(m => getCanonicalName(m) === canonicalStockModel);
          }
        }
        
        // Fallback: match by normalized model_name when stockModels is empty
        // e.g., mold "Mesa Universal" matches stock_model "mesa_universal"
        const normalizedMoldModel = normalizeModelName(mold.modelName);
        const normalizedStockModel = item.stockModel.toLowerCase();
        
        // Check if normalized names match, including aliases
        return normalizedMoldModel === normalizedStockModel ||
               normalizedMoldModel === canonicalStockModel ||
               normalizedMoldModel.includes(normalizedStockModel) ||
               normalizedStockModel.includes(normalizedMoldModel) ||
               normalizedMoldModel.includes(canonicalStockModel) ||
               canonicalStockModel.includes(normalizedMoldModel);
      });
      
      if (compatibleMolds.length === 0) {
        console.log(`⚠️ No compatible molds for ${item.orderId} (stockModel: ${item.stockModel}, type: ${typeof item.stockModel})`);
        overflowItems.push({
          ...item,
          reason: `No compatible molds for stock model: ${item.stockModel}`,
        });
        continue;
      }
      
      // Try to find a slot using round-robin distribution across all selected days
      // Start from current day index and try all days in rotation
      const attemptOrder = [...workDays];
      const rotatedDays = [
        ...attemptOrder.slice(currentDayIndex),
        ...attemptOrder.slice(0, currentDayIndex)
      ];
      
      for (const day of rotatedDays) {
        if (scheduled) break;
        
        for (const mold of compatibleMolds) {
          const currentUsage = moldDayCapacity[mold.moldId][day] || 0;
          
          if (currentUsage < mold.multiplier) {
            // Found available capacity!
            const scheduledDate = addDays(nextMonday, day - 1);
            
            scheduledItems.push({
              orderId: item.orderId,
              fbOrderNumber: item.fbOrderNumber,
              stockModel: item.stockModel,
              customerName: item.customerName,
              scheduledDate: format(scheduledDate, 'yyyy-MM-dd'),
              moldId: mold.moldId,
              dayOfWeek: day,
              dayName: ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][day],
              // Additional fields
              actionLength: item.actionLength || null,
              actionInlet: item.actionInlet || null,
              material: item.material || null,
              // Badge information
              hasLOP: item.hasLOP || false,
              lopValue: item.lopValue || null,
              hasADL: item.hasADL || false,
              hasHeavyFill: item.hasHeavyFill || false,
            });
            
            moldDayCapacity[mold.moldId][day] = currentUsage + 1;
            scheduled = true;
            console.log(`✅ Scheduled ${item.orderId} → ${mold.moldId} on ${['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'][day]}`);
            
            // Move to next day in rotation for balanced distribution
            currentDayIndex = (currentDayIndex + 1) % workDays.length;
            break;
          }
        }
      }
      
      // If still not scheduled, add to overflow
      if (!scheduled) {
        console.log(`❌ Cannot schedule ${item.orderId} - no capacity available`);
        overflowItems.push({
          ...item,
          reason: 'No available mold capacity in the scheduling window',
        });
      }
    }
    
    console.log(`✅ Generated schedule: ${scheduledItems.length} scheduled, ${overflowItems.length} overflow`);
    
    res.json({
      success: true,
      scheduledItems,
      overflowItems,
      weekStart: format(nextMonday, 'yyyy-MM-dd'),
      totalItems: allItems.length,
      scheduledCount: scheduledItems.length,
      overflowCount: overflowItems.length,
    });
  } catch (error) {
    console.error('❌ GENERATE SCHEDULE: Error generating schedule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate layup schedule',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Save layup schedule and progress orders to Layup/Plugging department
router.post('/save', async (req: Request, res: Response) => {
  try {
    console.log(
      '💾 SCHEDULE SAVE: Starting layup schedule save and progressing orders to Layup/Plugging...'
    );

    const { entries, workDays, weekStart } = req.body;

    if (!entries || !Array.isArray(entries)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid schedule entries provided',
      });
    }

    console.log(
      `📋 Processing ${entries.length} schedule entries for week starting ${weekStart}`
    );
    console.log(
      `📅 Configured work days: ${workDays.map((d: number) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}`
    );

    // Get a dedicated client for the transaction (all queries must use same client)
    const client = await pool.connect();

    try {
      // Start transaction on dedicated client
      await client.query('BEGIN');
      // Derive the distinct layup_day values from the incoming entries
      const layupDaysSet = new Set(entries.map((e: any) => {
        const scheduledDate = typeof e.scheduledDate === 'string' 
          ? new Date(e.scheduledDate) 
          : e.scheduledDate;
        return scheduledDate.toISOString().split('T')[0];
      }));
      const layupDays = Array.from(layupDaysSet);
      
      console.log(`📅 Target layup days for this save: ${layupDays.join(', ')}`);
      
      // Get existing schedule ONLY for the specific days being saved (to decrement PO item counts)
      const existingResult = await client.query(
        `
        SELECT order_id 
        FROM layup_schedule 
        WHERE layup_day = ANY($1::date[])
      `,
        [layupDays]
      );
      
      // Handle result - client.query returns { rows: [...] }
      const existingRows = existingResult?.rows || [];
      
      // Decrement PO item counts for items being removed
      const existingPOCounts = new Map<string, number>();
      for (const row of (Array.isArray(existingRows) ? existingRows : [])) {
        const orderId = row.order_id;
        if (orderId.startsWith('PO-')) {
          const parts = orderId.split('-');
          if (parts.length >= 3) {
            const poNumber = parts[1];
            const itemId = parts[2];
            const key = `${poNumber}-${itemId}`;
            existingPOCounts.set(key, (existingPOCounts.get(key) || 0) + 1);
          }
        }
      }
      
      // Decrement counts before clearing
      if (existingPOCounts.size > 0) {
        const poItemEntries = Array.from(existingPOCounts.entries());
        for (const [key, count] of poItemEntries) {
          const [poNumber, itemId] = key.split('-');
          await client.query(
            `
            UPDATE purchase_order_items
            SET order_count = GREATEST(COALESCE(order_count, 0) - $1, 0),
                updated_at = NOW()
            WHERE id = $2
          `,
            [count, parseInt(itemId)]
          );
          console.log(`📦 Decremented PO item ${itemId}: removed ${count} from order_count`);
        }
      }
      
      // Clear existing schedule ONLY for the specific days being saved (not entire week)
      await client.query(
        `
        DELETE FROM layup_schedule 
        WHERE layup_day = ANY($1::date[])
      `,
        [layupDays]
      );
      
      console.log(`🗑️ Cleared existing entries for days: ${layupDays.join(', ')} (preserving other days in the week)`);

      let savedCount = 0;
      let progressedCount = 0;
      const orderIds: string[] = [];
      const poItemCounts = new Map<string, number>(); // Track PO item counts: "poNumber-itemId" -> count

      // Save schedule entries
      for (const entry of entries) {
        const { orderId, scheduledDate, moldId, employeeAssignments, stockModel, stockModelId, product } = entry;

        // Validate required fields
        if (!orderId || !scheduledDate) {
          console.log(`⚠️ Skipping invalid entry: ${JSON.stringify(entry)}`);
          continue;
        }

        // Convert scheduledDate to Date object if it's a string
        const processedScheduledDate =
          typeof scheduledDate === 'string'
            ? new Date(scheduledDate)
            : scheduledDate;

        // Insert schedule entry with layup_day for schedule history
        const layupDay = processedScheduledDate instanceof Date 
          ? processedScheduledDate.toISOString().split('T')[0]
          : new Date(processedScheduledDate).toISOString().split('T')[0];
        
        // Derive stock model from entry or mold name
        let derivedStockModel = stockModel || stockModelId || product || '';
        if (!derivedStockModel && moldId) {
          // Extract stock model from mold name (e.g., "Alpine Hunter-6" -> "Alpine Hunter")
          const moldParts = moldId.split('-');
          if (moldParts.length >= 2) {
            moldParts.pop(); // Remove the instance number
            derivedStockModel = moldParts.join('-');
          } else {
            derivedStockModel = moldId;
          }
        }
        
        await client.query(
          `
          INSERT INTO layup_schedule (
            order_id, scheduled_date, layup_day, mold_id, employee_assignments,
            is_override, created_at, updated_at, stock_model
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
          [
            orderId,
            processedScheduledDate,
            layupDay,
            moldId || 'auto',
            JSON.stringify(employeeAssignments || []),
            true, // This is a manual schedule save
            new Date().toISOString(),
            new Date().toISOString(),
            derivedStockModel,
          ]
        );

        savedCount++;
        
        // Track PO items to update their order counts
        if (orderId.startsWith('PO-')) {
          // Parse PO item ID: PO-{poNumber}-{itemId}-{unitNumber}
          const parts = orderId.split('-');
          if (parts.length >= 3) {
            const poNumber = parts[1];
            const itemId = parts[2];
            const key = `${poNumber}-${itemId}`;
            poItemCounts.set(key, (poItemCounts.get(key) || 0) + 1);
            
            // Create/update production_orders record for this PO unit
            // This ensures the item appears in the Layup/Plugging department queue
            try {
              // Get PO item details
              const poItemResult = await client.query(`
                SELECT 
                  poi.id as item_id,
                  poi.stock_model_id,
                  poi.item_name,
                  poi.item_type,
                  po.id as po_id,
                  po.po_number,
                  po.customer_id,
                  po.expected_delivery as due_date,
                  po.customer_name
                FROM purchase_order_items poi
                JOIN purchase_orders po ON poi.po_id = po.id
                WHERE poi.id = $1
              `, [parseInt(itemId)]);
              
              if (poItemResult.rows && poItemResult.rows.length > 0) {
                const poItem = poItemResult.rows[0];
                
                // Use derived stock model or fall back to item name
                const stockModelForPO = derivedStockModel || poItem.stock_model_id || poItem.item_name || '';
                
                // Upsert production_orders record
                await client.query(`
                  INSERT INTO production_orders (
                    order_id, po_id, po_item_id, customer_id, customer_name, 
                    po_number, item_type, item_id, item_name, 
                    order_date, due_date, current_department, production_status
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                  ON CONFLICT (order_id) DO UPDATE SET
                    current_department = 'Layup/Plugging',
                    item_id = COALESCE(NULLIF($8, ''), production_orders.item_id),
                    item_name = COALESCE(NULLIF($9, ''), production_orders.item_name),
                    updated_at = NOW()
                `, [
                  orderId,
                  poItem.po_id,
                  parseInt(itemId),
                  poItem.customer_id || 'unknown',
                  poItem.customer_name || 'Unknown Customer',
                  poItem.po_number,
                  poItem.item_type || 'stock_model',
                  stockModelForPO,
                  poItem.item_name || stockModelForPO,
                  new Date(),
                  poItem.due_date || processedScheduledDate,
                  'Layup/Plugging',
                  'PENDING'
                ]);
                
                console.log(`📦 Created/updated production_orders record for ${orderId} with stock model: ${stockModelForPO}`);
              }
            } catch (poError) {
              console.log(`⚠️ Could not create production_orders for ${orderId}:`, poError);
            }
          }
        } else {
          // Track regular order IDs
          orderIds.push(orderId);
        }
        
        console.log(
          `✅ Order ${orderId} scheduled for ${scheduledDate}`
        );
      }

      // Update PO item order counts and track production order numbers
      const productionOrderNumbers = new Set<string>();
      if (poItemCounts.size > 0) {
        const newPOItemEntries = Array.from(poItemCounts.entries());
        for (const [key, count] of newPOItemEntries) {
          const [poNumber, itemId] = key.split('-');
          await client.query(
            `
            UPDATE purchase_order_items
            SET order_count = COALESCE(order_count, 0) + $1,
                updated_at = NOW()
            WHERE id = $2
          `,
            [count, parseInt(itemId)]
          );
          console.log(`📦 Updated PO item ${itemId}: added ${count} to order_count`);
          
          // Track the production order number for progression
          productionOrderNumbers.add(poNumber);
        }
      }

      // Move regular orders to Layup/Plugging department (not PO items)
      if (orderIds.length > 0) {
        const uniqueOrderIds = Array.from(new Set(orderIds));
        
        const updateResult = await client.query(
          `
          UPDATE all_orders
          SET current_department = 'Layup/Plugging',
              updated_at = NOW()
          WHERE order_id = ANY($1::text[])
          AND current_department IN ('P1 Production Queue', 'Production Queue')
        `,
          [uniqueOrderIds]
        );
        
        progressedCount = updateResult.rowCount || 0;
        console.log(`📦 Moved ${progressedCount} orders to Layup/Plugging department`);
      }

      // Move production orders to Layup/Plugging department ONLY if ALL items are fully scheduled
      if (productionOrderNumbers.size > 0) {
        const poNumbersArray = Array.from(productionOrderNumbers);
        
        // Check which POs have all items fully scheduled
        const fullyScheduledPOs = [];
        for (const poNumber of poNumbersArray) {
          const checkResult = await client.query(
            `
            SELECT COUNT(*) as total_items,
                   COUNT(*) FILTER (WHERE quantity - COALESCE(order_count, 0) = 0) as completed_items
            FROM purchase_order_items poi
            JOIN purchase_orders po ON poi.po_id = po.id
            WHERE po.po_number = $1
              AND (poi.stock_status IS NULL OR poi.stock_status != 'no stock')
              AND (poi.item_type = 'stock_model' OR poi.item_type = 'custom_model')
          `,
            [poNumber]
          );
          
          const checkRows = checkResult.rows || [];
          if (checkRows.length > 0) {
            const totalItems = parseInt(checkRows[0].total_items);
            const completedItems = parseInt(checkRows[0].completed_items);
            
            console.log(`📊 PO ${poNumber}: ${completedItems}/${totalItems} items fully scheduled`);
            
            // Only move if ALL items are completed
            if (totalItems > 0 && totalItems === completedItems) {
              fullyScheduledPOs.push(poNumber);
            }
          }
        }
        
        // Move only fully completed production orders
        if (fullyScheduledPOs.length > 0) {
          const poUpdateResult = await client.query(
            `
            UPDATE production_orders
            SET current_department = 'Layup/Plugging',
                updated_at = NOW()
            WHERE po_number = ANY($1::text[])
            AND current_department = 'P1 Production Queue'
          `,
            [fullyScheduledPOs]
          );
          
          const poProgressedCount = poUpdateResult.rowCount || 0;
          progressedCount += poProgressedCount;
          console.log(`📦 Moved ${poProgressedCount} production orders to Layup/Plugging (all items complete): ${fullyScheduledPOs.join(', ')}`);
        } else {
          console.log(`📦 No production orders ready to move (items still pending)`);
        }
      }

      // Commit transaction
      await client.query('COMMIT');

      console.log(
        `✅ Successfully saved ${savedCount} schedule entries and progressed ${progressedCount} orders to Layup/Plugging`
      );

      res.json({
        success: true,
        message: `Schedule saved and ${progressedCount} orders progressed to Layup/Plugging`,
        entriesSaved: savedCount,
        ordersProgressed: progressedCount,
        weekStart: weekStart,
        workDays: workDays,
      });
    } catch (transactionError) {
      await client.query('ROLLBACK');
      throw transactionError;
    } finally {
      // Always release the client back to the pool
      client.release();
    }
  } catch (error) {
    console.error('❌ SCHEDULE SAVE: Error saving layup schedule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save layup schedule',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get current week's schedule
router.get('/current-week', async (req: Request, res: Response) => {
  try {
    console.log('📅 CURRENT WEEK: Fetching current week layup schedule...');

    // Get start of current week (Monday)
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const scheduleQuery = `
      SELECT 
        ls.order_id as orderId,
        ls.scheduled_date as scheduledDate,
        ls.mold_id as moldId,
        ls.employee_assignments as employeeAssignments,
        ls.is_override as isOverride,
        o.fb_order_number as fbOrderNumber,
        o.model_id as stockModelId,
        o.customer_id as customerId,
        c.customer_name as customerName,
        po.po_number as poNumber,
        po.id as poId,
        po.id as productionOrderId,
        CASE 
          WHEN po.order_id IS NOT NULL THEN 'production_order'
          ELSE 'main_orders'
        END as source
      FROM layup_schedule ls
      LEFT JOIN all_orders o ON ls.order_id = o.order_id
      LEFT JOIN production_orders po ON ls.order_id = po.order_id
      LEFT JOIN customers c ON o.customer_id = c.id::text
      WHERE ls.scheduled_date >= $1 AND ls.scheduled_date <= $2
      ORDER BY ls.scheduled_date ASC
    `;

    const scheduleResult = await pool.query(scheduleQuery, [
      startOfWeek.toISOString(),
      endOfWeek.toISOString(),
    ]);

    const scheduleEntries = scheduleResult || [];

    console.log(
      `📋 Found ${scheduleEntries.length} schedule entries for current week`
    );

    res.json({
      success: true,
      schedule: scheduleEntries,
      weekStart: startOfWeek.toISOString(),
      weekEnd: endOfWeek.toISOString(),
      totalEntries: scheduleEntries.length,
    });
  } catch (error) {
    console.error(
      '❌ CURRENT WEEK: Error fetching current week schedule:',
      error
    );
    res.status(500).json({
      success: false,
      error: 'Failed to fetch current week schedule',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Add individual order assignment endpoint for drag and drop
router.post('/', async (req: Request, res: Response) => {
  try {
    console.log('💾 INDIVIDUAL SAVE: Saving single order assignment...');

    const {
      orderId,
      scheduledDate,
      moldId,
      instanceNumber,
      employeeAssignments,
      isOverride,
      overriddenBy,
    } = req.body;

    if (!orderId || !scheduledDate || !moldId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: orderId, scheduledDate, moldId',
      });
    }

    console.log(
      `📋 Saving assignment: ${orderId} → ${moldId} on ${scheduledDate}`
    );

    // Convert scheduledDate to Date object if it's a string
    const processedScheduledDate =
      typeof scheduledDate === 'string'
        ? new Date(scheduledDate)
        : scheduledDate;

    // Extract layup_day for schedule history
    const layupDay = processedScheduledDate instanceof Date 
      ? processedScheduledDate.toISOString().split('T')[0]
      : new Date(processedScheduledDate).toISOString().split('T')[0];

    // Insert schedule entry
    await pool.query(
      `
      INSERT INTO layup_schedule (
        order_id, scheduled_date, layup_day, mold_id, employee_assignments,
        is_override, overridden_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
      [
        orderId,
        processedScheduledDate,
        layupDay,
        moldId,
        JSON.stringify(employeeAssignments || []),
        isOverride || true,
        overriddenBy || 'user',
        new Date().toISOString(),
        new Date().toISOString(),
      ]
    );

    console.log(`✅ Successfully saved assignment: ${orderId} → ${moldId}`);

    res.json({
      success: true,
      message: `Order ${orderId} assigned to ${moldId}`,
      orderId,
      moldId,
      scheduledDate: processedScheduledDate,
    });
  } catch (error) {
    console.error('❌ INDIVIDUAL SAVE ERROR:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save order assignment',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Delete individual order assignment endpoint for drag and drop
router.delete('/by-order/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    console.log(
      `🗑️ INDIVIDUAL DELETE: Removing assignment for order ${orderId}`
    );

    const result = await pool.query(
      `
      DELETE FROM layup_schedule 
      WHERE order_id = $1
    `,
      [orderId]
    );

    const deletedRows = (result as any).rowCount || 0;

    if (deletedRows > 0) {
      console.log(
        `✅ Successfully deleted ${deletedRows} assignment(s) for order ${orderId}`
      );
    } else {
      console.log(`ℹ️ No existing assignment found for order ${orderId}`);
    }

    res.json({
      success: true,
      message: `Removed ${deletedRows} assignment(s) for order ${orderId}`,
      orderId,
      deletedRows,
    });
  } catch (error) {
    console.error('❌ INDIVIDUAL DELETE ERROR:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete order assignment',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get all orders for a specific layup schedule date (for barcode scanning)
router.get('/by-schedule-date/:scheduleDate', async (req: Request, res: Response) => {
  try {
    const { scheduleDate } = req.params;
    console.log(`📅 Fetching orders for schedule date: ${scheduleDate}`);
    
    // Get all schedule entries for this date
    const scheduleRows = await pool.query(
      `
      SELECT DISTINCT order_id
      FROM layup_schedule
      WHERE scheduled_date::date = $1::date
         OR layup_day = $1::date
      ORDER BY order_id
      `,
      [scheduleDate]
    );
    
    const scheduleOrderIds = scheduleRows.map((row) => row.order_id);
    console.log(`📋 Found ${scheduleOrderIds.length} schedule entries for ${scheduleDate}`);
    
    // Separate regular orders from PO units
    const regularOrderIds: string[] = [];
    const poUnitIds: string[] = [];
    
    for (const orderId of scheduleOrderIds) {
      if (orderId.startsWith('PO-')) {
        poUnitIds.push(orderId);
      } else {
        regularOrderIds.push(orderId);
      }
    }
    
    console.log(`📦 Regular orders: ${regularOrderIds.length}, PO units: ${poUnitIds.length}`);
    
    // Map PO units to their production_order IDs
    const productionOrderIds = new Set<string>();
    
    if (poUnitIds.length > 0) {
      // Parse PO unit IDs to extract poNumber and poItemId
      // Format: PO-{poNumber}-{itemId}-{unitNumber}
      const poMappings: Array<{ poNumber: string; poItemId: number }> = [];
      
      for (const poUnitId of poUnitIds) {
        const parts = poUnitId.split('-');
        if (parts.length >= 3) {
          const poNumber = parts[1];
          const poItemId = parseInt(parts[2]);
          if (!isNaN(poItemId)) {
            poMappings.push({ poNumber, poItemId });
          }
        }
      }
      
      // Look up production_orders that match these PO numbers and item IDs
      if (poMappings.length > 0) {
        const uniqueMappings = Array.from(
          new Map(poMappings.map(m => [`${m.poNumber}-${m.poItemId}`, m])).values()
        );
        
        for (const mapping of uniqueMappings) {
          const productionOrderRows = await pool.query(
            `
            SELECT DISTINCT order_id
            FROM production_orders
            WHERE po_number = $1 AND po_item_id = $2
            `,
            [mapping.poNumber, mapping.poItemId]
          );
          
          for (const row of productionOrderRows) {
            productionOrderIds.add(row.order_id);
          }
        }
        
        console.log(`🔗 Mapped ${poUnitIds.length} PO units to ${productionOrderIds.size} production orders`);
      }
    }
    
    // Combine regular order IDs with production order IDs
    const allOrderIds = [...regularOrderIds, ...Array.from(productionOrderIds)];
    
    console.log(`✅ Total orders for barcode scan: ${allOrderIds.length} (${regularOrderIds.length} regular + ${productionOrderIds.size} production orders)`);
    
    res.json({
      success: true,
      scheduleDate,
      orderIds: allOrderIds,
      count: allOrderIds.length
    });
  } catch (error) {
    console.error('❌ Error fetching orders by schedule date:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders for schedule date',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get list of weeks that have schedules (for reprint functionality)
router.get('/weeks', async (req: Request, res: Response) => {
  try {
    console.log('📅 SCHEDULE WEEKS: Fetching list of weeks with schedules...');
    
    const weeks = await pool.query(`
      SELECT 
        DATE_TRUNC('week', layup_day)::date AS week_start,
        MIN(layup_day)::date AS first_day,
        MAX(layup_day)::date AS last_day,
        MIN(created_at) AS created_at,
        COUNT(DISTINCT order_id) AS order_count,
        COUNT(DISTINCT CASE WHEN order_id LIKE 'PO-%' THEN order_id END) AS po_order_count,
        COUNT(DISTINCT CASE WHEN order_id NOT LIKE 'PO-%' THEN order_id END) AS regular_order_count,
        ARRAY_AGG(DISTINCT order_id ORDER BY order_id) AS order_ids,
        ARRAY_AGG(DISTINCT layup_day ORDER BY layup_day) AS schedule_days
      FROM layup_schedule
      WHERE layup_day IS NOT NULL
      GROUP BY DATE_TRUNC('week', layup_day)
      ORDER BY DATE_TRUNC('week', layup_day) DESC
      LIMIT 52
    `);
    
    console.log(`✅ Found ${weeks.length} weeks with schedules`);
    
    res.json({
      success: true,
      weeks,
    });
  } catch (error) {
    console.error('❌ Error fetching schedule weeks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch schedule weeks',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get full schedule data for a specific week (for reprint functionality)
router.get('/week/:weekStart', async (req: Request, res: Response) => {
  try {
    const { weekStart } = req.params;
    console.log(`📋 SCHEDULE REPRINT: Fetching schedule for week starting ${weekStart}...`);
    
    // Calculate week end date
    const weekEnd = format(addDays(new Date(weekStart), 7), 'yyyy-MM-dd');
    
    // Get all schedule entries for this week
    const scheduleEntries = await pool.query(
      `
      SELECT 
        ls.id,
        ls.order_id,
        ls.layup_day AS scheduled_date,
        ls.mold_id,
        ls.employee_assignments,
        ls.is_override,
        ls.created_at
      FROM layup_schedule ls
      WHERE ls.layup_day >= $1::date 
        AND ls.layup_day < $2::date
      ORDER BY ls.layup_day, ls.order_id
    `,
      [weekStart, weekEnd]
    );
    console.log(`📦 Found ${scheduleEntries.length} schedule entries`);
    
    // Separate PO items and regular orders
    const poOrderIds = scheduleEntries
      .filter((entry: any) => entry.order_id.startsWith('PO-'))
      .map((entry: any) => entry.order_id);
    
    const regularOrderIds = scheduleEntries
      .filter((entry: any) => !entry.order_id.startsWith('PO-'))
      .map((entry: any) => entry.order_id);
    
    console.log(`Regular orders: ${regularOrderIds.length}, PO orders: ${poOrderIds.length}`);
    
    // Fetch regular order details
    let regularOrders: any[] = [];
    if (regularOrderIds.length > 0) {
      const regularResult = await pool.query(
        `
        SELECT 
          ao.order_id,
          ao.fb_order_number,
          ao.model_id AS stock_model,
          ao.customer_id AS customer_name,
          ao.features
        FROM all_orders ao
        WHERE ao.order_id = ANY($1::text[])
      `,
        [regularOrderIds]
      );
      regularOrders = Array.from(regularResult);
    }
    
    // Fetch PO order details
    let poOrders: any[] = [];
    if (poOrderIds.length > 0) {
      const poResult = await pool.query(
        `
        SELECT 
          po_orders.order_id,
          po_orders.item_id,
          po.po_number,
          po.customer_name,
          poi.item_id AS stock_model,
          poi.item_name,
          poi.specifications AS features
        FROM production_orders po_orders
        JOIN purchase_orders po ON po_orders.po_id = po.id
        JOIN purchase_order_items poi ON po_orders.po_item_id = poi.id
        WHERE po_orders.order_id = ANY($1::text[])
      `,
        [poOrderIds]
      );
      poOrders = Array.from(poResult);
    }
    
    // Build unified schedule items with details
    const scheduledItems = scheduleEntries.map((entry: any) => {
      const dayOfWeek = getDay(new Date(entry.scheduled_date));
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];
      
      if (entry.order_id.startsWith('PO-')) {
        // Find PO order details
        const poOrder = poOrders.find((po: any) => po.order_id === entry.order_id);
        
        if (!poOrder) {
          return {
            orderId: entry.order_id,
            fbOrderNumber: '',
            stockModel: 'Unknown',
            customerName: 'Unknown',
            scheduledDate: entry.scheduled_date,
            moldId: entry.mold_id,
            dayOfWeek,
            dayName,
          };
        }
        
        const features = poOrder.features || {};
        return {
          orderId: entry.order_id,
          fbOrderNumber: poOrder.po_number || '',
          stockModel: poOrder.stock_model || poOrder.item_name || 'Unknown',
          customerName: poOrder.customer_name || 'Unknown',
          scheduledDate: entry.scheduled_date,
          moldId: entry.mold_id,
          dayOfWeek,
          dayName,
          actionLength: features.action_length || null,
          material: extractMaterial(poOrder.stock_model),
          hasLOP: checkHasLOP(features),
          hasADL: checkHasADL(features),
          hasHeavyFill: checkHasHeavyFill(features),
        };
      } else {
        // Regular order
        const order = regularOrders.find((o: any) => o.order_id === entry.order_id);
        
        if (!order) {
          return {
            orderId: entry.order_id,
            fbOrderNumber: '',
            stockModel: 'Unknown',
            customerName: 'Unknown',
            scheduledDate: entry.scheduled_date,
            moldId: entry.mold_id,
            dayOfWeek,
            dayName,
          };
        }
        
        const features = order.features || {};
        return {
          orderId: entry.order_id,
          fbOrderNumber: order.fb_order_number || '',
          stockModel: order.stock_model || 'Unknown',
          customerName: order.customer_name || 'Unknown',
          scheduledDate: entry.scheduled_date,
          moldId: entry.mold_id,
          dayOfWeek,
          dayName,
          actionLength: features.action_length || null,
          material: extractMaterial(order.stock_model),
          hasLOP: checkHasLOP(features),
          hasADL: checkHasADL(features),
          hasHeavyFill: checkHasHeavyFill(features),
        };
      }
    });
    
    console.log(`✅ Built ${scheduledItems.length} scheduled items with details`);
    
    res.json({
      success: true,
      weekStart,
      scheduledItems,
      totalItems: scheduledItems.length,
    });
  } catch (error) {
    console.error('❌ Error fetching week schedule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch week schedule',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Weekly Summary - Get count of scheduled items by material type for cutting table packet needs
router.get('/weekly-summary', async (req: Request, res: Response) => {
  try {
    console.log('📊 WEEKLY SUMMARY: Fetching packets needed from P1 schedule...');
    
    // Get current week's start (Monday) and end (Sunday)
    const today = new Date();
    const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 }); // Monday
    const weekEnd = addDays(currentWeekStart, 7);
    
    const weekStartStr = format(currentWeekStart, 'yyyy-MM-dd');
    const weekEndStr = format(weekEnd, 'yyyy-MM-dd');
    
    console.log(`📅 Week range: ${weekStartStr} to ${weekEndStr}`);
    
    // Get all schedule entries for this week with their stock model info
    const scheduleResult = await pool.query(`
      SELECT 
        ls.order_id,
        COALESCE(ao.model_id, poi.item_id) AS stock_model
      FROM layup_schedule ls
      LEFT JOIN all_orders ao ON ls.order_id = ao.order_id AND ls.order_id NOT LIKE 'PO-%'
      LEFT JOIN production_orders po ON ls.order_id = po.order_id AND ls.order_id LIKE 'PO-%'
      LEFT JOIN purchase_order_items poi ON po.po_item_id = poi.id
      WHERE ls.layup_day >= $1::date 
        AND ls.layup_day < $2::date
    `, [weekStartStr, weekEndStr]);
    
    let carbonFiberCount = 0;
    let fiberglassCount = 0;
    
    const scheduleRows = Array.isArray(scheduleResult) ? scheduleResult : (scheduleResult as any).rows || [];
    scheduleRows.forEach((row: any) => {
      const stockModel = (row.stock_model || '').toLowerCase();
      if (stockModel.includes('_cf_') || stockModel.includes('_cf') || stockModel.includes('cf_')) {
        carbonFiberCount++;
      } else if (stockModel.includes('_fg_') || stockModel.includes('_fg') || stockModel.includes('fg_')) {
        fiberglassCount++;
      }
    });
    
    console.log(`✅ Weekly summary: ${carbonFiberCount} CF, ${fiberglassCount} FG from ${scheduleRows.length} scheduled items`);
    
    // Return as array format that CuttingTableDashboard expects
    const summaryItems = [];
    if (carbonFiberCount > 0) {
      summaryItems.push({ stockModel: 'cf_packet', quantity: carbonFiberCount });
    }
    if (fiberglassCount > 0) {
      summaryItems.push({ stockModel: 'fg_packet', quantity: fiberglassCount });
    }
    
    res.json(summaryItems);
  } catch (error) {
    console.error('❌ Error fetching weekly summary:', error);
    res.status(500).json({ error: 'Failed to fetch weekly summary' });
  }
});

// Helper functions for badge extraction
function extractMaterial(stockModel: string | null): string | null {
  if (!stockModel) return null;
  const model = stockModel.toLowerCase();
  if (model.includes('_fg_') || model.includes('_fg')) return 'Fiberglass';
  if (model.includes('_cf_') || model.includes('_cf')) return 'Carbon Fiber';
  return null;
}

function checkHasLOP(features: any): boolean {
  const lop = features?.length_of_pull;
  return lop && lop !== 'none' && lop !== 'standard' && lop !== 'std' && lop !== 'no_lop_change' && lop.trim() !== '';
}

function checkHasADL(features: any): boolean {
  const bottomMetal = features?.bottom_metal;
  return bottomMetal && typeof bottomMetal === 'string' && bottomMetal.toLowerCase().includes('adl');
}

function checkHasHeavyFill(features: any): boolean {
  const otherOptions = features?.other_options;
  return Array.isArray(otherOptions) && otherOptions.includes('heavy_fill');
}

// One-time backfill endpoint to create missing production_orders for scheduled PO items
router.post('/backfill-production-orders', async (req: Request, res: Response) => {
  try {
    console.log('🔧 BACKFILL: Starting production_orders backfill for scheduled PO items...');
    
    const client = await pool.connect();
    let createdCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    try {
      // Get all PO items in layup_schedule that don't have production_orders records
      const missingResult = await client.query(`
        SELECT ls.order_id, ls.scheduled_date, ls.created_at, ls.mold_id, ls.stock_model
        FROM layup_schedule ls
        WHERE ls.order_id LIKE 'PO-%'
          AND NOT EXISTS (
            SELECT 1 FROM production_orders prod 
            WHERE prod.order_id = ls.order_id
          )
      `);
      
      const missingRows = missingResult.rows || [];
      console.log(`📋 Found ${missingRows.length} missing production_orders records to backfill`);
      
      for (const row of missingRows) {
        const orderId = row.order_id;
        const parts = orderId.split('-');
        
        let poNumber: string;
        let itemId: number;
        
        // Handle different formats:
        // 4 parts: PO-{poNumber}-{itemId}-{unit} (e.g., PO-P18321-23-1)
        // 5 parts: PO-{prefix}-{suffix}-{itemId}-{unit} (e.g., PO-RFPO-002481-175-1)
        if (parts.length === 4) {
          poNumber = parts[1];
          itemId = parseInt(parts[2]);
        } else if (parts.length === 5) {
          poNumber = `${parts[1]}-${parts[2]}`;
          itemId = parseInt(parts[3]);
        } else {
          console.log(`⚠️ Skipping unrecognized format: ${orderId}`);
          skippedCount++;
          continue;
        }
        
        if (isNaN(itemId)) {
          console.log(`⚠️ Invalid item ID for ${orderId}`);
          skippedCount++;
          continue;
        }
        
        try {
          // Get PO item details
          const poItemResult = await client.query(`
            SELECT 
              poi.id as item_id,
              poi.stock_model_id,
              poi.item_name,
              poi.item_type,
              po.id as po_id,
              po.po_number,
              po.customer_id,
              po.customer_name,
              po.expected_delivery
            FROM purchase_order_items poi
            JOIN purchase_orders po ON poi.po_id = po.id
            WHERE poi.id = $1 AND po.po_number = $2
          `, [itemId, poNumber]);
          
          if (!poItemResult.rows || poItemResult.rows.length === 0) {
            console.log(`⚠️ No matching PO item found for ${orderId} (poNumber=${poNumber}, itemId=${itemId})`);
            skippedCount++;
            continue;
          }
          
          const poItem = poItemResult.rows[0];
          
          // Derive stock model from mold_id or existing data
          let derivedStockModel = row.stock_model || poItem.stock_model_id || '';
          if (!derivedStockModel && row.mold_id) {
            // Extract stock model from mold name (e.g., "Alpine Hunter-6" -> "Alpine Hunter")
            const moldParts = row.mold_id.split('-');
            if (moldParts.length >= 2) {
              moldParts.pop(); // Remove the instance number
              derivedStockModel = moldParts.join('-');
            } else {
              derivedStockModel = row.mold_id;
            }
          }
          
          const stockModelForItem = derivedStockModel || poItem.item_name || '';
          
          // Insert production_orders record
          await client.query(`
            INSERT INTO production_orders (
              order_id, po_id, po_item_id, customer_id, customer_name, 
              po_number, item_type, item_id, item_name, 
              order_date, due_date, current_department, production_status, is_fulfilled
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            ON CONFLICT (order_id) DO NOTHING
          `, [
            orderId,
            poItem.po_id,
            itemId,
            poItem.customer_id || 'unknown',
            poItem.customer_name || 'OEM Vendor',
            poItem.po_number,
            poItem.item_type || 'stock_model',
            stockModelForItem,
            poItem.item_name || stockModelForItem,
            row.created_at || new Date(),
            poItem.expected_delivery || row.scheduled_date,
            'Layup/Plugging',
            'PENDING',
            false
          ]);
          
          console.log(`✅ Created production_orders for ${orderId} with stock model: ${stockModelForItem}`);
          createdCount++;
        } catch (itemError) {
          console.log(`❌ Error processing ${orderId}:`, itemError);
          errorCount++;
        }
      }
      
      console.log(`✅ BACKFILL COMPLETE: Created ${createdCount}, Skipped ${skippedCount}, Errors ${errorCount}`);
      
      res.json({
        success: true,
        message: `Backfill complete`,
        created: createdCount,
        skipped: skippedCount,
        errors: errorCount,
        total: missingRows.length
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ BACKFILL ERROR:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
