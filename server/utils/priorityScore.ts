/**
 * Calculate priority score for an order based on manual urgency
 * Lower score = higher priority (sorts to top of queue)
 * 
 * Priority hierarchy:
 * 1. Manual urgency (URGENT!!!) = 1
 * 2. Normal = 9999 (lowest priority)
 * 
 * Note: Rush and Expedite fees affect the due date directly (not priority score).
 * Production queue is sorted by priority_score, then due_date, so earlier due dates
 * will naturally be processed sooner.
 */

export function calculatePriorityScore(
  features: any,
  urgency?: string | null,
  isManualUrgency?: boolean | null
): number {
  // Manual urgency always has highest priority
  if (isManualUrgency && (urgency === 'high' || urgency === 'critical')) {
    return 1;
  }

  // All other orders have normal priority
  // Orders are sorted by due date within this priority level
  return 9999;
}
