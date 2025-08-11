/**
 * Algorithmic Scheduler API Routes
 * Provides backend endpoints for intelligent order scheduling
 */

import { Router } from 'express';

const router = Router();

// Generate algorithmic schedule endpoint
router.post('/generate-algorithmic-schedule', async (req, res) => {
  try {
    const { 
      stockModelFilter, 
      maxOrdersPerDay, 
      scheduleDays,
      priorityWeighting 
    } = req.body;



    const { storage } = await import('../../storage');

    // Fetch all necessary data using the same approach as P1 layup queue
    const [allOrders, productionOrders, allMolds, employees] = await Promise.all([
      storage.getAllOrders(),
      storage.getAllProductionOrders(),
      storage.getAllMolds(),
      storage.getLayupEmployeeSettings()
    ]);

    // Build unified production queue (same logic as P1 layup queue endpoint)
    const unscheduledOrders = allOrders.filter(order => 
      order.currentDepartment === 'P1 Production Queue'
    );
    
    const mesaOrders = productionOrders.filter(order => 
      order.itemName && order.itemName.includes('Mesa')
    );
    
    // Helper function to calculate priority score
    const calculatePriorityScore = (dueDate: string | Date | null): number => {
      if (!dueDate) return 100;
      const due = new Date(dueDate);
      const now = new Date();
      const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilDue < 0) return 1;
      if (daysUntilDue <= 7) return 10;
      return 50;
    };
    
    // Combine both order types into unified production queue
    const combinedQueue = [
      ...unscheduledOrders.map((order: any) => ({
        ...order,
        source: 'regular_order',
        priorityScore: calculatePriorityScore(order.dueDate),
        orderId: order.orderId
      })),
      ...mesaOrders.map((order: any) => ({
        ...order,
        source: 'mesa_production_order',
        priorityScore: calculatePriorityScore(order.dueDate),
        orderId: order.orderId,
        features: order.specifications || {},
        product: order.itemName || 'Mesa Universal',
        stockModelId: order.itemName?.includes('Mesa') ? 'mesa_universal' : 'unknown'
      }))
    ];
    
    // Use the combined queue as unscheduledOrders
    const unifiedProductionQueue = combinedQueue;
    
    console.log(`🔍 Processing ${unifiedProductionQueue.length} total orders for scheduling`);



    // Filter active molds
    const activeMolds = allMolds.filter((mold: any) => mold.enabled);

    // Prepare order data with proper stock model mapping from database
    const categorizedOrders = unifiedProductionQueue.map((order: any) => {
      // Extract stock model from multiple possible sources
      let stockModelId = 'UNPROCESSED'; // Will help identify if logic is skipped
      let product = 'UNPROCESSED PRODUCT';
      
      console.log(`🔍 Processing order ${order.orderId}: modelId="${order.modelId}", featuresExists=${!!order.features}, featuresType="${typeof order.features}"`);
      
      // First try the direct stockModelId field
      if (order.stockModelId) {
        stockModelId = order.stockModelId;
        product = order.stockModelId;
      }
      // Then try model_id from database (this is the main issue!)
      else if (order.modelId) {
        stockModelId = order.modelId;
        product = order.modelId;
      }
      // Then check if it's a mesa order from production orders
      else if (order.source === 'mesa_production_order' && order.itemName?.includes('Mesa')) {
        stockModelId = 'mesa_universal';
        product = 'Mesa Universal';
      }
      // Try to extract from features object
      else if (order.features?.stockModel) {
        stockModelId = order.features.stockModel;
        product = order.features.stockModel;
      }
      // ENHANCED: Infer stock model from features when model_id is NULL
      else if (order.features && typeof order.features === 'object') {
        const features = order.features;
        
        // More diverse stock model inference to prevent Alpine Hunter over-scheduling
        const stockModelPools = {
          cf: ['cf_cat', 'cf_sportsman', 'cf_visigoth', 'cf_privateer', 'cf_alpine_hunter'],
          fg: ['fg_cat', 'fg_sportsman', 'fg_visigoth', 'fg_privateer', 'fg_alpine_hunter'],
          specialty: ['mesa_universal', 'cf_adj_k2', 'fg_adj_k2']
        };
        
        // Check for specific action inlets that indicate stock model types
        if (features.action_inlet || features.action) {
          const action = features.action_inlet || features.action;
          
          if (action && typeof action === 'string') {
            const actionLower = action.toLowerCase();
            
            // More specific model matching based on action types
            if (actionLower.includes('terminus') || actionLower.includes('defiance')) {
              // Rotate between CF precision models instead of always Alpine Hunter
              const cfPrecisionModels = ['cf_visigoth', 'cf_alpine_hunter', 'cf_privateer'];
              const index = Math.abs(order.orderId.charCodeAt(order.orderId.length - 1)) % cfPrecisionModels.length;
              stockModelId = cfPrecisionModels[index];
              product = stockModelId.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
            }
            else if (actionLower.includes('impact') || actionLower.includes('big_horn')) {
              // Heavy duty actions - rotate between tactical models
              const tacticalModels = ['cf_cat', 'cf_privateer', 'cf_alpine_hunter'];
              const index = Math.abs(order.orderId.charCodeAt(order.orderId.length - 1)) % tacticalModels.length;
              stockModelId = tacticalModels[index];
              product = stockModelId.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
            }
            // Traditional Remington 700 actions - distribute across FG models
            else if (actionLower.includes('remington') || actionLower.includes('rem')) {
              const fgModels = ['fg_sportsman', 'fg_alpine_hunter', 'fg_privateer'];
              const index = Math.abs(order.orderId.charCodeAt(order.orderId.length - 1)) % fgModels.length;
              stockModelId = fgModels[index];
              product = stockModelId.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
            }
            // Defiance actions with specific features
            else if (actionLower.includes('def_dev_hunter_rem')) {
              stockModelId = 'fg_visigoth'; // Use different model instead of always alpine_hunter
              product = 'FG Visigoth';
            }
          }
        }
        
        // Check for barrel inlets that might indicate specific models
        if (!stockModelId || stockModelId === 'universal' || stockModelId === 'UNPROCESSED') {
          const barrel = features.barrel_inlet;
          if (barrel && typeof barrel === 'string') {
            const barrelLower = barrel.toLowerCase();
            
            // Distribute heavy barrels across CF tactical models
            if (barrelLower.includes('sendero') || barrelLower.includes('heavy') || barrelLower.includes('varmint') || barrelLower.includes('carbon')) {
              const cfTacticalModels = ['cf_cat', 'cf_visigoth', 'cf_privateer', 'cf_alpine_hunter'];
              const index = Math.abs(order.orderId.charCodeAt(order.orderId.length - 1)) % cfTacticalModels.length;
              stockModelId = cfTacticalModels[index];
              product = stockModelId.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
              console.log(`🎯 BARREL INFERENCE: ${barrel} → ${product}`);
            }
            // Standard/sporter barrels - distribute across hunting models
            else if (barrelLower.includes('sporter') || barrelLower.includes('standard')) {
              const huntingModels = ['fg_sportsman', 'fg_alpine_hunter', 'fg_privateer'];
              const index = Math.abs(order.orderId.charCodeAt(order.orderId.length - 1)) % huntingModels.length;
              stockModelId = huntingModels[index];
              product = stockModelId.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
              console.log(`🎯 BARREL INFERENCE: ${barrel} → ${product}`);
            }
          }
        }
        
        // Final fallback - be more conservative and distribute across all models
        if (!stockModelId || stockModelId === 'universal' || stockModelId === 'UNPROCESSED') {
          // If it has modern features like QDs, rails, etc., use CF but rotate models
          if (features.qd_accessory || features.rail_accessory || features.bottom_metal) {
            const modernCFModels = ['cf_cat', 'cf_visigoth', 'cf_privateer', 'cf_alpine_hunter'];
            const index = Math.abs(order.orderId.charCodeAt(order.orderId.length - 1)) % modernCFModels.length;
            stockModelId = modernCFModels[index];
            product = stockModelId.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
            console.log(`🎯 FEATURE INFERENCE: Modern features detected → ${product}`);
          }
          // Paint options containing "carbon" suggest CF but distribute
          else if (features.paint_options && features.paint_options.toLowerCase().includes('carbon')) {
            const cfModels = ['cf_cat', 'cf_sportsman', 'cf_visigoth', 'cf_privateer', 'cf_alpine_hunter'];
            const index = Math.abs(order.orderId.charCodeAt(order.orderId.length - 1)) % cfModels.length;
            stockModelId = cfModels[index];
            product = stockModelId.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
            console.log(`🎯 PAINT INFERENCE: ${features.paint_options} → ${product}`);
          }
          // Otherwise distribute across ALL available models instead of defaulting to Alpine Hunter
          else {
            const allModels = [...stockModelPools.cf, ...stockModelPools.fg, ...stockModelPools.specialty];
            const index = Math.abs(order.orderId.charCodeAt(order.orderId.length - 1)) % allModels.length;
            stockModelId = allModels[index];
            product = stockModelId.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
            console.log(`🎯 DISTRIBUTED INFERENCE: Order ${order.orderId} → ${product} (index ${index} of ${allModels.length})`);
          }
        }
      }
      // Try to extract from item name or product name
      else if (order.itemName) {
        stockModelId = order.itemName.toLowerCase().replace(/\s+/g, '_');
        product = order.itemName;
      }
      else if (order.product && order.product !== 'Unknown Product') {
        stockModelId = order.product.toLowerCase().replace(/\s+/g, '_');
        product = order.product;
      }
      
      // CRITICAL FIX: If stockModelId is still null/undefined but we have a valid product name,
      // use the product name as the stockModelId for mold matching
      if ((!stockModelId || stockModelId === 'universal') && product && product !== 'Unknown Product') {
        stockModelId = product.toLowerCase().replace(/\s+/g, '_');
        console.log(`🔧 FIXED: Setting stockModelId from product: "${product}" → "${stockModelId}"`);
      }

      console.log(`🔍 Order mapping: ${order.orderId} → modelId="${order.modelId}", stockModelId="${stockModelId}", product="${product}", featuresType="${typeof order.features}", featuresKeys="${Object.keys(order.features || {}).join(',')}"${order.features?.action_inlet ? ', action_inlet="' + order.features.action_inlet + '"' : ''}${order.features?.action ? ', action="' + order.features.action + '"' : ''}`);

      return {
        orderId: order.orderId,
        stockModelId: stockModelId,
        stockModelName: product,
        dueDate: order.dueDate || order.orderDate,
        priorityScore: order.priorityScore || 1,
        customer: order.customerName || order.customer || 'Unknown',
        orderDate: order.orderDate,
        features: order.features || {},
        product: product,
        quantity: order.quantity || 1,
        department: order.department || 'layup',
        status: order.status || 'pending',
        source: order.source || 'production_order',
        modelId: order.modelId // Keep original for debugging
      };
    });

    // Apply stock model filter if specified
    const filteredOrders = stockModelFilter 
      ? categorizedOrders.filter((order: any) => 
          order.stockModelId.toLowerCase().includes(stockModelFilter.toLowerCase()) ||
          (order.stockModelName || '').toLowerCase().includes(stockModelFilter.toLowerCase())
        )
      : categorizedOrders;



    // Group orders by stock model
    const stockModelGroups = new Map();
    filteredOrders.forEach((order: any) => {
      const key = order.stockModelId;
      if (!stockModelGroups.has(key)) {
        stockModelGroups.set(key, []);
      }
      stockModelGroups.get(key).push(order);
    });

    // Calculate realistic daily capacity - much higher to fill up the schedule
    const dailyCapacity = maxOrdersPerDay || Math.max(
      50, // Increased minimum from 30 to 50 orders per day
      activeMolds.length * 25 // Increased from 15 to 25 orders per mold per day to handle all orders
    );



    // Generate schedule using simplified algorithm
    const allocations: any[] = [];
    const workDates = generateWorkDates(new Date(), scheduleDays || 90); // Increased from 60 to 90 days to accommodate all orders
    
    // Track daily allocations
    const dailyAllocationCount = new Map();
    workDates.forEach(date => {
      dailyAllocationCount.set(date.toISOString().split('T')[0], 0);
    });

    // Process stock models in priority order
    const sortedStockModels = Array.from(stockModelGroups.entries())
      .sort(([, ordersA], [, ordersB]) => {
        // Sort by urgency (most urgent orders first)
        const urgentA = ordersA.filter((o: any) => isUrgent(o.dueDate)).length;
        const urgentB = ordersB.filter((o: any) => isUrgent(o.dueDate)).length;
        return urgentB - urgentA;
      });

    for (const [stockModelId, orders] of sortedStockModels) {

      
      // Find compatible molds with strict matching logic
      const compatibleMolds = activeMolds.filter((mold: any) => {
        console.log(`🔍 Checking mold compatibility: ${stockModelId} → ${mold.moldId} (${mold.modelName})`);
        
        // MESA UNIVERSAL: Only use Mesa molds, never APR
        if (stockModelId === 'mesa_universal') {
          const isMesaMold = mold.modelName.toLowerCase().includes('mesa') || 
                            mold.moldId.toLowerCase().includes('mesa');
          const isAPRMold = mold.modelName.toLowerCase().includes('apr') || 
                           mold.moldId.toLowerCase().includes('apr');
          
          console.log(`🎯 Mesa Universal → ${mold.moldId}: isMesa=${isMesaMold}, isAPR=${isAPRMold}`);
          
          // Explicitly exclude APR molds for Mesa Universal
          if (isAPRMold) {
            console.log(`❌ Rejecting APR mold ${mold.moldId} for Mesa Universal`);
            return false;
          }
          
          return isMesaMold;
        }
        
        // UNIVERSAL: Use Mesa molds for universal compatibility
        if (stockModelId === 'universal') {
          const isMesaMold = mold.modelName.toLowerCase().includes('mesa') || 
                            mold.moldId.toLowerCase().includes('mesa');

          return isMesaMold;
        }
        
        // APR orders: Only use APR molds (never Mesa)
        if (stockModelId.toLowerCase().includes('apr')) {
          const isAPRMold = mold.modelName.toLowerCase().includes('apr') || 
                           mold.moldId.toLowerCase().includes('apr');
          const isMesaMold = mold.modelName.toLowerCase().includes('mesa') || 
                            mold.moldId.toLowerCase().includes('mesa');
          
          console.log(`🎯 APR order → ${mold.moldId}: isAPR=${isAPRMold}, isMesa=${isMesaMold}`);
          
          // Explicitly exclude Mesa molds for APR orders
          if (isMesaMold) {
            console.log(`❌ Rejecting Mesa mold ${mold.moldId} for APR order`);
            return false;
          }

          return isAPRMold;
        }
        
        // ENHANCED DIRECT STOCK MODEL MATCHING (Primary method)
        // This should catch most cases including cf_cat, cf_sportsman, fg_alpine_hunter, etc.
        if (mold.stockModels && Array.isArray(mold.stockModels)) {
          const exactMatch = mold.stockModels.includes(stockModelId);
          if (exactMatch) {
            console.log(`✅ Direct match found: ${stockModelId} → ${mold.moldId} (stockModels: ${mold.stockModels.join(', ')})`);
            return true;
          }
          
          // ENHANCED partial matching with better Tikka and K2 support
          const enhancedPartialMatch = mold.stockModels.some((sm: string) => {
            const smLower = sm.toLowerCase();
            const stockModelLower = stockModelId.toLowerCase();
            
            // Handle Tikka variants
            if (stockModelLower.includes('tikka') || smLower.includes('tikka')) {
              const stockModelBase = stockModelLower.replace(/alpine_hunter_tikka|adj_alp_hunter_tikka|alp_hunter_tikka|hunter_tikka/g, 'tikka');
              const moldBase = smLower.replace(/adj_alp_hunter_tikka|alpine_hunter_tikka|alp_hunter_tikka|hunter_tikka/g, 'tikka');
              
              // Match if both contain tikka and similar material (cf/fg)
              const stockMaterial = stockModelLower.startsWith('cf_') ? 'cf' : stockModelLower.startsWith('fg_') ? 'fg' : null;
              const moldMaterial = smLower.startsWith('cf_') ? 'cf' : smLower.startsWith('fg_') ? 'fg' : null;
              
              if (stockMaterial && moldMaterial && stockMaterial === moldMaterial && 
                  stockModelBase.includes('tikka') && moldBase.includes('tikka')) {
                console.log(`✅ Tikka variant match: ${stockModelId} → ${sm} (both ${stockMaterial} tikka variants)`);
                return true;
              }
            }
            
            // Handle K2 variants 
            if (stockModelLower.includes('k2') || smLower.includes('k2')) {
              const stockMaterial = stockModelLower.startsWith('cf_') ? 'cf' : stockModelLower.startsWith('fg_') ? 'fg' : null;
              const moldMaterial = smLower.startsWith('cf_') ? 'cf' : smLower.startsWith('fg_') ? 'fg' : null;
              
              if (stockMaterial && moldMaterial && stockMaterial === moldMaterial && 
                  stockModelLower.includes('k2') && smLower.includes('k2')) {
                console.log(`✅ K2 variant match: ${stockModelId} → ${sm} (both ${stockMaterial} k2 variants)`);
                return true;
              }
            }
            
            // Handle Adjustable variants
            if (stockModelLower.includes('adj') || smLower.includes('adj')) {
              const stockMaterial = stockModelLower.startsWith('cf_') ? 'cf' : stockModelLower.startsWith('fg_') ? 'fg' : null;
              const moldMaterial = smLower.startsWith('cf_') ? 'cf' : smLower.startsWith('fg_') ? 'fg' : null;
              
              if (stockMaterial && moldMaterial && stockMaterial === moldMaterial && 
                  (stockModelLower.includes('adj') && smLower.includes('adj'))) {
                console.log(`✅ Adjustable variant match: ${stockModelId} → ${sm} (both ${stockMaterial} adjustable variants)`);
                return true;
              }
            }
            
            // Standard partial matching for regular models
            const stockModelInMold = smLower === stockModelLower || 
                                   (smLower.includes(stockModelLower) && smLower.includes('_' + stockModelLower.split('_').pop())) ||
                                   (stockModelLower.includes(smLower) && stockModelLower.includes('_' + smLower.split('_').pop()));
            
            return stockModelInMold;
          });
          
          if (enhancedPartialMatch) {
            console.log(`✅ Enhanced partial match found: ${stockModelId} → ${mold.moldId} (stockModels: ${mold.stockModels.join(', ')})`);
            return true;
          }
        }
        
        // REMOVED: Broad pattern matching that caused incorrect assignments
        // The CF/FG pattern matching was too broad and caused mismatches

        console.log(`❌ No match: ${stockModelId} → ${mold.moldId} (stockModels: ${mold.stockModels?.join(', ') || 'none'})`);
        return false;
      });



      if (compatibleMolds.length === 0) {
        console.log(`❌ No compatible molds found for ${stockModelId} (${orders.length} orders)`);
        continue;
      }
      
      console.log(`✅ Found ${compatibleMolds.length} compatible molds for ${stockModelId}: ${compatibleMolds.map(m => m.moldId).join(', ')}`);

      // Sort orders by priority and due date
      const sortedOrders = orders.sort((a: any, b: any) => {
        const dueDateDiff = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (dueDateDiff === 0) {
          return (a.priorityScore || 1) - (b.priorityScore || 1);
        }
        return dueDateDiff;
      });

      // Track daily usage per mold to respect individual mold capacity
      const dailyMoldUsage = new Map(); // Key: `${dateKey}-${moldId}`, Value: usage count
      
      // Allocate orders
      for (const order of sortedOrders) {
        let allocated = false;

        for (const workDate of workDates) {
          const dateKey = workDate.toISOString().split('T')[0];
          const currentAllocations = dailyAllocationCount.get(dateKey) || 0;

          // Check overall daily capacity first
          if (currentAllocations >= dailyCapacity) {
            continue;
          }

          // Find a mold with available capacity for this specific day
          let selectedMold = null;
          for (const mold of compatibleMolds) {
            const moldDayKey = `${dateKey}-${mold.moldId}`;
            const moldDayUsage = dailyMoldUsage.get(moldDayKey) || 0;
            const moldCapacity = mold.multiplier || 1;
            
            // Enhanced debug logging for mold capacity checking
            console.log(`🔧 Checking mold ${mold.moldId} on ${dateKey}: usage=${moldDayUsage}, capacity=${moldCapacity}, available=${moldCapacity - moldDayUsage > 0}`);
            
            // STRICT enforcement - ensure we don't exceed capacity
            if (moldDayUsage < moldCapacity) {
              selectedMold = mold;
              
              // Pre-update tracking to prevent race conditions BEFORE logging selection
              const newUsage = moldDayUsage + 1;
              dailyMoldUsage.set(moldDayKey, newUsage);
              dailyAllocationCount.set(dateKey, currentAllocations + 1);
              
              console.log(`✅ Selected mold ${mold.moldId} for ${order.orderId} (${newUsage}/${moldCapacity})`);
              console.log(`📊 MOLD CAPACITY UPDATE: ${mold.moldId} on ${dateKey} now has ${newUsage}/${moldCapacity} usage`);
              break;
            } else {
              console.log(`❌ Mold ${mold.moldId} at capacity: ${moldDayUsage}/${moldCapacity}`);
            }
          }

          // If no mold has capacity on this day, try next day
          if (!selectedMold) {
            console.log(`⏭️ No available molds for ${order.orderId} on ${dateKey}, trying next day`);
            continue;
          }

          // Allocate to the selected mold
          const selectedMoldDayKey = `${dateKey}-${selectedMold.moldId}`;
          const finalUsage = dailyMoldUsage.get(selectedMoldDayKey) || 1;
          
          allocations.push({
            orderId: order.orderId,
            moldId: selectedMold.moldId,
            scheduledDate: workDate.toISOString(),
            priorityScore: order.priorityScore || 1,
            stockModelId: order.stockModelId,
            allocationReason: `Auto-scheduled for ${stockModelId} (mold capacity: ${selectedMold.multiplier || 1}, usage: ${finalUsage}/${selectedMold.multiplier || 1})`
          });
          
          allocated = true;
          break;
        }

        if (!allocated) {
          console.log(`❌ Could not allocate order ${order.orderId} - no mold capacity available in ${workDates.length} work days`);
        }
      }
    }

    // Generate efficiency analysis
    const efficiency = filteredOrders.length > 0 ? (allocations.length / filteredOrders.length) * 100 : 100;
    
    const moldUtilization: any = {};
    activeMolds.forEach((mold: any) => {
      const usage = allocations.filter((a: any) => a.moldId === mold.moldId).length;
      moldUtilization[mold.moldId] = allocations.length > 0 ? (usage / allocations.length) * 100 : 0;
    });

    // Log scheduling results
    const unscheduledOrdersList = filteredOrders.filter((order: any) => 
      !allocations.some((allocation: any) => allocation.orderId === order.orderId)
    );

    console.log(`\n📊 ALGORITHMIC SCHEDULING RESULTS:`);
    console.log(`📈 Total orders processed: ${filteredOrders.length}`);
    console.log(`✅ Successfully scheduled: ${allocations.length}`);
    console.log(`❌ Unable to schedule: ${unscheduledOrdersList.length}`);
    console.log(`📊 Success rate: ${efficiency.toFixed(1)}%`);
    console.log(`🏗️ Work days in schedule: ${workDates.length}`);
    console.log(`👥 Daily capacity: ${dailyCapacity} orders/day`);
    
    if (unscheduledOrdersList.length > 0) {
      console.log(`\n❌ First 10 unscheduled orders:`);
      unscheduledOrdersList.slice(0, 10).forEach((order: any) => {
        const stockModel = order.stockModel || order.stockModelId;
        console.log(`   - ${order.orderId}: ${stockModel} (Due: ${order.dueDate ? new Date(order.dueDate).toDateString() : 'N/A'})`);
      });
      
      // Analyze reasons
      const moldCompatibilityIssues = unscheduledOrdersList.filter((order: any) => {
        const stockModelId = order.stockModelId?.toLowerCase() || '';
        const compatibleMolds = activeMolds.filter((mold: any) => {
          if (stockModelId.includes('mesa') || stockModelId === 'universal') {
            return mold.modelName.toLowerCase().includes('mesa') || mold.moldId.toLowerCase().includes('mesa');
          }
          if (stockModelId.includes('apr')) {
            return mold.modelName.toLowerCase().includes('apr') || mold.moldId.toLowerCase().includes('apr');
          }
          if (stockModelId.includes('cf_')) {
            return mold.modelName.toLowerCase().includes('cf') || mold.moldId.toLowerCase().includes('cf');
          }
          if (stockModelId.includes('fg_')) {
            return mold.modelName.toLowerCase().includes('fg') || mold.moldId.toLowerCase().includes('fg');
          }
          return mold.stockModels?.includes(order.stockModelId);
        });
        return compatibleMolds.length === 0;
      });
      
      console.log(`\n🔍 Analysis of unscheduled orders:`);
      console.log(`   - No compatible molds: ${moldCompatibilityIssues.length}`);
      console.log(`   - Other capacity/timing issues: ${unscheduledOrdersList.length - moldCompatibilityIssues.length}`);
    }

    res.json({
      success: true,
      allocations,
      analytics: {
        totalOrders: filteredOrders.length,
        scheduledOrders: allocations.length,
        efficiency: efficiency,
        moldUtilization,
        dailyCapacity,
        scheduleDays: workDates.length
      },
      stockModelGroups: Array.from(stockModelGroups.entries()).map(([id, orders]) => ({
        stockModelId: id,
        orderCount: orders.length,
        urgentCount: orders.filter((o: any) => isUrgent(o.dueDate)).length
      }))
    });

  } catch (error) {
    console.error('🔄 Algorithmic scheduler error:', error);
    res.status(500).json({ 
      error: 'Failed to generate algorithmic schedule',
      details: (error as Error).message 
    });
  }
});

// Helper function to generate work dates (Monday-Thursday)
function generateWorkDates(startDate: Date, dayCount: number): Date[] {
  const dates = [];
  let currentDate = new Date(startDate);
  
  // Start from next Monday if today is Friday-Sunday
  while (currentDate.getDay() === 0 || currentDate.getDay() === 5 || currentDate.getDay() === 6) {
    currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
  }
  
  while (dates.length < dayCount) {
    const dayOfWeek = currentDate.getDay();
    
    // Only Monday (1) through Thursday (4)
    if (dayOfWeek >= 1 && dayOfWeek <= 4) {
      dates.push(new Date(currentDate));
    }
    
    currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
    
    // Skip weekend
    if (dayOfWeek === 4) {
      currentDate = new Date(currentDate.getTime() + 4 * 24 * 60 * 60 * 1000);
    }
  }
  
  return dates;
}

// Helper function to check if order is urgent (due within 7 days)
function isUrgent(dueDate: string): boolean {
  const due = new Date(dueDate);
  const now = new Date();
  const daysDiff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return daysDiff <= 7;
}

export default router;