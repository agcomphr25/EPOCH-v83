
// Script to count orders with Action Length entries
async function countOrdersWithActionLength() {
  try {
    // Fetch all orders
    const response = await fetch('http://localhost:5000/api/orders/all');
    const orders = await response.json();
    
    console.log(`Total orders: ${orders.length}`);
    
    let ordersWithActionLength = 0;
    let ordersWithActionData = [];
    
    orders.forEach(order => {
      let hasActionLength = false;
      let actionLengthSource = '';
      let actionLengthValue = '';
      
      if (order.features) {
        // Direct action_length field
        if (order.features.action_length && order.features.action_length !== 'none') {
          hasActionLength = true;
          actionLengthSource = 'direct';
          actionLengthValue = order.features.action_length;
        }
        // Derived from action_inlet
        else if (order.features.action_inlet) {
          const actionToLengthMap = {
            'anti_ten_hunter_def': 'SA',
            'def_dev_hunter_rem': 'LA',
            'remington_700': 'SA',
            'rem_700': 'SA',
            'tikka_t3': 'SA',
            'lone_peak_fuzion': 'SA',
            'lone_peak_razorback': 'SA',
            // Add more mappings as needed
          };
          
          if (actionToLengthMap[order.features.action_inlet]) {
            hasActionLength = true;
            actionLengthSource = 'action_inlet';
            actionLengthValue = actionToLengthMap[order.features.action_inlet];
          }
        }
        // Derived from action field
        else if (order.features.action) {
          hasActionLength = true;
          actionLengthSource = 'action';
          actionLengthValue = 'derived';
        }
      }
      
      if (hasActionLength) {
        ordersWithActionLength++;
        ordersWithActionData.push({
          orderId: order.orderId,
          source: actionLengthSource,
          value: actionLengthValue,
          modelId: order.modelId
        });
      }
    });
    
    console.log(`\nOrders with Action Length data: ${ordersWithActionLength}`);
    console.log(`Percentage: ${((ordersWithActionLength / orders.length) * 100).toFixed(1)}%`);
    
    console.log('\nBreakdown by source:');
    const bySource = ordersWithActionData.reduce((acc, order) => {
      acc[order.source] = (acc[order.source] || 0) + 1;
      return acc;
    }, {});
    
    Object.entries(bySource).forEach(([source, count]) => {
      console.log(`  ${source}: ${count}`);
    });
    
    console.log('\nDetailed list:');
    ordersWithActionData.forEach(order => {
      console.log(`  ${order.orderId}: ${order.value} (from ${order.source}) - Model: ${order.modelId}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the analysis
countOrdersWithActionLength();
