/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'crypto';

export const SPEC_SHEET_LIFECYCLE = [
  'DRAFT',
  'IN_REVIEW',
  'RELEASED',
  'SUPERSEDED',
  'OBSOLETE',
] as const;
export const SPEC_SHEET_TABLE_TYPES = new Set([
  'repeatable_table',
  'qc_standards_table',
  'cnc_operations_table',
  'inventory_items_table',
  'controlled_document_references',
  'approval_block',
]);
export const REQUIRED_SPEC_APPROVALS = [
  'ENGINEERING',
  'QUALITY',
  'PRODUCTION',
] as const;

export type TableColumn = {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'boolean' | 'reference';
  width?: number;
  required?: boolean;
};

export type SpecTemplateField = {
  fieldName: string;
  fieldLabel: string;
  fieldType: string;
  sectionName?: string | null;
  isRequired?: boolean;
  columns?: TableColumn[];
  minimumRows?: number | null;
  maximumRows?: number | null;
  allowManualRows?: boolean;
  allowImport?: boolean;
  dataSource?: Record<string, unknown> | null;
  validationRules?: Record<string, unknown> | null;
  sortOrder?: number;
  pdfLayout?: Record<string, unknown> | null;
};

export const QC_STANDARD_COLUMNS: TableColumn[] = [
  {
    key: 'standard',
    label: 'Characteristic / Standard',
    required: true,
    width: 1.8,
  },
  { key: 'requirement', label: 'Requirement / Nominal', width: 1.4 },
  { key: 'tolerance', label: 'Tolerance', width: 0.8 },
  { key: 'lowerLimit', label: 'Lower', type: 'number', width: 0.65 },
  { key: 'upperLimit', label: 'Upper', type: 'number', width: 0.65 },
  { key: 'unit', label: 'Unit', width: 0.55 },
  { key: 'inspectionMethod', label: 'Method', width: 1.1 },
  { key: 'measurementEquipment', label: 'Gage', width: 0.9 },
  { key: 'inspectionPhase', label: 'Phase', width: 0.65 },
  {
    key: 'inspectionCoveragePercent',
    label: 'Coverage %',
    type: 'number',
    width: 0.65,
  },
  { key: 'sampleSize', label: 'Sample', width: 0.65 },
  { key: 'acceptanceNumber', label: 'Ac', type: 'number', width: 0.4 },
  { key: 'rejectionNumber', label: 'Re', type: 'number', width: 0.4 },
  { key: 'hardQcStop', label: 'Hard Stop', type: 'boolean', width: 0.55 },
  { key: 'keyCharacteristic', label: 'Key', type: 'boolean', width: 0.4 },
  {
    key: 'productSafetyCharacteristic',
    label: 'Safety',
    type: 'boolean',
    width: 0.5,
  },
  { key: 'referenceLink', label: 'Reference', type: 'reference', width: 1.0 },
  { key: 'notes', label: 'Notes', width: 1.0 },
];

export const CNC_OPERATION_COLUMNS: TableColumn[] = [
  { key: 'stepNumber', label: 'Seq', type: 'number', width: 0.4 },
  { key: 'departmentName', label: 'Department', width: 0.8 },
  { key: 'operationName', label: 'Operation', required: true, width: 1.25 },
  { key: 'operationType', label: 'Type', width: 0.65 },
  { key: 'workCenter', label: 'Work Center', width: 0.75 },
  { key: 'programId', label: 'Program ID', width: 0.65 },
  { key: 'programName', label: 'Program', width: 0.9 },
  { key: 'programRevision', label: 'Program Rev', width: 0.55 },
  { key: 'machineClass', label: 'Machine Class', width: 0.8 },
  { key: 'preferredMachine', label: 'Preferred Machine', width: 0.85 },
  { key: 'fixture', label: 'Fixture', width: 0.75 },
  {
    key: 'estimatedSetupMinutes',
    label: 'Setup Min',
    type: 'number',
    width: 0.55,
  },
  {
    key: 'estimatedCycleMinutes',
    label: 'Cycle Min',
    type: 'number',
    width: 0.55,
  },
  { key: 'proveOutRequired', label: 'Prove Out', type: 'boolean', width: 0.5 },
  { key: 'requiresCertification', label: 'Cert', type: 'boolean', width: 0.45 },
  { key: 'requiresSignature', label: 'Sign', type: 'boolean', width: 0.45 },
  { key: 'isOutsideProcess', label: 'OSP', type: 'boolean', width: 0.4 },
  { key: 'linkedWorkInstruction', label: 'Work Instruction', width: 0.9 },
  { key: 'notes', label: 'Notes', width: 0.9 },
];

export const INVENTORY_ITEM_COLUMNS: TableColumn[] = [
  {
    key: 'quantity',
    label: 'Qty',
    type: 'number',
    required: true,
    width: 0.45,
  },
  {
    key: 'inventoryItemId',
    label: 'Inventory ID',
    type: 'reference',
    width: 0.65,
  },
  { key: 'partNumber', label: 'Part Number', width: 0.9 },
  { key: 'description', label: 'Description', required: true, width: 1.8 },
  { key: 'materialSpecification', label: 'Material Specification', width: 1.2 },
  { key: 'unitOfMeasure', label: 'UOM', width: 0.5 },
  {
    key: 'lotTraceabilityRequired',
    label: 'Lot / Heat / Batch',
    type: 'boolean',
    width: 0.7,
  },
  { key: 'cocRequired', label: 'CoC', type: 'boolean', width: 0.45 },
  {
    key: 'materialCertificationRequired',
    label: 'Material Cert',
    type: 'boolean',
    width: 0.65,
  },
  {
    key: 'shelfLifeControlled',
    label: 'Shelf Life',
    type: 'boolean',
    width: 0.6,
  },
  { key: 'notes', label: 'Notes', width: 1.0 },
];

const section = (name: string, order: number, requiredControl = false) => ({
  name,
  order,
  enabled: true,
  requiredControl,
});

export const PART_SPECIFICATION_TEMPLATE_SEED = {
  templateType: 'spec_sheet',
  templateRevision: '1.0',
  sections: [
    section('Specification Header', 1, true),
    section('Applicable Documents', 2, true),
    section('Materials and Components', 3),
    section('Consumables', 4),
    section('Tools and Equipment', 5),
    section('CNC Operations', 6),
    section('In-Process Verification', 7),
    section('Additional/Special Processes', 8),
    section('Sampling Requirements', 9),
    section('QC Standards', 10),
    section('Traceability and Required Records', 11),
    section('Preservation and Packaging', 12),
    section('Approval Block', 13, true),
  ],
};

export function calculateQcLimits(row: Record<string, any>) {
  if (
    row.lowerLimit !== '' &&
    row.lowerLimit != null &&
    row.upperLimit !== '' &&
    row.upperLimit != null
  )
    return row;
  const nominal = Number(row.requirement);
  const tolerance = Number(
    String(row.tolerance ?? '')
      .replace(/^\+\/-/, '')
      .replace(/^±/, '')
  );
  if (!Number.isFinite(nominal) || !Number.isFinite(tolerance)) return row;
  return {
    ...row,
    lowerLimit: nominal - tolerance,
    upperLimit: nominal + tolerance,
  };
}

export function validateQcRows(rows: Record<string, any>[]) {
  const errors: string[] = [];
  rows.forEach((raw, index) => {
    const row = calculateQcLimits(raw);
    const hasRequirementTolerance =
      Boolean(String(row.requirement ?? '').trim()) &&
      Boolean(String(row.tolerance ?? '').trim());
    const hasLimits =
      row.lowerLimit !== '' &&
      row.lowerLimit != null &&
      row.upperLimit !== '' &&
      row.upperLimit != null;
    const passFail = /pass\s*\/?\s*fail|go\s*\/?\s*no-?go|visual/i.test(
      String(row.requirement ?? '')
    );
    const hasReference = Boolean(String(row.referenceLink ?? '').trim());
    if (!hasRequirementTolerance && !hasLimits && !passFail && !hasReference) {
      errors.push(
        `QC row ${index + 1} requires acceptance criteria or a controlled reference`
      );
    }
    if (
      /^[a-z ]+\s*(?:±|\+\/-)\s*(?:\d|\.\d)/i.test(
        String(row.standard ?? '')
      ) &&
      !hasReference &&
      !String(row.requirement ?? '').trim()
    ) {
      errors.push(
        `QC row ${index + 1} uses a vague tolerance without a nominal or drawing/datum reference`
      );
    }
  });
  return errors;
}

export function canonicalSnapshot(value: unknown): string {
  const stable = (input: any): any => {
    if (Array.isArray(input)) return input.map(stable);
    if (input && typeof input === 'object') {
      return Object.keys(input)
        .sort()
        .reduce(
          (out, key) => {
            out[key] = stable(input[key]);
            return out;
          },
          {} as Record<string, unknown>
        );
    }
    return input;
  };
  return JSON.stringify(stable(value));
}

export function checksumSnapshot(value: unknown) {
  return createHash('sha256').update(canonicalSnapshot(value)).digest('hex');
}

const SOURCE_ID_KEYS = [
  'sourceRoutingQcIdentifier',
  'sourceRoutingOperationId',
  'sourceCncOperationId',
  'programId',
] as const;

function sourceRowIdentity(row: Record<string, any>): string | null {
  for (const key of SOURCE_ID_KEYS) {
    if (row[key] != null && String(row[key]).trim()) {
      return `${key}:${String(row[key]).trim()}`;
    }
  }
  return null;
}

export function compareSpecSourceRows(
  capturedRows: Record<string, any>[],
  currentRows: Record<string, any>[]
) {
  const currentBySource = new Map(
    currentRows
      .map((row) => [sourceRowIdentity(row), row] as const)
      .filter((entry): entry is readonly [string, Record<string, any>] => Boolean(entry[0]))
  );
  const changes: Array<{
    sourceIdentity: string;
    status: 'CHANGED' | 'REMOVED';
    captured: Record<string, any>;
    current: Record<string, any> | null;
  }> = [];
  for (const captured of capturedRows) {
    if (captured.manuallyEntered === true) continue;
    const identity = sourceRowIdentity(captured);
    if (!identity) continue;
    const current = currentBySource.get(identity) || null;
    if (!current) {
      changes.push({
        sourceIdentity: identity,
        status: 'REMOVED',
        captured,
        current,
      });
    } else if (canonicalSnapshot(captured) !== canonicalSnapshot(current)) {
      changes.push({
        sourceIdentity: identity,
        status: 'CHANGED',
        captured,
        current,
      });
    }
  }
  return {
    status: changes.length ? ('REVIEW_REQUIRED' as const) : ('CURRENT' as const),
    changes,
  };
}

export function refreshSpecSourceRowsPreservingManual(
  capturedRows: Record<string, any>[],
  currentRows: Record<string, any>[]
) {
  const manualRows = capturedRows.filter((row) => row.manuallyEntered === true);
  return [
    ...currentRows.map((row) => ({ ...row, manuallyEntered: false })),
    ...manualRows,
  ];
}
