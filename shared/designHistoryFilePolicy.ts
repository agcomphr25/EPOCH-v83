export const DHF_MANIFEST_SCHEMA_VERSION = 'epoch-dhf-manifest/v1';
export type DhfRequirement =
  | 'REQUIRED'
  | 'CONDITIONALLY_REQUIRED'
  | 'OPTIONAL'
  | 'NOT_APPLICABLE_WITH_JUSTIFICATION';

export type DhfPolicyItem = {
  key: string;
  category: string;
  title: string;
  requirement: DhfRequirement;
  revisionA: boolean;
  revisionBPlus: boolean;
};

export const DESIGN_HISTORY_FILE_POLICY: readonly DhfPolicyItem[] = [
  [
    'project_identity',
    '01-Project-and-Planning',
    'R&D project identity and authoritative Design Control record',
    'REQUIRED',
    true,
    true,
  ],
  [
    'project_intake',
    '01-Project-and-Planning',
    'Project intake, planning, responsibilities, milestones, and tailoring',
    'REQUIRED',
    true,
    false,
  ],
  [
    'design_inputs',
    '02-Design-Inputs',
    'Approved requirements and traceability',
    'REQUIRED',
    true,
    true,
  ],
  [
    'risk',
    '03-Risk',
    'Risk controls and residual-risk acceptance',
    'REQUIRED',
    true,
    true,
  ],
  [
    'reviews',
    '04-Design-Reviews',
    'Design reviews, actions, closures, and authenticated approvals',
    'REQUIRED',
    true,
    true,
  ],
  [
    'outputs',
    '05-Design-Outputs',
    'Released drawings, CAD, specifications, BOM, software, and acceptance criteria',
    'REQUIRED',
    true,
    true,
  ],
  [
    'prototype',
    '06-Prototype',
    'Prototype and build evidence',
    'CONDITIONALLY_REQUIRED',
    true,
    true,
  ],
  [
    'verification',
    '07-Verification',
    'Verification plans, results, failures, and approvals',
    'REQUIRED',
    true,
    true,
  ],
  [
    'validation',
    '08-Validation',
    'Validation plans, results, failures, independence, and approvals',
    'REQUIRED',
    true,
    true,
  ],
  [
    'controlled_forms',
    '09-Release',
    'Approved controlled Project Form Instances and exact template revisions',
    'REQUIRED',
    true,
    true,
  ],
  [
    'engineering_release',
    '09-Release',
    'Engineering Release, gate, immutable baseline, and approvals',
    'REQUIRED',
    true,
    true,
  ],
  [
    'change_control',
    '10-ECR-ECN-Changes',
    'Approved ECR, completed ECN, effectivity, and implementation evidence',
    'CONDITIONALLY_REQUIRED',
    false,
    true,
  ],
  [
    'audit',
    '11-Approvals-and-Audit',
    'Approval, audit-chain, document lifecycle, and material controlled-copy exceptions',
    'REQUIRED',
    true,
    true,
  ],
  [
    'engineering_package',
    '12-Engineering-Package',
    'Locked Engineering Package and package checksum',
    'REQUIRED',
    true,
    true,
  ],
].map(([key, category, title, requirement, revisionA, revisionBPlus]) => ({
  key: String(key),
  category: String(category),
  title: String(title),
  requirement: requirement as DhfRequirement,
  revisionA: Boolean(revisionA),
  revisionBPlus: Boolean(revisionBPlus),
}));

export function policyForRelease(sequence: number) {
  return DESIGN_HISTORY_FILE_POLICY.filter((item) =>
    sequence === 1 ? item.revisionA : item.revisionBPlus
  );
}
