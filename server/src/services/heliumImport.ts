import pg from 'pg';
import { db } from '../../db';
import { trainingModules, trainingMatrix, employees } from '../../schema';
import { eq, and } from 'drizzle-orm';

const { Pool } = pg;

let heliumPool: pg.Pool | null = null;

function getHeliumPool(): pg.Pool {
  if (!heliumPool) {
    const connectionString = process.env.HELIUM_DATABASE_URL;
    if (!connectionString) {
      throw new Error('HELIUM_DATABASE_URL environment variable is not set');
    }
    heliumPool = new Pool({ connectionString });
  }
  return heliumPool;
}

export interface HeliumTrainingModule {
  id: number;
  title: string;
  description: string | null;
  pdf_url: string | null;
  passing_score: number;
  is_active: boolean;
  content: string | null;
  content_html: string | null;
  category: string | null;
  estimated_minutes: number;
  requires_certification: boolean;
  certification_id: number | null;
  pdf_source: string | null;
  version: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface HeliumTrainingMatrix {
  id: number;
  employee_id: number | null;
  employee_name: string | null;
  job_title: string | null;
  department: string | null;
  training_name: string;
  required_by: string | null;
  frequency: string | null;
  last_completed: Date | null;
  next_due: Date | null;
  status: string | null;
  documentation_url: string | null;
  notes: string | null;
  is_legacy: boolean | null;
  created_at: Date;
  updated_at: Date;
}

export async function testHeliumConnection(): Promise<boolean> {
  try {
    const pool = getHeliumPool();
    const result = await pool.query('SELECT 1');
    return result.rows.length > 0;
  } catch (error) {
    console.error('Helium connection test failed:', error);
    return false;
  }
}

export async function fetchHeliumTrainingModules(): Promise<HeliumTrainingModule[]> {
  const pool = getHeliumPool();
  const result = await pool.query<HeliumTrainingModule>(`
    SELECT * FROM training_modules 
    WHERE is_active = true 
    ORDER BY title
  `);
  return result.rows;
}

export async function fetchHeliumTrainingMatrix(): Promise<HeliumTrainingMatrix[]> {
  const pool = getHeliumPool();
  const result = await pool.query<HeliumTrainingMatrix>(`
    SELECT * FROM training_matrix 
    ORDER BY employee_name, training_name
  `);
  return result.rows;
}

export async function importHeliumTrainingModules(): Promise<{
  imported: number;
  updated: number;
  errors: string[];
}> {
  const heliumModules = await fetchHeliumTrainingModules();
  let imported = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const module of heliumModules) {
    try {
      const existing = await db
        .select()
        .from(trainingModules)
        .where(eq(trainingModules.title, module.title))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(trainingModules)
          .set({
            description: module.description,
            content: module.content,
            contentHtml: module.content_html,
            category: module.category,
            estimatedMinutes: module.estimated_minutes,
            passingScore: module.passing_score,
            requiresCertification: module.requires_certification,
            pdfSource: module.pdf_url || module.pdf_source,
            version: module.version,
            isActive: module.is_active,
            updatedAt: new Date(),
          })
          .where(eq(trainingModules.id, existing[0].id));
        updated++;
      } else {
        await db.insert(trainingModules).values({
          title: module.title,
          description: module.description,
          content: module.content,
          contentHtml: module.content_html,
          category: module.category,
          estimatedMinutes: module.estimated_minutes,
          passingScore: module.passing_score,
          requiresCertification: module.requires_certification,
          pdfSource: module.pdf_url || module.pdf_source,
          version: module.version,
          isActive: module.is_active,
          createdBy: module.created_by,
        });
        imported++;
      }
    } catch (error) {
      errors.push(`Failed to import module "${module.title}": ${error}`);
    }
  }

  return { imported, updated, errors };
}

export async function importHeliumTrainingMatrix(): Promise<{
  imported: number;
  updated: number;
  errors: string[];
}> {
  const heliumMatrix = await fetchHeliumTrainingMatrix();
  let imported = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const entry of heliumMatrix) {
    try {
      let employeeId: number | null = null;
      
      if (entry.employee_name) {
        const empResult = await db
          .select()
          .from(employees)
          .where(eq(employees.name, entry.employee_name))
          .limit(1);
        
        if (empResult.length > 0) {
          employeeId = empResult[0].id;
        }
      }

      const existing = await db
        .select()
        .from(trainingMatrix)
        .where(
          and(
            eq(trainingMatrix.employeeName, entry.employee_name || ''),
            eq(trainingMatrix.trainingName, entry.training_name)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(trainingMatrix)
          .set({
            employeeId,
            jobTitle: entry.job_title,
            department: entry.department,
            requiredBy: entry.required_by,
            frequency: entry.frequency,
            lastCompleted: entry.last_completed,
            nextDue: entry.next_due,
            status: entry.status || 'PENDING',
            documentationUrl: entry.documentation_url,
            notes: entry.notes,
            isLegacy: true,
            updatedAt: new Date(),
          })
          .where(eq(trainingMatrix.id, existing[0].id));
        updated++;
      } else {
        await db.insert(trainingMatrix).values({
          employeeId,
          employeeName: entry.employee_name,
          jobTitle: entry.job_title,
          department: entry.department,
          trainingName: entry.training_name,
          requiredBy: entry.required_by,
          frequency: entry.frequency,
          lastCompleted: entry.last_completed,
          nextDue: entry.next_due,
          status: entry.status || 'PENDING',
          documentationUrl: entry.documentation_url,
          notes: entry.notes,
          isLegacy: true,
        });
        imported++;
      }
    } catch (error) {
      errors.push(`Failed to import matrix entry for "${entry.employee_name}": ${error}`);
    }
  }

  return { imported, updated, errors };
}

export async function getHeliumStats(): Promise<{
  connected: boolean;
  moduleCount: number;
  matrixCount: number;
  employeeCount: number;
}> {
  try {
    const pool = getHeliumPool();
    
    const [modules, matrix, employees] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM training_modules'),
      pool.query('SELECT COUNT(*) FROM training_matrix'),
      pool.query('SELECT COUNT(*) FROM employees'),
    ]);

    return {
      connected: true,
      moduleCount: parseInt(modules.rows[0].count),
      matrixCount: parseInt(matrix.rows[0].count),
      employeeCount: parseInt(employees.rows[0].count),
    };
  } catch (error) {
    console.error('Failed to get helium stats:', error);
    return {
      connected: false,
      moduleCount: 0,
      matrixCount: 0,
      employeeCount: 0,
    };
  }
}

export async function closeHeliumConnection(): Promise<void> {
  if (heliumPool) {
    await heliumPool.end();
    heliumPool = null;
  }
}
