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
import { getUserPermissions } from '../services/permissionService';
import {
  addAffectedItem,
  approveEcr,
  attachEcrEvidence,
  cancelEcr,
  createEcr,
  EcrError,
  getEcr,
  getEcrHistory,
  listEcrs,
  recordReview,
  reconcileLegacyChanges,
  rejectEcr,
  renderEcrPdf,
  returnEcr,
  startImpactReview,
  submitEcr,
  updateEcr,
  type EcrActor,
} from '../services/engineeringChangeRequestService';
import {
  assertEcrSchemaReady,
  EcrSchemaNotReadyError,
  requiredEcrMigration,
} from '../services/ecrSchemaReadiness';

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
    await assertEcrSchemaReady();
    next();
  } catch (error) {
    if (error instanceof EcrSchemaNotReadyError) {
      return res.status(503).json({
        error: error.code,
        message: error.message,
        missingObjects: error.missingObjects,
        requiredMigration: requiredEcrMigration,
      });
    }
    next(error);
  }
};

router.use(authenticate, readiness);

const actor = (req: Request): EcrActor => {
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
  if (error instanceof EcrError) {
    return res
      .status(error.statusCode)
      .json({ error: error.code, message: error.message, ...error.details });
  }
  console.error('ECR operation failed', error);
  return res.status(500).json({ error: 'ECR_OPERATION_FAILED' });
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
  '/design-projects/:projectId/ecrs',
  requirePermission('engineering.ecr.view'),
  action((req) => listEcrs(req.params.projectId))
);
router.post(
  '/design-projects/:projectId/ecrs',
  requirePermission('engineering.ecr.create'),
  action((req) => createEcr(req.params.projectId, req.body ?? {}, actor(req)))
);
router.get(
  '/ecrs/:ecrId',
  requirePermission('engineering.ecr.view'),
  action((req) => getEcr(req.params.ecrId))
);
router.patch(
  '/ecrs/:ecrId',
  requirePermission('engineering.ecr.edit'),
  action((req) => updateEcr(req.params.ecrId, req.body ?? {}, actor(req)))
);
router.post(
  '/ecrs/:ecrId/affected-items',
  requirePermission('engineering.ecr.edit'),
  action((req) => addAffectedItem(req.params.ecrId, req.body ?? {}, actor(req)))
);
router.patch(
  '/ecrs/:ecrId/affected-items/:itemId',
  requirePermission('engineering.ecr.edit'),
  action((req) =>
    addAffectedItem(
      req.params.ecrId,
      {
        ...(req.body ?? {}),
        stableExternalReference:
          req.body?.stableExternalReference ??
          `supersedes-affected-item:${req.params.itemId}`,
        reason:
          req.body?.reason ??
          `Append-only replacement for affected item ${req.params.itemId}`,
      },
      actor(req)
    )
  )
);
router.post(
  '/ecrs/:ecrId/submit',
  requirePermission('engineering.ecr.submit'),
  action((req) => submitEcr(req.params.ecrId, actor(req), reason(req)))
);
router.post(
  '/ecrs/:ecrId/start-impact-review',
  requirePermission('engineering.ecr.review'),
  action((req) => startImpactReview(req.params.ecrId, actor(req), reason(req)))
);
router.post(
  '/ecrs/:ecrId/reviews',
  requirePermission('engineering.ecr.review'),
  action((req) => recordReview(req.params.ecrId, req.body ?? {}, actor(req)))
);
router.post(
  '/ecrs/:ecrId/approve',
  requirePermission('engineering.ecr.disposition'),
  action((req) => approveEcr(req.params.ecrId, actor(req), reason(req)))
);
router.post(
  '/ecrs/:ecrId/reject',
  requirePermission('engineering.ecr.disposition'),
  action((req) => rejectEcr(req.params.ecrId, actor(req), reason(req)))
);
router.post(
  '/ecrs/:ecrId/return',
  requirePermission('engineering.ecr.disposition'),
  action((req) => returnEcr(req.params.ecrId, actor(req), reason(req)))
);
router.post(
  '/ecrs/:ecrId/cancel',
  requirePermission('engineering.ecr.admin'),
  action((req) => cancelEcr(req.params.ecrId, actor(req), reason(req)))
);
router.get(
  '/ecrs/:ecrId/history',
  requirePermission('engineering.ecr.view'),
  action((req) => getEcrHistory(req.params.ecrId))
);
router.get(
  '/ecrs/:ecrId/pdf',
  requirePermission('engineering.ecr.view'),
  async (req, res) => {
    try {
      const rendered = await renderEcrPdf(req.params.ecrId, actor(req));
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
  '/ecrs/:ecrId/evidence',
  requirePermission('engineering.ecr.edit'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file)
        throw new EcrError(
          'ECR_EVIDENCE_FILE_REQUIRED',
          'Evidence file is required'
        );
      const digest = crypto
        .createHash('sha256')
        .update(req.file.buffer)
        .digest('hex');
      const directory = path.resolve(
        process.cwd(),
        'uploads',
        'engineering-change-requests'
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
        await attachEcrEvidence(
          req.params.ecrId,
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
  '/ecrs/legacy/reconcile',
  requirePermission('engineering.ecr.admin'),
  action((req) => reconcileLegacyChanges(actor(req)))
);

export default router;
