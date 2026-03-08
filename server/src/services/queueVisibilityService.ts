export interface QueueVisibilityCheck {
  rule: string;
  description: string;
  expected?: string;
  actual: any;
  result: boolean;
}

export interface QueueVisibilityResult {
  department: string;
  visible: boolean;
  checks: QueueVisibilityCheck[];
  explanation: string;
}

const BAD_STATUSES = new Set(['SCRAPPED', 'CANCELLED', 'FULFILLED']);

export function evaluateQueueVisibility(order: any, department: string): QueueVisibilityResult {
  const checks: QueueVisibilityCheck[] = [];

  const deptMatch = order.current_department === department;
  checks.push({
    rule: 'department_match',
    description: 'Order department matches queue',
    expected: department,
    actual: order.current_department ?? null,
    result: deptMatch,
  });

  const statusOk = !BAD_STATUSES.has(order.status);
  checks.push({
    rule: 'not_scrapped_cancelled_fulfilled',
    description: 'Status not in SCRAPPED, CANCELLED, FULFILLED',
    actual: order.status ?? null,
    result: statusOk,
  });

  const scrapDateNull = order.scrap_date === null || order.scrap_date === undefined;
  checks.push({
    rule: 'scrap_date_null',
    description: 'Scrap date not set',
    actual: order.scrap_date ?? null,
    result: scrapDateNull,
  });

  const notCancelled = !order.is_cancelled;
  checks.push({
    rule: 'not_cancelled',
    description: 'is_cancelled flag not set',
    actual: order.is_cancelled ?? false,
    result: notCancelled,
  });

  const visible = checks.every((c) => c.result);

  const failedChecks = checks.filter((c) => !c.result);
  let explanation: string;

  if (visible) {
    explanation = `Order is visible in the ${department} queue.`;
  } else {
    const reasons: string[] = [];
    for (const check of failedChecks) {
      switch (check.rule) {
        case 'department_match':
          reasons.push(
            `current department is "${order.current_department ?? 'null'}", not "${department}"`
          );
          break;
        case 'not_scrapped_cancelled_fulfilled':
          reasons.push(`status is ${order.status}`);
          break;
        case 'scrap_date_null':
          reasons.push(`scrap_date is set (${order.scrap_date})`);
          break;
        case 'not_cancelled':
          reasons.push('order is marked cancelled (is_cancelled = true)');
          break;
      }
    }
    explanation = `Order not visible in ${department} queue: ${reasons.join('; ')}.`;
  }

  return { department, visible, checks, explanation };
}
