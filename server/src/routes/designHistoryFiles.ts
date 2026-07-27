import { Router, type Request, type Response } from 'express';

import { requirePermission } from '../../middleware/requirePermission';
import {
  DesignHistoryFileError,
  generateDesignHistoryFile,
  getDesignHistoryFile,
  getDesignHistoryFileByRelease,
  getDesignHistoryFileDownload,
  getDesignHistoryFileVersion,
  getProjectDesignHistoryFile,
  listDesignHistoryFileVersions,
  previewDesignHistoryFile,
  verifyDesignHistoryFileVersion,
  type DhfActor,
} from '../services/designHistoryFileService';
import {
  assertDesignHistoryFileSchemaReady,
  DesignHistoryFileSchemaNotReadyError,
  requiredDesignHistoryFileMigration,
} from '../services/designHistoryFileSchemaReadiness';

const router = Router();
const actor = (req: Request): DhfActor => {
  const user = (req as any).user;
  return {
    id: Number(user.id),
    username: user.username,
    displayName:
      user.displayName ??
      [user.first_name, user.last_name].filter(Boolean).join(' ') ??
      user.username,
    role: user.role,
    capabilities: user.capabilities ?? user.permissions ?? [],
  };
};
const schemaReady = async (_req: Request, res: Response, next: () => void) => {
  try {
    await assertDesignHistoryFileSchemaReady();
    next();
  } catch (error) {
    if (error instanceof DesignHistoryFileSchemaNotReadyError)
      return res.status(503).json({
        error: error.code,
        message: error.message,
        missingObjects: error.missingObjects,
        requiredMigration: requiredDesignHistoryFileMigration,
      });
    throw error;
  }
};
const requireAdminForOmissions = (
  req: Request,
  res: Response,
  next: () => void
) => {
  if (
    !Array.isArray(req.body?.authorizedOmissions) ||
    !req.body.authorizedOmissions.length
  )
    return next();
  return requirePermission('design.dhf.admin')(req, res, next);
};
const failure = (res: Response, error: unknown) => {
  if (error instanceof DesignHistoryFileError)
    return res.status(error.statusCode).json({
      error: error.code,
      message: error.message,
      ...error.details,
    });
  console.error('[design-history-files]', error);
  return res.status(500).json({ error: 'DESIGN_HISTORY_FILE_FAILED' });
};
router.use(schemaReady);

router.get(
  '/engineering-releases/:releaseId/dhf-preview',
  requirePermission('design.dhf.preview'),
  async (req, res) => {
    try {
      res.json(await previewDesignHistoryFile(req.params.releaseId));
    } catch (error) {
      failure(res, error);
    }
  }
);
router.post(
  '/engineering-releases/:releaseId/dhf',
  requirePermission('design.dhf.generate'),
  requireAdminForOmissions,
  async (req, res) => {
    try {
      const reason = String(req.body?.reason ?? '').trim();
      if (!reason)
        throw new DesignHistoryFileError(
          'DHF_GENERATION_REASON_REQUIRED',
          'A documented generation reason is required',
          422
        );
      const result = await generateDesignHistoryFile({
        releaseId: req.params.releaseId,
        actor: actor(req),
        reason,
        authorizedOmissions: req.body?.authorizedOmissions,
      });
      res.status(result.status === 'existing' ? 200 : 201).json(result);
    } catch (error) {
      failure(res, error);
    }
  }
);
router.get(
  '/engineering-releases/:releaseId/dhf',
  requirePermission('design.dhf.view'),
  async (req, res) => {
    res.json(await getDesignHistoryFileByRelease(req.params.releaseId));
  }
);
router.get(
  '/design-projects/:projectId/dhf',
  requirePermission('design.dhf.view'),
  async (req, res) => {
    res.json(await getProjectDesignHistoryFile(req.params.projectId));
  }
);
router.get(
  '/dhfs/:dhfId',
  requirePermission('design.dhf.view'),
  async (req, res) => {
    res.json(await getDesignHistoryFile(req.params.dhfId));
  }
);
router.get(
  '/dhfs/:dhfId/versions',
  requirePermission('design.dhf.view'),
  async (req, res) => {
    res.json(await listDesignHistoryFileVersions(req.params.dhfId));
  }
);
router.get(
  '/dhfs/:dhfId/versions/:versionId',
  requirePermission('design.dhf.view'),
  async (req, res) => {
    res.json(
      await getDesignHistoryFileVersion(req.params.dhfId, req.params.versionId)
    );
  }
);
router.post(
  '/dhfs/:dhfId/versions/:versionId/validate',
  requirePermission('design.dhf.verify'),
  async (req, res) => {
    try {
      res.json(
        await verifyDesignHistoryFileVersion(
          req.params.dhfId,
          req.params.versionId,
          actor(req)
        )
      );
    } catch (error) {
      failure(res, error);
    }
  }
);
router.post(
  '/dhfs/:dhfId/versions/:versionId/export',
  requirePermission('design.dhf.export'),
  async (req, res) => {
    const version = await getDesignHistoryFileVersion(
      req.params.dhfId,
      req.params.versionId
    );
    if (!version)
      return res.status(404).json({ error: 'DHF_VERSION_NOT_FOUND' });
    res.json({
      status: version.version.generation_status,
      retainedExportPath: version.version.retained_export_path,
      exportChecksum: version.version.export_checksum,
      retryable: version.version.generation_status === 'FAILED',
    });
  }
);
router.get(
  '/dhfs/:dhfId/versions/:versionId/download',
  requirePermission('design.dhf.export'),
  async (req, res) => {
    try {
      const result = await getDesignHistoryFileDownload(
        req.params.dhfId,
        req.params.versionId,
        actor(req)
      );
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="DHF-${result.version.version_number}.zip"`
      );
      res.send(result.bytes);
    } catch (error) {
      failure(res, error);
    }
  }
);
router.get(
  '/dhfs/:dhfId/versions/:versionId/verify',
  requirePermission('design.dhf.verify'),
  async (req, res) => {
    try {
      res.json(
        await verifyDesignHistoryFileVersion(
          req.params.dhfId,
          req.params.versionId,
          actor(req)
        )
      );
    } catch (error) {
      failure(res, error);
    }
  }
);

export default router;
