import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ClipboardList, Download, Filter, Lightbulb, Search } from 'lucide-react';
import {
  noteStatuses,
  readImprovementNotes,
  updateImprovementNote,
  type ImprovementNote,
  type ImprovementNoteStatus,
} from '@/lib/improvementNotes';

const priorityStyles: Record<string, string> = {
  high: 'border-rose-200 bg-rose-50 text-rose-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  low: 'border-slate-200 bg-slate-50 text-slate-600',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function ImprovementNotesDashboard() {
  const [notes, setNotes] = useState<ImprovementNote[]>(() => readImprovementNotes());
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [workflowFilter, setWorkflowFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const refresh = () => setNotes(readImprovementNotes());
    window.addEventListener('storage', refresh);
    window.addEventListener('epoch:improvement-notes-updated', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('epoch:improvement-notes-updated', refresh);
    };
  }, []);

  const roles = useMemo(() => Array.from(new Set(notes.map(note => note.role))).sort(), [notes]);
  const workflows = useMemo(() => Array.from(new Set(notes.map(note => note.workflow))).sort(), [notes]);

  const filteredNotes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return notes.filter(note => {
      const matchesSearch = !needle || [
        note.title,
        note.details,
        note.role,
        note.workflow,
        note.pagePath,
      ].some(value => value.toLowerCase().includes(needle));

      return (
        matchesSearch &&
        (roleFilter === 'all' || note.role === roleFilter) &&
        (workflowFilter === 'all' || note.workflow === workflowFilter) &&
        (statusFilter === 'all' || note.status === statusFilter)
      );
    });
  }, [notes, query, roleFilter, statusFilter, workflowFilter]);

  const stats = useMemo(() => {
    return {
      total: notes.length,
      high: notes.filter(note => note.priority === 'high').length,
      new: notes.filter(note => note.status === 'new').length,
      workflows: workflows.length,
    };
  }, [notes, workflows.length]);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `epoch-improvement-notes-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-cyan-700">
                <Lightbulb className="h-4 w-4" />
                Workflow improvement capture
              </div>
              <h1 className="mt-2 text-3xl font-bold text-slate-950">Improvement Notes Dashboard</h1>
              <p className="mt-2 max-w-3xl text-slate-600">
                Centralized notes from live screens, organized by role, workflow, priority, and status.
              </p>
            </div>
            <button
              type="button"
              onClick={exportJson}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              <Download className="h-4 w-4" />
              Export notes
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-6 py-6">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-sm font-medium text-slate-500">Total notes</div>
            <div className="mt-2 text-3xl font-bold text-slate-950">{stats.total}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-sm font-medium text-slate-500">New</div>
            <div className="mt-2 text-3xl font-bold text-cyan-700">{stats.new}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-sm font-medium text-slate-500">High priority</div>
            <div className="mt-2 text-3xl font-bold text-rose-600">{stats.high}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-sm font-medium text-slate-500">Workflows touched</div>
            <div className="mt-2 text-3xl font-bold text-slate-950">{stats.workflows}</div>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_180px_200px_160px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search notes, pages, people, workflows"
                className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm"
              />
            </label>

            <select
              value={roleFilter}
              onChange={event => setRoleFilter(event.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="all">All roles</option>
              {roles.map(role => (
                <option key={role}>{role}</option>
              ))}
            </select>

            <select
              value={workflowFilter}
              onChange={event => setWorkflowFilter(event.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="all">All workflows</option>
              {workflows.map(workflow => (
                <option key={workflow}>{workflow}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="all">All statuses</option>
              {noteStatuses.map(status => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          {filteredNotes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
              <ClipboardList className="mx-auto h-10 w-10 text-slate-400" />
              <h2 className="mt-4 text-lg font-bold text-slate-900">No notes captured yet</h2>
              <p className="mt-2 text-sm text-slate-600">
                Use the Add note button on any workflow page to capture role, workflow, page, and timestamp automatically.
              </p>
            </div>
          ) : filteredNotes.map(note => (
            <article key={note.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-bold uppercase ${priorityStyles[note.priority]}`}>
                      {note.priority}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {note.role}
                    </span>
                    <span className="rounded-full border border-cyan-100 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700">
                      {note.workflow}
                    </span>
                  </div>
                  <h2 className="mt-3 text-xl font-bold text-slate-950">{note.title}</h2>
                  {note.details && (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{note.details}</p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                    <span>{formatDate(note.createdAt)}</span>
                    <span>{note.pagePath}</span>
                    <a href={note.pageUrl} className="inline-flex items-center gap-1 font-semibold text-cyan-700 hover:text-cyan-900">
                      Open source page
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Filter className="h-4 w-4 text-slate-400" />
                  <select
                    value={note.status}
                    onChange={event => updateImprovementNote(note.id, { status: event.target.value as ImprovementNoteStatus })}
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    {noteStatuses.map(status => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
