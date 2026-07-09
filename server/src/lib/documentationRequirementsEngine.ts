export type DocumentationRequirementState = 'required' | 'optional' | 'notRequired';

export type InspectionStrategy = 'FULL' | 'SAMPLING' | 'MIXED' | 'FINAL_ONLY';

export type DocumentationPackageKey =
  | 'routing'
  | 'traveler'
  | 'inspectionSheet'
  | 'samplingPlan'
  | 'fai'
  | 'workInstruction'
  | 'cncSetupSheet'
  | 'materialCutSheet'
  | 'layupRecord'
  | 'cureRecord'
  | 'assemblyChecklist'
  | 'testReport'
  | 'packagingChecklist'
  | 'certificatePackage';

export type DocumentationPackage = Record<DocumentationPackageKey, DocumentationRequirementState>;

export interface DocumentationRequirementsEngineResult {
  package: DocumentationPackage;
  requirements: Record<string, boolean | string>;
  requiredDocuments: DocumentationPackageKey[];
  optionalDocuments: DocumentationPackageKey[];
  inspectionStrategy: InspectionStrategy;
  samplingPlanId: string;
  criticalFeaturesRequireFullInspection: boolean;
  qualityApprovalRequired: boolean;
  customerApprovalRequired: boolean;
  documentationNotes: string;
  gates: {
    routingApproval: {
      requiresQcInspectionSetup: boolean;
      requiresSamplingPlan: boolean;
      fullInspectionRequired: boolean;
      sampleSizeAllowed: boolean;
      travelerRequired: boolean;
    };
    travelerGeneration: {
      required: boolean;
      optional: boolean;
      blockedWhenNotRequired: boolean;
    };
    p2ReleaseGate: {
      requiredDocuments: DocumentationPackageKey[];
      qualityApprovalRequired: boolean;
      customerApprovalRequired: boolean;
    };
    qcFinalRelease: {
      inspectionSheetRequired: boolean;
      samplingPlanRequired: boolean;
      faiRequired: boolean;
      certificatePackageRequired: boolean;
      fullInspectionRequired: boolean;
    };
  };
}

type WadLike = {
  wizardData?: unknown;
  wizard_data?: unknown;
};

const DOCUMENT_FIELD_MAP: Array<{
  packageKey: DocumentationPackageKey;
  field: string;
  defaultRequired: boolean;
  optionalWhenFalse?: boolean;
}> = [
  { packageKey: 'routing', field: 'routingRequired', defaultRequired: true },
  { packageKey: 'traveler', field: 'travelerRequired', defaultRequired: true, optionalWhenFalse: true },
  { packageKey: 'inspectionSheet', field: 'inspectionSheetRequired', defaultRequired: false },
  { packageKey: 'samplingPlan', field: 'samplingPlanRequired', defaultRequired: false },
  { packageKey: 'fai', field: 'faiRequired', defaultRequired: false },
  { packageKey: 'workInstruction', field: 'workInstructionRequired', defaultRequired: false },
  { packageKey: 'cncSetupSheet', field: 'cncSetupSheetRequired', defaultRequired: false },
  { packageKey: 'materialCutSheet', field: 'materialCutSheetRequired', defaultRequired: false },
  { packageKey: 'layupRecord', field: 'layupRecordRequired', defaultRequired: false },
  { packageKey: 'cureRecord', field: 'cureRecordRequired', defaultRequired: false },
  { packageKey: 'assemblyChecklist', field: 'assemblyChecklistRequired', defaultRequired: false },
  { packageKey: 'testReport', field: 'testReportRequired', defaultRequired: false },
  { packageKey: 'packagingChecklist', field: 'packagingChecklistRequired', defaultRequired: false },
  { packageKey: 'certificatePackage', field: 'certificatePackageRequired', defaultRequired: false },
];

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function boolValue(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', 'required', '1'].includes(normalized)) return true;
    if (['false', 'no', 'not_required', 'notrequired', 'optional', '0'].includes(normalized)) return false;
  }
  return fallback;
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function inferInspectionStrategy(data: Record<string, any>): InspectionStrategy {
  const explicit = stringValue(data.inspectionStrategy).toUpperCase();
  if (['FULL', 'SAMPLING', 'MIXED', 'FINAL_ONLY'].includes(explicit)) return explicit as InspectionStrategy;
  if (boolValue(data.step6?.finalQCOnly, false)) return 'FINAL_ONLY';
  if (data.step7?.spotCheckSampleSize || data.step7?.spotCheckFrequency) return 'SAMPLING';
  if (boolValue(data.step7?.inProcessQC, false) && boolValue(data.step7?.finalQC, false)) return 'MIXED';
  return 'FULL';
}

export function evaluateDocumentationRequirements(input: WadLike | Record<string, unknown> | null | undefined): DocumentationRequirementsEngineResult {
  const data = asRecord((input as WadLike | undefined)?.wizardData ?? (input as WadLike | undefined)?.wizard_data ?? input);
  const inspectionStrategy = inferInspectionStrategy(data);
  const sampleSizeAllowed = inspectionStrategy === 'SAMPLING' || inspectionStrategy === 'MIXED';
  const fullInspectionRequired = inspectionStrategy === 'FULL';

  const requirements: Record<string, boolean | string> = {
    routingRequired: boolValue(data.routingRequired ?? data.step6?.routingRequired, true),
    travelerRequired: boolValue(data.travelerRequired ?? data.step6?.travelerRequired, true),
    inspectionSheetRequired: boolValue(data.inspectionSheetRequired ?? data.step7?.dimensionalReportRequired, false),
    samplingPlanRequired: boolValue(data.samplingPlanRequired, false),
    faiRequired: boolValue(data.faiRequired ?? data.step7?.faiRequired, false),
    workInstructionRequired: boolValue(data.workInstructionRequired ?? data.step6?.workInstructionRequired, false),
    cncSetupSheetRequired: boolValue(data.cncSetupSheetRequired, false),
    materialCutSheetRequired: boolValue(data.materialCutSheetRequired, false),
    layupRecordRequired: boolValue(data.layupRecordRequired, false),
    cureRecordRequired: boolValue(data.cureRecordRequired, false),
    assemblyChecklistRequired: boolValue(data.assemblyChecklistRequired, false),
    testReportRequired: boolValue(data.testReportRequired, false),
    packagingChecklistRequired: boolValue(data.packagingChecklistRequired, false),
    certificatePackageRequired: boolValue(data.certificatePackageRequired ?? data.step7?.certPackageRequired, false),
    inspectionStrategy,
    samplingPlanId: stringValue(data.samplingPlanId),
    criticalFeaturesRequireFullInspection: boolValue(data.criticalFeaturesRequireFullInspection, false),
    qualityApprovalRequired: boolValue(data.qualityApprovalRequired, true),
    customerApprovalRequired: boolValue(data.customerApprovalRequired ?? data.step7?.customerSourceInspection, false),
    documentationNotes: stringValue(data.documentationNotes),
  };

  const docPackage = DOCUMENT_FIELD_MAP.reduce((acc, item) => {
    const required = boolValue(requirements[item.field], item.defaultRequired);
    acc[item.packageKey] = required ? 'required' : item.optionalWhenFalse ? 'optional' : 'notRequired';
    return acc;
  }, {} as DocumentationPackage);

  const requiredDocuments = DOCUMENT_FIELD_MAP
    .filter(item => docPackage[item.packageKey] === 'required')
    .map(item => item.packageKey);
  const optionalDocuments = DOCUMENT_FIELD_MAP
    .filter(item => docPackage[item.packageKey] === 'optional')
    .map(item => item.packageKey);

  return {
    package: docPackage,
    requirements,
    requiredDocuments,
    optionalDocuments,
    inspectionStrategy,
    samplingPlanId: stringValue(requirements.samplingPlanId),
    criticalFeaturesRequireFullInspection: boolValue(requirements.criticalFeaturesRequireFullInspection, false),
    qualityApprovalRequired: boolValue(requirements.qualityApprovalRequired, true),
    customerApprovalRequired: boolValue(requirements.customerApprovalRequired, false),
    documentationNotes: stringValue(requirements.documentationNotes),
    gates: {
      routingApproval: {
        requiresQcInspectionSetup: docPackage.inspectionSheet === 'required',
        requiresSamplingPlan: docPackage.samplingPlan === 'required',
        fullInspectionRequired,
        sampleSizeAllowed,
        travelerRequired: docPackage.traveler === 'required',
      },
      travelerGeneration: {
        required: docPackage.traveler === 'required',
        optional: docPackage.traveler === 'optional',
        blockedWhenNotRequired: false,
      },
      p2ReleaseGate: {
        requiredDocuments,
        qualityApprovalRequired: boolValue(requirements.qualityApprovalRequired, true),
        customerApprovalRequired: boolValue(requirements.customerApprovalRequired, false),
      },
      qcFinalRelease: {
        inspectionSheetRequired: docPackage.inspectionSheet === 'required',
        samplingPlanRequired: docPackage.samplingPlan === 'required',
        faiRequired: docPackage.fai === 'required',
        certificatePackageRequired: docPackage.certificatePackage === 'required',
        fullInspectionRequired,
      },
    },
  };
}
