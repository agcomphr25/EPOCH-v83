import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  evaluateCloseoutReadiness,
  evaluateShippingReadiness,
} from '../src/services/projectShippingCloseoutRules';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const migration = read('migrations/0225_p2_v2_shipping_project_closeout.sql');
const service = read('server/src/services/projectShippingCloseoutService.ts');
const routes = read('server/src/routes/projectShippingCloseout.ts');
const ui = read(
  'client/src/components/projects/P2V2ShippingProjectCloseout.tsx'
);
const safeBoot = read('server/scripts/migrations/runSafeBootMigrations.ts');

const readyShipping = () => ({
  selectedAllocationCount: 1,
  selectedQuantity: 1,
  eligibleQuantity: 1,
  activeReleaseHold: false,
  activeShippingHold: false,
  packagingMethod: 'Individual bag in rigid carton',
  preservationMethod: 'Clean/dry/FOD protected',
  packageCount: 1,
  weightLbs: 4,
  dimensions: { length: 12, width: 8, height: 4 },
  address: {
    name: 'Customer',
    line1: '1 Main St',
    city: 'Tulsa',
    region: 'OK',
    postalCode: '74101',
    country: 'US',
  },
  carrier: 'UPS',
  serviceLevel: 'Ground',
  documents: [
    {
      documentId: 'doc-1',
      documentNumber: 'COC-1',
      revision: 'A',
      status: 'RELEASED',
      inclusionReason: 'Customer requirement',
      required: true,
    },
  ],
});

describe('Phase 9C Shipping readiness rules', () => {
  it('accepts exact eligible released allocations with complete packaging evidence', () => {
    expect(evaluateShippingReadiness(readyShipping())).toEqual({
      blockers: [],
      status: 'READY_TO_SHIP',
    });
  });

  it('blocks missing Product Release allocation selection', () => {
    const result = evaluateShippingReadiness({
      ...readyShipping(),
      selectedAllocationCount: 0,
      selectedQuantity: 0,
      eligibleQuantity: 0,
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.blockers.join(' ')).toMatch(/Product Release allocation/i);
  });

  it('allows an exact partial Product Release shipment', () => {
    expect(
      evaluateShippingReadiness({
        ...readyShipping(),
        selectedQuantity: 1,
        eligibleQuantity: 2,
      }).status
    ).toBe('READY_TO_SHIP');
  });

  it.each([
    ['Product Release hold', { activeReleaseHold: true }],
    ['Shipping hold', { activeShippingHold: true }],
    ['weight', { weightLbs: 0 }],
    ['length', { dimensions: { length: 0, width: 8, height: 4 } }],
    ['carrier', { carrier: '' }],
  ])('blocks incomplete or held readiness: %s', (_label, change) => {
    expect(
      evaluateShippingReadiness({ ...readyShipping(), ...change }).blockers
    ).not.toHaveLength(0);
  });

  it('rejects draft/uncontrolled documents as deliverables', () => {
    const result = evaluateShippingReadiness({
      ...readyShipping(),
      documents: [
        {
          ...readyShipping().documents[0],
          status: 'DRAFT',
        },
      ],
    });
    expect(result.blockers.join(' ')).toMatch(/not RELEASED|not an approved/i);
  });
});

describe('Phase 9C Project Closeout rules', () => {
  const readyCloseout = () => ({
    stage8Complete: true,
    stage9Complete: true,
    authorizedQuantity: 2,
    releasedQuantity: 2,
    shippedQuantity: 2,
    deliveredQuantity: 2,
    deliveryRequired: true,
    activeHolds: 0,
    deliveryExceptions: 0,
    unresolvedActions: 0,
    archiveDocumentCount: 5,
    financeTransferredOrComplete: true,
  });

  it('requires complete reconciliation before closeout review', () => {
    expect(evaluateCloseoutReadiness(readyCloseout())).toMatchObject({
      ready: true,
      blockers: [],
      status: 'READY_FOR_CLOSEOUT_REVIEW',
    });
  });

  it.each([
    ['Stage 8', { stage8Complete: false }],
    ['Stage 9', { stage9Complete: false }],
    ['released', { releasedQuantity: 1 }],
    ['shipped', { shippedQuantity: 1 }],
    ['delivery', { deliveredQuantity: 1 }],
    ['hold', { activeHolds: 1 }],
    ['exception', { deliveryExceptions: 1 }],
    ['action', { unresolvedActions: 1 }],
    ['archive', { archiveDocumentCount: 0 }],
    ['Finance', { financeTransferredOrComplete: false }],
  ])('blocks closeout for unresolved %s evidence', (_label, change) => {
    expect(
      evaluateCloseoutReadiness({ ...readyCloseout(), ...change }).ready
    ).toBe(false);
  });
});

describe('Phase 9C persistent controls and isolation', () => {
  it('uses the next additive migration and registers both safe-boot lists', () => {
    expect(migration).toContain('project_shipping_reviews');
    expect(migration).toContain('project_shipment_authorizations');
    expect(migration).toContain('project_closeout_reviews');
    expect(
      safeBoot.match(/0225_p2_v2_shipping_project_closeout\.sql/g)
    ).toHaveLength(2);
  });

  it('links rather than duplicates authoritative Shipping systems', () => {
    expect(migration).toContain(
      'authoritative_shipment_id UUID REFERENCES shipment_records'
    );
    expect(service).toContain('INSERT INTO shipment_records');
    expect(service).toContain('UPDATE p2_serialized_items');
    expect(service).not.toContain('upsShipping');
  });

  it('fails closed for NULL, legacy, and unknown workflow versions', () => {
    expect(service).toContain('resolveProjectWorkflowVersion');
    expect(service).toContain("version !== 'p2_v2'");
    expect(service).toContain('UNKNOWN_WORKFLOW_VERSION');
    expect(service).toContain('P2_V2_REQUIRED');
  });

  it('keeps shipment confirmation separate from closeout', () => {
    const confirmStart = service.indexOf(
      'export async function confirmShipment'
    );
    const confirmEnd = service.indexOf('export type DeliveryInput');
    const confirmSource = service.slice(confirmStart, confirmEnd);
    expect(confirmSource).toContain('INSERT INTO shipment_records');
    expect(confirmSource).not.toContain("status='completed'");
    expect(confirmSource).not.toContain("status='CLOSED'");
    expect(confirmSource).toContain('projectClosed: false');
    expect(confirmSource).toContain('poClosed: false');
  });

  it('protects concurrency, idempotency, rollback, and double-shipment', () => {
    expect(service).toContain('pg_advisory_xact_lock');
    expect(service).toContain('IDEMPOTENCY_CONFLICT');
    expect(service).toContain('ALLOCATION_ALREADY_COMMITTED');
    expect(service).toContain('ALLOCATION_ALREADY_SHIPPED');
    expect(service).toContain('CERTIFICATION_FORCED_ROLLBACK');
    expect(migration).toContain('project_shipment_allocation_shipped_unique');
  });

  it('preserves void history and prevents physical shipment deletion semantics', () => {
    expect(service).toContain('voidShipmentAuthorization');
    expect(service).toContain('PHYSICAL_SHIPMENT_CANNOT_BE_VOIDED');
    expect(service).toContain("status='VOIDED'");
    expect(service).not.toContain(
      'DELETE FROM project_shipment_authorizations'
    );
  });

  it('requires proof beyond tracking and blocks delivery exceptions', () => {
    expect(service).toContain('PROOF_OF_DELIVERY_REQUIRED');
    expect(service).toContain('DELIVERY_EXCEPTION');
    expect(service).toContain('deliveryExceptions');
  });

  it('requires functional closeout approvals and segregation of duties', () => {
    for (const approval of [
      'PROJECT_MANAGEMENT',
      'QUALITY',
      'OPERATIONS',
      'SHIPPING_LOGISTICS',
    ])
      expect(service).toContain(approval);
    expect(service).toContain('SEGREGATION_OF_DUTIES_REQUIRED');
    expect(migration).toContain('project_closeout_approval_actor_unique');
  });

  it('freezes closure and preserves controlled reopen history', () => {
    expect(migration).toContain('protect_closed_project_closeout');
    expect(service).toContain('project_closeout_events');
    expect(service).toContain('P2_V2_PROJECT_REOPENED');
    expect(service).toContain('shippedAllocationsReopened: false');
  });

  it('exposes authenticated V2-only routes with clear action coverage', () => {
    for (const action of [
      'shipping/readiness',
      'shipping/reviews',
      'shipping/authorize',
      '/confirm',
      '/delivery',
      'shipping/holds',
      '/void',
      'closeout/reviews',
      'closeout/recalculate',
      'closeout/submit',
      'closeout/decisions',
      'closeout/close',
      'closeout/reopen',
      '/history',
    ])
      expect(routes).toContain(action);
    expect(routes).toContain('getUserPermissions');
    expect(routes).toContain('FORBIDDEN');
  });

  it('does not touch Design Control or enable Production Launch', () => {
    expect(migration).not.toMatch(/design_control|design_projects|ecr|ecn/i);
    expect(service).not.toContain('P2_V2_PRODUCTION_LAUNCH_ENABLED');
  });
});

describe('Phase 9C interface completeness', () => {
  it('states all three controlled action boundaries', () => {
    expect(ui).toContain('Product Release is required before Shipping');
    expect(ui).toContain('Shipment does not');
    expect(ui).toContain('Project Closing is a separate');
  });

  it.each([
    'Verify packaging and readiness',
    'Authorize Shipment',
    'Confirm Shipment',
    'Confirm Delivery',
    'Record delivery exception',
    'Place Shipping hold',
    'Immutable shipment history',
    'Recalculate closeout readiness',
    'Submit closeout review',
    'Approve',
    'Reject',
    'Close Project',
    'Controlled Reopen',
  ])('provides the %s control', (label) => {
    expect(ui).toContain(label);
  });
});
