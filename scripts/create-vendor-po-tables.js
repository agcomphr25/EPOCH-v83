const { Client } = require('pg');

async function createVendorPOTables() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Create vendor_purchase_orders table
    await client.query(`
      CREATE TABLE IF NOT EXISTS vendor_purchase_orders (
        id SERIAL PRIMARY KEY,
        po_number TEXT UNIQUE NOT NULL,
        vendor_id INTEGER NOT NULL,
        vendor_name TEXT NOT NULL,
        buyer_name TEXT NOT NULL,
        po_date DATE NOT NULL,
        expected_delivery DATE NOT NULL,
        ship_via TEXT NOT NULL DEFAULT 'Delivery',
        status TEXT NOT NULL DEFAULT 'DRAFT',
        notes TEXT,
        barcode TEXT UNIQUE,
        total_cost REAL DEFAULT 0,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );
    `);
    console.log('Created vendor_purchase_orders table');

    // Create vendor_purchase_order_items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS vendor_purchase_order_items (
        id SERIAL PRIMARY KEY,
        vendor_po_id INTEGER NOT NULL REFERENCES vendor_purchase_orders(id) ON DELETE CASCADE,
        line_number INTEGER NOT NULL,
        ag_part_number TEXT,
        vendor_part_number TEXT NOT NULL,
        description TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price REAL DEFAULT 0,
        total_price REAL DEFAULT 0,
        uom TEXT NOT NULL DEFAULT 'EA',
        quantity_received INTEGER DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );
    `);
    console.log('Created vendor_purchase_order_items table');

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vendor_po_items_vendor_po_id ON vendor_purchase_order_items(vendor_po_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vendor_po_items_ag_part_number ON vendor_purchase_order_items(ag_part_number);
    `);
    console.log('Created indexes');

    console.log('All vendor PO tables created successfully!');
  } catch (error) {
    console.error('Error creating tables:', error);
  } finally {
    await client.end();
  }
}

createVendorPOTables();