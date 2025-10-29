/**
 * Sync missing quiz completions from production to development
 */

import pg from 'pg';
import { db } from '../../db';
import { trainingMatrix, employees } from '../../schema';
import { eq, and } from 'drizzle-orm';

const { Pool } = pg;

const PRODUCTION_DB_URL = 'postgresql://neondb_owner:npg_8ybQvUYfuNm6@ep-wispy-sun-adm062ft.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function syncMissingCompletions() {
  console.log('🔄 Syncing missing quiz completions from production...\n');

  const productionPool = new Pool({
    connectionString: PRODUCTION_DB_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // Get all completed Preservation & FOD entries from production
    const result = await productionPool.query(`
      SELECT 
        employee_id,
        employee_name,
        job_title,
        department,
        training_name,
        last_completed,
        last_score,
        status,
        notes
      FROM training_matrix
      WHERE (training_name ILIKE '%preservation%' OR training_name ILIKE '%FOD%')
        AND status = 'COMPLETED'
      ORDER BY last_completed DESC
    `);

    console.log(`✅ Found ${result.rows.length} completed entries in production\n`);

    let syncedCount = 0;
    let skippedCount = 0;

    for (const entry of result.rows) {
      try {
        // Check if entry already exists in dev database
        const existing = await db
          .select()
          .from(trainingMatrix)
          .where(
            and(
              eq(trainingMatrix.employeeName, entry.employee_name),
              eq(trainingMatrix.trainingName, entry.training_name)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          console.log(`⏭️  SKIP: ${entry.employee_name} - already exists`);
          skippedCount++;
          continue;
        }

        // Find employee in dev database
        let employeeId: number | null = null;
        const devEmployee = await db
          .select()
          .from(employees)
          .where(eq(employees.name, entry.employee_name))
          .limit(1);

        if (devEmployee.length > 0) {
          employeeId = devEmployee[0].id;
        }

        // Create new entry
        await db.insert(trainingMatrix).values({
          employeeId: employeeId,
          employeeName: entry.employee_name,
          jobTitle: entry.job_title,
          department: entry.department,
          trainingName: entry.training_name,
          lastCompleted: entry.last_completed ? new Date(entry.last_completed) : null,
          lastScore: entry.last_score,
          status: entry.status,
          notes: entry.notes,
        });

        console.log(`✅ SYNCED: ${entry.employee_name} - Score: ${entry.last_score}%, Completed: ${new Date(entry.last_completed).toLocaleDateString()}`);
        syncedCount++;
      } catch (error: any) {
        console.error(`❌ Error syncing ${entry.employee_name}:`, error.message);
      }
    }

    console.log('\n📈 Sync Summary:');
    console.log(`   ✅ Synced: ${syncedCount}`);
    console.log(`   ⏭️  Skipped: ${skippedCount}`);
    console.log(`   📊 Total in production: ${result.rows.length}\n`);
  } catch (error: any) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await productionPool.end();
    console.log('🔌 Production connection closed');
  }
}

syncMissingCompletions()
  .then(() => {
    console.log('✅ Sync completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Sync failed:', error);
    process.exit(1);
  });
