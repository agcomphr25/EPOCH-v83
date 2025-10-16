import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../../schema';

const DEV_DATABASE_URL = 'postgresql://neondb_owner:npg_28YFPchwECLb@ep-sweet-smoke-adiyfj99.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';
const PROD_DATABASE_URL = 'postgresql://neondb_owner:npg_8ybQvUYfuNm6@ep-wispy-sun-adm062ft.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';

interface EmployeeIdMapping {
  [devEmployeeId: number]: number;
}

async function migrateEmployeeTrainingMatrixByName() {
  console.log('🚀 Starting employee-specific training matrix migration (matching by name)...\n');

  const devSql = neon(DEV_DATABASE_URL);
  const devDb = drizzle(devSql, { schema });

  const prodSql = neon(PROD_DATABASE_URL);
  const prodDb = drizzle(prodSql, { schema });

  try {
    // Step 1: Get all employees from DEV
    console.log('📦 Step 1: Fetching employees from DEV database...');
    const devEmployees = await devDb.select({
      id: schema.employees.id,
      name: schema.employees.name,
      employeeCode: schema.employees.employeeCode
    }).from(schema.employees);
    console.log(`   Found ${devEmployees.length} employees in DEV`);

    // Step 2: Get all employees from PROD
    console.log('📦 Step 2: Fetching employees from PROD database...');
    const prodEmployees = await prodDb.select({
      id: schema.employees.id,
      name: schema.employees.name,
      employeeCode: schema.employees.employeeCode
    }).from(schema.employees);
    console.log(`   Found ${prodEmployees.length} employees in PROD`);

    // Step 3: Create employeeId mapping based on matching names
    console.log('\n🔗 Step 3: Creating employee ID mapping by name...');
    const employeeIdMap: EmployeeIdMapping = {};
    
    for (const devEmp of devEmployees) {
      // Try to match by name first
      let prodEmp = prodEmployees.find(e => e.name?.toLowerCase().trim() === devEmp.name?.toLowerCase().trim());
      
      // If no name match, try by employeeCode
      if (!prodEmp && devEmp.employeeCode) {
        prodEmp = prodEmployees.find(e => e.employeeCode === devEmp.employeeCode);
      }
      
      if (prodEmp) {
        employeeIdMap[devEmp.id] = prodEmp.id;
        console.log(`   ✅ Mapped "${devEmp.name}" (ID ${devEmp.id} → ${prodEmp.id})`);
      } else {
        console.log(`   ⚠️  Employee "${devEmp.name}" (ID ${devEmp.id}) not found in PROD`);
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
    console.log('═'.repeat(70));
    console.log(`Employee ID Mappings Created: ${Object.keys(employeeIdMap).length}`);
    console.log(`Employee-Specific Entries in DEV: ${employeeMatrixEntries.length}`);
    console.log(`Employee-Specific Entries Migrated: ${migratedCount}`);
    console.log(`Employee-Specific Entries Skipped: ${skippedCount}`);
    console.log(`Total Employee Entries in PROD Now: ${prodEmployeeMatrixCount}`);
    console.log('═'.repeat(70));

    if (migratedCount > 0) {
      console.log('\n✅ SUCCESS: Employee training matrix migration completed!');
    } else {
      console.log('\n⚠️  WARNING: No entries migrated. Check employee name matching.');
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  }
}

migrateEmployeeTrainingMatrixByName()
  .then(() => {
    console.log('\n🎉 Training matrix migration completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration error:', error);
    process.exit(1);
  });
