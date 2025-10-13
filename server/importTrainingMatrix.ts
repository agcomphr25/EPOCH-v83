import { readFileSync } from 'fs';
import { db } from './db';
import { trainingMatrix } from './schema';

async function importTrainingMatrixCSV() {
  const csvPath = './attached_assets/Trng Matrix - Line Employees_1760391494512.csv';
  const csvContent = readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim());
  
  // Parse headers (row 2 contains training names)
  const trainingNames = lines[1].split(',').slice(1).map(name => name.trim()).filter(n => n);
  
  console.log(`Found ${trainingNames.length} training modules:`, trainingNames);
  
  // Parse employee data (rows 3+)
  const imported = [];
  
  for (let i = 2; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const employeeName = values[0];
    
    if (!employeeName) continue;
    
    console.log(`Processing employee: ${employeeName}`);
    
    // Process each training for this employee
    for (let j = 0; j < trainingNames.length; j++) {
      const trainingName = trainingNames[j];
      const cellValue = values[j + 1]; // +1 because first column is employee name
      
      let lastCompleted: Date | null = null;
      let status: 'PENDING' | 'COMPLETED' | 'OVERDUE' | 'NOT_REQUIRED' = 'PENDING';
      let notes: string | null = null;
      
      if (cellValue) {
        // Parse date from cell value
        const dateMatch = cellValue.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
        if (dateMatch) {
          try {
            lastCompleted = new Date(dateMatch[1]);
            status = 'COMPLETED';
            
            // Check for notes in parentheses
            const notesMatch = cellValue.match(/\(([^)]+)\)/);
            if (notesMatch) {
              notes = notesMatch[1];
            }
          } catch (e) {
            console.error(`Failed to parse date: ${cellValue}`);
          }
        }
      }
      
      // Insert into database
      const [entry] = await db
        .insert(trainingMatrix)
        .values({
          employeeName,
          jobTitle: null,
          department: null,
          trainingName,
          requiredBy: null,
          frequency: null,
          lastCompleted,
          nextDue: null,
          status,
          documentationUrl: null,
          notes,
          isLegacy: true
        })
        .returning();
      
      imported.push(entry);
    }
  }
  
  console.log(`✅ Successfully imported ${imported.length} training records`);
  process.exit(0);
}

importTrainingMatrixCSV().catch(error => {
  console.error('Import failed:', error);
  process.exit(1);
});
