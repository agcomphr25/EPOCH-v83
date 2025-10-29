/**
 * Script to import quiz completion data from production database
 * and sync to training matrix
 */

import pg from 'pg';
import { db } from '../../db';
import { trainingMatrix, employees, trainingModules } from '../../schema';
import { eq, and } from 'drizzle-orm';

const { Pool } = pg;

// Production database connection string
const PRODUCTION_DB_URL = 'postgresql://neondb_owner:npg_8ybQvUYfuNm6@ep-wispy-sun-adm062ft.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function importProductionQuizData() {
  console.log('🔍 Connecting to production database...\n');

  const productionPool = new Pool({
    connectionString: PRODUCTION_DB_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // Query production database for quiz attempts by Glenn Jones and Tim Steelman
    const query = `
      SELECT 
        eqa.id,
        eqa.employee_id,
        e.name as employee_name,
        eqa.module_id,
        tm.title as module_title,
        eqa.score,
        eqa.passed,
        eqa.completed_at,
        eqa.created_at
      FROM employee_quiz_attempts eqa
      LEFT JOIN employees e ON eqa.employee_id = e.id
      LEFT JOIN training_modules tm ON eqa.module_id = tm.id
      WHERE e.name ILIKE '%Glenn%Jones%' OR e.name ILIKE '%Tim%Steelman%'
      ORDER BY eqa.completed_at DESC;
    `;

    console.log('📊 Querying production for quiz attempts...\n');
    const result = await productionPool.query(query);

    console.log(`✅ Found ${result.rows.length} quiz attempt(s) in production\n`);

    if (result.rows.length === 0) {
      console.log('⚠️  No quiz attempts found for Glenn Jones or Tim Steelman');
      console.log('   Please check that:');
      console.log('   1. They completed the quiz in production');
      console.log('   2. Their names are spelled correctly in the employees table\n');
      return;
    }

    // Display what we found
    console.log('📋 Quiz Attempts Found:\n');
    result.rows.forEach((row: any, index: number) => {
      console.log(`${index + 1}. ${row.employee_name}`);
      console.log(`   Training: ${row.module_title}`);
      console.log(`   Score: ${row.score}%`);
      console.log(`   Passed: ${row.passed ? 'Yes ✅' : 'No ❌'}`);
      console.log(`   Completed: ${row.completed_at || 'N/A'}`);
      console.log('');
    });

    // Now sync to development database training matrix
    console.log('🔄 Syncing to training matrix...\n');

    let syncedCount = 0;
    let errorCount = 0;

    for (const attempt of result.rows) {
      try {
        // Find or create employee in dev database
        let devEmployee = await db
          .select()
          .from(employees)
          .where(eq(employees.name, attempt.employee_name))
          .limit(1);

        let employeeId: number | null = null;
        if (devEmployee.length > 0) {
          employeeId = devEmployee[0].id;
        }

        // Find training module in dev database
        const devModule = await db
          .select()
          .from(trainingModules)
          .where(eq(trainingModules.title, attempt.module_title))
          .limit(1);

        if (devModule.length === 0) {
          console.log(`⚠️  Module "${attempt.module_title}" not found in dev database, skipping`);
          continue;
        }

        // Check if entry already exists in training matrix
        const whereConditions = employeeId
          ? and(
              eq(trainingMatrix.employeeId, employeeId),
              eq(trainingMatrix.trainingName, attempt.module_title)
            )
          : and(
              eq(trainingMatrix.employeeName, attempt.employee_name),
              eq(trainingMatrix.trainingName, attempt.module_title)
            );

        const existing = await db
          .select()
          .from(trainingMatrix)
          .where(whereConditions)
          .limit(1);

        if (existing.length > 0) {
          // Update existing entry
          await db
            .update(trainingMatrix)
            .set({
              employeeId: employeeId,
              lastCompleted: attempt.passed ? new Date(attempt.completed_at) : null,
              lastScore: attempt.score,
              status: attempt.passed ? 'COMPLETED' : 'IN_PROGRESS',
              updatedAt: new Date(),
            })
            .where(eq(trainingMatrix.id, existing[0].id));

          console.log(`✅ UPDATED: ${attempt.employee_name} - ${attempt.module_title} (Score: ${attempt.score}%)`);
        } else {
          // Create new entry
          await db.insert(trainingMatrix).values({
            employeeId: employeeId,
            employeeName: attempt.employee_name,
            jobTitle: null,
            department: null,
            trainingName: attempt.module_title,
            lastCompleted: attempt.passed ? new Date(attempt.completed_at) : null,
            lastScore: attempt.score,
            status: attempt.passed ? 'COMPLETED' : 'IN_PROGRESS',
          });

          console.log(`✅ CREATED: ${attempt.employee_name} - ${attempt.module_title} (Score: ${attempt.score}%)`);
        }

        syncedCount++;
      } catch (error: any) {
        console.error(`❌ Error syncing ${attempt.employee_name}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n📈 Import Summary:');
    console.log(`   ✅ Successfully synced: ${syncedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   📊 Total found: ${result.rows.length}\n`);
  } catch (error: any) {
    console.error('❌ Error importing production data:', error);
    throw error;
  } finally {
    await productionPool.end();
    console.log('🔌 Production database connection closed');
  }
}

// Run the import
importProductionQuizData()
  .then(() => {
    console.log('\n✅ Import completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  });
