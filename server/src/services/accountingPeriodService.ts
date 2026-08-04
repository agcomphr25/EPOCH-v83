import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { accountingPeriods } from '../../schema';
import { isAccountingAdminUser } from '../middleware/requireAccountingAdmin';
import { accountingPeriodFromDate, evaluatePriorMonthPaymentGrace } from './accountingDatePolicy';

export { evaluatePriorMonthPaymentGrace } from './accountingDatePolicy';

export type PostingMode = 'STANDARD' | 'HISTORICAL_MIGRATION' | 'PRIOR_MONTH_GRACE' | 'ADJUSTMENT' | 'REVERSAL';

export function periodFromDate(value: Date | string): { year: number; month: number; date: Date } {
  return accountingPeriodFromDate(value);
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

  const grace = evaluatePriorMonthPaymentGrace({
    effectiveDate,
    graceBusinessDays: Number(period.paymentEntryGraceBusinessDays ?? 3),
  });
  if (postingMode === 'PRIOR_MONTH_GRACE' && !grace.eligible) {
    const err: any = new Error('The controlled prior-month payment entry grace window has expired.');
    err.statusCode = 403;
    throw err;
  }

  if (
    (status === 'SOFT_CLOSED' || status === 'MIGRATION' || postingMode === 'HISTORICAL_MIGRATION') &&
    postingMode !== 'PRIOR_MONTH_GRACE'
  ) {
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
