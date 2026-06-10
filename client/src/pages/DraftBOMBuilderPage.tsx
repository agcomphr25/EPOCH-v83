import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Archive,
  Calculator,
  Check,
  Copy,
  FileSpreadsheet,
  Filter,
  PackagePlus,
  Plus,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { privateerDraftBomLines, type PrivateerDraftBomLine } from '@/data/privateerDraftBom';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type BomAction = 'Order / Quote' | 'Use in RFQ' | 'Do Not Order' | 'Hold';
type BomStatus = 'Needs Review' | 'Needs Quote' | 'RFQ Sent' | 'On Order' | 'On Hand' | 'ETA / Inbound' | 'Hold';

type BomLine = PrivateerDraftBomLine;

type BomDraft = {
  id: string;
  name: string;
  revision: string;
  owner: string;
  project: string;
  projectId?: string | null;
  projectCode?: string | null;
  projectName?: string | null;
  projectType?: 'P2_PROJECT' | 'R_AND_D' | null;
  notes: string;
  updatedAt: string;
  lines: BomLine[];
};

type ProjectOption = {
  id: string;
  projectCode: string;
  projectName: string;
  status?: string;
};

const STORAGE_KEY = 'epoch:draft-boms';
const PRIVATEER_DRAFT_ID = 'privateer';
const R_AND_D_PROJECT_VALUE = '__r_and_d__';

const actions: BomAction[] = ['Order / Quote', 'Use in RFQ', 'Do Not Order', 'Hold'];
const statuses: BomStatus[] = ['Needs Review', 'Needs Quote', 'RFQ Sent', 'On Order', 'On Hand', 'ETA / Inbound', 'Hold'];
const baseCategories = ['Avionics/Sensors', 'Electrical', 'Propulsion/Mechanical', 'Structural', 'Hardware/Misc.', 'Tooling'];

function newLine(): BomLine {
  return {
    id: crypto.randomUUID(),
    include: true,
    action: 'Order / Quote',
    category: 'Hardware/Misc.',
    supplier: '',
    manufacturer: '',
    supplierItemId: '',
    agPartNumber: '',
    description: '',
    unit: 'EA',
    unitCost: '',
    qtyNeeded: 1,
    status: 'Needs Review',
    targetNeedDate: '',
    finalized: false,
    note: '',
  };
}

function createPrivateerDraft(): BomDraft {
  return {
    id: PRIVATEER_DRAFT_ID,
    name: 'Privateer',
    revision: 'Draft A',
    owner: '',
    project: 'Privateer',
    projectId: null,
    projectCode: null,
    projectName: 'Privateer',
    projectType: null,
    notes: 'First draft sourcing BOM modeled after the Google Sheet layout.',
    updatedAt: new Date().toISOString(),
    lines: privateerDraftBomLines,
  };
}

function projectLabel(project: ProjectOption) {
  return [project.projectCode, project.projectName].filter(Boolean).join(' - ');
}

function normalizeDraft(draft: BomDraft): BomDraft {
  return {
    ...draft,
    projectId: draft.projectId ?? null,
    projectCode: draft.projectCode ?? null,
    projectName: draft.projectName ?? draft.project ?? null,
    projectType: draft.projectType ?? null,
  };
}

function money(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function asNumber(value: number | '') {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function loadDrafts(): BomDraft[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [createPrivateerDraft()];
    const drafts = (JSON.parse(raw) as BomDraft[]).map(normalizeDraft);
    const privateer = drafts.find((item) => item.id === PRIVATEER_DRAFT_ID);
    if (privateer) return [privateer, ...drafts.filter((item) => item.id !== PRIVATEER_DRAFT_ID)];
    return [createPrivateerDraft(), ...drafts];
  } catch {
    return [createPrivateerDraft()];
  }
}

function saveDrafts(drafts: BomDraft[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

export default function DraftBOMBuilderPage() {
  const { toast } = useToast();
  const [savedDrafts, setSavedDrafts] = useState<BomDraft[]>(() => loadDrafts());
  const [selectedDraftId, setSelectedDraftId] = useState<string>(PRIVATEER_DRAFT_ID);
  const [draft, setDraft] = useState<BomDraft>(() => loadDrafts()[0] ?? createPrivateerDraft());
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: projects = [], isLoading: projectsLoading } = useQuery<ProjectOption[]>({
    queryKey: ['/api/projects'],
  });

  const projectOptions = useMemo(() => {
    return [...projects].sort((a, b) => projectLabel(a).localeCompare(projectLabel(b)));
  }, [projects]);
  const selectedProjectValue = draft.projectType === 'R_AND_D' ? R_AND_D_PROJECT_VALUE : draft.projectId ?? '';

  const visibleLines = useMemo(() => {
    return draft.lines.filter((line) => {
      const categoryMatch = categoryFilter === 'all' || line.category === categoryFilter;
      const statusMatch = statusFilter === 'all' || line.status === statusFilter;
      return categoryMatch && statusMatch;
    });
  }, [categoryFilter, draft.lines, statusFilter]);

  const selectedLines = useMemo(() => draft.lines.filter((line) => line.include), [draft.lines]);
  const orderableLines = useMemo(
    () => draft.lines.filter((line) => line.action !== 'Do Not Order' && !line.finalized),
    [draft.lines],
  );
  const categoryOptions = useMemo(() => {
    return [...new Set([...baseCategories, ...draft.lines.map((line) => line.category).filter(Boolean)])].sort();
  }, [draft.lines]);

  const totals = useMemo(() => {
    const lineTotal = (line: BomLine) => asNumber(line.unitCost) * asNumber(line.qtyNeeded);
    const materialTotal = draft.lines.reduce((sum, line) => sum + lineTotal(line), 0);
    const selectedTotal = selectedLines.reduce((sum, line) => sum + lineTotal(line), 0);
    const onHandTotal = draft.lines
      .filter((line) => line.status === 'On Hand')
      .reduce((sum, line) => sum + lineTotal(line), 0);
    const needsQuote = draft.lines.filter((line) => line.status === 'Needs Quote' || line.unitCost === '').length;
    const rfqSent = draft.lines.filter((line) => line.status === 'RFQ Sent').length;

    return {
      materialTotal,
      selectedTotal,
      onHandTotal,
      needsQuote,
      rfqSent,
      lineCount: draft.lines.length,
    };
  }, [draft.lines, selectedLines]);

  const categoryTotals = useMemo(() => {
    const grouped = new Map<string, { count: number; total: number }>();
    for (const line of draft.lines) {
      const existing = grouped.get(line.category) ?? { count: 0, total: 0 };
      existing.count += 1;
      existing.total += asNumber(line.unitCost) * asNumber(line.qtyNeeded);
      grouped.set(line.category, existing);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [draft.lines]);

  function updateLine(id: string, patch: Partial<BomLine>) {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    }));
  }

  function updateNumberLine(id: string, field: 'unitCost' | 'qtyNeeded', value: string) {
    updateLine(id, { [field]: value === '' ? '' : Number(value) } as Partial<BomLine>);
  }

  function setAllIncluded(include: boolean) {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line) => ({ ...line, include })),
    }));
  }

  function selectOrderable() {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line) => ({
        ...line,
        include: line.action !== 'Do Not Order' && line.status !== 'On Hand' && !line.finalized,
      })),
    }));
  }

  function addLine() {
    setDraft((current) => ({ ...current, lines: [...current.lines, newLine()] }));
  }

  function duplicateSelected() {
    const copies = selectedLines.map((line) => ({
      ...line,
      id: crypto.randomUUID(),
      finalized: false,
      note: line.note ? `${line.note} | copied` : 'copied',
    }));
    setDraft((current) => ({ ...current, lines: [...current.lines, ...copies] }));
  }

  function removeSelected() {
    setDraft((current) => ({ ...current, lines: current.lines.filter((line) => !line.include) }));
  }

  function saveDraft() {
    const nextDraft = { ...draft, updatedAt: new Date().toISOString() };
    const withoutCurrent = savedDrafts.filter((item) => item.id !== nextDraft.id);
    const nextDrafts = [nextDraft, ...withoutCurrent].slice(0, 12);
    saveDrafts(nextDrafts);
    setSavedDrafts(nextDrafts);
    setSelectedDraftId(nextDraft.id);
    setDraft(nextDraft);
    toast({ title: 'Draft saved', description: `${nextDraft.name} is available in saved BOM drafts.` });
  }

  function loadDraft(id: string) {
    const match = savedDrafts.find((item) => item.id === id);
    if (!match) return;
    setSelectedDraftId(id);
    setDraft(normalizeDraft(match));
  }

  function updateDraftProject(value: string) {
    if (value === R_AND_D_PROJECT_VALUE) {
      setDraft((current) => ({
        ...current,
        project: 'R&D',
        projectId: null,
        projectCode: null,
        projectName: 'R&D',
        projectType: 'R_AND_D',
      }));
      return;
    }

    const selectedProject = projectOptions.find((project) => project.id === value);
    if (!selectedProject) return;

    setDraft((current) => ({
      ...current,
      project: projectLabel(selectedProject),
      projectId: selectedProject.id,
      projectCode: selectedProject.projectCode,
      projectName: selectedProject.projectName,
      projectType: 'P2_PROJECT',
    }));
  }

  function startBlankDraft() {
    const blankDraft: BomDraft = {
      id: crypto.randomUUID(),
      name: 'New Draft BOM',
      revision: 'Draft A',
      owner: '',
      project: '',
      projectId: null,
      projectCode: null,
      projectName: null,
      projectType: null,
      notes: '',
      updatedAt: new Date().toISOString(),
      lines: [newLine()],
    };
    setSelectedDraftId('');
    setDraft(blankDraft);
  }

  function markSelectedFinalized() {
    if (!draft.project) {
      toast({
        title: 'Select a project first',
        description: 'Choose a P2 project or R&D before finalizing lines for inventory-item creation.',
        variant: 'destructive',
      });
      return;
    }

    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line) =>
        line.include ? { ...line, finalized: true, include: false, action: 'Do Not Order' } : line,
      ),
    }));
    toast({
      title: 'Inventory finalization staged',
      description: 'Selected lines are marked final and ready for inventory-item creation when backend submission is wired.',
    });
  }

  function showHandoffToast(target: 'RFQ package' | 'PO draft' | 'inventory items') {
    toast({
      title: `${selectedLines.length} line(s) ready`,
      description: `The ${target} handoff is staged in the UI and ready for backend wiring.`,
    });
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1800px] space-y-4 p-4 lg:p-6">
        <section className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-7 w-7 text-teal-700" aria-hidden="true" />
              <h1 className="text-2xl font-semibold tracking-normal text-slate-950">Draft BOM Builder</h1>
              <Badge variant="outline" className="border-orange-300 bg-orange-50 text-orange-800">
                Spreadsheet style
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Draft reusable BOMs, select sourcing lines, and prepare RFQ or order picklists from one working grid.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={selectOrderable}>
              <Filter className="mr-2 h-4 w-4" />
              Select orderable
            </Button>
            <Button variant="outline" onClick={saveDraft}>
              <Save className="mr-2 h-4 w-4" />
              Save draft
            </Button>
            <Button onClick={markSelectedFinalized} disabled={selectedLines.length === 0}>
              <Check className="mr-2 h-4 w-4" />
              Finalize to inventory
            </Button>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(320px,420px)_1fr]">
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">BOM Setup</h2>
                <Badge variant="secondary">{draft.revision || 'Draft'}</Badge>
              </div>

              <div className="mt-4 grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="draft-name">BOM Name</Label>
                  <Input
                    id="draft-name"
                    value={draft.name}
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="draft-revision">Revision</Label>
                    <Input
                      id="draft-revision"
                      value={draft.revision}
                      onChange={(event) => setDraft((current) => ({ ...current, revision: event.target.value }))}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="draft-project">Project</Label>
                    <Select value={selectedProjectValue} onValueChange={updateDraftProject}>
                      <SelectTrigger id="draft-project">
                        <SelectValue placeholder={draft.project || 'Select a P2 project or R&D'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={R_AND_D_PROJECT_VALUE}>R&D</SelectItem>
                        {projectsLoading ? (
                          <SelectItem value="__projects_loading__" disabled>
                            Loading P2 projects...
                          </SelectItem>
                        ) : (
                          projectOptions.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              {projectLabel(project)}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="draft-owner">Owner</Label>
                  <Input
                    id="draft-owner"
                    value={draft.owner}
                    onChange={(event) => setDraft((current) => ({ ...current, owner: event.target.value }))}
                    placeholder="Inventory, Engineering, PM..."
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="draft-notes">Notes</Label>
                  <Textarea
                    id="draft-notes"
                    value={draft.notes}
                    onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                    rows={3}
                  />
                </div>
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Saved BOM Drafts</Label>
                    <Button type="button" variant="ghost" size="sm" onClick={startBlankDraft}>
                      <Plus className="mr-2 h-4 w-4" />
                      New blank draft
                    </Button>
                  </div>
                  <Select value={selectedDraftId} onValueChange={loadDraft}>
                    <SelectTrigger>
                      <SelectValue placeholder="Load a saved draft" />
                    </SelectTrigger>
                    <SelectContent>
                      {savedDrafts.length === 0 ? (
                        <SelectItem value="none" disabled>
                          No saved drafts yet
                        </SelectItem>
                      ) : (
                        savedDrafts.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name} - {item.revision}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Calculator className="h-4 w-4 text-teal-700" aria-hidden="true" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Summary</h2>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <SummaryMetric label="Total Material / Tooling" value={money(totals.materialTotal)} />
                <SummaryMetric label="Selected for RFQ / Order" value={money(totals.selectedTotal)} />
                <SummaryMetric label="On Hand Value" value={money(totals.onHandTotal)} />
                <SummaryMetric label="Needs Quote Count" value={String(totals.needsQuote)} />
                <SummaryMetric label="RFQ Sent Count" value={String(totals.rfqSent)} />
                <SummaryMetric label="Line Count" value={String(totals.lineCount)} />
              </dl>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Category Rollup</h2>
              <div className="mt-3 space-y-2">
                {categoryTotals.map(([category, data]) => (
                  <div key={category} className="grid grid-cols-[1fr_auto_auto] gap-3 text-sm">
                    <span className="truncate text-slate-700">{category}</span>
                    <span className="tabular-nums text-slate-500">{data.count}</span>
                    <span className="tabular-nums font-medium text-slate-900">{money(data.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Tabs defaultValue="draft" className="min-w-0">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 lg:flex-row lg:items-center lg:justify-between">
              <TabsList>
                <TabsTrigger value="draft">BOM Draft Lines</TabsTrigger>
                <TabsTrigger value="picklist">RFQ / Order Picklist</TabsTrigger>
              </TabsList>

              <div className="flex flex-wrap gap-2">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[190px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categoryOptions.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[170px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {statuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <TabsContent value="draft" className="mt-4">
              <div className="mb-3 flex flex-wrap gap-2">
                <Button variant="outline" onClick={addLine}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add line
                </Button>
                <Button variant="outline" onClick={() => setAllIncluded(true)}>
                  <Archive className="mr-2 h-4 w-4" />
                  Select all
                </Button>
                <Button variant="outline" onClick={() => setAllIncluded(false)}>
                  Clear selection
                </Button>
                <Button variant="outline" onClick={duplicateSelected} disabled={selectedLines.length === 0}>
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate selected
                </Button>
                <Button variant="destructive" onClick={removeSelected} disabled={selectedLines.length === 0}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove selected
                </Button>
              </div>

              <BomLineGrid
                lines={visibleLines}
                categoryOptions={categoryOptions}
                updateLine={updateLine}
                updateNumberLine={updateNumberLine}
              />
            </TabsContent>

            <TabsContent value="picklist" className="mt-4">
              <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="font-semibold text-slate-950">Selected Sourcing Lines</h2>
                    <p className="text-sm text-slate-600">
                      {selectedLines.length} selected line(s), {orderableLines.length} open orderable line(s)
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={selectedLines.length === 0}
                      onClick={() => showHandoffToast('RFQ package')}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      Prepare RFQ package
                    </Button>
                    <Button
                      variant="outline"
                      disabled={selectedLines.length === 0}
                      onClick={() => showHandoffToast('PO draft')}
                    >
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      Generate PO draft
                    </Button>
                    <Button disabled={selectedLines.length === 0} onClick={() => showHandoffToast('inventory items')}>
                      <PackagePlus className="mr-2 h-4 w-4" />
                      Add to inventory items
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[140px]">Supplier</TableHead>
                        <TableHead className="w-[130px]">Supplier Item</TableHead>
                        <TableHead className="w-[110px]">AG Part #</TableHead>
                        <TableHead className="min-w-[320px]">Description</TableHead>
                        <TableHead className="w-[80px] text-right">Qty</TableHead>
                        <TableHead className="w-[110px] text-right">Unit Cost</TableHead>
                        <TableHead className="w-[120px] text-right">Ext Cost</TableHead>
                        <TableHead className="w-[140px]">Action</TableHead>
                        <TableHead className="w-[130px]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedLines.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="h-24 text-center text-slate-500">
                            Select BOM lines to build the RFQ/order picklist.
                          </TableCell>
                        </TableRow>
                      ) : (
                        selectedLines.map((line) => {
                          const extCost = asNumber(line.unitCost) * asNumber(line.qtyNeeded);
                          return (
                            <TableRow key={line.id}>
                              <TableCell className="font-medium">{line.supplier || 'Unassigned'}</TableCell>
                              <TableCell>{line.supplierItemId || '-'}</TableCell>
                              <TableCell>{line.agPartNumber || '-'}</TableCell>
                              <TableCell>{line.description || '-'}</TableCell>
                              <TableCell className="text-right tabular-nums">{line.qtyNeeded || '-'}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {line.unitCost === '' ? '-' : money(asNumber(line.unitCost))}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{money(extCost)}</TableCell>
                              <TableCell>{line.action}</TableCell>
                              <TableCell>
                                <StatusBadge status={line.status} />
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </main>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 text-base font-semibold tabular-nums text-slate-950">{value}</dd>
    </div>
  );
}

function BomLineGrid({
  lines,
  categoryOptions,
  updateLine,
  updateNumberLine,
}: {
  lines: BomLine[];
  categoryOptions: string[];
  updateLine: (id: string, patch: Partial<BomLine>) => void;
  updateNumberLine: (id: string, field: 'unitCost' | 'qtyNeeded', value: string) => void;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[56px]">Use</TableHead>
              <TableHead className="w-[150px]">Order Action</TableHead>
              <TableHead className="w-[180px]">Category</TableHead>
              <TableHead className="w-[150px]">Supplier</TableHead>
              <TableHead className="w-[150px]">Manufacturer</TableHead>
              <TableHead className="w-[150px]">Supplier Item ID</TableHead>
              <TableHead className="w-[120px]">AG Part #</TableHead>
              <TableHead className="min-w-[320px]">Description</TableHead>
              <TableHead className="w-[80px]">Unit</TableHead>
              <TableHead className="w-[110px] text-right">Unit Cost</TableHead>
              <TableHead className="w-[100px] text-right">Qty</TableHead>
              <TableHead className="w-[120px] text-right">Ext Cost</TableHead>
              <TableHead className="w-[140px]">Status</TableHead>
              <TableHead className="w-[150px]">Need Date</TableHead>
              <TableHead className="w-[92px]">Final</TableHead>
              <TableHead className="min-w-[260px]">Note / Link</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={16} className="h-24 text-center text-slate-500">
                  No BOM lines match the active filters.
                </TableCell>
              </TableRow>
            ) : (
              lines.map((line) => {
                const extCost = asNumber(line.unitCost) * asNumber(line.qtyNeeded);
                return (
                  <TableRow key={line.id} className={cn(line.finalized && 'bg-emerald-50/60')}>
                    <TableCell>
                      <Checkbox
                        checked={line.include}
                        onCheckedChange={(checked) => updateLine(line.id, { include: checked === true })}
                        aria-label={`Select ${line.description || 'BOM line'}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Select value={line.action} onValueChange={(value) => updateLine(line.id, { action: value as BomAction })}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {actions.map((action) => (
                            <SelectItem key={action} value={action}>
                              {action}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={line.category} onValueChange={(value) => updateLine(line.id, { category: value })}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {categoryOptions.map((category) => (
                            <SelectItem key={category} value={category}>
                              {category}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <EditableCell value={line.supplier} onChange={(value) => updateLine(line.id, { supplier: value })} />
                    <EditableCell value={line.manufacturer} onChange={(value) => updateLine(line.id, { manufacturer: value })} />
                    <EditableCell value={line.supplierItemId} onChange={(value) => updateLine(line.id, { supplierItemId: value })} />
                    <EditableCell value={line.agPartNumber} onChange={(value) => updateLine(line.id, { agPartNumber: value })} />
                    <EditableCell value={line.description} onChange={(value) => updateLine(line.id, { description: value })} wide />
                    <EditableCell value={line.unit} onChange={(value) => updateLine(line.id, { unit: value })} />
                    <TableCell>
                      <Input
                        className="h-9 text-right"
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitCost}
                        onChange={(event) => updateNumberLine(line.id, 'unitCost', event.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-9 text-right"
                        type="number"
                        min="0"
                        step="0.001"
                        value={line.qtyNeeded}
                        onChange={(event) => updateNumberLine(line.id, 'qtyNeeded', event.target.value)}
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{money(extCost)}</TableCell>
                    <TableCell>
                      <Select value={line.status} onValueChange={(value) => updateLine(line.id, { status: value as BomStatus })}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statuses.map((status) => (
                            <SelectItem key={status} value={status}>
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-9"
                        type="date"
                        value={line.targetNeedDate}
                        onChange={(event) => updateLine(line.id, { targetNeedDate: event.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={line.finalized}
                        onCheckedChange={(checked) => updateLine(line.id, { finalized: checked === true })}
                        aria-label={`Finalize ${line.description || 'BOM line'}`}
                      />
                    </TableCell>
                    <EditableCell value={line.note} onChange={(value) => updateLine(line.id, { note: value })} wide />
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <Separator />
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs text-slate-500">
        <span>Columns follow the working Google Sheet: supplier, manufacturer, item, AG part, cost, quantity, status, and notes.</span>
        <span>Drafts save locally until backend draft persistence is wired.</span>
      </div>
    </section>
  );
}

function EditableCell({ value, onChange, wide = false }: { value: string; onChange: (value: string) => void; wide?: boolean }) {
  return (
    <TableCell className={wide ? 'min-w-[260px]' : undefined}>
      <Input className="h-9" value={value} onChange={(event) => onChange(event.target.value)} />
    </TableCell>
  );
}

function StatusBadge({ status }: { status: BomStatus }) {
  const tone =
    status === 'On Hand'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
      : status === 'RFQ Sent' || status === 'On Order'
        ? 'border-sky-300 bg-sky-50 text-sky-800'
        : status === 'Needs Quote' || status === 'Needs Review'
          ? 'border-orange-300 bg-orange-50 text-orange-800'
          : 'border-slate-300 bg-slate-50 text-slate-700';

  return (
    <Badge variant="outline" className={tone}>
      {status}
    </Badge>
  );
}
