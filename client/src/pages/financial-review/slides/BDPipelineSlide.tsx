import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Check, X } from 'lucide-react';

interface PipelineItem {
  name: string;
  value: string;
  pwin: string;
  status: 'prospect' | 'proposal' | 'negotiation' | 'won' | 'lost';
}

interface Props {
  session: any;
  onSave: (fields: any) => void;
  saving: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  prospect: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  proposal: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  negotiation: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  won: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  lost: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

function fmt(val: string) {
  const n = Number(val);
  if (isNaN(n)) return val;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function BDPipelineSlide({ session, onSave, saving }: Props) {
  const [editing, setEditing] = useState(false);
  const items: PipelineItem[] = session?.bd_pipeline ?? [];
  const [draft, setDraft] = useState<PipelineItem[]>(items);
  const [newItem, setNewItem] = useState<PipelineItem>({ name: '', value: '', pwin: '', status: 'prospect' });

  function addItem() {
    if (!newItem.name.trim()) return;
    setDraft([...draft, { ...newItem }]);
    setNewItem({ name: '', value: '', pwin: '', status: 'prospect' });
  }

  function removeItem(i: number) {
    setDraft(draft.filter((_, idx) => idx !== i));
  }

  function updateItem(i: number, field: keyof PipelineItem, value: string) {
    setDraft(draft.map((d, idx) => idx === i ? { ...d, [field]: value } : d));
  }

  function handleSave() {
    onSave({ bd_pipeline: draft });
    setEditing(false);
  }

  function handleCancel() {
    setDraft(items);
    setEditing(false);
  }

  const totalPWeighted = items.reduce((s, item) => {
    const v = Number(item.value) || 0;
    const p = Number(item.pwin) || 0;
    return s + v * (p / 100);
  }, 0);

  return (
    <div className="h-full flex flex-col px-10 py-8">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Business Development Pipeline</h2>
        {!editing && (
          <Button size="sm" variant="ghost" onClick={() => { setDraft(items); setEditing(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Edit
          </Button>
        )}
      </div>
      <div className="h-1 w-16 bg-blue-500 rounded mb-3" />

      {!editing && items.length > 0 && (
        <div className="mb-4">
          <span className="text-sm text-gray-500 dark:text-gray-400">P-Weighted Total: </span>
          <span className="font-bold text-gray-900 dark:text-white">{fmt(String(totalPWeighted))}</span>
        </div>
      )}

      {!editing ? (
        <div className="flex-1 overflow-auto">
          {items.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400 italic">
              No pipeline items. Click Edit to add.
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
                  <th className="text-left py-2 px-3 font-semibold">Opportunity</th>
                  <th className="text-right py-2 px-3 font-semibold">Value</th>
                  <th className="text-right py-2 px-3 font-semibold">P-Win</th>
                  <th className="text-left py-2 px-3 font-semibold">Stage</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-3 px-3 text-gray-900 dark:text-white font-medium">{item.name}</td>
                    <td className="py-3 px-3 text-right text-gray-700 dark:text-gray-300">{item.value ? fmt(item.value) : '—'}</td>
                    <td className="py-3 px-3 text-right text-gray-700 dark:text-gray-300">{item.pwin ? `${item.pwin}%` : '—'}</td>
                    <td className="py-3 px-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[item.status] ?? ''}`}>
                        {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-3 overflow-auto">
          <div className="flex-1 overflow-auto space-y-2">
            {draft.map((item, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input value={item.name} onChange={(e) => updateItem(i, 'name', e.target.value)} placeholder="Opportunity name" className="flex-1" />
                <Input value={item.value} onChange={(e) => updateItem(i, 'value', e.target.value)} placeholder="Value $" className="w-28" />
                <Input value={item.pwin} onChange={(e) => updateItem(i, 'pwin', e.target.value)} placeholder="P-Win %" className="w-24" />
                <Select value={item.status} onValueChange={(v) => updateItem(i, 'status', v)}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prospect">Prospect</SelectItem>
                    <SelectItem value="proposal">Proposal</SelectItem>
                    <SelectItem value="negotiation">Negotiation</SelectItem>
                    <SelectItem value="won">Won</SelectItem>
                    <SelectItem value="lost">Lost</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="icon" variant="ghost" onClick={() => removeItem(i)}>
                  <Trash2 className="h-4 w-4 text-red-400" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 items-center border-t pt-3">
            <Input value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} placeholder="Opportunity name" className="flex-1" />
            <Input value={newItem.value} onChange={(e) => setNewItem({ ...newItem, value: e.target.value })} placeholder="Value $" className="w-28" />
            <Input value={newItem.pwin} onChange={(e) => setNewItem({ ...newItem, pwin: e.target.value })} placeholder="P-Win %" className="w-24" />
            <Select value={newItem.status} onValueChange={(v) => setNewItem({ ...newItem, status: v as any })}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="prospect">Prospect</SelectItem>
                <SelectItem value="proposal">Proposal</SelectItem>
                <SelectItem value="negotiation">Negotiation</SelectItem>
                <SelectItem value="won">Won</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-4 w-4" /></Button>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving}><Check className="h-4 w-4 mr-1" /> Save</Button>
            <Button size="sm" variant="ghost" onClick={handleCancel}><X className="h-4 w-4 mr-1" /> Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
