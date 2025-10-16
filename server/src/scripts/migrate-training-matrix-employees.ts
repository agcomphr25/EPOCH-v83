import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../../schema';
import { eq } from 'drizzle-orm';

const DEV_DATABASE_URL = 'postgresql://neondb_owner:npg_28YFPchwECLb@ep-sweet-smoke-adiyfj99.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';
const PROD_DATABASE_URL = 'postgresql://neondb_owner:npg_8ybQvUYfuNm6@ep-wispy-sun-adm062ft.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';

interface EmployeeIdMapping {
  [devEmployeeId: number]: number;
}

async function migrateEmployeeTrainingMatrix() {
  console.log('🚀 Starting employee-specific training matrix migration...\n');

  const devSql = neon(DEV_DATABASE_URL);
  const devDb = drizzle(devSql, { schema });

  const prodSql = neon(PROD_DATABASE_URL);
  const prodDb = drizzle(prodSql, { schema });

  try {
    // Step 1: Get all users from DEV with their employeeId
    console.log('📦 Step 1: Fetching users from DEV database...');
    const devUsers = await devDb.select({
      username: schema.users.username,
      employeeId: schema.users.employeeId
    }).from(schema.users);
    console.log(`   Found ${devUsers.length} users in DEV`);

    // Step 2: Get all users from PROD with their employeeId
    console.log('📦 Step 2: Fetching users from PROD database...');
    const prodUsers = await prodDb.select({
      username: schema.users.username,
      employeeId: schema.users.employeeId
    }).from(schema.users);
    console.log(`   Found ${prodUsers.length} users in PROD`);

    // Step 3: Create employeeId mapping based on matching usernames
    console.log('\n🔗 Step 3: Creating employee ID mapping...');
    const employeeIdMap: EmployeeIdMapping = {};
    
    for (const devUser of devUsers) {
      if (!devUser.employeeId) continue;
      
      const prodUser = prodUsers.find(u => u.username === devUser.username);
      if (prodUser && prodUser.employeeId) {
        employeeIdMap[devUser.employeeId] = prodUser.employeeId;
        console.log(`   Mapped ${devUser.username}: employee ${devUser.employeeId} → ${prodUser.employeeId}`);
      } else {
        console.log(`   ⚠️  User ${devUser.username} not found in PROD or has no employeeId`);
      }
    }

    console.log(`\n   ✅ Created ${Object.keys(employeeIdMap).length} employee ID mappings`);

    // Step 4: Get training matrix entries from DEV that have employeeId
    console.log('\n📦 Step 4: Fetching employee-specific training matrix from DEV...');
    const devMatrix = await devDb.select().from(schema.trainingMatrix);
    const employeeMatrixEntries = devMatrix.filter(entry => entry.employeeId !== null);
    console.log(`   Found ${employeeMatrixEntries.length} employee-specific training matrix entries`);

    // Step 5: Import employee-specific training matrix to PROD
    console.log('\n📥 Step 5: Importing employee-specific training matrix to PROD...');
    let migratedCount = 0;
    let skippedCount = 0;

    for (const entry of employeeMatrixEntries) {
      const { id, employeeId, ...matrixData } = entry;
      
      if (!employeeId) {
        skippedCount++;
        continue;
      }

      const newEmployeeId = employeeIdMap[employeeId];
      
      if (!newEmployeeId) {
        console.log(`   ⚠️  Skipping entry ${id} - employee ${employeeId} not found in mapping`);
        skippedCount++;
        continue;
      }

      await prodDb.insert(schema.trainingMatrix)
        .values({ ...matrixData, employeeId: newEmployeeId });
      migratedCount++;
      
      if (migratedCount % 50 === 0) {
        console.log(`   Migrated ${migratedCount} entries...`);
      }
    }

    console.log(`\n   ✅ Migrated ${migratedCount} employee-specific training matrix entries`);
    if (skippedCount > 0) {
      console.log(`   ⚠️  Skipped ${skippedCount} entries (employees not in production)`);
    }

    // Step 6: Verify migration
    console.log('\n✅ Step 6: Verifying migration...');
    const prodMatrixCount = await prodDb.select().from(schema.trainingMatrix);
    const prodEmployeeMatrixCount = prodMatrixCount.filter(e => e.employeeId !== null).length;

    console.log('\n📊 Migration Summary:');
    console.log('═'.repeat(60));
    console.log(`Employee ID Mappings Created: ${Object.keys(employeeIdMap).length}`);
    console.log(`Employee-Specific Entries in DEV: ${employeeMatrixEntries.length}`);
    console.log(`Employee-Specific Entries Migrated: ${migratedCount}`);
    console.log(`Employee-Specific Entries Skipped: ${skippedCount}`);
    console.log(`Total Employee Entries in PROD: ${prodEmployeeMatrixCount}`);
    console.log('═'.repeat(60));

    console.log('\n✅ SUCCESS: Employee training matrix migration completed!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  }
}

migrateEmployeeTrainingMatrix()
  .then(() => {
    console.log('\n🎉 Employee training matrix migration completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration error:', error);
    process.exit(1);
  });
