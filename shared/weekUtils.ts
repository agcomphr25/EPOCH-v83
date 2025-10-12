import {
  format,
  startOfWeek,
  addDays,
  differenceInWeeks,
  getYear,
  setYear,
  parseISO,
} from 'date-fns';

/**
 * Company week utilities
 * - Week runs Wednesday to Tuesday
 * - Company starts at week 3 in January (offset of 2 weeks from calendar)
 * - Current calendar week 42 = Company week 40
 */

// Company starts on the 3rd Wednesday of January
const WEEK_OFFSET = 2;

/**
 * Get the company week number for a given date
 * Week runs from Wednesday to Tuesday
 * Company week = Calendar week - 2
 */
export function getCompanyWeek(date: Date): number {
  // Get the week number starting from Wednesday
  const wednesday = startOfWeek(date, { weekStartsOn: 3 }); // 3 = Wednesday

  // Get the first Wednesday of the year
  const year = getYear(date);
  const firstDayOfYear = new Date(year, 0, 1);
  const firstWednesday = startOfWeek(firstDayOfYear, { weekStartsOn: 3 });

  // If first Wednesday is in previous year, use next Wednesday
  const startDate =
    getYear(firstWednesday) < year
      ? addDays(firstWednesday, 7)
      : firstWednesday;

  // Calculate week number (1-based)
  const weekNumber = differenceInWeeks(wednesday, startDate) + 1;

  // Apply company offset (week 3 in January becomes week 1)
  const companyWeek = weekNumber - WEEK_OFFSET;

  return companyWeek > 0 ? companyWeek : 1;
}

/**
 * Get the start date (Wednesday) of a company week
 */
export function getCompanyWeekStart(
  companyWeekNumber: number,
  year?: number
): Date {
  const currentYear = year || getYear(new Date());
  const firstDayOfYear = new Date(currentYear, 0, 1);
  const firstWednesday = startOfWeek(firstDayOfYear, { weekStartsOn: 3 });

  // Adjust if first Wednesday is in previous year
  const startDate =
    getYear(firstWednesday) < currentYear
      ? addDays(firstWednesday, 7)
      : firstWednesday;

  // Add offset and calculate week start
  const calendarWeek = companyWeekNumber + WEEK_OFFSET;
  return addDays(startDate, (calendarWeek - 1) * 7);
}

/**
 * Get the end date (Tuesday) of a company week
 */
export function getCompanyWeekEnd(
  companyWeekNumber: number,
  year?: number
): Date {
  const weekStart = getCompanyWeekStart(companyWeekNumber, year);
  return addDays(weekStart, 6); // Wednesday + 6 days = Tuesday
}

/**
 * Format a date range for display
 */
export function formatWeekRange(
  companyWeekNumber: number,
  year?: number
): string {
  const start = getCompanyWeekStart(companyWeekNumber, year);
  const end = getCompanyWeekEnd(companyWeekNumber, year);
  return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
}

/**
 * Get the current company week
 */
export function getCurrentCompanyWeek(): number {
  return getCompanyWeek(new Date());
}

/**
 * Check if a date falls within a specific company week
 */
export function isDateInCompanyWeek(
  date: Date | string,
  companyWeekNumber: number,
  year?: number
): boolean {
  const checkDate = typeof date === 'string' ? parseISO(date) : date;
  const weekStart = getCompanyWeekStart(companyWeekNumber, year);
  const weekEnd = addDays(getCompanyWeekEnd(companyWeekNumber, year), 1); // Include end of Tuesday

  return checkDate >= weekStart && checkDate < weekEnd;
}
