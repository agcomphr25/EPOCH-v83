/**
 * Resolves an AG Composites part number (e.g. "AG-CRB-PV105-SR") to a
 * human-readable model name (e.g. "Privateer").
 *
 * Pattern matching rules (most-specific first):
 *   AG-*-ADJ-AHV*  → "Alpine Hunter Adjustable"
 *   AG-*-AHV*      → "Alpine Hunter"
 *   AG-*-PV*       → "Privateer"
 *   AG-FG-P205*    → "Privateer" (fiberglass Privateer SKUs)
 *   AG-BM-M5BDL*   → "M5 Bundle"
 *
 * If the value does not match any known AG part-number pattern, it is
 * returned unchanged so human-readable names are always passed through.
 */
export function resolveItemDisplayName(itemName: string): string {
  if (!itemName) return itemName;

  const upper = itemName.toUpperCase().trim();

  if (!upper.startsWith('AG-')) {
    return itemName;
  }

  if (upper.includes('-ADJ-AHV') || upper.includes('-ADJ-AH')) {
    return 'Alpine Hunter Adjustable';
  }

  if (upper.includes('-AHV') || upper.includes('-AH-')) {
    return 'Alpine Hunter';
  }

  if (upper.includes('-PV')) {
    return 'Privateer';
  }

  if (upper.match(/^AG-FG-P205/)) {
    return 'Privateer';
  }

  if (upper.match(/^AG-BM-M5BDL/)) {
    return 'M5 Bundle';
  }

  return itemName;
}
