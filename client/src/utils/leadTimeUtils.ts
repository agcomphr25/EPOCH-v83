/**
 * Parses human-readable lead time strings into days
 * 
 * Examples:
 * - "2 weeks" → 14
 * - "3 days" → 3
 * - "1 month" → 30
 * - "14" → 14
 * - "2.5 weeks" → 18 (rounded)
 * 
 * @param input - Lead time string from user input
 * @returns Number of days, or null if input is invalid
 */
export function parseLeadTimeToDays(input: string | null | undefined): number | null {
  if (!input || input.trim() === '') {
    return null;
  }

  const trimmedInput = input.trim().toLowerCase();
  
  // Try to extract number and unit
  const match = trimmedInput.match(/^(\d+(?:\.\d+)?)\s*([a-z]*)/);
  
  if (!match) {
    return null;
  }

  const numValue = parseFloat(match[1]);
  const unit = match[2];

  if (isNaN(numValue)) {
    return null;
  }

  // If no unit specified, assume days
  if (!unit) {
    return Math.round(numValue);
  }

  // Convert to days based on unit
  const multipliers: { [key: string]: number } = {
    'day': 1,
    'days': 1,
    'd': 1,
    'week': 7,
    'weeks': 7,
    'wk': 7,
    'wks': 7,
    'w': 7,
    'month': 30,
    'months': 30,
    'mo': 30,
    'mos': 30,
    'm': 30,
  };

  const multiplier = multipliers[unit];

  if (multiplier === undefined) {
    // Unknown unit, treat as days
    return Math.round(numValue);
  }

  return Math.round(numValue * multiplier);
}
