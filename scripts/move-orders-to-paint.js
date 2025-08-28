
const fetch = require('node-fetch');

// FB Order Numbers to move to Paint department
const fbOrderNumbers = [
  'AK072', 'AK119', 'AK120', 'AK126', 'AK164',
  'AL043', 'AL052', 'AL066', 'AL089', 'AO123'
];

async function moveOrdersToPaint() {
  try {
    console.log('🔍 Fetching all orders to find matching FB Order Numbers...');
    
    // Get all orders to find the ones with matching FB Order Numbers
    const ordersResponse = await fetch('http://localhost:5000/api/orders/with-payment-status');
    const orders = await ordersResponse.json();
    
    // Find orders that match the FB Order Numbers
    const matchingOrders = orders.filter(order => 
      order.fbOrderNumber && fbOrderNumbers.includes(order.fbOrderNumber)
    );
    
    if (matchingOrders.length === 0) {
      console.log('❌ No orders found with the specified FB Order Numbers');
      return;
    }
    
    console.log(`✅ Found ${matchingOrders.length} matching orders:`);
    matchingOrders.forEach(order => {
      console.log(`  - Order ID: ${order.orderId}, FB Order #: ${order.fbOrderNumber}, Current Dept: ${order.currentDepartment}`);
    });
    
    // Extract order IDs for the bulk update
    const orderIds = matchingOrders.map(order => order.orderId);
    
    console.log('\n🎨 Moving orders to Paint department...');
    
    // Use the bulk department update endpoint
    const updateResponse = await fetch('http://localhost:5000/api/update-department', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        orderIds: orderIds,
        department: 'Paint',
        status: 'IN_PROGRESS'
      })
    });
    
    const result = await updateResponse.json();
    
    if (updateResponse.ok) {
      console.log('✅ Successfully moved orders to Paint department!');
      console.log(`Updated ${result.updatedOrders} out of ${orderIds.length} orders`);
      
      // Show summary of moved orders
      console.log('\n📋 Summary of moved orders:');
      matchingOrders.forEach(order => {
        console.log(`  ✓ ${order.fbOrderNumber} (${order.orderId}) → Paint`);
      });
    } else {
      console.error('❌ Failed to move orders:', result.error);
    }
    
  } catch (error) {
    console.error('❌ Error moving orders:', error.message);
  }
}

// Run the script
console.log('🚀 Starting FB Orders to Paint department migration...');
moveOrdersToPaint();
