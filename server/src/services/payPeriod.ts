export interface PayPeriod {
  start: Date;
  end: Date;
  label: string;
}

export function getPayPeriod(date: Date = new Date()): PayPeriod {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth();

  const monthName = d.toLocaleString('en-US', { month: 'short' });

  if (d.getDate() <= 15) {
    return {
      start: new Date(year, month, 1, 0, 0, 0, 0),
      end: new Date(year, month, 15, 23, 59, 59, 999),
      label: `${monthName} 1–15, ${year}`,
    };
  }

  return {
    start: new Date(year, month, 16, 0, 0, 0, 0),
    end: new Date(year, month + 1, 0, 23, 59, 59, 999),
    label: `${monthName} 16–EOM, ${year}`,
  };
}
