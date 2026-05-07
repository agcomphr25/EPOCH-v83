import { apiRequest } from './queryClient';

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
  source: 'context-capture' | 'dashboard';
  createdByUserId?: number | null;
  createdByDisplayName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImprovementNoteInput {
  title: string;
  details?: string;
  role: string;
  workflow: string;
  type: ImprovementNoteType;
  priority: ImprovementNotePriority;
  status?: ImprovementNoteStatus;
  pagePath?: string;
  pageTitle?: string;
  pageUrl?: string;
  source?: 'context-capture' | 'dashboard';
}

export const IMPROVEMENT_NOTES_QUERY_KEY = ['/api/improvement-notes'] as const;

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

export async function fetchImprovementNotes(): Promise<ImprovementNote[]> {
  return (await apiRequest('/api/improvement-notes')) as ImprovementNote[];
}

export async function createImprovementNote(input: ImprovementNoteInput): Promise<ImprovementNote> {
  return (await apiRequest('/api/improvement-notes', {
    method: 'POST',
    body: input,
  })) as ImprovementNote;
}

export async function updateImprovementNote(
  noteId: string,
  patch: Partial<ImprovementNoteInput>,
): Promise<ImprovementNote> {
  return (await apiRequest(`/api/improvement-notes/${noteId}`, {
    method: 'PATCH',
    body: patch,
  })) as ImprovementNote;
}

export async function deleteImprovementNote(noteId: string): Promise<void> {
  await apiRequest(`/api/improvement-notes/${noteId}`, { method: 'DELETE' });
}
