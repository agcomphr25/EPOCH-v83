import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ClipboardList, Lightbulb, MessageSquarePlus, X } from 'lucide-react';
import {
  makeImprovementNoteId,
  notePriorities,
  noteTypes,
  roleOptions,
  saveImprovementNote,
  workflowOptions,
  type ImprovementNotePriority,
  type ImprovementNoteType,
} from '@/lib/improvementNotes';

export default function ImprovementNoteCapture() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [role, setRole] = useState('Inventory Manager');
  const [workflow, setWorkflow] = useState('PO creation');
  const [type, setType] = useState<ImprovementNoteType>('pain-point');
  const [priority, setPriority] = useState<ImprovementNotePriority>('medium');

  const context = useMemo(() => {
    if (typeof window === 'undefined') {
      return { pageTitle: 'EPOCH', pagePath: location, pageUrl: location };
    }

    return {
      pageTitle: document.title || 'EPOCH',
      pagePath: window.location.pathname,
      pageUrl: window.location.href,
    };
  }, [location, open]);

  const resetForm = () => {
    setTitle('');
    setDetails('');
    setRole('Inventory Manager');
    setWorkflow('PO creation');
    setType('pain-point');
    setPriority('medium');
  };

  const submitNote = () => {
    const now = new Date().toISOString();
    saveImprovementNote({
      id: makeImprovementNoteId(),
      title: title.trim() || `${workflow} improvement`,
      details: details.trim(),
      role,
      workflow,
      type,
      priority,
      status: 'new',
      pagePath: context.pagePath,
      pageTitle: context.pageTitle,
      pageUrl: context.pageUrl,
      createdAt: now,
      updatedAt: now,
      source: 'context-capture',
    });
    resetForm();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <>
      <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3">
        {saved && (
          <div className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 shadow-lg">
            Note captured
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-12 items-center gap-2 rounded-full bg-slate-950 px-4 text-sm font-semibold text-white shadow-xl shadow-slate-900/20 transition hover:bg-slate-800"
          title="Capture an improvement note for this page"
        >
          <MessageSquarePlus className="h-5 w-5" />
          Add note
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-slate-950/30 p-4 backdrop-blur-sm sm:p-6">
          <div className="w-full max-w-xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-cyan-700">
                  <Lightbulb className="h-4 w-4" />
                  Context-aware improvement note
                </div>
                <h2 className="mt-1 text-xl font-bold text-slate-950">Capture what would help</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="rounded-md border border-cyan-100 bg-cyan-50 px-3 py-2 text-sm text-cyan-950">
                Capturing this page: <span className="font-semibold">{context.pagePath}</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  Role
                  <select
                    value={role}
                    onChange={event => setRole(event.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    {roleOptions.map(option => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 text-sm font-medium text-slate-700">
                  Workflow
                  <select
                    value={workflow}
                    onChange={event => setWorkflow(event.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    {workflowOptions.map(option => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 text-sm font-medium text-slate-700">
                  Note type
                  <select
                    value={type}
                    onChange={event => setType(event.target.value as ImprovementNoteType)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    {noteTypes.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 text-sm font-medium text-slate-700">
                  Priority
                  <select
                    value={priority}
                    onChange={event => setPriority(event.target.value as ImprovementNotePriority)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    {notePriorities.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="space-y-1 text-sm font-medium text-slate-700">
                Short title
                <input
                  value={title}
                  onChange={event => setTitle(event.target.value)}
                  placeholder="Example: Need item history while creating PO"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1 text-sm font-medium text-slate-700">
                What happened or what would help?
                <textarea
                  value={details}
                  onChange={event => setDetails(event.target.value)}
                  placeholder="Write it the way she says it. The page, role, workflow, and timestamp are captured automatically."
                  rows={5}
                  className="w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <Link href="/improvement-notes">
                <a className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-950">
                  <ClipboardList className="h-4 w-4" />
                  View dashboard
                </a>
              </Link>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitNote}
                  className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700"
                >
                  Save note
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
