import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil, Check, X } from 'lucide-react';

interface Props {
  session: any;
  onSave: (fields: any) => void;
  saving: boolean;
}

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function ASFinancialsSlide({ session, onSave, saving }: Props) {
  const [editing, setEditing] = useState(false);
  const [revenue, setRevenue] = useState(String(session?.as_revenue ?? ''));
  const [gm, setGm] = useState(String(session?.as_gross_margin_pct ?? ''));
  const [ni, setNi] = useState(String(session?.as_net_income ?? ''));

  function handleSave() {
    onSave({
      as_revenue: revenue !== '' ? Number(revenue) : null,
      as_gross_margin_pct: gm !== '' ? Number(gm) : null,
      as_net_income: ni !== '' ? Number(ni) : null,
    });
    setEditing(false);
  }

  const items = [
    { label: 'AS Revenue', value: fmt(session?.as_revenue) },
    { label: 'AS Gross Margin', value: session?.as_gross_margin_pct != null ? `${Number(session.as_gross_margin_pct).toFixed(1)}%` : '—' },
    { label: 'AS Net Income', value: fmt(session?.as_net_income) },
  ];

  return (
    <div className="h-full flex flex-col px-10 py-8">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">AS Financial Highlights</h2>
        {!editing && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4 mr-1" /> Edit
          </Button>
        )}
      </div>
      <div className="h-1 w-16 bg-blue-500 rounded mb-8" />

      <div className="grid grid-cols-3 gap-6 mb-8">
        {items.map((item) => (
          <div key={item.label} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 text-center">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">{item.label}</div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">{item.value}</div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="border rounded-lg p-4 bg-white dark:bg-gray-800">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>AS Revenue ($)</Label>
              <Input type="number" value={revenue} onChange={(e) => setRevenue(e.target.value)} placeholder="e.g. 180000" className="mt-1" />
            </div>
            <div>
              <Label>Gross Margin %</Label>
              <Input type="number" value={gm} onChange={(e) => setGm(e.target.value)} placeholder="e.g. 28.5" className="mt-1" />
            </div>
            <div>
              <Label>Net Income ($)</Label>
              <Input type="number" value={ni} onChange={(e) => setNi(e.target.value)} placeholder="e.g. 22000" className="mt-1" />
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
