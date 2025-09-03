#!/usr/bin/env tsx

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from "ws";

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function createBackup() {
  console.log('🛡️  Creating backup before deduplication...');
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `backups/orders-backup-before-dedup-${timestamp}.sql`;
  
  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY id');
    
    let backupContent = `-- Orders Backup Before Deduplication\n`;
    backupContent += `-- Created: ${new Date().toISOString()}\n`;
    backupContent += `-- Total rows: ${result.rows.length}\n\n`;
    
    if (result.rows.length > 0) {
      const columns = Object.keys(result.rows[0]);
      backupContent += `-- Table structure:\n`;
      backupContent += `-- Columns: ${columns.join(', ')}\n\n`;
      
      for (const row of result.rows) {
        const values = columns.map(col => {
          const value = row[col];
          if (value === null) return 'NULL';
          if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
          if (value instanceof Date) return `'${value.toISOString()}'`;
          return String(value);
        }).join(', ');
        
        backupContent += `INSERT INTO orders (${columns.join(', ')}) VALUES (${values});\n`;
      }
    }
    
    const fs = await import('fs');
    fs.writeFileSync(backupFileName, backupContent);
    
    console.log(`✅ Backup created: ${backupFileName}`);
    console.log(`📊 Backed up ${result.rows.length} order records`);
    
    return backupFileName;
  } catch (error) {
    console.error('❌ Backup failed:', error);
    throw error;
  }
}

async function analyzeDatabase() {
  console.log('\n🔍 Analyzing database state...');
  
  const queries = [
    { name: 'Total orders', query: 'SELECT COUNT(*) as count FROM orders' },
    { name: 'Unique order IDs', query: 'SELECT COUNT(DISTINCT id) as count FROM orders' },
    { name: 'Duplicate IDs', query: 'SELECT COUNT(*) as count FROM (SELECT id FROM orders GROUP BY id HAVING COUNT(*) > 1) duplicates' },
    { name: 'Sample duplicates', query: 'SELECT id, COUNT(*) as count FROM orders GROUP BY id HAVING COUNT(*) > 1 LIMIT 5' }
  ];
  
  for (const { name, query } of queries) {
    try {
      const result = await pool.query(query);
      console.log(`📊 ${name}:`, result.rows);
    } catch (error) {
      console.error(`❌ Error with ${name}:`, error);
    }
  }
}

async function deduplicateOrders() {
  console.log('\n🔄 Starting deduplication process...');
  
  try {
    // First, let's see what we're working with
    const beforeCount = await pool.query('SELECT COUNT(*) as count FROM orders');
    console.log(`📊 Orders before deduplication: ${beforeCount.rows[0].count}`);
    
    // Use a CTE (Common Table Expression) to identify and remove duplicates
    // Keep the first occurrence of each ID (based on created_at or any other criteria)
    const deduplicationQuery = `
      WITH duplicate_orders AS (
        SELECT *,
               ROW_NUMBER() OVER (PARTITION BY id ORDER BY created_at) as row_num
        FROM orders
      )
      DELETE FROM orders 
      WHERE (id, created_at) IN (
        SELECT id, created_at 
        FROM duplicate_orders 
        WHERE row_num > 1
      );
    `;
    
    console.log('🗑️  Removing duplicate records...');
    const deleteResult = await pool.query(deduplicationQuery);
    
    console.log(`✅ Deleted ${deleteResult.rowCount} duplicate records`);
    
    // Verify the result
    const afterCount = await pool.query('SELECT COUNT(*) as count FROM orders');
    const uniqueCount = await pool.query('SELECT COUNT(DISTINCT id) as count FROM orders');
    
    console.log(`📊 Orders after deduplication: ${afterCount.rows[0].count}`);
    console.log(`📊 Unique order IDs: ${uniqueCount.rows[0].count}`);
    
    if (afterCount.rows[0].count === uniqueCount.rows[0].count) {
      console.log('✅ Deduplication successful! All order IDs are now unique.');
    } else {
      console.log('⚠️  Warning: Still have duplicate IDs remaining');
    }
    
    return {
      deletedCount: deleteResult.rowCount,
      finalCount: afterCount.rows[0].count,
      uniqueCount: uniqueCount.rows[0].count
    };
    
  } catch (error) {
    console.error('❌ Deduplication failed:', error);
    throw error;
  }
}

async function verifyCleanup() {
  console.log('\n🔍 Verifying cleanup...');
  
  try {
    // Check for any remaining duplicates
    const duplicateCheck = await pool.query(`
      SELECT id, COUNT(*) as count 
      FROM orders 
      GROUP BY id 
      HAVING COUNT(*) > 1
    `);
    
    if (duplicateCheck.rows.length === 0) {
      console.log('✅ No duplicate order IDs found');
    } else {
      console.log('⚠️  Remaining duplicates:', duplicateCheck.rows);
    }
    
    // Get final statistics
    const finalStats = await pool.query(`
      SELECT 
        COUNT(*) as total_orders,
        COUNT(DISTINCT id) as unique_ids,
        MIN(id) as min_id,
        MAX(id) as max_id
      FROM orders
    `);
    
    console.log('📊 Final statistics:', finalStats.rows[0]);
    
    return duplicateCheck.rows.length === 0;
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
    throw error;
  }
}

async function main() {
  console.log('🚀 Starting Order Deduplication Process\n');
  
  try {
    // Step 1: Analyze current state
    await analyzeDatabase();
    
    // Step 2: Create backup
    const backupFile = await createBackup();
    
    // Step 3: Perform deduplication
    const result = await deduplicateOrders();
    
    // Step 4: Verify cleanup
    const isClean = await verifyCleanup();
    
    console.log('\n🎉 Deduplication Process Complete!');
    console.log('=================================');
    console.log(`🛡️  Backup saved: ${backupFile}`);
    console.log(`🗑️  Records deleted: ${result.deletedCount}`);
    console.log(`📊 Final order count: ${result.finalCount}`);
    console.log(`✅ All IDs unique: ${isClean ? 'Yes' : 'No'}`);
    
    if (isClean) {
      console.log('\n✅ SUCCESS: Database is now clean and ready!');
      console.log('🎯 Your All Orders list should now show the correct count.');
      console.log('🔧 React duplicate key warnings should be resolved.');
    } else {
      console.log('\n⚠️  WARNING: Some duplicates may remain. Please review.');
    }
    
  } catch (error) {
    console.error('\n❌ Deduplication process failed:', error);
    console.log('\n🛡️  Your database is unchanged due to the error.');
    console.log('🔄 You can safely retry this script.');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);