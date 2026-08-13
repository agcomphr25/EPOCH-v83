import { describe, expect, it } from 'vitest';

import { chooseP2ScheduleRouting } from '../src/routes/p2ScheduleItems';

const item = {
  id: 'item-1',
  poId: 20,
  poItemId: 200,
  partNumber: '26247',
  partRoutingId: null,
};

const routing = (
  id: string,
  inventoryItemId: string,
  partNumber: string,
  departmentSequence: string[]
) => ({
  id,
  inventoryItemId,
  partNumber,
  routingRevision: 1,
  departmentSequence,
});

describe('P2 schedule routing resolution', () => {
  it('routes the heated-pitot assembly to assembly instead of Layup', () => {
    expect(
      chooseP2ScheduleRouting(item, 26247, [
        routing('assembly-routing', '26247', '26247', [
          'Assemble/Disassembly',
          'QC/Shipping',
        ]),
      ])
    ).toEqual({
      routingId: 'assembly-routing',
      routingRevision: 1,
      firstDepartment: 'Assemble/Disassembly',
    });
  });

  it('routes manufactured children to CNC from their inventory identity', () => {
    expect(
      chooseP2ScheduleRouting(
        { ...item, partNumber: 'customer-body-alias' },
        26246,
        [routing('body-routing', '26246', '26246', ['CNC'])]
      )?.firstDepartment
    ).toBe('CNC');
  });

  it('fails closed when routing is missing or ambiguous', () => {
    expect(chooseP2ScheduleRouting(item, 26247, [])).toBeNull();
    expect(
      chooseP2ScheduleRouting(item, 26247, [
        routing('routing-a', '26247', '26247', ['Assemble/Disassembly']),
        routing('routing-b', '26247', '26247', ['CNC']),
      ])
    ).toBeNull();
  });

  it('fails closed when a controlled routing has no departments', () => {
    expect(
      chooseP2ScheduleRouting(item, 26247, [
        routing('empty-routing', '26247', '26247', []),
      ])
    ).toBeNull();
  });
});
