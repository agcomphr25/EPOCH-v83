import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  commercialQuoteEligibility,
  requiredCommercialApprovalRoles,
} from '../src/services/projectCommercialReviewRules';

const root = path.resolve(__dirname, '../..');
const service = fs.readFileSync(
  path.join(root, 'server/src/services/projectCommercialReviewService.ts'),
  'utf8'
);
const routes = fs.readFileSync(
  path.join(root, 'server/src/routes/projectCommercialReviews.ts'),
  'utf8'
);
const migration = fs.readFileSync(
  path.join(root, 'migrations/0206_project_commercial_stage_reviews.sql'),
  'utf8'
);

describe('P2 V2 commercial review safety', () => {
  it('rejects ineligible quote evidence and accepts a current released basis', () => {
    expect(
      commercialQuoteEligibility({
        quoteStatus: 'DRAFT',
        validUntil: '2026-01-01',
        hasReleasedSnapshot: false,
        estimateStatus: 'REJECTED',
        estimateApprovalStatuses: ['APPROVED', 'PENDING'],
        now: new Date('2026-07-01').getTime(),
      })
    ).toHaveLength(5);
    expect(
      commercialQuoteEligibility({
        quoteStatus: 'SENT',
        validUntil: '2027-01-01',
        hasReleasedSnapshot: true,
        estimateStatus: 'APPROVED',
        estimateApprovalStatuses: ['APPROVED'],
        now: new Date('2026-07-01').getTime(),
      })
    ).toEqual([]);
  });

  it('applies conditional Finance approval only to Contract Review', () => {
    expect(requiredCommercialApprovalRoles('estimate_quote', true)).toEqual([
      'PROJECT_MANAGEMENT',
    ]);
    expect(requiredCommercialApprovalRoles('contract_review', true)).toEqual([
      'PROJECT_MANAGEMENT',
      'ENGINEERING',
      'QUALITY',
      'OPERATIONS',
      'FINANCE',
    ]);
  });

  it('fails closed for NULL, legacy and unknown workflow versions', () => {
    expect(service).toContain("version !== 'p2_v2'");
    expect(service).toContain('resolveProjectWorkflowVersion');
    expect(service).toContain('P2_V2_REQUIRED');
  });

  it('uses authoritative RFQ, quote, estimate, PO and contract-review sources read-only', () => {
    for (const source of [
      'estimating_rfqs',
      'rfq_risk_assessments',
      'quotes',
      'quote_snapshots',
      'estimate_versions',
      'p2_purchase_orders',
      'contract_review_checklist_instances',
      'quote_po_reconciliations',
    ])
      expect(service).toContain(source);
    expect(service).not.toMatch(
      /UPDATE\s+(estimating_rfqs|rfq_risk_assessments|quotes|p2_purchase_orders|contract_review_checklist_instances)/i
    );
  });

  it('enforces predecessor, source eligibility and exact revision gates', () => {
    expect(service).toContain('PREDECESSOR_REQUIRED');
    expect(service).toContain('Authoritative source revision changed.');
    expect(service).toContain('Current RFQ review is not complete.');
    expect(service).toContain('Contract differences must be resolved.');
  });

  it('requires functional approvals and segregation of duties', () => {
    for (const role of [
      'PROJECT_MANAGEMENT',
      'ENGINEERING',
      'QUALITY',
      'OPERATIONS',
      'FINANCE',
    ])
      expect(service).toContain(role);
    expect(service).toContain('SEGREGATION_OF_DUTIES');
    expect(service).toContain("evidence_snapshot->>'commercialReviewId'");
  });

  it('uses optimistic concurrency, immutable revision history and a single current revision', () => {
    expect(service).toContain('expectedRevision');
    expect(service).toContain('FOR UPDATE');
    expect(service).toContain('STALE_REVISION');
    expect(service).toContain("status='SUPERSEDED'");
    expect(migration).toContain('commercial_review_revision_unique');
    expect(migration).toContain('project_commercial_reviews_current_unique');
    expect(migration).toContain('protect_commercial_review_snapshots');
    expect(migration).not.toMatch(/\b(UPDATE|DELETE)\s+projects\b/i);
  });

  it('exposes only bounded commercial-review mutations and no production creation', () => {
    for (const action of ['/submit', '-decision', '/complete', '/revise'])
      expect(routes).toContain(action);
    expect(routes).not.toContain('router.delete');
    expect(service).not.toMatch(
      /INSERT INTO\s+(production_orders|production_work_orders|inventory|shipping)/i
    );
  });
});

describe('commercial baseline propagation', () => {
  it('is consumed by Design, Production Planning and WAD readiness', () => {
    for (const file of [
      'projectDesignApplicabilityService.ts',
      'projectProductionPlanningService.ts',
      'projectWadAuthorizationService.ts',
    ]) {
      const contents = fs.readFileSync(
        path.join(root, 'server/src/services', file),
        'utf8'
      );
      expect(contents).toContain('evaluateCommercialBaseline');
      expect(contents).toContain('commercial.blockers');
    }
  });
});
