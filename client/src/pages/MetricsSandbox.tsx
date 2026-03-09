import DashboardGrid from '@/components/widgets/DashboardGrid';
import MetricStatWidget from '@/components/widgets/MetricStatWidget';
import MetricStatGroup from '@/components/widgets/MetricStatGroup';
import {
  PRODUCTION_OVERVIEW_LAYOUT,
  type DashboardLayout,
} from '@/config/dashboardLayouts';
import { Factory, Wrench, Layers, BarChart3, Package, Ticket } from 'lucide-react';

const P2_LAYOUT: DashboardLayout = {
  id: 'p2_sandbox',
  name: 'P2 Controls',
  sections: [
    {
      id: 'p2-stats',
      title: 'P2 Purchase Orders',
      columns: 3,
      widgets: [
        {
          id: 'sb-p2-open-pos',
          type: 'metric_stat',
          props: { metricSlug: 'p2_open_pos', title: 'Open POs' },
        },
        {
          id: 'sb-p2-pending-boms',
          type: 'metric_stat',
          props: { metricSlug: 'p2_pending_boms', title: 'Pending BOMs' },
        },
        {
          id: 'sb-p2-completed-week',
          type: 'metric_stat',
          props: { metricSlug: 'p2_items_completed_week', title: 'Completed (7d)' },
        },
      ],
    },
    {
      id: 'p2-production',
      title: 'P2 Production',
      columns: 2,
      widgets: [
        {
          id: 'sb-p2-in-production',
          type: 'metric_stat',
          props: { metricSlug: 'p2_items_in_production', title: 'Items in Production' },
        },
        {
          id: 'sb-p2-pending-qc',
          type: 'metric_stat',
          props: { metricSlug: 'p2_items_pending_qc', title: 'Pending Final QC' },
        },
      ],
    },
  ],
};

export default function MetricsSandbox() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-6xl mx-auto space-y-10">

        {/* Header */}
        <div className="border-b border-gray-200 dark:border-gray-800 pb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Metrics Sandbox
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Widget system playground — not a production dashboard
          </p>
        </div>

        {/* ── Section 1: Individual widgets with props ───────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
            MetricStatWidget — individual props
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <MetricStatWidget
              metricSlug="cnc_queue_size"
              title="CNC"
              icon={<Factory className="h-4 w-4" />}
            />
            <MetricStatWidget
              metricSlug="gunsmith_queue_size"
              title="Gunsmith"
              icon={<Wrench className="h-4 w-4" />}
            />
            <MetricStatWidget
              metricSlug="layup_queue_size"
              title="Layup"
              icon={<Layers className="h-4 w-4" />}
            />
            <MetricStatWidget
              metricSlug="orders_in_production"
              title="In Production"
              icon={<BarChart3 className="h-4 w-4" />}
              valueClassName="text-blue-600 dark:text-blue-400"
            />
            <MetricStatWidget
              metricSlug="open_inventory_shortages"
              title="Shortages"
              icon={<Package className="h-4 w-4" />}
              valueClassName="text-red-600 dark:text-red-400"
            />
            <MetricStatWidget
              metricSlug="open_tickets"
              title="Open Tickets"
              icon={<Ticket className="h-4 w-4" />}
            />
            <MetricStatWidget
              metricSlug="cutting_table_active_items"
              title="Cutting Active"
            />
            <MetricStatWidget
              metricSlug="orders_completed_today"
              title="Completed Today"
              trend="up"
              trendLabel="today's throughput"
            />
          </div>
        </section>

        {/* ── Section 2: MetricStatGroup (bulk fetch) ────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
            MetricStatGroup — single bulk fetch
          </h2>
          <MetricStatGroup
            slugs={[
              'p1_queue_size',
              'barcode_queue_size',
              'finish_queue_size',
              'paint_queue_size',
              'shipping_queue_size',
            ]}
            label="Pipeline stages"
          />
        </section>

        {/* ── Section 3: DashboardGrid with PRODUCTION_OVERVIEW_LAYOUT ──────── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
            DashboardGrid — PRODUCTION_OVERVIEW_LAYOUT
          </h2>
          <DashboardGrid layout={PRODUCTION_OVERVIEW_LAYOUT} />
        </section>

        {/* ── Section 4: DashboardGrid with inline P2 layout ────────────────── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
            DashboardGrid — inline P2 layout
          </h2>
          <DashboardGrid layout={P2_LAYOUT} />
        </section>

      </div>
    </div>
  );
}
