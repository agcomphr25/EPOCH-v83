export const CONFIDENCE_THRESHOLD = 0.85;
export const RISK_WARNING_THRESHOLD = 16;

export const RISK_VALUES = ['LOW', 'MEDIUM', 'HIGH', 'EXTREME'] as const;
export type RiskValue = (typeof RISK_VALUES)[number];

export type RiskSource = 'conversation' | 'user_override';
export type ReviewStatus = 'accepted' | 'review' | 'missing';

export type RiskFieldKey =
  | 'trained_staff'
  | 'equipment_requirements'
  | 'manufacturing_space'
  | 'regulatory_requirements'
  | 'conflicting_priorities'
  | 'customer_concentration'
  | 'environmental_impact'
  | 'supply_chain'
  | 'supplier_variability'
  | 'contract_requirements'
  | 'timelines'
  | 'quality_expectations';

export type RiskFieldGroup = 'internal' | 'external';

export interface RiskFieldDefinition {
  key: RiskFieldKey;
  label: string;
  group: RiskFieldGroup;
}

export interface RiskFieldOutput {
  value: RiskValue | null;
  confidence: number;
  source: RiskSource;
  notes: string;
}

export type RiskAssessmentFields = Record<RiskFieldKey, RiskFieldOutput>;

export interface RiskScoreSummary {
  internalSubtotal: number;
  externalSubtotal: number;
  totalScore: number;
  warning: boolean;
  warningThreshold: number;
}

export interface RFQRiskSession {
  id: string;
  rfqId: string;
  customerId: string;
  customerName?: string | null;
  status: 'draft' | 'paused' | 'in_progress' | 'review' | 'completed' | 'saved';
  fields: RiskAssessmentFields;
  scoreSummary: RiskScoreSummary;
  reviewSummary?: RiskReviewSummary | null;
  reasoningLog: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RiskReviewSummary {
  completedFields: RiskFieldKey[];
  lowConfidenceFields: RiskFieldKey[];
  missingFields: RiskFieldKey[];
  prompts: string[];
}

export interface MemorySuggestion {
  field: RiskFieldKey;
  value: RiskValue;
  confidence: number;
  note: string;
}

export const RISK_FIELD_DEFINITIONS: RiskFieldDefinition[] = [
  { key: 'trained_staff', label: 'Trained Staff', group: 'internal' },
  { key: 'equipment_requirements', label: 'Equipment Requirements', group: 'internal' },
  { key: 'manufacturing_space', label: 'Manufacturing Space', group: 'internal' },
  { key: 'regulatory_requirements', label: 'Regulatory Requirements', group: 'internal' },
  { key: 'conflicting_priorities', label: 'Conflicting Priorities', group: 'internal' },
  { key: 'customer_concentration', label: 'Customer Concentration', group: 'internal' },
  { key: 'environmental_impact', label: 'Environmental Impact', group: 'internal' },
  { key: 'supply_chain', label: 'Supply Chain', group: 'external' },
  { key: 'supplier_variability', label: 'Supplier Variability', group: 'external' },
  { key: 'contract_requirements', label: 'Contract Requirements', group: 'external' },
  { key: 'timelines', label: 'Timelines', group: 'external' },
  { key: 'quality_expectations', label: 'Quality Expectations', group: 'external' },
];

export const RISK_FIELD_LABELS = Object.fromEntries(
  RISK_FIELD_DEFINITIONS.map((field) => [field.key, field.label])
) as Record<RiskFieldKey, string>;

export function createEmptyRiskFields(): RiskAssessmentFields {
  return Object.fromEntries(
    RISK_FIELD_DEFINITIONS.map((field) => [
      field.key,
      {
        value: null,
        confidence: 0,
        source: 'conversation',
        notes: '',
      } satisfies RiskFieldOutput,
    ])
  ) as RiskAssessmentFields;
}

export function riskValueToScore(value: RiskValue | null | undefined): number {
  switch (value) {
    case 'EXTREME':
      return 17;
    case 'HIGH':
      return 3;
    case 'MEDIUM':
      return 1;
    case 'LOW':
      return 0;
    default:
      return 0;
  }
}

export function getReviewStatus(field: RiskFieldOutput): ReviewStatus {
  if (!field.value || field.confidence < 0.6) return 'missing';
  if (field.confidence < CONFIDENCE_THRESHOLD) return 'review';
  return 'accepted';
}

export function calculateRiskScore(fields: RiskAssessmentFields): RiskScoreSummary {
  let internalSubtotal = 0;
  let externalSubtotal = 0;

  for (const definition of RISK_FIELD_DEFINITIONS) {
    const score = riskValueToScore(fields[definition.key]?.value);
    if (definition.group === 'internal') internalSubtotal += score;
    else externalSubtotal += score;
  }

  const totalScore = internalSubtotal + externalSubtotal;
  return {
    internalSubtotal,
    externalSubtotal,
    totalScore,
    warning: totalScore > RISK_WARNING_THRESHOLD,
    warningThreshold: RISK_WARNING_THRESHOLD,
  };
}

export function buildReviewSummary(fields: RiskAssessmentFields): RiskReviewSummary {
  const completedFields: RiskFieldKey[] = [];
  const lowConfidenceFields: RiskFieldKey[] = [];
  const missingFields: RiskFieldKey[] = [];

  for (const definition of RISK_FIELD_DEFINITIONS) {
    const field = fields[definition.key];
    const status = getReviewStatus(field);
    if (status === 'accepted') completedFields.push(definition.key);
    if (status === 'review') lowConfidenceFields.push(definition.key);
    if (status === 'missing') missingFields.push(definition.key);
  }

  return {
    completedFields,
    lowConfidenceFields,
    missingFields,
    prompts: missingFields.map(
      (field) => `You did not address ${RISK_FIELD_LABELS[field]}. Would you like to add it?`
    ),
  };
}
