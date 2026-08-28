import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({ pool: { query: vi.fn() } }));
import { buildTree, matchesStatus, rollup, workOrderReadiness } from '../src/services/dailyTagUpService';

describe('Daily Tag Up read model calculations', () => {
  it('rolls department totals only from its actual work-order children', () => {
    const workOrders = [
      { required: 10, complete: 4, inProgress: 6, needed: 6, dueDate: '2026-08-29', readiness: { state: 'IN PROGRESS' } },
      { required: 5, complete: 5, inProgress: 0, needed: 0, dueDate: '2026-08-30', readiness: { state: 'COMPLETE' } },
    ];
    const result = rollup('CNC', workOrders);
    expect(result).toMatchObject({ required: 15, complete: 9, inProgress: 6, needed: 6, blocked: 0, nextDue: '2026-08-29' });
    expect(result.workOrders).toBe(workOrders);
  });

  it('uses existing dependency, material, traveler, and lifecycle signals for readiness', () => {
    expect(workOrderReadiness({ status: 'PLANNED', child_blocker_count: 1 })).toMatchObject({ state: 'NOT READY — WAITING ON UPSTREAM' });
    expect(workOrderReadiness({ status: 'READY', material_blocker_count: 1 })).toMatchObject({ state: 'BLOCKED' });
    expect(workOrderReadiness({ status: 'READY', traveler_requirement: 'REQUIRED', traveler_id: null })).toMatchObject({ state: 'BLOCKED', reason: 'Required traveler has not been provisioned' });
    expect(workOrderReadiness({ status: 'READY', traveler_requirement: 'NOT_REQUIRED_APPROVED' })).toEqual({ state: 'READY', reason: null });
    expect(workOrderReadiness({ status: 'CANCELLED' })).toEqual({
      state: 'BLOCKED',
      reason: 'Current released demand has a cancelled work order',
    });
  });

  it('builds the assembly hierarchy from frozen node identities without synthesizing nodes', () => {
    const nodes = [
      { id: 'root', nodeIdentity: 'A', parentNodeIdentity: null },
      { id: 'child', nodeIdentity: 'B', parentNodeIdentity: 'A' },
    ];
    const tree = buildTree(nodes);
    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((node: any) => node.id)).toEqual(['child']);
  });

  it('filters needed, ready, blocked, and complete from authoritative status/readiness', () => {
    expect(matchesStatus({ status: 'PLANNED', readiness: { state: 'NEEDED / NOT STARTED' } }, 'needed')).toBe(true);
    expect(matchesStatus({ status: 'READY', readiness: { state: 'READY' } }, 'ready')).toBe(true);
    expect(matchesStatus({ status: 'HOLD', readiness: { state: 'BLOCKED' } }, 'blocked')).toBe(true);
    expect(matchesStatus({ status: 'COMPLETE', readiness: { state: 'COMPLETE' } }, 'complete')).toBe(true);
  });
});
