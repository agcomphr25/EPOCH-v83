import { Router, type Request, type Response } from 'express';
import multer from 'multer';

import { requirePermission } from '../../middleware/requirePermission';
import {
  acceptReturnedScan,
  acknowledgeControlledCopy,
  ControlledCopyError,
  getControlledCopy,
  getControlledCopyHistory,
  getIssuedCopyPdf,
  issueControlledCopy,
  listControlledCopies,
  recordControlledCopyDownload,
  reconcileLegacyDistributionLogs,
  renderUncontrolledPrint,
  replaceControlledCopy,
  transitionControlledCopy,
  uploadReturnedScan,
  verifyControlledCopy,
  type CopyActor,
} from '../services/controlledPrintedCopyService';
import {
  assertControlledCopySchemaReady,
  ControlledCopySchemaNotReadyError,
  requiredControlledCopyMigration,
} from '../services/controlledPrintedCopySchemaReadiness';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 },
});
const actor = (req: Request): CopyActor => {
  const user = (req as any).user;
  return {
    id: Number(user.id),
    username: user.username,
    displayName:
      user.displayName ??
      ([user.first_name, user.last_name].filter(Boolean).join(' ') ||
        user.username),
    role: user.role,
    capabilities: user.capabilities ?? [],
  };
};
const error = (res: Response, cause: unknown) => {
  if (cause instanceof ControlledCopyError)
    return res
      .status(cause.statusCode)
      .json({ error: cause.code, message: cause.message, ...cause.details });
  console.error('[controlled-printed-copies]', cause);
  return res.status(500).json({ error: 'CONTROLLED_COPY_OPERATION_FAILED' });
};
const historicalExceptionGuard = (
  req: Request,
  res: Response,
  next: () => void
) => {
  if (!req.body?.historicalException) return next();
  return requirePermission('documents.controlled_copy.admin')(req, res, next);
};
router.use(async (_req, res, next) => {
  try {
    await assertControlledCopySchemaReady();
    next();
  } catch (cause) {
    if (cause instanceof ControlledCopySchemaNotReadyError)
      return res.status(503).json({
        error: cause.code,
        message: cause.message,
        missingObjects: cause.missingObjects,
        requiredMigration: requiredControlledCopyMigration,
      });
    next(cause);
  }
});

router.post(
  '/uncontrolled-print',
  requirePermission('documents.controlled_copy.view'),
  async (req, res) => {
    try {
      const result = await renderUncontrolledPrint(req.body, actor(req));
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('X-Print-Classification', 'UNCONTROLLED');
      res.send(result.bytes);
    } catch (cause) {
      error(res, cause);
    }
  }
);
router.post(
  '/',
  requirePermission('documents.controlled_copy.issue'),
  historicalExceptionGuard,
  async (req, res) => {
    try {
      const base = `${req.protocol}://${req.get('host')}`;
      const result = await issueControlledCopy(req.body, actor(req), base);
      res.status(201).json({
        copy: result.copy,
        verificationToken: result.verificationToken,
      });
    } catch (cause) {
      error(res, cause);
    }
  }
);
router.get(
  '/',
  requirePermission('documents.controlled_copy.view'),
  async (req, res) => {
    res.json(
      await listControlledCopies({
        status: req.query.status ? String(req.query.status) : undefined,
        projectId: req.query.projectId
          ? String(req.query.projectId)
          : undefined,
        recordId: req.query.recordId ? String(req.query.recordId) : undefined,
        department: req.query.department
          ? String(req.query.department)
          : undefined,
      })
    );
  }
);
router.get('/verify/:token', async (req, res) => {
  const verification = await verifyControlledCopy(req.params.token);
  if (!verification) return res.status(404).json({ valid: false });
  res.json({
    valid: true,
    copyNumber: verification.copy_number,
    sourceDocumentNumber: verification.source_document_number,
    sourceRevision: verification.source_revision,
    status: verification.lifecycle_status,
    issuedAt: verification.issued_at,
    verificationId: verification.issued_pdf_checksum.slice(0, 16),
  });
});
router.get(
  '/:copyId',
  requirePermission('documents.controlled_copy.view'),
  async (req, res) => {
    const copy = await getControlledCopy(req.params.copyId);
    if (!copy)
      return res.status(404).json({ error: 'CONTROLLED_COPY_NOT_FOUND' });
    res.json(copy);
  }
);
router.get(
  '/:copyId/pdf',
  requirePermission('documents.controlled_copy.view'),
  async (req, res) => {
    try {
      const result = await getIssuedCopyPdf(req.params.copyId);
      await recordControlledCopyDownload(req.params.copyId, actor(req));
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${result.copy.copy_number}.pdf"`
      );
      res.setHeader('X-Artifact-Checksum', result.copy.issued_pdf_checksum);
      res.send(result.bytes);
    } catch (cause) {
      error(res, cause);
    }
  }
);
router.get(
  '/:copyId/history',
  requirePermission('documents.controlled_copy.view'),
  async (req, res) => {
    res.json(await getControlledCopyHistory(req.params.copyId));
  }
);
router.post(
  '/:copyId/acknowledge',
  requirePermission('documents.controlled_copy.return'),
  async (req, res) => {
    try {
      res.json(await acknowledgeControlledCopy(req.params.copyId, actor(req)));
    } catch (cause) {
      error(res, cause);
    }
  }
);
const transition = (status: string, capability: string) =>
  [
    requirePermission(capability),
    async (req: Request, res: Response) => {
      try {
        res.json(
          await transitionControlledCopy(
            req.params.copyId,
            status,
            req.body.reason,
            actor(req),
            req.body.details ?? {}
          )
        );
      } catch (cause) {
        error(res, cause);
      }
    },
  ] as const;
router.post(
  '/:copyId/return',
  ...transition('RETURNED', 'documents.controlled_copy.return')
);
router.post(
  '/:copyId/destroy',
  ...transition('DESTROYED', 'documents.controlled_copy.destroy')
);
router.post(
  '/:copyId/void',
  ...transition('VOID', 'documents.controlled_copy.admin')
);
router.post(
  '/:copyId/report-lost',
  ...transition('LOST', 'documents.controlled_copy.report_lost')
);
router.post(
  '/:copyId/close',
  ...transition('CLOSED', 'documents.controlled_copy.reconcile')
);
router.post(
  '/:copyId/upload-scan',
  requirePermission('documents.controlled_copy.return'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file)
        return res.status(400).json({ error: 'SCAN_FILE_REQUIRED' });
      res.json(
        await uploadReturnedScan(
          req.params.copyId,
          {
            originalFilename: req.file.originalname,
            mimeType: req.file.mimetype,
            bytes: req.file.buffer,
            completedFormEvidence: req.body.completedFormEvidence === 'true',
          },
          actor(req)
        )
      );
    } catch (cause) {
      error(res, cause);
    }
  }
);
router.post(
  '/:copyId/accept-scan',
  requirePermission('documents.controlled_copy.reconcile'),
  async (req, res) => {
    try {
      res.json(
        await acceptReturnedScan(
          req.params.copyId,
          req.body.attachmentId,
          req.body.decision,
          req.body.reason,
          actor(req)
        )
      );
    } catch (cause) {
      error(res, cause);
    }
  }
);
router.post(
  '/:copyId/replace',
  requirePermission('documents.controlled_copy.issue'),
  async (req, res) => {
    try {
      const base = `${req.protocol}://${req.get('host')}`;
      res
        .status(201)
        .json(
          await replaceControlledCopy(
            req.params.copyId,
            req.body,
            actor(req),
            base
          )
        );
    } catch (cause) {
      error(res, cause);
    }
  }
);
router.post(
  '/admin/reconcile-legacy',
  requirePermission('documents.controlled_copy.admin'),
  async (req, res) => {
    try {
      res.json(await reconcileLegacyDistributionLogs(actor(req)));
    } catch (cause) {
      error(res, cause);
    }
  }
);

export default router;

export const controlledCopyScopeRouter = Router();
controlledCopyScopeRouter.get(
  '/controlled-documents/:documentId/outstanding-copies',
  requirePermission('documents.controlled_copy.view'),
  async (req, res) => {
    res.json(
      await listControlledCopies({
        status: 'ISSUED',
        documentId: req.params.documentId,
      })
    );
  }
);
controlledCopyScopeRouter.get(
  '/design-control/:recordId/controlled-copies',
  requirePermission('documents.controlled_copy.view'),
  async (req, res) => {
    res.json(await listControlledCopies({ recordId: req.params.recordId }));
  }
);
