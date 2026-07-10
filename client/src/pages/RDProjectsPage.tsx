import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FilePlus2,
  FlaskConical,
  FolderOpen,
  GitBranch,
  PackageCheck,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

interface EmployeeOption {
  id: number;
  name: string;
  employeeCode?: string;
  isActive?: boolean;
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
  id?: string;
  agPartNumber?: string;
  supplierItemId?: string;
  description?: string;
  itemDescription?: string;
  inventoryItemId?: number | null;
  inventoryItemName?: string | null;
  qtyNeeded?: number | string;
  quantity?: number | string;
  status?: string;
  action?: string;
  isManufactured?: boolean;
  childDraftBoms?: DraftPartBom[];
}

interface DraftLaborEstimateLine {
  id?: string;
  employeeRole?: string;
  hourlyRate?: number | string;
  hoursPerPart?: number | string;
  quantityPerPo?: number | string;
}

interface DraftBomComponent {
  id: string;
  sourceLineId?: string | null;
  inventoryItemId?: number | null;
  partNumber: string;
  description: string;
  quantity: number;
  isManufactured?: boolean;
}

interface DraftBomPart {
  id: string;
  sourceLineId?: string | null;
  inventoryItemId?: number | null;
  partNumber: string;
  description: string;
  quantity: number;
  bomItems?: DraftBomComponent[];
}

interface DraftPartBom {
  id: string;
  name: string;
  revision?: string;
  rootPart: DraftBomPart;
  parts?: DraftBomPart[];
}

interface DraftBomRecord {
  id: string;
  name: string;
  revision?: string;
  projectId?: string | null;
  projectCode?: string | null;
  projectType?: 'P2_PROJECT' | 'R_AND_D' | null;
  projectName?: string | null;
  project?: string | null;
  updatedAt?: string;
  lines?: DraftBomLine[];
  partsRequestLines?: DraftBomLine[];
  laborEstimateLines?: DraftLaborEstimateLine[];
  savedDraftBoms?: DraftPartBom[];
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
  deletedDraftTabIds?: string[];
  description: string;
}

interface DesignControlProjectRecord {
  id: string;
  title: string;
  status: string;
  rdProjectId?: string | null;
  updatedAt?: string | null;
  releasedAt?: string | null;
}

const R_AND_D_PROJECT_STORAGE_KEY = 'epoch.rdProjects.v1';
const DRAFT_BOM_STORAGE_KEY = 'epoch:draft-boms';
const DRAFT_TAB_HANDOFF_KEY = 'epoch:draft-builder-tab-handoff';

const fallbackDraftTabs: DraftBuilderTab[] = [
  {
    id: 'concept-bom',
    name: 'Concept BOM',
    partCount: 18,
    updatedAt: '2026-06-03',
  },
  {
    id: 'prototype-build',
    name: 'Prototype Build',
    partCount: 26,
    updatedAt: '2026-06-05',
  },
  {
    id: 'test-fixture',
    name: 'Test Fixture',
    partCount: 9,
    updatedAt: '2026-06-07',
  },
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
          {
            id: 'laminate-panel',
            label: 'High-temp laminate panel',
            status: 'ordered',
          },
          {
            id: 'retention-hardware',
            label: 'Titanium retention hardware',
            status: 'on_hand',
          },
        ],
      },
      {
        id: 'sensor-package',
        label: 'Sensor Package',
        status: 'short',
        children: [
          {
            id: 'sensor-bracket',
            label: 'Sensor bracket blank',
            status: 'short',
          },
        ],
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
  if (
    status.includes('order') ||
    status.includes('eta') ||
    action.includes('order')
  )
    return 'ordered';
  if (
    status.includes('hold') ||
    status.includes('review') ||
    status.includes('quote')
  )
    return 'short';
  return 'manufacturing';
}

function hasPlanningGap(nodes: AssemblyNode[]) {
  return nodes.some(
    (node) => node.status === 'short' || hasPlanningGap(node.children ?? [])
  );
}

function draftLinePartNumber(line: DraftBomLine, index = 0) {
  return (
    line.agPartNumber ||
    line.supplierItemId ||
    `RD-DRAFT-${String(index + 1).padStart(3, '0')}`
  );
}

function draftLineDescription(line: DraftBomLine) {
  return (
    line.description ||
    line.itemDescription ||
    line.inventoryItemName ||
    'Draft BOM line'
  );
}

function normalizedPartKey(value?: string | null) {
  return value?.trim().toLowerCase() ?? '';
}

function normalizedProjectKey(value?: string | null) {
  return (
    value
      ?.trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '') ?? ''
  );
}

function mergeDraftRecords(
  localRecords: DraftBomRecord[],
  sharedRecords: DraftBomRecord[]
) {
  const byId = new Map<string, DraftBomRecord>();
  for (const record of [...localRecords, ...sharedRecords]) {
    if (record?.id) byId.set(record.id, record);
  }
  return [...byId.values()].sort((a, b) =>
    (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
  );
}

function mergeProjects(
  sharedProjects: RDProject[],
  localProjects: RDProject[]
) {
  const byId = new Map<string, RDProject>();
  for (const project of [...sharedProjects, ...localProjects]) {
    if (project?.id) byId.set(project.id, project);
  }
  return [...byId.values()];
}

async function saveSharedProject(project: RDProject) {
  const response = await fetch(
    `/api/rd-projects/${encodeURIComponent(project.id)}`,
    {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    }
  );
  if (!response.ok) {
    throw new Error('Failed to save R&D project');
  }
  return response.json() as Promise<RDProject>;
}

async function saveSharedDraftRecord(draft: DraftBomRecord) {
  const response = await fetch(
    `/api/draft-bom-drafts/${encodeURIComponent(draft.id)}`,
    {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    }
  );
  if (!response.ok) {
    throw new Error('Failed to save Draft Builder draft');
  }
  return response.json() as Promise<DraftBomRecord>;
}

function findDraftLineForComponent(
  component: DraftBomComponent | DraftBomPart,
  lines: DraftBomLine[]
) {
  if (component.sourceLineId) {
    const match = lines.find((line) => line.id === component.sourceLineId);
    if (match) return match;
  }

  if (component.inventoryItemId) {
    const match = lines.find(
      (line) => line.inventoryItemId === component.inventoryItemId
    );
    if (match) return match;
  }

  const componentPart = normalizedPartKey(component.partNumber);
  const componentDescription = normalizedPartKey(component.description);
  return (
    lines.find(
      (line, index) =>
        normalizedPartKey(draftLinePartNumber(line, index)) === componentPart
    ) ??
    lines.find(
      (line) =>
        componentPart && normalizedPartKey(line.agPartNumber) === componentPart
    ) ??
    lines.find(
      (line) =>
        componentDescription &&
        normalizedPartKey(draftLineDescription(line)) === componentDescription
    )
  );
}

function partReadiness(parts: RDPart[]) {
  const required = parts.reduce((sum, part) => sum + part.required, 0);
  const available = parts.reduce(
    (sum, part) =>
      sum + Math.min(part.required, part.onHand + part.manufactured),
    0
  );
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

function linkDraftRecordToProject(
  draft: DraftBomRecord,
  project: RDProject
): DraftBomRecord {
  return {
    ...draft,
    projectId: project.id,
    projectType: 'R_AND_D',
    projectName: project.projectName,
    project: project.projectName,
    updatedAt: new Date().toISOString(),
  };
}

function unlinkDraftRecordFromProject(
  draft: DraftBomRecord,
  project: RDProject
): DraftBomRecord {
  if (draft.projectType !== 'R_AND_D' || draft.projectId !== project.id) {
    return draft;
  }
  return {
    ...draft,
    projectId: null,
    projectType: null,
    projectName: null,
    project: '',
    updatedAt: new Date().toISOString(),
  };
}

function getDraftTabs(records: DraftBomRecord[]): DraftBuilderTab[] {
  const tabs = records.map(draftRecordToTab);
  return tabs.length > 0 ? tabs : fallbackDraftTabs;
}

function isDraftLinkedToProject(project: RDProject, draft: DraftBomRecord) {
  if (project.deletedDraftTabIds?.includes(draft.id)) return false;
  const projectName = normalizedProjectKey(project.projectName);
  const draftProjectValues = [
    draft.projectName,
    draft.project,
    draft.projectCode,
  ].map(normalizedProjectKey);
  return (
    project.draftTabIds.includes(draft.id) ||
    (draft.projectType === 'R_AND_D' && draft.projectId === project.id) ||
    (!!projectName && draftProjectValues.includes(projectName))
  );
}

function getDraftRecordsForProject(
  project: RDProject | null,
  records: DraftBomRecord[]
) {
  if (!project) return [];
  return records.filter((draft) => isDraftLinkedToProject(project, draft));
}

function getDraftTabsForProject(
  project: RDProject | null,
  records: DraftBomRecord[],
  allTabs: DraftBuilderTab[]
) {
  if (!project) return [];
  const linkedRecords = getDraftRecordsForProject(project, records);
  const linkedIds = new Set(linkedRecords.map((draft) => draft.id));
  const linkedRecordTabs = linkedRecords.map(draftRecordToTab);
  const manuallyAttachedTabs = allTabs.filter(
    (tab) =>
      project.draftTabIds.includes(tab.id) &&
      !project.deletedDraftTabIds?.includes(tab.id) &&
      !linkedIds.has(tab.id)
  );
  return [...linkedRecordTabs, ...manuallyAttachedTabs];
}

function getPartsForProject(
  project: RDProject | null,
  records: DraftBomRecord[]
) {
  if (!project) return [];
  const attachedRecords = getDraftRecordsForProject(project, records);
  const lines = attachedRecords.flatMap((draft) =>
    (draft.partsRequestLines?.length ? draft.partsRequestLines : draft.lines) ?? []
  );

  if (lines.length === 0)
    return project.draftTabIds.length > 0 || attachedRecords.length > 0
      ? []
      : fallbackParts;

  return lines.slice(0, 80).map((line, index) => {
    const required = Math.max(1, asNumber(line.qtyNeeded ?? line.quantity));
    const status = normalizePartStatus(line);
    return {
      partNumber: draftLinePartNumber(line, index),
      description: draftLineDescription(line),
      required,
      onHand: status === 'on_hand' ? required : 0,
      ordered: status === 'ordered' ? required : 0,
      manufactured:
        status === 'manufacturing' ? Math.max(1, Math.floor(required / 2)) : 0,
      status,
    };
  });
}

function getBomRecordsForProject(project: RDProject | null, records: DraftBomRecord[]) {
  if (!project) return [];
  return getDraftRecordsForProject(project, records).flatMap((draft) => {
    const savedBoms = draft.savedDraftBoms ?? [];
    const childBoms = [
      ...(draft.lines ?? []),
      ...(draft.partsRequestLines ?? []),
    ].flatMap((line) => line.childDraftBoms ?? []);
    return [...savedBoms, ...childBoms].map((bom) => ({
      ...bom,
      sourceDraftName: [draft.name, draft.revision].filter(Boolean).join(' - '),
    }));
  });
}

function getLaborLinesForProject(project: RDProject | null, records: DraftBomRecord[]) {
  if (!project) return [];
  return getDraftRecordsForProject(project, records).flatMap((draft) =>
    (draft.laborEstimateLines ?? []).map((line) => ({
      ...line,
      sourceDraftName: [draft.name, draft.revision].filter(Boolean).join(' - '),
    }))
  );
}

function laborLineHours(line: DraftLaborEstimateLine) {
  return asNumber(line.hoursPerPart) * Math.max(1, asNumber(line.quantityPerPo));
}

function laborLineTotal(line: DraftLaborEstimateLine) {
  return laborLineHours(line) * asNumber(line.hourlyRate);
}

function getComponentChildren(
  components: DraftBomComponent[],
  lines: DraftBomLine[],
  visited: Set<string>
): AssemblyNode[] {
  return components.map((component) => {
    const matchingLine = findDraftLineForComponent(component, lines);
    const childBoms = matchingLine?.childDraftBoms ?? [];
    const nextVisited = new Set(visited);
    const componentKey = component.id || component.partNumber;
    nextVisited.add(componentKey);
    const children = childBoms.flatMap((bom) =>
      getBomComponentNodes(bom, lines, nextVisited)
    );
    const status = component.isManufactured
      ? hasPlanningGap(children)
        ? 'short'
        : 'manufacturing'
      : matchingLine
        ? normalizePartStatus(matchingLine)
        : 'short';

    return {
      id: componentKey,
      label: `${component.partNumber} - ${component.description}`,
      status,
      children,
    };
  });
}

function getBomComponentNodes(
  bom: DraftPartBom,
  lines: DraftBomLine[],
  visited: Set<string>
): AssemblyNode[] {
  if (visited.has(bom.id)) return [];
  const nextVisited = new Set([...visited, bom.id]);
  const rootPart = bom.parts?.[0] ?? bom.rootPart;
  const components = rootPart.bomItems ?? bom.rootPart.bomItems ?? [];
  return getComponentChildren(components, lines, nextVisited);
}

function getDraftLineAssemblyNode(
  line: DraftBomLine,
  index: number,
  allLines: DraftBomLine[]
): AssemblyNode {
  const partNumber = draftLinePartNumber(line, index);
  const children = (line.childDraftBoms ?? []).flatMap((bom) =>
    getBomComponentNodes(bom, allLines, new Set([line.id ?? partNumber]))
  );
  const status = line.isManufactured
    ? hasPlanningGap(children)
      ? 'short'
      : 'manufacturing'
    : normalizePartStatus(line);
  return {
    id: line.id ?? `${partNumber}-${index}`,
    label: `${partNumber} - ${draftLineDescription(line)}`,
    status,
    children,
  };
}

function getAssemblyTreeForProject(
  project: RDProject | null,
  records: DraftBomRecord[],
  parts: RDPart[]
) {
  if (!project) return [];
  const attachedRecords = getDraftRecordsForProject(project, records);
  const attachedLines = attachedRecords.flatMap((draft) => draft.lines ?? []);
  if (attachedRecords.length === 0)
    return parts === fallbackParts ? fallbackAssemblyTree : [];
  if (attachedLines.length === 0) return [];
  if (parts === fallbackParts) return fallbackAssemblyTree;

  return attachedRecords.map((draft) => {
    const lines = draft.lines ?? [];
    const children = lines.map((line, index) =>
      getDraftLineAssemblyNode(line, index, lines)
    );
    return {
      id: draft.id,
      label: [draft.name, draft.revision].filter(Boolean).join(' - '),
      status: children.some((node) => node.status === 'short')
        ? 'short'
        : 'manufacturing',
      children,
    } satisfies AssemblyNode;
  });
}

function AssemblyTreeNode({
  node,
  depth = 0,
}: {
  node: AssemblyNode;
  depth?: number;
}) {
  return (
    <div className="space-y-2">
      <div
        className="flex items-center gap-2 rounded-md border bg-white px-3 py-2"
        style={{ marginLeft: depth * 18 }}
      >
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
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: employees = [] } = useQuery<EmployeeOption[]>({
    queryKey: ['/api/employees'],
  });
  const { data: sharedProjects = [] } = useQuery<RDProject[]>({
    queryKey: ['/api/rd-projects'],
    retry: false,
    queryFn: async () => {
      const response = await fetch('/api/rd-projects', {
        credentials: 'include',
      });
      if (!response.ok) return [];
      const payload = await response.json();
      return Array.isArray(payload) ? payload : [];
    },
  });
  const { data: sharedDraftRecords = [] } = useQuery<DraftBomRecord[]>({
    queryKey: ['/api/draft-bom-drafts'],
    retry: false,
    queryFn: async () => {
      const response = await fetch('/api/draft-bom-drafts', {
        credentials: 'include',
      });
      if (!response.ok) return [];
      const payload = await response.json();
      return Array.isArray(payload) ? payload : [];
    },
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyProject);
  const [localDraftRecords, setLocalDraftRecords] = useState<DraftBomRecord[]>(
    () => readJsonStorage(DRAFT_BOM_STORAGE_KEY, [])
  );
  const [localProjects, setLocalProjects] = useState<RDProject[]>(() =>
    readJsonStorage(R_AND_D_PROJECT_STORAGE_KEY, [])
  );
  const [isCreatingDesignControlRecord, setIsCreatingDesignControlRecord] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('projectId')
  );
  const rdTabAliases: Record<string, string> = {
    'parts-request': 'material',
    parts: 'material',
    'direct-labor': 'labor',
    'bom-wizard': 'bom',
    'draft-tabs': 'files',
  };
  const initialProjectTab =
    rdTabAliases[new URLSearchParams(window.location.search).get('tab') ?? 'overview'] ??
    new URLSearchParams(window.location.search).get('tab') ??
    'overview';
  const [activeProjectTab, setActiveProjectTab] = useState(initialProjectTab);

  const projects = useMemo(
    () => mergeProjects(sharedProjects, localProjects),
    [sharedProjects, localProjects]
  );
  const draftRecords = useMemo(
    () => mergeDraftRecords(localDraftRecords, sharedDraftRecords),
    [localDraftRecords, sharedDraftRecords]
  );
  const draftTabs = useMemo(() => getDraftTabs(draftRecords), [draftRecords]);
  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ??
    projects[0] ??
    null;
  const selectedDraftTabs = useMemo(
    () => getDraftTabsForProject(selectedProject, draftRecords, draftTabs),
    [draftRecords, draftTabs, selectedProject]
  );
  const selectedParts = useMemo(
    () => getPartsForProject(selectedProject, draftRecords),
    [draftRecords, selectedProject]
  );
  const selectedBomRecords = useMemo(
    () => getBomRecordsForProject(selectedProject, draftRecords),
    [draftRecords, selectedProject]
  );
  const selectedLaborLines = useMemo(
    () => getLaborLinesForProject(selectedProject, draftRecords),
    [draftRecords, selectedProject]
  );
  const selectedLaborHours = selectedLaborLines.reduce(
    (sum, line) => sum + laborLineHours(line),
    0
  );
  const selectedLaborTotal = selectedLaborLines.reduce(
    (sum, line) => sum + laborLineTotal(line),
    0
  );
  const selectedAssemblyTree = useMemo(
    () =>
      getAssemblyTreeForProject(selectedProject, draftRecords, selectedParts),
    [draftRecords, selectedParts, selectedProject]
  );
  const activeProjects = projects.filter(
    (project) => project.status === 'active'
  ).length;
  const draftProjects = projects.filter(
    (project) => project.status === 'draft'
  ).length;
  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.isActive !== false),
    [employees]
  );
  const {
    data: selectedDesignControlPayload,
    isLoading: isLoadingDesignControlRecords,
  } = useQuery<{ records: DesignControlProjectRecord[] }>({
    queryKey: ['/api/qms/design-control', 'rd-project', selectedProject?.id],
    enabled: Boolean(selectedProject?.id),
    retry: false,
    queryFn: async () => {
      if (!selectedProject?.id) return { records: [] };
      const params = new URLSearchParams({ rdProjectId: selectedProject.id });
      const response = await fetch(`/api/qms/design-control?${params.toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) return { records: [] };
      const payload = await response.json();
      return {
        records: Array.isArray(payload.records) ? payload.records : [],
      };
    },
  });
  const selectedDesignControlRecords = selectedDesignControlPayload?.records ?? [];

  useEffect(() => {
    writeJsonStorage(R_AND_D_PROJECT_STORAGE_KEY, localProjects);
  }, [localProjects]);

  useEffect(() => {
    const refreshDraftRecords = () =>
      setLocalDraftRecords(readJsonStorage(DRAFT_BOM_STORAGE_KEY, []));
    window.addEventListener('storage', refreshDraftRecords);
    window.addEventListener('focus', refreshDraftRecords);
    return () => {
      window.removeEventListener('storage', refreshDraftRecords);
      window.removeEventListener('focus', refreshDraftRecords);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextProjectId = params.get('projectId');
    const requestedTab = params.get('tab') ?? 'overview';
    const nextTab = rdTabAliases[requestedTab] ?? requestedTab;
    if (nextProjectId) setSelectedProjectId(nextProjectId);
    setActiveProjectTab(nextTab);
  }, [location]);

  const editingProject =
    projects.find((project) => project.id === editingProjectId) ?? null;

  const resetForm = () => setForm(emptyProject);

  const closeProjectDialog = () => {
    setIsDialogOpen(false);
    setEditingProjectId(null);
    resetForm();
  };

  const openCreateProjectDialog = () => {
    setEditingProjectId(null);
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditProjectDialog = (project: RDProject) => {
    const ownerEmployee = activeEmployees.find(
      (employee) => employee.name === project.owner
    );
    setEditingProjectId(project.id);
    setForm({
      projectName: project.projectName,
      owner: ownerEmployee ? String(ownerEmployee.id) : project.owner,
      description: project.description,
      signoffRequired: project.signoffRequired,
      signoffUserId: project.signoffUserId,
      draftTabIds: [...project.draftTabIds],
    });
    setIsDialogOpen(true);
  };

  const persistProject = (project: RDProject) => {
    setLocalProjects((current) => [
      project,
      ...current.filter((item) => item.id !== project.id),
    ]);
    saveSharedProject(project)
      .then((saved) => {
        setLocalProjects((current) =>
          current.map((item) => (item.id === saved.id ? saved : item))
        );
        queryClient.invalidateQueries({ queryKey: ['/api/rd-projects'] });
      })
      .catch((error) => {
        console.error('Failed to persist shared R&D project:', error);
      });
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('draftBuilderHandoff') !== '1') return;

    const projectId = params.get('projectId');
    const draftId = params.get('draftId');
    if (!projectId || !draftId) return;

    const project = projects.find((item) => item.id === projectId);
    if (!project) return;

    const handoff = readJsonStorage<any>(DRAFT_TAB_HANDOFF_KEY, null);
    const handoffDraft = handoff?.draft?.id === draftId ? handoff.draft : null;
    const existingDraft = draftRecords.find((draft) => draft.id === draftId);
    const sourceDraft = handoffDraft ?? existingDraft;
    if (!sourceDraft) return;

    const linkedDraft = linkDraftRecordToProject(sourceDraft, project);
    if (
      existingDraft?.projectType !== 'R_AND_D' ||
      existingDraft?.projectId !== project.id
    ) {
      setLocalDraftRecords((current) => mergeDraftRecords(current, [linkedDraft]));
      queryClient.setQueryData<DraftBomRecord[]>(
        ['/api/draft-bom-drafts'],
        (current = []) => mergeDraftRecords(current, [linkedDraft])
      );
      saveSharedDraftRecord(linkedDraft)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['/api/draft-bom-drafts'] });
        })
        .catch((error) => {
          console.error('Failed to attach Draft Builder handoff to R&D project:', error);
        });
    }

    if (project.deletedDraftTabIds?.includes(draftId)) {
      persistProject({
        ...project,
        deletedDraftTabIds: project.deletedDraftTabIds.filter((id) => id !== draftId),
      });
    }
  }, [draftRecords, location, projects, queryClient]);

  const syncDraftLinksForProject = (project: RDProject) => {
    const linkedIds = new Set(project.draftTabIds);
    const updatedDrafts = draftRecords
      .filter(
        (draft) =>
          linkedIds.has(draft.id) ||
          (draft.projectType === 'R_AND_D' && draft.projectId === project.id)
      )
      .map((draft) =>
        linkedIds.has(draft.id)
          ? linkDraftRecordToProject(draft, project)
          : unlinkDraftRecordFromProject(draft, project)
      );

    if (updatedDrafts.length === 0) return;

    setLocalDraftRecords((current) =>
      mergeDraftRecords(current, updatedDrafts)
    );
    queryClient.setQueryData<DraftBomRecord[]>(
      ['/api/draft-bom-drafts'],
      (current = []) => mergeDraftRecords(current, updatedDrafts)
    );

    Promise.all(updatedDrafts.map(saveSharedDraftRecord))
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/draft-bom-drafts'] });
      })
      .catch((error) => {
        console.error(
          'Failed to link selected Draft Builder tabs to R&D project:',
          error
        );
      });
  };

  const saveProject = () => {
    const ownerEmployee = activeEmployees.find(
      (employee) => String(employee.id) === form.owner
    );
    const ownerFallback = form.owner.trim() || editingProject?.owner || '';
    const owner = ownerEmployee?.name ?? ownerFallback;
    const isEditing = !!editingProject;
    const project: RDProject = {
      id: editingProject?.id ?? `rd-${Date.now()}`,
      projectName: form.projectName.trim(),
      owner,
      description: form.description.trim(),
      signoffRequired: form.signoffRequired,
      signoffUserId: form.signoffRequired ? form.signoffUserId : '',
      draftTabIds: [...form.draftTabIds],
      deletedDraftTabIds: (editingProject?.deletedDraftTabIds ?? []).filter(
        (id) => !form.draftTabIds.includes(id)
      ),
      status: editingProject?.status ?? 'draft',
    };
    persistProject(project);
    syncDraftLinksForProject(project);
    setSelectedProjectId(project.id);
    if (!isEditing) resetForm();
    closeProjectDialog();
  };

  const toggleProjectStatus = (projectId: string, active: boolean) => {
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    persistProject({ ...project, status: active ? 'active' : 'draft' });
  };

  const deleteDraftTabFromProject = (project: RDProject, tabId: string) => {
    const confirmed = window.confirm(
      'Delete this file from the R&D project? The Draft Builder record itself will stay available.'
    );
    if (!confirmed) return;

    const nextProject: RDProject = {
      ...project,
      draftTabIds: project.draftTabIds.filter((id) => id !== tabId),
      deletedDraftTabIds: Array.from(
        new Set([...(project.deletedDraftTabIds ?? []), tabId])
      ),
    };
    persistProject(nextProject);

    const linkedDraft = draftRecords.find((draft) => draft.id === tabId);
    if (!linkedDraft) return;

    const unlinkedDraft = unlinkDraftRecordFromProject(linkedDraft, project);
    if (unlinkedDraft === linkedDraft) return;

    setLocalDraftRecords((current) =>
      mergeDraftRecords(current, [unlinkedDraft])
    );
    queryClient.setQueryData<DraftBomRecord[]>(
      ['/api/draft-bom-drafts'],
      (current = []) => mergeDraftRecords(current, [unlinkedDraft])
    );
    saveSharedDraftRecord(unlinkedDraft)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/draft-bom-drafts'] });
      })
      .catch((error) => {
        console.error('Failed to unlink deleted Draft Builder tab:', error);
      });
  };

  const toggleDraftTab = (tabId: string, checked?: boolean) => {
    setForm((current) => {
      const isSelected = current.draftTabIds.includes(tabId);
      const nextChecked = checked ?? !isSelected;
      let draftTabIds = current.draftTabIds;

      if (nextChecked && !isSelected) {
        draftTabIds = [...current.draftTabIds, tabId];
      } else if (!nextChecked) {
        draftTabIds = current.draftTabIds.filter((id) => id !== tabId);
      }

      return {
        ...current,
        draftTabIds,
      };
    });
  };

  const openProjectFolder = (projectId: string, tab = activeProjectTab) => {
    setSelectedProjectId(projectId);
    setActiveProjectTab(tab);
    setLocation(`/design/rd-projects?projectId=${encodeURIComponent(projectId)}&tab=${encodeURIComponent(tab)}`);
  };

  const changeProjectTab = (tab: string) => {
    setActiveProjectTab(tab);
    if (selectedProject?.id) {
      setLocation(`/design/rd-projects?projectId=${encodeURIComponent(selectedProject.id)}&tab=${encodeURIComponent(tab)}`);
    }
  };

  const designControlUrl = (project: RDProject, recordId?: string) => {
    const params = new URLSearchParams({
      rdProjectId: project.id,
      rdProjectName: project.projectName,
    });
    if (recordId) params.set('recordId', recordId);
    return `/qms/design-control?${params.toString()}`;
  };

  const createDesignControlRecordForProject = async () => {
    if (!selectedProject) return;
    setIsCreatingDesignControlRecord(true);
    try {
      const response = await fetch('/api/qms/design-control', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${selectedProject.projectName} Design Control`,
          rdProjectId: selectedProject.id,
          metadata: {
            rdProjectName: selectedProject.projectName,
            source: '/design/rd-projects',
            downstreamIntent: 'released-design-to-manufactured-inventory-item',
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create design control record');
      }

      const payload = await response.json();
      await queryClient.invalidateQueries({
        queryKey: ['/api/qms/design-control', 'rd-project', selectedProject.id],
      });
      setLocation(designControlUrl(selectedProject, payload.record?.id));
    } catch (error) {
      console.error('Failed to create R&D design control record:', error);
    } finally {
      setIsCreatingDesignControlRecord(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Design and R&amp;D Projects
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Create research projects, attach draft BOM tabs, and track
              assembly readiness as parts are ordered or manufactured.
            </p>
          </div>
          <Button
            className="gap-2 self-start"
            onClick={openCreateProjectDialog}
          >
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
                <p className="text-lg font-semibold">
                  No R &amp; D projects yet
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Start one as a draft, attach Draft Builder tabs, then activate
                  it when work begins.
                </p>
              </div>
              <Button
                variant="outline"
                className="gap-2"
                onClick={openCreateProjectDialog}
              >
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
                const attachedTabCount = getDraftTabsForProject(
                  project,
                  draftRecords,
                  draftTabs
                ).length;
                const isSelected = selectedProject?.id === project.id;

                return (
                  <Card
                    key={project.id}
                    className={`cursor-pointer transition hover:shadow-lg ${
                      isSelected
                        ? 'border-primary shadow-sm ring-1 ring-primary/20'
                        : ''
                    }`}
                    onClick={() => openProjectFolder(project.id)}
                    data-testid={`card-rd-project-${project.id}`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="rounded-md bg-amber-50 p-2">
                            <FolderOpen className="h-6 w-6 text-amber-500" />
                          </div>
                          <div className="min-w-0">
                            <CardTitle className="truncate text-lg">
                              {project.projectName}
                            </CardTitle>
                            <CardDescription className="mt-1 truncate">
                              Owner: {project.owner || 'Unassigned'}
                            </CardDescription>
                          </div>
                        </div>
                        <Badge
                          variant={
                            project.status === 'active'
                              ? 'default'
                              : 'secondary'
                          }
                        >
                          {project.status === 'active' ? 'Active' : 'Draft'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-md border bg-white px-3 py-2">
                          <p className="text-xs text-muted-foreground">
                            Draft tabs
                          </p>
                          <p className="font-semibold">{attachedTabCount}</p>
                        </div>
                        <div className="rounded-md border bg-white px-3 py-2">
                          <p className="text-xs text-muted-foreground">Parts</p>
                          <p className="font-semibold">{projectParts.length}</p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            Readiness
                          </span>
                          <span className="font-medium">{readiness}%</span>
                        </div>
                        <Progress value={readiness} className="h-2" />
                      </div>

                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>
                          {project.signoffRequired
                            ? 'Signoff required'
                            : 'No signoff required'}
                        </span>
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
                      <CardTitle className="text-2xl">
                        {selectedProject.projectName}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        Owner: {selectedProject.owner || 'Unassigned'}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => openEditProjectDialog(selectedProject)}
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>
                      <div className="flex items-center gap-3 rounded-md border bg-white px-3 py-2">
                        <Label
                          htmlFor="project-active-switch"
                          className="text-sm font-medium"
                        >
                          Draft
                        </Label>
                        <Switch
                          id="project-active-switch"
                          checked={selectedProject.status === 'active'}
                          onCheckedChange={(checked) =>
                            toggleProjectStatus(selectedProject.id, checked)
                          }
                        />
                        <Label
                          htmlFor="project-active-switch"
                          className="text-sm font-medium"
                        >
                          Active
                        </Label>
                      </div>
                    </div>
                  </div>
                  {selectedProject.signoffRequired && (
                    <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <UserCheck className="h-4 w-4" />
                      Activation signoff assigned to{' '}
                      {employees.find(
                        (employee) =>
                          String(employee.id) === selectedProject.signoffUserId
                      )?.name ?? 'selected approver'}
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  <Tabs value={activeProjectTab} onValueChange={changeProjectTab} className="space-y-4">
                    <TabsList className="grid w-full grid-cols-2 md:grid-cols-7">
                      <TabsTrigger value="overview">Overview</TabsTrigger>
                      <TabsTrigger value="files">Files</TabsTrigger>
                      <TabsTrigger value="bom">BOM</TabsTrigger>
                      <TabsTrigger value="material">Material</TabsTrigger>
                      <TabsTrigger value="labor">Labor</TabsTrigger>
                      <TabsTrigger value="design-control">
                        Design Control
                      </TabsTrigger>
                      <TabsTrigger value="assembly-tree">
                        Assembly Tree
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base">
                              Readiness
                            </CardTitle>
                            <CardDescription>
                              Based on required BOM quantity vs. on-hand and
                              manufactured parts.
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <Progress value={partReadiness(selectedParts)} />
                            <p className="text-sm font-medium">
                              {partReadiness(selectedParts)}% ready
                            </p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base">
                              Start Gate
                            </CardTitle>
                            <CardDescription>
                              Draft projects can be switched active when work
                              starts.
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="flex items-center gap-2 text-sm">
                            {selectedProject.signoffRequired ? (
                              <AlertTriangle className="h-4 w-4 text-amber-600" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            )}
                            {selectedProject.signoffRequired
                              ? 'Signoff required before activation.'
                              : 'No activation signoff required.'}
                          </CardContent>
                        </Card>
                      </div>
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">
                            Project Notes
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                          {selectedProject.description || 'No notes entered.'}
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">
                            Draft BOM Summary
                          </CardTitle>
                          <CardDescription>
                            Draft Builder records linked to this R&amp;D
                            project.
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          {selectedDraftTabs.length === 0 ? (
                            <div className="flex flex-col items-start gap-3 text-sm text-muted-foreground">
                              No Draft Builder tabs are linked to this project.
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setLocation('/estimating/bom-drafts')
                                }
                              >
                                Open Draft Builder
                              </Button>
                            </div>
                          ) : (
                            <div className="grid gap-3 md:grid-cols-2">
                              {selectedDraftTabs.map((tab) => (
                                <div
                                  key={tab.id}
                                  className="rounded-md border bg-white px-3 py-2"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium text-slate-950">
                                        {tab.name}
                                      </p>
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        Updated {tab.updatedAt}
                                      </p>
                                    </div>
                                    <Badge variant="outline">
                                      {tab.partCount} parts
                                    </Badge>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      aria-label={`Delete ${tab.name} from project`}
                                      onClick={() =>
                                        deleteDraftTabFromProject(
                                          selectedProject,
                                          tab.id
                                        )
                                      }
                                    >
                                      <Trash2 className="h-4 w-4 text-red-600" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="files">
                      <div className="grid gap-3 md:grid-cols-2">
                        {selectedDraftTabs.length === 0 ? (
                          <Card className="md:col-span-2">
                            <CardContent className="flex flex-col items-center gap-3 py-8 text-center text-sm text-muted-foreground">
                              No Draft Builder tabs are attached to this
                              project.
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setLocation('/estimating/bom-drafts')
                                }
                              >
                                Open Draft Builder
                              </Button>
                            </CardContent>
                          </Card>
                        ) : (
                          selectedDraftTabs.map((tab) => (
                            <Card key={tab.id}>
                              <CardHeader>
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <CardTitle className="flex items-center gap-2 text-base">
                                      <Boxes className="h-4 w-4 text-cyan-700" />
                                      {tab.name}
                                    </CardTitle>
                                    <CardDescription>
                                      {tab.partCount} parts, updated{' '}
                                      {tab.updatedAt}
                                    </CardDescription>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Delete ${tab.name} from project`}
                                    onClick={() =>
                                      deleteDraftTabFromProject(
                                        selectedProject,
                                        tab.id
                                      )
                                    }
                                  >
                                    <Trash2 className="h-4 w-4 text-red-600" />
                                  </Button>
                                </div>
                              </CardHeader>
                            </Card>
                          ))
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="bom" className="space-y-3">
                      {selectedBomRecords.length === 0 ? (
                        <Card>
                          <CardContent className="py-8 text-center text-sm text-muted-foreground">
                            Push a Draft Builder BOM wizard tab or attach a draft with saved BOMs to populate this folder tab.
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="grid gap-3 md:grid-cols-2">
                          {selectedBomRecords.map((bom: DraftPartBom & { sourceDraftName?: string }) => {
                            const rootPart = bom.parts?.[0] ?? bom.rootPart;
                            const components = rootPart?.bomItems ?? bom.rootPart?.bomItems ?? [];
                            return (
                              <Card key={bom.id}>
                                <CardHeader>
                                  <CardTitle className="flex items-center gap-2 text-base">
                                    <Boxes className="h-4 w-4 text-cyan-700" />
                                    {bom.name}
                                  </CardTitle>
                                  <CardDescription>
                                    {bom.sourceDraftName || 'Draft Builder'} {bom.revision ? `- ${bom.revision}` : ''}
                                  </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3 text-sm">
                                  <div className="rounded-md border bg-white p-3">
                                    <p className="font-mono text-xs text-muted-foreground">{rootPart?.partNumber || 'No root part'}</p>
                                    <p className="font-medium">{rootPart?.description || 'No description'}</p>
                                  </div>
                                  <Badge variant="outline">{components.length} component{components.length === 1 ? '' : 's'}</Badge>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="assembly-tree" className="space-y-2">
                      {selectedAssemblyTree.length === 0 ? (
                        <Card>
                          <CardContent className="py-8 text-center text-sm text-muted-foreground">
                            Attach a draft BOM tab to build an assembly tree.
                          </CardContent>
                        </Card>
                      ) : (
                        selectedAssemblyTree.map((node) => (
                          <AssemblyTreeNode key={node.id} node={node} />
                        ))
                      )}
                    </TabsContent>

                    <TabsContent value="material">
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
                            <div
                              key={`${part.partNumber}-${part.description}`}
                              className="grid min-w-[760px] grid-cols-[1.2fr_2fr_repeat(4,0.7fr)_1fr] gap-3 border-b px-4 py-3 text-sm last:border-b-0"
                            >
                              <span className="font-mono text-xs">
                                {part.partNumber}
                              </span>
                              <span>{part.description}</span>
                              <span>{part.required}</span>
                              <span>{part.onHand}</span>
                              <span>{part.ordered}</span>
                              <span>{part.manufactured}</span>
                              <Badge
                                variant="outline"
                                className={statusClasses[part.status]}
                              >
                                {statusLabels[part.status]}
                              </Badge>
                            </div>
                          ))
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="labor" className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-md border bg-white p-3">
                          <p className="text-xs text-muted-foreground">Estimate Lines</p>
                          <p className="text-lg font-semibold">{selectedLaborLines.length}</p>
                        </div>
                        <div className="rounded-md border bg-white p-3">
                          <p className="text-xs text-muted-foreground">Estimated Hours</p>
                          <p className="text-lg font-semibold">{selectedLaborHours.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                        </div>
                        <div className="rounded-md border bg-white p-3">
                          <p className="text-xs text-muted-foreground">Estimated Labor</p>
                          <p className="text-lg font-semibold">{selectedLaborTotal.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</p>
                        </div>
                      </div>
                      {selectedLaborLines.length === 0 ? (
                        <Card>
                          <CardContent className="py-8 text-center text-sm text-muted-foreground">
                            Push a Draft Direct Labor Estimate from Draft Builder to populate this folder tab.
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="space-y-2">
                          {selectedLaborLines.map((line: DraftLaborEstimateLine & { sourceDraftName?: string }) => (
                            <div key={line.id ?? `${line.employeeRole}-${line.sourceDraftName}`} className="grid gap-3 rounded-md border bg-white p-3 md:grid-cols-5">
                              <div className="md:col-span-2">
                                <p className="font-medium">{line.employeeRole || 'Unassigned role'}</p>
                                <p className="text-xs text-muted-foreground">{line.sourceDraftName || 'Draft Builder'}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Hours / Part</p>
                                <p className="font-medium">{asNumber(line.hoursPerPart).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Qty / PO</p>
                                <p className="font-medium">{Math.max(1, asNumber(line.quantityPerPo)).toLocaleString()}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Ext Labor</p>
                                <p className="font-medium">{laborLineTotal(line).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="design-control" className="space-y-4">
                      <Card>
                        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <CardTitle className="flex items-center gap-2 text-base">
                              <ShieldCheck className="h-4 w-4 text-primary" />
                              Design Control
                            </CardTitle>
                            <CardDescription>
                              Design-control records linked to this R&amp;D project only.
                            </CardDescription>
                          </div>
                          <Button
                            className="gap-2 self-start"
                            onClick={createDesignControlRecordForProject}
                            disabled={isCreatingDesignControlRecord}
                          >
                            <Plus className="h-4 w-4" />
                            {isCreatingDesignControlRecord ? 'Creating...' : 'Create Design Control'}
                          </Button>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="rounded-md border bg-white px-3 py-2 text-sm text-muted-foreground">
                            When this design is released, its R&amp;D data can become the source package for a manufactured inventory item. That released item can later be selected from P2 when a PO is received.
                          </div>
                          {isLoadingDesignControlRecords ? (
                            <div className="rounded-md border bg-white px-3 py-4 text-sm text-muted-foreground">
                              Loading design-control records...
                            </div>
                          ) : selectedDesignControlRecords.length === 0 ? (
                            <div className="flex flex-col items-start gap-3 rounded-md border bg-white px-3 py-4 text-sm text-muted-foreground">
                              No design-control record is linked to this R&amp;D project yet.
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                onClick={createDesignControlRecordForProject}
                                disabled={isCreatingDesignControlRecord}
                              >
                                <FilePlus2 className="h-4 w-4" />
                                Create Linked Record
                              </Button>
                            </div>
                          ) : (
                            <div className="grid gap-3 md:grid-cols-2">
                              {selectedDesignControlRecords.map((record) => (
                                <div key={record.id} className="rounded-md border bg-white px-3 py-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium text-slate-950">
                                        {record.title}
                                      </p>
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        {record.releasedAt
                                          ? 'Released design control'
                                          : `Status: ${record.status}`}
                                      </p>
                                    </div>
                                    <Badge variant="outline">
                                      {record.status}
                                    </Badge>
                                  </div>
                                  <div className="mt-3 flex justify-end">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="gap-2"
                                      onClick={() => setLocation(designControlUrl(selectedProject, record.id))}
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                      Open
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            if (open) {
              setIsDialogOpen(true);
              return;
            }
            closeProjectDialog();
          }}
        >
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle>
                {editingProject ? 'Edit R & D Project' : 'Create R & D Project'}
              </DialogTitle>
            </DialogHeader>
            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto py-2 pr-2">
              <div className="grid gap-2">
                <Label htmlFor="rd-project-name">Project name</Label>
                <Input
                  id="rd-project-name"
                  value={form.projectName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      projectName: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rd-project-owner">Owner</Label>
                <Select
                  value={form.owner}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, owner: value }))
                  }
                >
                  <SelectTrigger id="rd-project-owner">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeEmployees.length === 0 ? (
                      <SelectItem value="__no_employees__" disabled>
                        No employees available
                      </SelectItem>
                    ) : (
                      activeEmployees.map((employee) => (
                        <SelectItem
                          key={employee.id}
                          value={String(employee.id)}
                        >
                          {employee.name}
                          {employee.employeeCode
                            ? ` (${employee.employeeCode})`
                            : ''}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rd-project-description">Notes</Label>
                <Textarea
                  id="rd-project-description"
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <Label htmlFor="rd-signoff-required">
                    Require signoff to activate
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Select an approver when draft-to-active needs approval.
                  </p>
                </div>
                <Switch
                  id="rd-signoff-required"
                  checked={form.signoffRequired}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({
                      ...current,
                      signoffRequired: checked,
                    }))
                  }
                />
              </div>
              {form.signoffRequired && (
                <div className="grid gap-2">
                  <Label>Activation approver</Label>
                  <Select
                    value={form.signoffUserId}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        signoffUserId: value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeEmployees.map((employee) => (
                        <SelectItem
                          key={employee.id}
                          value={String(employee.id)}
                        >
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLocation('/estimating/bom-drafts')}
                  >
                    Open Draft Builder
                  </Button>
                </div>
                <div className="grid gap-2 rounded-md border p-3">
                  {draftTabs.map((tab) => {
                    const isChecked = form.draftTabIds.includes(tab.id);
                    return (
                      <div
                        key={tab.id}
                        role="button"
                        tabIndex={0}
                        className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-gray-50"
                        onClick={() => toggleDraftTab(tab.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            toggleDraftTab(tab.id);
                          }
                        }}
                      >
                        <Checkbox
                          checked={isChecked}
                          onClick={(event) => event.stopPropagation()}
                          onCheckedChange={(checked) =>
                            toggleDraftTab(tab.id, checked === true)
                          }
                        />
                        <span className="flex-1 text-sm font-medium">
                          {tab.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {tab.partCount} parts
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <DialogFooter className="flex-shrink-0">
              <Button variant="outline" onClick={closeProjectDialog}>
                Cancel
              </Button>
              <Button
                onClick={saveProject}
                disabled={
                  !form.projectName.trim() ||
                  (!editingProject && !form.owner.trim()) ||
                  (form.signoffRequired && !form.signoffUserId)
                }
              >
                <PackageCheck className="mr-2 h-4 w-4" />
                {editingProject ? 'Save Changes' : 'Create Draft'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
