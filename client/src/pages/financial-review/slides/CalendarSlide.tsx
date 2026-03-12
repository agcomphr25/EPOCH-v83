import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Check, X } from 'lucide-react';

interface CalEvent {
  term: 'short' | 'mid' | 'long';
  event: string;
}

interface Props {
  session: any;
  onSave: (fields: any) => void;
  saving: boolean;
}

const TERM_LABELS: Record<string, string> = {
  short: 'Short-Term (0–30d)',
  mid: 'Mid-Term (1–3 mo)',
  long: 'Long-Term (3+ mo)',
};

const TERM_COLORS: Record<string, string> = {
  short: 'bg-green-50 dark:bg-green-900/20',
  mid: 'bg-yellow-50 dark:bg-yellow-900/20',
  long: 'bg-blue-50 dark:bg-blue-900/20',
};

const TERMS: Array<'short' | 'mid' | 'long'> = ['short', 'mid', 'long'];

export default function CalendarSlide({ session, onSave, saving }: Props) {
  const [editing, setEditing] = useState(false);
  const items: CalEvent[] = session?.calendar_events ?? [];
  const [draft, setDraft] = useState<CalEvent[]>(items);
  const [newItem, setNewItem] = useState<CalEvent>({ term: 'short', event: '' });

  function addItem() {
    if (!newItem.event.trim()) return;
    setDraft([...draft, { ...newItem }]);
    setNewItem({ term: 'short', event: '' });
  }

  function removeItem(i: number) {
    setDraft(draft.filter((_, idx) => idx !== i));
  }

  function handleSave() {
    onSave({ calendar_events: draft });
    setEditing(false);
  }

  function handleCancel() {
    setDraft(items);
    setEditing(false);
  }

  const grouped = TERMS.map((term) => ({
    term,
    events: items.filter((e) => e.term === term),
  }));

  return (
    <div className="h-full flex flex-col px-10 py-8">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Calendar Review</h2>
        {!editing && (
          <Button size="sm" variant="ghost" onClick={() => { setDraft(items); setEditing(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Edit
          </Button>
        )}
      </div>
      <div className="h-1 w-16 bg-blue-500 rounded mb-4" />

      {!editing ? (
        <div className="flex-1 grid grid-cols-3 gap-4">
          {grouped.map(({ term, events }) => (
            <div key={term} className={`rounded-xl p-4 ${TERM_COLORS[term]}`}>
              <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{TERM_LABELS[term]}</div>
              {events.length === 0 ? (
                <div className="text-gray-400 text-sm italic">No events</div>
              ) : (
                <ul className="space-y-2">
                  {events.map((e, i) => (
                    <li key={i} className="text-gray-800 dark:text-gray-200 text-sm flex items-start gap-2">
                      <span className="mt-1 w-1.5 h-1.5 rounded-full bg-gray-500 flex-shrink-0" />
                      {e.event}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-3 overflow-auto">
          <div className="flex-1 overflow-auto space-y-2">
            {draft.map((item, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Select value={item.term} onValueChange={(v) => setDraft(draft.map((d, idx) => idx === i ? { ...d, term: v as any } : d))}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">Short-Term</SelectItem>
                    <SelectItem value="mid">Mid-Term</SelectItem>
                    <SelectItem value="long">Long-Term</SelectItem>
                  </SelectContent>
                </Select>
                <Input value={item.event} onChange={(e) => setDraft(draft.map((d, idx) => idx === i ? { ...d, event: e.target.value } : d))} placeholder="Event description" className="flex-1" />
                <Button size="icon" variant="ghost" onClick={() => removeItem(i)}>
                  <Trash2 className="h-4 w-4 text-red-400" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 items-center border-t pt-3">
            <Select value={newItem.term} onValueChange={(v) => setNewItem({ ...newItem, term: v as any })}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="short">Short-Term</SelectItem>
                <SelectItem value="mid">Mid-Term</SelectItem>
                <SelectItem value="long">Long-Term</SelectItem>
              </SelectContent>
            </Select>
            <Input value={newItem.event} onChange={(e) => setNewItem({ ...newItem, event: e.target.value })} placeholder="Event description" className="flex-1" />
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
