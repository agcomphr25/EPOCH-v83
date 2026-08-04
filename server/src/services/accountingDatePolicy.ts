function utcDateParts(value: Date | string) {
  const date = value instanceof Date ? value : new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid accounting date: ${String(value)}`);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), date };
}

function businessDayNumberInMonth(value: Date): number {
  let count = 0;
  for (let day = 1; day <= value.getUTCDate(); day += 1) {
    const weekday = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), day, 12)).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}

export function accountingPeriodFromDate(value: Date | string) {
  const { year, month, date } = utcDateParts(value);
  return { year, month, date };
}

export function evaluatePriorMonthPaymentGrace({
  effectiveDate,
  enteredAt = new Date(),
  graceBusinessDays = 3,
}: {
  effectiveDate: Date | string;
  enteredAt?: Date;
  graceBusinessDays?: number;
}) {
  const effective = utcDateParts(effectiveDate);
  const entered = utcDateParts(enteredAt);
  const previousMonthDate = new Date(Date.UTC(entered.year, entered.month - 2, 1, 12));
  const isImmediatelyPriorMonth =
    effective.year === previousMonthDate.getUTCFullYear() &&
    effective.month === previousMonthDate.getUTCMonth() + 1;
  const businessDayNumber = businessDayNumberInMonth(entered.date);
  const eligible = graceBusinessDays > 0 && isImmediatelyPriorMonth && businessDayNumber <= graceBusinessDays;
  return { eligible, isImmediatelyPriorMonth, businessDayNumber, graceBusinessDays };
}
