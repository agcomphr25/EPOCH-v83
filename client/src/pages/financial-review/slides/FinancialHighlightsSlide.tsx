import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil, Check, X } from 'lucide-react';

interface Props {
  session: any;
  onSave: (fields: any) => void;
  saving: boolean;
}

interface RevenueRow { month: string; revenue: string; }
interface KpiData {
  otdPercent: number | null;
  ncrCount: number;
  revenueGrowthPct: number | null;
  recentRevenue: number;
  priorRevenue: number;
}

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number | null | undefined) {
  if (n == null) return '—';
  return `${n.toFixed(1)}%`;
}

export default function FinancialHighlightsSlide({ session, onSave, saving }: Props) {
  const [editing, setEditing] = useState(false);
  const [grossMargin, setGrossMargin] = useState(String(session?.gross_margin_pct ?? ''));
  const [netIncome, setNetIncome] = useState(String(session?.net_income ?? ''));
  const [cashBalance, setCashBalance] = useState(String(session?.cash_balance ?? ''));

  const { data: revenueData = [] } = useQuery<RevenueRow[]>({
    queryKey: ['/api/financial-review/live/revenue'],
  });

  const { data: kpis } = useQuery<KpiData>({
    queryKey: ['/api/financial-review/live/kpis'],
  });

  const totalRevenue = revenueData.reduce((s, r) => s + Number(r.revenue), 0);

  function handleSave() {
    onSave({
      gross_margin_pct: grossMargin !== '' ? Number(grossMargin) : null,
      net_income: netIncome !== '' ? Number(netIncome) : null,
      cash_balance: cashBalance !== '' ? Number(cashBalance) : null,
    });
    setEditing(false);
  }

  const kpiItems = [
    { label: '6-Month CC Revenue', value: fmt(totalRevenue), live: true },
    { label: 'Revenue Growth (QoQ)', value: kpis?.revenueGrowthPct != null ? `${kpis.revenueGrowthPct > 0 ? '+' : ''}${kpis.revenueGrowthPct}%` : '—', live: true },
    { label: 'Gross Margin', value: fmtPct(session?.gross_margin_pct) },
    { label: 'Net Income', value: fmt(session?.net_income) },
    { label: 'Cash Balance', value: fmt(session?.cash_balance) },
  ];

  return (
    <div className="h-full flex flex-col px-10 py-8">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Financial Highlights</h2>
        {!editing && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4 mr-1" /> Edit Manual Fields
          </Button>
        )}
      </div>
      <div className="h-1 w-16 bg-blue-500 rounded mb-6" />

      <div className="grid grid-cols-2 gap-4 flex-1">
        {kpiItems.map((item) => (
          <div key={item.label} className={`rounded-xl p-5 flex flex-col gap-1 ${item.live ? 'bg-blue-50 dark:bg-blue-900/30' : 'bg-gray-50 dark:bg-gray-800'}`}>
            <div className="text-sm text-gray-500 dark:text-gray-400">{item.label}</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{item.value}</div>
            {item.live && <div className="text-xs text-blue-400">Live</div>}
          </div>
        ))}
      </div>

      {editing && (
        <div className="mt-4 border rounded-lg p-4 bg-white dark:bg-gray-800">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Gross Margin %</Label>
              <Input type="number" value={grossMargin} onChange={(e) => setGrossMargin(e.target.value)} placeholder="e.g. 32.5" className="mt-1" />
            </div>
            <div>
              <Label>Net Income ($)</Label>
              <Input type="number" value={netIncome} onChange={(e) => setNetIncome(e.target.value)} placeholder="e.g. 45000" className="mt-1" />
            </div>
            <div>
              <Label>Cash Balance ($)</Label>
              <Input type="number" value={cashBalance} onChange={(e) => setCashBalance(e.target.value)} placeholder="e.g. 250000" className="mt-1" />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={handleSave} disabled={saving}><Check className="h-4 w-4 mr-1" /> Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X className="h-4 w-4 mr-1" /> Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
