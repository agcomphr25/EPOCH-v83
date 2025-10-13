import { db } from './db';
import { employees, trainingMatrix } from './schema';
import { eq } from 'drizzle-orm';

async function linkTrainingMatrixToEmployees() {
  // Get all unique employee names from training matrix
  const matrixEmployees = await db
    .selectDistinct({ name: trainingMatrix.employeeName })
    .from(trainingMatrix)
    .where(eq(trainingMatrix.employeeName, trainingMatrix.employeeName));
  
  const employeeNames = matrixEmployees
    .map(e => e.name)
    .filter(Boolean) as string[];
  
  console.log(`Found ${employeeNames.length} unique employees in training matrix`);
  
  for (const name of employeeNames) {
    // Check if employee exists
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
      // Create employee record
      const [newEmployee] = await db
        .insert(employees)
        .values({
          name,
          jobTitle: 'Line Employee', // Default for imported records
          department: 'Production', // Default for imported records
          userRole: 'EMPLOYEE'
        })
        .returning();
      
      employeeId = newEmployee.id;
      console.log(`+ Created employee: ${name} (ID: ${employeeId})`);
    }
    
    // Update training matrix records to link to employee ID
    const result = await db
      .update(trainingMatrix)
      .set({ employeeId })
      .where(eq(trainingMatrix.employeeName, name));
    
    console.log(`  Updated ${result.rowCount} training records for ${name}`);
  }
  
  console.log('\n✅ Successfully linked all training matrix records to employees');
  process.exit(0);
}

linkTrainingMatrixToEmployees().catch(error => {
  console.error('❌ Link failed:', error);
  process.exit(1);
});
