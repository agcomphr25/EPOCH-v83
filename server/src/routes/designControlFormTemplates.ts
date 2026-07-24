import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from 'express';

import { DESIGN_CONTROL_FORM_CATALOG } from '../../../shared/designControlFormCatalog';
import { pool } from '../../db';
import { requirePermission } from '../../middleware/requirePermission';
import {
  ControlledDocumentError,
  transitionControlledRevision,
} from '../services/controlledDocumentLifecycleService';
import {
  assertReleasedTemplateRevisionSelectable,
  createDesignControlTemplateRevision,
  getBlankFormArtifact,
  listDesignControlTemplates,
  listDesignControlTemplateReconciliation,
  prepareReleasedBlankPdf,
  seedCanonicalDesignControlTemplates,
  synchronizeTemplateLifecycle,
} from '../services/designControlTemplateService';
import {
  assertDesignControlTemplateSchemaReady,
  DesignControlTemplateSchemaNotReadyError,
  requiredDesignControlTemplateMigration,
} from '../services/designControlTemplateSchemaReadiness';

const router = Router();

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
    `SELECT u.id, u.username, u.role
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
  (req as any).user = user;
  next();
};

router.use(authenticate);
router.use(async (_req, res, next) => {
  try {
    await assertDesignControlTemplateSchemaReady();
    next();
  } catch (error) {
    if (error instanceof DesignControlTemplateSchemaNotReadyError) {
      return res.status(503).json({
        error: error.code,
        message: error.message,
        requiredMigration: requiredDesignControlTemplateMigration,
        missingObjects: error.missingObjects,
      });
    }
    next(error);
  }
});

const actor = (req: Request) => {
  const user = (req as any).user;
  return {
    id: Number(user.id),
    username: String(user.username),
    role: String(user.role),
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
  if (error instanceof ControlledDocumentError) {
    return res
      .status(error.statusCode)
      .json({ error: error.code, message: error.message, ...error.details });
  }
  console.error('Design Control form-template operation failed', error);
  return res
    .status(500)
    .json({ error: 'DESIGN_CONTROL_TEMPLATE_OPERATION_FAILED' });
};

const exactContext = async (
  templateKey: string,
  templateRevisionId: string
) => {
  const templates = await listDesignControlTemplates();
  const template = templates.find((item) => item.templateKey === templateKey);
  const revision = template?.revisions.find(
    (item) => item.id === templateRevisionId
  );
  if (!template || !revision || !template.document) {
    throw new ControlledDocumentError(
      404,
      'TEMPLATE_REVISION_NOT_FOUND',
      'Exact template revision mapping not found'
    );
  }
  return { template, revision };
};

router.get('/catalog', requirePermission('documents.view'), (_req, res) => {
  res.json(DESIGN_CONTROL_FORM_CATALOG);
});

router.get('/', requirePermission('documents.view'), async (_req, res) => {
  try {
    res.json(await listDesignControlTemplates());
  } catch (error) {
    sendError(res, error);
  }
});

router.get(
  '/reconciliation',
  requirePermission('documents.view'),
  async (_req, res) => {
    try {
      res.json(await listDesignControlTemplateReconciliation());
    } catch (error) {
      sendError(res, error);
    }
  }
);

router.post(
  '/seed',
  requirePermission('documents.template.create'),
  async (req, res) => {
    try {
      res.json(
        await seedCanonicalDesignControlTemplates({
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
  '/:templateKey/revisions',
  requirePermission('documents.template.revise'),
  async (req, res) => {
    try {
      const result = await createDesignControlTemplateRevision({
        templateKey: req.params.templateKey,
        expectedDocumentRevisionId: req.body.expectedDocumentRevisionId,
        documentRevision: String(req.body.documentRevision ?? ''),
        reason: String(req.body.reason ?? ''),
        definition: req.body.definition,
        actor: actor(req),
        request: evidence(req),
      });
      res.status(201).json(result);
    } catch (error) {
      sendError(res, error);
    }
  }
);

router.post(
  '/:templateKey/revisions/:revisionId/submit',
  requirePermission('documents.submit'),
  async (req, res) => {
    try {
      const context = await exactContext(
        req.params.templateKey,
        req.params.revisionId
      );
      const reason = String(
        req.body.reason ?? 'Submitted for document-control review'
      );
      await transitionControlledRevision({
        documentId: context.template.document!.id,
        revisionId: context.revision.documentVersionHistoryId,
        action: 'submit',
        reason,
        actor: actor(req),
        request: evidence(req),
      });
      await synchronizeTemplateLifecycle({
        templateKey: req.params.templateKey,
        revisionId: req.params.revisionId,
        lifecycleStatus: 'IN_REVIEW',
        reason,
        actor: actor(req),
        request: evidence(req),
      });
      res.json({ status: 'IN_REVIEW' });
    } catch (error) {
      sendError(res, error);
    }
  }
);

router.post(
  '/:templateKey/revisions/:revisionId/decision',
  requirePermission('documents.template.release'),
  async (req, res) => {
    try {
      const context = await exactContext(
        req.params.templateKey,
        req.params.revisionId
      );
      const decision = String(req.body.decision ?? 'APPROVED') as
        'APPROVED' | 'REJECTED' | 'RETURNED_FOR_REVISION';
      const reason = String(req.body.reason ?? '');
      await transitionControlledRevision({
        documentId: context.template.document!.id,
        revisionId: context.revision.documentVersionHistoryId,
        action: 'approve',
        decision,
        reason,
        actor: actor(req),
        request: evidence(req),
      });
      await synchronizeTemplateLifecycle({
        templateKey: req.params.templateKey,
        revisionId: req.params.revisionId,
        lifecycleStatus: decision === 'APPROVED' ? 'APPROVED' : 'DRAFT',
        reason,
        actor: actor(req),
        request: evidence(req),
      });
      res.json({ status: decision === 'APPROVED' ? 'APPROVED' : 'DRAFT' });
    } catch (error) {
      sendError(res, error);
    }
  }
);

router.post(
  '/:templateKey/revisions/:revisionId/release',
  requirePermission('documents.template.release'),
  async (req, res) => {
    try {
      const context = await exactContext(
        req.params.templateKey,
        req.params.revisionId
      );
      const reason = String(req.body.reason ?? '');
      const artifact = await prepareReleasedBlankPdf({
        templateKey: req.params.templateKey,
        revisionId: req.params.revisionId,
        actor: actor(req),
        request: evidence(req),
      });
      await transitionControlledRevision({
        documentId: context.template.document!.id,
        revisionId: context.revision.documentVersionHistoryId,
        action: 'release',
        reason,
        effectiveDate: req.body.effectiveDate,
        actor: actor(req),
        request: evidence(req),
      });
      await synchronizeTemplateLifecycle({
        templateKey: req.params.templateKey,
        revisionId: req.params.revisionId,
        lifecycleStatus: 'RELEASED',
        reason,
        actor: actor(req),
        request: evidence(req),
      });
      res.json({
        status: 'RELEASED',
        blankPdfChecksum: artifact.blankPdfChecksum,
      });
    } catch (error) {
      sendError(res, error);
    }
  }
);

router.post(
  '/:templateKey/revisions/:revisionId/obsolete',
  requirePermission('documents.template.obsolete'),
  async (req, res) => {
    try {
      const context = await exactContext(
        req.params.templateKey,
        req.params.revisionId
      );
      const reason = String(req.body.reason ?? '');
      await transitionControlledRevision({
        documentId: context.template.document!.id,
        revisionId: context.revision.documentVersionHistoryId,
        action: 'obsolete',
        reason,
        actor: actor(req),
        request: evidence(req),
      });
      await synchronizeTemplateLifecycle({
        templateKey: req.params.templateKey,
        revisionId: req.params.revisionId,
        lifecycleStatus: 'OBSOLETE',
        reason,
        actor: actor(req),
        request: evidence(req),
      });
      res.json({ status: 'OBSOLETE' });
    } catch (error) {
      sendError(res, error);
    }
  }
);

router.get(
  '/:templateKey/revisions/:revisionId/preview',
  requirePermission('documents.view'),
  async (req, res) => {
    try {
      const artifact = await getBlankFormArtifact(
        req.params.templateKey,
        req.params.revisionId
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${artifact.revision.documentNumberSnapshot}-${artifact.revision.documentRevisionSnapshot}.pdf"`
      );
      res.setHeader(
        'X-Content-SHA256',
        artifact.revision.blankPdfChecksum || 'PREVIEW-NOT-RETAINED'
      );
      res.send(artifact.buffer);
    } catch (error) {
      sendError(res, error);
    }
  }
);

router.get(
  '/:templateKey/revisions/:revisionId/download',
  requirePermission('documents.view'),
  async (req, res) => {
    try {
      const artifact = await getBlankFormArtifact(
        req.params.templateKey,
        req.params.revisionId
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${artifact.revision.documentNumberSnapshot}-${artifact.revision.documentRevisionSnapshot}-blank.pdf"`
      );
      res.setHeader(
        'X-Content-SHA256',
        artifact.revision.blankPdfChecksum || 'PREVIEW-NOT-RETAINED'
      );
      res.send(artifact.buffer);
    } catch (error) {
      sendError(res, error);
    }
  }
);

router.get(
  '/:templateKey/revisions/:revisionId/selection-eligibility',
  requirePermission('documents.view'),
  async (req, res) => {
    try {
      const result = await assertReleasedTemplateRevisionSelectable(
        req.params.templateKey,
        req.params.revisionId
      );
      res.json({ selectable: true, templateRevisionId: result.revision.id });
    } catch (error) {
      sendError(res, error);
    }
  }
);

export default router;
