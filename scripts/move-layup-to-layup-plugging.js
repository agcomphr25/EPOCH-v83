
const fetch = require('node-fetch');

async function moveLayupToLayupPlugging() {
  try {
    console.log('🔍 Fetching all orders to find orders in Layup department...');
    
    // Get all orders to find the ones in Layup department
    const ordersResponse = await fetch('http://localhost:5000/api/orders/with-payment-status');
    const orders = await ordersResponse.json();
    
    // Find orders that are currently in "Layup" department
    const layupOrders = orders.filter(order => 
      order.currentDepartment === 'Layup'
    );
    
    if (layupOrders.length === 0) {
      console.log('❌ No orders found in Layup department');
      return;
    }
    
    console.log(`✅ Found ${layupOrders.length} orders in Layup department:`);
    layupOrders.forEach(order => {
      console.log(`  - Order ID: ${order.orderId}, FB Order #: ${order.fbOrderNumber || 'N/A'}, Current Dept: ${order.currentDepartment}`);
    });
    
    // Extract order IDs for the bulk update
    const orderIds = layupOrders.map(order => order.orderId);
    
    console.log('\n🔄 Moving orders from Layup to Layup/Plugging department...');
    
    // Use the bulk department update endpoint
    const updateResponse = await fetch('http://localhost:5000/api/update-department', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        orderIds: orderIds,
        department: 'Layup/Plugging',
        status: 'IN_PROGRESS'
      })
    });
    
    const result = await updateResponse.json();
    
    if (updateResponse.ok) {
      console.log('✅ Successfully moved orders from Layup to Layup/Plugging department!');
      console.log(`Updated ${result.updatedOrders} out of ${orderIds.length} orders`);
      
      // Show summary of moved orders
      console.log('\n📋 Summary of moved orders:');
      layupOrders.forEach(order => {
        console.log(`  ✓ ${order.orderId} → Layup/Plugging`);
      });
    } else {
      console.error('❌ Failed to move orders:', result.error);
    }
    
  } catch (error) {
    console.error('❌ Error moving orders:', error.message);
  }
}

// Run the script
console.log('🚀 Starting Layup to Layup/Plugging department migration...');
moveLayupToLayupPlugging();
