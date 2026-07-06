import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requireFinanceAccess } from '../../middleware/routeAuthorization';
import { pool } from '../../db';
import { storage } from '../../storage';

const router = Router();

router.use(authenticateToken);
router.use(requireFinanceAccess);

function toDateOnly(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    return value.includes('T') ? value.split('T')[0] : value;
  }
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  try {
    return new Date(value as any).toISOString().split('T')[0];
  } catch {
    return null;
  }
}

function getPreviousFullMonthKey(now = new Date()): string {
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthRange(monthKey: string) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    throw Object.assign(new Error('Invalid month key format (expected YYYY-MM)'), { status: 400 });
  }

  const [yearText, monthText] = monthKey.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);

  return {
    startDate: toDateOnly(start)!,
    endDate: toDateOnly(end)!,
  };
}

function getRecentMonthKeys(monthKey: string, count = 6): string[] {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    throw Object.assign(new Error('Invalid month key format (expected YYYY-MM)'), { status: 400 });
  }

  const [yearText, monthText] = monthKey.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;

  return Array.from({ length: count }, (_, index) => {
    const month = new Date(year, monthIndex - (count - 1 - index), 1);
    return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  });
}

function getMonthKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthShortLabel(monthKey: string): string {
  const [yearText, monthText] = monthKey.split('-');
  const date = new Date(Number(yearText), Number(monthText) - 1, 1);
  return date.toLocaleString('en-US', { month: 'short', year: '2-digit' });
}

function calculateOtdForMonthFromOrders(monthKey: string, orders: any[]) {
  const { startDate, endDate } = getMonthRange(monthKey);
  const considered = orders
    .map((order: any) => {
      const completionDate = toDateOnly(order.shippedDate) || toDateOnly(order.shippingCompletedAt) || toDateOnly(order.updatedAt);
      const dueDate = toDateOnly(order.dueDate);
      return { order, completionDate, dueDate };
    })
    .filter(({ order, completionDate, dueDate }) => {
      const status = String(order.status || '').toUpperCase();
      if (status !== 'SHIPPED' && status !== 'FULFILLED') return false;
      if (!completionDate || !dueDate) return false;
      if (completionDate < startDate || completionDate > endDate) return false;
      return true;
    });

  const onTimeCount = considered.filter(({ completionDate, dueDate }) => completionDate! <= dueDate!).length;
  const totalCount = considered.length;
  const lateCount = totalCount - onTimeCount;
  const otdPercent = totalCount > 0 ? Math.round((onTimeCount / totalCount) * 1000) / 10 : null;

  return {
    monthKey,
    startDate,
    endDate,
    otdPercent,
    totalCount,
    onTimeCount,
    lateCount,
    source: '/otd-report',
  };
}

async function calculateOtdForMonth(monthKey = getPreviousFullMonthKey()) {
  const orders = await storage.getFulfilledShippedOrdersWithPaymentStatus(10000);
  return calculateOtdForMonthFromOrders(monthKey, orders);
}

function calculateCustomerSatisfactionScore(rows: any[]) {
  let totalScores = 0;
  let scoredResponseCount = 0;
  let completedResponses = 0;
  let promoters = 0;
  let detractors = 0;

  rows.forEach((response) => {
    if (response.is_complete) completedResponses += 1;

    const answers = response.responses;
    if (answers && typeof answers === 'object') {
      let responseScore = 0;
      Object.values(answers).forEach((value) => {
        if (typeof value === 'number' && value >= 1 && value <= 10) {
          responseScore += value;
        }
      });
      if (responseScore > 0) {
        totalScores += responseScore;
        scoredResponseCount += 1;
      }
    }

    const nps = Number(response.nps_score);
    if (Number.isFinite(nps)) {
      if (nps >= 9) promoters += 1;
      if (nps <= 6) detractors += 1;
    }
  });

  const totalResponses = rows.length;
  return {
    avgScore: scoredResponseCount > 0 ? Math.round((totalScores / scoredResponseCount) * 100) / 100 : null,
    responseCount: scoredResponseCount,
    totalResponses,
    completedResponses,
    netPromoterScore: totalResponses > 0 ? Math.round(((promoters - detractors) / totalResponses) * 10000) / 100 : null,
    scale: 50,
  };
}

// GET /api/financial-review/summary — aggregated live dashboard data
router.get('/summary', async (req, res) => {
  try {
    const monthKey = typeof req.query.monthKey === 'string' ? req.query.monthKey : getPreviousFullMonthKey();
    const monthKeys = getRecentMonthKeys(monthKey);
    const now = new Date();
    const currentMonthKey = getMonthKeyFromDate(now);
    const paymentTrendMonthKeys = getRecentMonthKeys(monthKey);
    const { startDate: trendStartDate } = getMonthRange(monthKeys[0]);
    const { endDate: trendEndDate } = getMonthRange(monthKeys[monthKeys.length - 1]);
    const trendEnd = new Date(`${trendEndDate}T00:00:00`);
    trendEnd.setDate(trendEnd.getDate() + 1);
    const trendEndExclusive = toDateOnly(trendEnd)!;
    const emptyTrend = () => monthKeys.map((key) => ({ month: key, label: monthShortLabel(key), value: null as number | null }));
    const emptyPaymentTrend = () => paymentTrendMonthKeys.map((key) => ({ month: key, label: monthShortLabel(key), value: null as number | null }));
    const dataErrors: string[] = []; // collects any query failures for client visibility

    // Revenue (last 6 months) — payments.payment_amount (CC payments)
    let revRows: any[] = [];
    try {
      revRows = await pool.query(`
        SELECT
          SUM(CASE WHEN payment_date >= NOW() - INTERVAL '3 months' THEN payment_amount ELSE 0 END) AS recent_rev,
          SUM(CASE WHEN payment_date >= NOW() - INTERVAL '6 months'
                    AND payment_date < NOW() - INTERVAL '3 months' THEN payment_amount ELSE 0 END) AS prior_rev,
          SUM(payment_amount) AS total_6mo
        FROM payments
        WHERE payment_date >= NOW() - INTERVAL '6 months'
          AND payment_type = 'credit_card'
      `) as any[];
    } catch (err: any) { const msg = `revenue query: ${err.message}`; console.warn('[financial-review]', msg); dataErrors.push(msg); }

    // Current month AR invoice revenue
    let currentMonthArRevenue = 0;
    try {
      const arRevRows = await pool.query(`
        SELECT COALESCE(SUM(total_amount), 0) AS current_month_ar
        FROM ar_invoices
        WHERE invoice_date >= DATE_TRUNC('month', NOW())
          AND status NOT IN ('VOID', 'void')
      `) as any[];
      currentMonthArRevenue = Number(arRevRows[0]?.current_month_ar) || 0;
    } catch (err: any) { const msg = `AR revenue query: ${err.message}`; console.warn('[financial-review]', msg); dataErrors.push(msg); }

    let otdSummary: Awaited<ReturnType<typeof calculateOtdForMonth>> | null = null;
    let otdTrend = emptyTrend();
    try {
      const otdOrders = await storage.getFulfilledShippedOrdersWithPaymentStatus(10000);
      otdSummary = calculateOtdForMonthFromOrders(monthKey, otdOrders);
      otdTrend = monthKeys.map((key) => ({
        month: key,
        label: monthShortLabel(key),
        value: calculateOtdForMonthFromOrders(key, otdOrders).otdPercent,
      }));
    } catch (err: any) { const msg = `OTD query: ${err.message}`; console.warn('[financial-review]', msg); dataErrors.push(msg); }

    // NCR
    let ncrRows: any[] = [];
    let ncrTrend = emptyTrend();
    try {
      ncrRows = await pool.query(`
        SELECT COUNT(*) AS ncr_count FROM nonconformance_records
        WHERE created_at >= NOW() - INTERVAL '3 months'
      `) as any[];
      const ncrTrendRows = await pool.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
          COUNT(*) AS value
        FROM nonconformance_records
        WHERE created_at >= $1::date
          AND created_at < $2::date
        GROUP BY 1
      `, [trendStartDate, trendEndExclusive]) as any[];
      const ncrByMonth = new Map(ncrTrendRows.map((row: any) => [row.month, Number(row.value) || 0]));
      ncrTrend = monthKeys.map((key) => ({
        month: key,
        label: monthShortLabel(key),
        value: ncrByMonth.get(key) ?? 0,
      }));
    } catch (err: any) { const msg = `NCR query: ${err.message}`; console.warn('[financial-review]', msg); dataErrors.push(msg); }

    // Customer satisfaction — same score calculation used by /customer-satisfaction analytics
    let customerSatisfaction = {
      avgScore: null as number | null,
      responseCount: 0,
      totalResponses: 0,
      completedResponses: 0,
      netPromoterScore: null as number | null,
      scale: 50,
    };
    let customerSatisfactionTrend = emptyTrend();
    try {
      const csRows = await pool.query(`
        SELECT responses, nps_score, is_complete
        FROM customer_satisfaction_responses
      `) as any[];
      customerSatisfaction = calculateCustomerSatisfactionScore(csRows);
      const csTrendRows = await pool.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
          responses,
          nps_score,
          is_complete
        FROM customer_satisfaction_responses
        WHERE created_at >= $1::date
          AND created_at < $2::date
      `, [trendStartDate, trendEndExclusive]) as any[];
      customerSatisfactionTrend = monthKeys.map((key) => {
        const rowsForMonth = csTrendRows.filter((row: any) => row.month === key);
        return {
          month: key,
          label: monthShortLabel(key),
          value: calculateCustomerSatisfactionScore(rowsForMonth).avgScore,
        };
      });
    } catch (err: any) { const msg = `CS 12mo query: ${err.message}`; console.warn('[financial-review]', msg); dataErrors.push(msg); }

    let revenueTrend = emptyTrend();
    try {
      const revenueTrendRows = await pool.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', invoice_date), 'YYYY-MM') AS month,
          COALESCE(SUM(total_amount), 0) AS value
        FROM ar_invoices
        WHERE invoice_date >= $1::date
          AND invoice_date < $2::date
          AND status NOT IN ('VOID', 'void')
        GROUP BY 1
      `, [trendStartDate, trendEndExclusive]) as any[];
      const revenueByMonth = new Map(revenueTrendRows.map((row: any) => [row.month, Number(row.value) || 0]));
      revenueTrend = monthKeys.map((key) => ({
        month: key,
        label: monthShortLabel(key),
        value: revenueByMonth.get(key) ?? 0,
      }));
    } catch (err: any) { const msg = `revenue trend query: ${err.message}`; console.warn('[financial-review]', msg); dataErrors.push(msg); }

    let paymentAnalytics = {
      currentMonthKey,
      reviewMonthKey: monthKey,
      reviewMonthAmount: 0,
      mtdAmount: 0,
      transactionCount: 0,
      fullMonthEstimate: 0,
      elapsedDays: now.getDate(),
      daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
      source: '/payment-analytics',
    };
    let creditCardTrend = emptyPaymentTrend();
    try {
      const { startDate: paymentTrendStartDate } = getMonthRange(paymentTrendMonthKeys[0]);
      const { endDate: paymentTrendEndDate } = getMonthRange(paymentTrendMonthKeys[paymentTrendMonthKeys.length - 1]);
      const paymentTrendEnd = new Date(`${paymentTrendEndDate}T00:00:00`);
      paymentTrendEnd.setDate(paymentTrendEnd.getDate() + 1);
      const paymentTrendEndExclusive = toDateOnly(paymentTrendEnd)!;
      const { startDate: currentPaymentStartDate } = getMonthRange(currentMonthKey);

      const paymentRows = await pool.query(`
        SELECT
          COALESCE(SUM(p.payment_amount), 0) AS mtd_amount,
          COUNT(*) AS transaction_count
        FROM payments p
        LEFT JOIN credit_card_transactions cct ON cct.payment_id = p.id
        WHERE p.payment_date >= $1::date
          AND p.payment_date <= NOW()
          AND p.payment_type IN ('credit_card', 'aaaa', 'agr')
          AND (
            p.payment_type != 'credit_card'
            OR cct.status = 'completed'
          )
      `, [currentPaymentStartDate]) as any[];
      const paymentMtdAmount = Number(paymentRows[0]?.mtd_amount) || 0;
      const elapsedDays = now.getDate();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

      paymentAnalytics = {
        currentMonthKey,
        reviewMonthKey: monthKey,
        reviewMonthAmount: 0,
        mtdAmount: Math.round(paymentMtdAmount * 100) / 100,
        transactionCount: Number(paymentRows[0]?.transaction_count) || 0,
        fullMonthEstimate: elapsedDays > 0 ? Math.round(((paymentMtdAmount / elapsedDays) * daysInMonth) * 100) / 100 : 0,
        elapsedDays,
        daysInMonth,
        source: '/payment-analytics',
      };

      const paymentTrendRows = await pool.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', p.payment_date), 'YYYY-MM') AS month,
          COALESCE(SUM(p.payment_amount), 0) AS value
        FROM payments p
        LEFT JOIN credit_card_transactions cct ON cct.payment_id = p.id
        WHERE p.payment_date >= $1::date
          AND p.payment_date < $2::date
          AND p.payment_type IN ('credit_card', 'aaaa', 'agr')
          AND (
            p.payment_type != 'credit_card'
            OR cct.status = 'completed'
          )
        GROUP BY 1
      `, [paymentTrendStartDate, paymentTrendEndExclusive]) as any[];
      const paymentByMonth = new Map(paymentTrendRows.map((row: any) => [row.month, Number(row.value) || 0]));
      paymentAnalytics.reviewMonthAmount = Math.round((paymentByMonth.get(monthKey) ?? 0) * 100) / 100;
      creditCardTrend = paymentTrendMonthKeys.map((key) => ({
        month: key,
        label: monthShortLabel(key),
        value: paymentByMonth.get(key) ?? 0,
      }));
    } catch (err: any) { const msg = `payment analytics query: ${err.message}`; console.warn('[financial-review]', msg); dataErrors.push(msg); }

    // AR aging using balance (total_amount - payments allocated) per existing AR aging endpoint pattern
    let arAging = { current: 0, days30: 0, days60: 0, days90plus: 0, totalOutstanding: 0 };
    try {
      const arRows = await pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN i.due_date >= CURRENT_DATE THEN i.balance ELSE 0 END), 0) AS current_bucket,
          COALESCE(SUM(CASE WHEN i.due_date < CURRENT_DATE AND (CURRENT_DATE - i.due_date) <= 30 THEN i.balance ELSE 0 END), 0) AS days_1_30,
          COALESCE(SUM(CASE WHEN (CURRENT_DATE - i.due_date) > 30 AND (CURRENT_DATE - i.due_date) <= 60 THEN i.balance ELSE 0 END), 0) AS days_31_60,
          COALESCE(SUM(CASE WHEN (CURRENT_DATE - i.due_date) > 60 THEN i.balance ELSE 0 END), 0) AS days_90plus,
          COALESCE(SUM(i.balance), 0) AS total_outstanding
        FROM (
          SELECT inv.due_date,
            inv.total_amount::numeric - COALESCE(
              (SELECT SUM(apa.amount_applied::numeric) FROM ar_payment_allocations apa WHERE apa.invoice_id = inv.id), 0
            ) AS balance
          FROM ar_invoices inv
          WHERE inv.status NOT IN ('PAID', 'VOID')
        ) i WHERE i.balance > 0
      `) as any[];
      const r = arRows[0] || {};
      arAging = {
        current: Number(r.current_bucket) || 0,
        days30: Number(r.days_1_30) || 0,
        days60: Number(r.days_31_60) || 0,
        days90plus: Number(r.days_90plus) || 0,
        totalOutstanding: Number(r.total_outstanding) || 0,
      };
    } catch (err: any) { const msg = `AR aging query: ${err.message}`; console.warn('[financial-review]', msg); dataErrors.push(msg); }

    let customerSatisfaction30Day = {
      avgScore: null as number | null,
      responseCount: 0,
      totalResponses: 0,
      completedResponses: 0,
      netPromoterScore: null as number | null,
      scale: 50,
    };
    try {
      const cs30Rows = await pool.query(`
        SELECT responses, nps_score, is_complete
        FROM customer_satisfaction_responses
        WHERE created_at >= NOW() - INTERVAL '30 days'
      `) as any[];
      customerSatisfaction30Day = calculateCustomerSatisfactionScore(cs30Rows);
    } catch (err: any) { const msg = `CS 30d query: ${err.message}`; console.warn('[financial-review]', msg); dataErrors.push(msg); }

    // Customer return rate — refund_requests in last 12 months
    let returnRate: { returnCount: number; totalOrders: number; rate: number | null } = { returnCount: 0, totalOrders: 0, rate: null };
    try {
      const returnRows = await pool.query(`
        SELECT COUNT(*) AS return_count FROM refund_requests
        WHERE created_at >= NOW() - INTERVAL '12 months'
      `) as any[];
      const orderRows = await pool.query(`
        SELECT COUNT(*) AS total_orders FROM all_orders
        WHERE created_at >= NOW() - INTERVAL '12 months'
          AND status NOT IN ('cancelled', 'draft')
      `) as any[];
      const rc = Number(returnRows[0]?.return_count) || 0;
      const tc = Number(orderRows[0]?.total_orders) || 0;
      returnRate = { returnCount: rc, totalOrders: tc, rate: tc > 0 ? Math.round((rc / tc) * 1000) / 10 : null };
    } catch (err: any) { const msg = `return rate query: ${err.message}`; console.warn('[financial-review]', msg); dataErrors.push(msg); }

    // Live P2 pipeline — from p2_purchase_orders, p2_purchase_order_items, and projects
    let pipelineTotals = { openCount: 0, totalValue: 0, byStage: {} as Record<string, number>, p2ByStatus: {} as Record<string, number> };
    try {
      // Live P2 open orders with total value from p2_purchase_order_items
      const p2Rows = await pool.query(`
        SELECT po.status, COUNT(DISTINCT po.id) AS cnt,
               COALESCE(SUM(poi.total_price), 0) AS total_value
        FROM p2_purchase_orders po
        LEFT JOIN p2_purchase_order_items poi ON poi.po_id = po.id
        WHERE po.status NOT IN ('completed', 'cancelled', 'shipped')
        GROUP BY po.status
      `) as any[];
      const p2ByStatus: Record<string, number> = {};
      let openCount = 0;
      let totalValue = 0;
      p2Rows.forEach((r: any) => {
        p2ByStatus[r.status] = Number(r.cnt);
        openCount += Number(r.cnt);
        totalValue += Number(r.total_value);
      });

      // Live project stage breakdown from projects table
      const projRows = await pool.query(`
        SELECT current_stage, COUNT(*) AS cnt
        FROM projects
        WHERE status NOT IN ('completed', 'cancelled', 'lost') AND current_stage IS NOT NULL
        GROUP BY current_stage
      `) as any[];
      const byStage: Record<string, number> = {};
      projRows.forEach((r: any) => { byStage[r.current_stage] = Number(r.cnt); });

      pipelineTotals = { openCount, totalValue, byStage, p2ByStatus };
    } catch (err: any) { const msg = `pipeline query: ${err.message}`; console.warn('[financial-review]', msg); dataErrors.push(msg); }

    const fetchedAt = new Date().toISOString();

    const rev = revRows[0] || {};
    const ncr = ncrRows[0] || { ncr_count: 0 };
    const recentRev = Number(rev.recent_rev) || 0;
    const priorRev = Number(rev.prior_rev) || 0;
    const revenueGrowthPct = priorRev > 0
      ? Math.round(((recentRev - priorRev) / priorRev) * 100)
      : null;

    res.json({
      fetchedAt,
      revenue: {
        currentMonthAr: currentMonthArRevenue,
        total6Mo: Number(rev.total_6mo) || 0,
        recent3Mo: recentRev,
        prior3Mo: priorRev,
        growthPct: revenueGrowthPct,
        lastUpdated: fetchedAt,
      },
      paymentAnalytics: { ...paymentAnalytics, lastUpdated: fetchedAt },
      reviewPeriod: otdSummary ? {
        monthKey: otdSummary.monthKey,
        startDate: otdSummary.startDate,
        endDate: otdSummary.endDate,
      } : { monthKey },
      otdPercent: otdSummary?.otdPercent ?? null,
      otd: otdSummary,
      otdLastUpdated: fetchedAt,
      ncrCount: Number(ncr.ncr_count) || 0,
      ncrLastUpdated: fetchedAt,
      customerSatisfaction: {
        avgScore: customerSatisfaction.avgScore,
        responseCount: customerSatisfaction.responseCount,
        totalResponses: customerSatisfaction.totalResponses,
        completedResponses: customerSatisfaction.completedResponses,
        netPromoterScore: customerSatisfaction.netPromoterScore,
        scale: customerSatisfaction.scale,
        avg30Day: customerSatisfaction30Day.avgScore,
        responseCount30Day: customerSatisfaction30Day.responseCount,
        lastUpdated: fetchedAt,
      },
      arAging: { ...arAging, lastUpdated: fetchedAt },
      pipeline: { ...pipelineTotals, lastUpdated: fetchedAt },
      returnRate: { ...returnRate, lastUpdated: fetchedAt },
      trends: {
        otd: otdTrend,
        ncr: ncrTrend,
        customerSatisfaction: customerSatisfactionTrend,
        revenue: revenueTrend,
        creditCards: creditCardTrend,
      },
      dataErrors: dataErrors.length > 0 ? dataErrors : undefined,
    });
  } catch (err: any) {
    console.error('financial-review summary error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/financial-review — list all sessions, newest first
router.get('/', async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT * FROM financial_review_sessions ORDER BY month_key DESC`
    ) as any[];
    res.json(rows);
  } catch (err: any) {
    console.error('financial-review list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/financial-review/live/shipments — monthly shipment counts, last 6 months
router.get('/live/shipments', async (req, res) => {
  try {
    const rows = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
        COUNT(*) AS shipments
      FROM all_orders
      WHERE created_at >= NOW() - INTERVAL '6 months'
        AND status NOT IN ('cancelled', 'draft')
      GROUP BY 1
      ORDER BY 1
    `) as any[];
    res.json(rows);
  } catch (err: any) {
    console.error('financial-review live/shipments error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/financial-review/live/revenue — monthly CC revenue, last 6 months
router.get('/live/revenue', async (req, res) => {
  try {
    const rows = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', payment_date), 'YYYY-MM') AS month,
        SUM(payment_amount) AS revenue
      FROM payments
      WHERE payment_date >= NOW() - INTERVAL '6 months'
      GROUP BY 1
      ORDER BY 1
    `) as any[];
    res.json(rows);
  } catch (err: any) {
    console.error('financial-review live/revenue error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/financial-review/live/kpis — OTD %, NCR count, revenue growth
router.get('/live/kpis', async (req, res) => {
  try {
    const monthKey = typeof req.query.monthKey === 'string' ? req.query.monthKey : getPreviousFullMonthKey();
    const otd = await calculateOtdForMonth(monthKey);

    // NCR count (last 3 months)
    const ncrRows = await pool.query(`
      SELECT COUNT(*) AS ncr_count
      FROM nonconformance_records
      WHERE created_at >= NOW() - INTERVAL '3 months'
    `) as any[];

    // Revenue: last 3 months vs 3 months before that (for growth)
    const revRows = await pool.query(`
      SELECT
        SUM(CASE WHEN payment_date >= NOW() - INTERVAL '3 months' THEN payment_amount ELSE 0 END) AS recent,
        SUM(CASE WHEN payment_date >= NOW() - INTERVAL '6 months'
                  AND payment_date < NOW() - INTERVAL '3 months' THEN payment_amount ELSE 0 END) AS prior
      FROM payments
      WHERE payment_date >= NOW() - INTERVAL '6 months'
    `) as any[];

    const ncr = ncrRows[0] || { ncr_count: 0 };
    const rev = revRows[0] || { recent: 0, prior: 0 };

    const recentRev = Number(rev.recent) || 0;
    const priorRev = Number(rev.prior) || 0;
    const revenueGrowthPct = priorRev > 0
      ? Math.round(((recentRev - priorRev) / priorRev) * 100)
      : null;

    res.json({
      otdPercent: otd.otdPercent,
      otd,
      ncrCount: Number(ncr.ncr_count) || 0,
      revenueGrowthPct,
      recentRevenue: recentRev,
      priorRevenue: priorRev,
    });
  } catch (err: any) {
    console.error('financial-review live/kpis error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/financial-review/live/otd?monthKey=YYYY-MM — OTD summary matching /otd-report calculation
router.get('/live/otd', async (req, res) => {
  try {
    const monthKey = typeof req.query.monthKey === 'string' ? req.query.monthKey : getPreviousFullMonthKey();
    res.json(await calculateOtdForMonth(monthKey));
  } catch (err: any) {
    console.error('financial-review live/otd error:', err);
    res.status(err?.status || 500).json({ error: err.message });
  }
});

// GET /api/financial-review/live/customer-score — avg satisfaction score
router.get('/live/customer-score', async (req, res) => {
  try {
    const rows = await pool.query(`
      SELECT
        responses,
        nps_score,
        is_complete
      FROM customer_satisfaction_responses
    `) as any[];
    res.json(calculateCustomerSatisfactionScore(rows));
  } catch (err: any) {
    console.error('financial-review live/customer-score error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/financial-review/:monthKey — get one session (creates empty record if not exists)
router.get('/:monthKey', async (req, res) => {
  try {
    const { monthKey } = req.params;
    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      return res.status(400).json({ error: 'Invalid month key format (expected YYYY-MM)' });
    }

    const existing = await pool.query(
      `SELECT * FROM financial_review_sessions WHERE month_key = $1`,
      [monthKey]
    ) as any[];

    if (existing.length > 0) {
      return res.json(existing[0]);
    }

    // Auto-create an empty session
    const created = await pool.query(
      `INSERT INTO financial_review_sessions (month_key) VALUES ($1) RETURNING *`,
      [monthKey]
    ) as any[];

    res.json(created[0]);
  } catch (err: any) {
    console.error('financial-review get session error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/financial-review/:monthKey — upsert manual fields
router.put('/:monthKey', async (req, res) => {
  try {
    const { monthKey } = req.params;
    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      return res.status(400).json({ error: 'Invalid month key format (expected YYYY-MM)' });
    }

    const {
      review_date,
      agenda_text,
      gross_margin_pct,
      net_income,
      cash_balance,
      cash_forecast_notes,
      as_revenue,
      as_gross_margin_pct,
      as_net_income,
      action_items,
      bd_pipeline,
      risk_opportunity_text,
      calendar_events,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO financial_review_sessions
         (month_key, review_date, agenda_text, gross_margin_pct, net_income,
          cash_balance, cash_forecast_notes, as_revenue, as_gross_margin_pct,
          as_net_income, action_items, bd_pipeline, risk_opportunity_text,
          calendar_events, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
       ON CONFLICT (month_key) DO UPDATE SET
         review_date = EXCLUDED.review_date,
         agenda_text = EXCLUDED.agenda_text,
         gross_margin_pct = EXCLUDED.gross_margin_pct,
         net_income = EXCLUDED.net_income,
         cash_balance = EXCLUDED.cash_balance,
         cash_forecast_notes = EXCLUDED.cash_forecast_notes,
         as_revenue = EXCLUDED.as_revenue,
         as_gross_margin_pct = EXCLUDED.as_gross_margin_pct,
         as_net_income = EXCLUDED.as_net_income,
         action_items = EXCLUDED.action_items,
         bd_pipeline = EXCLUDED.bd_pipeline,
         risk_opportunity_text = EXCLUDED.risk_opportunity_text,
         calendar_events = EXCLUDED.calendar_events,
         updated_at = NOW()
       RETURNING *`,
      [
        monthKey,
        review_date ?? null,
        agenda_text ?? null,
        gross_margin_pct ?? null,
        net_income ?? null,
        cash_balance ?? null,
        cash_forecast_notes ?? null,
        as_revenue ?? null,
        as_gross_margin_pct ?? null,
        as_net_income ?? null,
        JSON.stringify(action_items ?? []),
        JSON.stringify(bd_pipeline ?? []),
        risk_opportunity_text ?? null,
        JSON.stringify(calendar_events ?? []),
      ]
    ) as any[];

    res.json(result[0]);
  } catch (err: any) {
    console.error('financial-review upsert error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
