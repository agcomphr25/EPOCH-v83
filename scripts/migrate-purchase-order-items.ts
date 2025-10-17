import { Client } from 'pg';

const PRODUCTION_URL = 'postgresql://neondb_owner:npg_8ybQvUYfuNm6@ep-wispy-sun-adm062ft.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';
const DEVELOPMENT_URL = 'postgresql://neondb_owner:npg_28YFPchwECLb@ep-sweet-smoke-adiyfj99.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function migratePurchaseOrderItems() {
  const prodClient = new Client({ connectionString: PRODUCTION_URL });
  const devClient = new Client({ connectionString: DEVELOPMENT_URL });

  try {
    console.log('🔌 Connecting to production database...');
    await prodClient.connect();
    
    console.log('🔌 Connecting to development database...');
    await devClient.connect();

    // Get all data from production purchase_order_items table
    console.log('📥 Fetching purchase_order_items from production...');
    const result = await prodClient.query('SELECT * FROM purchase_order_items ORDER BY id');
    const items = result.rows;
    console.log(`✅ Found ${items.length} purchase order items in production`);

    // Clear development purchase_order_items table
    console.log('🗑️  Clearing development purchase_order_items table...');
    await devClient.query('DELETE FROM purchase_order_items');
    console.log('✅ Development purchase_order_items table cleared');

    // Insert production data into development
    if (items.length > 0) {
      console.log('📤 Importing purchase order items to development...');
      
      // Get column names from the first row
      const columns = Object.keys(items[0]);
      const columnNames = columns.join(', ');
      
      // Insert each item
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const values = columns.map((col) => item[col]);
        const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');
        
        await devClient.query(
          `INSERT INTO purchase_order_items (${columnNames}) VALUES (${placeholders})`,
          values
        );
        
        if ((i + 1) % 100 === 0) {
          console.log(`  ✓ Imported ${i + 1}/${items.length} items...`);
        }
      }
      
      console.log(`✅ Successfully imported all ${items.length} purchase order items`);
    } else {
      console.log('ℹ️  No purchase order items to import');
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

migratePurchaseOrderItems()
  .then(() => {
    console.log('✅ Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
