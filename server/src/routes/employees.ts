import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { authenticateToken, requireRole, requireEmployeeAccess } from '../../middleware/auth';
import { uploadMiddleware, getFileInfo, getFileUrl, validateEmployeeDocumentAccess, getDocumentType } from '../../utils/fileUpload';
import {
  insertEmployeeSchema,
  insertCertificationSchema,
  insertEmployeeCertificationSchema,
  insertEvaluationSchema,
  insertEmployeeDocumentSchema,
  insertTimeClockEntrySchema,
  insertChecklistItemSchema,
  insertOnboardingDocSchema
} from '@shared/schema';

const router = Router();

// Employee Management Routes
router.get('/', authenticateToken, requireRole(['ADMIN', 'HR Manager']), async (req: Request, res: Response) => {
  try {
    const employees = await storage.getAllEmployees();
    res.json(employees);
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({ error: "Failed to fetch employees" });
  }
});

router.get('/:id', authenticateToken, requireEmployeeAccess, async (req: Request, res: Response) => {
  try {
    const employee = await storage.getEmployeeById(parseInt(req.params.id));
    if (!employee) {
      return res.status(404).json({ error: "Employee not found" });
    }
    res.json(employee);
  } catch (error) {
    console.error('Get employee error:', error);
    res.status(500).json({ error: "Failed to fetch employee" });
  }
});

router.post('/', authenticateToken, requireRole(['ADMIN', 'HR Manager']), async (req: Request, res: Response) => {
  try {
    const employeeData = insertEmployeeSchema.parse(req.body);
    const newEmployee = await storage.createEmployee(employeeData);
    res.status(201).json(newEmployee);
  } catch (error) {
    console.error('Create employee error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to create employee" });
  }
});

router.put('/:id', authenticateToken, requireEmployeeAccess, async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.id);
    const updates = req.body;
    const updatedEmployee = await storage.updateEmployee(employeeId, updates);
    res.json(updatedEmployee);
  } catch (error) {
    console.error('Update employee error:', error);
    res.status(500).json({ error: "Failed to update employee" });
  }
});

router.delete('/:id', authenticateToken, requireRole(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.id);
    await storage.deleteEmployee(employeeId);
    res.status(204).end();
  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({ error: "Failed to delete employee" });
  }
});

// Certification Management
router.get('/:id/certifications', authenticateToken, requireEmployeeAccess, async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.id);
    const certifications = await storage.getEmployeeCertifications(employeeId);
    res.json(certifications);
  } catch (error) {
    console.error('Get certifications error:', error);
    res.status(500).json({ error: "Failed to fetch certifications" });
  }
});

router.post('/:id/certifications', authenticateToken, requireRole(['ADMIN', 'HR Manager']), async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.id);
    const certificationData = { ...req.body, employeeId };
    const newCertification = await storage.assignCertification(certificationData);
    res.status(201).json(newCertification);
  } catch (error) {
    console.error('Assign certification error:', error);
    res.status(500).json({ error: "Failed to assign certification" });
  }
});

// Performance Evaluations
router.get('/:id/evaluations', authenticateToken, requireEmployeeAccess, async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.id);
    const evaluations = await storage.getEmployeeEvaluations(employeeId);
    res.json(evaluations);
  } catch (error) {
    console.error('Get evaluations error:', error);
    res.status(500).json({ error: "Failed to fetch evaluations" });
  }
});

router.post('/:id/evaluations', authenticateToken, requireRole(['ADMIN', 'HR Manager', 'Manager']), async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.id);
    const evaluationData = insertEvaluationSchema.parse({ ...req.body, employeeId });
    const newEvaluation = await storage.createEvaluation(evaluationData);
    res.status(201).json(newEvaluation);
  } catch (error) {
    console.error('Create evaluation error:', error);
    res.status(500).json({ error: "Failed to create evaluation" });
  }
});

// Time Clock Management
router.get('/:id/time-entries', authenticateToken, requireEmployeeAccess, async (req: Request, res: Response) => {
  try {
    const employeeId = req.params.id;
    const entries = await storage.getEmployeeTimeEntries(employeeId);
    res.json(entries);
  } catch (error) {
    console.error('Get time entries error:', error);
    res.status(500).json({ error: "Failed to fetch time entries" });
  }
});

router.post('/:id/clock-in', async (req: Request, res: Response) => {
  try {
    const employeeId = req.params.id;
    const { location, notes } = req.body;
    const entry = await storage.clockIn(employeeId, location, notes);
    res.json(entry);
  } catch (error) {
    console.error('Clock in error:', error);
    res.status(500).json({ error: "Failed to clock in" });
  }
});

router.post('/:id/clock-out', async (req: Request, res: Response) => {
  try {
    const employeeId = req.params.id;
    const { location, notes } = req.body;
    const entry = await storage.clockOut(employeeId, location, notes);
    res.json(entry);
  } catch (error) {
    console.error('Clock out error:', error);
    res.status(500).json({ error: "Failed to clock out" });
  }
});

// Document Management
router.post('/:id/documents', authenticateToken, requireRole(['ADMIN', 'HR Manager']), uploadMiddleware.single('document'), async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.id);
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const documentData = {
      employeeId,
      fileName: file.originalname,
      filePath: file.path,
      fileSize: file.size,
      mimeType: file.mimetype,
      documentType: getDocumentType(file.originalname),
      uploadedBy: (req as any).user?.id,
      expirationDate: req.body.expirationDate ? new Date(req.body.expirationDate) : null,
      notes: req.body.notes || null
    };

    const document = await storage.uploadEmployeeDocument(documentData);
    res.status(201).json(document);
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({ error: "Failed to upload document" });
  }
});

router.get('/:id/documents', authenticateToken, requireEmployeeAccess, async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.id);
    const documents = await storage.getEmployeeDocuments(employeeId);
    res.json(documents);
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
});

// Daily Checklist Management
router.get('/:id/checklist/:date?', async (req: Request, res: Response) => {
  try {
    const employeeId = req.params.id;
    const date = req.params.date || new Date().toISOString().split('T')[0];
    const checklist = await storage.getDailyChecklist(employeeId, date);
    res.json(checklist);
  } catch (error) {
    console.error('Get checklist error:', error);
    res.status(500).json({ error: "Failed to fetch checklist" });
  }
});

router.post('/:id/checklist', async (req: Request, res: Response) => {
  try {
    const employeeId = req.params.id;
    const checklistData = req.body;
    const updatedChecklist = await storage.updateDailyChecklist(employeeId, checklistData);
    res.json(updatedChecklist);
  } catch (error) {
    console.error('Update checklist error:', error);
    res.status(500).json({ error: "Failed to update checklist" });
  }
});

export default router;