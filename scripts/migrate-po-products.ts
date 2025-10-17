import { Client } from 'pg';

const PRODUCTION_URL = 'postgresql://neondb_owner:npg_8ybQvUYfuNm6@ep-wispy-sun-adm062ft.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';
const DEVELOPMENT_URL = 'postgresql://neondb_owner:npg_28YFPchwECLb@ep-sweet-smoke-adiyfj99.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function migratePOProducts() {
  const prodClient = new Client({ connectionString: PRODUCTION_URL });
  const devClient = new Client({ connectionString: DEVELOPMENT_URL });

  try {
    console.log('🔌 Connecting to production database...');
    await prodClient.connect();
    
    console.log('🔌 Connecting to development database...');
    await devClient.connect();

    // Get all data from production po_products table
    console.log('📥 Fetching po_products from production...');
    const result = await prodClient.query('SELECT * FROM po_products ORDER BY id');
    const products = result.rows;
    console.log(`✅ Found ${products.length} PO products in production`);

    // Clear development po_products table
    console.log('🗑️  Clearing development po_products table...');
    await devClient.query('DELETE FROM po_products');
    console.log('✅ Development po_products table cleared');

    // Insert production data into development
    if (products.length > 0) {
      console.log('📤 Importing PO products to development...');
      
      // Get column names from the first row
      const columns = Object.keys(products[0]);
      const columnNames = columns.join(', ');
      
      // Insert each product
      for (let i = 0; i < products.length; i++) {
        const product = products[i];
        const values = columns.map((col) => product[col]);
        const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');
        
        await devClient.query(
          `INSERT INTO po_products (${columnNames}) VALUES (${placeholders})`,
          values
        );
        
        if ((i + 1) % 100 === 0) {
          console.log(`  ✓ Imported ${i + 1}/${products.length} products...`);
        }
      }
      
      console.log(`✅ Successfully imported all ${products.length} PO products`);
    } else {
      console.log('ℹ️  No PO products to import');
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

migratePOProducts()
  .then(() => {
    console.log('✅ Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
