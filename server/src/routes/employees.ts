import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { storage } from '../../storage';
import { pool } from '../../db';
import { emitHumanUpserted } from '../events/humanEvents';
import {
  uploadMiddleware,
  getFileInfo,
  getFileUrl,
  validateEmployeeDocumentAccess,
  getDocumentType,
} from '../../utils/fileUpload';
import {
  insertEmployeeSchema,
  insertCertificationSchema,
  insertEvaluationSchema,
  insertEmployeeDocumentSchema,
  insertTimeClockEntrySchema,
  insertChecklistItemSchema,
  insertOnboardingDocSchema,
  insertEmployeeLayupSettingsSchema,
} from '@shared/schema';

const router = Router();

// Helper function to generate next employee code
async function generateNextEmployeeCode(): Promise<string> {
  try {
    const result = await pool.query(
      `SELECT employee_code as "employeeCode"
       FROM employees
       WHERE employee_code ~ '^EMP[0-9]+$'
       ORDER BY CAST(SUBSTRING(employee_code FROM 4) AS INTEGER) DESC
       LIMIT 1`
    );

    // pool.query with tagged templates returns array directly
    if (!result || result.length === 0) {
      return 'EMP001';
    }

    const lastCode = result[0].employeeCode;
    const lastNumber = parseInt(lastCode.substring(3));
    const nextNumber = lastNumber + 1;
    return `EMP${nextNumber.toString().padStart(3, '0')}`;
  } catch (error) {
    console.error('Error generating employee code:', error);
    // Fallback: use full timestamp + random suffix to ensure uniqueness
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `EMP${timestamp}${random}`;
  }
}

// Employee Management Routes
router.get('/', async (req: Request, res: Response) => {
  try {
    const employees = await storage.getAllEmployees();
    res.json(employees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// Capability Management Routes (MUST be before /:id to avoid route collision)
router.get('/capabilities', async (req: Request, res: Response) => {
  try {
    const capabilities = await storage.getAllCapabilities();
    res.json(capabilities);
  } catch (error) {
    console.error('Get capabilities error:', error);
    res.status(500).json({ error: 'Failed to fetch capabilities' });
  }
});

router.post('/capabilities', async (req: Request, res: Response) => {
  try {
    const capabilityData = req.body;
    const newCapability = await storage.createCapability(capabilityData);
    res.status(201).json(newCapability);
  } catch (error) {
    console.error('Create capability error:', error);
    res.status(500).json({ error: 'Failed to create capability' });
  }
});

router.put('/capabilities/:id', async (req: Request, res: Response) => {
  try {
    const capabilityId = parseInt(req.params.id);
    const updates = req.body;
    const updatedCapability = await storage.updateCapability(
      capabilityId,
      updates
    );
    res.json(updatedCapability);
  } catch (error) {
    console.error('Update capability error:', error);
    res.status(500).json({ error: 'Failed to update capability' });
  }
});

router.delete('/capabilities/:id', async (req: Request, res: Response) => {
  try {
    const capabilityId = parseInt(req.params.id);
    await storage.deleteCapability(capabilityId);
    res.status(204).end();
  } catch (error) {
    console.error('Delete capability error:', error);
    res.status(500).json({ error: 'Failed to delete capability' });
  }
});

router.delete(
  '/employee-capabilities/:id',
  async (req: Request, res: Response) => {
    try {
      const employeeCapabilityId = parseInt(req.params.id);
      await storage.revokeCapability(employeeCapabilityId);
      res.status(204).end();
    } catch (error) {
      console.error('Revoke capability error:', error);
      res.status(500).json({ error: 'Failed to revoke capability' });
    }
  }
);

router.patch(
  '/employee-capabilities/:id/toggle',
  async (req: Request, res: Response) => {
    try {
      const employeeCapabilityId = parseInt(req.params.id);
      const { useHardcoded } = req.body;
      const updatedAssignment = await storage.toggleHardcodedCapability(
        employeeCapabilityId,
        useHardcoded
      );
      res.json(updatedAssignment);
    } catch (error) {
      console.error('Toggle hardcoded capability error:', error);
      res.status(500).json({ error: 'Failed to toggle hardcoded capability' });
    }
  }
);

// Employee Certifications Matrix - Get all employees with their certifications (MUST be before /:id)
router.get('/certifications-matrix', async (req: Request, res: Response) => {
  try {
    // Get all active certifications and all active employees in a CROSS JOIN
    // Then LEFT JOIN to employee_certifications to show which ones they have
    const result = await pool.query(`
      SELECT 
        e.id as "employeeId",
        e.name as "employeeName",
        e.job_title as "jobTitle",
        e.department as "department",
        c.id as "certificationId",
        c.name as "certificationName",
        ec.id as "id",
        ec.date_obtained as "dateObtained",
        ec.expiry_date as "expiryDate",
        COALESCE(ec.is_active, false) as "isActive",
        ec.notes
      FROM employees e
      CROSS JOIN certifications c
      LEFT JOIN employee_certifications ec 
        ON e.id = ec.employee_id AND c.id = ec.certification_id
      WHERE e.is_active = true AND c.is_active = true AND c.category = 'DEPARTMENT'
      ORDER BY e.name, c.name
    `);

    console.log('Certifications matrix result:', result.length, 'rows');
    res.json(result || []);
  } catch (error) {
    console.error('Get certifications matrix error:', error);
    res.status(500).json({ error: 'Failed to fetch certifications matrix' });
  }
});

// All Evaluations - Get all employees with their evaluations (MUST be before /:id)
router.get('/evaluations', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        e.id as "employeeId",
        e.name as "employeeName",
        e.job_title as "jobTitle",
        e.department as "department",
        ev.id as "evaluationId",
        ev.evaluation_type as "evaluationType",
        ev.evaluation_period_start as "evaluationPeriodStart",
        ev.evaluation_period_end as "evaluationPeriodEnd",
        ev.overall_rating as "overallRating",
        ev.achievements as "strengths",
        ev.areas_for_improvement as "areasForImprovement",
        ev.goals,
        ev.evaluator_id as "evaluatedBy",
        ev.reviewed_at as "evaluatedAt",
        ev.status
      FROM employees e
      LEFT JOIN evaluations ev ON e.id = ev.employee_id
      WHERE e.is_active = true
      ORDER BY e.name, ev.evaluation_period_end DESC
    `);

    res.json(result || []);
  } catch (error) {
    console.error('Get evaluations error:', error);
    res.status(500).json({ error: 'Failed to fetch evaluations' });
  }
});

// Create new evaluation (MUST be before /:id)
router.post('/evaluations', async (req: Request, res: Response) => {
  try {
    const {
      employeeId,
      evaluationType,
      certificationIds,
      strengths,
      areasForImprovement,
      goals,
      evaluatedBy,
      status,
    } = req.body;

    if (!employeeId) {
      return res.status(400).json({ error: 'Employee ID is required' });
    }

    // Calculate period start/end based on evaluation type
    const now = new Date();
    const periodEnd = now;
    let periodStart = new Date(now);

    switch (evaluationType) {
      case 'BIANNUAL':
        periodStart.setMonth(periodStart.getMonth() - 6);
        break;
      case 'ANNUAL':
        periodStart.setFullYear(periodStart.getFullYear() - 1);
        break;
      case 'QUARTERLY':
        periodStart.setMonth(periodStart.getMonth() - 3);
        break;
      case 'PROBATION':
        periodStart.setMonth(periodStart.getMonth() - 3);
        break;
      default:
        periodStart.setMonth(periodStart.getMonth() - 6);
    }

    // Create evaluation
    const result = await pool.query(
      `INSERT INTO evaluations (
        employee_id,
        evaluation_type,
        evaluation_period_start,
        evaluation_period_end,
        achievements,
        areas_for_improvement,
        goals,
        evaluator_id,
        status,
        reviewed_at,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING id`,
      [
        employeeId,
        evaluationType,
        periodStart.toISOString(),
        periodEnd.toISOString(),
        strengths || '',
        areasForImprovement || '',
        goals || '',
        evaluatedBy || 'system',
        status || 'COMPLETED',
        now.toISOString()
      ]
    );

    const evaluationId = result[0]?.id;

    // Link certifications to evaluation if provided
    if (certificationIds && certificationIds.length > 0) {
      for (const certId of certificationIds) {
        await pool.query(
          `INSERT INTO evaluation_certifications (evaluation_id, certification_id) VALUES ($1, $2)`,
          [evaluationId, certId]
        );
      }
    }

    res.status(201).json({
      success: true,
      evaluationId,
      message: 'Evaluation created successfully',
    });
  } catch (error) {
    console.error('Create evaluation error:', error);
    if (error instanceof Error) {
      return res.status(500).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create evaluation' });
  }
});

// Employee Layup Settings CRUD (migrated from monolithic routes.ts)
// Note: These routes don't require authentication for use in Layup Scheduler
// MUST be before /:id to avoid route collision
router.get('/layup-settings', async (req: Request, res: Response) => {
  try {
    const settings = await storage.getAllEmployeeLayupSettings();
    res.json(settings);
  } catch (error) {
    console.error('Employee layup settings fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch employee layup settings' });
  }
});

router.get(
  '/layup-settings/:employeeId',
  async (req: Request, res: Response) => {
    try {
      const settings = await storage.getEmployeeLayupSettings(
        req.params.employeeId
      );
      if (settings) {
        res.json(settings);
      } else {
        res.status(404).json({ error: 'Employee layup settings not found' });
      }
    } catch (error) {
      console.error('Employee layup settings fetch error:', error);
      res
        .status(500)
        .json({ error: 'Failed to fetch employee layup settings' });
    }
  }
);

router.post('/layup-settings', async (req: Request, res: Response) => {
  try {
    const result = insertEmployeeLayupSettingsSchema.parse(req.body);
    const settings = await storage.createEmployeeLayupSettings(result);
    res.json(settings);
  } catch (error) {
    console.error('Employee layup settings creation error:', error);
    res.status(400).json({ error: 'Invalid employee layup settings data' });
  }
});

router.put(
  '/layup-settings/:employeeId',
  async (req: Request, res: Response) => {
    try {
      // Decode URL-encoded employee ID
      const employeeId = decodeURIComponent(req.params.employeeId);
      console.log(
        `💾 API: Updating employee layup settings for: "${employeeId}"`
      );
      console.log(`📝 API: Update data:`, req.body);

      // Validate the data (but be flexible with required fields for updates)
      const updateData = {
        rate: req.body.rate ? parseFloat(req.body.rate) : undefined,
        hours: req.body.hours ? parseFloat(req.body.hours) : undefined,
        department: req.body.department || undefined,
        isActive:
          req.body.isActive !== undefined ? req.body.isActive : undefined,
        updatedAt: new Date(),
      };

      // Remove undefined values
      const cleanData = Object.fromEntries(
        Object.entries(updateData).filter(([_, value]) => value !== undefined)
      );

      console.log(`🧹 API: Clean update data:`, cleanData);

      const settings = await storage.updateEmployeeLayupSettings(
        employeeId,
        cleanData
      );
      console.log(
        `✅ API: Successfully updated employee layup settings for: "${employeeId}"`
      );
      res.json(settings);
    } catch (error) {
      console.error('❌ API: Employee layup settings update error:', error);
      console.error('❌ API: Error details:', (error as any)?.message);
      res.status(500).json({
        error: 'Failed to update employee layup settings',
        details: (error as any)?.message || 'Unknown error',
        employeeId: decodeURIComponent(req.params.employeeId),
      });
    }
  }
);

router.delete(
  '/layup-settings/:employeeId',
  async (req: Request, res: Response) => {
    try {
      await storage.deleteEmployeeLayupSettings(req.params.employeeId);
      res.json({ success: true });
    } catch (error) {
      console.error('Employee layup settings deletion error:', error);
      res
        .status(500)
        .json({ error: 'Failed to delete employee layup settings' });
    }
  }
);

// Get all employee certifications (MUST be before /:id to avoid route collision)
router.get('/certifications', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT 
        ec.id,
        ec.employee_id as "employeeId",
        ec.certification_id as "certificationId",
        ec.date_obtained as "dateObtained",
        ec.expiry_date as "expiryDate",
        ec.is_active as "isActive",
        ec.notes,
        e.name as "employeeName",
        c.name as "certificationName"
      FROM employee_certifications ec
      JOIN employees e ON ec.employee_id = e.id
      JOIN certifications c ON ec.certification_id = c.id
      ORDER BY e.name, c.name`
    );
    res.json(result);
  } catch (error) {
    console.error('Get employee certifications error:', error);
    res.status(500).json({ error: 'Failed to fetch employee certifications' });
  }
});

// Create or update employee certification (MUST be before /:id to avoid route collision)
router.post('/certifications', async (req: Request, res: Response) => {
  try {
    const { employeeId, certificationId, dateObtained, expiryDate, notes } = req.body;

    if (!employeeId || !certificationId) {
      return res.status(400).json({ error: 'Employee ID and Certification ID are required' });
    }

    // Check if certification already exists
    const existing = await pool.query(
      `SELECT id FROM employee_certifications WHERE employee_id = $1 AND certification_id = $2`,
      [employeeId, certificationId]
    );

    if (existing.length > 0) {
      // Update existing
      await pool.query(
        `UPDATE employee_certifications 
         SET date_obtained = $1, expiry_date = $2, notes = $3, is_active = $4, updated_at = NOW()
         WHERE employee_id = $5 AND certification_id = $6`,
        [dateObtained || null, expiryDate || null, notes || null, !!dateObtained, employeeId, certificationId]
      );
      
      const updated = await pool.query(
        `SELECT * FROM employee_certifications WHERE employee_id = $1 AND certification_id = $2`,
        [employeeId, certificationId]
      );
      
      return res.json(updated[0]);
    }

    // Create new
    const result = await pool.query(
      `INSERT INTO employee_certifications (employee_id, certification_id, date_obtained, expiry_date, notes, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [employeeId, certificationId, dateObtained || null, expiryDate || null, notes || null, !!dateObtained]
    );

    res.json(result[0]);
  } catch (error) {
    console.error('Create certification error:', error);
    res.status(500).json({ error: 'Failed to create certification' });
  }
});

// Update employee certification (MUST be before /:id)
router.patch('/certifications/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { dateObtained, expiryDate, notes, isActive } = req.body;

    await pool.query(
      `UPDATE employee_certifications 
       SET date_obtained = $1, expiry_date = $2, notes = $3, is_active = $4, updated_at = NOW()
       WHERE id = $5`,
      [
        dateObtained !== undefined ? dateObtained : null,
        expiryDate !== undefined ? expiryDate : null,
        notes !== undefined ? notes : null,
        isActive !== undefined ? isActive : !!dateObtained,
        id
      ]
    );

    const updated = await pool.query(
      `SELECT * FROM employee_certifications WHERE id = $1`,
      [id]
    );

    if (updated.length === 0) {
      return res.status(404).json({ error: 'Certification not found' });
    }

    res.json(updated[0]);
  } catch (error) {
    console.error('Update certification error:', error);
    res.status(500).json({ error: 'Failed to update certification' });
  }
});

// Delete employee certification (MUST be before /:id)
router.delete('/certifications/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await pool.query(
      `DELETE FROM employee_certifications WHERE id = $1`,
      [id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Delete certification error:', error);
    res.status(500).json({ error: 'Failed to delete certification' });
  }
});

// Get Finish Technicians (MUST be before /:id to avoid route collision)
router.get('/finish-technicians', async (req: Request, res: Response) => {
  try {
    const finishTechnicians = await pool.query(
      `SELECT id, name, employee_code as "employeeCode"
       FROM employees
       WHERE is_finish_technician = true AND is_active = true
       ORDER BY name`
    );
    res.json(finishTechnicians || []);
  } catch (error) {
    console.error('Get Finish technicians error:', error);
    res.status(500).json({ error: 'Failed to fetch Finish technicians' });
  }
});

// Employment Periods - must be before /:id to avoid route collision
router.get('/:id/employment-periods', async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.id);
    
    if (isNaN(employeeId)) {
      return res.status(400).json({ error: 'Invalid employee ID' });
    }
    
    const periods = await pool.query(`
      SELECT 
        ep.id,
        ep.employee_id as "employeeId",
        ep.start_date as "startDate",
        ep.end_date as "endDate",
        ep.employment_type as "employmentType",
        ep.department,
        ep.job_title as "jobTitle",
        ep.status,
        ep.started_via_session_id as "startedViaSessionId",
        ep.ended_via_session_id as "endedViaSessionId",
        ep.created_at as "createdAt",
        start_session.path_name as "startedViaPathName",
        start_session.path_purpose as "startedViaPathPurpose",
        end_session.path_name as "endedViaPathName",
        end_session.path_purpose as "endedViaPathPurpose"
      FROM employment_periods ep
      LEFT JOIN onboarding_sessions start_session ON ep.started_via_session_id = start_session.id
      LEFT JOIN onboarding_sessions end_session ON ep.ended_via_session_id = end_session.id
      WHERE ep.employee_id = $1
      ORDER BY ep.start_date ASC
    `, [employeeId]);
    
    // For each period with a session, check if a bundle exists
    const periodsWithBundleInfo = await Promise.all(
      periods.map(async (period: any) => {
        let startBundlePath = null;
        let endBundlePath = null;
        
        if (period.startedViaSessionId) {
          const bundleResult = await pool.query(`
            SELECT bundle_path as "bundlePath" 
            FROM onboarding_sessions 
            WHERE id = $1 AND bundle_path IS NOT NULL
          `, [period.startedViaSessionId]);
          if (bundleResult.length > 0) {
            startBundlePath = bundleResult[0].bundlePath;
          }
        }
        
        if (period.endedViaSessionId) {
          const bundleResult = await pool.query(`
            SELECT bundle_path as "bundlePath" 
            FROM onboarding_sessions 
            WHERE id = $1 AND bundle_path IS NOT NULL
          `, [period.endedViaSessionId]);
          if (bundleResult.length > 0) {
            endBundlePath = bundleResult[0].bundlePath;
          }
        }
        
        return {
          ...period,
          startBundlePath,
          endBundlePath,
        };
      })
    );
    
    res.json(periodsWithBundleInfo);
  } catch (error) {
    console.error('Error fetching employment periods:', error);
    res.status(500).json({ error: 'Failed to fetch employment periods' });
  }
});

// Parametric routes MUST come after all specific routes
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const employee = await storage.getEmployee(parseInt(req.params.id));
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json(employee);
  } catch (error) {
    console.error('Get employee error:', error);
    res.status(500).json({ error: 'Failed to fetch employee' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    let employeeData = insertEmployeeSchema.parse(req.body);
    
    // Auto-generate employee code if not provided
    if (!employeeData.employeeCode) {
      employeeData.employeeCode = await generateNextEmployeeCode();
    }
    
    // IC-2: Canonical Identity matching/creation
    let canonicalId: string | null = null;
    
    if (employeeData.email) {
      // Try to find existing canonical identity by email
      const existingIdentity = await storage.getCanonicalIdentityByEmail(employeeData.email);
      
      if (existingIdentity) {
        canonicalId = existingIdentity.id;
        console.log(`[IC-2] Matched canonical identity ${canonicalId} for email ${employeeData.email}`);
      } else {
        // Create new canonical identity
        const newIdentity = await storage.createCanonicalIdentity({
          displayName: employeeData.name,
          primaryEmail: employeeData.email,
          source: 'epoch',
          status: 'active',
        });
        canonicalId = newIdentity.id;
        console.log(`[IC-2] Created new canonical identity ${canonicalId} for ${employeeData.name}`);
      }
    } else {
      // No email - still create canonical identity for tracking
      const newIdentity = await storage.createCanonicalIdentity({
        displayName: employeeData.name,
        source: 'epoch',
        status: 'active',
      });
      canonicalId = newIdentity.id;
      console.log(`[IC-2] Created canonical identity ${canonicalId} for ${employeeData.name} (no email)`);
    }
    
    // Attach canonical_id to employee data
    const employeeWithCanonical = { ...employeeData, canonicalId };
    
    const newEmployee = await storage.createEmployee(employeeWithCanonical);
    
    // IC-3: Emit HUMAN_UPSERTED event (non-blocking)
    if (newEmployee.canonicalId) {
      emitHumanUpserted({
        canonicalId: newEmployee.canonicalId,
        epochEmployeeId: newEmployee.id,
        displayName: newEmployee.name,
        email: newEmployee.email,
        isActive: newEmployee.isActive ?? true,
      });
    }
    
    res.status(201).json(newEmployee);
  } catch (error) {
    console.error('Create employee error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create employee' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.id);
    let updates = req.body;
    
    // Normalize employeeCode - trim whitespace
    if (typeof updates.employeeCode === 'string') {
      updates.employeeCode = updates.employeeCode.trim();
    }
    
    // Get current employee for comparison
    const currentEmployee = await storage.getEmployee(employeeId);
    if (!currentEmployee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    // Auto-generate employee code if missing/empty and employee doesn't have one
    if (!updates.employeeCode || updates.employeeCode === '') {
      if (!currentEmployee?.employeeCode) {
        updates.employeeCode = await generateNextEmployeeCode();
      } else {
        // Keep existing code if available
        delete updates.employeeCode;
      }
    }
    
    // IC-2: Check if key fields changed that require canonical identity upsert
    const nameChanged = updates.name && updates.name !== currentEmployee.name;
    const emailChanged = updates.email !== undefined && updates.email !== currentEmployee.email;
    const statusChanged = updates.isActive !== undefined && updates.isActive !== currentEmployee.isActive;
    
    if (nameChanged || emailChanged || statusChanged) {
      // Emit canonical identity upsert
      if (currentEmployee.canonicalId) {
        // Update existing canonical identity
        await storage.updateCanonicalIdentity(currentEmployee.canonicalId, {
          displayName: updates.name || currentEmployee.name,
          primaryEmail: updates.email !== undefined ? updates.email : currentEmployee.email,
          status: (updates.isActive !== undefined ? updates.isActive : currentEmployee.isActive) ? 'active' : 'inactive',
        });
        console.log(`[IC-2] Updated canonical identity ${currentEmployee.canonicalId} due to employee field changes`);
      } else if (updates.email || currentEmployee.email) {
        // Employee has no canonical ID but has email - try to match or create
        const email = updates.email || currentEmployee.email;
        const existingIdentity = await storage.getCanonicalIdentityByEmail(email);
        
        if (existingIdentity) {
          updates.canonicalId = existingIdentity.id;
          console.log(`[IC-2] Matched canonical identity ${existingIdentity.id} for updated email ${email}`);
        } else {
          const newIdentity = await storage.createCanonicalIdentity({
            displayName: updates.name || currentEmployee.name,
            primaryEmail: email,
            source: 'epoch',
            status: (updates.isActive !== undefined ? updates.isActive : currentEmployee.isActive) ? 'active' : 'inactive',
          });
          updates.canonicalId = newIdentity.id;
          console.log(`[IC-2] Created canonical identity ${newIdentity.id} for employee update`);
        }
      }
    }
    
    const updatedEmployee = await storage.updateEmployee(employeeId, updates);
    
    // IC-3: Emit HUMAN_UPSERTED event (non-blocking)
    const finalCanonicalId = updatedEmployee.canonicalId || updates.canonicalId;
    if (finalCanonicalId) {
      emitHumanUpserted({
        canonicalId: finalCanonicalId,
        epochEmployeeId: updatedEmployee.id,
        displayName: updatedEmployee.name,
        email: updatedEmployee.email,
        isActive: updatedEmployee.isActive ?? true,
      });
    }
    
    res.json(updatedEmployee);
  } catch (error) {
    console.error('Update employee error:', error);
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.id);
    
    // Get employee before deactivation to emit event
    const employee = await storage.getEmployee(employeeId);
    
    await storage.deleteEmployee(employeeId);
    
    // IC-3: Emit HUMAN_UPSERTED event for deactivation (non-blocking)
    if (employee?.canonicalId) {
      emitHumanUpserted({
        canonicalId: employee.canonicalId,
        epochEmployeeId: employee.id,
        displayName: employee.name,
        email: employee.email,
        isActive: false, // Deactivated
      });
      
      // Also update canonical identity status
      await storage.updateCanonicalIdentity(employee.canonicalId, {
        status: 'inactive',
      });
    }
    
    res.status(204).end();
  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

// Employee Portal Token Generation
router.post('/:id/portal-token', async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.id);
    const token = await storage.generateEmployeePortalToken(employeeId);
    res.json({ 
      token, 
      portalUrl: `${req.protocol}://${req.get('host')}/employee-portal/${token}` 
    });
  } catch (error) {
    console.error('Generate portal token error:', error);
    res.status(500).json({ error: 'Failed to generate portal token' });
  }
});

// Certification Management
router.get('/:id/certifications', async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id;
    let employeeId: number;

    // Check if the parameter is a numeric ID or employee code
    if (isNaN(Number(idParam))) {
      // It's an employee code, look up the numeric ID
      const result = await pool.query(
        `SELECT id FROM employees WHERE employee_code = $1`,
        [idParam]
      );
      
      if (!result || result.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }
      
      employeeId = result[0].id;
    } else {
      // It's a numeric ID
      employeeId = parseInt(idParam);
    }

    const certifications = await storage.getEmployeeCertifications(employeeId);
    res.json(certifications);
  } catch (error) {
    console.error('Get certifications error:', error);
    res.status(500).json({ error: 'Failed to fetch certifications' });
  }
});

// Temporarily commented out - method not available in storage interface
// router.post('/:id/certifications', authenticateToken, requireRole('ADMIN'), async (req: Request, res: Response) => {
//   try {
//     const employeeId = parseInt(req.params.id);
//     const certificationData = { ...req.body, employeeId };
//     const newCertification = await storage.assignCertification(certificationData);
//     res.status(201).json(newCertification);
//   } catch (error) {
//     console.error('Assign certification error:', error);
//     res.status(500).json({ error: "Failed to assign certification" });
//   }
// });

// Performance Evaluations - Temporarily commented out - method not available in storage interface
// router.get('/:id/evaluations', authenticateToken, requireEmployeeAccess, async (req: Request, res: Response) => {
//   try {
//     const employeeId = parseInt(req.params.id);
//     const evaluations = await storage.getEmployeeEvaluations(employeeId);
//     res.json(evaluations);
//   } catch (error) {
//     console.error('Get evaluations error:', error);
//     res.status(500).json({ error: "Failed to fetch evaluations" });
//   }
// });

router.post('/:id/evaluations', async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.id);
    const evaluationData = insertEvaluationSchema.parse({
      ...req.body,
      employeeId,
    });
    const newEvaluation = await storage.createEvaluation(evaluationData);
    res.status(201).json(newEvaluation);
  } catch (error) {
    console.error('Create evaluation error:', error);
    res.status(500).json({ error: 'Failed to create evaluation' });
  }
});

// Time Clock Management - Temporarily commented out - method not available in storage interface
// router.get('/:id/time-entries', authenticateToken, requireEmployeeAccess, async (req: Request, res: Response) => {
//   try {
//     const employeeId = req.params.id;
//     const entries = await storage.getEmployeeTimeEntries(employeeId);
//     res.json(entries);
//   } catch (error) {
//     console.error('Get time entries error:', error);
//     res.status(500).json({ error: "Failed to fetch time entries" });
//   }
// });

// Clock in/out temporarily commented out - method signature mismatch in storage interface
// router.post('/:id/clock-in', async (req: Request, res: Response) => {
//   try {
//     const employeeId = req.params.id;
//     const { location, notes } = req.body;
//     const entry = await storage.clockIn(employeeId, location, notes);
//     res.json(entry);
//   } catch (error) {
//     console.error('Clock in error:', error);
//     res.status(500).json({ error: "Failed to clock in" });
//   }
// });

// router.post('/:id/clock-out', async (req: Request, res: Response) => {
//   try {
//     const employeeId = req.params.id;
//     const { location, notes } = req.body;
//     const entry = await storage.clockOut(employeeId, location, notes);
//     res.json(entry);
//   } catch (error) {
//     console.error('Clock out error:', error);
//     res.status(500).json({ error: "Failed to clock out" });
//   }
// });

// Document Management
router.post(
  '/:id/documents',
  uploadMiddleware.single('document'),
  async (req: Request, res: Response) => {
    try {
      const employeeId = parseInt(req.params.id);
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const documentData = {
        employeeId,
        fileName: file.originalname,
        filePath: file.path,
        fileSize: file.size,
        mimeType: file.mimetype,
        documentType: getDocumentType(file.originalname, file.mimetype),
        uploadedBy: (req as any).user?.id,
        expirationDate: req.body.expirationDate
          ? new Date(req.body.expirationDate)
          : null,
        notes: req.body.notes || null,
      };

      // Temporarily commented out - method not available in storage interface
      // const document = await storage.uploadEmployeeDocument(documentData);
      res
        .status(501)
        .json({ error: 'Document upload temporarily unavailable' });
    } catch (error) {
      console.error('Upload document error:', error);
      res.status(500).json({ error: 'Failed to upload document' });
    }
  }
);

// Temporarily commented out - method not available in storage interface
// router.get('/:id/documents', authenticateToken, requireEmployeeAccess, async (req: Request, res: Response) => {
//   try {
//     const employeeId = parseInt(req.params.id);
//     const documents = await storage.getEmployeeDocuments(employeeId);
//     res.json(documents);
//   } catch (error) {
//     console.error('Get documents error:', error);
//     res.status(500).json({ error: "Failed to fetch documents" });
//   }
// });

// Daily Checklist Management
router.get('/:id/checklist/:date?', async (req: Request, res: Response) => {
  try {
    const employeeId = req.params.id;
    const date = req.params.date || new Date().toISOString().split('T')[0];
    const checklist = await storage.getDailyChecklist(employeeId, date);
    res.json(checklist);
  } catch (error) {
    console.error('Get checklist error:', error);
    res.status(500).json({ error: 'Failed to fetch checklist' });
  }
});

router.post('/:id/checklist', async (req: Request, res: Response) => {
  try {
    const employeeId = req.params.id;
    const checklistData = req.body;
    const updatedChecklist = await storage.updateDailyChecklist(
      employeeId,
      checklistData
    );
    res.json(updatedChecklist);
  } catch (error) {
    console.error('Update checklist error:', error);
    res.status(500).json({ error: 'Failed to update checklist' });
  }
});

// Employee Capability Assignment Routes (moved here to avoid conflicts)
router.get('/:id/capabilities', async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.id);
    const capabilities = await storage.getEmployeeCapabilities(employeeId);
    res.json(capabilities);
  } catch (error) {
    console.error('Get employee capabilities error:', error);
    res.status(500).json({ error: 'Failed to fetch employee capabilities' });
  }
});

router.post('/:id/capabilities', async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.id);
    const { capabilityId, useHardcoded } = req.body;
    const assignmentData = {
      employeeId,
      capabilityId,
      isHardcoded: useHardcoded ?? true,
      useHardcodedValue: useHardcoded ?? true,
    };
    const newAssignment = await storage.grantCapability(assignmentData);
    res.status(201).json(newAssignment);
  } catch (error) {
    console.error('Grant capability error:', error);
    res.status(500).json({ error: 'Failed to grant capability' });
  }
});

// Import Certifications from PDF using Azure Document Intelligence
router.post(
  '/import-certifications-pdf',
  uploadMiddleware.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      console.log('📄 Extracting certification data from PDF...');
      
      try {
        // Import the Azure Document Intelligence function
        const { extractTrainingMatrixData } = await import('../lib/azureDocumentIntelligence');
        
        // Extract data from PDF
        const extractedData = await extractTrainingMatrixData(req.file.buffer);
        console.log(`✅ Extracted ${extractedData.entries.length} certification entries from PDF`);

        // Get all employees and certifications for mapping
        const [employees, certifications] = await Promise.all([
          pool.query(`SELECT id, name FROM employees WHERE is_active = true`),
          pool.query(`SELECT id, name FROM certifications WHERE category = 'DEPARTMENT'`)
        ]);

        // Create mapping helpers
        const employeeNameToId = new Map<string, number>();
        employees.forEach((emp: any) => {
          const normalizedName = emp.name.toLowerCase().trim();
          employeeNameToId.set(normalizedName, emp.id);
        });

        const certNameToId = new Map<string, number>();
        certifications.forEach((cert: any) => {
          const normalizedName = cert.name.toLowerCase().trim();
          certNameToId.set(normalizedName, cert.id);
        });

        // Process extracted entries
        const importResults = {
          total: extractedData.entries.length,
          imported: 0,
          skipped: 0,
          errors: [] as string[],
          details: [] as any[]
        };

        for (const entry of extractedData.entries) {
          try {
            const employeeName = entry.employeeName?.toLowerCase().trim();
            const employeeId = employeeName ? employeeNameToId.get(employeeName) : null;

            if (!employeeId) {
              importResults.skipped++;
              importResults.errors.push(`Employee not found: ${entry.employeeName}`);
              continue;
            }

            const certName = entry.trainingName?.toLowerCase().trim();
            const certificationId = certName ? certNameToId.get(certName) : null;

            if (!certificationId) {
              importResults.skipped++;
              importResults.errors.push(`Certification not found: ${entry.trainingName}`);
              continue;
            }

            const existingCert = await pool.query(
              `SELECT id FROM employee_certifications WHERE employee_id = $1 AND certification_id = $2`,
              [employeeId, certificationId]
            );

            if (existingCert.length > 0) {
              await pool.query(
                `UPDATE employee_certifications SET date_obtained = $1, is_active = true, updated_at = NOW()
                 WHERE employee_id = $2 AND certification_id = $3`,
                [entry.lastCompleted, employeeId, certificationId]
              );
              importResults.details.push({
                employee: entry.employeeName,
                certification: entry.trainingName,
                action: 'updated',
                date: entry.lastCompleted
              });
            } else {
              await pool.query(
                `INSERT INTO employee_certifications (employee_id, certification_id, date_obtained, is_active)
                 VALUES ($1, $2, $3, true)`,
                [employeeId, certificationId, entry.lastCompleted]
              );
              importResults.details.push({
                employee: entry.employeeName,
                certification: entry.trainingName,
                action: 'created',
                date: entry.lastCompleted
              });
            }

            importResults.imported++;
          } catch (error) {
            importResults.skipped++;
            importResults.errors.push(
              `Error processing ${entry.employeeName} - ${entry.trainingName}: ${(error as Error).message}`
            );
          }
        }

        console.log(`✅ PDF Import complete: ${importResults.imported} imported, ${importResults.skipped} skipped`);
        return res.json(importResults);
      } catch (azureError: any) {
        // Handle Azure Document Intelligence specific errors
        if (azureError.code === 'InvalidRequest' || azureError.code === 'InvalidContent') {
          return res.status(422).json({
            error: 'PDF format not supported',
            details: 'This PDF format cannot be processed by Azure Document Intelligence. Please export your training matrix as a CSV file instead.',
            suggestion: 'Use CSV format with columns: Employee, Certification, Date'
          });
        }
        throw azureError;
      }
    } catch (error) {
      console.error('Import certifications PDF error:', error);
      res.status(500).json({ 
        error: 'Failed to import certifications from PDF',
        details: (error as Error).message 
      });
    }
  }
);

// Import Certifications from CSV
router.post(
  '/import-certifications-csv',
  uploadMiddleware.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      console.log('📄 Parsing CSV certification data...');
      
      const Papa = await import('papaparse');
      const csvText = req.file.buffer.toString('utf-8');
      
      const parseResult = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim().toLowerCase()
      });

      if (parseResult.errors.length > 0) {
        console.error('CSV parsing errors:', parseResult.errors);
        return res.status(422).json({
          error: 'CSV parsing failed',
          details: parseResult.errors.map((e: any) => e.message).join(', ')
        });
      }

      console.log(`✅ Parsed ${parseResult.data.length} rows from CSV`);

      // Get all employees and certifications for mapping
      const [employees, certifications] = await Promise.all([
        pool.query(`SELECT id, name FROM employees WHERE is_active = true`),
        pool.query(`SELECT id, name FROM certifications WHERE category = 'DEPARTMENT'`)
      ]);

      // Create mapping helpers
      const employeeNameToId = new Map<string, number>();
      employees.forEach((emp: any) => {
        const normalizedName = emp.name.toLowerCase().trim();
        employeeNameToId.set(normalizedName, emp.id);
      });

      const certNameToId = new Map<string, number>();
      certifications.forEach((cert: any) => {
        const normalizedName = cert.name.toLowerCase().trim();
        certNameToId.set(normalizedName, cert.id);
      });

      // Process CSV entries
      const importResults = {
        total: parseResult.data.length,
        imported: 0,
        skipped: 0,
        errors: [] as string[],
        details: [] as any[]
      };

      for (const row of parseResult.data as any[]) {
        try {
          // Expected columns: employee, certification, date
          const employeeName = row.employee || row['employee name'] || row.name;
          const certName = row.certification || row['certification name'] || row.training;
          const dateStr = row.date || row['date obtained'] || row.completed;

          if (!employeeName || !certName) {
            importResults.skipped++;
            importResults.errors.push(`Missing employee or certification name in row`);
            continue;
          }

          // Map employee name to ID
          const normalizedEmpName = employeeName.toLowerCase().trim();
          const employeeId = employeeNameToId.get(normalizedEmpName);

          if (!employeeId) {
            importResults.skipped++;
            importResults.errors.push(`Employee not found: ${employeeName}`);
            continue;
          }

          // Map certification name to ID
          const normalizedCertName = certName.toLowerCase().trim();
          const certificationId = certNameToId.get(normalizedCertName);

          if (!certificationId) {
            importResults.skipped++;
            importResults.errors.push(`Certification not found: ${certName}`);
            continue;
          }

          // Parse date
          let dateObtained: Date | null = null;
          if (dateStr) {
            try {
              dateObtained = new Date(dateStr);
              if (isNaN(dateObtained.getTime())) {
                dateObtained = null;
              }
            } catch (e) {
              dateObtained = null;
            }
          }

          // Check if certification already exists
          const existingCert = await pool.query(
            `SELECT id FROM employee_certifications WHERE employee_id = $1 AND certification_id = $2`,
            [employeeId, certificationId]
          );

          if (existingCert.length > 0) {
            // Update existing certification
            await pool.query(
              `UPDATE employee_certifications SET date_obtained = $1, is_active = true, updated_at = NOW()
               WHERE employee_id = $2 AND certification_id = $3`,
              [dateObtained, employeeId, certificationId]
            );
            importResults.details.push({
              employee: employeeName,
              certification: certName,
              action: 'updated',
              date: dateObtained
            });
          } else {
            // Insert new certification
            await pool.query(
              `INSERT INTO employee_certifications (employee_id, certification_id, date_obtained, is_active)
               VALUES ($1, $2, $3, true)`,
              [employeeId, certificationId, dateObtained]
            );
            importResults.details.push({
              employee: employeeName,
              certification: certName,
              action: 'created',
              date: dateObtained
            });
          }

          importResults.imported++;
        } catch (error) {
          importResults.skipped++;
          importResults.errors.push(
            `Error processing row: ${(error as Error).message}`
          );
        }
      }

      console.log(`✅ CSV Import complete: ${importResults.imported} imported, ${importResults.skipped} skipped`);
      res.json(importResults);
    } catch (error) {
      console.error('Import certifications CSV error:', error);
      res.status(500).json({ 
        error: 'Failed to import certifications from CSV',
        details: (error as Error).message 
      });
    }
  }
);

// Get all employee capabilities (for filtering certified employees)
router.get('/employee-capabilities/all', async (req: Request, res: Response) => {
  try {
    const allEmployeeCapabilities = await storage.getAllEmployeeCapabilities();
    res.json(allEmployeeCapabilities);
  } catch (error) {
    console.error('Get all employee capabilities error:', error);
    res.status(500).json({ error: 'Failed to fetch all employee capabilities' });
  }
});

// GET linked user account for an employee
router.get('/:id/user-account', async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.id);
    const result = await pool.query(
      `SELECT id, username, role, is_active as "isActive", last_login as "lastLogin",
              password_changed_at as "passwordChangedAt"
       FROM users WHERE employee_id = $1 LIMIT 1`,
      [employeeId]
    );
    if (result.rows.length === 0) {
      return res.json(null);
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get employee user account error:', error);
    res.status(500).json({ error: 'Failed to fetch user account' });
  }
});

// POST set (or reset) password for an employee's linked user account
router.post('/:id/set-password', async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.id);
    const { password, username } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Check if a user account already exists for this employee
    const existing = await pool.query(
      'SELECT id, username FROM users WHERE employee_id = $1 LIMIT 1',
      [employeeId]
    );

    let userRow;

    if (existing.rows.length > 0) {
      // Update existing user's password
      const updated = await pool.query(
        `UPDATE users SET password_hash = $1, password_changed_at = NOW(), updated_at = NOW()
         WHERE employee_id = $2
         RETURNING id, username, role, is_active as "isActive"`,
        [passwordHash, employeeId]
      );
      userRow = updated.rows[0];
    } else {
      // No linked user exists — create one
      if (!username) {
        return res.status(400).json({
          error: 'No user account linked to this employee. Provide a username to create one.',
        });
      }

      // Check the employee exists and get their name for role derivation
      const emp = await pool.query(
        'SELECT name, user_role FROM employees WHERE id = $1 LIMIT 1',
        [employeeId]
      );
      if (emp.rows.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      const role = emp.rows[0].user_role || 'EMPLOYEE';

      const created = await pool.query(
        `INSERT INTO users (username, password, password_hash, role, employee_id, is_active, password_changed_at, failed_login_attempts)
         VALUES ($1, $2, $2, $3, $4, true, NOW(), 0)
         RETURNING id, username, role, is_active as "isActive"`,
        [username, passwordHash, role, employeeId]
      );
      userRow = created.rows[0];
    }

    res.json({ success: true, user: userRow });
  } catch (error: any) {
    console.error('Set employee password error:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'That username is already taken' });
    }
    res.status(500).json({ error: 'Failed to set password' });
  }
});

export default router;
