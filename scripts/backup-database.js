#!/usr/bin/env node

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Create a backup script that exports the database
async function createDatabaseBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupFileName = `database_backup_${timestamp}.sql`;
  const backupPath = path.join(__dirname, '..', backupFileName);
  
  console.log('Creating database backup...');
  console.log(`Backup file: ${backupFileName}`);
  
  // Use pg_dump with explicit version handling
  const command = `PGCLIENTENCODING=UTF8 pg_dump --no-password --verbose --clean --no-acl --no-owner "${process.env.DATABASE_URL}" > "${backupPath}"`;
  
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error('Backup failed:', error.message);
      return;
    }
    
    if (stderr) {
      console.log('Backup progress:', stderr);
    }
    
    console.log('✅ Database backup created successfully!');
    console.log(`📁 Backup saved to: ${backupPath}`);
    
    // Get file size
    const stats = fs.statSync(backupPath);
    const fileSizeInBytes = stats.size;
    const fileSizeInMB = (fileSizeInBytes / (1024 * 1024)).toFixed(2);
    
    console.log(`📊 Backup size: ${fileSizeInMB} MB`);
    console.log('');
    console.log('📋 Next steps:');
    console.log('1. Download this file from the Replit file explorer');
    console.log('2. Save it to your external hard drive');
    console.log('3. You can restore it later using: psql [database_url] < ' + backupFileName);
  });
}

createDatabaseBackup();