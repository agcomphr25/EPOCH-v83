/**
 * Restore certification data from development to production
 */

import pg from 'pg';
import { db } from '../../db';
import { trainingMatrix } from '../../schema';
import { eq } from 'drizzle-orm';

const { Pool } = pg;

const PRODUCTION_DB_URL = 'postgresql://neondb_owner:npg_8ybQvUYfuNm6@ep-wispy-sun-adm062ft.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function restoreCertifications() {
  console.log('🔄 Restoring certifications from development to production...\n');

  const productionPool = new Pool({
    connectionString: PRODUCTION_DB_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // Get all certification entries from development (is_legacy = true)
    const devCerts = await db
      .select()
      .from(trainingMatrix)
      .where(eq(trainingMatrix.isLegacy, true));

    console.log(`📊 Found ${devCerts.length} certification entries in development\n`);

    // Delete ALL existing training matrix entries in production
    console.log('🗑️  Clearing production training_matrix table...');
    await productionPool.query('DELETE FROM training_matrix');
    console.log('✅ Production table cleared\n');

    // Insert all certifications from development
    console.log('📥 Inserting certification data into production...');
    let insertCount = 0;

    for (const cert of devCerts) {
      await productionPool.query(
        `INSERT INTO training_matrix (
          employee_id, employee_name, job_title, department,
          training_name, last_completed, last_score, status,
          notes, is_legacy, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          cert.employeeId,
          cert.employeeName,
          cert.jobTitle,
          cert.department,
          cert.trainingName,
          cert.lastCompleted,
          cert.lastScore,
          cert.status,
          cert.notes,
          cert.isLegacy,
          cert.createdAt || new Date(),
          cert.updatedAt || new Date(),
        ]
      );
      insertCount++;
    }

    console.log(`✅ Inserted ${insertCount} certification entries\n`);

    // Verify the restore
    const verifyResult = await productionPool.query(
      'SELECT COUNT(*) as count FROM training_matrix WHERE is_legacy = true'
    );
    console.log(`✅ Verification: ${verifyResult.rows[0].count} certifications in production\n`);

    console.log('🎉 Certification data successfully restored to production!');
  } catch (error: any) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await productionPool.end();
    console.log('🔌 Production connection closed');
  }
}

restoreCertifications()
  .then(() => {
    console.log('✅ Restore completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Restore failed:', error);
    process.exit(1);
  });
