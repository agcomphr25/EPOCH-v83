/**
 * Script to help sync quiz completion data from production to training matrix
 * 
 * This script queries the employee_quiz_attempts table and creates/updates
 * training matrix entries for any missing quiz completions.
 * 
 * Usage: tsx server/src/scripts/sync-production-quiz-data.ts
 */

import { db } from '../../db';
import {
  employeeQuizAttempts,
  trainingMatrix,
  trainingModules,
  employees,
  users,
} from '../../schema';
import { eq, and, desc } from 'drizzle-orm';

async function syncQuizDataToTrainingMatrix() {
  console.log('🔄 Starting sync of quiz completion data to training matrix...\n');

  try {
    // Get all quiz attempts with employee and module info
    const quizAttempts = await db
      .select({
        attemptId: employeeQuizAttempts.id,
        employeeId: employeeQuizAttempts.employeeId,
        moduleId: employeeQuizAttempts.moduleId,
        score: employeeQuizAttempts.score,
        passed: employeeQuizAttempts.passed,
        completedAt: employeeQuizAttempts.completedAt,
      })
      .from(employeeQuizAttempts)
      .orderBy(desc(employeeQuizAttempts.completedAt));

    console.log(`📊 Found ${quizAttempts.length} total quiz attempts\n`);

    if (quizAttempts.length === 0) {
      console.log('⚠️  No quiz attempts found. If users completed quizzes in production,');
      console.log('   this development database does not have access to that data.\n');
      console.log('💡 Solution: Use the Manual Entry feature in the Training Matrix UI');
      console.log('   to add completion records based on production data.\n');
      return;
    }

    let syncedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const attempt of quizAttempts) {
      try {
        // Get employee details
        const [employee] = await db
          .select()
          .from(employees)
          .where(eq(employees.id, attempt.employeeId))
          .limit(1);

        if (!employee) {
          console.log(`⚠️  Skipping attempt ${attempt.attemptId}: Employee ${attempt.employeeId} not found`);
          skippedCount++;
          continue;
        }

        // Get module details
        const [module] = await db
          .select()
          .from(trainingModules)
          .where(eq(trainingModules.id, attempt.moduleId))
          .limit(1);

        if (!module) {
          console.log(`⚠️  Skipping attempt ${attempt.attemptId}: Module ${attempt.moduleId} not found`);
          skippedCount++;
          continue;
        }

        // Check if training matrix entry already exists
        const existingEntry = await db
          .select()
          .from(trainingMatrix)
          .where(
            and(
              eq(trainingMatrix.employeeId, employee.id),
              eq(trainingMatrix.trainingName, module.title)
            )
          )
          .limit(1);

        if (existingEntry && existingEntry.length > 0) {
          // Update if the new score is better or more recent
          const existing = existingEntry[0];
          const shouldUpdate =
            !existing.lastCompleted ||
            (attempt.completedAt && new Date(attempt.completedAt) > new Date(existing.lastCompleted)) ||
            (attempt.score && (!existing.lastScore || attempt.score > existing.lastScore));

          if (shouldUpdate && attempt.passed) {
            await db
              .update(trainingMatrix)
              .set({
                lastCompleted: attempt.completedAt,
                lastScore: attempt.score,
                status: 'COMPLETED',
                updatedAt: new Date(),
              })
              .where(eq(trainingMatrix.id, existing.id));

            console.log(`✅ UPDATED: ${employee.name} - ${module.title} (Score: ${attempt.score}%)`);
            syncedCount++;
          } else {
            console.log(`⏭️  SKIPPED: ${employee.name} - ${module.title} (already has better/recent data)`);
            skippedCount++;
          }
        } else {
          // Create new training matrix entry
          await db.insert(trainingMatrix).values({
            employeeId: employee.id,
            employeeName: employee.name,
            jobTitle: employee.jobTitle,
            department: employee.department,
            trainingName: module.title,
            lastCompleted: attempt.passed ? attempt.completedAt : null,
            lastScore: attempt.score,
            status: attempt.passed ? 'COMPLETED' : 'IN_PROGRESS',
          });

          console.log(`✅ CREATED: ${employee.name} - ${module.title} (Score: ${attempt.score}%, Passed: ${attempt.passed})`);
          syncedCount++;
        }
      } catch (error) {
        console.error(`❌ Error processing attempt ${attempt.attemptId}:`, error);
        errorCount++;
      }
    }

    console.log('\n📈 Sync Summary:');
    console.log(`   ✅ Synced: ${syncedCount}`);
    console.log(`   ⏭️  Skipped: ${skippedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   📊 Total Attempts: ${quizAttempts.length}\n`);
  } catch (error) {
    console.error('❌ Fatal error during sync:', error);
    process.exit(1);
  }
}

// Run the sync
syncQuizDataToTrainingMatrix()
  .then(() => {
    console.log('✅ Sync completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Sync failed:', error);
    process.exit(1);
  });
