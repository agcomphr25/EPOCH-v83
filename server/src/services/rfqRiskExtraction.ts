import {
  buildReviewSummary,
  calculateRiskScore,
  createEmptyRiskFields,
  type RiskAssessmentFields,
  type RiskFieldKey,
  type RiskFieldOutput,
  type RiskReviewSummary,
  type RiskScoreSummary,
  type RiskValue,
} from '../../../shared/rfqRiskAssessment';

type ExtractionRule = {
  field: RiskFieldKey;
  value: RiskValue;
  confidence: number;
  patterns: RegExp[];
  note: string;
};

export type VoiceCommand =
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'ignore' }
  | { type: 'finish' }
  | { type: 'mark_risk'; value: RiskValue };

export interface ExtractionResult {
  fields: RiskAssessmentFields;
  scoreSummary: RiskScoreSummary;
  reviewSummary: RiskReviewSummary;
  reasoningNotes: string[];
  command?: VoiceCommand;
}

const rules: ExtractionRule[] = [
  {
    field: 'equipment_requirements',
    value: 'HIGH',
    confidence: 0.92,
    patterns: [/don't have .*equipment/i, /do not have .*equipment/i, /need .*new .*equipment/i, /requires .*equipment we don't/i],
    note: 'Conversation indicates required equipment is unavailable or must be acquired.',
  },
  {
    field: 'trained_staff',
    value: 'HIGH',
    confidence: 0.88,
    patterns: [/not trained/i, /no trained staff/i, /need training/i, /lack .*certified/i],
    note: 'Staffing or training gap was discussed.',
  },
  {
    field: 'manufacturing_space',
    value: 'HIGH',
    confidence: 0.86,
    patterns: [/no space/i, /space constrained/i, /not enough floor/i, /manufacturing space/i],
    note: 'Manufacturing space constraint was mentioned.',
  },
  {
    field: 'regulatory_requirements',
    value: 'HIGH',
    confidence: 0.84,
    patterns: [/itar/i, /cui/i, /faa/i, /as9100/i, /regulatory/i, /compliance requirement/i],
    note: 'Regulatory or compliance requirements were raised.',
  },
  {
    field: 'conflicting_priorities',
    value: 'MEDIUM',
    confidence: 0.78,
    patterns: [/conflict/i, /priority conflict/i, /already overloaded/i, /compete with/i],
    note: 'Schedule or resource priority conflict may exist.',
  },
  {
    field: 'customer_concentration',
    value: 'MEDIUM',
    confidence: 0.72,
    patterns: [/major customer/i, /too much revenue/i, /customer concentration/i],
    note: 'Customer concentration exposure was mentioned.',
  },
  {
    field: 'environmental_impact',
    value: 'MEDIUM',
    confidence: 0.76,
    patterns: [/hazardous/i, /environmental/i, /waste/i, /chemical/i, /disposal/i],
    note: 'Environmental handling or waste impact was discussed.',
  },
  {
    field: 'supply_chain',
    value: 'HIGH',
    confidence: 0.89,
    patterns: [/long lead/i, /supply chain/i, /hard to source/i, /single source/i, /material shortage/i],
    note: 'Supply availability or sourcing risk was mentioned.',
  },
  {
    field: 'supplier_variability',
    value: 'MEDIUM',
    confidence: 0.8,
    patterns: [/supplier variability/i, /vendor inconsistent/i, /supplier quality/i, /varies by supplier/i],
    note: 'Supplier consistency concern was discussed.',
  },
  {
    field: 'contract_requirements',
    value: 'HIGH',
    confidence: 0.86,
    patterns: [/flowdown/i, /contract requirement/i, /fixed price/i, /liquidated damages/i, /terms are strict/i],
    note: 'Contract terms or flowdowns may increase risk.',
  },
  {
    field: 'timelines',
    value: 'HIGH',
    confidence: 0.9,
    patterns: [/tight timeline/i, /rush/i, /expedite/i, /aggressive schedule/i, /due .*soon/i],
    note: 'Timeline pressure was identified.',
  },
  {
    field: 'quality_expectations',
    value: 'HIGH',
    confidence: 0.87,
    patterns: [/tight tolerance/i, /zero defects/i, /quality expectation/i, /first article/i, /inspection heavy/i],
    note: 'Quality expectations or inspection burden was raised.',
  },
  {
    field: 'equipment_requirements',
    value: 'LOW',
    confidence: 0.88,
    patterns: [/we have .*equipment/i, /existing equipment/i, /standard equipment/i],
    note: 'Existing equipment appears sufficient.',
  },
  {
    field: 'trained_staff',
    value: 'LOW',
    confidence: 0.87,
    patterns: [/team is trained/i, /trained staff/i, /already certified/i],
    note: 'Staff readiness appears sufficient.',
  },
  {
    field: 'supply_chain',
    value: 'LOW',
    confidence: 0.86,
    patterns: [/stock material/i, /in stock/i, /multiple suppliers/i, /readily available/i],
    note: 'Supply availability appears low risk.',
  },
  {
    field: 'timelines',
    value: 'LOW',
    confidence: 0.84,
    patterns: [/timeline is fine/i, /schedule is comfortable/i, /plenty of time/i],
    note: 'Schedule appears manageable.',
  },
];

export function parseVoiceCommand(text: string): VoiceCommand | undefined {
  const normalized = text.trim().toLowerCase();
  if (/^pause epoch\b/.test(normalized)) return { type: 'pause' };
  if (/^resume epoch\b/.test(normalized)) return { type: 'resume' };
  if (/^ignore that\b/.test(normalized)) return { type: 'ignore' };
  if (/^end assessment\b/.test(normalized)) return { type: 'finish' };

  const mark = normalized.match(/mark that as (low|medium|high|extreme) risk/);
  if (mark) return { type: 'mark_risk', value: mark[1].toUpperCase() as RiskValue };

  return undefined;
}

function shouldReplace(current: RiskFieldOutput, candidate: RiskFieldOutput): boolean {
  if (current.source === 'user_override') return false;
  if (!current.value) return true;
  return candidate.confidence >= current.confidence;
}

export function extractRiskFields(
  utterances: string[],
  existingFields: RiskAssessmentFields = createEmptyRiskFields()
): ExtractionResult {
  const fields = structuredClone(existingFields);
  const reasoningNotes: string[] = [];

  for (const text of utterances) {
    for (const rule of rules) {
      if (!rule.patterns.some((pattern) => pattern.test(text))) continue;

      const candidate: RiskFieldOutput = {
        value: rule.value,
        confidence: rule.confidence,
        source: 'conversation',
        notes: rule.note,
      };

      if (shouldReplace(fields[rule.field], candidate)) {
        fields[rule.field] = candidate;
        reasoningNotes.push(`${rule.field}: ${rule.value} (${Math.round(rule.confidence * 100)}%) - ${rule.note}`);
      }
    }
  }

  return {
    fields,
    scoreSummary: calculateRiskScore(fields),
    reviewSummary: buildReviewSummary(fields),
    reasoningNotes,
  };
}

export function applyFieldOverride(
  fields: RiskAssessmentFields,
  field: RiskFieldKey,
  value: RiskValue,
  notes = 'Set by user voice/manual override.'
): RiskAssessmentFields {
  return {
    ...fields,
    [field]: {
      value,
      confidence: 1,
      source: 'user_override',
      notes,
    },
  };
}
