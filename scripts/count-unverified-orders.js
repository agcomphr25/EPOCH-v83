
const fetch = require('node-fetch');

async function countUnverifiedOrders() {
  try {
    console.log('🔍 Checking orders for ERP verification status...');
    
    // Get all orders with payment status to see verification status
    const ordersResponse = await fetch('http://localhost:5000/api/orders/with-payment-status');
    const orders = await ordersResponse.json();
    
    // Filter for orders that are NOT verified against previous ERP
    const unverifiedOrders = orders.filter(order => 
      !order.isVerified || order.isVerified === false || order.isVerified === null
    );
    
    // Also get breakdown by status
    const unverifiedByStatus = unverifiedOrders.reduce((acc, order) => {
      const status = order.status || 'UNKNOWN';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    
    // Get breakdown by department
    const unverifiedByDepartment = unverifiedOrders.reduce((acc, order) => {
      const dept = order.currentDepartment || 'Not Set';
      acc[dept] = (acc[dept] || 0) + 1;
      return acc;
    }, {});
    
    console.log(`\n📊 ERP VERIFICATION SUMMARY:`);
    console.log(`Total orders: ${orders.length}`);
    console.log(`Orders NOT verified against previous ERP: ${unverifiedOrders.length}`);
    console.log(`Orders verified against previous ERP: ${orders.length - unverifiedOrders.length}`);
    console.log(`Verification rate: ${(((orders.length - unverifiedOrders.length) / orders.length) * 100).toFixed(1)}%`);
    
    if (unverifiedOrders.length > 0) {
      console.log(`\n📋 Breakdown by Status:`);
      Object.entries(unverifiedByStatus).forEach(([status, count]) => {
        console.log(`  - ${status}: ${count} orders`);
      });
      
      console.log(`\n🏭 Breakdown by Department:`);
      Object.entries(unverifiedByDepartment).forEach(([dept, count]) => {
        console.log(`  - ${dept}: ${count} orders`);
      });
      
      console.log(`\n📝 First 20 unverified orders:`);
      unverifiedOrders.slice(0, 20).forEach((order, index) => {
        console.log(`${index + 1}. Order ID: ${order.orderId} | Status: ${order.status} | Department: ${order.currentDepartment || 'Not Set'} | Customer: ${order.customerName || order.customer || 'N/A'}`);
      });
      
      if (unverifiedOrders.length > 20) {
        console.log(`\n... and ${unverifiedOrders.length - 20} more unverified orders`);
      }
    } else {
      console.log('\n✅ All orders have been verified against previous ERP');
    }
    
  } catch (error) {
    console.error('❌ Error counting unverified orders:', error.message);
  }
}

// Run the script
console.log('🚀 Starting ERP verification count...');
countUnverifiedOrders();
