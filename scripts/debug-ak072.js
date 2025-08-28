
const fetch = require('node-fetch');

async function debugOrder() {
  try {
    console.log('🔍 Debugging FB Order #AK072...');
    
    // Get all orders to find AK072
    const ordersResponse = await fetch('http://localhost:5000/api/orders/with-payment-status');
    const orders = await ordersResponse.json();
    
    // Find the specific order
    const ak072Order = orders.find(order => 
      order.fbOrderNumber === 'AK072'
    );
    
    if (!ak072Order) {
      console.log('❌ Order with FB Order Number AK072 not found in system');
      
      // Check if it might be stored differently
      const similarOrders = orders.filter(order => 
        order.fbOrderNumber && order.fbOrderNumber.includes('AK072') ||
        order.orderId && order.orderId.includes('AK072')
      );
      
      if (similarOrders.length > 0) {
        console.log('🔍 Found similar orders:');
        similarOrders.forEach(order => {
          console.log(`  - Order ID: ${order.orderId}, FB Order #: ${order.fbOrderNumber}, Current Dept: ${order.currentDepartment}`);
        });
      }
      
      return;
    }
    
    console.log('✅ Found Order AK072:');
    console.log(`  - Database ID: ${ak072Order.id}`);
    console.log(`  - Order ID: ${ak072Order.orderId}`);
    console.log(`  - FB Order Number: ${ak072Order.fbOrderNumber}`);
    console.log(`  - Current Department: ${ak072Order.currentDepartment}`);
    console.log(`  - Status: ${ak072Order.status}`);
    console.log(`  - Created At: ${ak072Order.createdAt}`);
    console.log(`  - Updated At: ${ak072Order.updatedAt}`);
    
    // Check if it's in draft orders table
    try {
      const draftResponse = await fetch(`http://localhost:5000/api/orders/draft/${ak072Order.orderId}`);
      if (draftResponse.ok) {
        const draftOrder = await draftResponse.json();
        console.log('📝 Order found in DRAFT table:');
        console.log(`  - Status: ${draftOrder.status}`);
        console.log(`  - Department: ${draftOrder.currentDepartment}`);
      }
    } catch (draftError) {
      console.log('📋 Order not found in draft table (likely finalized)');
    }
    
    // Check if it's in finalized orders
    try {
      const finalizedResponse = await fetch(`http://localhost:5000/api/orders/finalized/${ak072Order.orderId}`);
      if (finalizedResponse.ok) {
        const finalizedOrder = await finalizedResponse.json();
        console.log('🏭 Order found in FINALIZED table:');
        console.log(`  - Department: ${finalizedOrder.currentDepartment}`);
        console.log(`  - Status: ${finalizedOrder.status}`);
      }
    } catch (finalizedError) {
      console.log('📋 Order not found in finalized table');
    }
    
    console.log('\n🎯 Analysis:');
    if (ak072Order.currentDepartment === 'Paint') {
      console.log('✅ Order IS in Paint department - the move was successful!');
    } else {
      console.log(`❌ Order is still in ${ak072Order.currentDepartment} department`);
      console.log('💡 Possible reasons:');
      console.log('  1. Order might be in draft status and needs to be finalized first');
      console.log('  2. Order might not have the exact FB Order Number "AK072"');
      console.log('  3. Database update might have failed');
      console.log('  4. Order might be in a different table than expected');
    }
    
  } catch (error) {
    console.error('❌ Error debugging order:', error.message);
  }
}

// Run the debug
console.log('🚀 Starting AK072 debug analysis...');
debugOrder();
