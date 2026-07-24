import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import multer from 'multer';

import { pool } from '../../db';
import { requirePermission } from '../../middleware/requirePermission';
import {
  addEcnAffectedItem,
  addImplementationAction,
  addStepImpact,
  approveNoReleaseRequiredDisposition,
  attachEcnEvidence,
  authorizeTargetedStepReopen,
  cancelEcn,
  createEcn,
  decideEcn,
  EcnError,
  getEcn,
  getEcnHistory,
  getEcrEcnImplementationStatus,
  independentlyReviewVvEvidence,
  listEcns,
  markImplemented,
  markReleaseReady,
  planEcn,
  reconcileLegacyEcos,
  recordVvEvidence,
  rejectEcn,
  renderEcnPdf,
  returnEcn,
  startImplementation,
  startVerificationValidation,
  submitEcn,
  updateEcn,
  updateImplementationAction,
  type EcnActor,
} from '../services/engineeringChangeNoticeService';
import {
  assertEcnSchemaReady,
  EcnSchemaNotReadyError,
  requiredEcnMigration,
} from '../services/ecnSchemaReadiness';
import { getUserPermissions } from '../services/permissionService';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
});

const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const token =
    req.cookies?.sessionToken ||
    req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  const rows = await pool.query(
    `SELECT u.id,u.username,u.role,u.first_name,u.last_name
       FROM user_sessions s JOIN users u ON lower(u.username)=lower(s.username)
      WHERE s.session_token=$1 AND s.is_active=true AND s.expires_at>now()
        AND u.is_active=true LIMIT 1`,
    [token]
  );
  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  const permissions = await getUserPermissions(Number(user.id), user.role);
  (req as any).user = { ...user, capabilities: permissions.permissions };
  next();
};
const readiness = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await assertEcnSchemaReady();
    next();
  } catch (error) {
    if (error instanceof EcnSchemaNotReadyError) {
      return res.status(503).json({
        error: error.code,
        message: error.message,
        missingObjects: error.missingObjects,
        requiredMigration: requiredEcnMigration,
      });
    }
    next(error);
  }
};
router.use(authenticate, readiness);

const actor = (req: Request): EcnActor => {
  const user = (req as any).user;
  return {
    id: Number(user.id),
    username: String(user.username),
    displayName:
      [user.first_name, user.last_name].filter(Boolean).join(' ') ||
      String(user.username),
    role: String(user.role),
    capabilities: Array.isArray(user.capabilities) ? user.capabilities : [],
  };
};
const reason = (req: Request) =>
  String(req.body?.reason ?? req.body?.comment ?? '').trim();
const send = (res: Response, error: unknown) => {
  if (error instanceof EcnError) {
    return res
      .status(error.statusCode)
      .json({ error: error.code, message: error.message, ...error.details });
  }
  console.error('ECN operation failed', error);
  return res.status(500).json({ error: 'ECN_OPERATION_FAILED' });
};
const action =
  (work: (req: Request) => Promise<unknown>) =>
  async (req: Request, res: Response) => {
    try {
      res.json(await work(req));
    } catch (error) {
      send(res, error);
    }
  };

router.get(
  '/design-projects/:projectId/ecns',
  requirePermission('engineering.ecn.view'),
  action((req) => listEcns(req.params.projectId))
);
router.post(
  '/ecrs/:ecrId/ecns',
  requirePermission('engineering.ecn.create'),
  action((req) => createEcn(req.params.ecrId, req.body ?? {}, actor(req)))
);
router.get(
  '/ecrs/:ecrId/ecns/implementation-status',
  requirePermission('engineering.ecn.view'),
  action((req) => getEcrEcnImplementationStatus(req.params.ecrId))
);
router.get(
  '/ecns/:ecnId',
  requirePermission('engineering.ecn.view'),
  action((req) => getEcn(req.params.ecnId))
);
router.patch(
  '/ecns/:ecnId',
  requirePermission('engineering.ecn.edit'),
  action((req) => updateEcn(req.params.ecnId, req.body ?? {}, actor(req)))
);
router.post(
  '/ecns/:ecnId/affected-items',
  requirePermission('engineering.ecn.edit'),
  action((req) =>
    addEcnAffectedItem(req.params.ecnId, req.body ?? {}, actor(req))
  )
);
router.patch(
  '/ecns/:ecnId/affected-items/:itemId',
  requirePermission('engineering.ecn.edit'),
  action((req) =>
    addEcnAffectedItem(
      req.params.ecnId,
      {
        ...(req.body ?? {}),
        stableSourceReference:
          req.body?.stableSourceReference ??
          `supersedes-ecn-item:${req.params.itemId}`,
        reason:
          req.body?.reason ??
          `Append-only replacement for ${req.params.itemId}`,
      },
      actor(req)
    )
  )
);
router.post(
  '/ecns/:ecnId/step-impacts',
  requirePermission('engineering.ecn.edit'),
  action((req) => addStepImpact(req.params.ecnId, req.body ?? {}, actor(req)))
);
router.post(
  '/ecns/:ecnId/step-impacts/:stepKey/reopen',
  requirePermission('engineering.ecn.implement'),
  action((req) =>
    authorizeTargetedStepReopen(
      req.params.ecnId,
      req.params.stepKey,
      actor(req)
    )
  )
);
router.post(
  '/ecns/:ecnId/actions',
  requirePermission('engineering.ecn.edit'),
  action((req) =>
    addImplementationAction(req.params.ecnId, req.body ?? {}, actor(req))
  )
);
router.patch(
  '/ecns/:ecnId/actions/:actionId',
  requirePermission('engineering.ecn.implement'),
  action((req) =>
    updateImplementationAction(
      req.params.ecnId,
      req.params.actionId,
      req.body ?? {},
      actor(req)
    )
  )
);
router.post(
  '/ecns/:ecnId/verification',
  requirePermission('engineering.ecn.verify'),
  action((req) =>
    recordVvEvidence(
      req.params.ecnId,
      'VERIFICATION',
      req.body ?? {},
      actor(req)
    )
  )
);
router.post(
  '/ecns/:ecnId/validation',
  requirePermission('engineering.ecn.validate'),
  action((req) =>
    recordVvEvidence(req.params.ecnId, 'VALIDATION', req.body ?? {}, actor(req))
  )
);
router.post(
  '/ecns/:ecnId/vv/:recordId/review',
  requirePermission('engineering.ecn.approve'),
  action((req) =>
    independentlyReviewVvEvidence(
      req.params.ecnId,
      req.params.recordId,
      actor(req)
    )
  )
);
router.post(
  '/ecns/:ecnId/plan',
  requirePermission('engineering.ecn.edit'),
  action((req) => planEcn(req.params.ecnId, actor(req), reason(req)))
);
router.post(
  '/ecns/:ecnId/submit',
  requirePermission('engineering.ecn.submit'),
  action((req) => submitEcn(req.params.ecnId, actor(req), reason(req)))
);
router.post(
  '/ecns/:ecnId/decisions',
  requirePermission('engineering.ecn.approve'),
  action((req) => decideEcn(req.params.ecnId, req.body ?? {}, actor(req)))
);
router.post(
  '/ecns/:ecnId/start-implementation',
  requirePermission('engineering.ecn.implement'),
  action((req) =>
    startImplementation(req.params.ecnId, actor(req), reason(req))
  )
);
router.post(
  '/ecns/:ecnId/start-verification-validation',
  requirePermission('engineering.ecn.implement'),
  action((req) =>
    startVerificationValidation(req.params.ecnId, actor(req), reason(req))
  )
);
router.post(
  '/ecns/:ecnId/mark-release-ready',
  requirePermission('engineering.ecn.implement'),
  action((req) => markReleaseReady(req.params.ecnId, actor(req), reason(req)))
);
router.post(
  '/ecns/:ecnId/mark-implemented',
  requirePermission('engineering.ecn.implement'),
  action((req) => markImplemented(req.params.ecnId, actor(req), reason(req)))
);
router.post(
  '/ecns/:ecnId/no-release-required',
  requirePermission('engineering.ecn.admin'),
  action((req) =>
    approveNoReleaseRequiredDisposition(
      req.params.ecnId,
      actor(req),
      reason(req)
    )
  )
);
router.post(
  '/ecns/:ecnId/return',
  requirePermission('engineering.ecn.approve'),
  action((req) => returnEcn(req.params.ecnId, actor(req), reason(req)))
);
router.post(
  '/ecns/:ecnId/reject',
  requirePermission('engineering.ecn.approve'),
  action((req) => rejectEcn(req.params.ecnId, actor(req), reason(req)))
);
router.post(
  '/ecns/:ecnId/cancel',
  requirePermission('engineering.ecn.admin'),
  action((req) => cancelEcn(req.params.ecnId, actor(req), reason(req)))
);
router.get(
  '/ecns/:ecnId/history',
  requirePermission('engineering.ecn.view'),
  action((req) => getEcnHistory(req.params.ecnId))
);
router.get(
  '/ecns/:ecnId/pdf',
  requirePermission('engineering.ecn.view'),
  async (req, res) => {
    try {
      const rendered = await renderEcnPdf(req.params.ecnId, actor(req));
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${rendered.filename}"`
      );
      res.setHeader('X-Content-SHA256', rendered.checksum);
      res.send(rendered.bytes);
    } catch (error) {
      send(res, error);
    }
  }
);
router.post(
  '/ecns/:ecnId/evidence',
  requirePermission('engineering.ecn.edit'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file)
        throw new EcnError(
          'ECN_EVIDENCE_FILE_REQUIRED',
          'Evidence file is required'
        );
      const digest = crypto
        .createHash('sha256')
        .update(req.file.buffer)
        .digest('hex');
      const directory = path.resolve(
        process.cwd(),
        'uploads',
        'engineering-change-notices'
      );
      await fs.mkdir(directory, { recursive: true });
      const storedPath = path.join(
        directory,
        `${digest}-${path.basename(req.file.originalname)}`
      );
      await fs
        .writeFile(storedPath, req.file.buffer, { flag: 'wx' })
        .catch((error: any) => {
          if (error?.code !== 'EEXIST') throw error;
        });
      res.json(
        await attachEcnEvidence(
          req.params.ecnId,
          {
            kind: String(req.body?.kind ?? 'SUPPORTING_EVIDENCE'),
            originalFilename: req.file.originalname,
            storedPath,
            mimeType: req.file.mimetype,
            bytes: req.file.buffer,
            paperOriginal:
              String(req.body?.paperOriginal ?? 'false') === 'true',
          },
          actor(req)
        )
      );
    } catch (error) {
      send(res, error);
    }
  }
);
router.post(
  '/ecns/legacy/reconcile',
  requirePermission('engineering.ecn.admin'),
  action((req) => reconcileLegacyEcos(actor(req)))
);

export default router;
