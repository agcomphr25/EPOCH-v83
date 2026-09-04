import { Router, Request, Response } from 'express';

import {
  getProgramBuilds,
  getProgramBuildStatus,
  programManufacturingTablesReady,
} from '../lib/programManufacturingOrchestration';

const router = Router();

function h(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) =>
    fn(req, res).catch((err) => {
      console.error('[Program Manufacturing]', err?.message ?? err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to load program manufacturing orchestration', message: err?.message });
      }
    });
}

router.get('/builds', h(async (req, res) => {
  const ready = await programManufacturingTablesReady();
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : null;
  if (!ready) {
    const fallback = projectId
      ? await getProgramBuildStatus(null, { projectId })
      : null;
    return res.json({
      ready: Boolean(fallback),
      builds: fallback ? [fallback.build] : [],
    });
  }

  const builds = await getProgramBuilds({ projectId });
  if (builds.length > 0 || !projectId)
    return res.json({ ready: true, builds });
  const fallback = await getProgramBuildStatus(null, { projectId });
  res.json({ ready: true, builds: fallback ? [fallback.build] : [] });
}));

router.get('/status', h(async (req, res) => {
  const ready = await programManufacturingTablesReady();
  const buildId = typeof req.query.buildId === 'string' ? req.query.buildId : null;
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : null;
  if (!ready && !projectId) {
    return res.json({
      ready: false,
      build: null,
      summary: {
        totalAssemblies: 0,
        completeAssemblies: 0,
        blockedAssemblies: 0,
        inProgressAssemblies: 0,
        totalQueueItems: 0,
        completedQueueItems: 0,
        completionPercent: 0,
        shipReady: false,
        criticalPath: [],
      },
      assemblies: [],
      flatAssemblies: [],
      blockers: [],
      swimlanes: [],
    });
  }

  const status = await getProgramBuildStatus(buildId, { projectId });
  if (!status) {
    return res.json({
      ready,
      build: null,
      summary: {
        totalAssemblies: 0,
        completeAssemblies: 0,
        blockedAssemblies: 0,
        inProgressAssemblies: 0,
        totalQueueItems: 0,
        completedQueueItems: 0,
        completionPercent: 0,
        shipReady: false,
        criticalPath: [],
      },
      assemblies: [],
      flatAssemblies: [],
      blockers: [],
      swimlanes: [],
    });
  }

  res.json({ ready: true, ...status });
}));

router.get('/projects/:projectId/health', h(async (req, res) => {
  const ready = await programManufacturingTablesReady();
  const status = await getProgramBuildStatus(null, { projectId: req.params.projectId });
  if (!status) {
    return res.json({ ready, build: null, widgets: null });
  }

  res.json({
    ready: true,
    build: status.build,
    widgets: {
      programHealth: status.summary.completionPercent,
      criticalPath: status.summary.criticalPath,
      blockedAssemblies: status.blockers,
      shipReadiness: {
        ready: status.summary.shipReady,
        completeAssemblies: status.summary.completeAssemblies,
        totalAssemblies: status.summary.totalAssemblies,
      },
      laborMaterialImpact: {
        queueItems: status.summary.totalQueueItems,
        completedQueueItems: status.summary.completedQueueItems,
        blockedAssemblies: status.summary.blockedAssemblies,
      },
    },
  });
}));

export default router;
