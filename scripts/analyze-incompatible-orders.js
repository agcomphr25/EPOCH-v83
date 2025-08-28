
const fetch = require('node-fetch');

async function analyzeIncompatibleOrders() {
  try {
    // Fetch data from your API endpoints
    const [ordersResponse, moldsResponse] = await Promise.all([
      fetch('http://localhost:5000/api/p1-layup-queue'),
      fetch('http://localhost:5000/api/molds')
    ]);

    const orders = await ordersResponse.json();
    const molds = await moldsResponse.json();

    console.log(`📊 Analyzing ${orders.length} orders against ${molds.length} molds`);

    // Filter only enabled molds
    const enabledMolds = molds.filter(m => m.enabled);
    console.log(`🔧 ${enabledMolds.length} enabled molds found`);

    const incompatibleOrders = [];
    const incorrectAssignments = [];

    orders.forEach(order => {
      // Use same logic as LayupScheduler
      let modelId = order.stockModelId || order.modelId;
      
      // For production orders and P1 purchase orders, try to use the part name
      if ((order.source === 'production_order' || order.source === 'p1_purchase_order') && order.product) {
        modelId = order.product;
      }

      if (!modelId) {
        incompatibleOrders.push({
          orderId: order.orderId,
          reason: 'No modelId or stockModelId',
          source: order.source,
          product: order.product
        });
        return;
      }

      // Check for compatible molds
      const compatibleMolds = enabledMolds.filter(mold => {
        if (!mold.stockModels || mold.stockModels.length === 0) {
          return true; // No restrictions - compatible with all
        }
        return mold.stockModels.includes(modelId);
      });

      if (compatibleMolds.length === 0) {
        incompatibleOrders.push({
          orderId: order.orderId,
          reason: 'No compatible molds',
          modelId: modelId,
          source: order.source,
          product: order.product,
          availableMoldModels: enabledMolds
            .filter(m => m.stockModels && m.stockModels.length > 0)
            .map(m => m.stockModels)
            .flat()
            .filter((v, i, a) => a.indexOf(v) === i) // unique values
            .slice(0, 10) // first 10 for brevity
        });
      } else {
        // Check for specific problematic assignments mentioned by user
        if (order.orderId === 'AH009' && modelId === 'mesa_universal') {
          const alpineHunterMolds = enabledMolds.filter(m => 
            m.modelName && m.modelName.toLowerCase().includes('alpine') && 
            m.modelName.toLowerCase().includes('hunter')
          );
          if (alpineHunterMolds.length > 0) {
            incorrectAssignments.push({
              orderId: order.orderId,
              modelId: modelId,
              issue: 'Mesa Universal assigned to Alpine Hunter mold',
              correctMolds: compatibleMolds.map(m => m.modelName)
            });
          }
        }
        
        if ((order.orderId === 'AJ150' || order.orderId === 'AJ149') && 
            modelId && modelId.toLowerCase().includes('privateer')) {
          const sportsmanMolds = enabledMolds.filter(m => 
            m.modelName && m.modelName.toLowerCase().includes('sportsman')
          );
          if (sportsmanMolds.length > 0) {
            incorrectAssignments.push({
              orderId: order.orderId,
              modelId: modelId,
              issue: 'FG Privateer assigned to Sportsman mold',
              correctMolds: compatibleMolds.map(m => m.modelName)
            });
          }
        }
      }
    });

    console.log(`\n❌ Found ${incompatibleOrders.length} incompatible orders:`);
    console.log(`🔧 Found ${incorrectAssignments.length} incorrect assignments:`);

    // Group by reason
    const byReason = incompatibleOrders.reduce((acc, order) => {
      if (!acc[order.reason]) acc[order.reason] = [];
      acc[order.reason].push(order);
      return acc;
    }, {});

    Object.entries(byReason).forEach(([reason, orders]) => {
      console.log(`\n🔍 ${reason}: ${orders.length} orders`);
      orders.slice(0, 5).forEach(order => {
        console.log(`   • ${order.orderId} (source: ${order.source || 'unknown'})`);
        if (order.modelId) console.log(`     Model: ${order.modelId}`);
        if (order.product && order.product !== order.modelId) console.log(`     Product: ${order.product}`);
      });
      if (orders.length > 5) {
        console.log(`   ... and ${orders.length - 5} more`);
      }
    });

    // Show incorrect assignments
    if (incorrectAssignments.length > 0) {
      console.log(`\n🚨 INCORRECT MOLD ASSIGNMENTS:`);
      incorrectAssignments.forEach(assignment => {
        console.log(`   • ${assignment.orderId}: ${assignment.issue}`);
        console.log(`     Stock Model: ${assignment.modelId}`);
        console.log(`     Should use: ${assignment.correctMolds.join(', ')}`);
      });
    }

    // Show sample of available mold models
    const allMoldModels = enabledMolds
      .filter(m => m.stockModels && m.stockModels.length > 0)
      .map(m => m.stockModels)
      .flat()
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort();

    console.log(`\n🏭 Available mold stock models (${allMoldModels.length} total):`);
    allMoldModels.slice(0, 20).forEach(model => console.log(`   • ${model}`));
    if (allMoldModels.length > 20) {
      console.log(`   ... and ${allMoldModels.length - 20} more`);
    }

    // Show mold assignments
    console.log(`\n🔧 CURRENT MOLD CONFIGURATIONS:`);
    enabledMolds.forEach(mold => {
      console.log(`   • ${mold.modelName} (${mold.moldId})`);
      if (mold.stockModels && mold.stockModels.length > 0) {
        console.log(`     Supports: ${mold.stockModels.join(', ')}`);
      } else {
        console.log(`     Supports: ALL stock models (universal)`);
      }
    });

    // Output just the incompatible order IDs
    console.log(`\n📋 INCOMPATIBLE ORDER IDS:`);
    incompatibleOrders.forEach(order => {
      console.log(order.orderId);
    });

  } catch (error) {
    console.error('Error analyzing orders:', error);
  }
}

analyzeIncompatibleOrders();
