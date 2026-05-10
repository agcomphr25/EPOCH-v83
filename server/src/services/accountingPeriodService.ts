import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { accountingPeriods } from '../../schema';
import { isAccountingAdminUser } from '../middleware/requireAccountingAdmin';

export type PostingMode = 'STANDARD' | 'HISTORICAL_MIGRATION' | 'ADJUSTMENT' | 'REVERSAL';

export function periodFromDate(value: Date | string): { year: number; month: number; date: Date } {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid accounting date: ${String(value)}`);
  }
  return { year: date.getFullYear(), month: date.getMonth() + 1, date };
}

export async function getOrCreateAccountingPeriod(value: Date | string) {
  const { year, month } = periodFromDate(value);
  const [existing] = await db
    .select()
    .from(accountingPeriods)
    .where(and(eq(accountingPeriods.periodYear, year), eq(accountingPeriods.periodMonth, month)))
    .limit(1);
  if (existing) return existing;

  const defaultStatus = year < 2026 || (year === 2026 && month < 10) ? 'MIGRATION' : 'OPEN';
  const [created] = await db
    .insert(accountingPeriods)
    .values({
      periodYear: year,
      periodMonth: month,
      status: defaultStatus,
      notes:
        defaultStatus === 'MIGRATION'
          ? 'Auto-created migration period. Historical/backdated entries require accounting_admin support notes.'
          : 'Auto-created open period.',
    })
    .returning();
  return created;
}

export async function assertPostingAllowedForPeriod({
  effectiveDate,
  user,
  postingMode,
}: {
  effectiveDate: Date | string;
  user: any;
  postingMode: PostingMode;
}) {
  const period = await getOrCreateAccountingPeriod(effectiveDate);
  const status = String(period.status).toUpperCase();

  if (status === 'FINAL_LOCKED' || status === 'HARD_CLOSED') {
    const err: any = new Error(`Accounting period ${period.periodYear}-${String(period.periodMonth).padStart(2, '0')} is ${status}.`);
    err.statusCode = 423;
    throw err;
  }

  if (status === 'SOFT_CLOSED' || status === 'MIGRATION' || postingMode === 'HISTORICAL_MIGRATION') {
    const ok = await isAccountingAdminUser(user);
    if (!ok) {
      const err: any = new Error(
        `Accounting period ${period.periodYear}-${String(period.periodMonth).padStart(2, '0')} requires accounting_admin approval.`
      );
      err.statusCode = 403;
      throw err;
    }
  }

  return period;
}
