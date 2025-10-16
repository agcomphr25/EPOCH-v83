import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql as sqlDrizzle } from 'drizzle-orm';
import * as schema from '../../schema';

const DEV_DATABASE_URL = 'postgresql://neondb_owner:npg_28YFPchwECLb@ep-sweet-smoke-adiyfj99.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';
const PROD_DATABASE_URL = 'postgresql://neondb_owner:npg_8ybQvUYfuNm6@ep-wispy-sun-adm062ft.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';

// Test employees to skip (these are dummy records)
const TEST_EMPLOYEE_NAMES = [
  'john smith', 
  'jane doe', 
  'mike johnson', 
  'alice wilson', 
  'test employee'
];

async function migrateEmployeesFinal() {
  console.log('🚀 Starting employee migration from DEV to PROD...\n');

  const devSql = neon(DEV_DATABASE_URL);
  const devDb = drizzle(devSql, { schema });

  const prodSql = neon(PROD_DATABASE_URL);
  const prodDb = drizzle(prodSql, { schema });

  try {
    // Step 0: Fix the sequence in PROD database
    console.log('🔧 Step 0: Fixing employee ID sequence in PROD database...');
    await prodDb.execute(sqlDrizzle`SELECT setval('employees_id_seq', (SELECT COALESCE(MAX(id), 0) FROM employees))`);
    console.log('   ✅ Sequence fixed\n');

    // Step 1: Get all employees from DEV
    console.log('📦 Step 1: Fetching employees from DEV database...');
    const devEmployees = await devDb.select().from(schema.employees);
    console.log(`   Found ${devEmployees.length} employees in DEV`);

    // Step 2: Filter out test employees
    const realEmployees = devEmployees.filter(emp => 
      !TEST_EMPLOYEE_NAMES.includes(emp.name?.toLowerCase().trim() || '')
    );
    console.log(`   Filtered to ${realEmployees.length} real employees (skipped ${devEmployees.length - realEmployees.length} test employees)`);

    // Step 3: Get existing employees from PROD
    console.log('\n📦 Step 2: Fetching existing employees from PROD database...');
    const prodEmployees = await prodDb.select().from(schema.employees);
    console.log(`   Found ${prodEmployees.length} employees in PROD`);

    // Step 4: Migrate employees that don't exist in PROD
    console.log('\n📥 Step 3: Migrating employees to PROD database...');
    let migratedCount = 0;
    let skippedCount = 0;

    for (const employee of realEmployees) {
      // Check if employee already exists in PROD (by name or employeeCode)
      const existsInProd = prodEmployees.some(e => 
        (e.name?.toLowerCase().trim() === employee.name?.toLowerCase().trim()) ||
        (employee.employeeCode && e.employeeCode === employee.employeeCode)
      );

      if (existsInProd) {
        console.log(`   ⏭️  Skipped "${employee.name}" - already exists in PROD`);
        skippedCount++;
        continue;
      }

      // Insert employee into PROD (explicitly omit auto-generated fields)
      await prodDb.insert(schema.employees).values({
        employeeCode: employee.employeeCode,
        name: employee.name,
        email: employee.email,
        phone: employee.phone,
        jobTitle: employee.jobTitle,
        userRole: employee.userRole,
        department: employee.department,
        hireDate: employee.hireDate,
        dateOfBirth: employee.dateOfBirth,
        address: employee.address,
        emergencyContact: employee.emergencyContact,
        emergencyPhone: employee.emergencyPhone,
        gateCardNumber: employee.gateCardNumber,
        vehicleType: employee.vehicleType,
        buildingKeyAccess: employee.buildingKeyAccess,
        tciAccess: employee.tciAccess,
        employmentType: employee.employmentType,
      });
      migratedCount++;
      console.log(`   ✅ Migrated "${employee.name}" (${employee.jobTitle || 'No title'})`);
    }

    console.log(`\n   ✅ Migrated ${migratedCount} employees to PROD`);
    if (skippedCount > 0) {
      console.log(`   ⏭️  Skipped ${skippedCount} employees (already exist in PROD)`);
    }

    // Step 5: Verify migration
    console.log('\n✅ Step 4: Verifying migration...');
    const finalProdEmployees = await prodDb.select().from(schema.employees);
    const realProdEmployees = finalProdEmployees.filter(emp => 
      !TEST_EMPLOYEE_NAMES.includes(emp.name?.toLowerCase().trim() || '')
    );

    console.log('\n📊 Migration Summary:');
    console.log('═'.repeat(70));
    console.log(`Real Employees in DEV: ${realEmployees.length}`);
    console.log(`Employees Migrated: ${migratedCount}`);
    console.log(`Employees Skipped: ${skippedCount}`);
    console.log(`Real Employees in PROD Now: ${realProdEmployees.length}`);
    console.log(`Total Employees in PROD (including test): ${finalProdEmployees.length}`);
    console.log('═'.repeat(70));

    console.log('\n✅ SUCCESS: Employee migration completed!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  }
}

migrateEmployeesFinal()
  .then(() => {
    console.log('\n🎉 Employee migration completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration error:', error);
    process.exit(1);
  });
