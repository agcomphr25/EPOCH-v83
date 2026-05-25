import { FileText } from 'lucide-react';

interface DepartmentOrderNotesProps {
  notes?: string | null;
}

export default function DepartmentOrderNotes({ notes }: DepartmentOrderNotesProps) {
  const trimmedNotes = notes?.trim();
  if (!trimmedNotes) return null;

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
        <div className="min-w-0">
          <p className="font-semibold">Order Notes</p>
          <p className="mt-1 whitespace-pre-wrap break-words leading-snug">{trimmedNotes}</p>
        </div>
      </div>
    </div>
  );
}
