import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { getDailyTagUp } from '../services/dailyTagUpService';

const router = Router();
router.use(authenticateToken, requirePermission('p2.work_orders.view'));

router.get('/', async (req, res) => {
  try {
    const rawDays = req.query.attentionDays;
    const attentionDays = rawDays === 'all' || rawDays == null ? null : Number(rawDays);
    res.json(await getDailyTagUp({
      projectId: typeof req.query.projectId === 'string' ? req.query.projectId : undefined,
      customer: typeof req.query.customer === 'string' ? req.query.customer : undefined,
      customerPo: typeof req.query.customerPo === 'string' ? req.query.customerPo : undefined,
      department: typeof req.query.department === 'string' ? req.query.department : undefined,
      source: ['manufacturing', 'purchasing', 'both'].includes(String(req.query.source)) ? req.query.source as any : 'both',
      status: typeof req.query.status === 'string' ? req.query.status : 'all',
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      attentionDays: Number.isFinite(attentionDays) ? attentionDays : null,
      problemsOnly: req.query.problemsOnly === 'true',
    }));
  } catch (error: any) {
    console.error('[daily-tag-up]', error);
    res.status(500).json({ error: 'DAILY_TAG_UP_FAILED', message: error?.message ?? 'Failed to load Daily Tag Up' });
  }
});

router.get('/projects/:projectId', async (req, res) => {
  try {
    const model = await getDailyTagUp({ projectId: req.params.projectId, source: 'both' });
    if (!model.projects.length) return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });
    res.json({ generatedAt: model.generatedAt, authority: model.authority, project: model.projects[0] });
  } catch (error: any) {
    console.error('[daily-tag-up-project]', error);
    res.status(500).json({ error: 'DAILY_TAG_UP_FAILED', message: error?.message ?? 'Failed to load Daily Tag Up project' });
  }
});

export default router;
