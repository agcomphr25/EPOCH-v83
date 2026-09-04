import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildP2ProductionMapProjection,
  computeProgramAssemblyRollups,
  type P2ProductionMapNodeInput,
  type ProgramAssemblyRollupInput,
  type ProgramBuildStatus,
} from '../src/lib/programManufacturingOrchestration';

const source = readFileSync(
  resolve(process.cwd(), 'server/src/lib/programManufacturingOrchestration.ts'),
  'utf8'
);
const routeSource = readFileSync(
  resolve(process.cwd(), 'server/src/routes/programManufacturing.ts'),
  'utf8'
);

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

const projectionBuild: ProgramBuildStatus['build'] = {
  id: 'p2-frozen-demand:baseline-1',
  projectId: 'project-1',
  projectCode: 'PRJ-001',
  projectName: 'Projection Project',
  p2PurchaseOrderId: 11,
  poNumber: 'PO-001',
  programCode: 'PRJ-001',
  programName: 'Projection Project',
  buildName: 'Projection Project - PO-001',
  buildType: 'p2_frozen_demand',
  status: 'RELEASED',
  priority: 50,
  targetShipDate: '2026-10-01',
  customerName: 'Projection Customer',
  notes: 'Read-through projection.',
};

function frozenNode(
  partial: Partial<P2ProductionMapNodeInput> &
    Pick<
      P2ProductionMapNodeInput,
      'id' | 'nodeIdentity' | 'assemblyPathIdentity'
    >
): P2ProductionMapNodeInput {
  return {
    parentNodeIdentity: null,
    depth: 0,
    inventoryItemSnapshot: { partNumber: partial.id, name: partial.id },
    itemClassification: 'MANUFACTURED_COMPONENT',
    makeBuyDisposition: 'MAKE',
    requiredGrossQuantity: 1,
    unitOfMeasure: 'EA',
    authorityId: null,
    productionWorkOrderId: null,
    workOrderNumber: null,
    authorityStatus: null,
    departmentId: null,
    departmentName: null,
    completedQuantity: null,
    authorityRequiredQuantity: null,
    travelerId: null,
    travelerNumber: null,
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

describe('P2 Production Map read-through projection', () => {
  it('renders the complete frozen-demand tree before work orders are materialized', () => {
    const status = buildP2ProductionMapProjection(
      projectionBuild,
      'baseline-1',
      [
        frozenNode({
          id: 'root-id',
          nodeIdentity: 'root-identity',
          assemblyPathIdentity: 'root',
          inventoryItemSnapshot: { partNumber: 'ROOT', name: 'Root Assembly' },
        }),
        frozenNode({
          id: 'child-id',
          nodeIdentity: 'child-identity',
          parentNodeIdentity: 'root-identity',
          assemblyPathIdentity: 'root/child',
          depth: 1,
          inventoryItemSnapshot: {
            partNumber: 'CHILD',
            name: 'Manufactured Child',
          },
        }),
        frozenNode({
          id: 'buy-id',
          nodeIdentity: 'buy-identity',
          parentNodeIdentity: 'root-identity',
          assemblyPathIdentity: 'root/buy',
          depth: 1,
          inventoryItemSnapshot: { partNumber: 'BUY', name: 'Purchased Child' },
          itemClassification: 'PURCHASED_COMPONENT',
          makeBuyDisposition: 'BUY',
        }),
      ],
      []
    );

    expect(status.summary).toMatchObject({
      totalAssemblies: 3,
      totalQueueItems: 0,
      completionPercent: 0,
    });
    expect(status.assemblies).toHaveLength(1);
    expect(
      status.assemblies[0].children.map((child) => child.partNumber)
    ).toEqual(['CHILD', 'BUY']);
    expect(status.flatAssemblies.every((node) => node.links.length === 0)).toBe(
      true
    );
    expect(
      status.flatAssemblies.find((node) => node.id === 'buy-id')?.metadata
        .swimlane
    ).toBe('Purchasing');
  });

  it('attaches P2 authority links and applies only open quantity dependencies as blockers', () => {
    const status = buildP2ProductionMapProjection(
      projectionBuild,
      'baseline-1',
      [
        frozenNode({
          id: 'root-id',
          nodeIdentity: 'root-identity',
          assemblyPathIdentity: 'root',
          authorityId: 'root-authority',
          productionWorkOrderId: 'root-work-order',
          workOrderNumber: 'WO-ROOT',
          authorityStatus: 'READY',
          departmentId: 7,
          departmentName: 'Assembly',
          completedQuantity: 0,
          authorityRequiredQuantity: 2,
        }),
        frozenNode({
          id: 'child-id',
          nodeIdentity: 'child-identity',
          parentNodeIdentity: 'root-identity',
          assemblyPathIdentity: 'root/child',
          depth: 1,
          authorityId: 'child-authority',
          productionWorkOrderId: 'child-work-order',
          workOrderNumber: 'WO-CHILD',
          authorityStatus: 'IN_PROGRESS',
          departmentId: 4,
          departmentName: 'CNC',
          completedQuantity: 1,
          authorityRequiredQuantity: 2,
          travelerId: 'traveler-1',
          travelerNumber: 'TRAV-1',
        }),
      ],
      [
        {
          predecessorNodeId: 'child-id',
          successorNodeId: 'root-id',
          dependencyType: 'COMPLETE',
          requiredQuantity: 2,
          satisfiedQuantity: 1,
          status: 'OPEN',
        },
      ]
    );

    const root = status.flatAssemblies.find((node) => node.id === 'root-id');
    const child = status.flatAssemblies.find((node) => node.id === 'child-id');
    expect(root?.computedStatus).toBe('BLOCKED');
    expect(root?.blockedBy[0]).toMatchObject({
      assemblyId: 'child-id',
      dependencyType: 'COMPLETE',
    });
    expect(child?.links[0]).toMatchObject({
      id: 'child-authority',
      linkType: 'p2_work_order_authority',
      p2WorkOrderAuthorityId: 'child-authority',
      projectId: 'project-1',
      productionWorkOrderId: 'child-work-order',
      departmentId: 4,
      department: 'CNC',
      status: 'IN_PROGRESS',
      completedQuantity: 1,
      requiredQuantity: 2,
    });
  });

  it('rolls purchasing material satisfaction into completion and parent blockers', () => {
    const status = buildP2ProductionMapProjection(
      projectionBuild,
      'baseline-1',
      [
        frozenNode({
          id: 'root-id',
          nodeIdentity: 'root-identity',
          assemblyPathIdentity: 'root',
          authorityId: 'root-authority',
          authorityStatus: 'READY',
          authorityRequiredQuantity: 2,
        }),
        frozenNode({
          id: 'buy-id',
          nodeIdentity: 'buy-identity',
          parentNodeIdentity: 'root-identity',
          assemblyPathIdentity: 'root/buy',
          depth: 1,
          makeBuyDisposition: 'BUY',
          itemClassification: 'PURCHASED_COMPONENT',
          materialRequirementId: 'material-1',
          materialRequirementStatus: 'OPEN',
          materialRequiredQuantity: 2,
          materialAcceptedQuantity: 1,
          materialIssuedQuantity: 1,
        }),
      ],
      [
        {
          predecessorNodeId: 'buy-id',
          successorNodeId: 'root-id',
          dependencyType: 'MATERIAL',
          requiredQuantity: 2,
          satisfiedQuantity: 1,
          status: 'OPEN',
        },
      ]
    );

    const root = status.flatAssemblies.find((node) => node.id === 'root-id');
    const material = status.flatAssemblies.find((node) => node.id === 'buy-id');
    expect(root?.computedStatus).toBe('BLOCKED');
    expect(material?.completionPercent).toBe(50);
    expect(material?.links[0]).toMatchObject({
      id: 'material-1',
      linkType: 'material_requirement',
      completedQuantity: 1,
      requiredQuantity: 2,
    });

    const complete = buildP2ProductionMapProjection(
      projectionBuild,
      'baseline-1',
      [
        frozenNode({
          id: 'buy-id',
          nodeIdentity: 'buy-identity',
          assemblyPathIdentity: 'root/buy',
          makeBuyDisposition: 'BUY',
          materialRequirementId: 'material-1',
          materialRequirementStatus: 'SATISFIED',
          materialRequiredQuantity: 2,
          materialAcceptedQuantity: 2,
          materialIssuedQuantity: 2,
        }),
      ],
      []
    );
    expect(complete.summary.completionPercent).toBe(100);
    expect(complete.summary.shipReady).toBe(true);
  });

  it('falls back only to released frozen demand and never persists a program mirror', () => {
    expect(source).toContain("b.status = 'RELEASED'");
    expect(source).toContain('FROM p2_frozen_production_demand_nodes n');
    expect(source).toContain(
      'LEFT JOIN p2_manufacturing_work_order_authorities a'
    );
    expect(source).toContain(
      'FROM p2_manufacturing_work_order_dependencies dependency'
    );
    expect(source).toContain(
      'FROM p2_manufacturing_work_order_material_requirements material'
    );
    expect(source).toContain('getP2ProductionMapStatus(filters.projectId)');
    expect(routeSource).toContain("if (!ready && !projectId)");
    expect(routeSource).toContain(
      'await getProgramBuildStatus(null, { projectId: req.params.projectId })'
    );
    expect(source).not.toMatch(
      /INSERT INTO program_(?:builds|assemblies|assembly_links)/
    );
    expect(source).not.toMatch(
      /UPDATE program_(?:builds|assemblies|assembly_links)/
    );
  });
});
