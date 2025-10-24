/**
 * Calculate priority score for an order based on rush fees and urgency
 * Lower score = higher priority (sorts to top of queue)
 * 
 * Priority hierarchy:
 * 1. Manual urgency (URGENT!!!) = 1
 * 2. Expedite (rush_fee2) = 2500 (75% up from bottom)
 * 3. Rush (rush_fee1) = 5000 (50% up from bottom)
 * 4. Normal = 9999 (lowest priority)
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

  // Check for rush fees in features.other_options
  const otherOptions = features?.other_options || [];
  const hasExpedite = Array.isArray(otherOptions) && otherOptions.includes('rush_fee2');
  const hasRush = Array.isArray(otherOptions) && otherOptions.includes('rush_fee1');

  // Expedite gets 75% priority (25% from top in 0-10000 scale)
  if (hasExpedite) {
    return 2500;
  }

  // Rush gets 50% priority (50% from top in 0-10000 scale)
  if (hasRush) {
    return 5000;
  }

  // Normal priority (lowest)
  return 9999;
}
