import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Search,
  Plus,
  FileText,
  Table2,
  Share2,
  Pencil,
  Trash2,
  X,
  UserPlus,
  ChevronRight,
  StickyNote,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type QuickNoteShare = {
  id: number;
  noteId: number;
  sharedWithUserId: number;
  sharedWithDisplayName: string;
  createdAt: string;
};

type QuickNote = {
  id: number;
  title: string;
  content: string;
  format: 'text' | 'spreadsheet';
  tags: string[] | null;
  createdByUserId: number;
  createdByDisplayName: string;
  createdAt: string;
  updatedAt: string;
  isOwned: boolean;
  sharedBy: string | null;
  shares: QuickNoteShare[];
};

type UserOption = {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
};

const EMPTY_GRID = Array.from({ length: 10 }, () => Array(5).fill(''));

function parseGrid(content: string): string[][] {
  if (!content.trim()) return EMPTY_GRID;
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return EMPTY_GRID;
}

function colLetterToIndex(col: string): number {
  let result = 0;
  for (let i = 0; i < col.length; i++) result = result * 26 + (col.toUpperCase().charCodeAt(i) - 64);
  return result - 1;
}

function getCellNumeric(ref: string, grid: string[][], depth: number): number {
  const m = ref.match(/^([A-Za-z]+)(\d+)$/);
  if (!m) return 0;
  const col = colLetterToIndex(m[1]);
  const row = parseInt(m[2]) - 1;
  if (row < 0 || row >= grid.length || col < 0 || col >= (grid[0]?.length ?? 0)) return 0;
  const val = grid[row][col];
  if (!val) return 0;
  if (val.startsWith('=')) return parseFloat(evaluateFormula(val, grid, depth + 1)) || 0;
  return parseFloat(val) || 0;
}

function getRangeNums(from: string, to: string, grid: string[][], depth: number): number[] {
  const fm = from.match(/^([A-Za-z]+)(\d+)$/);
  const tm = to.match(/^([A-Za-z]+)(\d+)$/);
  if (!fm || !tm) return [];
  const r1 = parseInt(fm[2]) - 1, r2 = parseInt(tm[2]) - 1;
  const c1 = colLetterToIndex(fm[1]), c2 = colLetterToIndex(tm[1]);
  const nums: number[] = [];
  for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
      if (r >= 0 && r < grid.length && c >= 0 && c < (grid[0]?.length ?? 0)) {
        const v = grid[r][c];
        if (!v) continue;
        const n = v.startsWith('=') ? parseFloat(evaluateFormula(v, grid, depth + 1)) || 0 : parseFloat(v);
        if (!isNaN(n)) nums.push(n);
      }
    }
  }
  return nums;
}

function evaluateFormula(formula: string, grid: string[][], depth = 0): string {
  if (depth > 10) return '#CIRCULAR!';
  if (!formula.startsWith('=')) return formula;
  try {
    let expr = formula.slice(1).trim();

    expr = expr.replace(/([A-Za-z]+)\s*\(([^)]*)\)/g, (_, fnName, argsStr) => {
      const fn = fnName.toUpperCase();
      const nums: number[] = [];
      for (const arg of argsStr.split(',').map((a: string) => a.trim())) {
        if (!arg) continue;
        const rng = arg.match(/^([A-Za-z]+\d+)\s*:\s*([A-Za-z]+\d+)$/);
        if (rng) { nums.push(...getRangeNums(rng[1], rng[2], grid, depth)); continue; }
        const cel = arg.match(/^([A-Za-z]+\d+)$/);
        if (cel) { nums.push(getCellNumeric(arg, grid, depth)); continue; }
        const n = parseFloat(arg);
        if (!isNaN(n)) nums.push(n);
      }
      switch (fn) {
        case 'SUM':     return String(nums.reduce((a, b) => a + b, 0));
        case 'AVERAGE': return nums.length ? String(nums.reduce((a, b) => a + b, 0) / nums.length) : '0';
        case 'MIN':     return nums.length ? String(Math.min(...nums)) : '0';
        case 'MAX':     return nums.length ? String(Math.max(...nums)) : '0';
        case 'COUNT':   return String(nums.length);
        case 'ROUND':   return nums.length >= 2 ? String(Math.round(nums[0] * 10 ** nums[1]) / 10 ** nums[1]) : String(Math.round(nums[0] ?? 0));
        case 'ABS':     return String(Math.abs(nums[0] ?? 0));
        case 'SQRT':    return String(Math.sqrt(nums[0] ?? 0));
        default:        return '#NAME?';
      }
    });

    expr = expr.replace(/\b([A-Za-z]+\d+)\b/g, (ref) => String(getCellNumeric(ref, grid, depth)));

    if (!/^[0-9+\-*/().%\s]+$/.test(expr)) return '#ERROR!';
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr})`)() as number;
    if (!isFinite(result)) return '#DIV/0!';
    if (isNaN(result)) return '#ERROR!';
    return Number.isInteger(result) ? String(result) : String(parseFloat(result.toFixed(10)));
  } catch {
    return '#ERROR!';
  }
}

function SpreadsheetEditor({
  content,
  onChange,
}: {
  content: string;
  onChange: (val: string) => void;
}) {
  const grid = parseGrid(content);
  const rows = Math.max(grid.length, 10);
  const cols = Math.max(grid[0]?.length ?? 0, 5);
  const [focusedCell, setFocusedCell] = useState<{ r: number; c: number } | null>(null);

  const fullGrid: string[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => grid[r]?.[c] ?? '')
  );

  const handleCell = (r: number, c: number, val: string) => {
    const next = fullGrid.map((row) => [...row]);
    next[r][c] = val;
    onChange(JSON.stringify(next));
  };

  const addRow = () => {
    const next = [...fullGrid, Array(cols).fill('')];
    onChange(JSON.stringify(next));
  };

  const addCol = () => {
    const next = fullGrid.map((row) => [...row, '']);
    onChange(JSON.stringify(next));
  };

  return (
    <div className="overflow-auto border rounded">
      <div className="flex items-center gap-1 p-1 border-b bg-gray-50">
        <Button size="sm" variant="ghost" onClick={addRow} className="text-xs h-6">
          + Row
        </Button>
        <Button size="sm" variant="ghost" onClick={addCol} className="text-xs h-6">
          + Col
        </Button>
        <span className="text-xs text-gray-400 ml-2">
          Formulas: =SUM(A1:A5) · =A1+B2 · =AVERAGE · =MIN · =MAX · =ROUND · =ABS · =SQRT
        </span>
      </div>
      <table className="border-collapse min-w-full">
        <tbody>
          {fullGrid.map((row, r) => (
            <tr key={r}>
              <td className="text-xs text-gray-400 px-1 border-r bg-gray-50 select-none w-6 text-center">
                {r + 1}
              </td>
              {row.map((cell, c) => {
                const isFocused = focusedCell?.r === r && focusedCell?.c === c;
                const isFormula = cell.startsWith('=');
                const evaluated = isFormula && !isFocused ? evaluateFormula(cell, fullGrid) : cell;
                const isError = isFormula && !isFocused && evaluated.startsWith('#');
                return (
                  <td key={c} className="p-0 border border-gray-200">
                    <input
                      className={cn(
                        'w-full min-w-[80px] px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400',
                        isFormula && !isFocused && !isError && 'text-blue-700 bg-blue-50/30',
                        isError && 'text-red-500'
                      )}
                      value={evaluated}
                      onChange={(e) => handleCell(r, c, e.target.value)}
                      onFocus={() => setFocusedCell({ r, c })}
                      onBlur={() => setFocusedCell(null)}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SpreadsheetViewer({ content }: { content: string }) {
  const grid = parseGrid(content);
  if (grid.every((r) => r.every((c) => !c))) {
    return <p className="text-gray-400 italic text-sm">Empty spreadsheet</p>;
  }
  return (
    <div className="overflow-auto border rounded">
      <table className="border-collapse min-w-full">
        <tbody>
          {grid.map((row, r) => (
            <tr key={r}>
              <td className="text-xs text-gray-400 px-1 border-r bg-gray-50 select-none w-6 text-center">
                {r + 1}
              </td>
              {row.map((cell, c) => {
                const isFormula = cell.startsWith('=');
                const display = isFormula ? evaluateFormula(cell, grid) : cell;
                const isError = isFormula && display.startsWith('#');
                return (
                  <td
                    key={c}
                    className={cn(
                      'px-2 py-1 text-sm border border-gray-200 whitespace-pre-wrap',
                      isFormula && !isError && 'text-blue-700',
                      isError && 'text-red-500'
                    )}
                  >
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function QuickNotesPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QuickNote | null>(null);
  const [shareSearch, setShareSearch] = useState('');

  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [draftFormat, setDraftFormat] = useState<'text' | 'spreadsheet'>('text');

  const { data: notes = [], isLoading } = useQuery<QuickNote[]>({
    queryKey: ['/api/quick-notes', search],
    queryFn: async () => {
      const url = search
        ? `/api/quick-notes?search=${encodeURIComponent(search)}`
        : '/api/quick-notes';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch notes');
      return res.json();
    },
  });

  const { data: allUsers = [] } = useQuery<UserOption[]>({
    queryKey: ['/api/quick-notes/users/search'],
  });

  const selectedNote = notes.find((n) => n.id === selectedId) ?? null;

  const createMutation = useMutation({
    mutationFn: (data: { title: string; content: string; format: string }) =>
      apiRequest('/api/quick-notes', { method: 'POST', body: data }),
    onSuccess: (note: QuickNote) => {
      queryClient.invalidateQueries({ queryKey: ['/api/quick-notes'] });
      setShowCreate(false);
      setSelectedId(note.id);
      setDraftTitle('');
      setDraftContent('');
      setDraftFormat('text');
      toast({ title: 'Note created' });
    },
    onError: () => toast({ title: 'Failed to create note', variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: { title?: string; content?: string; format?: string };
    }) => apiRequest(`/api/quick-notes/${id}`, { method: 'PATCH', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quick-notes'] });
      setEditing(false);
      toast({ title: 'Note saved' });
    },
    onError: () => toast({ title: 'Failed to save note', variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/quick-notes/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quick-notes'] });
      setSelectedId(null);
      setDeleteTarget(null);
      toast({ title: 'Note deleted' });
    },
    onError: () => toast({ title: 'Failed to delete note', variant: 'destructive' }),
  });

  const shareMutation = useMutation({
    mutationFn: ({ noteId, userId }: { noteId: number; userId: number }) =>
      apiRequest(`/api/quick-notes/${noteId}/share`, { method: 'POST', body: { userId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quick-notes'] });
      toast({ title: 'Note shared' });
    },
    onError: () => toast({ title: 'Failed to share note', variant: 'destructive' }),
  });

  const unshareMutation = useMutation({
    mutationFn: ({ noteId, shareId }: { noteId: number; shareId: number }) =>
      apiRequest(`/api/quick-notes/${noteId}/share/${shareId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quick-notes'] });
      toast({ title: 'Share removed' });
    },
    onError: () => toast({ title: 'Failed to remove share', variant: 'destructive' }),
  });

  const openCreate = () => {
    setDraftTitle('');
    setDraftContent('');
    setDraftFormat('text');
    setShowCreate(true);
  };

  const openEdit = (note: QuickNote) => {
    setDraftTitle(note.title);
    setDraftContent(note.content);
    setDraftFormat(note.format);
    setEditing(true);
  };

  const saveEdit = () => {
    if (!selectedNote) return;
    updateMutation.mutate({
      id: selectedNote.id,
      data: { title: draftTitle, content: draftContent, format: draftFormat },
    });
  };

  const submitCreate = () => {
    if (!draftTitle.trim()) return;
    createMutation.mutate({ title: draftTitle, content: draftContent, format: draftFormat });
  };

  const eligibleUsers = useMemo(() => {
    if (!selectedNote) return [];
    const sharedIds = new Set(selectedNote.shares.map((s) => s.sharedWithUserId));
    return allUsers.filter(
      (u) =>
        u.isActive &&
        u.id !== selectedNote.createdByUserId &&
        !sharedIds.has(u.id) &&
        (!shareSearch ||
          `${u.firstName} ${u.lastName}`.toLowerCase().includes(shareSearch.toLowerCase()) ||
          u.username.toLowerCase().includes(shareSearch.toLowerCase()))
    );
  }, [allUsers, selectedNote, shareSearch]);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0 rounded-lg border overflow-hidden bg-white shadow-sm">
      {/* Sidebar */}
      <div className="w-72 flex-shrink-0 border-r flex flex-col">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm flex items-center gap-1.5">
              <StickyNote className="h-4 w-4 text-amber-500" />
              QuickNotes
            </h2>
            <Button size="sm" onClick={openCreate} className="h-7 px-2 text-xs">
              <Plus className="h-3.5 w-3.5 mr-1" /> New
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              className="pl-7 h-7 text-xs"
              placeholder="Search notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-gray-400">Loading...</div>
          ) : notes.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-400">
              {search ? 'No notes match your search' : 'No notes yet. Create one!'}
            </div>
          ) : (
            <ul>
              {notes.map((note) => (
                <li
                  key={note.id}
                  onClick={() => {
                    setSelectedId(note.id);
                    setEditing(false);
                  }}
                  className={cn(
                    'px-3 py-2.5 cursor-pointer border-b hover:bg-gray-50 transition-colors',
                    selectedId === note.id && 'bg-amber-50 border-l-2 border-l-amber-500'
                  )}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {note.format === 'spreadsheet' ? (
                        <Table2 className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                      )}
                      <span className="text-sm font-medium truncate">{note.title}</span>
                    </div>
                    {selectedId === note.id && (
                      <ChevronRight className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                    )}
                  </div>
                  {note.sharedBy && (
                    <p className="text-xs text-blue-600 mt-0.5 pl-5">
                      Shared by {note.sharedBy}
                    </p>
                  )}
                  {note.isOwned && note.shares.length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5 pl-5">
                      Shared with {note.shares.length}{' '}
                      {note.shares.length === 1 ? 'person' : 'people'}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Main Panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedNote ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <StickyNote className="h-12 w-12 mx-auto mb-3 text-gray-200" />
              <p className="text-sm">Select a note or create a new one</p>
            </div>
          </div>
        ) : editing ? (
          <div className="flex-1 flex flex-col p-4 gap-3 overflow-auto">
            <div className="flex items-center gap-2">
              <Input
                className="flex-1 font-semibold"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="Note title"
              />
              <Select
                value={draftFormat}
                onValueChange={(v) => setDraftFormat(v as 'text' | 'spreadsheet')}
              >
                <SelectTrigger className="w-36 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">
                    <span className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" /> Text Doc
                    </span>
                  </SelectItem>
                  <SelectItem value="spreadsheet">
                    <span className="flex items-center gap-1.5">
                      <Table2 className="h-3.5 w-3.5" /> Spreadsheet
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 overflow-auto">
              {draftFormat === 'text' ? (
                <Textarea
                  className="w-full h-full min-h-[300px] resize-none text-sm font-mono"
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  placeholder="Write your note here..."
                />
              ) : (
                <SpreadsheetEditor content={draftContent} onChange={setDraftContent} />
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={saveEdit} disabled={updateMutation.isPending} size="sm">
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(false)}
                disabled={updateMutation.isPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-lg">{selectedNote.title}</h2>
                  <Badge variant="outline" className="text-xs font-normal capitalize">
                    {selectedNote.format === 'spreadsheet' ? (
                      <span className="flex items-center gap-1">
                        <Table2 className="h-3 w-3" /> Spreadsheet
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" /> Text Doc
                      </span>
                    )}
                  </Badge>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  By {selectedNote.createdByDisplayName} &middot;{' '}
                  {new Date(selectedNote.updatedAt).toLocaleDateString()}
                  {selectedNote.sharedBy && (
                    <span className="text-blue-500"> &middot; Shared by {selectedNote.sharedBy}</span>
                  )}
                </p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                {selectedNote.isOwned && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setShareSearch('');
                        setShowShare(true);
                      }}
                    >
                      <Share2 className="h-3.5 w-3.5 mr-1" /> Share
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(selectedNote)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => setDeleteTarget(selectedNote)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {selectedNote.format === 'text' ? (
                selectedNote.content ? (
                  <pre className="whitespace-pre-wrap text-sm font-mono text-gray-800">
                    {selectedNote.content}
                  </pre>
                ) : (
                  <p className="text-gray-400 italic text-sm">No content yet.</p>
                )
              ) : (
                <SpreadsheetViewer content={selectedNote.content} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Quick Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Title</label>
              <Input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="Enter a title"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Format</label>
              <Select
                value={draftFormat}
                onValueChange={(v) => setDraftFormat(v as 'text' | 'spreadsheet')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">
                    <span className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" /> Text Document
                    </span>
                  </SelectItem>
                  <SelectItem value="spreadsheet">
                    <span className="flex items-center gap-1.5">
                      <Table2 className="h-3.5 w-3.5" /> Spreadsheet (editable grid)
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {draftFormat === 'text' && (
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Content <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <Textarea
                  rows={6}
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  placeholder="Write your note..."
                  className="font-mono text-sm"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitCreate}
              disabled={!draftTitle.trim() || createMutation.isPending}
            >
              Create Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={showShare} onOpenChange={setShowShare}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share Note</DialogTitle>
          </DialogHeader>
          {selectedNote && (
            <div className="space-y-4 py-2">
              {selectedNote.shares.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Currently shared with</p>
                  <ul className="space-y-1">
                    {selectedNote.shares.map((share) => (
                      <li
                        key={share.id}
                        className="flex items-center justify-between text-sm rounded px-2 py-1.5 bg-gray-50"
                      >
                        <span>{share.sharedWithDisplayName}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-gray-400 hover:text-red-500"
                          onClick={() =>
                            unshareMutation.mutate({
                              noteId: selectedNote.id,
                              shareId: share.id,
                            })
                          }
                          disabled={unshareMutation.isPending}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <p className="text-sm font-medium mb-2">Add people</p>
                <div className="relative mb-2">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <Input
                    className="pl-7 text-sm"
                    placeholder="Search employees..."
                    value={shareSearch}
                    onChange={(e) => setShareSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {eligibleUsers.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-2">
                      {shareSearch ? 'No users found' : 'All users already have access'}
                    </p>
                  ) : (
                    eligibleUsers.slice(0, 20).map((u) => (
                      <button
                        key={u.id}
                        onClick={() =>
                          shareMutation.mutate({ noteId: selectedNote.id, userId: u.id })
                        }
                        disabled={shareMutation.isPending}
                        className="w-full flex items-center justify-between text-sm rounded px-2 py-1.5 hover:bg-blue-50 transition-colors text-left"
                      >
                        <span>
                          {u.firstName} {u.lastName}{' '}
                          <span className="text-gray-400 text-xs">@{u.username}</span>
                        </span>
                        <UserPlus className="h-3.5 w-3.5 text-blue-500" />
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowShare(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.title}" will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
