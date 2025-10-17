import { Client } from 'pg';

const PRODUCTION_URL = 'postgresql://neondb_owner:npg_8ybQvUYfuNm6@ep-wispy-sun-adm062ft.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';
const DEVELOPMENT_URL = 'postgresql://neondb_owner:npg_28YFPchwECLb@ep-sweet-smoke-adiyfj99.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function migrateAllOrders() {
  const prodClient = new Client({ connectionString: PRODUCTION_URL });
  const devClient = new Client({ connectionString: DEVELOPMENT_URL });

  try {
    console.log('🔌 Connecting to production database...');
    await prodClient.connect();
    
    console.log('🔌 Connecting to development database...');
    await devClient.connect();

    // Get all data from production all_orders table
    console.log('📥 Fetching all_orders from production...');
    const result = await prodClient.query('SELECT * FROM all_orders ORDER BY id');
    const orders = result.rows;
    console.log(`✅ Found ${orders.length} orders in production`);

    // Clear development all_orders table
    console.log('🗑️  Clearing development all_orders table...');
    await devClient.query('DELETE FROM all_orders');
    console.log('✅ Development all_orders table cleared');

    // Insert production data into development
    if (orders.length > 0) {
      console.log('📤 Importing orders to development...');
      
      // Get column names from the first row
      const columns = Object.keys(orders[0]);
      const columnNames = columns.join(', ');
      
      // Insert each order
      for (let i = 0; i < orders.length; i++) {
        const order = orders[i];
        const values = columns.map((col) => order[col]);
        const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');
        
        await devClient.query(
          `INSERT INTO all_orders (${columnNames}) VALUES (${placeholders})`,
          values
        );
        
        if ((i + 1) % 100 === 0) {
          console.log(`  ✓ Imported ${i + 1}/${orders.length} orders...`);
        }
      }
      
      console.log(`✅ Successfully imported all ${orders.length} orders`);
    } else {
      console.log('ℹ️  No orders to import');
    }

    console.log('\n🎉 Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prodClient.end();
    await devClient.end();
    console.log('🔌 Database connections closed');
  }
}

migrateAllOrders()
  .then(() => {
    console.log('✅ Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
