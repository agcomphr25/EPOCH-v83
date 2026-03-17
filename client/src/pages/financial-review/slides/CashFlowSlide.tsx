import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Pencil, Check, X } from 'lucide-react';

interface Props {
  session: any;
  onSave: (fields: any) => void;
  saving: boolean;
}

export default function CashFlowSlide({ session, onSave, saving }: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(session?.cash_forecast_notes ?? '');

  function handleSave() {
    onSave({ cash_forecast_notes: text });
    setEditing(false);
  }

  return (
    <div className="h-full flex flex-col px-10 py-8">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Cash Flow Projection</h2>
        {!editing && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4 mr-1" /> Edit
          </Button>
        )}
      </div>
      <div className="h-1 w-16 bg-blue-500 rounded mb-6" />

      {editing ? (
        <div className="flex-1 flex flex-col gap-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            placeholder="Enter cash flow projections, notes, and forecasts…"
            className="flex-1"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving}><Check className="h-4 w-4 mr-1" /> Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X className="h-4 w-4 mr-1" /> Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="flex-1">
          {session?.cash_forecast_notes ? (
            <pre className="whitespace-pre-wrap font-sans text-lg leading-relaxed text-gray-700 dark:text-gray-200">
              {session.cash_forecast_notes}
            </pre>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 italic">
              Click Edit to add cash flow notes
            </div>
          )}
        </div>
      )}
    </div>
  );
}
