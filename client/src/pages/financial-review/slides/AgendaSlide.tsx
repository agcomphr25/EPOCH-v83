import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Pencil, Check, X } from 'lucide-react';

interface Props {
  session: any;
  onSave: (fields: any) => void;
  saving: boolean;
}

const DEFAULT_AGENDA = `1. Financial Review
2. Products Shipped & Revenue
3. Quality Objectives & KPIs
4. Action Items Update
5. Customer Satisfaction
6. Business Development Pipeline
7. Risk & Opportunity
8. Calendar Review`;

export default function AgendaSlide({ session, onSave, saving }: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(session?.agenda_text ?? DEFAULT_AGENDA);

  function handleSave() {
    onSave({ agenda_text: text });
    setEditing(false);
  }

  return (
    <div className="h-full flex flex-col px-10 py-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Agenda</h2>
        {!editing && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4 mr-1" /> Edit
          </Button>
        )}
      </div>
      <div className="h-1 w-16 bg-blue-500 rounded mb-8" />

      {editing ? (
        <div className="flex-1 flex flex-col gap-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            className="flex-1 font-medium text-base"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Check className="h-4 w-4 mr-1" /> Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              <X className="h-4 w-4 mr-1" /> Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-1">
          <pre className="whitespace-pre-wrap font-sans text-xl leading-relaxed text-gray-700 dark:text-gray-200">
            {session?.agenda_text ?? DEFAULT_AGENDA}
          </pre>
        </div>
      )}
    </div>
  );
}
