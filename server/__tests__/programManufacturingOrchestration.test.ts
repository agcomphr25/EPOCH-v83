import { describe, expect, it } from 'vitest';
import { computeProgramAssemblyRollups, type ProgramAssemblyRollupInput } from '../src/lib/programManufacturingOrchestration';

function assembly(partial: Partial<ProgramAssemblyRollupInput> & { id: string; assemblyCode: string }): ProgramAssemblyRollupInput {
  return {
    parentAssemblyId: null,
    assemblyName: partial.assemblyCode,
    level: 0,
    sequence: 0,
    assemblyType: 'assembly',
    partNumber: null,
    status: 'PLANNED',
    requiredQuantity: 1,
    targetShipDate: null,
    metadata: {},
    links: [],
    ...partial,
  };
}

describe('program manufacturing rollups', () => {
  it('blocks an assembly until its required child dependency is complete', () => {
    const roots = computeProgramAssemblyRollups(
      [
        assembly({
          id: 'final',
          assemblyCode: 'FINAL',
          status: 'READY',
        }),
        assembly({
          id: 'wing',
          assemblyCode: 'WING',
          status: 'IN_PROGRESS',
          links: [{
            id: 'queue-link',
            linkType: 'queue_item',
            manufacturingQueueId: 44,
            productionWorkOrderId: null,
            travelerId: null,
            p2SerializedItemId: null,
            label: 'MQ-44',
            department: 'Layup',
            status: 'IN_PROGRESS',
            completedQuantity: 0,
            requiredQuantity: 1,
          }],
        }),
      ],
      [{
        assemblyId: 'final',
        dependsOnAssemblyId: 'wing',
        dependencyType: 'finish_to_start',
        isBlocking: true,
        notes: 'Final assembly waits on wing.',
      }],
    );

    const finalAssembly = roots.find((item) => item.id === 'final');
    expect(finalAssembly?.computedStatus).toBe('BLOCKED');
    expect(finalAssembly?.blockedBy[0].assemblyCode).toBe('WING');
  });

  it('rolls completed queue links into complete parent progress', () => {
    const roots = computeProgramAssemblyRollups(
      [
        assembly({
          id: 'airframe',
          assemblyCode: 'AIRFRAME',
        }),
        assembly({
          id: 'left-wing',
          parentAssemblyId: 'airframe',
          assemblyCode: 'WING-L',
          status: 'COMPLETE',
          links: [{
            id: 'traveler-link',
            linkType: 'traveler',
            manufacturingQueueId: null,
            productionWorkOrderId: null,
            travelerId: 'trav-1',
            p2SerializedItemId: null,
            label: 'TRAV-1',
            department: 'Final QC',
            status: 'COMPLETED',
            completedQuantity: 1,
            requiredQuantity: 1,
          }],
        }),
      ],
      [],
    );

    expect(roots[0].completionPercent).toBe(100);
    expect(roots[0].computedStatus).toBe('COMPLETE');
    expect(roots[0].totalQueueItems).toBe(1);
    expect(roots[0].completedQueueItems).toBe(1);
  });
});
