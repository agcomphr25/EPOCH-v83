import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { storage } from '../../storage';
import { requirePermission } from '../../middleware/requirePermission';

const router = Router({ mergeParams: true });

const createQualificationSchema = z.object({
  machineClass: z.string().min(1).optional().nullable(),
  operationType: z.string().min(1).optional().nullable(),
  department: z.string().min(1).optional().nullable(),
  expiresAt: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
}).refine(
  (d) => {
    const set = [d.machineClass, d.operationType, d.department].filter(Boolean);
    return set.length >= 1;
  },
  { message: 'At least one of machineClass, operationType, or department must be provided.' }
);

// GET /api/employees/:employeeId/qualifications
router.get('/', async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.employeeId, 10);
    if (isNaN(employeeId)) {
      return res.status(400).json({ error: 'Invalid employeeId' });
    }
    const qualifications = await storage.getEmployeeMachineQualifications(employeeId);
    res.json(qualifications);
  } catch (error: any) {
    console.error('Error fetching employee qualifications:', error);
    res.status(500).json({ error: 'Failed to fetch qualifications', message: error.message });
  }
});

// POST /api/employees/:employeeId/qualifications  (admin/supervisor only)
router.post('/', requirePermission('employees.manage_qualifications'), async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.employeeId, 10);
    if (isNaN(employeeId)) {
      return res.status(400).json({ error: 'Invalid employeeId' });
    }
    const parsed = createQualificationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation error', issues: parsed.error.issues });
    }
    const { machineClass, operationType, department, expiresAt, notes } = parsed.data;
    const grantedBy: string = (req.user as any)?.username ?? 'system';
    const record = await storage.createEmployeeMachineQualification({
      employeeId,
      machineClass: machineClass ?? null,
      operationType: operationType ?? null,
      department: department ?? null,
      isActive: true,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      grantedBy,
      notes: notes ?? null,
    });
    res.status(201).json(record);
  } catch (error: any) {
    console.error('Error creating employee qualification:', error);
    res.status(500).json({ error: 'Failed to create qualification', message: error.message });
  }
});

// DELETE /api/employees/:employeeId/qualifications/:id  (admin/supervisor only — deactivates)
router.delete('/:id', requirePermission('employees.manage_qualifications'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid qualification id' });
    }
    const record = await storage.deactivateEmployeeMachineQualification(id);
    if (!record) {
      return res.status(404).json({ error: 'Qualification not found' });
    }
    res.json(record);
  } catch (error: any) {
    console.error('Error deactivating employee qualification:', error);
    res.status(500).json({ error: 'Failed to deactivate qualification', message: error.message });
  }
});

export default router;
