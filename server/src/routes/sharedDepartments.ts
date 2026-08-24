import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../middleware/requirePermission';
import {
  areSharedInventoryDepartmentReadsEnabled,
  areSharedInventoryDepartmentWritesEnabled,
} from '../lib/featureFlags';
import {
  createSharedDepartment,
  deactivateUnreferencedDepartment,
  listSharedDepartments,
  SharedDepartmentError,
  updateSharedDepartment,
} from '../services/sharedDepartmentService';

const router = Router();
const writeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  departmentCode: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/),
  routingEnabled: z.boolean().optional(),
  productionEnabled: z.boolean().optional(),
  schedulingEnabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
const updateSchema = writeSchema.partial().extend({ isActive: z.boolean().optional() });

function actor(req: Request) {
  const user = req.user as any;
  return { id: Number(user?.id) || null, username: user?.username ?? null, role: user?.role ?? null };
}

function enabled(res: Response, kind: 'read' | 'write') {
  const on = kind === 'read'
    ? areSharedInventoryDepartmentReadsEnabled()
    : areSharedInventoryDepartmentWritesEnabled();
  if (!on) res.status(404).json({ error: 'Shared department Phase 1 feature is disabled.' });
  return on;
}

function failure(res: Response, error: unknown) {
  if (error instanceof SharedDepartmentError)
    return res.status(error.status).json({ error: error.code, message: error.message });
  if (error instanceof z.ZodError)
    return res.status(400).json({ error: 'VALIDATION_ERROR', issues: error.issues });
  console.error('[SharedDepartments]', error);
  return res.status(500).json({ error: 'Shared department operation failed.' });
}

router.get('/', async (req, res) => {
  if (!enabled(res, 'read')) return;
  try {
    res.json(await listSharedDepartments({
      includeInactive: req.query.includeInactive === 'true',
      routingOnly: req.query.routingOnly === 'true',
    }));
  } catch (error) { failure(res, error); }
});

router.post('/', requirePermission('inventory.adjust'), async (req, res) => {
  if (!enabled(res, 'write')) return;
  try { res.status(201).json(await createSharedDepartment(writeSchema.parse(req.body), actor(req))); }
  catch (error) { failure(res, error); }
});

router.patch('/:id', requirePermission('inventory.adjust'), async (req, res) => {
  if (!enabled(res, 'write')) return;
  try { res.json(await updateSharedDepartment(z.coerce.number().int().positive().parse(req.params.id), updateSchema.parse(req.body), actor(req))); }
  catch (error) { failure(res, error); }
});

router.delete('/:id', requirePermission('inventory.adjust'), async (req, res) => {
  if (!enabled(res, 'write')) return;
  try { res.json(await deactivateUnreferencedDepartment(z.coerce.number().int().positive().parse(req.params.id), actor(req))); }
  catch (error) { failure(res, error); }
});

export default router;
