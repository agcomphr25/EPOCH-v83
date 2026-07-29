import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';

import { pool } from '../../db';
import { requirePermission } from '../../middleware/requirePermission';
import { getUserPermissions } from '../services/permissionService';
import {
  ChangeControlError,
  addChangeControlLink,
  assignPcrInvestigator,
  authorizePcrImplementation,
  closePcr,
  createAssessment,
  createNativeChange,
  createPcr,
  completePcrImplementation,
  decideAssessmentRecommendation,
  decidePcr,
  getAssessment,
  getChangeControlRecord,
  getQualityActionDashboard,
  importHistoricalRecord,
  importHistoricalRows,
  importTemplate,
  listChangeControlRecords,
  listMyPcrs,
  parseRegister,
  previewHistoricalRows,
  recordCarEffectiveness,
  searchChangeControlLinks,
  transitionPcr,
  updatePcrControls,
  verifyPcrImplementation,
} from '../services/changeControlService';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
});

const authenticate = async (req: Request, res: Response, next: NextFunction) => {
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
  const rows = await pool.query(
    `SELECT to_regclass('public.change_control_records') IS NOT NULL
         AND to_regclass('public.change_control_assessments') IS NOT NULL
         AND to_regclass('public.pcr_audit_events') IS NOT NULL AS ready`
  );
  if (!rows[0]?.ready)
    return res.status(503).json({
      error: 'CHANGE_CONTROL_SCHEMA_NOT_READY',
      requiredMigration:
        '0230_qms_change_control_register.sql and 0231_quality_action_change_control.sql',
    });
  next();
};

router.use(authenticate, readiness);

const actor = (req: Request) => {
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
const send = (res: Response, error: unknown) => {
  if (error instanceof ChangeControlError)
    return res
      .status(error.statusCode)
      .json({ error: error.code, message: error.message, ...error.details });
  console.error('Change Control operation failed', error);
  return res.status(500).json({ error: 'CHANGE_CONTROL_OPERATION_FAILED' });
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
  '/change-control',
  requirePermission('qms.change_control.view'),
  action((req) => listChangeControlRecords(req.query))
);
router.get(
  '/change-control-dashboard',
  requirePermission('qms.change_control.view'),
  action((req) => getQualityActionDashboard(req.query))
);
router.get(
  '/change-control/link-candidates',
  requirePermission('qms.change_control.view'),
  action((req) =>
    searchChangeControlLinks(req.query.q, String(req.query.excludeId ?? ''))
  )
);
router.get(
  '/change-control/my-pcrs',
  requirePermission('qms.quality_action.pcr_create'),
  action((req) => listMyPcrs(actor(req)))
);
router.post(
  '/change-control/:id/links',
  requirePermission('qms.change_control.create'),
  action((req) => addChangeControlLink(req.params.id, req.body ?? {}, actor(req)))
);
router.post(
  '/change-control/:id/assessments',
  requirePermission('qms.quality_action.screen'),
  action((req) => createAssessment(req.params.id, req.body ?? {}, actor(req)))
);
router.get(
  '/change-control/:id/assessments/:assessmentId',
  requirePermission('qms.change_control.view'),
  action((req) => getAssessment(req.params.assessmentId))
);
router.post(
  '/change-control/:id/assessments/:assessmentId/recommendations/:recommendationId/decision',
  requirePermission('qms.quality_action.screen'),
  action((req) =>
    decideAssessmentRecommendation(
      req.params.id,
      req.params.assessmentId,
      req.params.recommendationId,
      req.body ?? {},
      actor(req)
    )
  )
);
router.post(
  '/change-control/pcrs',
  requirePermission('qms.quality_action.pcr_create'),
  action((req) => createPcr(req.body ?? {}, actor(req)))
);
router.post(
  '/change-control/pcrs/:pcrId/assign',
  requirePermission('qms.quality_action.assign_investigation'),
  action((req) =>
    assignPcrInvestigator(req.params.pcrId, req.body ?? {}, actor(req))
  )
);
router.post(
  '/change-control/pcrs/:pcrId/actions/:action',
  requirePermission('qms.change_control.view'),
  action((req) =>
    transitionPcr(
      req.params.pcrId,
      req.params.action,
      req.body ?? {},
      actor(req)
    )
  )
);
router.post(
  '/change-control/pcrs/:pcrId/decisions',
  requirePermission('qms.change_control.view'),
  action((req) => decidePcr(req.params.pcrId, req.body ?? {}, actor(req)))
);
router.post(
  '/change-control/pcrs/:pcrId/authorize-implementation',
  requirePermission('qms.quality_action.authorize_implementation'),
  action((req) =>
    authorizePcrImplementation(req.params.pcrId, req.body ?? {}, actor(req))
  )
);
router.patch(
  '/change-control/pcrs/:pcrId/controls',
  requirePermission('qms.quality_action.assess_impact'),
  action((req) => updatePcrControls(req.params.pcrId, req.body ?? {}, actor(req)))
);
router.post(
  '/change-control/pcrs/:pcrId/complete-implementation',
  requirePermission('qms.quality_action.authorize_implementation'),
  action((req) => completePcrImplementation(req.params.pcrId, req.body ?? {}, actor(req)))
);
router.post(
  '/change-control/pcrs/:pcrId/verify',
  requirePermission('qms.quality_action.verify_implementation'),
  action((req) => verifyPcrImplementation(req.params.pcrId, req.body ?? {}, actor(req)))
);
router.post(
  '/change-control/pcrs/:pcrId/close',
  requirePermission('qms.quality_action.close'),
  action((req) => closePcr(req.params.pcrId, req.body ?? {}, actor(req)))
);
router.post(
  '/change-control/:id/car-effectiveness',
  requirePermission('qms.quality_action.verify_effectiveness'),
  action((req) =>
    recordCarEffectiveness(req.params.id, req.body ?? {}, actor(req))
  )
);
router.get(
  '/change-control/:id',
  requirePermission('qms.change_control.view'),
  action((req) => getChangeControlRecord(req.params.id))
);
router.post(
  '/change-control/native',
  requirePermission('qms.change_control.create'),
  action((req) => createNativeChange(req.body ?? {}, actor(req)))
);
router.get(
  '/change-control/import/template.csv',
  requirePermission('qms.change_control.import'),
  (_req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="epoch-change-control-import-template.csv"'
    );
    res.send(importTemplate());
  }
);
router.post(
  '/change-control/import/preview',
  requirePermission('qms.change_control.import'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file)
        throw new ChangeControlError(
          'REGISTER_FILE_REQUIRED',
          'A CSV or XLSX register is required'
        );
      const rows = parseRegister(req.file.buffer, req.file.originalname);
      res.json(await previewHistoricalRows(rows));
    } catch (error) {
      send(res, error);
    }
  }
);
router.post(
  '/change-control/import/commit',
  requirePermission('qms.change_control.import'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file)
        throw new ChangeControlError(
          'REGISTER_FILE_REQUIRED',
          'The previewed CSV or XLSX register is required'
        );
      const rows = parseRegister(req.file.buffer, req.file.originalname);
      res.json(await importHistoricalRows(rows, actor(req)));
    } catch (error) {
      send(res, error);
    }
  }
);
router.post(
  '/change-control/import/individual',
  requirePermission('qms.change_control.import'),
  upload.single('file'),
  async (req, res) => {
    try {
      const input = JSON.parse(String(req.body?.metadata ?? '{}'));
      res.json(await importHistoricalRecord(input, req.file, actor(req)));
    } catch (error) {
      send(res, error);
    }
  }
);

export default router;
