/**
 * Sync exact training matrix data from development to production
 */

import pg from 'pg';
import { db } from '../../db';
import { trainingMatrix } from '../../schema';

const { Pool } = pg;

const PRODUCTION_DB_URL = 'postgresql://neondb_owner:npg_8ybQvUYfuNm6@ep-wispy-sun-adm062ft.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function syncExactData() {
  console.log('🔄 Syncing EXACT training matrix data from development to production...\n');

  const productionPool = new Pool({
    connectionString: PRODUCTION_DB_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // Get ALL entries from development
    const allEntries = await db.select().from(trainingMatrix);
    
    console.log(`📊 Development database has ${allEntries.length} total entries\n`);
    
    // Count by type
    const standards = allEntries.filter(e => !e.isLegacy);
    const certs = allEntries.filter(e => e.isLegacy);
    
    console.log(`  Standards (is_legacy = false): ${standards.length} entries`);
    console.log(`  Certifications (is_legacy = true): ${certs.length} entries\n`);
    
    // Clear production
    console.log('🗑️  Clearing production training_matrix...');
    await productionPool.query('DELETE FROM training_matrix');
    console.log('✅ Cleared\n');
    
    // Insert all entries
    console.log('📥 Inserting all entries into production...');
    for (const entry of allEntries) {
      await productionPool.query(
        `INSERT INTO training_matrix (
          employee_id, employee_name, job_title, department,
          training_name, last_completed, last_score, status,
          notes, is_legacy, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          entry.employeeId,
          entry.employeeName,
          entry.jobTitle,
          entry.department,
          entry.trainingName,
          entry.lastCompleted,
          entry.lastScore,
          entry.status,
          entry.notes,
          entry.isLegacy,
          entry.createdAt || new Date(),
          entry.updatedAt || new Date(),
        ]
      );
    }
    
    console.log(`✅ Inserted ${allEntries.length} entries\n`);
    
    // Verify production
    const verify = await productionPool.query(`
      SELECT 
        CASE WHEN is_legacy THEN 'Certifications' ELSE 'Standards' END as type,
        COUNT(DISTINCT training_name) as trainings,
        COUNT(*) as entries
      FROM training_matrix
      GROUP BY is_legacy
      ORDER BY is_legacy
    `);
    
    console.log('📊 PRODUCTION Database Summary:');
    verify.rows.forEach(row => {
      console.log(`  ${row.type}: ${row.trainings} unique trainings, ${row.entries} total entries`);
    });
    
    console.log('\n✅ Production database successfully synchronized with development!');
  } catch (error: any) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await productionPool.end();
    console.log('🔌 Production connection closed');
  }
}

syncExactData()
  .then(() => {
    console.log('✅ Sync completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Sync failed:', error);
    process.exit(1);
  });
