import {
  format,
  startOfWeek,
  addDays,
  differenceInWeeks,
  getYear,
  parseISO,
} from 'date-fns';

/**
 * Company week utilities
 * - Week runs Wednesday to Tuesday
 * - Company operates with a 2-week offset from calendar weeks
 * - Operational year starts on the first shipping week containing Jan 15
 * - Weeks before that belong to the previous operational year
 */

const WEEK_OFFSET = 2;

/**
 * Get the first Wednesday of a calendar year
 */
function getFirstWednesdayOfYear(year: number): Date {
  const firstDayOfYear = new Date(year, 0, 1);
  const firstWednesday = startOfWeek(firstDayOfYear, { weekStartsOn: 3 });
  
  if (getYear(firstWednesday) < year) {
    return addDays(firstWednesday, 7);
  }
  return firstWednesday;
}

/**
 * Get the start date of operational year (first shipping week containing Jan 15)
 * This is the Wednesday of the week that contains January 15
 */
export function getOperationalYearStart(operationalYear: number): Date {
  const jan15 = new Date(operationalYear, 0, 15);
  const wednesdayOfJan15Week = startOfWeek(jan15, { weekStartsOn: 3 });
  
  if (getYear(wednesdayOfJan15Week) < operationalYear) {
    return addDays(wednesdayOfJan15Week, 7);
  }
  return wednesdayOfJan15Week;
}

/**
 * Get the operational year for a given date
 * Operational year starts on the first shipping week containing Jan 15
 */
export function getOperationalYear(date: Date): number {
  const calendarYear = getYear(date);
  
  const currentYearOpStart = getOperationalYearStart(calendarYear);
  
  if (date >= currentYearOpStart) {
    return calendarYear;
  }
  return calendarYear - 1;
}

/**
 * Get the company week number for a given date (can be negative or zero)
 * Week runs from Wednesday to Tuesday
 * Company week = Calendar week - 2 (NO CLAMPING)
 */
export function getCompanyWeek(date: Date): number {
  const wednesday = startOfWeek(date, { weekStartsOn: 3 });
  
  const year = getYear(date);
  const startDate = getFirstWednesdayOfYear(year);
  
  const weekNumber = differenceInWeeks(wednesday, startDate) + 1;
  const companyWeek = weekNumber - WEEK_OFFSET;
  
  return companyWeek;
}

/**
 * Get the operational week number (always positive, relative to operational year)
 * This is the week number within the operational year
 */
export function getOperationalWeek(date: Date): number {
  const opYear = getOperationalYear(date);
  const opYearStart = getOperationalYearStart(opYear);
  const wednesday = startOfWeek(date, { weekStartsOn: 3 });
  
  const weeksSinceOpStart = differenceInWeeks(wednesday, opYearStart);
  return weeksSinceOpStart + 1;
}

/**
 * Get the start date (Wednesday) of a company week
 */
export function getCompanyWeekStart(
  companyWeekNumber: number,
  year?: number
): Date {
  const currentYear = year || getYear(new Date());
  const startDate = getFirstWednesdayOfYear(currentYear);
  
  const calendarWeek = companyWeekNumber + WEEK_OFFSET;
  return addDays(startDate, (calendarWeek - 1) * 7);
}

/**
 * Get the start date (Wednesday) of an operational week
 */
export function getOperationalWeekStart(
  operationalWeekNumber: number,
  operationalYear: number
): Date {
  const opYearStart = getOperationalYearStart(operationalYear);
  return addDays(opYearStart, (operationalWeekNumber - 1) * 7);
}

/**
 * Get the end date (Tuesday) of a company week
 */
export function getCompanyWeekEnd(
  companyWeekNumber: number,
  year?: number
): Date {
  const weekStart = getCompanyWeekStart(companyWeekNumber, year);
  return addDays(weekStart, 6);
}

/**
 * Get the end date (Tuesday) of an operational week
 */
export function getOperationalWeekEnd(
  operationalWeekNumber: number,
  operationalYear: number
): Date {
  const weekStart = getOperationalWeekStart(operationalWeekNumber, operationalYear);
  return addDays(weekStart, 6);
}

/**
 * Format a date range for display (company week)
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
 * Format a date range for display (operational week)
 */
export function formatOperationalWeekRange(
  operationalWeekNumber: number,
  operationalYear: number
): string {
  const start = getOperationalWeekStart(operationalWeekNumber, operationalYear);
  const end = getOperationalWeekEnd(operationalWeekNumber, operationalYear);
  return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
}

/**
 * Get the current company week
 */
export function getCurrentCompanyWeek(): number {
  return getCompanyWeek(new Date());
}

/**
 * Get the current operational week and year
 */
export function getCurrentOperationalWeek(): { week: number; year: number } {
  const now = new Date();
  return {
    week: getOperationalWeek(now),
    year: getOperationalYear(now),
  };
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
  const weekEnd = addDays(getCompanyWeekEnd(companyWeekNumber, year), 1);

  return checkDate >= weekStart && checkDate < weekEnd;
}

/**
 * Check if a date falls within a specific operational week
 */
export function isDateInOperationalWeek(
  date: Date | string,
  operationalWeekNumber: number,
  operationalYear: number
): boolean {
  const checkDate = typeof date === 'string' ? parseISO(date) : date;
  const weekStart = getOperationalWeekStart(operationalWeekNumber, operationalYear);
  const weekEnd = addDays(getOperationalWeekEnd(operationalWeekNumber, operationalYear), 1);

  return checkDate >= weekStart && checkDate < weekEnd;
}

/**
 * Get week info for a shipped date - returns operational week, year, and display info
 */
export function getShippingWeekInfo(date: Date | string): {
  operationalWeek: number;
  operationalYear: number;
  companyWeek: number;
  calendarYear: number;
  weekStart: Date;
  weekEnd: Date;
  displayRange: string;
} {
  const checkDate = typeof date === 'string' ? parseISO(date) : date;
  
  const operationalYear = getOperationalYear(checkDate);
  const operationalWeek = getOperationalWeek(checkDate);
  const companyWeek = getCompanyWeek(checkDate);
  const calendarYear = getYear(checkDate);
  
  const weekStart = getOperationalWeekStart(operationalWeek, operationalYear);
  const weekEnd = getOperationalWeekEnd(operationalWeek, operationalYear);
  const displayRange = formatOperationalWeekRange(operationalWeek, operationalYear);
  
  return {
    operationalWeek,
    operationalYear,
    companyWeek,
    calendarYear,
    weekStart,
    weekEnd,
    displayRange,
  };
}
