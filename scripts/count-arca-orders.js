
// Script to count orders with 6" ARCA selected
async function countArcaOrders() {
  try {
    // Fetch all orders
    const response = await fetch('http://localhost:5000/api/orders/all');
    const orders = await response.json();
    
    console.log(`Total orders: ${orders.length}`);
    
    let ordersWithArca = 0;
    let ordersWithArcaData = [];
    
    orders.forEach(order => {
      let hasArca = false;
      let arcaSource = '';
      let arcaValue = '';
      
      if (order.features) {
        // Check for various ARCA-related fields
        const arcaFields = [
          'arca_rail',
          'arca_rail_length',
          'arca_rail_size',
          'rail_system',
          'mounting_system',
          'bottom_metal',
          'bottom_rail'
        ];
        
        for (const field of arcaFields) {
          if (order.features[field]) {
            const value = order.features[field].toString().toLowerCase();
            // Check for 6" or 6 inch ARCA variations
            if (value.includes('6') && value.includes('arca')) {
              hasArca = true;
              arcaSource = field;
              arcaValue = order.features[field];
              break;
            }
            // Also check for just "6" in arca-related fields
            if (field.includes('arca') && value.includes('6')) {
              hasArca = true;
              arcaSource = field;
              arcaValue = order.features[field];
              break;
            }
          }
        }
        
        // Check if any feature contains "6" and "arca" together
        if (!hasArca) {
          Object.entries(order.features).forEach(([key, value]) => {
            if (value && typeof value === 'string') {
              const valueStr = value.toLowerCase();
              if ((valueStr.includes('6') && valueStr.includes('arca')) ||
                  (valueStr.includes('6"') && valueStr.includes('arca')) ||
                  (valueStr.includes('6 inch') && valueStr.includes('arca'))) {
                hasArca = true;
                arcaSource = key;
                arcaValue = value;
              }
            }
          });
        }
      }
      
      if (hasArca) {
        ordersWithArca++;
        ordersWithArcaData.push({
          orderId: order.orderId,
          source: arcaSource,
          value: arcaValue,
          modelId: order.modelId,
          customerName: order.customer || 'N/A'
        });
      }
    });
    
    console.log(`\nOrders with 6" ARCA: ${ordersWithArca}`);
    console.log(`Percentage: ${((ordersWithArca / orders.length) * 100).toFixed(1)}%`);
    
    if (ordersWithArcaData.length > 0) {
      console.log('\nBreakdown by field:');
      const bySource = ordersWithArcaData.reduce((acc, order) => {
        acc[order.source] = (acc[order.source] || 0) + 1;
        return acc;
      }, {});
      
      Object.entries(bySource).forEach(([source, count]) => {
        console.log(`  ${source}: ${count}`);
      });
      
      console.log('\nDetailed list:');
      ordersWithArcaData.forEach(order => {
        console.log(`  ${order.orderId}: ${order.value} (from ${order.source}) - Model: ${order.modelId} - Customer: ${order.customerName}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the analysis
countArcaOrders();
