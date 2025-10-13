import { db } from './db';
import { employees, trainingMatrix } from './schema';
import { eq, isNotNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

async function createEmployeesAndLink() {
  // Get unique employee names from training matrix
  const uniqueNames = await db
    .selectDistinct({ name: trainingMatrix.employeeName })
    .from(trainingMatrix)
    .where(isNotNull(trainingMatrix.employeeName));
  
  const employeeNames = uniqueNames
    .map(e => e.name)
    .filter(Boolean) as string[];
  
  console.log(`Found ${employeeNames.length} unique employees in training matrix\n`);
  
  for (const name of employeeNames) {
    // Check if employee already exists
    const [existing] = await db
      .select()
      .from(employees)
      .where(eq(employees.name, name))
      .limit(1);
    
    let employeeId: number;
    
    if (existing) {
      employeeId = existing.id;
      console.log(`✓ Employee exists: ${name} (ID: ${employeeId})`);
    } else {
      // Use raw SQL to insert and get the ID back
      const result = await db.execute(sql`
        INSERT INTO employees (name, job_title, department, user_role, is_active)
        VALUES (${name}, 'Line Employee', 'Production', 'EMPLOYEE', true)
        RETURNING id
      `);
      
      employeeId = (result.rows[0] as any).id;
      console.log(`+ Created employee: ${name} (ID: ${employeeId})`);
    }
    
    // Update training matrix records to link to employee ID
    await db
      .update(trainingMatrix)
      .set({ employeeId })
      .where(eq(trainingMatrix.employeeName, name));
    
    console.log(`  → Linked training records to employee ID ${employeeId}`);
  }
  
  console.log('\n✅ Successfully created employees and linked training matrix records');
  process.exit(0);
}

createEmployeesAndLink().catch(error => {
  console.error('❌ Failed:', error);
  process.exit(1);
});
