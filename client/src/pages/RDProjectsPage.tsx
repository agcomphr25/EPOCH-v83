import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronRight,
  FilePlus2,
  FlaskConical,
  FolderOpen,
  GitBranch,
  PackageCheck,
  Plus,
  UserCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

interface EmployeeOption {
  id: number;
  name: string;
  userRole?: string;
}

type RDProjectStatus = 'draft' | 'active';
type PartStatus = 'on_hand' | 'ordered' | 'manufacturing' | 'short';

interface DraftBuilderTab {
  id: string;
  name: string;
  partCount: number;
  updatedAt: string;
}

interface DraftBomLine {
  agPartNumber?: string;
  supplierItemId?: string;
  description?: string;
  itemDescription?: string;
  qtyNeeded?: number | string;
  quantity?: number | string;
  status?: string;
  action?: string;
}

interface DraftBomRecord {
  id: string;
  name: string;
  revision?: string;
  projectId?: string | null;
  projectType?: 'P2_PROJECT' | 'R_AND_D' | null;
  projectName?: string | null;
  project?: string | null;
  updatedAt?: string;
  lines?: DraftBomLine[];
}

interface RDPart {
  partNumber: string;
  description: string;
  required: number;
  onHand: number;
  ordered: number;
  manufactured: number;
  status: PartStatus;
}

interface AssemblyNode {
  id: string;
  label: string;
  status: PartStatus;
  children?: AssemblyNode[];
}

interface RDProject {
  id: string;
  projectName: string;
  owner: string;
  status: RDProjectStatus;
  signoffRequired: boolean;
  signoffUserId: string;
  draftTabIds: string[];
  description: string;
}

const R_AND_D_PROJECT_STORAGE_KEY = 'epoch.rdProjects.v1';
const DRAFT_BOM_STORAGE_KEY = 'epoch:draft-boms';

const fallbackDraftTabs: DraftBuilderTab[] = [
  { id: 'concept-bom', name: 'Concept BOM', partCount: 18, updatedAt: '2026-06-03' },
  { id: 'prototype-build', name: 'Prototype Build', partCount: 26, updatedAt: '2026-06-05' },
  { id: 'test-fixture', name: 'Test Fixture', partCount: 9, updatedAt: '2026-06-07' },
];

const fallbackParts: RDPart[] = [
  {
    partNumber: 'RD-ASM-001',
    description: 'Prototype upper assembly',
    required: 1,
    onHand: 0,
    ordered: 0,
    manufactured: 1,
    status: 'manufacturing',
  },
  {
    partNumber: 'RD-MAT-018',
    description: 'High-temp laminate panel',
    required: 4,
    onHand: 2,
    ordered: 2,
    manufactured: 0,
    status: 'ordered',
  },
  {
    partNumber: 'RD-HDW-044',
    description: 'Titanium retention hardware',
    required: 12,
    onHand: 12,
    ordered: 0,
    manufactured: 0,
    status: 'on_hand',
  },
  {
    partNumber: 'RD-CMP-009',
    description: 'Sensor bracket blank',
    required: 6,
    onHand: 1,
    ordered: 0,
    manufactured: 2,
    status: 'short',
  },
];

const fallbackAssemblyTree: AssemblyNode[] = [
  {
    id: 'root',
    label: 'R&D Prototype Assembly',
    status: 'manufacturing',
    children: [
      {
        id: 'upper',
        label: 'Upper Structure',
        status: 'manufacturing',
        children: [
          { id: 'laminate-panel', label: 'High-temp laminate panel', status: 'ordered' },
          { id: 'retention-hardware', label: 'Titanium retention hardware', status: 'on_hand' },
        ],
      },
      {
        id: 'sensor-package',
        label: 'Sensor Package',
        status: 'short',
        children: [{ id: 'sensor-bracket', label: 'Sensor bracket blank', status: 'short' }],
      },
    ],
  },
];

const statusLabels: Record<PartStatus, string> = {
  on_hand: 'On hand',
  ordered: 'Ordered',
  manufacturing: 'Manufacturing',
  short: 'Short',
};

const statusClasses: Record<PartStatus, string> = {
  on_hand: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  ordered: 'bg-blue-100 text-blue-800 border-blue-200',
  manufacturing: 'bg-amber-100 text-amber-800 border-amber-200',
  short: 'bg-red-100 text-red-800 border-red-200',
};

const emptyProject = {
  projectName: '',
  owner: '',
  description: '',
  signoffRequired: false,
  signoffUserId: '',
  draftTabIds: [] as string[],
};

function readJsonStorage<T>(key: string, fallback: T): T {
  try {
    if (typeof window === 'undefined') return fallback;
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function asNumber(value: number | string | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePartStatus(line: DraftBomLine): PartStatus {
  const status = (line.status ?? '').toLowerCase();
  const action = (line.action ?? '').toLowerCase();

  if (status.includes('on hand')) return 'on_hand';
  if (status.includes('order') || status.includes('eta') || action.includes('order')) return 'ordered';
  if (status.includes('hold') || status.includes('review') || status.includes('quote')) return 'short';
  return 'manufacturing';
}

function partReadiness(parts: RDPart[]) {
  const required = parts.reduce((sum, part) => sum + part.required, 0);
  const available = parts.reduce((sum, part) => sum + Math.min(part.required, part.onHand + part.manufactured), 0);
  return required === 0 ? 0 : Math.round((available / required) * 100);
}

function draftRecordToTab(draft: DraftBomRecord): DraftBuilderTab {
  return {
    id: draft.id,
    name: [draft.name, draft.revision].filter(Boolean).join(' - '),
    partCount: draft.lines?.length ?? 0,
    updatedAt: draft.updatedAt ?? 'Not saved',
  };
}

function getDraftTabs(records: DraftBomRecord[]): DraftBuilderTab[] {
  const tabs = records.map(draftRecordToTab);
  return tabs.length > 0 ? tabs : fallbackDraftTabs;
}

function isDraftLinkedToProject(project: RDProject, draft: DraftBomRecord) {
  return project.draftTabIds.includes(draft.id)
    || (draft.projectType === 'R_AND_D' && draft.projectId === project.id);
}

function getDraftRecordsForProject(project: RDProject | null, records: DraftBomRecord[]) {
  if (!project) return [];
  return records.filter((draft) => isDraftLinkedToProject(project, draft));
}

function getDraftTabsForProject(project: RDProject | null, records: DraftBomRecord[], allTabs: DraftBuilderTab[]) {
  if (!project) return [];
  const linkedRecords = getDraftRecordsForProject(project, records);
  const linkedIds = new Set(linkedRecords.map((draft) => draft.id));
  const linkedRecordTabs = linkedRecords.map(draftRecordToTab);
  const manuallyAttachedTabs = allTabs.filter((tab) => project.draftTabIds.includes(tab.id) && !linkedIds.has(tab.id));
  return [...linkedRecordTabs, ...manuallyAttachedTabs];
}

function getPartsForProject(project: RDProject | null, records: DraftBomRecord[]) {
  if (!project) return [];
  const attachedRecords = getDraftRecordsForProject(project, records);
  const lines = attachedRecords.flatMap((draft) => draft.lines ?? []);

  if (lines.length === 0) return project.draftTabIds.length > 0 || attachedRecords.length > 0 ? [] : fallbackParts;

  return lines.slice(0, 80).map((line, index) => {
    const required = Math.max(1, asNumber(line.qtyNeeded ?? line.quantity));
    const status = normalizePartStatus(line);
    return {
      partNumber: line.agPartNumber || line.supplierItemId || `RD-DRAFT-${String(index + 1).padStart(3, '0')}`,
      description: line.description || line.itemDescription || 'Draft BOM line',
      required,
      onHand: status === 'on_hand' ? required : 0,
      ordered: status === 'ordered' ? required : 0,
      manufactured: status === 'manufacturing' ? Math.max(1, Math.floor(required / 2)) : 0,
      status,
    };
  });
}

function getAssemblyTreeForProject(project: RDProject | null, parts: RDPart[]) {
  if (!project) return [];
  if (parts.length === 0) return [];
  if (parts === fallbackParts) return fallbackAssemblyTree;

  const grouped = parts.reduce<Record<PartStatus, RDPart[]>>(
    (groups, part) => {
      groups[part.status].push(part);
      return groups;
    },
    { on_hand: [], ordered: [], manufacturing: [], short: [] },
  );

  const children = (Object.entries(grouped) as [PartStatus, RDPart[]][])
    .filter(([, items]) => items.length > 0)
    .map(([status, items]) => ({
      id: status,
      label: statusLabels[status],
      status,
      children: items.slice(0, 12).map((item) => ({
        id: item.partNumber,
        label: `${item.partNumber} - ${item.description}`,
        status: item.status,
      })),
    }));

  return [
    {
      id: project.id,
      label: project.projectName,
      status: parts.some((part) => part.status === 'short') ? 'short' : 'manufacturing',
      children,
    } satisfies AssemblyNode,
  ];
}

function AssemblyTreeNode({ node, depth = 0 }: { node: AssemblyNode; depth?: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-md border bg-white px-3 py-2" style={{ marginLeft: depth * 18 }}>
        <GitBranch className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1 text-sm font-medium">{node.label}</span>
        <Badge variant="outline" className={statusClasses[node.status]}>
          {statusLabels[node.status]}
        </Badge>
      </div>
      {node.children?.map((child) => (
        <AssemblyTreeNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function RDProjectsPage() {
  const [, setLocation] = useLocation();
  const { data: employees = [] } = useQuery<EmployeeOption[]>({
    queryKey: ['/api/employees'],
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyProject);
  const [draftRecords, setDraftRecords] = useState<DraftBomRecord[]>(() => readJsonStorage(DRAFT_BOM_STORAGE_KEY, []));
  const [projects, setProjects] = useState<RDProject[]>(() => readJsonStorage(R_AND_D_PROJECT_STORAGE_KEY, []));
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const draftTabs = useMemo(() => getDraftTabs(draftRecords), [draftRecords]);
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null;
  const selectedDraftTabs = useMemo(
    () => getDraftTabsForProject(selectedProject, draftRecords, draftTabs),
    [draftRecords, draftTabs, selectedProject],
  );
  const selectedParts = useMemo(() => getPartsForProject(selectedProject, draftRecords), [draftRecords, selectedProject]);
  const selectedAssemblyTree = useMemo(
    () => getAssemblyTreeForProject(selectedProject, selectedParts),
    [selectedParts, selectedProject],
  );
  const activeProjects = projects.filter((project) => project.status === 'active').length;
  const draftProjects = projects.filter((project) => project.status === 'draft').length;

  useEffect(() => {
    writeJsonStorage(R_AND_D_PROJECT_STORAGE_KEY, projects);
  }, [projects]);

  useEffect(() => {
    const refreshDraftRecords = () => setDraftRecords(readJsonStorage(DRAFT_BOM_STORAGE_KEY, []));
    window.addEventListener('storage', refreshDraftRecords);
    window.addEventListener('focus', refreshDraftRecords);
    return () => {
      window.removeEventListener('storage', refreshDraftRecords);
      window.removeEventListener('focus', refreshDraftRecords);
    };
  }, []);

  const resetForm = () => setForm(emptyProject);

  const createProject = () => {
    const project: RDProject = {
      id: `rd-${Date.now()}`,
      projectName: form.projectName.trim(),
      owner: form.owner.trim(),
      description: form.description.trim(),
      signoffRequired: form.signoffRequired,
      signoffUserId: form.signoffRequired ? form.signoffUserId : '',
      draftTabIds: form.draftTabIds,
      status: 'draft',
    };
    setProjects((current) => [project, ...current]);
    setSelectedProjectId(project.id);
    resetForm();
    setIsDialogOpen(false);
  };

  const toggleProjectStatus = (projectId: string, active: boolean) => {
    setProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? { ...project, status: active ? 'active' : 'draft' }
          : project
      )
    );
  };

  const toggleDraftTab = (tabId: string, checked: boolean) => {
    setForm((current) => ({
      ...current,
      draftTabIds: checked
        ? [...current.draftTabIds, tabId]
        : current.draftTabIds.filter((id) => id !== tabId),
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Design and R&amp;D Projects</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Create research projects, attach draft BOM tabs, and track assembly readiness as parts are ordered or manufactured.
            </p>
          </div>
          <Button className="gap-2 self-start" onClick={() => setIsDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            New R &amp; D Project
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Draft projects</CardDescription>
              <CardTitle className="text-3xl">{draftProjects}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active projects</CardDescription>
              <CardTitle className="text-3xl">{activeProjects}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Draft builder tabs available</CardDescription>
              <CardTitle className="text-3xl">{draftTabs.length}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {projects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <div className="rounded-full bg-cyan-50 p-3">
                <FlaskConical className="h-8 w-8 text-cyan-700" />
              </div>
              <div>
                <p className="text-lg font-semibold">No R &amp; D projects yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Start one as a draft, attach Draft Builder tabs, then activate it when work begins.
                </p>
              </div>
              <Button variant="outline" className="gap-2" onClick={() => setIsDialogOpen(true)}>
                <FilePlus2 className="h-4 w-4" />
                Create Project
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => {
                const projectParts = getPartsForProject(project, draftRecords);
                const readiness = partReadiness(projectParts);
                const attachedTabCount = getDraftTabsForProject(project, draftRecords, draftTabs).length;
                const isSelected = selectedProject?.id === project.id;

                return (
                  <Card
                    key={project.id}
                    className={`cursor-pointer transition hover:shadow-lg ${
                      isSelected ? 'border-primary shadow-sm ring-1 ring-primary/20' : ''
                    }`}
                    onClick={() => setSelectedProjectId(project.id)}
                    data-testid={`card-rd-project-${project.id}`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="rounded-md bg-amber-50 p-2">
                            <FolderOpen className="h-6 w-6 text-amber-500" />
                          </div>
                          <div className="min-w-0">
                            <CardTitle className="truncate text-lg">{project.projectName}</CardTitle>
                            <CardDescription className="mt-1 truncate">
                              Owner: {project.owner || 'Unassigned'}
                            </CardDescription>
                          </div>
                        </div>
                        <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
                          {project.status === 'active' ? 'Active' : 'Draft'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-md border bg-white px-3 py-2">
                          <p className="text-xs text-muted-foreground">Draft tabs</p>
                          <p className="font-semibold">{attachedTabCount}</p>
                        </div>
                        <div className="rounded-md border bg-white px-3 py-2">
                          <p className="text-xs text-muted-foreground">Parts</p>
                          <p className="font-semibold">{projectParts.length}</p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Readiness</span>
                          <span className="font-medium">{readiness}%</span>
                        </div>
                        <Progress value={readiness} className="h-2" />
                      </div>

                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{project.signoffRequired ? 'Signoff required' : 'No signoff required'}</span>
                        <ChevronRight className="h-5 w-5" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {selectedProject && (
              <Card>
                <CardHeader className="space-y-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <CardTitle className="text-2xl">{selectedProject.projectName}</CardTitle>
                      <CardDescription className="mt-1">
                        Owner: {selectedProject.owner || 'Unassigned'}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-3 rounded-md border bg-white px-3 py-2">
                      <Label htmlFor="project-active-switch" className="text-sm font-medium">
                        Draft
                      </Label>
                      <Switch
                        id="project-active-switch"
                        checked={selectedProject.status === 'active'}
                        onCheckedChange={(checked) => toggleProjectStatus(selectedProject.id, checked)}
                      />
                      <Label htmlFor="project-active-switch" className="text-sm font-medium">
                        Active
                      </Label>
                    </div>
                  </div>
                  {selectedProject.signoffRequired && (
                    <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <UserCheck className="h-4 w-4" />
                      Activation signoff assigned to{' '}
                      {employees.find((employee) => String(employee.id) === selectedProject.signoffUserId)?.name ?? 'selected approver'}
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="overview" className="space-y-4">
                    <TabsList className="grid w-full grid-cols-4">
                      <TabsTrigger value="overview">Overview</TabsTrigger>
                      <TabsTrigger value="draft-tabs">Draft Tabs</TabsTrigger>
                      <TabsTrigger value="assembly-tree">Assembly Tree</TabsTrigger>
                      <TabsTrigger value="parts">Parts</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base">Readiness</CardTitle>
                            <CardDescription>Based on required BOM quantity vs. on-hand and manufactured parts.</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <Progress value={partReadiness(selectedParts)} />
                            <p className="text-sm font-medium">{partReadiness(selectedParts)}% ready</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base">Start Gate</CardTitle>
                            <CardDescription>Draft projects can be switched active when work starts.</CardDescription>
                          </CardHeader>
                          <CardContent className="flex items-center gap-2 text-sm">
                            {selectedProject.signoffRequired ? (
                              <AlertTriangle className="h-4 w-4 text-amber-600" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            )}
                            {selectedProject.signoffRequired ? 'Signoff required before activation.' : 'No activation signoff required.'}
                          </CardContent>
                        </Card>
                      </div>
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Project Notes</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                          {selectedProject.description || 'No notes entered.'}
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Draft BOM Summary</CardTitle>
                          <CardDescription>
                            Draft Builder records linked to this R&amp;D project.
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          {selectedDraftTabs.length === 0 ? (
                            <div className="flex flex-col items-start gap-3 text-sm text-muted-foreground">
                              No Draft Builder tabs are linked to this project.
                              <Button variant="outline" size="sm" onClick={() => setLocation('/estimating/bom-drafts')}>
                                Open Draft Builder
                              </Button>
                            </div>
                          ) : (
                            <div className="grid gap-3 md:grid-cols-2">
                              {selectedDraftTabs.map((tab) => (
                                <div key={tab.id} className="rounded-md border bg-white px-3 py-2">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium text-slate-950">{tab.name}</p>
                                      <p className="mt-1 text-xs text-muted-foreground">Updated {tab.updatedAt}</p>
                                    </div>
                                    <Badge variant="outline">{tab.partCount} parts</Badge>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="draft-tabs">
                      <div className="grid gap-3 md:grid-cols-2">
                        {selectedDraftTabs.length === 0 ? (
                          <Card className="md:col-span-2">
                            <CardContent className="flex flex-col items-center gap-3 py-8 text-center text-sm text-muted-foreground">
                              No Draft Builder tabs are attached to this project.
                              <Button variant="outline" size="sm" onClick={() => setLocation('/estimating/bom-drafts')}>
                                Open Draft Builder
                              </Button>
                            </CardContent>
                          </Card>
                        ) : (
                          selectedDraftTabs.map((tab) => (
                            <Card key={tab.id}>
                              <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                  <Boxes className="h-4 w-4 text-cyan-700" />
                                  {tab.name}
                                </CardTitle>
                                <CardDescription>{tab.partCount} parts, updated {tab.updatedAt}</CardDescription>
                              </CardHeader>
                            </Card>
                          ))
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="assembly-tree" className="space-y-2">
                      {selectedAssemblyTree.length === 0 ? (
                        <Card>
                          <CardContent className="py-8 text-center text-sm text-muted-foreground">
                            Attach a draft BOM tab to build an assembly tree.
                          </CardContent>
                        </Card>
                      ) : (
                        selectedAssemblyTree.map((node) => <AssemblyTreeNode key={node.id} node={node} />)
                      )}
                    </TabsContent>

                    <TabsContent value="parts">
                      <div className="overflow-x-auto rounded-md border bg-white">
                        <div className="grid min-w-[760px] grid-cols-[1.2fr_2fr_repeat(4,0.7fr)_1fr] gap-3 border-b bg-gray-50 px-4 py-2 text-xs font-semibold uppercase text-muted-foreground">
                          <span>Part</span>
                          <span>Description</span>
                          <span>Req</span>
                          <span>On Hand</span>
                          <span>Ordered</span>
                          <span>Mfg</span>
                          <span>Status</span>
                        </div>
                        {selectedParts.length === 0 ? (
                          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                            No parts to show until a draft BOM tab is attached.
                          </div>
                        ) : (
                          selectedParts.map((part) => (
                            <div key={`${part.partNumber}-${part.description}`} className="grid min-w-[760px] grid-cols-[1.2fr_2fr_repeat(4,0.7fr)_1fr] gap-3 border-b px-4 py-3 text-sm last:border-b-0">
                              <span className="font-mono text-xs">{part.partNumber}</span>
                              <span>{part.description}</span>
                              <span>{part.required}</span>
                              <span>{part.onHand}</span>
                              <span>{part.ordered}</span>
                              <span>{part.manufactured}</span>
                              <Badge variant="outline" className={statusClasses[part.status]}>
                                {statusLabels[part.status]}
                              </Badge>
                            </div>
                          ))
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create R &amp; D Project</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="rd-project-name">Project name</Label>
                <Input
                  id="rd-project-name"
                  value={form.projectName}
                  onChange={(event) => setForm((current) => ({ ...current, projectName: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rd-project-owner">Owner</Label>
                <Input
                  id="rd-project-owner"
                  value={form.owner}
                  onChange={(event) => setForm((current) => ({ ...current, owner: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rd-project-description">Notes</Label>
                <Textarea
                  id="rd-project-description"
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <Label htmlFor="rd-signoff-required">Require signoff to activate</Label>
                  <p className="text-xs text-muted-foreground">Select an approver when draft-to-active needs approval.</p>
                </div>
                <Switch
                  id="rd-signoff-required"
                  checked={form.signoffRequired}
                  onCheckedChange={(checked) => setForm((current) => ({ ...current, signoffRequired: checked }))}
                />
              </div>
              {form.signoffRequired && (
                <div className="grid gap-2">
                  <Label>Activation approver</Label>
                  <Select
                    value={form.signoffUserId}
                    onValueChange={(value) => setForm((current) => ({ ...current, signoffUserId: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((employee) => (
                        <SelectItem key={employee.id} value={String(employee.id)}>
                          {employee.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Draft Builder tabs</Label>
                  <Button variant="ghost" size="sm" onClick={() => setLocation('/estimating/bom-drafts')}>
                    Open Draft Builder
                  </Button>
                </div>
                <div className="grid gap-2 rounded-md border p-3">
                  {draftTabs.map((tab) => (
                    <label key={tab.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-gray-50">
                      <Checkbox
                        checked={form.draftTabIds.includes(tab.id)}
                        onCheckedChange={(checked) => toggleDraftTab(tab.id, checked === true)}
                      />
                      <span className="flex-1 text-sm font-medium">{tab.name}</span>
                      <span className="text-xs text-muted-foreground">{tab.partCount} parts</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={createProject}
                disabled={!form.projectName.trim() || !form.owner.trim() || (form.signoffRequired && !form.signoffUserId)}
              >
                <PackageCheck className="mr-2 h-4 w-4" />
                Create Draft
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
