import { FileText } from 'lucide-react';

interface DepartmentOrderNotesProps {
  notes?: string | null;
  departmentNotes?: Array<{ id?: string; text: string; departments?: string[] }> | null;
  currentDepartment?: string | null;
}

function normalizeDepartmentName(department?: string | null) {
  if (!department) return '';
  if (department === 'Layup') return 'Layup/Plugging';
  if (department === 'QC' || department === 'Shipping QC' || department === 'QC Shipping') return 'QC/Shipping';
  if (department === 'FinishQC') return 'Finish QC';
  return department;
}

function noteTargetsDepartment(noteDepartments: string[] | undefined, currentDepartment?: string | null) {
  if (!noteDepartments || noteDepartments.length === 0) return false;
  if (noteDepartments.includes('ALL')) return true;
  const normalizedCurrentDepartment = normalizeDepartmentName(currentDepartment);
  if (!normalizedCurrentDepartment) return false;
  return noteDepartments.some((department) => normalizeDepartmentName(department) === normalizedCurrentDepartment);
}

export default function DepartmentOrderNotes({ notes, departmentNotes, currentDepartment }: DepartmentOrderNotesProps) {
  const trimmedNotes = notes?.trim();
  const targetedNotes = Array.isArray(departmentNotes)
    ? departmentNotes
        .filter((note) => noteTargetsDepartment(note.departments, currentDepartment))
        .map((note) => note.text?.trim())
        .filter((note): note is string => Boolean(note))
    : [];

  if (!trimmedNotes && targetedNotes.length === 0) return null;

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
        <div className="min-w-0">
          <p className="font-semibold">Order Notes</p>
          {trimmedNotes && (
            <p className="mt-1 whitespace-pre-wrap break-words leading-snug">{trimmedNotes}</p>
          )}
          {targetedNotes.map((note, index) => (
            <p key={`${note}-${index}`} className="mt-1 whitespace-pre-wrap break-words leading-snug">
              {note}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
