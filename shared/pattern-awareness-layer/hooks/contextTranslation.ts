import type { PatternInsight } from '../models/PatternInsight';

export interface TranslatedInsight {
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  actionable: boolean;
  metadata?: Record<string, unknown>;
}

export type TranslateInsightFn<TContext = unknown> = (
  patternInsight: PatternInsight,
  appContext: TContext
) => TranslatedInsight;

export function translateInsight<TContext = unknown>(
  patternInsight: PatternInsight,
  appContext: TContext
): TranslatedInsight {
  throw new Error("translateInsight must be implemented per app.");
}

export function createTranslator<TContext>(
  translator: TranslateInsightFn<TContext>
): TranslateInsightFn<TContext> {
  return translator;
}
