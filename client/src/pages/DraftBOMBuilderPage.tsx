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
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { privateerDraftBomLines, type PrivateerDraftBomLine } from '@/data/privateerDraftBom';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';

type BomAction = 'Order / Quote' | 'Use in RFQ' | 'Do Not Order' | 'Hold';
type BomStatus = 'Needs Review' | 'Needs Quote' | 'RFQ Sent' | 'On Order' | 'On Hand' | 'ETA / Inbound' | 'Hold';

type BomLine = PrivateerDraftBomLine & {
  customFields?: Record<string, string>;
  inventoryItemId?: number | null;
  inventoryItemName?: string | null;
  isDraftPart?: boolean;
};
type BuiltInWorkspaceTabId = 'po-draft' | 'parts-request' | 'bom-wizard' | 'assembly-tree';
type CustomWorkspaceTabId = `custom:${string}`;
type WorkspaceTabId = BuiltInWorkspaceTabId | CustomWorkspaceTabId;
type PoColumnId =
  | 'filter'
  | 'supplier'
  | 'supplierItemId'
  | 'agPartNumber'
  | 'qtyNeeded'
  | 'unitCost'
  | 'extCost'
  | 'action'
  | 'status'
  | 'source';

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
  poVisibleColumns?: PoColumnId[];
  customPoColumns?: string[];
  workspaceTabs?: WorkspaceTabId[];
};

type ProjectOption = {
  id: string;
  projectCode: string;
  projectName: string;
  status?: string;
};

type InventoryItemOption = {
  id: number;
  agPartNumber?: string | null;
  name?: string | null;
  description?: string | null;
  costPer?: number | string | null;
  usageUnit?: string | null;
  unit?: string | null;
  source?: string | null;
  supplier?: string | null;
  supplierPartNumber?: string | null;
  manufacturerPartNumber?: string | null;
  manufacturer?: string | null;
  isActive?: boolean | null;
};

const STORAGE_KEY = 'epoch:draft-boms';
const PRIVATEER_DRAFT_ID = 'privateer';
const NEW_DRAFT_VALUE = '__new_draft__';
const R_AND_D_PROJECT_VALUE = '__r_and_d__';

const actions: BomAction[] = ['Order / Quote', 'Use in RFQ', 'Do Not Order', 'Hold'];
const statuses: BomStatus[] = ['Needs Review', 'Needs Quote', 'RFQ Sent', 'On Order', 'On Hand', 'ETA / Inbound', 'Hold'];
const defaultFilterNames = ['Avionics/Sensors', 'Electrical', 'Propulsion/Mechanical', 'Structural', 'Hardware/Misc.', 'Tooling'];
const defaultWorkspaceTabs: BuiltInWorkspaceTabId[] = ['po-draft', 'parts-request', 'bom-wizard', 'assembly-tree'];
const workspaceTabLabels: Record<BuiltInWorkspaceTabId, string> = {
  'po-draft': 'PO draft',
  'parts-request': 'Parts/request',
  'bom-wizard': 'BOM wizard',
  'assembly-tree': 'Assembly tree',
};
const poColumnLabels: Record<PoColumnId, string> = {
  filter: 'Filter',
  supplier: 'Supplier',
  supplierItemId: 'Supplier Item',
  agPartNumber: 'AG Part #',
  qtyNeeded: 'Qty',
  unitCost: 'Unit Cost',
  extCost: 'Ext Cost',
  action: 'Action',
  status: 'Status',
  source: 'Source',
};
const defaultPoColumns: PoColumnId[] = ['agPartNumber', 'qtyNeeded', 'unitCost', 'extCost', 'status', 'source'];

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
    customFields: {},
    inventoryItemId: null,
    inventoryItemName: null,
    isDraftPart: true,
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
    poVisibleColumns: defaultPoColumns,
    customPoColumns: [],
    workspaceTabs: defaultWorkspaceTabs,
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
    poVisibleColumns: draft.poVisibleColumns ?? defaultPoColumns,
    customPoColumns: draft.customPoColumns ?? [],
    workspaceTabs: draft.workspaceTabs ?? defaultWorkspaceTabs,
  };
}

function workspaceTabLabel(tabId: WorkspaceTabId) {
  if (tabId.startsWith('custom:')) return tabId.replace(/^custom:/, '');
  return workspaceTabLabels[tabId as BuiltInWorkspaceTabId];
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
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [visibleWorkspaceTabs, setVisibleWorkspaceTabs] = useState<WorkspaceTabId[]>(() => draft.workspaceTabs ?? defaultWorkspaceTabs);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTabId>('po-draft');
  const [poDescription, setPoDescription] = useState('');
  const [visiblePoColumns, setVisiblePoColumns] = useState<PoColumnId[]>(() => draft.poVisibleColumns ?? defaultPoColumns);
  const [customPoColumns, setCustomPoColumns] = useState<string[]>(() => draft.customPoColumns ?? []);
  const [newPoColumnName, setNewPoColumnName] = useState('');
  const [newWorkspaceTabName, setNewWorkspaceTabName] = useState('');

  const { data: projects = [], isLoading: projectsLoading } = useQuery<ProjectOption[]>({
    queryKey: ['/api/projects'],
  });

  const { data: inventoryItems = [] } = useQuery<InventoryItemOption[]>({
    queryKey: ['/api/inventory'],
    queryFn: () => apiRequest('/api/inventory'),
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
  const filterOptions = useMemo(() => {
    return [...new Set([...defaultFilterNames, ...draft.lines.map((line) => line.category).filter(Boolean)])].sort();
  }, [draft.lines]);
  const activeInventoryItems = useMemo(
    () => inventoryItems.filter((item) => item.isActive !== false),
    [inventoryItems],
  );
  const poDescriptionMatches = useMemo(() => {
    const query = poDescription.trim().toLowerCase();
    if (query.length < 2) return [];

    return activeInventoryItems
      .filter((item) => {
        const haystack = [
          item.name,
          item.description,
          item.agPartNumber,
          item.supplierPartNumber,
          item.manufacturerPartNumber,
          item.manufacturer,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 6);
  }, [activeInventoryItems, poDescription]);

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

  const filterTotals = useMemo(() => {
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

  function createLineFromPoDescription(item?: InventoryItemOption) {
    const description = item?.name || item?.description || poDescription.trim();
    const itemCost = Number(item?.costPer);
    if (!description) {
      toast({
        title: 'Part description required',
        description: 'Start with a part description before adding a PO draft line.',
        variant: 'destructive',
      });
      return;
    }

    const nextLine: BomLine = {
      ...newLine(),
      description,
      agPartNumber: item?.agPartNumber || '',
      supplier: item?.source || item?.supplier || '',
      supplierItemId: item?.supplierPartNumber || item?.manufacturerPartNumber || '',
      manufacturer: item?.manufacturer || '',
      unit: item?.usageUnit || item?.unit || 'EA',
      unitCost: Number.isFinite(itemCost) ? itemCost : '',
      status: item ? 'Needs Review' : 'Needs Quote',
      note: item ? `Matched inventory item #${item.id}` : 'Draft part - create inventory item when finalized',
      inventoryItemId: item?.id ?? null,
      inventoryItemName: item?.name || item?.description || null,
      isDraftPart: !item,
      customFields: {},
    };

    setDraft((current) => ({ ...current, lines: [nextLine, ...current.lines] }));
    setPoDescription('');
    toast({
      title: item ? 'Inventory item added' : 'Draft part created',
      description: item ? `${description} was added to the PO draft.` : `${description} was added as a draft part.`,
    });
  }

  function togglePoColumn(columnId: PoColumnId, checked: boolean) {
    setVisiblePoColumns((current) => {
      if (checked) return current.includes(columnId) ? current : [...current, columnId];
      return current.filter((item) => item !== columnId);
    });
  }

  function addCustomPoColumn() {
    const columnName = newPoColumnName.trim();
    if (!columnName) return;
    setCustomPoColumns((current) => (current.includes(columnName) ? current : [...current, columnName]));
    setNewPoColumnName('');
  }

  function updateLineCustomField(lineId: string, columnName: string, value: string) {
    updateLine(lineId, {
      customFields: {
        ...(draft.lines.find((line) => line.id === lineId)?.customFields ?? {}),
        [columnName]: value,
      },
    });
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
    const nextDraft = {
      ...draft,
      poVisibleColumns: visiblePoColumns,
      customPoColumns,
      workspaceTabs: visibleWorkspaceTabs,
      updatedAt: new Date().toISOString(),
    };
    const withoutCurrent = savedDrafts.filter((item) => item.id !== nextDraft.id);
    const nextDrafts = [nextDraft, ...withoutCurrent].slice(0, 12);
    saveDrafts(nextDrafts);
    setSavedDrafts(nextDrafts);
    setSelectedDraftId(nextDraft.id);
    setDraft(nextDraft);
    toast({ title: 'Draft saved', description: `${nextDraft.name} is available in saved BOM drafts.` });
  }

  function loadDraft(id: string) {
    if (id === NEW_DRAFT_VALUE) {
      startBlankDraft();
      return;
    }

    const match = savedDrafts.find((item) => item.id === id);
    if (!match) return;
    const nextDraft = normalizeDraft(match);
    setSelectedDraftId(id);
    setDraft(nextDraft);
    setVisiblePoColumns(nextDraft.poVisibleColumns ?? defaultPoColumns);
    setCustomPoColumns(nextDraft.customPoColumns ?? []);
    setVisibleWorkspaceTabs(nextDraft.workspaceTabs ?? defaultWorkspaceTabs);
    setActiveWorkspaceTab((nextDraft.workspaceTabs ?? defaultWorkspaceTabs)[0] ?? 'po-draft');
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
      poVisibleColumns: defaultPoColumns,
      customPoColumns: [],
      workspaceTabs: defaultWorkspaceTabs,
    };
    setSelectedDraftId('');
    setDraft(blankDraft);
    setVisiblePoColumns(defaultPoColumns);
    setCustomPoColumns([]);
    setVisibleWorkspaceTabs(defaultWorkspaceTabs);
    setActiveWorkspaceTab('po-draft');
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

  function showHandoffToast(target: 'RFQ package' | 'PO draft' | 'parts request' | 'inventory items' | 'assembly tree') {
    toast({
      title: `${selectedLines.length} line(s) ready`,
      description: `The ${target} handoff is staged in the UI and ready for backend wiring.`,
    });
  }

  function setWorkspaceTabVisible(tabId: WorkspaceTabId, visible: boolean) {
    setVisibleWorkspaceTabs((current) => {
      if (visible) {
        const next = current.includes(tabId) ? current : [...current, tabId];
        setActiveWorkspaceTab(tabId);
        return next;
      }

      const next = current.filter((item) => item !== tabId);
      if (activeWorkspaceTab === tabId && next.length > 0) {
        setActiveWorkspaceTab(next[0] ?? 'po-draft');
      }
      return next;
    });
  }

  function createWorkspaceTab() {
    const label = newWorkspaceTabName.trim();
    if (!label) return;
    const tabId = `custom:${label}` as WorkspaceTabId;
    setVisibleWorkspaceTabs((current) => (current.includes(tabId) ? current : [...current, tabId]));
    setActiveWorkspaceTab(tabId);
    setNewWorkspaceTabName('');
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
            <div className="flex min-w-[280px] flex-col gap-1.5">
              <Label htmlFor="active-draft">Draft BOM</Label>
              <Select value={selectedDraftId || NEW_DRAFT_VALUE} onValueChange={loadDraft}>
                <SelectTrigger id="active-draft" className="bg-white">
                  <SelectValue placeholder="Select a draft BOM" />
                </SelectTrigger>
                <SelectContent>
                  {savedDrafts.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} - {item.revision}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_DRAFT_VALUE}>Create new draft BOM</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsDetailsOpen(true)}>
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                BOM details
              </Button>
              <Button type="button" variant="outline" onClick={startBlankDraft}>
                <Plus className="mr-2 h-4 w-4" />
                New draft
              </Button>
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
          </div>
        </section>

        <Sheet open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
          <SheetContent className="w-full overflow-y-auto sm:max-w-[480px]">
            <SheetHeader>
              <SheetTitle>Draft BOM Details</SheetTitle>
              <SheetDescription>
                Edit setup fields and review totals for the active draft BOM.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6 space-y-4">
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
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Filter Rollup</h2>
              <div className="mt-3 space-y-2">
                {filterTotals.map(([filterName, data]) => (
                  <div key={filterName} className="grid grid-cols-[1fr_auto_auto] gap-3 text-sm">
                    <span className="truncate text-slate-700">{filterName}</span>
                    <span className="tabular-nums text-slate-500">{data.count}</span>
                    <span className="tabular-nums font-medium text-slate-900">{money(data.total)}</span>
                  </div>
                ))}
              </div>
            </div>
            </div>
          </SheetContent>
        </Sheet>

        <section>
          <Tabs
            value={activeWorkspaceTab}
            onValueChange={(value) => setActiveWorkspaceTab(value as WorkspaceTabId)}
            className="min-w-0"
          >
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 lg:flex-row lg:items-center lg:justify-between">
              <TabsList className="h-auto flex-wrap justify-start">
                {visibleWorkspaceTabs.map((tabId) => (
                  <TabsTrigger key={tabId} value={tabId}>
                    {workspaceTabLabel(tabId)}
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="flex flex-wrap gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline">
                      <Plus className="mr-2 h-4 w-4" />
                      Tabs
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[280px]" align="end">
                    <DropdownMenuLabel>Visible tabs</DropdownMenuLabel>
                    {defaultWorkspaceTabs.map((tabId) => (
                      <DropdownMenuCheckboxItem
                        key={tabId}
                        checked={visibleWorkspaceTabs.includes(tabId)}
                        onSelect={(event) => event.preventDefault()}
                        onCheckedChange={(checked) => setWorkspaceTabVisible(tabId, checked === true)}
                      >
                        {workspaceTabLabel(tabId)}
                      </DropdownMenuCheckboxItem>
                    ))}
                    {visibleWorkspaceTabs
                      .filter((tabId) => tabId.startsWith('custom:'))
                      .map((tabId) => (
                        <DropdownMenuCheckboxItem
                          key={tabId}
                          checked
                          onSelect={(event) => event.preventDefault()}
                          onCheckedChange={(checked) => setWorkspaceTabVisible(tabId, checked === true)}
                        >
                          {workspaceTabLabel(tabId)}
                        </DropdownMenuCheckboxItem>
                      ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Add new tab</DropdownMenuLabel>
                    <div className="grid gap-2 p-2">
                      <Input
                        value={newWorkspaceTabName}
                        onChange={(event) => setNewWorkspaceTabName(event.target.value)}
                        placeholder="Tab name"
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            createWorkspaceTab();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={createWorkspaceTab}
                        disabled={!newWorkspaceTabName.trim()}
                      >
                        Add tab
                      </Button>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[190px]">
                    <SelectValue placeholder="Filters" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All filters</SelectItem>
                    {filterOptions.map((filterName) => (
                      <SelectItem key={filterName} value={filterName}>
                        {filterName}
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

            {visibleWorkspaceTabs.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
                Add a workspace tab to continue.
              </div>
            ) : null}

            {visibleWorkspaceTabs.includes('po-draft') ? (
              <TabsContent value="po-draft" className="mt-4">
                <PoDraftWorkspace
                  lines={selectedLines}
                  description={poDescription}
                  matches={poDescriptionMatches}
                  visibleColumns={visiblePoColumns}
                  customColumns={customPoColumns}
                  newColumnName={newPoColumnName}
                  onDescriptionChange={setPoDescription}
                  onCreateLine={createLineFromPoDescription}
                  onToggleColumn={togglePoColumn}
                  onNewColumnNameChange={setNewPoColumnName}
                  onAddCustomColumn={addCustomPoColumn}
                  onUpdateCustomField={updateLineCustomField}
                  onGeneratePoDraft={() => showHandoffToast('PO draft')}
                />
              </TabsContent>
            ) : null}

            {visibleWorkspaceTabs.includes('parts-request') ? (
              <TabsContent value="parts-request" className="mt-4">
                <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h2 className="font-semibold text-slate-950">Parts/request</h2>
                      <p className="text-sm text-slate-600">
                        {selectedLines.length} selected line(s) ready for request staging
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      disabled={selectedLines.length === 0}
                      onClick={() => showHandoffToast('parts request')}
                    >
                      <PackagePlus className="mr-2 h-4 w-4" />
                      Create parts request
                    </Button>
                  </div>

                  <SourcingLineTable
                    lines={selectedLines}
                    emptyMessage="Select BOM lines to stage a parts request."
                  />
                </section>
              </TabsContent>
            ) : null}

            {visibleWorkspaceTabs.includes('bom-wizard') ? (
              <TabsContent value="bom-wizard" className="mt-4">
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
                filterOptions={filterOptions}
                updateLine={updateLine}
                updateNumberLine={updateNumberLine}
              />
              </TabsContent>
            ) : null}

            {visibleWorkspaceTabs.includes('assembly-tree') ? (
              <TabsContent value="assembly-tree" className="mt-4">
                <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h2 className="font-semibold text-slate-950">Assembly Tree</h2>
                      <p className="text-sm text-slate-600">
                        {selectedLines.length} selected line(s) available for assembly planning
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      disabled={selectedLines.length === 0}
                      onClick={() => showHandoffToast('assembly tree')}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      Build assembly tree
                    </Button>
                  </div>
                  <SourcingLineTable
                    lines={selectedLines}
                    emptyMessage="Select BOM lines to build an assembly tree."
                  />
                </section>
              </TabsContent>
            ) : null}

            {visibleWorkspaceTabs
              .filter((tabId) => tabId.startsWith('custom:'))
              .map((tabId) => (
                <TabsContent key={tabId} value={tabId} className="mt-4">
                  <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                    <h2 className="font-semibold text-slate-950">{workspaceTabLabel(tabId)}</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Custom workspace tab for this draft BOM.
                    </p>
                  </section>
                </TabsContent>
              ))}
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

function PoDraftWorkspace({
  lines,
  description,
  matches,
  visibleColumns,
  customColumns,
  newColumnName,
  onDescriptionChange,
  onCreateLine,
  onToggleColumn,
  onNewColumnNameChange,
  onAddCustomColumn,
  onUpdateCustomField,
  onGeneratePoDraft,
}: {
  lines: BomLine[];
  description: string;
  matches: InventoryItemOption[];
  visibleColumns: PoColumnId[];
  customColumns: string[];
  newColumnName: string;
  onDescriptionChange: (value: string) => void;
  onCreateLine: (item?: InventoryItemOption) => void;
  onToggleColumn: (columnId: PoColumnId, checked: boolean) => void;
  onNewColumnNameChange: (value: string) => void;
  onAddCustomColumn: () => void;
  onUpdateCustomField: (lineId: string, columnName: string, value: string) => void;
  onGeneratePoDraft: () => void;
}) {
  const typedDescription = description.trim();
  const totalColumns = 2 + visibleColumns.length + customColumns.length;

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h2 className="font-semibold text-slate-950">PO Draft</h2>
              <p className="text-sm text-slate-600">
                Start with a part description. Existing inventory matches can be selected, or a new draft part can be created.
              </p>
            </div>
            <div className="grid gap-2 lg:grid-cols-[minmax(280px,520px)_auto]">
              <Input
                value={description}
                onChange={(event) => onDescriptionChange(event.target.value)}
                placeholder="Part description"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onCreateLine(matches[0]);
                  }
                }}
              />
              <Button type="button" onClick={() => onCreateLine(matches[0])} disabled={!typedDescription}>
                <Plus className="mr-2 h-4 w-4" />
                Add line
              </Button>
            </div>

            {typedDescription.length >= 2 ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                {matches.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Inventory matches</p>
                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {matches.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="rounded-md border border-slate-200 bg-white p-3 text-left text-sm hover:border-blue-300 hover:bg-blue-50"
                          onClick={() => onCreateLine(item)}
                        >
                          <span className="block font-medium text-slate-950">{item.name || item.description || 'Inventory item'}</span>
                          <span className="mt-1 block text-xs text-slate-500">
                            {[item.agPartNumber, item.source || item.supplier].filter(Boolean).join(' - ') || `Item #${item.id}`}
                          </span>
                        </button>
                      ))}
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => onCreateLine()}>
                      Create draft part instead
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-slate-600">No inventory match found.</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => onCreateLine()}>
                      Create draft part
                    </Button>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <Button variant="outline" disabled={lines.length === 0} onClick={onGeneratePoDraft}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Generate PO draft
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Columns</h3>
            <p className="text-sm text-slate-600">Show existing BOM fields or create a new PO draft column.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              className="w-[220px]"
              value={newColumnName}
              onChange={(event) => onNewColumnNameChange(event.target.value)}
              placeholder="New column name"
            />
            <Button type="button" variant="outline" onClick={onAddCustomColumn} disabled={!newColumnName.trim()}>
              Add column
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          {(Object.keys(poColumnLabels) as PoColumnId[]).map((columnId) => (
            <label key={columnId} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
              <Checkbox
                checked={visibleColumns.includes(columnId)}
                onCheckedChange={(checked) => onToggleColumn(columnId, checked === true)}
              />
              {poColumnLabels[columnId]}
            </label>
          ))}
        </div>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[320px]">Part description</TableHead>
                {visibleColumns.map((columnId) => (
                  <TableHead key={columnId} className="min-w-[130px]">
                    {poColumnLabels[columnId]}
                  </TableHead>
                ))}
                {customColumns.map((columnName) => (
                  <TableHead key={columnName} className="min-w-[160px]">
                    {columnName}
                  </TableHead>
                ))}
                <TableHead className="w-[110px]">Part type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={totalColumns} className="h-24 text-center text-slate-500">
                    Add a part description to begin the PO draft.
                  </TableCell>
                </TableRow>
              ) : (
                lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell className="font-medium">{line.description || '-'}</TableCell>
                    {visibleColumns.map((columnId) => (
                      <TableCell key={columnId}>{poColumnValue(line, columnId)}</TableCell>
                    ))}
                    {customColumns.map((columnName) => (
                      <TableCell key={columnName}>
                        <Input
                          className="h-9"
                          value={line.customFields?.[columnName] ?? ''}
                          onChange={(event) => onUpdateCustomField(line.id, columnName, event.target.value)}
                        />
                      </TableCell>
                    ))}
                    <TableCell>
                      <Badge variant={line.inventoryItemId ? 'outline' : 'secondary'}>
                        {line.inventoryItemId ? 'Inventory' : 'Draft part'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </section>
  );
}

function poColumnValue(line: BomLine, columnId: PoColumnId) {
  if (columnId === 'filter') return line.category || '-';
  if (columnId === 'supplier') return line.supplier || '-';
  if (columnId === 'supplierItemId') return line.supplierItemId || '-';
  if (columnId === 'agPartNumber') return line.agPartNumber || '-';
  if (columnId === 'qtyNeeded') return line.qtyNeeded || '-';
  if (columnId === 'unitCost') return line.unitCost === '' ? '-' : money(asNumber(line.unitCost));
  if (columnId === 'extCost') return money(asNumber(line.unitCost) * asNumber(line.qtyNeeded));
  if (columnId === 'action') return line.action;
  if (columnId === 'status') return line.status;
  if (columnId === 'source') return line.inventoryItemId ? `Inventory #${line.inventoryItemId}` : 'Draft part';
  return '-';
}

function SourcingLineTable({ lines, emptyMessage }: { lines: BomLine[]; emptyMessage: string }) {
  return (
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
          {lines.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="h-24 text-center text-slate-500">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            lines.map((line) => {
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
  );
}

function BomLineGrid({
  lines,
  filterOptions,
  updateLine,
  updateNumberLine,
}: {
  lines: BomLine[];
  filterOptions: string[];
  updateLine: (id: string, patch: Partial<BomLine>) => void;
  updateNumberLine: (id: string, field: 'unitCost' | 'qtyNeeded', value: string) => void;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <datalist id="draft-bom-filter-options">
        {filterOptions.map((filterName) => (
          <option key={filterName} value={filterName} />
        ))}
      </datalist>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[56px]">Use</TableHead>
              <TableHead className="w-[150px]">Order Action</TableHead>
              <TableHead className="w-[180px]">Filter</TableHead>
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
                      <Input
                        className="h-9"
                        list="draft-bom-filter-options"
                        value={line.category}
                        onChange={(event) => updateLine(line.id, { category: event.target.value })}
                        placeholder="Filter name"
                      />
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
