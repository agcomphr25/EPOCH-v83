/**
 * UNIFIED ORDER PRIORITY SYSTEM
 * 
 * This is the SINGLE SOURCE OF TRUTH for order priority calculation.
 * 
 * PRIORITY CONTRACT:
 * - Lower score = higher priority (sorts to top of queue)
 * - 1 = Maximum priority (manual critical override or urgent)
 * - 9999 = Default/normal priority (bottom of queue)
 * - NEVER persist the computed priority - always compute on read
 * 
 * PRIORITY HIERARCHY (highest to lowest):
 * 1. Manual priority override (admin-set, takes absolute precedence)
 * 2. Urgency-based elevation (critical/high urgency or overdue)
 * 3. Due date pressure (closer due date = higher priority within tier)
 * 4. Default (9999 - sorts to bottom)
 */

export type UrgencyLevel = 'critical' | 'high' | 'medium' | 'low';
export type PrioritySource = 'default' | 'urgency' | 'manual' | 'system';

export interface OrderPriorityInput {
  dueDate?: Date | string | null;
  urgency?: string | null;
  isManualUrgency?: boolean | null;
  manualPriorityOverride?: number | null;
  prioritySource?: string | null;
}

export interface EffectivePriorityResult {
  score: number;
  source: PrioritySource;
  reason: string;
}

const PRIORITY_SCORES = {
  MANUAL_CRITICAL: 1,
  URGENT: 1,
  OVERDUE: 5,
  DUE_SOON_7_DAYS: 100,
  DUE_SOON_14_DAYS: 500,
  DUE_SOON_30_DAYS: 1000,
  MEDIUM_URGENCY: 5000,
  DEFAULT: 9999,
} as const;

/**
 * Computes the effective priority for an order.
 * This function MUST be used for all queue sorting.
 * The result should NEVER be persisted to the database.
 * 
 * @param order - Order data with priority-relevant fields
 * @returns EffectivePriorityResult with score, source, and reason
 */
export function computeEffectivePriority(order: OrderPriorityInput): EffectivePriorityResult {
  // 1. MANUAL OVERRIDE TAKES ABSOLUTE PRECEDENCE
  if (order.manualPriorityOverride != null && order.manualPriorityOverride > 0) {
    return {
      score: order.manualPriorityOverride,
      source: 'manual',
      reason: `Manual priority set to ${order.manualPriorityOverride}`,
    };
  }

  // 2. URGENCY-BASED ELEVATION
  const urgency = (order.urgency?.toLowerCase() || 'low') as UrgencyLevel;
  
  if (order.isManualUrgency && (urgency === 'critical' || urgency === 'high')) {
    return {
      score: PRIORITY_SCORES.URGENT,
      source: 'urgency',
      reason: `Manual urgency: ${urgency}`,
    };
  }

  // 3. OVERDUE CHECK
  const now = new Date();
  let dueDate: Date | null = null;
  
  if (order.dueDate) {
    dueDate = typeof order.dueDate === 'string' ? new Date(order.dueDate) : order.dueDate;
  }

  if (dueDate && !isNaN(dueDate.getTime())) {
    const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    // Overdue orders get elevated priority
    if (daysUntilDue < 0) {
      return {
        score: PRIORITY_SCORES.OVERDUE,
        source: 'system',
        reason: `Overdue by ${Math.abs(daysUntilDue)} days`,
      };
    }

    // Due date pressure (closer = higher priority)
    if (daysUntilDue <= 7) {
      return {
        score: PRIORITY_SCORES.DUE_SOON_7_DAYS,
        source: 'system',
        reason: `Due in ${daysUntilDue} days`,
      };
    }

    if (daysUntilDue <= 14) {
      return {
        score: PRIORITY_SCORES.DUE_SOON_14_DAYS,
        source: 'system',
        reason: `Due in ${daysUntilDue} days`,
      };
    }

    if (daysUntilDue <= 30) {
      return {
        score: PRIORITY_SCORES.DUE_SOON_30_DAYS,
        source: 'system',
        reason: `Due in ${daysUntilDue} days`,
      };
    }
  }

  // 4. MEDIUM URGENCY (non-manual)
  if (urgency === 'medium') {
    return {
      score: PRIORITY_SCORES.MEDIUM_URGENCY,
      source: 'urgency',
      reason: 'Medium urgency',
    };
  }

  // 5. DEFAULT - Normal priority (bottom of queue)
  return {
    score: PRIORITY_SCORES.DEFAULT,
    source: 'default',
    reason: 'Normal priority',
  };
}

/**
 * Helper to get just the numeric score for sorting.
 */
export function getEffectivePriorityScore(order: OrderPriorityInput): number {
  return computeEffectivePriority(order).score;
}

/**
 * Comparator function for sorting orders by effective priority.
 * Use with Array.sort() - lower scores sort first.
 * 
 * Sort order:
 * 1. Effective priority (computed, lower = first)
 * 2. Due date (earlier = first)
 * 3. Created date (earlier = first)
 */
export function compareOrderPriority(
  a: OrderPriorityInput & { orderDate?: Date | string | null; createdAt?: Date | string | null },
  b: OrderPriorityInput & { orderDate?: Date | string | null; createdAt?: Date | string | null }
): number {
  const scoreA = getEffectivePriorityScore(a);
  const scoreB = getEffectivePriorityScore(b);
  
  // Primary: Priority score (lower = higher priority)
  if (scoreA !== scoreB) {
    return scoreA - scoreB;
  }
  
  // Secondary: Due date (earlier = higher priority)
  const dueDateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
  const dueDateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
  if (dueDateA !== dueDateB) {
    return dueDateA - dueDateB;
  }
  
  // Tertiary: Order date / created date (earlier = higher priority)
  const createdA = (a.orderDate || a.createdAt) ? new Date((a.orderDate || a.createdAt) as string).getTime() : Infinity;
  const createdB = (b.orderDate || b.createdAt) ? new Date((b.orderDate || b.createdAt) as string).getTime() : Infinity;
  return createdA - createdB;
}

/**
 * SAFETY: This constant reminds developers not to persist priority scores.
 */
export const PRIORITY_CONTRACT = `
  DO NOT PERSIST COMPUTED PRIORITY SCORES.
  Always use computeEffectivePriority() at query time.
  The priority_score column is DEPRECATED and will be removed.
` as const;
