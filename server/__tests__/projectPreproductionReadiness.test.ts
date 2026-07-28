import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertProductionCountsMatchPlan,
  checklistBlockers,
  plannedProductionCounts,
  requiredPreproductionRoles,
  resolveFirstProductionDepartment,
} from '../src/services/projectPreproductionRules';

describe('P2 V2 Preproduction Readiness rules', () => {
  it('accepts satisfied applicable items and does not require irrelevant items', () => {
    expect(
      checklistBlockers([
        {
          key: 'routing',
          category: 'Manufacturing planning',
          label: 'Approved routing',
          applicability: 'REQUIRED',
          satisfied: true,
        },
        {
          key: 'cnc',
          category: 'Manufacturing planning',
          label: 'CNC program',
          applicability: 'NOT_REQUIRED',
          satisfied: false,
        },
      ])
    ).toEqual([]);
  });

  it('blocks unsatisfied required items', () => {
    expect(
      checklistBlockers([
        {
          key: 'inspection',
          category: 'Quality planning',
          label: 'Inspection points defined',
          applicability: 'REQUIRED',
          satisfied: false,
        },
      ])
    ).toEqual(['Quality planning: Inspection points defined']);
  });

  it('requires approved justification for not-applicable decisions', () => {
    const item = {
      key: 'fai',
      category: 'Quality planning',
      label: 'FAI',
      applicability: 'NOT_APPLICABLE' as const,
      satisfied: false,
    };
    expect(checklistBlockers([item])).toHaveLength(1);
    expect(
      checklistBlockers([
        {
          ...item,
          justification: 'Repeat production; no FAI trigger applies.',
          approvedJustification: true,
        },
      ])
    ).toEqual([]);
  });

  it.each([
    ['risks-controlled', 'Applicable risks have owners and controls'],
    [
      'qualified-resources',
      'Required employee qualifications and calibrated equipment are current',
    ],
    [
      'safety-controls',
      'Applicable safety, FOD, and environmental controls are identified',
    ],
  ])(
    'keeps manually evidenced requirement %s fail-closed by default',
    (key, label) => {
      const item = {
        key,
        category: 'Safety gate',
        label,
        applicability: 'REQUIRED' as const,
        satisfied: false,
      };
      expect(checklistBlockers([item])).toEqual([`Safety gate: ${label}`]);
    }
  );

  it('always requires four independent core functions', () => {
    expect(
      requiredPreproductionRoles({
        supply_chain_required: false,
        finance_required: false,
      })
    ).toEqual(['PROJECT_MANAGEMENT', 'ENGINEERING', 'QUALITY', 'OPERATIONS']);
  });

  it('adds conditional Supply Chain and Finance approvals', () => {
    expect(
      requiredPreproductionRoles({
        supply_chain_required: true,
        finance_required: true,
      })
    ).toEqual([
      'PROJECT_MANAGEMENT',
      'ENGINEERING',
      'QUALITY',
      'OPERATIONS',
      'SUPPLY_CHAIN',
      'FINANCE',
    ]);
  });

  it('routes assembly-first parts to Assembly', () => {
    expect(
      resolveFirstProductionDepartment(['Assembly', 'Quality'], true)
    ).toBe('Assembly');
  });

  it('fails closed when routing is absent or ambiguous', () => {
    expect(resolveFirstProductionDepartment([], false)).toBeNull();
    expect(resolveFirstProductionDepartment([], true)).toBeNull();
  });

  it.each([
    [['Layup', 'Quality'], 'Layup'],
    [['CNC', 'Quality'], 'CNC'],
    [['Cutting / Kitting', 'Layup'], 'Cutting Table'],
    [['Kitting', 'Assembly'], 'Cutting Table'],
  ])(
    'resolves canonical first departments from released routing',
    (sequence, expected) => {
      expect(resolveFirstProductionDepartment(sequence, true)).toBe(expected);
    }
  );

  it('aggregates multi-level manufactured quantities and excludes purchased items upstream', () => {
    const counts = plannedProductionCounts([
      {
        part_number: 'ASM-1',
        extended_project_quantity: '2',
        routing_id: 'route-assembly',
        routing_release_status: 'RELEASED',
        department_sequence: ['Assembly', 'Quality'],
      },
      {
        part_number: 'SUB-1',
        extended_project_quantity: '4',
        routing_id: 'route-cnc',
        routing_release_status: 'RELEASED',
        department_sequence: ['CNC', 'Quality'],
      },
      {
        part_number: 'SUB-1',
        extended_project_quantity: '2',
        routing_id: 'route-cnc',
        routing_release_status: 'RELEASED',
        department_sequence: ['CNC', 'Quality'],
      },
    ]);
    expect(Object.fromEntries(counts)).toEqual({ 'ASM-1': 2, 'SUB-1': 6 });
  });

  it.each([
    [
      {
        routing_id: null,
        routing_release_status: 'MISSING',
        department_sequence: [],
      },
    ],
    [
      {
        routing_id: 'r1',
        routing_release_status: 'INACTIVE',
        department_sequence: ['CNC'],
      },
    ],
    [
      {
        routing_id: 'r1',
        routing_release_status: 'RELEASED',
        department_sequence: [],
      },
    ],
  ])('blocks missing, obsolete, or ambiguous routing baselines', (routing) => {
    expect(() =>
      plannedProductionCounts([
        {
          part_number: 'MAKE-1',
          extended_project_quantity: 1,
          ...routing,
        },
      ])
    ).toThrow(/released routing baseline/i);
  });

  it('rejects partial, duplicate, omitted, and unplanned generated records', () => {
    const planned = new Map([
      ['ASM-1', 2],
      ['SUB-1', 1],
    ]);
    expect(() =>
      assertProductionCountsMatchPlan(planned, ['ASM-1', 'SUB-1'])
    ).toThrow(/ASM-1: planned 2, generated 1/);
    expect(() =>
      assertProductionCountsMatchPlan(planned, [
        'ASM-1',
        'ASM-1',
        'SUB-1',
        'EXTRA',
      ])
    ).toThrow(/EXTRA: planned 0, generated 1/);
    expect(() =>
      assertProductionCountsMatchPlan(planned, ['ASM-1', 'ASM-1', 'SUB-1'])
    ).not.toThrow();
  });
});

describe('Phase 8C integration safety contract', () => {
  const root = process.cwd();
  const service = fs.readFileSync(
    path.join(
      root,
      'server/src/services/projectPreproductionReadinessService.ts'
    ),
    'utf8'
  );
  const migration = fs.readFileSync(
    path.join(root, 'migrations/0212_project_preproduction_launch_safety.sql'),
    'utf8'
  );
  const baseMigration = fs.readFileSync(
    path.join(root, 'migrations/0210_project_preproduction_readiness.sql'),
    'utf8'
  );
  const storage = fs.readFileSync(path.join(root, 'server/storage.ts'), 'utf8');
  const route = fs.readFileSync(
    path.join(root, 'server/src/routes/projectPreproductionReadiness.ts'),
    'utf8'
  );

  it('keeps all V2 mutations fail-closed for legacy and unknown versions', () => {
    expect(service).toContain('resolveProjectWorkflowVersion');
    expect(service).toContain("if (version !== 'p2_v2')");
    expect(service).toContain("'UNKNOWN_WORKFLOW_VERSION'");
    expect(service).not.toContain('project_steps');
    expect(service).not.toMatch(/designControl|ECR|ECN/);
  });

  it('locks, revalidates, creates, activates Stage 8, and transitions inside one launch transaction', () => {
    const launch = service.slice(
      service.indexOf('async function launchProductionWithDependencies')
    );
    expect(launch.indexOf('isP2V2ProductionLaunchEnabled()')).toBeLessThan(
      launch.indexOf('db.transaction')
    );
    expect(launch).toContain('P2_V2_PRODUCTION_LAUNCH_BLOCKED');
    const transaction = launch.slice(
      launch.indexOf('db.transaction'),
      launch.indexOf("eventType: 'P2_V2_PRODUCTION_LAUNCH_FAILED'")
    );
    expect(transaction).toContain('pg_advisory_xact_lock');
    expect(transaction).toContain(
      "priorLaunch.idempotency_key === idempotencyKey"
    );
    expect(transaction).toContain("'PRODUCTION_ALREADY_LAUNCHED'");
    expect(transaction).toContain('validateRelease(projectId, tx)');
    expect(transaction).toContain('PREEXISTING_PRODUCTION_RECORDS');
    expect(transaction).toContain('PREEXISTING_SERIALIZED_RECORDS');
    expect(transaction).toContain('RELEASED_ROUTING_STALE');
    expect(transaction).toContain('FOR SHARE OF ppi,pr,pct');
    expect(transaction).toContain('assertProductionCountsMatchPlan');
    expect(transaction).toContain('storage.generateP2ProductionOrders(');
    expect(transaction).toContain(
      "() => dependencies.fault?.('AFTER_FIRST_PRODUCTION_ORDER')"
    );
    expect(transaction).toContain("step_type === 'production_quality'");
    expect(transaction).toContain("current_stage='IN_PRODUCTION'");
    expect(transaction).toContain('P2_V2_PRODUCTION_LAUNCHED');
    expect(launch).toMatch(
      /\}\s*catch \(error\) \{\s*try \{\s*await recordAuditEvent\(\{\s*eventType: 'P2_V2_PRODUCTION_LAUNCH_FAILED'/
    );
    expect(launch).toContain('idempotencyKeyPresent');
    expect(launch).not.toContain('idempotencyKey,\n          errorCode');
  });

  it('keeps Production Release non-consequential and enforces launch through the gated service', () => {
    const release = service.slice(
      service.indexOf('export async function approveProductionRelease'),
      service.indexOf('async function launchProductionWithDependencies')
    );
    expect(release).not.toContain('addP2SerializedItemsForPoItem');
    expect(release).not.toContain('generateP2ProductionOrders');
    expect(release).not.toContain("current_stage='IN_PRODUCTION'");
    expect(route).toMatch(
      /router\.post\('\/launch'[\s\S]*launchProduction\(projectId\(req\)/
    );
  });

  it('keeps authoritative generator reads and sequence allocation on the supplied transaction', () => {
    const generator = storage.slice(
      storage.indexOf('async generateP2ProductionOrders('),
      storage.indexOf('private normalizeP2SerialPrefix')
    );
    expect(generator).toContain('await dbClient');
    expect(generator).not.toContain('this.getP2PurchaseOrder(');
    expect(generator).not.toContain('this.getP2PurchaseOrderItems(');
    expect(generator).toContain('generateNextP2OrderIdsWithClient');
  });

  it('uses compatible composite identities and additive partial uniqueness', () => {
    expect(migration).toContain(
      'project_preproduction_readiness_id_project_unique'
    );
    expect(migration).toContain(
      'FOREIGN KEY (readiness_review_id, project_id)'
    );
    expect(migration).toContain(
      'FOREIGN KEY (production_release_id, project_id)'
    );
    expect(baseMigration).toContain(
      "WHERE status IN ('DRAFT','PENDING_APPROVAL','COMPLETE')"
    );
    expect(baseMigration).toContain("WHERE status='APPROVED'");
    expect(baseMigration).toContain("WHERE status='COMPLETE'");
    expect(migration).toContain('forward-only Phase 8C launch-safety correction');
    expect(migration).not.toMatch(/\bUPDATE\s+projects\b/i);
    expect(migration).not.toMatch(/\bINSERT\s+INTO\s+project_steps\b/i);
  });
});
