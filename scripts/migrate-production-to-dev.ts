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

  async createDatabaseBackup(pool: Pool, dbName: string): Promise<string> {
    console.log(`💾 Creating ${dbName} database backup...\n`);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = `${dbName}-backup-${timestamp}.sql`;
    
    const client = await pool.connect();
    
    try {
      // Create backups directory if it doesn't exist
      const fs = require('fs');
      const path = require('path');
      const backupDir = path.join(process.cwd(), 'backups');
      
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
        console.log(`📁 Created backups directory: ${backupDir}`);
      }
      
      const backupPath = path.join(backupDir, backupFile);
      
      // Get all table names
      const tablesResult = await client.query(`
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY tablename
      `);
      
      const tables = tablesResult.rows.map(row => row.tablename);
      console.log(`📋 Found ${tables.length} tables to backup: ${tables.join(', ')}`);
      
      // Create SQL backup file content
      let backupContent = `-- Database Backup: ${dbName}\n`;
      backupContent += `-- Created: ${new Date().toISOString()}\n`;
      backupContent += `-- Tables: ${tables.join(', ')}\n\n`;
      
      // Add table creation and data for each table
      for (const tableName of tables) {
        console.log(`   📦 Backing up table: ${tableName}`);
        
        // Get table schema
        const schemaResult = await client.query(`
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns 
          WHERE table_name = $1 AND table_schema = 'public'
          ORDER BY ordinal_position
        `, [tableName]);
        
        // Get table data
        const dataResult = await client.query(`SELECT * FROM "${tableName}"`);
        
        backupContent += `-- Table: ${tableName}\n`;
        backupContent += `-- Rows: ${dataResult.rows.length}\n`;
        
        if (dataResult.rows.length > 0) {
          const columns = Object.keys(dataResult.rows[0]);
          
          // Create INSERT statements
          for (const row of dataResult.rows) {
            const values = columns.map(col => {
              const value = row[col];
              if (value === null) return 'NULL';
              if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
              if (value instanceof Date) return `'${value.toISOString()}'`;
              if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
              return value;
            });
            
            backupContent += `INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${values.join(', ')});\n`;
          }
        }
        
        backupContent += '\n';
      }
      
      // Write backup file
      fs.writeFileSync(backupPath, backupContent);
      
      console.log(`✅ ${dbName} backup created: ${backupPath}`);
      console.log(`📊 Backup contains ${tables.length} tables\n`);
      
      return backupPath;
      
    } catch (error) {
      console.error(`❌ Error creating ${dbName} backup:`, error);
      throw error;
    } finally {
      client.release();
    }
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
      
      // Create backups of BOTH databases before proceeding
      console.log('🛡️  Creating safety backups before migration...\n');
      const prodBackupPath = await this.createDatabaseBackup(this.prodPool, 'production');
      const devBackupPath = await this.createDatabaseBackup(this.devPool, 'development');
      
      console.log('🔒 Backup Summary:');
      console.log(`   Production backup: ${prodBackupPath}`);
      console.log(`   Development backup: ${devBackupPath}`);
      console.log('   Both databases are now safely backed up!\n');
      
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

// Interactive prompt for database URL
function promptForInput(question: string): Promise<string> {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer: string) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Main execution
async function main() {
  console.log('🚀 Production to Development Database Migration');
  console.log('===============================================\n');
  
  // Get development URL from environment
  const developmentUrl = process.env.DATABASE_URL;

  if (!developmentUrl) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  // Prompt for production database URL
  console.log('📋 Please provide your production database connection string');
  console.log('   (This should look like: postgresql://user:password@host:port/database)\n');
  
  const productionUrl = await promptForInput('🔗 Enter production DATABASE_URL: ');

  if (!productionUrl || !productionUrl.startsWith('postgresql://')) {
    console.error('❌ Invalid database URL. Must start with postgresql://');
    process.exit(1);
  }

  console.log('\n✅ Database URL received successfully!\n');

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