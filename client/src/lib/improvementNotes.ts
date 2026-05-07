export type ImprovementNoteStatus = 'new' | 'reviewed' | 'planned' | 'built';

export type ImprovementNoteType =
  | 'pain-point'
  | 'missing-info'
  | 'repeated-task'
  | 'bug'
  | 'idea';

export type ImprovementNotePriority = 'low' | 'medium' | 'high';

export interface ImprovementNote {
  id: string;
  title: string;
  details: string;
  role: string;
  workflow: string;
  type: ImprovementNoteType;
  priority: ImprovementNotePriority;
  status: ImprovementNoteStatus;
  pagePath: string;
  pageTitle: string;
  pageUrl: string;
  createdAt: string;
  updatedAt: string;
  source: 'context-capture' | 'dashboard';
}

export const IMPROVEMENT_NOTES_STORAGE_KEY = 'epoch.improvementNotes.v1';

export const noteTypes: { value: ImprovementNoteType; label: string }[] = [
  { value: 'pain-point', label: 'Pain point' },
  { value: 'missing-info', label: 'Missing info' },
  { value: 'repeated-task', label: 'Repeated task' },
  { value: 'bug', label: 'Bug' },
  { value: 'idea', label: 'Idea' },
];

export const notePriorities: { value: ImprovementNotePriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export const noteStatuses: { value: ImprovementNoteStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'planned', label: 'Planned' },
  { value: 'built', label: 'Built' },
];

export const roleOptions = [
  'Inventory Manager',
  'CSR',
  'Production Manager',
  'Owner',
  'Accounting',
  'Quality',
  'Shipping',
  'Other',
];

export const workflowOptions = [
  'PO creation',
  'Inventory lookup',
  'Receiving',
  'Customer order',
  'Production movement',
  'Scheduling',
  'Invoicing',
  'Audit evidence',
  'Other',
];

export function makeImprovementNoteId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function readImprovementNotes(): ImprovementNote[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(IMPROVEMENT_NOTES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeImprovementNotes(notes: ImprovementNote[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(IMPROVEMENT_NOTES_STORAGE_KEY, JSON.stringify(notes));
}

export function saveImprovementNote(note: ImprovementNote) {
  const notes = readImprovementNotes();
  const next = [note, ...notes.filter(existing => existing.id !== note.id)];
  writeImprovementNotes(next);
  window.dispatchEvent(new CustomEvent('epoch:improvement-notes-updated'));
}

export function updateImprovementNote(noteId: string, patch: Partial<ImprovementNote>) {
  const notes = readImprovementNotes();
  const now = new Date().toISOString();
  const next = notes.map(note =>
    note.id === noteId ? { ...note, ...patch, updatedAt: now } : note
  );
  writeImprovementNotes(next);
  window.dispatchEvent(new CustomEvent('epoch:improvement-notes-updated'));
}
