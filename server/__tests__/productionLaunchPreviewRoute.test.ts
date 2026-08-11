import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUserPermissions: vi.fn(),
  getProductionLaunchPreview: vi.fn(),
}));

vi.mock('../src/services/permissionService', () => ({
  getUserPermissions: mocks.getUserPermissions,
}));

vi.mock('../src/services/projectProductionPlanningService', () => {
  class ProjectProductionPlanningError extends Error {
    constructor(
      public code: string,
      message: string,
      public status: number,
      public details: Record<string, unknown> = {}
    ) {
      super(message);
    }
  }
  return {
    ProjectProductionPlanningError,
    createDraftFromCurrentConfiguration: vi.fn(),
    getCurrentProductionPlan: vi.fn(),
    recordEngineeringDecision: vi.fn(),
    recordOperationsDecision: vi.fn(),
    recordQualityDecision: vi.fn(),
    refreshDraft: vi.fn(),
    revisePlan: vi.fn(),
    submitForApproval: vi.fn(),
    updatePlanItemDecision: vi.fn(),
  };
});

vi.mock('../src/services/productionLaunchPreviewService', () => ({
  getProductionLaunchPreview: mocks.getProductionLaunchPreview,
}));

import projectProductionPlanningRouter from '../src/routes/projectProductionPlanning';

const app = express();
app.use((req, _res, next) => {
  req.user = { id: 7, username: 'phase-one-reviewer', role: 'ENGINEERING' };
  next();
});
app.use(
  '/api/projects/:id/workflow-v2/production-planning',
  projectProductionPlanningRouter
);

describe('Production Launch preview route boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 before resolving preview data without the capability', async () => {
    mocks.getUserPermissions.mockResolvedValue({ permissionSet: new Set() });
    const response = await request(app).get(
      '/api/projects/project-1/workflow-v2/production-planning/launch-preview'
    );
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('FORBIDDEN');
    expect(mocks.getProductionLaunchPreview).not.toHaveBeenCalled();
  });

  it('exposes only the explicit preview response to an authorized caller', async () => {
    mocks.getUserPermissions.mockResolvedValue({
      permissionSet: new Set(['projects.production_planning.manage']),
    });
    mocks.getProductionLaunchPreview.mockResolvedValue({
      mode: 'PREVIEW_ONLY',
      createsRecords: false,
      ready: false,
      blockers: [{ code: 'BOM_MISSING' }],
      nodes: [],
    });
    const response = await request(app).get(
      '/api/projects/project-1/workflow-v2/production-planning/launch-preview'
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      mode: 'PREVIEW_ONLY',
      createsRecords: false,
      ready: false,
    });
    expect(mocks.getProductionLaunchPreview).toHaveBeenCalledWith('project-1');
  });
});
