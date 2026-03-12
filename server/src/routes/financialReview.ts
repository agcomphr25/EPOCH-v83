import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { requireFinanceAccess } from '../../middleware/routeAuthorization';
import { pool } from '../../db';

const router = Router();

router.use(authenticateToken);
router.use(requireFinanceAccess);

// GET /api/financial-review/summary — aggregated live dashboard data
router.get('/summary', async (req, res) => {
  try {
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
    } catch (err: any) { console.warn('[financial-review] revenue query failed:', err.message); }

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
    } catch (err: any) { console.warn('[financial-review] AR revenue query failed:', err.message); }

    // OTD — all_orders.shipped_date vs due_date (consistent with OTD widget)
    let otdRows: any[] = [];
    try {
      otdRows = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE shipped_date <= due_date OR due_date IS NULL) AS on_time,
          COUNT(*) AS total
        FROM all_orders
        WHERE shipped_date IS NOT NULL
          AND created_at >= NOW() - INTERVAL '3 months'
          AND status NOT IN ('cancelled', 'draft')
      `) as any[];
    } catch (err: any) { console.warn('[financial-review] OTD query failed:', err.message); }

    // NCR
    let ncrRows: any[] = [];
    try {
      ncrRows = await pool.query(`
        SELECT COUNT(*) AS ncr_count FROM nonconformance_records
        WHERE created_at >= NOW() - INTERVAL '3 months'
      `) as any[];
    } catch (err: any) { console.warn('[financial-review] NCR query failed:', err.message); }

    // Customer satisfaction — 12-month + 30-day (overall_satisfaction column)
    let csRows: any[] = [];
    try {
      csRows = await pool.query(`
        SELECT ROUND(AVG(overall_satisfaction)::numeric, 1) AS avg_score, COUNT(*) AS count
        FROM customer_satisfaction_responses
        WHERE created_at >= NOW() - INTERVAL '12 months'
          AND is_complete = true
      `) as any[];
    } catch (err: any) { console.warn('[financial-review] CS 12mo query failed:', err.message); }

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
    } catch (err: any) { console.warn('[financial-review] AR aging query failed:', err.message); }

    // Customer satisfaction — 30-day window
    let cs30: any = {};
    try {
      const cs30Rows = await pool.query(`
        SELECT ROUND(AVG(overall_satisfaction)::numeric, 1) AS avg_score, COUNT(*) AS count
        FROM customer_satisfaction_responses
        WHERE created_at >= NOW() - INTERVAL '30 days'
          AND is_complete = true
      `) as any[];
      cs30 = cs30Rows[0] || {};
    } catch (err: any) { console.warn('[financial-review] CS 30d query failed:', err.message); }

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
    } catch (err: any) { console.warn('[financial-review] return rate query failed:', err.message); }

    // Live P2 pipeline — from p2_purchase_orders and projects (all live DB data)
    let pipelineTotals = { openCount: 0, byStage: {} as Record<string, number>, p2ByStatus: {} as Record<string, number> };
    try {
      // Live P2 open orders from p2_purchase_orders
      const p2Rows = await pool.query(`
        SELECT status, COUNT(*) AS cnt
        FROM p2_purchase_orders
        WHERE status NOT IN ('completed', 'cancelled', 'shipped')
        GROUP BY status
      `) as any[];
      const p2ByStatus: Record<string, number> = {};
      let openCount = 0;
      p2Rows.forEach((r: any) => {
        p2ByStatus[r.status] = Number(r.cnt);
        openCount += Number(r.cnt);
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

      pipelineTotals = { openCount, byStage, p2ByStatus };
    } catch (err: any) { console.warn('[financial-review] pipeline query failed:', err.message); }

    const fetchedAt = new Date().toISOString();

    const rev = revRows[0] || {};
    const otd = otdRows[0] || { on_time: 0, total: 0 };
    const ncr = ncrRows[0] || { ncr_count: 0 };
    const cs = csRows[0] || {};

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
      otdPercent: otd.total > 0 ? Math.round((Number(otd.on_time) / Number(otd.total)) * 100) : null,
      otdLastUpdated: fetchedAt,
      ncrCount: Number(ncr.ncr_count) || 0,
      ncrLastUpdated: fetchedAt,
      customerSatisfaction: {
        avgScore: cs.avg_score ? Number(cs.avg_score) : null,
        responseCount: Number(cs.count) || 0,
        avg30Day: cs30.avg_score ? Number(cs30.avg_score) : null,
        responseCount30Day: Number(cs30.count) || 0,
        lastUpdated: fetchedAt,
      },
      arAging: { ...arAging, lastUpdated: fetchedAt },
      pipeline: { ...pipelineTotals, lastUpdated: fetchedAt },
      returnRate: { ...returnRate, lastUpdated: fetchedAt },
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
    // OTD: orders shipped on or before due date (last 3 months)
    const otdRows = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE shipped_date <= due_date OR due_date IS NULL) AS on_time,
        COUNT(*) AS total
      FROM all_orders
      WHERE shipped_date IS NOT NULL
        AND created_at >= NOW() - INTERVAL '3 months'
        AND status NOT IN ('cancelled', 'draft')
    `) as any[];

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

    const otd = otdRows[0] || { on_time: 0, total: 0 };
    const ncr = ncrRows[0] || { ncr_count: 0 };
    const rev = revRows[0] || { recent: 0, prior: 0 };

    const otdPct = otd.total > 0
      ? Math.round((Number(otd.on_time) / Number(otd.total)) * 100)
      : null;

    const recentRev = Number(rev.recent) || 0;
    const priorRev = Number(rev.prior) || 0;
    const revenueGrowthPct = priorRev > 0
      ? Math.round(((recentRev - priorRev) / priorRev) * 100)
      : null;

    res.json({
      otdPercent: otdPct,
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

// GET /api/financial-review/live/customer-score — avg satisfaction score
router.get('/live/customer-score', async (req, res) => {
  try {
    const rows = await pool.query(`
      SELECT
        ROUND(AVG(overall_satisfaction)::numeric, 1) AS avg_score,
        COUNT(*) AS response_count
      FROM customer_satisfaction_responses
      WHERE created_at >= NOW() - INTERVAL '12 months'
        AND is_complete = true
    `) as any[];
    const r = rows[0] || {};
    res.json({
      avgScore: r.avg_score ? Number(r.avg_score) : null,
      responseCount: Number(r.response_count) || 0,
    });
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
