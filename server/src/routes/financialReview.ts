import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { pool } from '../../db';

const router = Router();

router.use(authenticateToken);

// GET /api/financial-review/summary — aggregated live dashboard data
router.get('/summary', async (req, res) => {
  try {
    // Revenue (last 6 months) — payments.payment_amount
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
    } catch (_) {}

    // OTD — all_orders.shipped_date vs estimated_delivery
    let otdRows: any[] = [];
    try {
      otdRows = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE shipped_date <= estimated_delivery OR estimated_delivery IS NULL) AS on_time,
          COUNT(*) AS total
        FROM all_orders
        WHERE shipped_date IS NOT NULL
          AND created_at >= NOW() - INTERVAL '3 months'
          AND status NOT IN ('cancelled', 'draft')
      `) as any[];
    } catch (_) {}

    // NCR
    let ncrRows: any[] = [];
    try {
      ncrRows = await pool.query(`
        SELECT COUNT(*) AS ncr_count FROM nonconformances
        WHERE created_at >= NOW() - INTERVAL '3 months'
      `) as any[];
    } catch (_) {}

    // Customer satisfaction — 12-month (overall_satisfaction column)
    let csRows: any[] = [];
    try {
      csRows = await pool.query(`
        SELECT ROUND(AVG(overall_satisfaction)::numeric, 1) AS avg_score, COUNT(*) AS count
        FROM customer_satisfaction_responses
        WHERE created_at >= NOW() - INTERVAL '12 months'
          AND is_complete = true
      `) as any[];
    } catch (_) {}

    // AR aging using ar_invoices.total_amount + due_date
    let arAging = { current: 0, days30: 0, days60: 0, days90plus: 0 };
    try {
      const arRows = await pool.query(`
        SELECT
          SUM(CASE WHEN due_date >= NOW()::date - 30 THEN total_amount ELSE 0 END) AS current_bucket,
          SUM(CASE WHEN due_date < NOW()::date - 30
                    AND due_date >= NOW()::date - 60 THEN total_amount ELSE 0 END) AS days_30,
          SUM(CASE WHEN due_date < NOW()::date - 60
                    AND due_date >= NOW()::date - 90 THEN total_amount ELSE 0 END) AS days_60,
          SUM(CASE WHEN due_date < NOW()::date - 90 THEN total_amount ELSE 0 END) AS days_90plus
        FROM ar_invoices WHERE status NOT IN ('PAID', 'paid', 'VOID', 'void')
      `) as any[];
      const r = arRows[0] || {};
      arAging = {
        current: Number(r.current_bucket) || 0,
        days30: Number(r.days_30) || 0,
        days60: Number(r.days_60) || 0,
        days90plus: Number(r.days_90plus) || 0,
      };
    } catch (_) {}

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
    } catch (_) {}

    // BD pipeline totals — from current month session
    let pipelineTotals = { totalValue: 0, pWeightedValue: 0, openCount: 0 };
    try {
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const sesRows = await pool.query(
        `SELECT bd_pipeline FROM financial_review_sessions WHERE month_key = $1`,
        [monthKey]
      ) as any[];
      const pipeline: any[] = sesRows[0]?.bd_pipeline || [];
      pipelineTotals = pipeline.reduce((acc: any, item: any) => {
        const val = Number(item.value) || 0;
        const pwin = Number(item.pwin) || 0;
        const won = item.status === 'won';
        const lost = item.status === 'lost';
        return {
          totalValue: acc.totalValue + val,
          pWeightedValue: acc.pWeightedValue + (won ? val : lost ? 0 : val * (pwin / 100)),
          openCount: acc.openCount + (!lost ? 1 : 0),
        };
      }, { totalValue: 0, pWeightedValue: 0, openCount: 0 });
    } catch (_) {}

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
        SUM(amount) AS revenue
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
    // OTD: orders shipped on or before promised date (last 3 months)
    const otdRows = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE ship_date <= promise_date OR promise_date IS NULL) AS on_time,
        COUNT(*) AS total
      FROM all_orders
      WHERE ship_date IS NOT NULL
        AND created_at >= NOW() - INTERVAL '3 months'
        AND status NOT IN ('cancelled', 'draft')
    `) as any[];

    // NCR count (last 3 months)
    const ncrRows = await pool.query(`
      SELECT COUNT(*) AS ncr_count
      FROM nonconformances
      WHERE created_at >= NOW() - INTERVAL '3 months'
    `) as any[];

    // Revenue: last 3 months vs 3 months before that (for growth)
    const revRows = await pool.query(`
      SELECT
        SUM(CASE WHEN payment_date >= NOW() - INTERVAL '3 months' THEN amount ELSE 0 END) AS recent,
        SUM(CASE WHEN payment_date >= NOW() - INTERVAL '6 months'
                  AND payment_date < NOW() - INTERVAL '3 months' THEN amount ELSE 0 END) AS prior
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
        ROUND(AVG(overall_score)::numeric, 1) AS avg_score,
        COUNT(*) AS response_count
      FROM customer_satisfaction_responses
      WHERE created_at >= NOW() - INTERVAL '12 months'
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
