export interface SimInput {
  referenceDate: Date;
  ordersPerWeek: number;
  shipmentsPerWeek: number;
  simulationWeeks: number;
  assumedLeadTimeDays: number;
}

export interface WeekResult {
  weekIndex: number;
  date: Date;
  label: string;
  backlog: number;
  pastDue: number;
}

const EXCLUDED_STATUSES = ['FULFILLED', 'CANCELLED', 'HOLDING'];
const EXCLUDED_DEPTS = ['Fulfilled', 'Shipping Manager', 'Completed', 'Shipped'];
const PAST_DUE_THRESHOLD_DAYS = 14;

export function loadOpenOrders(allOrders: { dueDate: string; status: string; currentDepartment?: string | null }[]): Date[] {
  return allOrders
    .filter((o) => {
      if (EXCLUDED_STATUSES.includes(o.status)) return false;
      if (EXCLUDED_DEPTS.includes(o.currentDepartment ?? '')) return false;
      const d = new Date(o.dueDate);
      return !isNaN(d.getTime());
    })
    .map((o) => new Date(o.dueDate));
}

export function runSimulation(seedOrders: Date[], input: SimInput): WeekResult[] {
  let orders: Date[] = [...seedOrders];
  const results: WeekResult[] = [];
  let currentDate = new Date(input.referenceDate);

  for (let week = 1; week <= input.simulationWeeks; week++) {
    for (let i = 0; i < input.ordersPerWeek; i++) {
      const due = new Date(currentDate);
      due.setDate(due.getDate() + input.assumedLeadTimeDays);
      orders.push(due);
    }

    orders.sort((a, b) => a.getTime() - b.getTime());
    const fulfilled = Math.min(input.shipmentsPerWeek, orders.length);
    orders = orders.slice(fulfilled);

    currentDate = new Date(currentDate);
    currentDate.setDate(currentDate.getDate() + 7);

    const pastDue = orders.filter((d) => {
      const days = (currentDate.getTime() - d.getTime()) / 86_400_000;
      return days > PAST_DUE_THRESHOLD_DAYS;
    }).length;

    results.push({
      weekIndex: week,
      date: new Date(currentDate),
      label: `Wk ${week}`,
      backlog: orders.length,
      pastDue,
    });
  }

  return results;
}
