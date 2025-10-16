import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { pool } from '../../db';
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
  insertEmployeeCertificationSchema,
  insertEvaluationSchema,
  insertEmployeeDocumentSchema,
  insertTimeClockEntrySchema,
  insertChecklistItemSchema,
  insertOnboardingDocSchema,
  insertEmployeeLayupSettingsSchema,
} from '@shared/schema';

const router = Router();

// Employee Management Routes
router.get('/', async (req: Request, res: Response) => {
  try {
    console.log('🔧 EMPLOYEES ROUTE CALLED (development mode - no auth)');
    const employees = await storage.getAllEmployees();
    console.log('🔧 Found employees:', employees.length);
    res.json(employees);
  } catch (error) {
    console.error('Get employees error:', error);
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
    const result = await pool.query`
      SELECT 
        e.id as "employeeId",
        e.name as "employeeName",
        e.job_title as "jobTitle",
        e.department as "department",
        c.id as "certificationId",
        c.name as "certificationName",
        ec.id as "certificationRecordId",
        ec.date_obtained as "dateEarned",
        ec.expiry_date as "expiryDate",
        COALESCE(ec.is_active, false) as "isActive",
        ec.notes
      FROM employees e
      CROSS JOIN certifications c
      LEFT JOIN employee_certifications ec 
        ON e.id = ec.employee_id AND c.id = ec.certification_id
      WHERE e.is_active = true AND c.is_active = true AND c.category = 'DEPARTMENT'
      ORDER BY e.name, c.name
    `;

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
    const result = await pool.query`
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
    `;

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
    const result = await pool.query`
      INSERT INTO evaluations (
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
      ) VALUES (
        ${employeeId},
        ${evaluationType},
        ${periodStart.toISOString()},
        ${periodEnd.toISOString()},
        ${strengths || ''},
        ${areasForImprovement || ''},
        ${goals || ''},
        ${evaluatedBy || 'system'},
        ${status || 'COMPLETED'},
        ${now.toISOString()},
        NOW(),
        NOW()
      )
      RETURNING id
    `;

    const evaluationId = result[0]?.id;

    // Link certifications to evaluation if provided
    if (certificationIds && certificationIds.length > 0) {
      for (const certId of certificationIds) {
        await pool.query`
          INSERT INTO evaluation_certifications (
            evaluation_id,
            certification_id
          ) VALUES (
            ${evaluationId},
            ${certId}
          )
        `;
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
    const employeeData = insertEmployeeSchema.parse(req.body);
    const newEmployee = await storage.createEmployee(employeeData);
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
    const updates = req.body;
    const updatedEmployee = await storage.updateEmployee(employeeId, updates);
    res.json(updatedEmployee);
  } catch (error) {
    console.error('Update employee error:', error);
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.id);
    await storage.deleteEmployee(employeeId);
    res.status(204).end();
  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

// Certification Management
router.get('/:id/certifications', async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.id);
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

// Employee Layup Settings CRUD (migrated from monolithic routes.ts)
// Note: These routes don't require authentication for use in Layup Scheduler
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

// Employee Capability Assignment Routes (MUST be after /capabilities but before /:id/*)
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
      useHardcoded: useHardcoded ?? true,
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
      
      // Import the Azure Document Intelligence function
      const { extractTrainingMatrixData } = await import('../lib/azureDocumentIntelligence');
      
      // Extract data from PDF
      const extractedData = await extractTrainingMatrixData(req.file.buffer);
      console.log(`✅ Extracted ${extractedData.entries.length} certification entries from PDF`);

      // Get all employees and certifications for mapping
      const [employeesResult, certificationsResult] = await Promise.all([
        pool.query`SELECT id, name FROM employees WHERE is_active = true`,
        pool.query`SELECT id, name FROM certifications WHERE category = 'DEPARTMENT'`
      ]);

      const employees = employeesResult.rows;
      const certifications = certificationsResult.rows;

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
          // Map employee name to ID
          const employeeName = entry.employeeName?.toLowerCase().trim();
          const employeeId = employeeName ? employeeNameToId.get(employeeName) : null;

          if (!employeeId) {
            importResults.skipped++;
            importResults.errors.push(`Employee not found: ${entry.employeeName}`);
            continue;
          }

          // Map certification name to ID
          const certName = entry.trainingName?.toLowerCase().trim();
          const certificationId = certName ? certNameToId.get(certName) : null;

          if (!certificationId) {
            importResults.skipped++;
            importResults.errors.push(`Certification not found: ${entry.trainingName}`);
            continue;
          }

          // Check if certification already exists
          const existingCert = await pool.query`
            SELECT id FROM employee_certifications 
            WHERE employee_id = ${employeeId} 
            AND certification_id = ${certificationId}
          `;

          if (existingCert.rows.length > 0) {
            // Update existing certification
            await pool.query`
              UPDATE employee_certifications 
              SET date_obtained = ${entry.lastCompleted},
                  is_active = true,
                  updated_at = NOW()
              WHERE employee_id = ${employeeId} 
              AND certification_id = ${certificationId}
            `;
            importResults.details.push({
              employee: entry.employeeName,
              certification: entry.trainingName,
              action: 'updated',
              date: entry.lastCompleted
            });
          } else {
            // Insert new certification
            await pool.query`
              INSERT INTO employee_certifications (
                employee_id, 
                certification_id, 
                date_obtained, 
                is_active
              ) VALUES (
                ${employeeId}, 
                ${certificationId}, 
                ${entry.lastCompleted}, 
                true
              )
            `;
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

      console.log(`✅ Import complete: ${importResults.imported} imported, ${importResults.skipped} skipped`);
      res.json(importResults);
    } catch (error) {
      console.error('Import certifications error:', error);
      res.status(500).json({ 
        error: 'Failed to import certifications from PDF',
        details: (error as Error).message 
      });
    }
  }
);

export default router;
