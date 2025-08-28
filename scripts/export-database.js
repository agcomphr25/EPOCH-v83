#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function exportDatabase() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const exportFileName = `database_export_${timestamp}.sql`;
  const exportPath = path.join(__dirname, '..', exportFileName);

  try {
    await client.connect();
    console.log('🔗 Connected to database');
    
    let sqlExport = '';
    
    // Add header
    sqlExport += `-- Database Export Created: ${new Date().toISOString()}\n`;
    sqlExport += `-- EPOCH v8 Manufacturing ERP System\n\n`;
    
    // Get all table names
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;
    
    const tablesResult = await client.query(tablesQuery);
    const tableNames = tablesResult.rows.map(row => row.table_name);
    
    console.log(`📊 Found ${tableNames.length} tables to export`);
    
    // Export each table
    for (const tableName of tableNames) {
      console.log(`📁 Exporting table: ${tableName}`);
      
      // Get table structure
      const createTableQuery = `
        SELECT 
          'CREATE TABLE ' || schemaname||'.'||tablename||' (' ||
          array_to_string(array_agg(column_name ||' '|| type || CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END), ', ') ||
          ');' as create_statement
        FROM (
          SELECT 
            schemaname, tablename, column_name, data_type as type, is_nullable
          FROM pg_tables t
          JOIN information_schema.columns c ON c.table_name = t.tablename
          WHERE schemaname = 'public' AND tablename = '${tableName}'
          ORDER BY ordinal_position
        ) a
        GROUP BY schemaname, tablename;
      `;
      
      try {
        const createResult = await client.query(createTableQuery);
        if (createResult.rows.length > 0) {
          sqlExport += `\n-- Table: ${tableName}\n`;
          sqlExport += `DROP TABLE IF EXISTS ${tableName} CASCADE;\n`;
          sqlExport += createResult.rows[0].create_statement + '\n';
        }
        
        // Get table data
        const dataQuery = `SELECT * FROM ${tableName}`;
        const dataResult = await client.query(dataQuery);
        
        if (dataResult.rows.length > 0) {
          const columns = Object.keys(dataResult.rows[0]);
          sqlExport += `\n-- Data for ${tableName}\n`;
          
          for (const row of dataResult.rows) {
            const values = columns.map(col => {
              const value = row[col];
              if (value === null) return 'NULL';
              if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
              if (value instanceof Date) return `'${value.toISOString()}'`;
              if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
              return value;
            });
            
            sqlExport += `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
          }
        }
        
        sqlExport += '\n';
        
      } catch (tableError) {
        console.warn(`⚠️  Warning: Could not export table ${tableName}:`, tableError.message);
        sqlExport += `-- Warning: Could not export table ${tableName}: ${tableError.message}\n\n`;
      }
    }
    
    // Write to file
    fs.writeFileSync(exportPath, sqlExport);
    
    // Get file size
    const stats = fs.statSync(exportPath);
    const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    console.log('✅ Database export completed successfully!');
    console.log(`📁 Export saved to: ${exportFileName}`);
    console.log(`📊 Export size: ${fileSizeInMB} MB`);
    console.log('');
    console.log('📋 Instructions for external backup:');
    console.log('1. Download the file from Replit file explorer');
    console.log('2. Save it to your external hard drive');
    console.log('3. To restore: Run the SQL file against a PostgreSQL database');
    console.log('   Example: psql -d database_name -f ' + exportFileName);
    
  } catch (error) {
    console.error('❌ Export failed:', error.message);
  } finally {
    await client.end();
  }
}

exportDatabase();