import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { getUserPermissions } from '../services/permissionService';
import {
  approveProductionRelease,
  ProjectPreproductionError,
} from '../services/projectPreproductionReadinessService';
import {
  getP2ExecutionReadModel,
  ProjectP2HandoffError,
  releaseToP2ControlCenter,
} from '../services/projectP2HandoffService';

const router = Router({ mergeParams: true });

type AuthenticatedProjectActor = {
  id: number;
  username: string;
  role: string;
};

function projectId(req: Request) {
  const id = (req.params as Record<string, string | undefined>).id;
  if (!id)
    throw new ProjectP2HandoffError(
      'PROJECT_ID_REQUIRED',
      'A project identifier is required.',
      400
    );
  return id;
}

function actor(req: Request) {
  const user = req.user as AuthenticatedProjectActor | undefined;
  if (!user?.id || !user.username || !user.role)
    throw new ProjectP2HandoffError(
      'AUTHENTICATION_REQUIRED',
      'Authentication is required.',
      401
    );
  return {
    userId: user.id,
    username: user.username,
    displayName: user.username,
    role: user.role,
  };
}
async function authorizedActor(
  req: Request,
  capability = 'projects.p2_handoff.release'
) {
  const value = actor(req);
  const { permissionSet } = await getUserPermissions(value.userId, value.role);
  if (!permissionSet.has(capability))
    throw new ProjectP2HandoffError(
      'CAPABILITY_REQUIRED',
      'P2 Control Center release authority is required.',
      403
    );
  return value;
}
function fail(res: Response, error: unknown) {
  if (error instanceof z.ZodError)
    return res
      .status(400)
      .json({ error: 'INVALID_INPUT', details: error.flatten() });
  if (error instanceof ProjectP2HandoffError)
    return res
      .status(error.status)
      .json({ error: error.code, message: error.message });
  if (error instanceof ProjectPreproductionError)
    return res.status(error.status).json({
      error: error.code,
      message: error.message,
      ...error.details,
    });
  console.error('P2 V2 Control Center handoff error:', error);
  return res.status(500).json({
    error: 'P2_HANDOFF_FAILED',
    message: 'The P2 handoff action failed.',
  });
}
router.get('/', async (req, res) => {
  try {
    res.json(await getP2ExecutionReadModel(projectId(req)));
  } catch (error) {
    fail(res, error);
  }
});
router.post('/approve', async (req, res) => {
  try {
    z.object({
      confirmation: z.literal('APPROVE PRODUCTION RELEASE'),
    }).parse(req.body);
    const value = await authorizedActor(
      req,
      'projects.production_release.approve'
    );
    res.json(await approveProductionRelease(projectId(req), value));
  } catch (error) {
    fail(res, error);
  }
});
router.post('/release', async (req, res) => {
  try {
    const body = z
      .object({
        idempotencyKey: z.string().min(8).max(200),
        confirmation: z.literal('RELEASE TO P2 CONTROL CENTER'),
        signatureMeaning: z.string().min(10).max(500),
      })
      .parse(req.body);
    res.json(
      await releaseToP2ControlCenter(
        projectId(req),
        body,
        await authorizedActor(req)
      )
    );
  } catch (error) {
    fail(res, error);
  }
});
export default router;
