import { Pool } from 'pg';

// Production database connection
const PRODUCTION_DB_URL = 'postgresql://neondb_owner:npg_8ybQvUYfuNm6@ep-wispy-sun-adm062ft.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({ 
  connectionString: PRODUCTION_DB_URL,
  ssl: { rejectUnauthorized: false }
});

interface DuplicatePair {
  lowercase: string;
  properCase: string;
}

// Define the duplicate pairs to merge
const duplicatePairs: DuplicatePair[] = [
  { lowercase: 'john langlois', properCase: 'John Langlois' },
  { lowercase: 'aloysius grace', properCase: 'Aloysius Grace' },
  { lowercase: 'joey benson', properCase: 'Joey Benson' },
];

async function mergeDuplicateTrainingEntries() {
  console.log('🔄 Starting duplicate training matrix entries merge...\n');

  for (const pair of duplicatePairs) {
    console.log(`\n📋 Processing: "${pair.lowercase}" → "${pair.properCase}"`);
    
    try {
      // First, check if duplicates exist
      const lowercaseEntries = await pool.query(
        `SELECT id, training_name, last_completed, last_score, status 
         FROM training_matrix 
         WHERE employee_name = $1
         ORDER BY training_name`,
        [pair.lowercase]
      );

      const properCaseEntries = await pool.query(
        `SELECT id, training_name, last_completed, last_score, status 
         FROM training_matrix 
         WHERE employee_name = $1
         ORDER BY training_name`,
        [pair.properCase]
      );

      console.log(`   Found ${lowercaseEntries.rowCount} lowercase entries`);
      console.log(`   Found ${properCaseEntries.rowCount} proper case entries`);

      if (lowercaseEntries.rowCount === 0) {
        console.log(`   ✅ No lowercase entries found - skipping`);
        continue;
      }

      // Build a map of proper case entries by training name
      const properCaseMap = new Map();
      properCaseEntries.rows.forEach((row: any) => {
        properCaseMap.set(row.training_name, row);
      });

      let mergedCount = 0;
      let updatedCount = 0;
      let deletedCount = 0;

      // Process each lowercase entry
      for (const lowercaseEntry of lowercaseEntries.rows as any[]) {
        const trainingName = lowercaseEntry.training_name;
        const properCaseEntry = properCaseMap.get(trainingName);

        if (properCaseEntry) {
          // Both exist - merge by keeping the better data
          const shouldUpdate = (
            // Keep if lowercase has a completion date and proper case doesn't
            (lowercaseEntry.last_completed && !properCaseEntry.last_completed) ||
            // Or if lowercase has a more recent completion date
            (lowercaseEntry.last_completed && properCaseEntry.last_completed && 
             new Date(lowercaseEntry.last_completed) > new Date(properCaseEntry.last_completed)) ||
            // Or if lowercase has a higher score
            (lowercaseEntry.last_score && (!properCaseEntry.last_score || lowercaseEntry.last_score > properCaseEntry.last_score))
          );

          if (shouldUpdate) {
            // Update the proper case entry with better data from lowercase
            await pool.query(
              `UPDATE training_matrix 
               SET last_completed = COALESCE($1, last_completed),
                   last_score = COALESCE($2, last_score),
                   status = COALESCE($3, status),
                   updated_at = NOW()
               WHERE id = $4`,
              [
                lowercaseEntry.last_completed,
                lowercaseEntry.last_score,
                lowercaseEntry.status,
                properCaseEntry.id
              ]
            );
            console.log(`   ✅ Updated "${trainingName}" with better data from lowercase entry`);
            updatedCount++;
          }

          // Delete the lowercase duplicate
          await pool.query(
            `DELETE FROM training_matrix WHERE id = $1`,
            [lowercaseEntry.id]
          );
          deletedCount++;
          mergedCount++;
        } else {
          // Only lowercase exists - just update the name to proper case
          await pool.query(
            `UPDATE training_matrix 
             SET employee_name = $1, updated_at = NOW()
             WHERE id = $2`,
            [pair.properCase, lowercaseEntry.id]
          );
          console.log(`   ✅ Renamed "${trainingName}" from lowercase to proper case`);
          updatedCount++;
        }
      }

      console.log(`   📊 Summary for ${pair.properCase}:`);
      console.log(`      - Merged duplicates: ${mergedCount}`);
      console.log(`      - Updated entries: ${updatedCount}`);
      console.log(`      - Deleted duplicates: ${deletedCount}`);

    } catch (error) {
      console.error(`   ❌ Error processing ${pair.lowercase}:`, error);
    }
  }

  console.log('\n✅ Duplicate training matrix entries merge completed!');
}

// Run the merge
mergeDuplicateTrainingEntries()
  .then(async () => {
    console.log('\n🎉 Migration completed successfully!');
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('\n❌ Migration failed:', error);
    await pool.end();
    process.exit(1);
  });
