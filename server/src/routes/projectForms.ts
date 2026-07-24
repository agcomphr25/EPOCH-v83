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
  addProjectFormAttachment,
  createProjectForm,
  decideProjectForm,
  getProjectForm,
  getProjectFormReleaseReadiness,
  listProjectForms,
  ProjectFormError,
  renderProjectForm,
  saveProjectFormDraft,
  submitProjectForm,
  supersedeProjectForm,
  type ProjectFormActor,
} from '../services/projectFormInstanceService';
import {
  assertProjectFormSchemaReady,
  ProjectFormSchemaNotReadyError,
  requiredProjectFormMigration,
} from '../services/projectFormSchemaReadiness';
import { getUserPermissions } from '../services/permissionService';

const router = Router();
export const designControlProjectFormsRouter = Router();
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
  const sessions = await pool.query(
    `SELECT u.id, u.username, u.role, u.first_name, u.last_name
       FROM user_sessions s
       JOIN users u ON lower(u.username) = lower(s.username)
      WHERE s.session_token = $1
        AND s.is_active = true
        AND s.expires_at > now()
        AND u.is_active = true
      LIMIT 1`,
    [token]
  );
  const user = sessions?.[0];
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  const permissions = await getUserPermissions(Number(user.id), user.role);
  (req as any).user = {
    ...user,
    capabilities: permissions.permissions,
  };
  next();
};

const readiness = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await assertProjectFormSchemaReady();
    next();
  } catch (error) {
    if (error instanceof ProjectFormSchemaNotReadyError) {
      return res.status(503).json({
        error: error.code,
        message: error.message,
        requiredMigration: requiredProjectFormMigration,
        missingObjects: error.missingObjects,
      });
    }
    next(error);
  }
};

router.use(authenticate, readiness);
designControlProjectFormsRouter.use(authenticate, readiness);

const actor = (req: Request): ProjectFormActor => {
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
const evidence = (req: Request) => ({
  ipAddress:
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    null,
  userAgent: req.headers['user-agent'] ?? null,
});
const sendError = (res: Response, error: unknown) => {
  if (error instanceof ProjectFormError) {
    return res.status(error.statusCode).json({
      error: error.code,
      message: error.message,
      ...error.details,
    });
  }
  console.error('Project Form Instance operation failed', error);
  return res.status(500).json({ error: 'PROJECT_FORM_OPERATION_FAILED' });
};

designControlProjectFormsRouter.get(
  '/:recordId/forms',
  requirePermission('design.forms.view'),
  async (req, res) => {
    try {
      res.json(await listProjectForms(req.params.recordId));
    } catch (error) {
      sendError(res, error);
    }
  }
);
designControlProjectFormsRouter.get(
  '/:recordId/forms/readiness',
  requirePermission('design.forms.view'),
  async (req, res) => {
    try {
      res.json(await getProjectFormReleaseReadiness(req.params.recordId));
    } catch (error) {
      sendError(res, error);
    }
  }
);
designControlProjectFormsRouter.get(
  '/:recordId/steps/:stepKey/forms',
  requirePermission('design.forms.view'),
  async (req, res) => {
    try {
      const forms = await listProjectForms(req.params.recordId);
      res.json(forms.filter((item) => item.stepKey === req.params.stepKey));
    } catch (error) {
      sendError(res, error);
    }
  }
);
designControlProjectFormsRouter.post(
  '/:recordId/steps/:stepKey/forms',
  requirePermission('design.forms.create'),
  async (req, res) => {
    try {
      const result = await createProjectForm({
        recordId: req.params.recordId,
        stepKey: req.params.stepKey,
        completionMethod:
          req.body.completionMethod === 'PAPER_UPLOAD'
            ? 'PAPER_UPLOAD'
            : 'ELECTRONIC',
        actor: actor(req),
        request: evidence(req),
      });
      res.status(201).json(result);
    } catch (error) {
      sendError(res, error);
    }
  }
);

router.get(
  '/:instanceId',
  requirePermission('design.forms.view'),
  async (req, res) => {
    try {
      res.json(await getProjectForm(req.params.instanceId));
    } catch (error) {
      sendError(res, error);
    }
  }
);
router.patch(
  '/:instanceId/draft',
  requirePermission('design.forms.edit'),
  async (req, res) => {
    try {
      res.json(
        await saveProjectFormDraft({
          instanceId: req.params.instanceId,
          content: req.body.content ?? {},
          indexedMetadata: req.body.indexedMetadata ?? {},
          changeReason: String(
            req.body.changeReason ?? 'Draft material change'
          ),
          actor: actor(req),
          request: evidence(req),
        })
      );
    } catch (error) {
      sendError(res, error);
    }
  }
);
router.post(
  '/:instanceId/revisions',
  requirePermission('design.forms.submit'),
  async (req, res) => {
    try {
      res.status(201).json(
        await submitProjectForm({
          instanceId: req.params.instanceId,
          changeReason: String(req.body.changeReason ?? 'Submit form revision'),
          actor: actor(req),
          request: evidence(req),
        })
      );
    } catch (error) {
      sendError(res, error);
    }
  }
);
router.post(
  '/:instanceId/submit',
  requirePermission('design.forms.submit'),
  async (req, res) => {
    try {
      res.json(
        await submitProjectForm({
          instanceId: req.params.instanceId,
          changeReason: String(req.body.changeReason ?? 'Submit form revision'),
          actor: actor(req),
          request: evidence(req),
        })
      );
    } catch (error) {
      sendError(res, error);
    }
  }
);

const attachmentHandler =
  (kind: 'PAPER_ORIGINAL' | 'EVIDENCE') =>
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'FILE_REQUIRED' });
      }
      const checksum = crypto
        .createHash('sha256')
        .update(req.file.buffer)
        .digest('hex');
      const directory = path.join(
        process.cwd(),
        'uploads',
        'project-forms',
        req.params.instanceId
      );
      await fs.mkdir(directory, { recursive: true });
      const storedPath = path.join(directory, `${checksum}.bin`);
      try {
        await fs.writeFile(storedPath, req.file.buffer, { flag: 'wx' });
      } catch (error: any) {
        if (error?.code !== 'EEXIST') throw error;
      }
      const result = await addProjectFormAttachment({
        instanceId: req.params.instanceId,
        kind,
        originalFilename: req.file.originalname,
        storedPath,
        mimeType: req.file.mimetype,
        buffer: req.file.buffer,
        indexingMetadata: req.body.indexingMetadata
          ? JSON.parse(req.body.indexingMetadata)
          : {},
        actor: actor(req),
        request: evidence(req),
      });
      res.status(201).json(result);
    } catch (error) {
      sendError(res, error);
    }
  };

router.post(
  '/:instanceId/attachments',
  requirePermission('design.forms.edit'),
  upload.single('file'),
  attachmentHandler('EVIDENCE')
);
router.post(
  '/:instanceId/upload-paper',
  requirePermission('design.forms.upload_paper'),
  upload.single('file'),
  attachmentHandler('PAPER_ORIGINAL')
);
router.post(
  '/:instanceId/render',
  requirePermission('design.forms.view'),
  async (req, res) => {
    try {
      const result = await renderProjectForm({
        instanceId: req.params.instanceId,
        retainApproved: Boolean(req.body.retainApproved),
        actor: actor(req),
        request: evidence(req),
      });
      res.json({ checksum: result.checksum, byteSize: result.buffer.length });
    } catch (error) {
      sendError(res, error);
    }
  }
);
router.get(
  '/:instanceId/pdf',
  requirePermission('design.forms.view'),
  async (req, res) => {
    try {
      const detail = await getProjectForm(req.params.instanceId);
      const result = await renderProjectForm({
        instanceId: req.params.instanceId,
        retainApproved: detail.instance.lifecycleStatus === 'APPROVED',
        actor: actor(req),
        request: evidence(req),
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('X-Content-SHA256', result.checksum);
      res.setHeader(
        'Content-Disposition',
        `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="project-form-${req.params.instanceId}.pdf"`
      );
      res.send(result.buffer);
    } catch (error) {
      sendError(res, error);
    }
  }
);
router.post(
  '/:instanceId/decisions',
  requirePermission('design.forms.approve'),
  async (req, res) => {
    try {
      res.json(
        await decideProjectForm({
          instanceId: req.params.instanceId,
          decision: req.body.decision,
          approvalRole: String(req.body.approvalRole ?? ''),
          comment: String(req.body.comment ?? ''),
          actor: actor(req),
          request: evidence(req),
        })
      );
    } catch (error) {
      sendError(res, error);
    }
  }
);
router.post(
  '/:instanceId/supersede',
  requirePermission('design.forms.supersede'),
  async (req, res) => {
    try {
      res.json(
        await supersedeProjectForm({
          instanceId: req.params.instanceId,
          reason: String(req.body.reason ?? ''),
          actor: actor(req),
          request: evidence(req),
        })
      );
    } catch (error) {
      sendError(res, error);
    }
  }
);

export default router;
