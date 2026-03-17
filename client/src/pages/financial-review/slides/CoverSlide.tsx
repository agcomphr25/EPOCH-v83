import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil, Check, X } from 'lucide-react';

interface Props {
  session: any;
  monthLabel: string;
  onSave: (fields: any) => void;
  saving: boolean;
}

export default function CoverSlide({ session, monthLabel, onSave, saving }: Props) {
  const [editing, setEditing] = useState(false);
  const [reviewDate, setReviewDate] = useState(session?.review_date ?? '');

  function handleSave() {
    onSave({ review_date: reviewDate });
    setEditing(false);
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-16 px-8">
      <div className="text-sm uppercase tracking-widest text-blue-500 font-semibold mb-2">Monthly Business Review</div>
      <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-4">{monthLabel}</h1>
      <div className="h-1 w-24 bg-blue-500 rounded mb-6" />

      {editing ? (
        <div className="flex items-center gap-2 mt-4">
          <div>
            <Label className="text-sm text-gray-500">Review Date</Label>
            <Input
              type="text"
              placeholder="e.g. March 12, 2026"
              value={reviewDate}
              onChange={(e) => setReviewDate(e.target.value)}
              className="mt-1 w-64"
            />
          </div>
          <div className="flex gap-1 mt-5">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Check className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-lg mt-2">
          <span>{session?.review_date || 'No review date set'}</span>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <div className="mt-12 text-gray-400 text-sm">AG Composites — Confidential</div>
    </div>
  );
}
