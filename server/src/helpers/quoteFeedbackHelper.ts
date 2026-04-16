/**
 * Pure computation helpers for generateQuoteExecutionFeedback.
 * Extracted so they can be unit-tested without a live database.
 */

const LABOR_KEYWORDS =
  /\b(labor|labour|man.?hour|engineering|machining|fabrication|welding|assembly|finishing|setup)\b/i;

// ---------------------------------------------------------------------------
// Labor hours from time-clock entries
// ---------------------------------------------------------------------------

/**
 * Sum actual labor hours from completed clock entries.
 * Only entries with both clockIn and clockOut contribute.
 * Negative durations are ignored.
 */
export function sumLaborHoursFromEntries(
  entries: Array<{ clockIn: Date | string | null; clockOut: Date | string | null }>
): number {
  let total = 0;
  for (const entry of entries) {
    if (entry.clockIn && entry.clockOut) {
      const ms =
        new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime();
      const hours = ms / (1000 * 60 * 60);
      if (hours > 0) {
        total += hours;
      }
    }
  }
  return Math.round(total * 100) / 100;
}

// ---------------------------------------------------------------------------
// Unique department collection
// ---------------------------------------------------------------------------

/**
 * Collect sorted unique department names from a set of entries.
 * Null / undefined department values are skipped.
 */
export function collectUniqueDepartments(
  entries: Array<{ department?: string | null }>
): string[] {
  const set = new Set<string>();
  for (const entry of entries) {
    if (entry.department) {
      set.add(entry.department);
    }
  }
  return Array.from(set).sort();
}

// ---------------------------------------------------------------------------
// Quoted labor extraction from line items
// ---------------------------------------------------------------------------

/**
 * Identify labor-related line items by description keyword and sum their
 * quantities as quoted hours.
 * Returns { hours: number, source: 'line_items' } when labor items are found,
 * otherwise { hours: null, source: 'none' }.
 */
export function extractQuotedLaborFromLineItems(
  lineItems: Array<{ description?: string | null; quantity?: number | null }>
): { hours: number | null; source: 'line_items' | 'none' } {
  const laborItems = lineItems.filter(
    (li) => li.description && LABOR_KEYWORDS.test(li.description)
  );
  if (laborItems.length === 0) {
    return { hours: null, source: 'none' };
  }
  const summed = laborItems.reduce((acc, li) => acc + (li.quantity ?? 0), 0);
  if (summed <= 0) {
    return { hours: null, source: 'none' };
  }
  return { hours: Math.round(summed * 100) / 100, source: 'line_items' };
}

// ---------------------------------------------------------------------------
// Labor variance
// ---------------------------------------------------------------------------

/**
 * Compute the variance between actual and quoted labor hours.
 * Returns null for both values when either side is unknown.
 */
export function computeLaborVariance(
  quotedLaborHours: number | null,
  actualLaborHours: number | null
): { laborHoursVariance: number | null; laborHoursVariancePct: number | null } {
  if (quotedLaborHours === null || actualLaborHours === null) {
    return { laborHoursVariance: null, laborHoursVariancePct: null };
  }
  const variance = Math.round((actualLaborHours - quotedLaborHours) * 100) / 100;
  const pct =
    quotedLaborHours !== 0
      ? Math.round((variance / quotedLaborHours) * 10000) / 100
      : null;
  return { laborHoursVariance: variance, laborHoursVariancePct: pct };
}

// ---------------------------------------------------------------------------
// Schedule / lead-time helpers
// ---------------------------------------------------------------------------

/**
 * Compute actual project lead time in calendar days.
 *
 * Priority order:
 *   1. projectCreatedAt → projectActualShipDate
 *   2. projectCreatedAt → closingApprovedAt
 *   3. earliest WAD startDate → latest WAD dueDate  (proxy)
 *
 * Returns null when insufficient date data is available.
 */
export function computeActualLeadTimeDays(
  projectCreatedAt: Date | string | null | undefined,
  projectActualShipDate: Date | string | null | undefined,
  closingApprovedAt: Date | string | null | undefined,
  wads: Array<{ startDate?: string | null; dueDate?: string | null }>
): number | null {
  const startAnchor = projectCreatedAt ? new Date(projectCreatedAt) : null;

  if (startAnchor) {
    if (projectActualShipDate) {
      const ms = new Date(projectActualShipDate).getTime() - startAnchor.getTime();
      return Math.round(ms / (1000 * 60 * 60 * 24));
    }
    if (closingApprovedAt) {
      const ms = new Date(closingApprovedAt).getTime() - startAnchor.getTime();
      return Math.round(ms / (1000 * 60 * 60 * 24));
    }
    if (wads.length > 0) {
      const wadStarts = wads
        .map((w) => (w.startDate ? new Date(w.startDate).getTime() : null))
        .filter((d): d is number => d !== null);
      const wadDues = wads
        .map((w) => (w.dueDate ? new Date(w.dueDate).getTime() : null))
        .filter((d): d is number => d !== null);
      if (wadStarts.length > 0 && wadDues.length > 0) {
        const ms = Math.max(...wadDues) - Math.min(...wadStarts);
        return Math.round(ms / (1000 * 60 * 60 * 24));
      }
    }
  }
  return null;
}

/**
 * Compute schedule variance in calendar days (positive = overrun).
 *
 * When quotedLeadTimeDays is available: actual − quoted.
 * Fallback when only ship dates are available: actualShipDate − targetShipDate.
 */
export function computeScheduleVarianceDays(
  quotedLeadTimeDays: number | null,
  actualLeadTimeDays: number | null,
  projectTargetShipDate: string | null | undefined,
  projectActualShipDate: string | null | undefined
): number | null {
  if (quotedLeadTimeDays !== null && actualLeadTimeDays !== null) {
    return actualLeadTimeDays - quotedLeadTimeDays;
  }
  if (projectTargetShipDate && projectActualShipDate) {
    const ms =
      new Date(projectActualShipDate).getTime() -
      new Date(projectTargetShipDate).getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
  }
  return null;
}

// ---------------------------------------------------------------------------
// Overrun flag
// ---------------------------------------------------------------------------

/**
 * Determine whether the project is classified as an overrun.
 * Returns null when neither variance is computable.
 */
export function determineOverrunFlag(
  laborHoursVariance: number | null,
  scheduleVarianceDays: number | null
): boolean | null {
  if (laborHoursVariance === null && scheduleVarianceDays === null) {
    return null;
  }
  return (
    (laborHoursVariance !== null && laborHoursVariance > 0) ||
    (scheduleVarianceDays !== null && scheduleVarianceDays > 0)
  );
}
