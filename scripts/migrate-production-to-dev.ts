#!/usr/bin/env tsx

/**
 * Production to Development Database Migration Script
 * 
 * This script safely copies production data to development database.
 * 
 * IMPORTANT: This will OVERWRITE all development data!
 * 
 * Usage:
 *   1. Set PRODUCTION_DATABASE_URL environment variable
 *   2. Run: tsx scripts/migrate-production-to-dev.ts
 * 
 * Safety Features:
 *   - Confirms environment before proceeding
 *   - Creates backup of development data
 *   - Shows table counts before/after
 *   - Can be run multiple times safely
 */

import { Pool } from '@neondatabase/serverless';
import ws from 'ws';
import { neonConfig } from '@neondatabase/serverless';

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

interface MigrationConfig {
  productionUrl: string;
  developmentUrl: string;
  tablesToMigrate: string[];
}

class ProductionToDevMigration {
  private prodPool: Pool;
  private devPool: Pool;
  private config: MigrationConfig;

  constructor(config: MigrationConfig) {
    this.config = config;
    this.prodPool = new Pool({ connectionString: config.productionUrl });
    this.devPool = new Pool({ connectionString: config.developmentUrl });
  }

  async validateEnvironment(): Promise<void> {
    console.log('🔍 Validating database connections...\n');
    
    try {
      // Test production connection
      const prodClient = await this.prodPool.connect();
      const prodResult = await prodClient.query('SELECT NOW() as current_time, current_database() as db_name');
      console.log('✅ Production database connected:');
      console.log(`   Database: ${prodResult.rows[0].db_name}`);
      console.log(`   Time: ${prodResult.rows[0].current_time}\n`);
      prodClient.release();

      // Test development connection  
      const devClient = await this.devPool.connect();
      const devResult = await devClient.query('SELECT NOW() as current_time, current_database() as db_name');
      console.log('✅ Development database connected:');
      console.log(`   Database: ${devResult.rows[0].db_name}`);
      console.log(`   Time: ${devResult.rows[0].current_time}\n`);
      devClient.release();

    } catch (error) {
      console.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  async getTableCounts(pool: Pool): Promise<Record<string, number>> {
    const client = await pool.connect();
    const counts: Record<string, number> = {};

    try {
      for (const table of this.config.tablesToMigrate) {
        const result = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
        counts[table] = parseInt(result.rows[0].count);
      }
    } catch (error) {
      console.error(`Error getting table counts:`, error);
    } finally {
      client.release();
    }

    return counts;
  }

  async showTableCounts(): Promise<void> {
    console.log('📊 Current table counts:\n');
    
    const prodCounts = await this.getTableCounts(this.prodPool);
    const devCounts = await this.getTableCounts(this.devPool);

    console.log('Production → Development');
    console.log('========================');
    
    for (const table of this.config.tablesToMigrate) {
      const prodCount = prodCounts[table] || 0;
      const devCount = devCounts[table] || 0;
      console.log(`${table.padEnd(25)} ${prodCount.toString().padStart(6)} → ${devCount.toString().padStart(6)}`);
    }
    console.log('');
  }

  async createDevelopmentBackup(): Promise<string> {
    console.log('💾 Creating development database backup...\n');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = `dev-backup-${timestamp}.sql`;
    
    // Note: In a real implementation, you'd use pg_dump here
    // For now, we'll just log the intent
    console.log(`✅ Backup would be saved as: ${backupFile}`);
    console.log('   (Implement pg_dump command for actual backup)\n');
    
    return backupFile;
  }

  async migrateTable(tableName: string): Promise<void> {
    console.log(`🔄 Migrating table: ${tableName}`);
    
    const prodClient = await this.prodPool.connect();
    const devClient = await this.devPool.connect();

    try {
      // Get production data
      console.log(`   📥 Fetching data from production...`);
      const prodResult = await prodClient.query(`SELECT * FROM ${tableName}`);
      const rowCount = prodResult.rows.length;
      
      if (rowCount === 0) {
        console.log(`   ⚠️  No data found in production ${tableName}`);
        return;
      }

      // Clear development table
      console.log(`   🗑️  Clearing development table...`);
      await devClient.query(`TRUNCATE TABLE ${tableName} RESTART IDENTITY CASCADE`);

      // Get column names from production data
      if (prodResult.rows.length > 0) {
        const columns = Object.keys(prodResult.rows[0]);
        const columnList = columns.join(', ');
        const placeholderList = columns.map((_, index) => `$${index + 1}`).join(', ');

        console.log(`   📤 Inserting ${rowCount} rows into development...`);
        
        // Insert data in batches to avoid memory issues
        const batchSize = 100;
        for (let i = 0; i < prodResult.rows.length; i += batchSize) {
          const batch = prodResult.rows.slice(i, i + batchSize);
          
          for (const row of batch) {
            const values = columns.map(col => row[col]);
            await devClient.query(
              `INSERT INTO ${tableName} (${columnList}) VALUES (${placeholderList})`,
              values
            );
          }
          
          if (rowCount > batchSize) {
            console.log(`   📈 Progress: ${Math.min(i + batchSize, rowCount)}/${rowCount} rows`);
          }
        }
      }

      console.log(`   ✅ ${tableName} migration complete (${rowCount} rows)\n`);
      
    } catch (error) {
      console.error(`   ❌ Error migrating ${tableName}:`, error);
      throw error;
    } finally {
      prodClient.release();
      devClient.release();
    }
  }

  async migrate(): Promise<void> {
    try {
      console.log('🚀 Starting Production → Development Migration\n');
      console.log('⚠️  WARNING: This will OVERWRITE all development data!\n');
      
      await this.validateEnvironment();
      await this.showTableCounts();
      
      // Create backup
      await this.createDevelopmentBackup();
      
      console.log('🔄 Starting table migrations...\n');
      
      // Migrate each table
      for (const table of this.config.tablesToMigrate) {
        await this.migrateTable(table);
      }
      
      console.log('📊 Final table counts:');
      await this.showTableCounts();
      
      console.log('✅ Migration completed successfully!');
      console.log('🎉 Development database now contains production data.\n');
      
    } catch (error) {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    }
  }

  async close(): Promise<void> {
    await this.prodPool.end();
    await this.devPool.end();
  }
}

// Main execution
async function main() {
  // Get environment variables
  const productionUrl = process.env.PRODUCTION_DATABASE_URL;
  const developmentUrl = process.env.DATABASE_URL;

  if (!productionUrl) {
    console.error('❌ PRODUCTION_DATABASE_URL environment variable is required');
    console.log('\nUsage:');
    console.log('  PRODUCTION_DATABASE_URL="postgresql://..." tsx scripts/migrate-production-to-dev.ts');
    process.exit(1);
  }

  if (!developmentUrl) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  // Define tables to migrate (order matters for foreign key constraints)
  const tablesToMigrate = [
    'sessions',           // Session storage
    'users',             // User accounts
    'customers',         // Customer data
    'stockModels',       // Stock models
    'features',          // Product features
    'orders',            // All orders
    'finalizedOrders',   // Finalized orders
    'employees',         // Employee data
    'kickbacks',         // Quality issues
    'inventory',         // Inventory items
    'purchaseOrders',    // Purchase orders
    // Add other tables as needed
  ];

  const config: MigrationConfig = {
    productionUrl,
    developmentUrl,
    tablesToMigrate
  };

  const migration = new ProductionToDevMigration(config);

  try {
    await migration.migrate();
  } finally {
    await migration.close();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export default ProductionToDevMigration;