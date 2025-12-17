import { BaselineEngine } from './core/baselineEngine';
import { detectDelta } from './core/deltaDetector';
import { StabilityGate } from './core/stabilityGate';
import { InsightSuppressor } from './core/insightSuppressor';
import { PatternInsight } from './models/PatternInsight';

const baselineEngine = new BaselineEngine();
const stabilityGate = new StabilityGate();
const suppressor = new InsightSuppressor();

const entityId = 'task_group_42';
const patternType = 'LOAD_IMBALANCE';

const incomingEvents = [10, 11, 9, 15, 18, 20, 21];

incomingEvents.forEach(value => {
  baselineEngine.addEvent(entityId, value);

  const baseline = baselineEngine.getBaseline(entityId);

  const recentValues = [value];

  const { isDeviated, currentSummary } = detectDelta(baseline, recentValues);

  const isStable = stabilityGate.record(entityId, isDeviated);

  if (isDeviated && isStable && !suppressor.shouldSuppress(entityId, patternType)) {
    const insight = new PatternInsight({
      entityId,
      patternType,
      detectedAt: new Date(),
      baselineSummary: baseline,
      currentSummary,
      confidenceLevel: 'medium',
    });

    console.log('Pattern Insight:', insight);
  }
});
