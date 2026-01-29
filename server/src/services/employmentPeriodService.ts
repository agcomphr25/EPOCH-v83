import { pool } from '../../db';

export async function isEmployeeActive(employeeId: number): Promise<boolean> {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) as count 
      FROM employment_periods 
      WHERE employee_id = $1 AND status = 'ACTIVE'
    `, [employeeId]);
    
    return parseInt(result[0]?.count || '0', 10) === 1;
  } catch (error) {
    console.warn(`[EmploymentPeriod] Failed to check active status for employee ${employeeId}:`, error);
    return false;
  }
}

export async function getActiveEmploymentPeriod(employeeId: number): Promise<any | null> {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        employee_id as "employeeId",
        start_date as "startDate",
        end_date as "endDate",
        employment_type as "employmentType",
        department,
        job_title as "jobTitle",
        status,
        started_via_session_id as "startedViaSessionId",
        ended_via_session_id as "endedViaSessionId",
        created_at as "createdAt"
      FROM employment_periods 
      WHERE employee_id = $1 AND status = 'ACTIVE'
      LIMIT 1
    `, [employeeId]);
    
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.warn(`[EmploymentPeriod] Failed to get active period for employee ${employeeId}:`, error);
    return null;
  }
}

export async function getEmploymentHistory(employeeId: number): Promise<any[]> {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        employee_id as "employeeId",
        start_date as "startDate",
        end_date as "endDate",
        employment_type as "employmentType",
        department,
        job_title as "jobTitle",
        status,
        started_via_session_id as "startedViaSessionId",
        ended_via_session_id as "endedViaSessionId",
        created_at as "createdAt"
      FROM employment_periods 
      WHERE employee_id = $1
      ORDER BY start_date DESC
    `, [employeeId]);
    
    return result;
  } catch (error) {
    console.warn(`[EmploymentPeriod] Failed to get employment history for employee ${employeeId}:`, error);
    return [];
  }
}

export async function hasEmploymentPeriods(employeeId: number): Promise<boolean> {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) as count 
      FROM employment_periods 
      WHERE employee_id = $1
    `, [employeeId]);
    
    return parseInt(result[0]?.count || '0', 10) > 0;
  } catch (error) {
    console.warn(`[EmploymentPeriod] Failed to check employment periods for employee ${employeeId}:`, error);
    return false;
  }
}

export function logLegacyEmployeeWarning(employeeId: number, employeeName?: string): void {
  console.warn(
    `[EmploymentPeriod] Employee ${employeeId}${employeeName ? ` (${employeeName})` : ''} ` +
    `has no employment_periods records. This is a legacy employee.`
  );
}
