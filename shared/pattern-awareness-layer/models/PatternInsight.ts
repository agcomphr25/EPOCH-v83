export interface PatternInsightParams {
  entityId: string;
  patternType: string;
  detectedAt: Date;
  baselineSummary: { mean: number; variance: number; count: number };
  currentSummary: { mean: number; count: number };
  confidenceLevel?: 'low' | 'medium' | 'high';
  dismissedAt?: Date | null;
}

export class PatternInsight {
  entityId: string;
  patternType: string;
  detectedAt: Date;
  baselineSummary: { mean: number; variance: number; count: number };
  currentSummary: { mean: number; count: number };
  confidenceLevel: 'low' | 'medium' | 'high';
  dismissedAt: Date | null;

  constructor({
    entityId,
    patternType,
    detectedAt,
    baselineSummary,
    currentSummary,
    confidenceLevel = 'low',
    dismissedAt = null
  }: PatternInsightParams) {
    this.entityId = entityId;
    this.patternType = patternType;
    this.detectedAt = detectedAt;
    this.baselineSummary = baselineSummary;
    this.currentSummary = currentSummary;
    this.confidenceLevel = confidenceLevel;
    this.dismissedAt = dismissedAt;
  }
}
