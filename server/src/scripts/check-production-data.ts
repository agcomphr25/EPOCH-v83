/**
 * Script to check what data exists in production database
 */

import pg from 'pg';

const { Pool } = pg;

const PRODUCTION_DB_URL = 'postgresql://neondb_owner:npg_8ybQvUYfuNm6@ep-wispy-sun-adm062ft.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function checkProductionData() {
  console.log('🔍 Connecting to production database...\n');

  const pool = new Pool({
    connectionString: PRODUCTION_DB_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // Check all employees
    console.log('👥 Checking EMPLOYEES table:\n');
    const employeesResult = await pool.query(`
      SELECT id, name, job_title, department, is_active 
      FROM employees 
      WHERE name ILIKE '%glenn%' OR name ILIKE '%tim%' OR name ILIKE '%steel%'
      ORDER BY name
      LIMIT 20
    `);
    
    if (employeesResult.rows.length > 0) {
      console.log(`Found ${employeesResult.rows.length} matching employees:`);
      employeesResult.rows.forEach((emp: any) => {
        console.log(`  - ID: ${emp.id}, Name: "${emp.name}", Title: ${emp.job_title || 'N/A'}, Active: ${emp.is_active}`);
      });
    } else {
      console.log('  No employees found matching Glenn or Tim');
    }

    // Check all quiz attempts
    console.log('\n📝 Checking QUIZ ATTEMPTS table:\n');
    const attemptsResult = await pool.query(`
      SELECT 
        eqa.id,
        eqa.employee_id,
        eqa.module_id,
        eqa.score,
        eqa.passed,
        eqa.completed_at
      FROM employee_quiz_attempts eqa
      ORDER BY eqa.completed_at DESC
      LIMIT 50
    `);

    console.log(`Found ${attemptsResult.rows.length} total quiz attempts`);
    if (attemptsResult.rows.length > 0) {
      console.log('\nRecent quiz attempts:');
      attemptsResult.rows.forEach((attempt: any, idx: number) => {
        console.log(`  ${idx + 1}. Employee ID: ${attempt.employee_id}, Module ID: ${attempt.module_id}, Score: ${attempt.score}%, Passed: ${attempt.passed}, Completed: ${attempt.completed_at || 'N/A'}`);
      });
    } else {
      console.log('  No quiz attempts found in database');
    }

    // Get quiz attempts with employee names
    console.log('\n🔗 Quiz attempts with employee details:\n');
    const detailedResult = await pool.query(`
      SELECT 
        eqa.id,
        eqa.employee_id,
        e.name as employee_name,
        eqa.module_id,
        tm.title as module_title,
        eqa.score,
        eqa.passed,
        eqa.completed_at
      FROM employee_quiz_attempts eqa
      LEFT JOIN employees e ON eqa.employee_id = e.id
      LEFT JOIN training_modules tm ON eqa.module_id = tm.id
      ORDER BY eqa.completed_at DESC
      LIMIT 50
    `);

    if (detailedResult.rows.length > 0) {
      console.log(`Found ${detailedResult.rows.length} quiz attempts with details:\n`);
      detailedResult.rows.forEach((row: any, idx: number) => {
        console.log(`${idx + 1}. ${row.employee_name || 'Unknown Employee'}`);
        console.log(`   Training: ${row.module_title || 'Unknown Module'}`);
        console.log(`   Score: ${row.score}%, Passed: ${row.passed ? 'Yes' : 'No'}`);
        console.log(`   Completed: ${row.completed_at || 'N/A'}\n`);
      });
    }

    // Check training modules
    console.log('📚 Checking TRAINING MODULES:\n');
    const modulesResult = await pool.query(`
      SELECT id, title, created_at 
      FROM training_modules 
      WHERE title ILIKE '%preservation%' OR title ILIKE '%FOD%'
      ORDER BY created_at DESC
    `);

    if (modulesResult.rows.length > 0) {
      console.log('Found matching training modules:');
      modulesResult.rows.forEach((mod: any) => {
        console.log(`  - ID: ${mod.id}, Title: "${mod.title}"`);
      });
    } else {
      console.log('  No Preservation/FOD modules found');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await pool.end();
    console.log('\n🔌 Connection closed');
  }
}

checkProductionData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
