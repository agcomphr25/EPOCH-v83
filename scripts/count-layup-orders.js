
const fetch = require('node-fetch');

async function countLayupOrders() {
  try {
    console.log('🔍 Checking orders in Layup department...');
    
    // Get all orders with payment status to see current departments
    const ordersResponse = await fetch('http://localhost:5000/api/orders/with-payment-status');
    const orders = await ordersResponse.json();
    
    // Filter for orders currently in "Layup" department
    const layupOrders = orders.filter(order => 
      order.currentDepartment === 'Layup'
    );
    
    console.log(`\n📊 LAYUP DEPARTMENT SUMMARY:`);
    console.log(`Total orders in Layup department: ${layupOrders.length}`);
    
    if (layupOrders.length > 0) {
      console.log(`\n📋 Orders in Layup department:`);
      layupOrders.forEach((order, index) => {
        console.log(`${index + 1}. Order ID: ${order.orderId} | FB Order #: ${order.fbOrderNumber || 'N/A'} | Status: ${order.status}`);
      });
      
      // Show breakdown by status if applicable
      const statusBreakdown = layupOrders.reduce((acc, order) => {
        acc[order.status] = (acc[order.status] || 0) + 1;
        return acc;
      }, {});
      
      console.log(`\n📈 Status breakdown:`);
      Object.entries(statusBreakdown).forEach(([status, count]) => {
        console.log(`  - ${status}: ${count} orders`);
      });
    } else {
      console.log('\n✅ No orders currently in Layup department');
    }
    
  } catch (error) {
    console.error('❌ Error counting layup orders:', error.message);
  }
}

// Run the script
console.log('🚀 Starting Layup department order count...');
countLayupOrders();
