import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import {
  ArrowUpDown,
  Calculator,
  Check,
  Clock,
  Eye,
  FileSpreadsheet,
  FilePlus,
  Filter,
  FolderOpen,
  Layers,
  Lock,
  PackagePlus,
  Plus,
  Save,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { privateerDraftBomLines, type PrivateerDraftBomLine } from '@/data/privateerDraftBom';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { nrcRowTotal, type ChargeTiming, type NrcCategory, type NrcCostRow } from '@/lib/estimatingCostModel';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

type BomStatus = 'Needs Review' | 'Needs Quote' | 'RFQ Sent' | 'On Order' | 'On Hand' | 'ETA / Inbound' | 'Hold';

type BomLine = PrivateerDraftBomLine & {
  customFields?: Record<string, string>;
  inventoryItemId?: number | null;
  inventoryItemName?: string | null;
  isDraftPart?: boolean;
  isManufactured?: boolean;
  firstDepartment?: string;
  childDraftBoms?: DraftPartBom[];
  actualCost?: number | '';
  service?: boolean;
};
type DraftBomSource = 'draft-part' | 'inventory-item' | 'new-part';
type DraftBomComponent = {
  id: string;
  source: DraftBomSource;
  sourceLineId?: string | null;
  inventoryItemId?: number | null;
  partNumber: string;
  description: string;
  quantity: number;
  isManufactured: boolean;
  firstDepartment: string;
};
type DraftBomPart = {
  id: string;
  source: DraftBomSource;
  sourceLineId?: string | null;
  inventoryItemId?: number | null;
  partNumber: string;
  description: string;
  quantity: number;
  bomItems: DraftBomComponent[];
  hasBOM: boolean;
};
type DraftPartBom = {
  id: string;
  name: string;
  revision: string;
  createdAt: string;
  updatedAt: string;
  rootPart: DraftBomPart;
  parts: DraftBomPart[];
};
type BuiltInWorkspaceTabId = 'po-draft' | 'parts-request' | 'direct-labor' | 'nrc' | 'bom-wizard' | 'assembly-tree';
type CustomWorkspaceTabId = `custom:${string}`;
type WorkspaceTabId = BuiltInWorkspaceTabId | CustomWorkspaceTabId;
type DraftLaborEstimateLine = {
  id: string;
  department: string;
  employeeRole: string;
  hourlyRate: number | '';
  hoursPerPart: number | '';
  quantityPerPo: number | '';
};
type PoColumnId =
  | 'filter'
  | 'supplier'
  | 'supplierItemId'
  | 'agPartNumber'
  | 'qtyNeeded'
  | 'unitCost'
  | 'extCost'
  | 'action'
  | 'source';
type PartsRequestColumnId =
  | 'supplier'
  | 'supplierItemId'
  | 'manufacturer'
  | 'unitCost'
  | 'actualCost'
  | 'qtyNeeded'
  | 'service'
  | 'agPartNumber'
  | 'status';
type PartsRequestTableColumnId = 'include' | 'description' | PartsRequestColumnId | `custom:${string}`;
type PartsRequestSortState = {
  columnId: PartsRequestTableColumnId;
  direction: 'asc' | 'desc';
} | null;
type DirectLaborColumnId = 'employeeRole' | 'hourlyRate' | 'hoursPerPart' | 'quantityPerPo' | 'extLabor' | 'remove';
type SourcingColumnId = 'supplier' | 'supplierItemId' | 'agPartNumber' | 'description' | 'qtyNeeded' | 'unitCost' | 'extCost' | 'action' | 'status';

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
  savedDraftBoms?: DraftPartBom[];
  laborEstimateLines?: DraftLaborEstimateLine[];
  nrcRows?: NrcCostRow[];
  customLaborDepartments?: string[];
  poVisibleColumns?: PoColumnId[];
  partsRequestVisibleColumns?: PartsRequestColumnId[];
  directLaborVisibleColumns?: DirectLaborColumnId[];
  assemblyVisibleColumns?: SourcingColumnId[];
  customColumns?: string[];
  customPoColumns?: string[];
  workspaceTabs?: WorkspaceTabId[];
  visibility?: 'public' | 'private';
  allowPublicEdit?: boolean;
  canEdit?: boolean;
  canManageAccess?: boolean;
  createdAt?: string;
  createdByUserId?: number | null;
  createdByDisplayName?: string | null;
  updatedByDisplayName?: string | null;
};

type ProjectOption = {
  id: string;
  projectCode: string;
  projectName: string;
  status?: string;
};

type RDProjectOption = {
  id: string;
  projectName: string;
  status?: string;
};

type ProjectSelectOption = {
  value: string;
  id: string;
  label: string;
  project: string;
  projectCode: string | null;
  projectName: string;
  projectType: 'P2_PROJECT' | 'R_AND_D';
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
  onHand?: number | string | null;
  available?: number | string | null;
  quantityInStock?: number | string | null;
  minimumStock?: number | string | null;
  reorderPoint?: number | string | null;
  itemType?: string | null;
  type?: string | null;
  isPacket?: boolean | null;
  manufacturedCategory?: string | null;
};
type DraftFinalizedInventoryItem = InventoryItemOption & {
  id: number;
  agPartNumber: string;
  name: string;
};

type InventoryDepartmentOption = {
  id: number;
  name: string;
};

type DepartmentOption = {
  value: string;
  label: string;
};

type AssemblyStockState = 'on-hand' | 'low-stock' | 'blocked';
type AssemblyManufactureState = 'ready' | 'waiting' | 'needs-plan';
type AssemblyTreeNode = {
  id: string;
  partNumber: string;
  description: string;
  bomLabel?: string;
  isManufactured: boolean;
  quantityRequired: number;
  orderStatus: BomStatus;
  displayStatus: BomStatus;
  manufactureState: AssemblyManufactureState;
  inventoryItem: InventoryItemOption | null;
  stockState: AssemblyStockState;
  availableQuantity: number;
  reorderPoint: number;
  children: AssemblyTreeNode[];
};
type AssemblyLineEntry = {
  line: BomLine;
  bom: DraftPartBom;
  part: DraftBomPart;
  childComponents: DraftBomComponent[];
};
type DraftProjectGroup = {
  key: string;
  label: string;
  projectType: string;
  drafts: BomDraft[];
};

type CsvImportResult = {
  lines: BomLine[];
  linkedCount: number;
  customColumns: string[];
};

const STORAGE_KEY = 'epoch:draft-boms';
const RD_PROJECTS_STORAGE_KEY = 'epoch.rdProjects.v1';
const VENDOR_PO_HANDOFF_KEY = 'epoch:draft-bom-vendor-po-handoff';
const DRAFT_TAB_HANDOFF_KEY = 'epoch:draft-builder-tab-handoff';
const PRIVATEER_DRAFT_ID = 'privateer';
const NEW_DRAFT_VALUE = '__new_draft__';
const LEGACY_R_AND_D_PROJECT_VALUE = '__r_and_d__';
const P2_PROJECT_VALUE_PREFIX = 'p2:';
const RD_PROJECT_VALUE_PREFIX = 'rd:';

const statuses: BomStatus[] = ['Needs Review', 'Needs Quote', 'RFQ Sent', 'On Order', 'On Hand', 'ETA / Inbound', 'Hold'];
const defaultWorkspaceTabs: BuiltInWorkspaceTabId[] = ['po-draft', 'parts-request', 'direct-labor', 'nrc', 'bom-wizard', 'assembly-tree'];
const workspaceTabLabels: Record<BuiltInWorkspaceTabId, string> = {
  'po-draft': 'PO draft',
  'parts-request': 'Parts/request',
  'direct-labor': 'Draft Direct Labor Estimate',
  nrc: 'NRC',
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
  source: 'Source',
};
const defaultPoColumns: PoColumnId[] = ['agPartNumber', 'qtyNeeded', 'unitCost', 'extCost', 'source'];
const validPoColumnIds = new Set<PoColumnId>(Object.keys(poColumnLabels) as PoColumnId[]);
const partsRequestColumnLabels: Record<PartsRequestColumnId, string> = {
  supplier: 'Vendor / Supplier',
  supplierItemId: 'Supplier Part #',
  manufacturer: 'Manufacturer',
  unitCost: 'Estimated Cost',
  actualCost: 'Actual Cost',
  qtyNeeded: 'Quantity',
  service: 'Service',
  agPartNumber: 'AG Part #',
  status: 'Status',
};
const defaultPartsRequestColumns: PartsRequestColumnId[] = [
  'supplier',
  'supplierItemId',
  'manufacturer',
  'unitCost',
  'actualCost',
  'qtyNeeded',
  'service',
  'agPartNumber',
  'status',
];
const directLaborColumnLabels: Record<DirectLaborColumnId, string> = {
  employeeRole: 'Employee role',
  hourlyRate: 'Hourly rate',
  hoursPerPart: 'Hours / part',
  quantityPerPo: 'Qty / PO',
  extLabor: 'Ext labor',
  remove: 'Remove',
};
const defaultDirectLaborColumns: DirectLaborColumnId[] = ['employeeRole', 'hourlyRate', 'hoursPerPart', 'quantityPerPo', 'extLabor', 'remove'];
const sourcingColumnLabels: Record<SourcingColumnId, string> = {
  supplier: 'Supplier',
  supplierItemId: 'Supplier Item',
  agPartNumber: 'AG Part #',
  description: 'Description',
  qtyNeeded: 'Qty',
  unitCost: 'Unit Cost',
  extCost: 'Ext Cost',
  action: 'Action',
  status: 'Status',
};
const defaultSourcingColumns: SourcingColumnId[] = ['supplier', 'supplierItemId', 'agPartNumber', 'description', 'qtyNeeded', 'unitCost', 'extCost', 'action', 'status'];
const defaultDepartment = 'layup';
const departmentOptions = [
  { value: 'cutting_table', label: 'Cutting Table' },
  { value: 'core_department', label: 'Core Department' },
  { value: 'layup', label: 'Layup' },
  { value: 'assembly', label: 'Assembly' },
  { value: 'disassembly', label: 'Disassembly' },
  { value: 'cnc', label: 'CNC' },
  { value: 'finish', label: 'Finish' },
  { value: 'paint', label: 'Paint' },
  { value: 'final_qc', label: 'Final QC' },
];
const fallbackBomDepartmentOptions: DepartmentOption[] = [
  { value: 'Production Queue', label: 'Production Queue' },
  { value: 'Layup', label: 'Layup' },
  { value: 'Barcode', label: 'Barcode' },
  { value: 'CNC', label: 'CNC' },
  { value: 'Gunsmith', label: 'Gunsmith' },
  { value: 'Paint', label: 'Paint' },
  { value: 'Finish', label: 'Finish' },
  { value: 'Finish QC', label: 'Finish QC' },
  { value: 'Shipping QC', label: 'Shipping QC' },
  { value: 'Shipping', label: 'Shipping' },
  { value: 'Cutting Table', label: 'Cutting Table' },
  { value: 'Office', label: 'Office' },
  { value: 'Assembly', label: 'Assembly' },
];
const legacyDepartmentLabels: Record<string, string> = {
  cutting_table: 'Cutting Table',
  core_department: 'Core Department',
  layup: 'Layup',
  assembly: 'Assembly',
  disassembly: 'Disassembly',
  cnc: 'CNC',
  finish: 'Finish',
  paint: 'Paint',
  final_qc: 'Final QC',
};

function bomDepartmentLabel(value: string | undefined, options: DepartmentOption[]) {
  if (!value) return '';
  return options.find((department) => department.value === value)?.label ?? legacyDepartmentLabels[value] ?? value;
}

function bomDepartmentOptionsWithCurrent(options: DepartmentOption[], value: string | undefined) {
  if (!value || options.some((department) => department.value === value)) return options;
  return [...options, { value, label: bomDepartmentLabel(value, options) }];
}

function defaultBomDepartment(options: DepartmentOption[]) {
  return options.find((department) => department.value === 'Layup')?.value ?? options[0]?.value ?? 'Layup';
}
const employeeRoleOptions = [
  'Operator',
  'Technician',
  'Assembler',
  'CNC Operator',
  'Quality Inspector',
  'Engineer',
  'Supervisor',
];

function newLaborEstimateLine(): DraftLaborEstimateLine {
  return {
    id: crypto.randomUUID(),
    department: defaultDepartment,
    employeeRole: '',
    hourlyRate: '',
    hoursPerPart: '',
    quantityPerPo: 1,
  };
}

function newNrcRow(): NrcCostRow {
  return {
    id: crypto.randomUUID(),
    category: 'TOOLING',
    description: '',
    quantity: 1,
    unitCost: 0,
    totalCost: 0,
    amortized: false,
    amortizationQty: null,
    chargeTiming: 'ONE_TIME',
    includeInCustomerPrice: true,
    internalOnly: false,
    notes: '',
    assetName: '',
    usefulLifeMonths: null,
    amortizationBasis: '',
    installationCost: 0,
    trainingCost: 0,
    sourceType: 'MANUAL',
    sourceLabel: 'Draft Builder',
  };
}

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
    isManufactured: false,
    firstDepartment: defaultDepartment,
    childDraftBoms: [],
    actualCost: '',
    service: false,
  };
}

function isInventoryManufactured(item?: InventoryItemOption | null) {
  if (!item) return false;
  return item.itemType === 'MANUFACTURED' || item.type === 'Manufactured' || item.isPacket === true || !!item.manufacturedCategory;
}

function inventoryPartNumber(item: InventoryItemOption) {
  return item.agPartNumber || item.manufacturerPartNumber || item.supplierPartNumber || `INV-${item.id}`;
}

function inventoryDescription(item: InventoryItemOption) {
  return item.name || item.description || inventoryPartNumber(item);
}

function linePartNumber(line: BomLine) {
  return line.agPartNumber || line.supplierItemId || `DRAFT-${line.id.slice(0, 8).toUpperCase()}`;
}

function lineDescription(line: BomLine) {
  return line.description || line.inventoryItemName || linePartNumber(line);
}

function draftLineToPart(line: BomLine): DraftBomPart {
  return {
    id: `draft-line-${line.id}`,
    source: line.inventoryItemId ? 'inventory-item' : 'draft-part',
    sourceLineId: line.id,
    inventoryItemId: line.inventoryItemId ?? null,
    partNumber: linePartNumber(line),
    description: lineDescription(line),
    quantity: asNumber(line.qtyNeeded) || 1,
    bomItems: [],
    hasBOM: false,
  };
}

function draftLineNeedsInventoryItem(line: BomLine) {
  return line.isDraftPart !== false && !line.inventoryItemId;
}

async function createInventoryItemFromDraftLine(
  line: BomLine,
  draft: BomDraft,
): Promise<DraftFinalizedInventoryItem> {
  return await apiRequest('/api/inventory/items/from-draft-builder', {
    method: 'POST',
    body: {
      name: lineDescription(line),
      description: lineDescription(line),
      supplier: line.supplier || null,
      supplierPartNumber: line.supplierItemId || null,
      manufacturer: line.manufacturer || null,
      costPer: asNumber(line.actualCost) || asNumber(line.unitCost) || null,
      usageUnit: line.unit || 'EA',
      department: line.firstDepartment || line.department || defaultDepartment,
      isManufactured: line.isManufactured === true,
      manufacturedCategory: line.isManufactured === true ? 'COMPONENT' : null,
      project: draft.projectName || draft.project || null,
      draftName: `${draft.name} ${draft.revision}`.trim(),
      draftLineId: line.id,
    },
  }) as DraftFinalizedInventoryItem;
}

function inventoryItemToPart(item: InventoryItemOption): DraftBomPart {
  return {
    id: `inventory-${item.id}`,
    source: 'inventory-item',
    sourceLineId: null,
    inventoryItemId: item.id,
    partNumber: inventoryPartNumber(item),
    description: inventoryDescription(item),
    quantity: 1,
    bomItems: [],
    hasBOM: false,
  };
}

function newWizardPart(partNumber: string, description: string): DraftBomPart {
  const cleanPartNumber = partNumber.trim() || `DRAFT-${Date.now()}`;
  return {
    id: `new-${crypto.randomUUID()}`,
    source: 'new-part',
    sourceLineId: null,
    inventoryItemId: null,
    partNumber: cleanPartNumber,
    description: description.trim() || cleanPartNumber,
    quantity: 1,
    bomItems: [],
    hasBOM: false,
  };
}

function createDraftPartBom(rootPart: DraftBomPart, existingCount = 0): DraftPartBom {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: `${rootPart.partNumber} Draft BOM`,
    revision: `Draft ${String.fromCharCode(65 + Math.min(existingCount, 25))}`,
    createdAt: now,
    updatedAt: now,
    rootPart,
    parts: [{ ...rootPart, bomItems: rootPart.bomItems ?? [], hasBOM: false }],
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
    lines: privateerDraftBomLines.map((line) => ({
      ...line,
      isDraftPart: true,
      isManufactured: false,
      firstDepartment: defaultDepartment,
      childDraftBoms: [],
    })),
    savedDraftBoms: [],
    laborEstimateLines: [newLaborEstimateLine()],
    nrcRows: [],
    customLaborDepartments: [],
    poVisibleColumns: defaultPoColumns,
    partsRequestVisibleColumns: defaultPartsRequestColumns,
    directLaborVisibleColumns: defaultDirectLaborColumns,
    assemblyVisibleColumns: defaultSourcingColumns,
    customColumns: [],
    customPoColumns: [],
    workspaceTabs: defaultWorkspaceTabs,
    visibility: 'public',
    allowPublicEdit: false,
  };
}

function projectLabel(project: ProjectOption) {
  return [project.projectCode, project.projectName].filter(Boolean).join(' - ');
}

function readRDProjectOptions(): RDProjectOption[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RD_PROJECTS_STORAGE_KEY);
    if (!raw) return [];
    const projects = JSON.parse(raw) as RDProjectOption[];
    return projects.filter((project) => project.id && project.projectName);
  } catch {
    return [];
  }
}

function normalizeDraft(draft: BomDraft): BomDraft {
  const lines = (draft.lines ?? []).map((line) => ({
    ...line,
    isDraftPart: line.isDraftPart ?? !line.inventoryItemId,
    isManufactured: line.isManufactured ?? false,
    firstDepartment: line.firstDepartment ?? defaultDepartment,
    childDraftBoms: line.childDraftBoms ?? [],
  }));

  return {
    ...draft,
    projectId: draft.projectId ?? null,
    projectCode: draft.projectCode ?? null,
    projectName: draft.projectName ?? draft.project ?? null,
    projectType: draft.projectType ?? null,
    lines,
    savedDraftBoms: mergeDraftBoms([
      ...(draft.savedDraftBoms ?? []),
      ...lines.flatMap((line) => line.childDraftBoms ?? []),
    ]),
    laborEstimateLines: (draft.laborEstimateLines?.length ? draft.laborEstimateLines : [newLaborEstimateLine()]).map((line) => ({
      ...line,
      department: line.department || defaultDepartment,
      employeeRole: line.employeeRole ?? '',
      hourlyRate: line.hourlyRate ?? '',
      hoursPerPart: line.hoursPerPart ?? '',
      quantityPerPo: line.quantityPerPo ?? 1,
    })),
    nrcRows: (draft.nrcRows ?? []).map((row) => {
      const normalized = {
        ...newNrcRow(),
        ...row,
        id: row.id || crypto.randomUUID(),
        category: (row.category || 'OTHER') as NrcCategory,
        quantity: Number(row.quantity || 0),
        unitCost: Number(row.unitCost || 0),
        totalCost: Number(row.totalCost ?? Number(row.quantity || 0) * Number(row.unitCost || 0)),
        amortized: !!row.amortized,
        amortizationQty: row.amortizationQty != null ? Number(row.amortizationQty) : null,
        chargeTiming: (row.chargeTiming || 'ONE_TIME') as ChargeTiming,
        includeInCustomerPrice: row.includeInCustomerPrice !== false,
        internalOnly: !!row.internalOnly,
        usefulLifeMonths: row.usefulLifeMonths != null ? Number(row.usefulLifeMonths) : null,
        installationCost: Number(row.installationCost || 0),
        trainingCost: Number(row.trainingCost || 0),
        sourceType: row.sourceType ?? 'MANUAL',
        sourceLabel: row.sourceLabel ?? 'Draft Builder',
      };
      normalized.totalCost = nrcRowTotal(normalized);
      return normalized;
    }),
    customLaborDepartments: draft.customLaborDepartments ?? [],
    poVisibleColumns: sanitizePoColumns(draft.poVisibleColumns),
    partsRequestVisibleColumns: draft.partsRequestVisibleColumns ?? defaultPartsRequestColumns,
    directLaborVisibleColumns: draft.directLaborVisibleColumns ?? defaultDirectLaborColumns,
    assemblyVisibleColumns: draft.assemblyVisibleColumns ?? defaultSourcingColumns,
    customColumns: sanitizeCustomColumns([...(draft.customColumns ?? []), ...(draft.customPoColumns ?? [])]),
    customPoColumns: sanitizeCustomColumns(draft.customPoColumns ?? []),
    workspaceTabs: normalizeWorkspaceTabs(draft.workspaceTabs),
    visibility: draft.visibility === 'private' ? 'private' : 'public',
    allowPublicEdit: draft.allowPublicEdit === true,
    canEdit: draft.canEdit,
    canManageAccess: draft.canManageAccess,
  };
}

function mergeDraftBoms(boms: DraftPartBom[]) {
  const seen = new Set<string>();
  return boms.filter((bom) => {
    if (seen.has(bom.id)) return false;
    seen.add(bom.id);
    return true;
  });
}

function sanitizePoColumns(columns?: readonly string[] | null): PoColumnId[] {
  const sanitized = (columns ?? defaultPoColumns).filter((column): column is PoColumnId =>
    validPoColumnIds.has(column as PoColumnId),
  );
  return sanitized.length ? sanitized : defaultPoColumns;
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

function parseCsvRows(csvText: string) {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const next = csvText[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === ',' && !quoted) {
      row.push(current.trim());
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(current.trim());
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      current = '';
      continue;
    }

    current += char;
  }

  row.push(current.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

function normalizeCsvHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function isStatusDuplicateColumn(column: string) {
  return ['status', 'orderstatus'].includes(normalizeCsvHeader(column));
}

const knownImportHeaders = new Set([
  'action',
  'actual',
  'actualcost',
  'agpart',
  'agpartnumber',
  'category',
  'cost',
  'description',
  'estimatedcost',
  'filter',
  'inventoryitemid',
  'isservice',
  'item',
  'itemdescription',
  'itemnumber',
  'manufacturer',
  'mfg',
  'name',
  'note',
  'notes',
  'orderstatus',
  'part',
  'partdescription',
  'partnumber',
  'price',
  'qnty',
  'qty',
  'qtyneeded',
  'quantity',
  'service',
  'sku',
  'source',
  'status',
  'supplier',
  'supplieritem',
  'supplieritemid',
  'supplierpart',
  'supplierpartnumber',
  'targetneeddate',
  'unit',
  'unitcost',
  'uom',
  'vendor',
]);

const fallbackImportHeaderLabels = [
  'Part Number',
  'Description',
  'Quantity',
  'Supplier',
  'Supplier Part Number',
  'Manufacturer',
  'Unit Cost',
  'Unit',
];

type ImportColumn = {
  key: string;
  label: string;
  isKnown: boolean;
};

function uniqueImportColumnName(label: string, existing: Set<string>) {
  const base = label.trim() || 'Imported Column';
  let candidate = base;
  let suffix = 2;
  while (existing.has(candidate.toLowerCase())) {
    candidate = `${base} ${suffix}`;
    suffix += 1;
  }
  existing.add(candidate.toLowerCase());
  return candidate;
}

function buildImportColumns(rawHeaders: string[]): ImportColumn[] {
  const usedKeys = new Map<string, number>();
  const usedLabels = new Set<string>();

  return rawHeaders.map((rawHeader, index) => {
    const normalized = normalizeCsvHeader(rawHeader) || `column${index + 1}`;
    const seenCount = usedKeys.get(normalized) ?? 0;
    usedKeys.set(normalized, seenCount + 1);
    const key = seenCount === 0 ? normalized : `${normalized}${seenCount + 1}`;
    const label = uniqueImportColumnName(rawHeader.trim() || `Imported Column ${index + 1}`, usedLabels);
    return { key, label, isKnown: seenCount === 0 && knownImportHeaders.has(normalized) };
  });
}

function csvField(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value) return value;
  }
  return '';
}

function parseCsvNumber(value: string): number | '' {
  const normalized = value.replace(/[$,]/g, '').trim();
  if (!normalized) return '';
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : '';
}

function parseImportStatus(value: string, fallback: BomStatus): BomStatus {
  const match = statuses.find((status) => status.toLowerCase() === value.trim().toLowerCase());
  return match ?? fallback;
}

function findInventoryMatch(partNumber: string, inventoryItems: InventoryItemOption[]) {
  const normalizedPartNumber = partNumber.trim().toLowerCase();
  if (!normalizedPartNumber) return null;

  return (
    inventoryItems.find((item) =>
      [item.agPartNumber, item.supplierPartNumber, item.manufacturerPartNumber]
        .filter(Boolean)
        .some((value) => value?.trim().toLowerCase() === normalizedPartNumber),
    ) ?? null
  );
}
function inventoryStockQuantity(item?: InventoryItemOption | null) {
  if (!item) return 0;
  const quantity = Number(item.available ?? item.onHand ?? item.quantityInStock ?? 0);
  return Number.isFinite(quantity) ? quantity : 0;
}

function inventoryReorderPoint(item?: InventoryItemOption | null) {
  if (!item) return 0;
  const point = Number(item.reorderPoint ?? item.minimumStock ?? 0);
  return Number.isFinite(point) ? point : 0;
}

function resolveInventoryForPart(
  inventoryItems: InventoryItemOption[],
  inventoryItemId: number | null | undefined,
  partNumber: string,
) {
  if (inventoryItemId) {
    const byId = inventoryItems.find((item) => item.id === inventoryItemId);
    if (byId) return byId;
  }
  return findInventoryMatch(partNumber, inventoryItems);
}

function assemblyStockState(item: InventoryItemOption | null, requiredQuantity: number): AssemblyStockState {
  const available = inventoryStockQuantity(item);
  const reorderPoint = inventoryReorderPoint(item);
  if (!item || available <= 0) return 'blocked';
  if (available < requiredQuantity || (reorderPoint > 0 && available <= reorderPoint)) return 'low-stock';
  return 'on-hand';
}

function normalizedAssemblyPartKey(value?: string | null) {
  return value?.trim().toLowerCase() ?? '';
}

function findPartsRequestLineForAssemblyPart(
  part: Pick<DraftBomPart | DraftBomComponent, 'sourceLineId' | 'inventoryItemId' | 'partNumber' | 'description'>,
  lines: BomLine[],
) {
  if (part.sourceLineId) {
    const match = lines.find((line) => line.id === part.sourceLineId);
    if (match) return match;
  }

  if (part.inventoryItemId) {
    const match = lines.find((line) => line.inventoryItemId === part.inventoryItemId);
    if (match) return match;
  }

  const partNumber = normalizedAssemblyPartKey(part.partNumber);
  const description = normalizedAssemblyPartKey(part.description);
  return lines.find((line) => normalizedAssemblyPartKey(linePartNumber(line)) === partNumber)
    ?? lines.find((line) => partNumber && normalizedAssemblyPartKey(line.agPartNumber) === partNumber)
    ?? lines.find((line) => description && normalizedAssemblyPartKey(line.description) === description);
}

function assemblyOrderStatus(
  part: Pick<DraftBomPart | DraftBomComponent, 'sourceLineId' | 'inventoryItemId' | 'partNumber' | 'description'>,
  lines: BomLine[],
): BomStatus {
  return findPartsRequestLineForAssemblyPart(part, lines)?.status ?? 'Needs Quote';
}

function isOnHandStatus(status: BomStatus) {
  return status === 'On Hand';
}

function isOrderedStatus(status: BomStatus) {
  return status === 'RFQ Sent' || status === 'On Order' || status === 'ETA / Inbound';
}

function manufactureStateFor(orderStatus: BomStatus, children: AssemblyTreeNode[]): AssemblyManufactureState {
  if (children.length === 0) {
    return isOnHandStatus(orderStatus) ? 'ready' : 'waiting';
  }
  const childStates = children.map((child) => child.manufactureState);
  if (childStates.every((state) => state === 'ready')) return 'ready';
  if (childStates.every((state) => state === 'needs-plan')) return 'needs-plan';
  return 'waiting';
}

function assemblyDisplayStatus(orderStatus: BomStatus, children: AssemblyTreeNode[], manufactureState: AssemblyManufactureState): BomStatus {
  return children.length > 0 && manufactureState === 'ready' ? 'On Hand' : orderStatus;
}

function assemblyPartKey(partNumber: string) {
  return normalizedAssemblyPartKey(partNumber);
}

function lineAssemblyKey(line: BomLine) {
  return assemblyPartKey(linePartNumber(line));
}

function componentAssemblyKey(component: DraftBomComponent) {
  return assemblyPartKey(component.partNumber);
}

function draftBomRootPart(bom: DraftPartBom) {
  return bom.parts[0] ?? bom.rootPart;
}

function draftBomChildComponents(bom: DraftPartBom) {
  const rootPart = draftBomRootPart(bom);
  return rootPart.bomItems?.length ? rootPart.bomItems : bom.rootPart.bomItems ?? [];
}

function addDraftBomPartEntries(partLookup: Map<string, DraftBomPart>, bom: DraftPartBom) {
  bom.parts.forEach((part) => {
    const key = assemblyPartKey(part.partNumber);
    if (!key || !part.bomItems?.length || partLookup.has(key)) return;
    partLookup.set(key, part);
  });
}

function bomMatchesAssemblyPart(
  bom: DraftPartBom,
  part: Pick<DraftBomPart | DraftBomComponent, 'sourceLineId' | 'inventoryItemId' | 'partNumber' | 'description'>,
) {
  const rootPart = bom.rootPart;
  if (part.sourceLineId && rootPart.sourceLineId === part.sourceLineId) return true;
  if (part.inventoryItemId && rootPart.inventoryItemId === part.inventoryItemId) return true;
  const partNumber = normalizedAssemblyPartKey(part.partNumber);
  const description = normalizedAssemblyPartKey(part.description);
  return (
    (partNumber && normalizedAssemblyPartKey(rootPart.partNumber) === partNumber) ||
    (description && normalizedAssemblyPartKey(rootPart.description) === description)
  );
}

function draftBomsForAssemblyPart(
  boms: DraftPartBom[],
  part: Pick<DraftBomPart | DraftBomComponent, 'sourceLineId' | 'inventoryItemId' | 'partNumber' | 'description'>,
) {
  return boms.filter((bom) => bomMatchesAssemblyPart(bom, part));
}

function buildAssemblyTreeNode(
  part: DraftBomPart | DraftBomComponent,
  inventoryItems: InventoryItemOption[],
  partsRequestLines: BomLine[],
  requiredQuantity: number,
  children: DraftBomComponent[] = [],
  entryLookup = new Map<string, AssemblyLineEntry[]>(),
  partLookup = new Map<string, DraftBomPart>(),
  visited: Set<string> = new Set(),
  sourceEntry?: AssemblyLineEntry,
): AssemblyTreeNode {
  const inventoryItem = resolveInventoryForPart(inventoryItems, part.inventoryItemId, part.partNumber);
  const nodeQuantity = requiredQuantity || 1;
  const key = assemblyPartKey(part.partNumber);
  const entries = entryLookup.get(key) ?? [];
  const entry = sourceEntry ?? entries[0];
  const nextVisited = key ? new Set([...visited, key]) : visited;
  const childComponents = visited.has(key) ? [] : (children.length > 0 ? children : entry?.childComponents ?? []);
  const nodeChildren = childComponents.flatMap((component) => {
    const configuredPart = partLookup.get(componentAssemblyKey(component));
    if (configuredPart) {
      const childQuantity = nodeQuantity * (component.quantity || 1);
      return buildAssemblyTreeNode(
        configuredPart,
        inventoryItems,
        partsRequestLines,
        childQuantity,
        configuredPart.bomItems ?? [],
        entryLookup,
        partLookup,
        nextVisited,
      );
    }

    const componentEntries = entryLookup.get(componentAssemblyKey(component)) ?? [];
    const childQuantity = nodeQuantity * (component.quantity || 1);
    if (componentEntries.length > 0 && !visited.has(componentAssemblyKey(component))) {
      return componentEntries.map((componentEntry) =>
        buildAssemblyTreeNode(
          componentEntry.part,
          inventoryItems,
          partsRequestLines,
          childQuantity,
          componentEntry.childComponents,
          entryLookup,
          partLookup,
          nextVisited,
          componentEntry,
        ),
      );
    }
    return [
      buildAssemblyTreeNode(
        component,
        inventoryItems,
        partsRequestLines,
        childQuantity,
        [],
        entryLookup,
        partLookup,
        nextVisited,
      ),
    ];
  });
  const orderStatus = assemblyOrderStatus(part, partsRequestLines);
  const manufactureState = childComponents.length === 0 && !isOnHandStatus(orderStatus) && !isOrderedStatus(orderStatus)
    ? 'needs-plan'
    : manufactureStateFor(orderStatus, nodeChildren);

  return {
    id: `${entry?.bom.id ?? part.id}-${part.partNumber}-${nodeQuantity}`,
    partNumber: entry ? linePartNumber(entry.line) : part.partNumber,
    description: entry ? lineDescription(entry.line) : part.description,
    bomLabel: entry ? `${entry.bom.name} ${entry.bom.revision}` : undefined,
    isManufactured: 'isManufactured' in part ? part.isManufactured : true,
    quantityRequired: nodeQuantity,
    orderStatus,
    displayStatus: assemblyDisplayStatus(orderStatus, nodeChildren, manufactureState),
    manufactureState,
    inventoryItem,
    stockState: assemblyStockState(inventoryItem, nodeQuantity),
    availableQuantity: inventoryStockQuantity(inventoryItem),
    reorderPoint: inventoryReorderPoint(inventoryItem),
    children: nodeChildren,
  };
}

function buildAssemblyTree(lines: BomLine[], inventoryItems: InventoryItemOption[], savedDraftBoms: DraftPartBom[]) {
  const partLookup = new Map<string, DraftBomPart>();
  savedDraftBoms.forEach((bom) => addDraftBomPartEntries(partLookup, bom));

  const entries = savedDraftBoms.flatMap<AssemblyLineEntry>((bom) => {
    const line = findPartsRequestLineForAssemblyPart(bom.rootPart, lines);
    if (!line) return [];
    return [{
      line,
      bom,
      part: { ...bom.rootPart, id: `${bom.rootPart.id}-${bom.id}`, bomItems: draftBomRootPart(bom).bomItems ?? [] },
      childComponents: draftBomChildComponents(bom),
    }];
  });
  const entryLookup = entries.reduce((lookup, entry) => {
    const key = lineAssemblyKey(entry.line);
    const existing = lookup.get(key) ?? [];
    lookup.set(key, [...existing, entry]);
    return lookup;
  }, new Map<string, AssemblyLineEntry[]>());
  const childKeys = new Set(
    entries.flatMap((entry) => entry.childComponents.map(componentAssemblyKey)).filter(Boolean),
  );
  const rootEntries = entries.filter((entry) => !childKeys.has(lineAssemblyKey(entry.line)));
  const treeRootEntries = rootEntries.length > 0 ? rootEntries : entries;

  return treeRootEntries.map((entry) =>
    buildAssemblyTreeNode(
      entry.part,
      inventoryItems,
      lines,
      asNumber(entry.line.qtyNeeded) || 1,
      entry.childComponents,
      entryLookup,
      partLookup,
      new Set(),
      entry,
    ),
  );
}

async function readImportRows(file: File) {
  const fileName = file.name.toLowerCase();
  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || file.type.includes('spreadsheet')) {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return [];
    const sheet = workbook.Sheets[firstSheetName];
    return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' })
      .map((row) => row.map((cell) => String(cell).trim()))
      .filter((row) => row.some((cell) => cell.length > 0));
  }

  return parseCsvRows(await file.text());
}

function buildLinesFromRows(rows: string[][], inventoryItems: InventoryItemOption[], linkInventoryMatches: boolean): CsvImportResult {
  if (rows.length === 0) return { lines: [], linkedCount: 0, customColumns: [] };

  const normalizedFirstRow = rows[0].map(normalizeCsvHeader);
  const knownHeaderCount = normalizedFirstRow.filter((header) => knownImportHeaders.has(header)).length;
  const hasHeaders = knownHeaderCount >= 1;
  const maxColumnCount = Math.max(...rows.map((row) => row.length));
  const headerLabels = hasHeaders
    ? rows[0]
    : Array.from({ length: maxColumnCount }, (_, index) => fallbackImportHeaderLabels[index] ?? `Imported Column ${index + 1}`);
  const columns = buildImportColumns(headerLabels);
  const customColumns = columns.filter((column) => !column.isKnown).map((column) => column.label);
  const dataRows = hasHeaders ? rows.slice(1) : rows;
  let linkedCount = 0;

  const lines = dataRows
    .map((cells) => {
      const row = columns.reduce<Record<string, string>>((acc, column, index) => {
        acc[column.key] = cells[index]?.trim() ?? '';
        return acc;
      }, {});
      const importedCustomFields = columns.reduce<Record<string, string>>((acc, column, index) => {
        const value = cells[index]?.trim() ?? '';
        if (!column.isKnown && value) acc[column.label] = value;
        return acc;
      }, {});
      const importedPartNumber = csvField(row, ['agpartnumber', 'agpart', 'partnumber', 'part', 'itemnumber', 'sku']);
      const description = csvField(row, ['description', 'partdescription', 'name', 'item', 'itemdescription']) || importedPartNumber;
      if (!description && !importedPartNumber && Object.keys(importedCustomFields).length === 0) return null;

      const inventoryMatch = linkInventoryMatches ? findInventoryMatch(importedPartNumber, inventoryItems) : null;
      if (inventoryMatch) linkedCount += 1;
      const estimatedCost = parseCsvNumber(csvField(row, ['unitcost', 'estimatedcost', 'cost', 'price']));
      const actualCost = parseCsvNumber(csvField(row, ['actualcost', 'actual']));
      const quantity = parseCsvNumber(csvField(row, ['qtyneeded', 'quantity', 'qty', 'qnty']));
      const serviceValue = csvField(row, ['service', 'isservice']).toLowerCase();
      const note = csvField(row, ['note', 'notes']);
      const fallbackStatus = inventoryMatch ? 'Needs Review' : 'Needs Quote';

      return {
        ...newLine(),
        action: csvField(row, ['action']) || 'Order / Quote',
        category: csvField(row, ['category', 'filter']) || 'Hardware/Misc.',
        description: inventoryMatch ? inventoryDescription(inventoryMatch) : description || 'Imported spreadsheet line',
        agPartNumber: inventoryMatch?.agPartNumber || (linkInventoryMatches ? '' : importedPartNumber),
        supplier: csvField(row, ['supplier', 'vendor', 'source']) || inventoryMatch?.source || inventoryMatch?.supplier || '',
        supplierItemId:
          csvField(row, ['supplierpartnumber', 'supplierpart', 'supplieritem', 'supplieritemid']) ||
          inventoryMatch?.supplierPartNumber ||
          '',
        manufacturer: csvField(row, ['manufacturer', 'mfg']) || inventoryMatch?.manufacturer || '',
        unit: csvField(row, ['unit', 'uom']) || inventoryMatch?.usageUnit || inventoryMatch?.unit || 'EA',
        unitCost: estimatedCost || (Number.isFinite(Number(inventoryMatch?.costPer)) ? Number(inventoryMatch?.costPer) : ''),
        actualCost,
        qtyNeeded: quantity || 1,
        service: ['true', 'yes', 'y', '1', 'service'].includes(serviceValue),
        status: parseImportStatus(csvField(row, ['status', 'orderstatus']), fallbackStatus),
        targetNeedDate: csvField(row, ['targetneeddate']),
        note: note || (inventoryMatch
          ? `CSV import linked to inventory item #${inventoryMatch.id}`
          : importedPartNumber
            ? `CSV import draft part ${importedPartNumber}`
            : 'CSV import draft part'),
        inventoryItemId: inventoryMatch?.id ?? null,
        inventoryItemName: inventoryMatch?.name || inventoryMatch?.description || null,
        isDraftPart: !inventoryMatch,
        isManufactured: isInventoryManufactured(inventoryMatch),
        firstDepartment: defaultDepartment,
        childDraftBoms: [],
        customFields: importedCustomFields,
      } satisfies BomLine;
    })
    .filter((line): line is BomLine => line !== null);

  return { lines, linkedCount, customColumns };
}

function laborLineTotal(line: DraftLaborEstimateLine) {
  return asNumber(line.hourlyRate) * asNumber(line.hoursPerPart) * asNumber(line.quantityPerPo);
}

function laborDepartmentValue(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeWorkspaceTabs(tabs?: WorkspaceTabId[]) {
  const sourceTabs = tabs?.length ? tabs : defaultWorkspaceTabs;
  const nextTabs = [...sourceTabs];
  if (!nextTabs.includes('direct-labor')) {
    const partsRequestIndex = nextTabs.indexOf('parts-request');
    nextTabs.splice(partsRequestIndex >= 0 ? partsRequestIndex + 1 : nextTabs.length, 0, 'direct-labor');
  }
  if (!nextTabs.includes('nrc')) {
    const directLaborIndex = nextTabs.indexOf('direct-labor');
    nextTabs.splice(directLaborIndex >= 0 ? directLaborIndex + 1 : nextTabs.length, 0, 'nrc');
  }
  return nextTabs;
}

function uniqueColumnNames(columns: string[]) {
  return columns.reduce<string[]>((result, column) => {
    const label = column.trim();
    if (!label || result.includes(label)) return result;
    return [...result, label];
  }, []);
}

function sanitizeCustomColumns(columns: string[]) {
  return uniqueColumnNames(columns).filter((column) => !isStatusDuplicateColumn(column));
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

async function saveSharedDraft(draft: BomDraft) {
  return await apiRequest(`/api/draft-bom-drafts/${encodeURIComponent(draft.id)}`, {
    method: 'PUT',
    body: draft,
  }) as BomDraft;
}

async function deleteSharedDraft(id: string) {
  try {
    await apiRequest(`/api/draft-bom-drafts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch (error) {
    if ((error as any)?.status !== 404) throw error;
  }
}

function savedDraftListWith(drafts: BomDraft[], draft: BomDraft) {
  const withoutCurrent = drafts.filter((item) => item.id !== draft.id);
  return [draft, ...withoutCurrent];
}

function projectMatchValue(value?: string | number | null) {
  return String(value ?? '').trim().toLowerCase();
}

function draftMatchesProject(draft: BomDraft, selectedProject: ProjectSelectOption) {
  if (draft.projectType === selectedProject.projectType && draft.projectId === selectedProject.id) {
    return true;
  }

  const typeMatches = !draft.projectType || draft.projectType === selectedProject.projectType;
  if (!typeMatches) return false;

  const draftValues = [
    draft.projectId,
    draft.projectCode,
    draft.projectName,
    draft.project,
  ].map(projectMatchValue).filter(Boolean);
  const selectedValues = [
    selectedProject.id,
    selectedProject.projectCode,
    selectedProject.projectName,
    selectedProject.project,
    selectedProject.label,
  ].map(projectMatchValue).filter(Boolean);

  return draftValues.some((value) => selectedValues.includes(value));
}

function draftSavedBomCount(draft: BomDraft) {
  return (draft.savedDraftBoms ?? []).length + draft.lines.flatMap((line) => line.childDraftBoms ?? []).length;
}

function draftUpdatedTime(draft: BomDraft) {
  const time = new Date(draft.updatedAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function draftProjectLabel(draft: BomDraft) {
  return draft.projectName || draft.project || draft.projectCode || 'Unlinked project';
}

function draftProjectKey(draft: BomDraft) {
  return [
    draft.projectType || 'UNLINKED',
    draft.projectId || '',
    projectMatchValue(draft.projectCode),
    projectMatchValue(draftProjectLabel(draft)),
  ].join(':');
}

function draftProjectTypeLabel(draft: BomDraft) {
  if (draft.projectType === 'P2_PROJECT') return 'P2 Project';
  if (draft.projectType === 'R_AND_D') return 'R&D Project';
  return 'Unlinked draft project';
}

function groupDraftsByProject(drafts: BomDraft[]): DraftProjectGroup[] {
  const groups = new Map<string, DraftProjectGroup>();

  drafts.forEach((draft) => {
    const key = draftProjectKey(draft);
    const group = groups.get(key) ?? {
      key,
      label: draftProjectLabel(draft),
      projectType: draftProjectTypeLabel(draft),
      drafts: [],
    };
    group.drafts.push(draft);
    groups.set(key, group);
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      drafts: group.drafts.slice().sort((a, b) => draftUpdatedTime(b) - draftUpdatedTime(a)),
    }))
    .sort((a, b) => {
      const timeDelta = draftUpdatedTime(b.drafts[0]) - draftUpdatedTime(a.drafts[0]);
      if (timeDelta !== 0) return timeDelta;
      return a.label.localeCompare(b.label);
    });
}

function projectDraftMatchScore(draft: BomDraft, selectedProject: ProjectSelectOption) {
  const structuredMatch = draft.projectType === selectedProject.projectType && draft.projectId === selectedProject.id ? 4 : 0;
  const savedBomScore = draftSavedBomCount(draft) > 0 ? 3 : 0;
  const specificProjectScore = draft.projectType && draft.projectId ? 2 : 0;
  const builtInSeedPenalty = draft.id === PRIVATEER_DRAFT_ID ? -1 : 0;
  return structuredMatch + savedBomScore + specificProjectScore + builtInSeedPenalty;
}

function selectBestDraftForProject(drafts: BomDraft[], selectedProject: ProjectSelectOption) {
  return drafts
    .filter((item) => draftMatchesProject(item, selectedProject))
    .sort((a, b) => {
      const scoreDelta = projectDraftMatchScore(b, selectedProject) - projectDraftMatchScore(a, selectedProject);
      if (scoreDelta !== 0) return scoreDelta;
      return draftUpdatedTime(b) - draftUpdatedTime(a);
    })[0] ?? null;
}

function createBlankDraftForProject(selectedProject: ProjectSelectOption): BomDraft {
  return {
    id: crypto.randomUUID(),
    name: selectedProject.projectName,
    revision: 'Draft A',
    owner: '',
    project: selectedProject.project,
    projectId: selectedProject.id,
    projectCode: selectedProject.projectCode,
    projectName: selectedProject.projectName,
    projectType: selectedProject.projectType,
    notes: '',
    updatedAt: new Date().toISOString(),
    lines: [newLine()],
    laborEstimateLines: [newLaborEstimateLine()],
    customLaborDepartments: [],
    poVisibleColumns: defaultPoColumns,
    partsRequestVisibleColumns: defaultPartsRequestColumns,
    directLaborVisibleColumns: defaultDirectLaborColumns,
    assemblyVisibleColumns: defaultSourcingColumns,
    customColumns: [],
    customPoColumns: [],
    workspaceTabs: defaultWorkspaceTabs,
    visibility: 'public',
    allowPublicEdit: false,
  };
}

function createBlankDraftForTemporaryProject(projectName: string): BomDraft {
  const cleanProjectName = projectName.trim();
  return {
    id: crypto.randomUUID(),
    name: cleanProjectName || 'New Draft BOM',
    revision: 'Draft A',
    owner: '',
    project: cleanProjectName,
    projectId: null,
    projectCode: null,
    projectName: cleanProjectName || null,
    projectType: null,
    notes: cleanProjectName
      ? 'Temporary project draft. Link it to a formal project when the project record exists.'
      : '',
    updatedAt: new Date().toISOString(),
    lines: [newLine()],
    laborEstimateLines: [newLaborEstimateLine()],
    customLaborDepartments: [],
    poVisibleColumns: defaultPoColumns,
    partsRequestVisibleColumns: defaultPartsRequestColumns,
    directLaborVisibleColumns: defaultDirectLaborColumns,
    assemblyVisibleColumns: defaultSourcingColumns,
    customColumns: [],
    customPoColumns: [],
    workspaceTabs: defaultWorkspaceTabs,
    visibility: 'public',
    allowPublicEdit: false,
  };
}

function formatDraftUpdatedAt(value: string) {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return 'Unknown';
  return time.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function draftVisibilityLabel(draft: BomDraft) {
  if (draft.visibility === 'private') return 'Private';
  return draft.allowPublicEdit ? 'Public edit' : 'Public view';
}

export default function DraftBOMBuilderPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [savedDrafts, setSavedDrafts] = useState<BomDraft[]>(() => loadDrafts());
  const [selectedDraftId, setSelectedDraftId] = useState<string>(PRIVATEER_DRAFT_ID);
  const [draft, setDraft] = useState<BomDraft>(() => loadDrafts()[0] ?? createPrivateerDraft());
  const [rdProjects, setRdProjects] = useState<RDProjectOption[]>(() => readRDProjectOptions());
  const [isLibraryView, setIsLibraryView] = useState(true);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isCreateDraftOpen, setIsCreateDraftOpen] = useState(false);
  const [newDraftProjectMode, setNewDraftProjectMode] = useState<'existing' | 'temporary'>('existing');
  const [newDraftProjectValue, setNewDraftProjectValue] = useState('');
  const [newDraftProjectName, setNewDraftProjectName] = useState('');
  const [newDraftName, setNewDraftName] = useState('');
  const [isEditMode, setIsEditMode] = useState(true);
  const [visibleWorkspaceTabs, setVisibleWorkspaceTabs] = useState<WorkspaceTabId[]>(() => draft.workspaceTabs ?? defaultWorkspaceTabs);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTabId>('po-draft');
  const [poDescription, setPoDescription] = useState('');
  const [partsRequestDescription, setPartsRequestDescription] = useState('');
  const [visiblePoColumns, setVisiblePoColumns] = useState<PoColumnId[]>(() => draft.poVisibleColumns ?? defaultPoColumns);
  const [visiblePartsRequestColumns, setVisiblePartsRequestColumns] = useState<PartsRequestColumnId[]>(
    () => draft.partsRequestVisibleColumns ?? defaultPartsRequestColumns,
  );
  const [visibleDirectLaborColumns, setVisibleDirectLaborColumns] = useState<DirectLaborColumnId[]>(
    () => draft.directLaborVisibleColumns ?? defaultDirectLaborColumns,
  );
  const [visibleAssemblyColumns, setVisibleAssemblyColumns] = useState<SourcingColumnId[]>(
    () => draft.assemblyVisibleColumns ?? defaultSourcingColumns,
  );
  const [customColumns, setCustomColumns] = useState<string[]>(() => draft.customColumns ?? draft.customPoColumns ?? []);
  const [newColumnName, setNewColumnName] = useState('');
  const [newWorkspaceTabName, setNewWorkspaceTabName] = useState('');
  const [newLaborDepartmentName, setNewLaborDepartmentName] = useState('');
  const [wizardSeedLineId, setWizardSeedLineId] = useState<string | null>(null);
  const [isFinalizingParts, setIsFinalizingParts] = useState(false);
  const [hasLoadedSharedDrafts, setHasLoadedSharedDrafts] = useState(false);

  const { data: projects = [], isLoading: projectsLoading } = useQuery<ProjectOption[]>({
    queryKey: ['/api/projects'],
  });

  const { data: sharedDrafts = [], isFetched: sharedDraftsFetched } = useQuery<BomDraft[]>({
    queryKey: ['/api/draft-bom-drafts'],
    queryFn: () => apiRequest('/api/draft-bom-drafts'),
  });

  const { data: inventoryItems = [] } = useQuery<InventoryItemOption[]>({
    queryKey: ['/api/inventory'],
    queryFn: () => apiRequest('/api/inventory'),
  });

  const { data: inventoryDepartments = [] } = useQuery<InventoryDepartmentOption[]>({
    queryKey: ['/api/inventory/departments'],
  });

  const bomDepartmentOptions = useMemo<DepartmentOption[]>(() => {
    if (inventoryDepartments.length === 0) return fallbackBomDepartmentOptions;
    return inventoryDepartments.map((department) => ({
      value: department.name,
      label: department.name,
    }));
  }, [inventoryDepartments]);

  const projectOptions = useMemo(() => {
    return [...projects].sort((a, b) => projectLabel(a).localeCompare(projectLabel(b)));
  }, [projects]);
  const rdProjectOptions = useMemo(() => {
    return [...rdProjects].sort((a, b) => a.projectName.localeCompare(b.projectName));
  }, [rdProjects]);
  const combinedProjectOptions = useMemo<ProjectSelectOption[]>(() => {
    const p2Options = projectOptions.map((project) => ({
      value: `${P2_PROJECT_VALUE_PREFIX}${project.id}`,
      id: project.id,
      label: projectLabel(project),
      project: projectLabel(project),
      projectCode: project.projectCode,
      projectName: project.projectName,
      projectType: 'P2_PROJECT' as const,
    }));
    const rdOptions = rdProjectOptions.map((project) => ({
      value: `${RD_PROJECT_VALUE_PREFIX}${project.id}`,
      id: project.id,
      label: project.projectName,
      project: project.projectName,
      projectCode: null,
      projectName: project.projectName,
      projectType: 'R_AND_D' as const,
    }));
    return [...rdOptions, ...p2Options];
  }, [projectOptions, rdProjectOptions]);
  const draftProjectGroups = useMemo(() => groupDraftsByProject(savedDrafts), [savedDrafts]);
  const selectedProjectValue =
    draft.projectType === 'P2_PROJECT' && draft.projectId
      ? `${P2_PROJECT_VALUE_PREFIX}${draft.projectId}`
      : draft.projectType === 'R_AND_D' && draft.projectId
        ? `${RD_PROJECT_VALUE_PREFIX}${draft.projectId}`
        : draft.projectType === 'R_AND_D'
          ? LEGACY_R_AND_D_PROJECT_VALUE
          : '';
  const canEditActiveDraft = draft.canEdit !== false;
  const canManageActiveDraftAccess = draft.canManageAccess !== false;
  const effectiveEditMode = isEditMode && canEditActiveDraft;

  const selectedLines = useMemo(() => draft.lines.filter((line) => line.include), [draft.lines]);
  const laborDepartments = useMemo(() => {
    const customDepartments = draft.customLaborDepartments ?? [];
    return [
      ...departmentOptions,
      ...customDepartments.map((department) => ({
        value: laborDepartmentValue(department),
        label: department,
      })),
    ];
  }, [draft.customLaborDepartments]);
  const orderableLines = useMemo(
    () => draft.lines.filter((line) => line.action !== 'Do Not Order' && !line.finalized),
    [draft.lines],
  );
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
  const partsRequestMatches = useMemo(() => {
    const query = partsRequestDescription.trim().toLowerCase();
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
  }, [activeInventoryItems, partsRequestDescription]);
  const partsRequestLines = draft.lines;
  const assemblyTree = useMemo(
    () => buildAssemblyTree(partsRequestLines, activeInventoryItems, draft.savedDraftBoms ?? []),
    [activeInventoryItems, draft.savedDraftBoms, partsRequestLines],
  );
  const partsRequestSelectedCount = partsRequestLines.filter((line) => line.include).length;
  const allPartsRequestVisibleSelected = partsRequestLines.length > 0 && partsRequestSelectedCount === partsRequestLines.length;
  const somePartsRequestVisibleSelected = partsRequestSelectedCount > 0 && partsRequestSelectedCount < partsRequestLines.length;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const refreshRDProjects = () => setRdProjects(readRDProjectOptions());
    window.addEventListener('focus', refreshRDProjects);
    window.addEventListener('storage', refreshRDProjects);
    return () => {
      window.removeEventListener('focus', refreshRDProjects);
      window.removeEventListener('storage', refreshRDProjects);
    };
  }, []);

  useEffect(() => {
    if (!sharedDraftsFetched || hasLoadedSharedDrafts) return;
    const sourceDrafts = sharedDrafts.length > 0 ? sharedDrafts : loadDrafts();
    const normalizedDrafts = sourceDrafts.map(normalizeDraft);
    const nextDrafts = normalizedDrafts.length > 0 ? normalizedDrafts : [createPrivateerDraft()];
    const selectedDraft = nextDrafts.find((item) => item.id === selectedDraftId) ?? nextDrafts[0];

    setSavedDrafts(nextDrafts);
    saveDrafts(nextDrafts);
    applyDraftSelection(selectedDraft);
    setHasLoadedSharedDrafts(true);
  }, [hasLoadedSharedDrafts, selectedDraftId, sharedDrafts, sharedDraftsFetched]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nextDraft = normalizeDraft({
      ...draft,
      poVisibleColumns: visiblePoColumns,
      partsRequestVisibleColumns: visiblePartsRequestColumns,
      directLaborVisibleColumns: visibleDirectLaborColumns,
      assemblyVisibleColumns: visibleAssemblyColumns,
      customColumns,
      customPoColumns: customColumns,
      workspaceTabs: visibleWorkspaceTabs,
      updatedAt: new Date().toISOString(),
    });

    setSavedDrafts((current) => {
      const nextDrafts = savedDraftListWith(current, nextDraft);
      saveDrafts(nextDrafts);
      return nextDrafts;
    });

    if (hasLoadedSharedDrafts && canEditActiveDraft) {
      void saveSharedDraft(nextDraft)
        .then((savedDraft) => {
          const normalizedSavedDraft = normalizeDraft(savedDraft);
          queryClient.setQueryData<BomDraft[]>(['/api/draft-bom-drafts'], (current = []) =>
            savedDraftListWith(current.map(normalizeDraft), normalizedSavedDraft),
          );
        })
        .catch((error) => {
          console.error('Failed to save shared Draft Builder draft:', error);
        });
    }

    if (selectedDraftId !== nextDraft.id) {
      setSelectedDraftId(nextDraft.id);
    }
  }, [
    customColumns,
    canEditActiveDraft,
    draft,
    hasLoadedSharedDrafts,
    queryClient,
    selectedDraftId,
    visibleAssemblyColumns,
    visibleDirectLaborColumns,
    visiblePartsRequestColumns,
    visiblePoColumns,
    visibleWorkspaceTabs,
  ]);

  const totals = useMemo(() => {
    const lineTotal = (line: BomLine) => asNumber(line.unitCost) * asNumber(line.qtyNeeded);
    const materialTotal = draft.lines.reduce((sum, line) => sum + lineTotal(line), 0);
    const selectedTotal = selectedLines.reduce((sum, line) => sum + lineTotal(line), 0);
    const onHandTotal = draft.lines
      .filter((line) => line.status === 'On Hand')
      .reduce((sum, line) => sum + lineTotal(line), 0);
    const needsQuote = draft.lines.filter((line) => line.status === 'Needs Quote' || line.unitCost === '').length;
    const rfqSent = draft.lines.filter((line) => line.status === 'RFQ Sent').length;
    const laborTotal = (draft.laborEstimateLines ?? []).reduce((sum, line) => sum + laborLineTotal(line), 0);
    const laborHours = (draft.laborEstimateLines ?? []).reduce(
      (sum, line) => sum + asNumber(line.hoursPerPart) * asNumber(line.quantityPerPo),
      0,
    );
    const nrcTotal = (draft.nrcRows ?? []).reduce((sum, row) => sum + nrcRowTotal(row), 0);
    const customerFacingNrcTotal = (draft.nrcRows ?? [])
      .filter((row) => row.includeInCustomerPrice && !row.internalOnly)
      .reduce((sum, row) => sum + nrcRowTotal(row), 0);

    return {
      materialTotal,
      laborTotal,
      laborHours,
      nrcTotal,
      customerFacingNrcTotal,
      selectedTotal,
      onHandTotal,
      needsQuote,
      rfqSent,
      lineCount: draft.lines.length,
    };
  }, [draft.laborEstimateLines, draft.lines, draft.nrcRows, selectedLines]);

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

  function deleteLine(id: string) {
    setDraft((current) => ({
      ...current,
      lines: current.lines.filter((line) => line.id !== id),
    }));
  }

  function updateLaborEstimateLine(id: string, patch: Partial<DraftLaborEstimateLine>) {
    setDraft((current) => ({
      ...current,
      laborEstimateLines: (current.laborEstimateLines ?? []).map((line) =>
        line.id === id ? { ...line, ...patch } : line,
      ),
    }));
  }

  function updateLaborEstimateNumberLine(
    id: string,
    field: 'hourlyRate' | 'hoursPerPart' | 'quantityPerPo',
    value: string,
  ) {
    updateLaborEstimateLine(id, { [field]: value === '' ? '' : Number(value) } as Partial<DraftLaborEstimateLine>);
  }

  function addLaborEstimateLine() {
    setDraft((current) => ({
      ...current,
      laborEstimateLines: [...(current.laborEstimateLines ?? []), newLaborEstimateLine()],
    }));
  }

  function removeLaborEstimateLine(id: string) {
    setDraft((current) => {
      const remainingLines = (current.laborEstimateLines ?? []).filter((line) => line.id !== id);
      return {
        ...current,
        laborEstimateLines: remainingLines.length > 0 ? remainingLines : [newLaborEstimateLine()],
      };
    });
  }

  function updateNrcRow(id: string, patch: Partial<NrcCostRow>) {
    setDraft((current) => ({
      ...current,
      nrcRows: (current.nrcRows ?? []).map((row) => {
        if (row.id !== id) return row;
        const nextRow = { ...row, ...patch };
        return { ...nextRow, totalCost: nrcRowTotal(nextRow) };
      }),
    }));
  }

  function updateNrcNumberRow(
    id: string,
    field: 'quantity' | 'unitCost' | 'amortizationQty' | 'usefulLifeMonths' | 'installationCost' | 'trainingCost',
    value: string,
  ) {
    updateNrcRow(id, { [field]: value === '' ? null : Number(value) } as Partial<NrcCostRow>);
  }

  function addNrcRow() {
    setDraft((current) => ({
      ...current,
      nrcRows: [...(current.nrcRows ?? []), newNrcRow()],
    }));
  }

  function removeNrcRow(id: string) {
    setDraft((current) => ({
      ...current,
      nrcRows: (current.nrcRows ?? []).filter((row) => row.id !== id),
    }));
  }

  function addLaborDepartment() {
    const label = newLaborDepartmentName.trim();
    const value = laborDepartmentValue(label);
    if (!label || !value) return;

    setDraft((current) => {
      const customDepartments = current.customLaborDepartments ?? [];
      const knownValues = new Set([
        ...departmentOptions.map((department) => department.value),
        ...customDepartments.map(laborDepartmentValue),
      ]);
      return {
        ...current,
        customLaborDepartments: knownValues.has(value) ? customDepartments : [...customDepartments, label],
      };
    });
    setNewLaborDepartmentName('');
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

  function setAllPartsRequestIncluded(lineIds: string[], include: boolean) {
    const visibleLineIds = new Set(lineIds);
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line) => (visibleLineIds.has(line.id) ? { ...line, include } : line)),
    }));
  }

  function startDraftBomForLine(lineId: string) {
    setWizardSeedLineId(lineId);
    if (!visibleWorkspaceTabs.includes('bom-wizard')) {
      setVisibleWorkspaceTabs((current) => (current.includes('bom-wizard') ? current : [...current, 'bom-wizard']));
    }
    setActiveWorkspaceTab('bom-wizard');
  }

  function saveWizardBom(part: DraftBomPart, bom: DraftPartBom) {
    setDraft((current) => {
      const rootLineId = part.sourceLineId ?? part.id;
      const sourceLine = current.lines.find((line) => line.id === rootLineId) ?? null;
      const shouldCreateRootLine = !sourceLine && !part.sourceLineId;
      const rootLine =
        sourceLine ??
        (shouldCreateRootLine
          ? ({
              ...newLine(),
              id: rootLineId,
              include: true,
              action: 'Hold',
              category: 'Hardware/Misc.',
              agPartNumber: part.partNumber,
              description: part.description,
              qtyNeeded: part.quantity || 1,
              status: part.source === 'inventory-item' ? 'Needs Review' : 'Needs Quote',
              note: part.source === 'inventory-item' ? `Draft BOM built from inventory item #${part.inventoryItemId}` : 'Draft BOM built from new part',
              inventoryItemId: part.inventoryItemId ?? null,
              inventoryItemName: part.source === 'inventory-item' ? part.description : null,
              isDraftPart: part.source !== 'inventory-item',
              isManufactured: true,
              firstDepartment: defaultDepartment,
              childDraftBoms: [],
            } as BomLine)
          : null);

      const linkedPart = { ...part, sourceLineId: rootLine?.id ?? part.sourceLineId ?? null };
      const linkedBom: DraftPartBom = {
        ...bom,
        rootPart: linkedPart,
        parts: bom.parts.map((queuedPart, index) =>
          index === 0 ? { ...queuedPart, sourceLineId: rootLine?.id ?? queuedPart.sourceLineId ?? null } : queuedPart,
        ),
        updatedAt: new Date().toISOString(),
      };

      const nextLines = rootLine && !sourceLine ? [rootLine, ...current.lines] : current.lines;
      const nextSavedDraftBoms = mergeDraftBoms([
        linkedBom,
        ...(current.savedDraftBoms ?? []).filter((item) => item.id !== linkedBom.id),
      ]);
      return {
        ...current,
        savedDraftBoms: nextSavedDraftBoms,
        lines: nextLines.map((line) => {
          if (!rootLine || line.id !== rootLine.id) return line;
          const childDraftBoms = line.childDraftBoms ?? [];
          const withoutCurrentBom = childDraftBoms.filter((item) => item.id !== linkedBom.id);
          return {
            ...line,
            isManufactured: true,
            firstDepartment: line.firstDepartment ?? defaultDepartment,
            childDraftBoms: [linkedBom, ...withoutCurrentBom],
          };
        }),
      };
    });

    setWizardSeedLineId(null);
    toast({
      title: 'Draft BOM saved',
      description: `${bom.name} ${bom.revision} is linked to ${part.partNumber}.`,
    });
  }

  function deleteWizardBom(bomId: string) {
    setDraft((current) => ({
      ...current,
      savedDraftBoms: (current.savedDraftBoms ?? []).filter((bom) => bom.id !== bomId),
      lines: current.lines.map((line) => ({
        ...line,
        childDraftBoms: (line.childDraftBoms ?? []).filter((bom) => bom.id !== bomId),
      })),
    }));
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
      isManufactured: isInventoryManufactured(item),
      firstDepartment: defaultDepartment,
      childDraftBoms: [],
      customFields: {},
    };

    setDraft((current) => ({ ...current, lines: [nextLine, ...current.lines] }));
    setPoDescription('');
    toast({
      title: item ? 'Inventory item added' : 'Draft part created',
      description: item ? `${description} was added to the PO draft.` : `${description} was added as a draft part.`,
    });
  }

  function createLineFromPartsRequestDescription(item?: InventoryItemOption) {
    const description = item?.name || item?.description || partsRequestDescription.trim();
    const itemCost = Number(item?.costPer);
    if (!description) {
      toast({
        title: 'Part description required',
        description: 'Start with a part description before adding a parts/request line.',
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
      actualCost: '',
      qtyNeeded: 1,
      service: false,
      status: item ? 'Needs Review' : 'Needs Quote',
      note: item ? `Matched inventory item #${item.id}` : 'Draft part - create inventory item when finalized',
      inventoryItemId: item?.id ?? null,
      inventoryItemName: item?.name || item?.description || null,
      isDraftPart: !item,
      isManufactured: isInventoryManufactured(item),
      firstDepartment: defaultDepartment,
      childDraftBoms: [],
      customFields: {},
    };

    setDraft((current) => ({ ...current, lines: [nextLine, ...current.lines] }));
    setPartsRequestDescription('');
    toast({
      title: item ? 'Inventory item added' : 'Draft part created',
      description: item ? `${description} was added to parts/request.` : `${description} was added as a draft part.`,
    });
  }

  async function importPartsRequestCsv(file: File, linkInventoryMatches: boolean) {
    const rows = await readImportRows(file);
    const result = buildLinesFromRows(rows, activeInventoryItems, linkInventoryMatches);

    if (result.lines.length === 0) {
      toast({
        title: 'No rows imported',
        description: 'Check that the file has part, description, quantity, supplier, or cost columns.',
        variant: 'destructive',
      });
      return;
    }

    setCustomColumns((current) => sanitizeCustomColumns([...current, ...result.customColumns]));
    setDraft((current) => ({
      ...current,
      lines: [...result.lines, ...current.lines],
      customColumns: sanitizeCustomColumns([...(current.customColumns ?? []), ...result.customColumns]),
      customPoColumns: sanitizeCustomColumns([...(current.customPoColumns ?? []), ...result.customColumns]),
      updatedAt: new Date().toISOString(),
    }));
    toast({
      title: 'Import complete',
      description: `${result.lines.length} part line(s) added${result.customColumns.length ? ` with ${result.customColumns.length} imported column(s)` : ''}${linkInventoryMatches ? `, ${result.linkedCount} linked to inventory items` : ''}.`,
    });
  }

  function togglePoColumn(columnId: PoColumnId, checked: boolean) {
    setVisiblePoColumns((current) => {
      if (checked) return current.includes(columnId) ? current : [...current, columnId];
      return current.filter((item) => item !== columnId);
    });
  }

  function togglePartsRequestColumn(columnId: PartsRequestColumnId, checked: boolean) {
    setVisiblePartsRequestColumns((current) => {
      if (checked) return current.includes(columnId) ? current : [...current, columnId];
      return current.filter((item) => item !== columnId);
    });
  }

  function toggleDirectLaborColumn(columnId: DirectLaborColumnId, checked: boolean) {
    setVisibleDirectLaborColumns((current) => {
      if (checked) return current.includes(columnId) ? current : [...current, columnId];
      return current.filter((item) => item !== columnId);
    });
  }

  function toggleAssemblyColumn(columnId: SourcingColumnId, checked: boolean) {
    setVisibleAssemblyColumns((current) => {
      if (checked) return current.includes(columnId) ? current : [...current, columnId];
      return current.filter((item) => item !== columnId);
    });
  }

  function addCustomColumn() {
    const columnName = newColumnName.trim();
    if (!columnName) return;
    setCustomColumns((current) => (current.includes(columnName) ? current : [...current, columnName]));
    setNewColumnName('');
  }

  function updateLineCustomField(lineId: string, columnName: string, value: string) {
    updateLine(lineId, {
      customFields: {
        ...(draft.lines.find((line) => line.id === lineId)?.customFields ?? {}),
        [columnName]: value,
      },
    });
  }

  async function saveDraft() {
    if (!canEditActiveDraft) {
      toast({
        title: 'View-only draft',
        description: 'The creator has not allowed shared editing for this draft.',
        variant: 'destructive',
      });
      return;
    }

    const nextDraft = normalizeDraft({
      ...draft,
      poVisibleColumns: visiblePoColumns,
      partsRequestVisibleColumns: visiblePartsRequestColumns,
      directLaborVisibleColumns: visibleDirectLaborColumns,
      assemblyVisibleColumns: visibleAssemblyColumns,
      customColumns,
      customPoColumns: customColumns,
      workspaceTabs: visibleWorkspaceTabs,
      updatedAt: new Date().toISOString(),
    });
    const nextDrafts = savedDraftListWith(savedDrafts, nextDraft);
    saveDrafts(nextDrafts);
    setSavedDrafts(nextDrafts);
    setSelectedDraftId(nextDraft.id);
    setDraft(nextDraft);
    try {
      const savedDraft = normalizeDraft(await saveSharedDraft(nextDraft));
      queryClient.setQueryData<BomDraft[]>(['/api/draft-bom-drafts'], (current = []) =>
        savedDraftListWith(current.map(normalizeDraft), savedDraft),
      );
    } catch (error) {
      console.error('Failed to save shared Draft Builder draft:', error);
      toast({
        title: 'Draft saved locally',
        description: 'The shared draft save failed, so this browser kept the latest local copy.',
        variant: 'destructive',
      });
      return;
    }
    toast({ title: 'Draft saved', description: `${nextDraft.name} is available in saved BOM drafts.` });
  }

  function applyDraftSelection(nextDraft: BomDraft) {
    const normalizedDraft = normalizeDraft(nextDraft);
    setSelectedDraftId(normalizedDraft.id);
    setDraft(normalizedDraft);
    setVisiblePoColumns(normalizedDraft.poVisibleColumns ?? defaultPoColumns);
    setVisiblePartsRequestColumns(normalizedDraft.partsRequestVisibleColumns ?? defaultPartsRequestColumns);
    setVisibleDirectLaborColumns(normalizedDraft.directLaborVisibleColumns ?? defaultDirectLaborColumns);
    setVisibleAssemblyColumns(normalizedDraft.assemblyVisibleColumns ?? defaultSourcingColumns);
    setCustomColumns(normalizedDraft.customColumns ?? normalizedDraft.customPoColumns ?? []);
    setVisibleWorkspaceTabs(normalizedDraft.workspaceTabs ?? defaultWorkspaceTabs);
    setActiveWorkspaceTab((normalizedDraft.workspaceTabs ?? defaultWorkspaceTabs)[0] ?? 'po-draft');
  }

  function loadDraft(id: string) {
    if (id === NEW_DRAFT_VALUE) {
      startBlankDraft();
      return;
    }

    const match = savedDrafts.find((item) => item.id === id);
    if (!match) return;
    applyDraftSelection(match);
  }

  async function deleteCurrentDraft() {
    if (!canManageActiveDraftAccess) {
      toast({
        title: 'Creator access required',
        description: 'Only the creator can delete or manage access for this draft.',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedDraftId) {
      toast({
        title: 'Save the draft first',
        description: 'Only saved draft BOMs can be deleted from settings.',
        variant: 'destructive',
      });
      return;
    }

    if (draft.id === PRIVATEER_DRAFT_ID) {
      toast({
        title: 'Privateer draft is locked',
        description: 'The built-in Privateer seed draft stays available as a reference.',
        variant: 'destructive',
      });
      return;
    }

    const savedMatch = savedDrafts.find((item) => item.id === draft.id);
    if (!savedMatch) {
      toast({
        title: 'Draft is not saved',
        description: 'This draft is only in the current workspace and does not have a saved record to delete.',
        variant: 'destructive',
      });
      return;
    }

    const confirmed = window.confirm(`Delete draft BOM "${draft.name} - ${draft.revision}"? This cannot be undone.`);
    if (!confirmed) return;

    const remainingDrafts = savedDrafts.filter((item) => item.id !== draft.id);
    const fallbackDraft = remainingDrafts[0] ?? createPrivateerDraft();

    try {
      await deleteSharedDraft(draft.id);
      queryClient.setQueryData<BomDraft[]>(['/api/draft-bom-drafts'], (current = []) =>
        current.filter((item) => item.id !== draft.id),
      );
      saveDrafts(remainingDrafts);
      setSavedDrafts(remainingDrafts);
      applyDraftSelection(fallbackDraft);
      setIsDetailsOpen(false);
      toast({ title: 'Draft deleted', description: `${draft.name} was removed from saved draft BOMs.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The shared draft could not be deleted.';
      toast({ title: 'Delete failed', description: message, variant: 'destructive' });
    }
  }

  async function clearCurrentDraft() {
    if (!canEditActiveDraft) {
      toast({
        title: 'View-only draft',
        description: 'The creator has not allowed shared editing for this draft.',
        variant: 'destructive',
      });
      return;
    }

    const confirmed = window.confirm(`Clear "${draft.name} - ${draft.revision}" and start over? This cannot be undone.`);
    if (!confirmed) return;

    const clearedDraft: BomDraft = {
      ...draft,
      updatedAt: new Date().toISOString(),
      lines: [newLine()],
      savedDraftBoms: [],
      laborEstimateLines: [newLaborEstimateLine()],
      nrcRows: [],
      customLaborDepartments: [],
      poVisibleColumns: defaultPoColumns,
      partsRequestVisibleColumns: defaultPartsRequestColumns,
      directLaborVisibleColumns: defaultDirectLaborColumns,
      assemblyVisibleColumns: defaultSourcingColumns,
      customColumns: [],
      customPoColumns: [],
      workspaceTabs: defaultWorkspaceTabs,
    };

    const shouldPersist = !!selectedDraftId && savedDrafts.some((item) => item.id === draft.id);
    if (shouldPersist) {
      const nextDrafts = savedDrafts.map((item) => (item.id === draft.id ? clearedDraft : item));
      saveDrafts(nextDrafts);
      setSavedDrafts(nextDrafts);
      try {
        const savedDraft = normalizeDraft(await saveSharedDraft(clearedDraft));
        queryClient.setQueryData<BomDraft[]>(['/api/draft-bom-drafts'], (current = []) =>
          savedDraftListWith(current.map(normalizeDraft), savedDraft),
        );
      } catch (error) {
        console.error('Failed to save cleared shared Draft Builder draft:', error);
      }
    }

    applyDraftSelection(clearedDraft);
    toast({
      title: 'Draft cleared',
      description: shouldPersist ? `${draft.name} was reset and saved.` : `${draft.name} was reset in the current workspace.`,
    });
  }

  function updateDraftProject(value: string) {
    const selectedProject = combinedProjectOptions.find((project) => project.value === value);
    if (!selectedProject) return;

    const savedProjectDraft = selectBestDraftForProject(savedDrafts, selectedProject);

    if (savedProjectDraft) {
      loadDraft(savedProjectDraft.id);
      return;
    }

    setSelectedDraftId('');
    applyDraftSelection(createBlankDraftForProject(selectedProject));
  }

  function startBlankDraft() {
    const blankDraft: BomDraft = {
      id: crypto.randomUUID(),
      name: 'New Draft BOM',
      revision: 'Draft A',
      owner: '',
      project: draft.project,
      projectId: draft.projectId ?? null,
      projectCode: draft.projectCode ?? null,
      projectName: draft.projectName ?? null,
      projectType: draft.projectType ?? null,
      notes: '',
      updatedAt: new Date().toISOString(),
      lines: [newLine()],
      savedDraftBoms: [],
      laborEstimateLines: [newLaborEstimateLine()],
      nrcRows: [],
      customLaborDepartments: [],
      poVisibleColumns: defaultPoColumns,
      partsRequestVisibleColumns: defaultPartsRequestColumns,
      directLaborVisibleColumns: defaultDirectLaborColumns,
      assemblyVisibleColumns: defaultSourcingColumns,
      customColumns: [],
      customPoColumns: [],
      workspaceTabs: defaultWorkspaceTabs,
    };
    setSelectedDraftId('');
    setDraft(blankDraft);
    setVisiblePoColumns(defaultPoColumns);
    setVisiblePartsRequestColumns(defaultPartsRequestColumns);
    setVisibleDirectLaborColumns(defaultDirectLaborColumns);
    setVisibleAssemblyColumns(defaultSourcingColumns);
    setCustomColumns([]);
    setVisibleWorkspaceTabs(defaultWorkspaceTabs);
    setActiveWorkspaceTab('po-draft');
  }

  async function markSelectedFinalized() {
    if (!canEditActiveDraft) {
      toast({
        title: 'View-only draft',
        description: 'The creator has not allowed shared editing for this draft.',
        variant: 'destructive',
      });
      return;
    }

    if (!draft.project) {
      toast({
        title: 'Select a project first',
        description: 'Choose a P2 project or R&D before finalizing lines for inventory-item creation.',
        variant: 'destructive',
      });
      return;
    }

    const selectedDraftLines = draft.lines.filter((line) => line.include);
    const linesToCreate = selectedDraftLines.filter(draftLineNeedsInventoryItem);
    const createdByLineId = new Map<string, DraftFinalizedInventoryItem>();

    setIsFinalizingParts(true);
    try {
      for (const line of linesToCreate) {
        const createdItem = await createInventoryItemFromDraftLine(line, draft);
        createdByLineId.set(line.id, createdItem);
      }

      setDraft((current) => ({
        ...current,
        lines: current.lines.map((line) => {
          if (!line.include) return line;
          const createdItem = createdByLineId.get(line.id);
          if (draftLineNeedsInventoryItem(line) && !createdItem) return line;
          return {
            ...line,
            finalized: true,
            include: false,
            action: 'Do Not Order',
            agPartNumber: createdItem?.agPartNumber ?? line.agPartNumber,
            inventoryItemId: createdItem?.id ?? line.inventoryItemId ?? null,
            inventoryItemName: createdItem?.name ?? line.inventoryItemName ?? lineDescription(line),
            isDraftPart: false,
            note: createdItem
              ? `Finalized to inventory item #${createdItem.id} (${createdItem.agPartNumber})`
              : line.note,
          };
        }),
      }));

      if (createdByLineId.size > 0) {
        await queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      }

      toast({
        title: 'Inventory finalization complete',
        description: createdByLineId.size > 0
          ? `${selectedDraftLines.length} line(s) finalized, ${createdByLineId.size} new inventory item(s) created with AG part numbers.`
          : `${selectedDraftLines.length} line(s) finalized.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create inventory items from the selected draft lines.';
      toast({
        title: 'Inventory finalization failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsFinalizingParts(false);
    }
  }

  function createVendorPoHandoff() {
    const selectedRequestLines = draft.lines.filter((line) => line.include);
    if (selectedRequestLines.length === 0) {
      toast({
        title: 'Select parts first',
        description: 'Check the parts/request lines that should go to the Vendor PO page.',
        variant: 'destructive',
      });
      return;
    }

    const vendors = [...new Set(selectedRequestLines.map((line) => line.supplier || 'Unassigned vendor'))].sort();
    if (vendors.length !== 1 || vendors[0] === 'Unassigned vendor') {
      toast({
        title: 'Choose one vendor',
        description: 'Select checked lines for a single vendor before creating a Vendor PO draft.',
        variant: 'destructive',
      });
      return;
    }

    const payload = {
      source: 'draft-bom',
      draftId: draft.id,
      draftName: draft.name,
      revision: draft.revision,
      project: draft.project,
      projectId: draft.projectId,
      projectType: draft.projectType,
      createdAt: new Date().toISOString(),
      vendors,
      lines: selectedRequestLines
        .slice()
        .sort((a, b) => (a.supplier || '').localeCompare(b.supplier || '') || (a.description || '').localeCompare(b.description || ''))
        .map((line) => ({
          id: line.id,
          vendor: line.supplier || '',
          supplierPartNumber: line.supplierItemId || '',
          manufacturer: line.manufacturer || '',
          description: line.description || '',
          estimatedCost: asNumber(line.unitCost),
          actualCost: asNumber(line.actualCost ?? ''),
          quantity: asNumber(line.qtyNeeded),
          service: line.service === true,
          agPartNumber: line.agPartNumber || '',
          status: line.status,
          note: line.note || '',
        })),
    };

    window.localStorage.setItem(VENDOR_PO_HANDOFF_KEY, JSON.stringify(payload));
    toast({
      title: 'Vendor PO handoff ready',
      description: `${selectedRequestLines.length} line(s) grouped by ${vendors.length} vendor(s).`,
    });
    setLocation('/vendor-pos?draftBomHandoff=1');
  }

  function showHandoffToast(target: 'RFQ package' | 'PO draft' | 'parts request' | 'inventory items' | 'assembly tree') {
    toast({
      title: `${selectedLines.length} line(s) ready`,
      description: `The ${target} handoff is staged in the UI and ready for backend wiring.`,
    });
  }

  function pushActiveTabTo(target: 'rom' | 'p2-project' | 'rd-project') {
    const payload = {
      source: 'draft-builder',
      draftId: draft.id,
      draftName: draft.name,
      revision: draft.revision,
      project: draft.project,
      projectId: draft.projectId,
      projectCode: draft.projectCode,
      projectName: draft.projectName,
      projectType: draft.projectType,
      tabId: activeWorkspaceTab,
      tabLabel: workspaceTabLabel(activeWorkspaceTab),
      createdAt: new Date().toISOString(),
      draft,
    };
    window.localStorage.setItem(DRAFT_TAB_HANDOFF_KEY, JSON.stringify(payload));

    if (target === 'rom') {
      toast({ title: 'Tab pushed to ROM Builder', description: `${workspaceTabLabel(activeWorkspaceTab)} is ready for ROM import.` });
      setLocation(`/rfq-builder?draftBuilderHandoff=1&draftId=${encodeURIComponent(draft.id)}&tab=${encodeURIComponent(activeWorkspaceTab)}`);
      return;
    }

    if (target === 'p2-project') {
      if (draft.projectType !== 'P2_PROJECT' || !draft.projectId) {
        toast({
          title: 'Link a P2 project first',
          description: 'Select a P2 project before pushing this tab to a P2 project folder.',
          variant: 'destructive',
        });
        return;
      }
      toast({ title: 'Tab pushed to P2 project', description: `${workspaceTabLabel(activeWorkspaceTab)} is ready in the project context.` });
      setLocation(`/projects/${draft.projectId}?draftBuilderHandoff=1&tab=${encodeURIComponent(activeWorkspaceTab)}`);
      return;
    }

    toast({ title: 'Tab pushed to R&D projects', description: `${workspaceTabLabel(activeWorkspaceTab)} is ready for R&D project attachment.` });
    setLocation(`/rd-projects?draftBuilderHandoff=1&draftId=${encodeURIComponent(draft.id)}&tab=${encodeURIComponent(activeWorkspaceTab)}`);
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

  function openDraftFromLibrary(nextDraft: BomDraft) {
    applyDraftSelection(nextDraft);
    setIsLibraryView(false);
  }

  function openCreateDraftPrompt() {
    setNewDraftProjectMode(combinedProjectOptions.length > 0 ? 'existing' : 'temporary');
    setNewDraftProjectValue(combinedProjectOptions[0]?.value ?? '');
    setNewDraftProjectName('');
    setNewDraftName('');
    setIsCreateDraftOpen(true);
  }

  function createDraftFromPrompt() {
    let nextDraft: BomDraft;

    if (newDraftProjectMode === 'existing') {
      const selectedProject = combinedProjectOptions.find((project) => project.value === newDraftProjectValue);
      if (!selectedProject) {
        toast({
          title: 'Select a project',
          description: 'Choose an existing project or create a temporary project draft.',
          variant: 'destructive',
        });
        return;
      }
      nextDraft = createBlankDraftForProject(selectedProject);
    } else {
      const projectName = newDraftProjectName.trim();
      if (!projectName) {
        toast({
          title: 'Project name required',
          description: 'Name the temporary project before creating the draft.',
          variant: 'destructive',
        });
        return;
      }
      nextDraft = createBlankDraftForTemporaryProject(projectName);
    }

    const cleanDraftName = newDraftName.trim();
    if (cleanDraftName) {
      nextDraft = { ...nextDraft, name: cleanDraftName };
    }

    applyDraftSelection(nextDraft);
    setSelectedDraftId('');
    setIsLibraryView(false);
    setIsCreateDraftOpen(false);
  }

  const createDraftSheet = (
    <Sheet open={isCreateDraftOpen} onOpenChange={setIsCreateDraftOpen}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[520px]">
        <SheetHeader>
          <SheetTitle>Create draft BOM</SheetTitle>
          <SheetDescription>
            Start from an existing project or create a temporary project draft that can be linked later.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-5">
          <div className="grid gap-2">
            <Label>Project source</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant={newDraftProjectMode === 'existing' ? 'default' : 'outline'}
                className="justify-start"
                onClick={() => setNewDraftProjectMode('existing')}
                disabled={combinedProjectOptions.length === 0}
              >
                <FolderOpen className="mr-2 h-4 w-4" />
                Existing project
              </Button>
              <Button
                type="button"
                variant={newDraftProjectMode === 'temporary' ? 'default' : 'outline'}
                className="justify-start"
                onClick={() => setNewDraftProjectMode('temporary')}
              >
                <FilePlus className="mr-2 h-4 w-4" />
                New temporary project
              </Button>
            </div>
          </div>

          {newDraftProjectMode === 'existing' ? (
            <div className="grid gap-1.5">
              <Label htmlFor="new-draft-project">Project</Label>
              <Select value={newDraftProjectValue} onValueChange={setNewDraftProjectValue}>
                <SelectTrigger id="new-draft-project">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__new_rd_projects_header__" disabled>
                    R&D Projects
                  </SelectItem>
                  {rdProjectOptions.length === 0 ? (
                    <SelectItem value="__new_no_rd_projects__" disabled>
                      No R&D projects
                    </SelectItem>
                  ) : (
                    rdProjectOptions.map((project) => (
                      <SelectItem key={`new-rd-${project.id}`} value={`${RD_PROJECT_VALUE_PREFIX}${project.id}`}>
                        {project.projectName}
                      </SelectItem>
                    ))
                  )}
                  <SelectItem value="__new_p2_projects_header__" disabled>
                    P2 Projects
                  </SelectItem>
                  {projectsLoading ? (
                    <SelectItem value="__new_projects_loading__" disabled>
                      Loading P2 projects...
                    </SelectItem>
                  ) : projectOptions.length === 0 ? (
                    <SelectItem value="__new_no_p2_projects__" disabled>
                      No P2 projects
                    </SelectItem>
                  ) : (
                    projectOptions.map((project) => (
                      <SelectItem key={`new-p2-${project.id}`} value={`${P2_PROJECT_VALUE_PREFIX}${project.id}`}>
                        {projectLabel(project)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="new-draft-project-name">Temporary project name</Label>
              <Input
                id="new-draft-project-name"
                value={newDraftProjectName}
                onChange={(event) => setNewDraftProjectName(event.target.value)}
                placeholder="Project name"
              />
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="new-draft-name">Draft name</Label>
            <Input
              id="new-draft-name"
              value={newDraftName}
              onChange={(event) => setNewDraftName(event.target.value)}
              placeholder="Defaults to the project name"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsCreateDraftOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={createDraftFromPrompt}>
              <Plus className="mr-2 h-4 w-4" />
              Create draft
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );

  if (isLibraryView) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-[1800px] space-y-5 p-4 lg:p-6">
          <section className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-7 w-7 text-teal-700" aria-hidden="true" />
                <h1 className="text-2xl font-semibold tracking-normal text-slate-950">Draft Builder</h1>
                <Badge variant="outline" className="border-teal-300 bg-teal-50 text-teal-800">
                  Shared drafts
                </Badge>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Open a draft by project, or create a new draft for an existing or temporary project.
              </p>
            </div>
            <Button type="button" onClick={openCreateDraftPrompt}>
              <Plus className="mr-2 h-4 w-4" />
              Create draft
            </Button>
          </section>

          {draftProjectGroups.length === 0 ? (
            <section className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
              <FilePlus className="mx-auto h-10 w-10 text-slate-400" aria-hidden="true" />
              <h2 className="mt-4 text-lg font-semibold text-slate-950">No draft BOMs yet</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">
                Create the first shared draft BOM so other users with Draft Builder access can view it.
              </p>
              <Button type="button" className="mt-5" onClick={openCreateDraftPrompt}>
                <Plus className="mr-2 h-4 w-4" />
                Create draft
              </Button>
            </section>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {draftProjectGroups.map((group) => (
                <Card key={group.key} className="overflow-hidden rounded-lg">
                  <CardHeader className="border-b border-slate-100 bg-white">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">{group.label}</CardTitle>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge variant="secondary">{group.projectType}</Badge>
                          <Badge variant="outline">{group.drafts.length} draft{group.drafts.length === 1 ? '' : 's'}</Badge>
                        </div>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => openDraftFromLibrary(group.drafts[0])}>
                        <FolderOpen className="mr-2 h-4 w-4" />
                        Open latest
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 p-4">
                    {group.drafts.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="block w-full rounded-md border border-slate-200 bg-white p-3 text-left transition hover:border-teal-300 hover:bg-teal-50"
                        onClick={() => openDraftFromLibrary(item)}
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-slate-950">{item.name}</div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                              <span>{item.revision || 'Draft'}</span>
                              <span>{item.lines.length} line{item.lines.length === 1 ? '' : 's'}</span>
                              <span>{draftSavedBomCount(item)} BOM{draftSavedBomCount(item) === 1 ? '' : 's'}</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1">
                              {item.visibility === 'private' ? <Lock className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                              {draftVisibilityLabel(item)}
                            </span>
                            {item.createdByDisplayName ? (
                              <span className="inline-flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                Created by {item.createdByDisplayName}
                              </span>
                            ) : null}
                            {item.updatedByDisplayName ? (
                              <span className="inline-flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                Updated by {item.updatedByDisplayName}
                              </span>
                            ) : null}
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDraftUpdatedAt(item.updatedAt)}
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
        {createDraftSheet}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1800px] space-y-4 p-4 lg:p-6">
        <section className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-7 w-7 text-teal-700" aria-hidden="true" />
              <h1 className="text-2xl font-semibold tracking-normal text-slate-950">Draft Builder</h1>
              <Badge variant="outline" className="border-orange-300 bg-orange-50 text-orange-800">
                Spreadsheet style
              </Badge>
              <Badge variant={draft.visibility === 'private' ? 'secondary' : 'outline'}>
                {draftVisibilityLabel(draft)}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Draft reusable BOMs, select sourcing lines, and prepare RFQ or order picklists from one working grid.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Created by {draft.createdByDisplayName || 'unknown'}{canEditActiveDraft ? '' : ' - view only'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="flex min-w-[280px] flex-col gap-1.5">
              <Label htmlFor="active-project">Project</Label>
              <Select value={selectedProjectValue} onValueChange={updateDraftProject} disabled={!effectiveEditMode}>
                <SelectTrigger id="active-project" className="bg-white">
                  <SelectValue placeholder="Select an R&D or P2 project" />
                </SelectTrigger>
                <SelectContent>
                  {draft.projectType === 'R_AND_D' && !draft.projectId ? (
                    <SelectItem value={LEGACY_R_AND_D_PROJECT_VALUE}>R&D</SelectItem>
                  ) : null}
                  <SelectItem value="__rd_projects_header__" disabled>
                    R&D Projects
                  </SelectItem>
                  {rdProjectOptions.length === 0 ? (
                    <SelectItem value="__no_rd_projects__" disabled>
                      No R&D projects
                    </SelectItem>
                  ) : (
                    rdProjectOptions.map((project) => (
                      <SelectItem key={`rd-${project.id}`} value={`${RD_PROJECT_VALUE_PREFIX}${project.id}`}>
                        {project.projectName}
                      </SelectItem>
                    ))
                  )}
                  <SelectItem value="__p2_projects_header__" disabled>
                    P2 Projects
                  </SelectItem>
                  {projectsLoading ? (
                    <SelectItem value="__projects_loading__" disabled>
                      Loading P2 projects...
                    </SelectItem>
                  ) : projectOptions.length === 0 ? (
                    <SelectItem value="__no_p2_projects__" disabled>
                      No P2 projects
                    </SelectItem>
                  ) : (
                    projectOptions.map((project) => (
                      <SelectItem key={`p2-${project.id}`} value={`${P2_PROJECT_VALUE_PREFIX}${project.id}`}>
                        {projectLabel(project)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm">
                <Switch
                  id="draft-edit-mode"
                  checked={effectiveEditMode}
                  onCheckedChange={setIsEditMode}
                  aria-label="Toggle draft editing"
                  disabled={!canEditActiveDraft}
                />
                <Label htmlFor="draft-edit-mode" className="cursor-pointer">
                  Editing
                </Label>
              </div>
              <Button type="button" variant="outline" onClick={() => setIsDetailsOpen(true)}>
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                BOM details
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsLibraryView(true)}>
                <FolderOpen className="mr-2 h-4 w-4" />
                Draft library
              </Button>
              <Button type="button" variant="outline" onClick={openCreateDraftPrompt} disabled={!effectiveEditMode}>
                <Plus className="mr-2 h-4 w-4" />
                New draft
              </Button>
              <Button variant="outline" onClick={selectOrderable} disabled={!effectiveEditMode}>
                <Filter className="mr-2 h-4 w-4" />
                Select orderable
              </Button>
              <Button variant="outline" onClick={saveDraft} disabled={!effectiveEditMode}>
                <Save className="mr-2 h-4 w-4" />
                Save draft
              </Button>
              <Button onClick={markSelectedFinalized} disabled={!effectiveEditMode || selectedLines.length === 0 || isFinalizingParts}>
                <Check className="mr-2 h-4 w-4" />
                {isFinalizingParts ? 'Finalizing...' : 'Finalize to inventory'}
              </Button>
            </div>
          </div>
        </section>
        {createDraftSheet}

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
                    disabled={!effectiveEditMode}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="draft-revision">Revision</Label>
                    <Input
                      id="draft-revision"
                      value={draft.revision}
                      onChange={(event) => setDraft((current) => ({ ...current, revision: event.target.value }))}
                      disabled={!effectiveEditMode}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="draft-project">Project</Label>
                    <Select value={selectedProjectValue} onValueChange={updateDraftProject} disabled={!effectiveEditMode}>
                      <SelectTrigger id="draft-project">
                        <SelectValue placeholder={draft.project || 'Select an R&D or P2 project'} />
                      </SelectTrigger>
                      <SelectContent>
                        {draft.projectType === 'R_AND_D' && !draft.projectId ? (
                          <SelectItem value={LEGACY_R_AND_D_PROJECT_VALUE}>R&D</SelectItem>
                        ) : null}
                        <SelectItem value="__details_rd_projects_header__" disabled>
                          R&D Projects
                        </SelectItem>
                        {rdProjectOptions.length === 0 ? (
                          <SelectItem value="__details_no_rd_projects__" disabled>
                            No R&D projects
                          </SelectItem>
                        ) : (
                          rdProjectOptions.map((project) => (
                            <SelectItem key={`details-rd-${project.id}`} value={`${RD_PROJECT_VALUE_PREFIX}${project.id}`}>
                              {project.projectName}
                            </SelectItem>
                          ))
                        )}
                        <SelectItem value="__details_p2_projects_header__" disabled>
                          P2 Projects
                        </SelectItem>
                        {projectsLoading ? (
                          <SelectItem value="__projects_loading__" disabled>
                            Loading P2 projects...
                          </SelectItem>
                        ) : projectOptions.length === 0 ? (
                          <SelectItem value="__details_no_p2_projects__" disabled>
                            No P2 projects
                          </SelectItem>
                        ) : (
                          projectOptions.map((project) => (
                            <SelectItem key={`details-p2-${project.id}`} value={`${P2_PROJECT_VALUE_PREFIX}${project.id}`}>
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
                    disabled={!effectiveEditMode}
                  />
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Label>Draft access</Label>
                      <p className="mt-1 text-xs text-slate-500">
                        Created by {draft.createdByDisplayName || 'unknown'}. Public drafts are visible to users with Draft Builder access.
                      </p>
                    </div>
                    <Badge variant={draft.visibility === 'private' ? 'secondary' : 'outline'}>
                      {draftVisibilityLabel(draft)}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="draft-visibility">Visibility</Label>
                      <Select
                        value={draft.visibility ?? 'public'}
                        onValueChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            visibility: value as 'public' | 'private',
                            allowPublicEdit: value === 'private' ? false : current.allowPublicEdit,
                          }))
                        }
                        disabled={!canManageActiveDraftAccess}
                      >
                        <SelectTrigger id="draft-visibility">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="public">Public - visible to Draft Builder users</SelectItem>
                          <SelectItem value="private">Private - creator only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <label className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                      <span>
                        <span className="block font-medium text-slate-800">Allow public edits</span>
                        <span className="block text-xs text-slate-500">Off means other users can view but not edit.</span>
                      </span>
                      <Switch
                        checked={draft.allowPublicEdit === true}
                        onCheckedChange={(checked) => setDraft((current) => ({ ...current, allowPublicEdit: checked === true }))}
                        disabled={!canManageActiveDraftAccess || draft.visibility === 'private'}
                        aria-label="Allow other users to edit this public draft"
                      />
                    </label>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="draft-notes">Notes</Label>
                  <Textarea
                    id="draft-notes"
                    value={draft.notes}
                    onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                    rows={3}
                    disabled={!effectiveEditMode}
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
                <SummaryMetric label="Direct Labor Estimate" value={money(totals.laborTotal)} />
                <SummaryMetric label="Direct Labor Hours" value={totals.laborHours.toLocaleString(undefined, { maximumFractionDigits: 2 })} />
                <SummaryMetric label="NRC Estimate" value={money(totals.nrcTotal)} />
                <SummaryMetric label="Selected for RFQ / Order" value={money(totals.selectedTotal)} />
                <SummaryMetric label="On Hand Value" value={money(totals.onHandTotal)} />
                <SummaryMetric label="Needs Quote Count" value={String(totals.needsQuote)} />
                <SummaryMetric label="RFQ Sent Count" value={String(totals.rfqSent)} />
                <SummaryMetric label="Line Count" value={String(totals.lineCount)} />
              </dl>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Custom Columns</h2>
              <p className="mt-1 text-sm text-slate-600">
                Columns added here are available anywhere this draft shows BOM lines.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input
                  value={newColumnName}
                  onChange={(event) => setNewColumnName(event.target.value)}
                  placeholder="New column name"
                  disabled={!effectiveEditMode}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addCustomColumn();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addCustomColumn} disabled={!effectiveEditMode || !newColumnName.trim()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add column
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {customColumns.length === 0 ? (
                  <span className="text-sm text-slate-500">No custom columns yet.</span>
                ) : (
                  customColumns.map((columnName) => (
                    <Badge key={columnName} variant="secondary">
                      {columnName}
                    </Badge>
                  ))
                )}
              </div>
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

            <div className="rounded-lg border border-red-200 bg-red-50 p-4 shadow-sm">
              <div className="flex flex-col gap-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-red-800">Draft Actions</h2>
                  <p className="mt-1 text-sm text-red-700">
                    Reset this draft tab or remove the saved draft BOM from the selector.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={clearCurrentDraft}
                    disabled={!effectiveEditMode}
                    className="border-red-300 bg-white text-red-700 hover:bg-red-100 hover:text-red-800"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Clear and start over
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={deleteCurrentDraft}
                    disabled={!selectedDraftId || draft.id === PRIVATEER_DRAFT_ID}
                    className="border-red-300 bg-white text-red-700 hover:bg-red-100 hover:text-red-800"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete draft
                  </Button>
                </div>
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
                <Button type="button" variant="outline" size="sm" onClick={() => pushActiveTabTo('rom')}>
                  <Send className="mr-2 h-4 w-4" />
                  Push tab to ROM
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => pushActiveTabTo('p2-project')}>
                  <FolderOpen className="mr-2 h-4 w-4" />
                  Push tab to P2
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => pushActiveTabTo('rd-project')}>
                  <FolderOpen className="mr-2 h-4 w-4" />
                  Push tab to R&D
                </Button>
                {activeWorkspaceTab === 'parts-request' ? (
                  <label className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm">
                    <Checkbox
                      checked={allPartsRequestVisibleSelected ? true : somePartsRequestVisibleSelected ? 'indeterminate' : false}
                      onCheckedChange={(checked) =>
                        setAllPartsRequestIncluded(partsRequestLines.map((line) => line.id), checked === true)
                      }
                      disabled={partsRequestLines.length === 0}
                      aria-label="Select all visible parts/request lines"
                    />
                    <span>Select all</span>
                    <span className="text-xs tabular-nums text-slate-500">
                      {partsRequestSelectedCount}/{partsRequestLines.length}
                    </span>
                  </label>
                ) : null}
                {activeWorkspaceTab === 'po-draft' ? (
                  <ColumnSelectionMenu
                    columns={(Object.keys(poColumnLabels) as PoColumnId[]).map((id) => ({ id, label: poColumnLabels[id] }))}
                    visibleColumns={visiblePoColumns}
                    onToggle={(columnId, checked) => togglePoColumn(columnId as PoColumnId, checked)}
                  />
                ) : null}
                {activeWorkspaceTab === 'parts-request' ? (
                  <ColumnSelectionMenu
                    columns={(Object.keys(partsRequestColumnLabels) as PartsRequestColumnId[]).map((id) => ({
                      id,
                      label: partsRequestColumnLabels[id],
                    }))}
                    visibleColumns={visiblePartsRequestColumns}
                    onToggle={(columnId, checked) => togglePartsRequestColumn(columnId as PartsRequestColumnId, checked)}
                  />
                ) : null}
                {activeWorkspaceTab === 'direct-labor' ? (
                  <ColumnSelectionMenu
                    columns={(Object.keys(directLaborColumnLabels) as DirectLaborColumnId[]).map((id) => ({
                      id,
                      label: directLaborColumnLabels[id],
                    }))}
                    visibleColumns={visibleDirectLaborColumns}
                    onToggle={(columnId, checked) => toggleDirectLaborColumn(columnId as DirectLaborColumnId, checked)}
                  />
                ) : null}
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
                  customColumns={customColumns}
                  onDescriptionChange={setPoDescription}
                  onCreateLine={createLineFromPoDescription}
                  onToggleColumn={togglePoColumn}
                  onUpdateCustomField={updateLineCustomField}
                  onGeneratePoDraft={() => showHandoffToast('PO draft')}
                  onCreateDraftBom={startDraftBomForLine}
                  onDeleteLine={deleteLine}
                  isEditMode={effectiveEditMode}
                />
              </TabsContent>
            ) : null}

            {visibleWorkspaceTabs.includes('parts-request') ? (
              <TabsContent value="parts-request" className="mt-4">
                <PartsRequestWorkspace
                  lines={partsRequestLines}
                  visibleColumns={visiblePartsRequestColumns}
                  customColumns={customColumns}
                  description={partsRequestDescription}
                  matches={partsRequestMatches}
                  onDescriptionChange={setPartsRequestDescription}
                  onCreateLine={createLineFromPartsRequestDescription}
                  onUpdateLine={updateLine}
                  onUpdateCustomField={updateLineCustomField}
                  onUpdateNumberLine={(id, field, value) => updateLine(id, { [field]: value === '' ? '' : Number(value) } as Partial<BomLine>)}
                  onImportCsv={importPartsRequestCsv}
                  onCreateVendorPoDraft={createVendorPoHandoff}
                  onFinalizeSelected={markSelectedFinalized}
                  onDeleteLine={deleteLine}
                  isEditMode={effectiveEditMode}
                  isFinalizingParts={isFinalizingParts}
                />
              </TabsContent>
            ) : null}

            {visibleWorkspaceTabs.includes('direct-labor') ? (
              <TabsContent value="direct-labor" className="mt-4">
                <DirectLaborEstimateWorkspace
                  lines={draft.laborEstimateLines ?? []}
                  visibleColumns={visibleDirectLaborColumns}
                  departments={laborDepartments}
                  newDepartmentName={newLaborDepartmentName}
                  totalCost={totals.laborTotal}
                  totalHours={totals.laborHours}
                  onNewDepartmentNameChange={setNewLaborDepartmentName}
                  onAddDepartment={addLaborDepartment}
                  onAddLine={addLaborEstimateLine}
                  onRemoveLine={removeLaborEstimateLine}
                  onUpdateLine={updateLaborEstimateLine}
                  onUpdateNumberLine={updateLaborEstimateNumberLine}
                  isEditMode={effectiveEditMode}
                />
              </TabsContent>
            ) : null}

            {visibleWorkspaceTabs.includes('nrc') ? (
              <TabsContent value="nrc" className="mt-4">
                <NrcEstimateWorkspace
                  rows={draft.nrcRows ?? []}
                  totalCost={totals.nrcTotal}
                  customerFacingTotal={totals.customerFacingNrcTotal}
                  onAddRow={addNrcRow}
                  onRemoveRow={removeNrcRow}
                  onUpdateRow={updateNrcRow}
                  onUpdateNumberRow={updateNrcNumberRow}
                  isEditMode={effectiveEditMode}
                />
              </TabsContent>
            ) : null}

            {visibleWorkspaceTabs.includes('bom-wizard') ? (
              <TabsContent value="bom-wizard" className="mt-4">
                <DraftBomWizardWorkspace
                  draftLines={draft.lines}
                  savedDraftBoms={draft.savedDraftBoms ?? []}
                  inventoryItems={activeInventoryItems}
                  departmentOptions={bomDepartmentOptions}
                  seedLineId={wizardSeedLineId}
                  onSeedLineConsumed={() => setWizardSeedLineId(null)}
                  onSaveWizardBom={saveWizardBom}
                  onDeleteWizardBom={deleteWizardBom}
                  isEditMode={effectiveEditMode}
                />
              </TabsContent>
            ) : null}

            {visibleWorkspaceTabs.includes('assembly-tree') ? (
              <TabsContent value="assembly-tree" className="mt-4">
                <AssemblyTreeWorkspace tree={assemblyTree} />
              </TabsContent>
            ) : null}

            {visibleWorkspaceTabs
              .filter((tabId) => tabId.startsWith('custom:'))
              .map((tabId) => (
                <TabsContent key={tabId} value={tabId} className="mt-4">
                  <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-200 p-4">
                      <h2 className="font-semibold text-slate-950">{workspaceTabLabel(tabId)}</h2>
                      <p className="mt-1 text-sm text-slate-600">
                        Use the draft-level custom columns against every BOM line.
                      </p>
                    </div>
                    <CustomColumnLineTable
                      lines={draft.lines}
                      customColumns={customColumns}
                      onUpdateCustomField={updateLineCustomField}
                      isEditMode={effectiveEditMode}
                    />
                  </section>
                </TabsContent>
              ))}
          </Tabs>
        </section>
      </div>
    </main>
  );
}

function ColumnSelectionMenu({
  columns,
  visibleColumns,
  onToggle,
}: {
  columns: { id: string; label: string }[];
  visibleColumns: string[];
  onToggle: (columnId: string, checked: boolean) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline">
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[240px]" align="end">
        <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={visibleColumns.includes(column.id)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) => onToggle(column.id, checked === true)}
          >
            {column.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
  onDescriptionChange,
  onCreateLine,
  onToggleColumn,
  onUpdateCustomField,
  onGeneratePoDraft,
  onCreateDraftBom,
  onDeleteLine,
  isEditMode,
}: {
  lines: BomLine[];
  description: string;
  matches: InventoryItemOption[];
  visibleColumns: PoColumnId[];
  customColumns: string[];
  onDescriptionChange: (value: string) => void;
  onCreateLine: (item?: InventoryItemOption) => void;
  onToggleColumn: (columnId: PoColumnId, checked: boolean) => void;
  onUpdateCustomField: (lineId: string, columnName: string, value: string) => void;
  onGeneratePoDraft: () => void;
  onCreateDraftBom: (lineId: string) => void;
  onDeleteLine: (lineId: string) => void;
  isEditMode: boolean;
}) {
  const typedDescription = description.trim();
  const totalColumns = 4 + visibleColumns.length + customColumns.length;

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
                disabled={!isEditMode}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onCreateLine(matches[0]);
                  }
                }}
              />
              <Button type="button" onClick={() => onCreateLine(matches[0])} disabled={!isEditMode || !typedDescription}>
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
                          disabled={!isEditMode}
                        >
                          <span className="block font-medium text-slate-950">{item.name || item.description || 'Inventory item'}</span>
                          <span className="mt-1 block text-xs text-slate-500">
                            {[item.agPartNumber, item.source || item.supplier].filter(Boolean).join(' - ') || `Item #${item.id}`}
                          </span>
                        </button>
                      ))}
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => onCreateLine()} disabled={!isEditMode}>
                      Create draft part instead
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-slate-600">No inventory match found.</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => onCreateLine()} disabled={!isEditMode}>
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
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Visible PO Fields</h3>
          <p className="text-sm text-slate-600">Show or hide standard PO draft fields.</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          {(Object.keys(poColumnLabels) as PoColumnId[]).map((columnId) => (
            <label key={columnId} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
              <Checkbox
                checked={visibleColumns.includes(columnId)}
                onCheckedChange={(checked) => onToggleColumn(columnId, checked === true)}
                disabled={!isEditMode}
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
                <TableHead className="w-[120px]">BOMs</TableHead>
                <TableHead className="w-[72px] text-right">Delete</TableHead>
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
                          disabled={!isEditMode}
                        />
                      </TableCell>
                    ))}
                    <TableCell>
                      <Badge variant={line.inventoryItemId ? 'outline' : 'secondary'}>
                        {line.inventoryItemId ? 'Inventory' : 'Draft part'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button type="button" variant="outline" size="sm" onClick={() => onCreateDraftBom(line.id)} disabled={!isEditMode}>
                        <Layers className="mr-2 h-4 w-4" />
                        {line.childDraftBoms?.length ? `${line.childDraftBoms.length} BOM` : 'BOM'}
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => onDeleteLine(line.id)}
                        disabled={!isEditMode}
                        title="Delete line"
                        aria-label={`Delete ${line.description || 'draft line'}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
  if (columnId === 'source') return line.inventoryItemId ? `Inventory #${line.inventoryItemId}` : 'Draft part';
  return '-';
}

function partsRequestColumnLabel(columnId: PartsRequestTableColumnId) {
  if (columnId === 'include') return 'Include';
  if (columnId === 'description') return 'Part description';
  if (columnId.startsWith('custom:')) return columnId.slice('custom:'.length);
  return partsRequestColumnLabels[columnId as PartsRequestColumnId];
}

function partsRequestColumnValue(line: BomLine, columnId: PartsRequestTableColumnId): string | number {
  if (columnId === 'include') return line.include ? 'yes' : 'no';
  if (columnId === 'description') return line.description || '';
  if (columnId === 'supplier') return line.supplier || '';
  if (columnId === 'supplierItemId') return line.supplierItemId || '';
  if (columnId === 'manufacturer') return line.manufacturer || '';
  if (columnId === 'unitCost') return line.unitCost === '' ? '' : asNumber(line.unitCost);
  if (columnId === 'actualCost') return line.actualCost === '' ? '' : asNumber(line.actualCost);
  if (columnId === 'qtyNeeded') return line.qtyNeeded === '' ? '' : asNumber(line.qtyNeeded);
  if (columnId === 'service') return line.service ? 'yes' : 'no';
  if (columnId === 'agPartNumber') return line.agPartNumber || '';
  if (columnId === 'status') return line.status || '';
  if (columnId.startsWith('custom:')) return line.customFields?.[columnId.slice('custom:'.length)] ?? '';
  return '';
}

function comparePartsRequestValues(a: string | number, b: string | number) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function PartsRequestWorkspace({
  lines,
  visibleColumns,
  customColumns,
  description,
  matches,
  onDescriptionChange,
  onCreateLine,
  onUpdateLine,
  onUpdateCustomField,
  onUpdateNumberLine,
  onImportCsv,
  onCreateVendorPoDraft,
  onFinalizeSelected,
  onDeleteLine,
  isEditMode,
  isFinalizingParts,
}: {
  lines: BomLine[];
  visibleColumns: PartsRequestColumnId[];
  customColumns: string[];
  description: string;
  matches: InventoryItemOption[];
  onDescriptionChange: (value: string) => void;
  onCreateLine: (item?: InventoryItemOption) => void;
  onUpdateLine: (id: string, patch: Partial<BomLine>) => void;
  onUpdateCustomField: (lineId: string, columnName: string, value: string) => void;
  onUpdateNumberLine: (id: string, field: 'unitCost' | 'actualCost' | 'qtyNeeded', value: string) => void;
  onImportCsv: (file: File, linkInventoryMatches: boolean) => Promise<void>;
  onCreateVendorPoDraft: () => void;
  onFinalizeSelected: () => Promise<void>;
  onDeleteLine: (lineId: string) => void;
  isEditMode: boolean;
  isFinalizingParts: boolean;
}) {
  const typedDescription = description.trim();
  const selectedCount = lines.filter((line) => line.include).length;
  const totalColumns = 3 + visibleColumns.length + customColumns.length;
  const [linkInventoryMatches, setLinkInventoryMatches] = useState(false);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [sortState, setSortState] = useState<PartsRequestSortState>(null);
  const tableColumns = useMemo<PartsRequestTableColumnId[]>(
    () => [
      'include',
      'description',
      ...visibleColumns,
      ...customColumns.map((columnName) => `custom:${columnName}` as PartsRequestTableColumnId),
    ],
    [customColumns, visibleColumns],
  );
  const activeFilterCount = Object.values(columnFilters).filter((value) => value.trim()).length + (searchQuery.trim() ? 1 : 0);
  const displayedLines = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filters = Object.entries(columnFilters)
      .map(([columnId, value]) => [columnId as PartsRequestTableColumnId, value.trim().toLowerCase()] as const)
      .filter(([, value]) => value);
    const filtered = lines.filter((line) => {
      if (query && !tableColumns.some((columnId) => String(partsRequestColumnValue(line, columnId)).toLowerCase().includes(query))) {
        return false;
      }
      return filters.every(([columnId, value]) => String(partsRequestColumnValue(line, columnId)).toLowerCase().includes(value));
    });

    if (!sortState) return filtered;
    return [...filtered].sort((a, b) => {
      const comparison = comparePartsRequestValues(
        partsRequestColumnValue(a, sortState.columnId),
        partsRequestColumnValue(b, sortState.columnId),
      );
      if (comparison !== 0) return sortState.direction === 'asc' ? comparison : -comparison;
      return (a.description || '').localeCompare(b.description || '', undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [columnFilters, lines, searchQuery, sortState, tableColumns]);

  function updateColumnFilter(columnId: PartsRequestTableColumnId, value: string) {
    setColumnFilters((current) => {
      const next = { ...current };
      if (value.trim()) {
        next[columnId] = value;
      } else {
        delete next[columnId];
      }
      return next;
    });
  }

  function toggleSort(columnId: PartsRequestTableColumnId) {
    setSortState((current) => {
      if (!current || current.columnId !== columnId) return { columnId, direction: 'asc' };
      if (current.direction === 'asc') return { columnId, direction: 'desc' };
      return null;
    });
  }

  function sortableHeader(columnId: PartsRequestTableColumnId, className?: string) {
    const isActive = sortState?.columnId === columnId;
    return (
      <TableHead key={columnId} className={className}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('h-8 px-1 font-semibold', className?.includes('text-right') && 'ml-auto')}
          onClick={() => toggleSort(columnId)}
        >
          {partsRequestColumnLabel(columnId)}
          <ArrowUpDown className={cn('ml-1 h-3.5 w-3.5', isActive ? 'text-blue-600' : 'text-slate-400')} />
          {isActive ? <span className="ml-1 text-xs text-blue-700">{sortState.direction === 'asc' ? 'Asc' : 'Desc'}</span> : null}
        </Button>
      </TableHead>
    );
  }

  async function handleCsvFileChange(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setIsImportingCsv(true);
    try {
      await onImportCsv(file, linkInventoryMatches);
    } finally {
      setIsImportingCsv(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h2 className="font-semibold text-slate-950">Parts/request</h2>
              <p className="text-sm text-slate-600">
                Add draft part lines, match inventory items, then stage selected vendor lines for RFQ or Vendor PO creation.
              </p>
            </div>
            <div className="grid gap-2 lg:grid-cols-[minmax(280px,520px)_auto]">
              <Input
                value={description}
                onChange={(event) => onDescriptionChange(event.target.value)}
                placeholder="Part description"
                disabled={!isEditMode}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onCreateLine(matches[0]);
                  }
                }}
              />
              <Button type="button" onClick={() => onCreateLine(matches[0])} disabled={!isEditMode || !typedDescription}>
                <Plus className="mr-2 h-4 w-4" />
                Add part line
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
                          disabled={!isEditMode}
                        >
                          <span className="block font-medium text-slate-950">{item.name || item.description || 'Inventory item'}</span>
                          <span className="mt-1 block text-xs text-slate-500">
                            {[item.agPartNumber, item.source || item.supplier].filter(Boolean).join(' - ') || `Item #${item.id}`}
                          </span>
                        </button>
                      ))}
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => onCreateLine()} disabled={!isEditMode}>
                      Create draft part instead
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-slate-600">No inventory match found.</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => onCreateLine()} disabled={!isEditMode}>
                      Create draft part
                    </Button>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
              <Checkbox
                checked={linkInventoryMatches}
                onCheckedChange={(checked) => setLinkInventoryMatches(checked === true)}
                disabled={!isEditMode}
              />
              Permit inventory linking
            </label>
            <label
              className={cn(
                'inline-flex h-10 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground',
                isImportingCsv && 'pointer-events-none opacity-50',
              )}
            >
              <Upload className="mr-2 h-4 w-4" />
              {isImportingCsv ? 'Importing...' : 'Import'}
              <Input
                className="sr-only"
                type="file"
                accept=".csv,text/csv,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={!isEditMode || isImportingCsv}
                onChange={(event) => {
                  void handleCsvFileChange(event.target.files);
                  event.currentTarget.value = '';
                }}
              />
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSearchQuery('');
                setColumnFilters({});
                setSortState(null);
              }}
              disabled={activeFilterCount === 0 && !sortState}
            >
              <X className="mr-2 h-4 w-4" />
              Clear table
            </Button>
            <Button type="button" variant="outline" onClick={onCreateVendorPoDraft} disabled={selectedCount === 0}>
              <PackagePlus className="mr-2 h-4 w-4" />
              Create Vendor PO draft
            </Button>
            <Button type="button" onClick={onFinalizeSelected} disabled={!isEditMode || selectedCount === 0 || isFinalizingParts}>
              <Check className="mr-2 h-4 w-4" />
              {isFinalizingParts ? 'Finalizing...' : 'Finalize checked'}
            </Button>
          </div>
        </div>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="space-y-3 border-b border-slate-200 p-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="relative md:w-[360px]">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                className="pl-9"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search parts/request"
              />
            </div>
            <div className="text-sm text-slate-500">
              {displayedLines.length} of {lines.length} line{lines.length === 1 ? '' : 's'}
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {tableColumns.map((columnId) => (
              <div key={columnId} className="space-y-1">
                <Label className="text-xs text-slate-500">{partsRequestColumnLabel(columnId)}</Label>
                <Input
                  className="h-8"
                  value={columnFilters[columnId] ?? ''}
                  onChange={(event) => updateColumnFilter(columnId, event.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {sortableHeader('include', 'w-[112px]')}
                {sortableHeader('description', 'min-w-[300px]')}
                {visibleColumns.includes('supplier') ? sortableHeader('supplier', 'w-[160px]') : null}
                {visibleColumns.includes('supplierItemId') ? sortableHeader('supplierItemId', 'w-[170px]') : null}
                {visibleColumns.includes('manufacturer') ? sortableHeader('manufacturer', 'w-[160px]') : null}
                {visibleColumns.includes('unitCost') ? sortableHeader('unitCost', 'w-[130px] text-right') : null}
                {visibleColumns.includes('actualCost') ? sortableHeader('actualCost', 'w-[120px] text-right') : null}
                {visibleColumns.includes('qtyNeeded') ? sortableHeader('qtyNeeded', 'w-[100px] text-right') : null}
                {visibleColumns.includes('service') ? sortableHeader('service', 'w-[90px]') : null}
                {visibleColumns.includes('agPartNumber') ? sortableHeader('agPartNumber', 'w-[130px]') : null}
                {visibleColumns.includes('status') ? sortableHeader('status', 'w-[150px]') : null}
                {customColumns.map((columnName) => sortableHeader(`custom:${columnName}` as PartsRequestTableColumnId, 'min-w-[160px]'))}
                <TableHead className="w-[72px] text-right">Delete</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={totalColumns} className="h-24 text-center text-slate-500">
                    Add a part description to begin the parts/request draft.
                  </TableCell>
                </TableRow>
              ) : displayedLines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={totalColumns} className="h-24 text-center text-slate-500">
                    No parts/request lines match the current table controls.
                  </TableCell>
                </TableRow>
              ) : (
                displayedLines.map((line) => (
                  <TableRow key={line.id} className={cn(line.finalized && 'bg-emerald-50/60')}>
                    <TableCell>
                      <Checkbox
                        checked={line.include}
                        onCheckedChange={(checked) => onUpdateLine(line.id, { include: checked === true })}
                        aria-label={`Select ${line.description || 'parts/request line'}`}
                      />
                    </TableCell>
                    <EditableCell value={line.description} onChange={(value) => onUpdateLine(line.id, { description: value })} disabled={!isEditMode} wide />
                    {visibleColumns.includes('supplier') ? <EditableCell value={line.supplier} onChange={(value) => onUpdateLine(line.id, { supplier: value })} disabled={!isEditMode} /> : null}
                    {visibleColumns.includes('supplierItemId') ? <EditableCell value={line.supplierItemId} onChange={(value) => onUpdateLine(line.id, { supplierItemId: value })} disabled={!isEditMode} /> : null}
                    {visibleColumns.includes('manufacturer') ? <EditableCell value={line.manufacturer} onChange={(value) => onUpdateLine(line.id, { manufacturer: value })} disabled={!isEditMode} /> : null}
                    {visibleColumns.includes('unitCost') ? <TableCell>
                      <Input
                        className="h-9 text-right"
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitCost}
                        onChange={(event) => onUpdateNumberLine(line.id, 'unitCost', event.target.value)}
                        disabled={!isEditMode}
                      />
                    </TableCell> : null}
                    {visibleColumns.includes('actualCost') ? <TableCell>
                      <Input
                        className="h-9 text-right"
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.actualCost ?? ''}
                        onChange={(event) => onUpdateNumberLine(line.id, 'actualCost', event.target.value)}
                        disabled={!isEditMode}
                      />
                    </TableCell> : null}
                    {visibleColumns.includes('qtyNeeded') ? <TableCell>
                      <Input
                        className="h-9 text-right"
                        type="number"
                        min="0"
                        step="0.001"
                        value={line.qtyNeeded}
                        onChange={(event) => onUpdateNumberLine(line.id, 'qtyNeeded', event.target.value)}
                        disabled={!isEditMode}
                      />
                    </TableCell> : null}
                    {visibleColumns.includes('service') ? <TableCell>
                      <Checkbox
                        checked={line.service === true}
                        onCheckedChange={(checked) => onUpdateLine(line.id, { service: checked === true })}
                        aria-label={`Mark ${line.description || 'line'} as service`}
                        disabled={!isEditMode}
                      />
                    </TableCell> : null}
                    {visibleColumns.includes('agPartNumber') ? <EditableCell value={line.agPartNumber} onChange={(value) => onUpdateLine(line.id, { agPartNumber: value })} disabled={!isEditMode} /> : null}
                    {visibleColumns.includes('status') ? <TableCell>
                      <Select value={line.status} onValueChange={(value) => onUpdateLine(line.id, { status: value as BomStatus })} disabled={!isEditMode}>
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
                    </TableCell> : null}
                    {customColumns.map((columnName) => (
                      <TableCell key={columnName}>
                        <Input
                          className="h-9"
                          value={line.customFields?.[columnName] ?? ''}
                          onChange={(event) => onUpdateCustomField(line.id, columnName, event.target.value)}
                          disabled={!isEditMode}
                        />
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => onDeleteLine(line.id)}
                        disabled={!isEditMode}
                        title="Delete line"
                        aria-label={`Delete ${line.description || 'parts/request line'}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <Separator />
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs text-slate-500">
          <span>{selectedCount} checked line{selectedCount === 1 ? '' : 's'} ready for Vendor PO/RFQ or inventory finalization.</span>
          <span>Vendor PO handoff keeps draft BOM line status visible while the PO workflow owns RFQ sending.</span>
        </div>
      </section>
    </section>
  );
}

function DirectLaborEstimateWorkspace({
  lines,
  visibleColumns,
  departments,
  newDepartmentName,
  totalCost,
  totalHours,
  onNewDepartmentNameChange,
  onAddDepartment,
  onAddLine,
  onRemoveLine,
  onUpdateLine,
  onUpdateNumberLine,
  isEditMode,
}: {
  lines: DraftLaborEstimateLine[];
  visibleColumns: DirectLaborColumnId[];
  departments: { value: string; label: string }[];
  newDepartmentName: string;
  totalCost: number;
  totalHours: number;
  onNewDepartmentNameChange: (value: string) => void;
  onAddDepartment: () => void;
  onAddLine: () => void;
  onRemoveLine: (id: string) => void;
  onUpdateLine: (id: string, patch: Partial<DraftLaborEstimateLine>) => void;
  onUpdateNumberLine: (id: string, field: 'hourlyRate' | 'hoursPerPart' | 'quantityPerPo', value: string) => void;
  isEditMode: boolean;
}) {
  const totalColumns = 1 + visibleColumns.length;

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="font-semibold text-slate-950">Draft Direct Labor Estimate</h2>
            <p className="text-sm text-slate-600">
              Estimate direct labor by department, role, hourly rate, hours per part, and PO quantity.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(220px,320px)_auto_auto]">
            <Input
              value={newDepartmentName}
              onChange={(event) => onNewDepartmentNameChange(event.target.value)}
              placeholder="New department"
              disabled={!isEditMode}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onAddDepartment();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={onAddDepartment} disabled={!isEditMode || !newDepartmentName.trim()}>
              <Plus className="mr-2 h-4 w-4" />
              Add department
            </Button>
            <Button type="button" onClick={onAddLine} disabled={!isEditMode}>
              <Plus className="mr-2 h-4 w-4" />
              Add labor row
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryMetric label="Total Direct Labor" value={money(totalCost)} />
          <SummaryMetric label="Total Labor Hours" value={totalHours.toLocaleString(undefined, { maximumFractionDigits: 2 })} />
          <SummaryMetric label="Labor Rows" value={String(lines.length)} />
          <SummaryMetric label="Departments" value={String(departments.length)} />
        </div>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[220px]">Department</TableHead>
                {visibleColumns.includes('employeeRole') ? <TableHead className="min-w-[190px]">Employee role</TableHead> : null}
                {visibleColumns.includes('hourlyRate') ? <TableHead className="w-[150px] text-right">Hourly rate</TableHead> : null}
                {visibleColumns.includes('hoursPerPart') ? <TableHead className="w-[150px] text-right">Hours / part</TableHead> : null}
                {visibleColumns.includes('quantityPerPo') ? <TableHead className="w-[150px] text-right">Qty / PO</TableHead> : null}
                {visibleColumns.includes('extLabor') ? <TableHead className="w-[160px] text-right">Ext labor</TableHead> : null}
                {visibleColumns.includes('remove') ? <TableHead className="w-[70px]"></TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={totalColumns} className="h-24 text-center text-slate-500">
                    Add a labor row to begin the direct labor estimate.
                  </TableCell>
                </TableRow>
              ) : (
                lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>
                      <Select value={line.department || defaultDepartment} onValueChange={(value) => onUpdateLine(line.id, { department: value })} disabled={!isEditMode}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {departments.map((department) => (
                            <SelectItem key={department.value} value={department.value}>
                              {department.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    {visibleColumns.includes('employeeRole') ? <TableCell>
                      <Select value={line.employeeRole} onValueChange={(value) => onUpdateLine(line.id, { employeeRole: value })} disabled={!isEditMode}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          {line.employeeRole && !employeeRoleOptions.includes(line.employeeRole) ? (
                            <SelectItem value={line.employeeRole}>{line.employeeRole}</SelectItem>
                          ) : null}
                          {employeeRoleOptions.map((role) => (
                            <SelectItem key={role} value={role}>
                              {role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell> : null}
                    {visibleColumns.includes('hourlyRate') ? <TableCell>
                      <Input
                        className="h-9 text-right"
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.hourlyRate}
                        onChange={(event) => onUpdateNumberLine(line.id, 'hourlyRate', event.target.value)}
                        disabled={!isEditMode}
                      />
                    </TableCell> : null}
                    {visibleColumns.includes('hoursPerPart') ? <TableCell>
                      <Input
                        className="h-9 text-right"
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.hoursPerPart}
                        onChange={(event) => onUpdateNumberLine(line.id, 'hoursPerPart', event.target.value)}
                        disabled={!isEditMode}
                      />
                    </TableCell> : null}
                    {visibleColumns.includes('quantityPerPo') ? <TableCell>
                      <Input
                        className="h-9 text-right"
                        type="number"
                        min="0"
                        step="1"
                        value={line.quantityPerPo}
                        onChange={(event) => onUpdateNumberLine(line.id, 'quantityPerPo', event.target.value)}
                        disabled={!isEditMode}
                      />
                    </TableCell> : null}
                    {visibleColumns.includes('extLabor') ? <TableCell className="text-right font-medium tabular-nums">
                      {money(laborLineTotal(line))}
                    </TableCell> : null}
                    {visibleColumns.includes('remove') ? <TableCell>
                      <Button type="button" variant="ghost" size="sm" onClick={() => onRemoveLine(line.id)} aria-label="Remove labor row" disabled={!isEditMode}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell> : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <Separator />
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs text-slate-500">
          <span>
            Estimate formula: hourly rate x hours per part x quantity per PO.
          </span>
          <span>
            Selected departments include {departments.map((department) => department.label).slice(0, 4).join(', ')}
            {departments.length > 4 ? `, +${departments.length - 4} more` : ''}.
          </span>
        </div>
      </section>
    </section>
  );
}

const nrcCategoryOptions: { value: NrcCategory; label: string }[] = [
  { value: 'TOOLING', label: 'Tooling' },
  { value: 'NRE_LABOR', label: 'NRE Labor' },
  { value: 'CAPITAL_ASSET', label: 'Capital Asset' },
  { value: 'INSTALLATION', label: 'Installation' },
  { value: 'TRAINING', label: 'Training' },
  { value: 'OTHER', label: 'Other' },
];

const chargeTimingOptions: { value: ChargeTiming; label: string }[] = [
  { value: 'ONE_TIME', label: 'One Time' },
  { value: 'FIRST_PO_ONLY', label: 'First PO Only' },
  { value: 'FIRST_ARTICLE_ONLY', label: 'First Article Only' },
  { value: 'EVERY_ORDER', label: 'Every Order' },
];

function NrcEstimateWorkspace({
  rows,
  totalCost,
  customerFacingTotal,
  onAddRow,
  onRemoveRow,
  onUpdateRow,
  onUpdateNumberRow,
  isEditMode,
}: {
  rows: NrcCostRow[];
  totalCost: number;
  customerFacingTotal: number;
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
  onUpdateRow: (id: string, patch: Partial<NrcCostRow>) => void;
  onUpdateNumberRow: (
    id: string,
    field: 'quantity' | 'unitCost' | 'amortizationQty' | 'usefulLifeMonths' | 'installationCost' | 'trainingCost',
    value: string,
  ) => void;
  isEditMode: boolean;
}) {
  const amortizationWarnings = rows.filter((row) => row.amortized && !Number(row.amortizationQty || 0)).length;

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-semibold text-slate-950">NRC Estimate</h2>
          <p className="mt-1 text-sm text-slate-600">
            Capture tooling, NRE labor, capital assets, installation, training, and other non-recurring costs with the draft.
          </p>
        </div>
        <Button type="button" onClick={onAddRow} disabled={!isEditMode}>
          <Plus className="mr-2 h-4 w-4" />
          Add NRC
        </Button>
      </div>

      <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-3">
        <SummaryMetric label="Total NRC" value={money(totalCost)} />
        <SummaryMetric label="Customer Price NRC" value={money(customerFacingTotal)} />
        <SummaryMetric label="Amortization Warnings" value={String(amortizationWarnings)} />
      </div>

      <div className="overflow-x-auto p-4">
        <Table className="min-w-[1800px]">
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Unit Cost</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Amortized</TableHead>
              <TableHead>Amort Qty</TableHead>
              <TableHead>Timing</TableHead>
              <TableHead>Customer Price</TableHead>
              <TableHead>Internal Only</TableHead>
              <TableHead>Capital Asset Details</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Remove</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={14} className="py-8 text-center text-sm text-slate-500">
                  No NRC rows yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="align-top">
                  <TableCell>
                    <Badge variant={row.sourceType === 'DRAFT' ? 'default' : 'outline'}>
                      {row.sourceType === 'DRAFT' ? 'Draft sourced' : 'Manual'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Select value={row.category} onValueChange={(value) => onUpdateRow(row.id ?? '', { category: value as NrcCategory })} disabled={!isEditMode}>
                      <SelectTrigger className="w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {nrcCategoryOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input className="w-[220px]" value={row.description} onChange={(event) => onUpdateRow(row.id ?? '', { description: event.target.value })} disabled={!isEditMode} />
                  </TableCell>
                  <TableCell>
                    <Input className="w-[90px]" type="number" min={0} value={row.quantity} onChange={(event) => onUpdateNumberRow(row.id ?? '', 'quantity', event.target.value)} disabled={!isEditMode} />
                  </TableCell>
                  <TableCell>
                    <Input className="w-[120px]" type="number" min={0} step="0.01" value={row.unitCost} onChange={(event) => onUpdateNumberRow(row.id ?? '', 'unitCost', event.target.value)} disabled={!isEditMode} />
                  </TableCell>
                  <TableCell className="tabular-nums">{money(nrcRowTotal(row))}</TableCell>
                  <TableCell>
                    <Checkbox checked={row.amortized} onCheckedChange={(checked) => onUpdateRow(row.id ?? '', { amortized: checked === true })} disabled={!isEditMode} aria-label="Amortized NRC" />
                  </TableCell>
                  <TableCell>
                    <Input
                      className={cn('w-[110px]', row.amortized && !Number(row.amortizationQty || 0) ? 'border-amber-400' : '')}
                      type="number"
                      min={0}
                      value={row.amortizationQty ?? ''}
                      onChange={(event) => onUpdateNumberRow(row.id ?? '', 'amortizationQty', event.target.value)}
                      disabled={!isEditMode || !row.amortized}
                    />
                    {row.amortized && !Number(row.amortizationQty || 0) ? <p className="mt-1 text-xs text-amber-700">Required</p> : null}
                  </TableCell>
                  <TableCell>
                    <Select value={row.chargeTiming} onValueChange={(value) => onUpdateRow(row.id ?? '', { chargeTiming: value as ChargeTiming })} disabled={!isEditMode}>
                      <SelectTrigger className="w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {chargeTimingOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Checkbox checked={row.includeInCustomerPrice} onCheckedChange={(checked) => onUpdateRow(row.id ?? '', { includeInCustomerPrice: checked === true })} disabled={!isEditMode} aria-label="Include NRC in customer price" />
                  </TableCell>
                  <TableCell>
                    <Checkbox checked={row.internalOnly} onCheckedChange={(checked) => onUpdateRow(row.id ?? '', { internalOnly: checked === true })} disabled={!isEditMode} aria-label="Internal-only NRC" />
                  </TableCell>
                  <TableCell>
                    {row.category === 'CAPITAL_ASSET' ? (
                      <div className="grid w-[420px] grid-cols-2 gap-2">
                        <Input value={row.assetName ?? ''} onChange={(event) => onUpdateRow(row.id ?? '', { assetName: event.target.value })} placeholder="Asset name" disabled={!isEditMode} />
                        <Input type="number" min={0} value={row.usefulLifeMonths ?? ''} onChange={(event) => onUpdateNumberRow(row.id ?? '', 'usefulLifeMonths', event.target.value)} placeholder="Useful life months" disabled={!isEditMode} />
                        <Input value={row.amortizationBasis ?? ''} onChange={(event) => onUpdateRow(row.id ?? '', { amortizationBasis: event.target.value })} placeholder="Amortization basis" disabled={!isEditMode} />
                        <Input type="number" min={0} step="0.01" value={row.installationCost ?? 0} onChange={(event) => onUpdateNumberRow(row.id ?? '', 'installationCost', event.target.value)} placeholder="Installation cost" disabled={!isEditMode} />
                        <Input type="number" min={0} step="0.01" value={row.trainingCost ?? 0} onChange={(event) => onUpdateNumberRow(row.id ?? '', 'trainingCost', event.target.value)} placeholder="Training cost" disabled={!isEditMode} />
                      </div>
                    ) : (
                      <span className="text-sm text-slate-500">Only shown for capital assets</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Input className="w-[220px]" value={row.notes ?? ''} onChange={(event) => onUpdateRow(row.id ?? '', { notes: event.target.value })} disabled={!isEditMode} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button type="button" variant="ghost" size="icon" onClick={() => onRemoveRow(row.id ?? '')} disabled={!isEditMode}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function DraftBomWizardWorkspace({
  draftLines,
  savedDraftBoms,
  inventoryItems,
  departmentOptions,
  seedLineId,
  onSeedLineConsumed,
  onSaveWizardBom,
  onDeleteWizardBom,
  isEditMode,
}: {
  draftLines: BomLine[];
  savedDraftBoms: DraftPartBom[];
  inventoryItems: InventoryItemOption[];
  departmentOptions: DepartmentOption[];
  seedLineId: string | null;
  onSeedLineConsumed: () => void;
  onSaveWizardBom: (part: DraftBomPart, bom: DraftPartBom) => void;
  onDeleteWizardBom: (bomId: string) => void;
  isEditMode: boolean;
}) {
  const [sourceMode, setSourceMode] = useState<DraftBomSource>('draft-part');
  const [selectedLineId, setSelectedLineId] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');
  const [selectedInventoryId, setSelectedInventoryId] = useState('');
  const [newPartNumber, setNewPartNumber] = useState('');
  const [newPartDescription, setNewPartDescription] = useState('');
  const [activeBom, setActiveBom] = useState<DraftPartBom | null>(null);
  const [currentPartIndex, setCurrentPartIndex] = useState(0);
  const [componentSource, setComponentSource] = useState<DraftBomSource>('draft-part');
  const [componentLineId, setComponentLineId] = useState('');
  const [componentInventorySearch, setComponentInventorySearch] = useState('');
  const [componentInventoryId, setComponentInventoryId] = useState('');
  const [componentPartNumber, setComponentPartNumber] = useState('');
  const [componentDescription, setComponentDescription] = useState('');
  const [componentQuantity, setComponentQuantity] = useState('1');
  const [componentManufactured, setComponentManufactured] = useState(false);
  const currentDefaultDepartment = defaultBomDepartment(departmentOptions);
  const [componentDepartment, setComponentDepartment] = useState(currentDefaultDepartment);

  const draftPartLines = useMemo(
    () => draftLines.filter((line) => line.isDraftPart !== false || line.inventoryItemId || line.description || line.agPartNumber),
    [draftLines],
  );
  const inventoryMatches = useMemo(() => searchInventoryItems(inventoryItems, inventorySearch), [inventoryItems, inventorySearch]);
  const componentInventoryMatches = useMemo(
    () => searchInventoryItems(inventoryItems, componentInventorySearch),
    [componentInventorySearch, inventoryItems],
  );
  const selectedInventoryItem = inventoryItems.find((item) => String(item.id) === selectedInventoryId);
  const componentInventoryItem = inventoryItems.find((item) => String(item.id) === componentInventoryId);
  const selectedLine = draftLines.find((line) => line.id === selectedLineId);
  const currentPart = activeBom?.parts[currentPartIndex] ?? null;
  const queuedManufacturedParts = activeBom?.parts.filter((part, index) => index > currentPartIndex && !part.hasBOM) ?? [];

  function findLineForBom(bom: DraftPartBom) {
    return findPartsRequestLineForAssemblyPart(bom.rootPart, draftLines);
  }

  useEffect(() => {
    if (!seedLineId) return;
    const line = draftLines.find((item) => item.id === seedLineId);
    if (!line) {
      onSeedLineConsumed();
      return;
    }
    setSourceMode('draft-part');
    setSelectedLineId(line.id);
    setActiveBom(createDraftPartBom(draftLineToPart(line), draftBomsForAssemblyPart(savedDraftBoms, draftLineToPart(line)).length));
    setCurrentPartIndex(0);
    onSeedLineConsumed();
  }, [draftLines, onSeedLineConsumed, savedDraftBoms, seedLineId]);

  function startNewBom() {
    let rootPart: DraftBomPart | null = null;
    let existingCount = 0;

    if (sourceMode === 'draft-part' && selectedLine) {
      rootPart = draftLineToPart(selectedLine);
      existingCount = draftBomsForAssemblyPart(savedDraftBoms, rootPart).length;
    } else if (sourceMode === 'inventory-item' && selectedInventoryItem) {
      rootPart = inventoryItemToPart(selectedInventoryItem);
      existingCount = draftBomsForAssemblyPart(savedDraftBoms, rootPart).length;
    } else if (sourceMode === 'new-part') {
      rootPart = newWizardPart(newPartNumber, newPartDescription);
      existingCount = draftBomsForAssemblyPart(savedDraftBoms, rootPart).length;
    }

    if (!rootPart) return;
    setActiveBom(createDraftPartBom(rootPart, existingCount));
    setCurrentPartIndex(0);
  }

  function loadExistingBom(bom: DraftPartBom) {
    const line = findLineForBom(bom);
    setSourceMode(line ? 'draft-part' : bom.rootPart.source);
    setSelectedLineId(line?.id ?? '');
    setActiveBom(bom);
    setCurrentPartIndex(0);
  }

  function resetComponentForm() {
    setComponentLineId('');
    setComponentInventoryId('');
    setComponentInventorySearch('');
    setComponentPartNumber('');
    setComponentDescription('');
    setComponentQuantity('1');
    setComponentManufactured(false);
    setComponentDepartment(currentDefaultDepartment);
  }

  function syncComponentFromDraftLine(lineId: string) {
    const line = draftLines.find((item) => item.id === lineId);
    setComponentLineId(lineId);
    if (!line) return;
    setComponentPartNumber(linePartNumber(line));
    setComponentDescription(lineDescription(line));
    setComponentManufactured(line.isManufactured === true);
    setComponentDepartment(line.firstDepartment ?? currentDefaultDepartment);
  }

  function syncComponentFromInventory(itemId: string) {
    const item = inventoryItems.find((entry) => String(entry.id) === itemId);
    setComponentInventoryId(itemId);
    if (!item) return;
    setComponentPartNumber(inventoryPartNumber(item));
    setComponentDescription(inventoryDescription(item));
    setComponentManufactured(isInventoryManufactured(item));
    setComponentDepartment(currentDefaultDepartment);
  }

  function addComponent() {
    if (!activeBom || !currentPart || !componentPartNumber.trim()) return;
    const quantity = Number(componentQuantity);
    const component: DraftBomComponent = {
      id: crypto.randomUUID(),
      source: componentSource,
      sourceLineId: componentSource === 'draft-part' ? componentLineId || null : null,
      inventoryItemId: componentSource === 'inventory-item' ? Number(componentInventoryId) || componentInventoryItem?.id || null : null,
      partNumber: componentPartNumber.trim(),
      description: componentDescription.trim() || componentPartNumber.trim(),
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      isManufactured: componentManufactured,
      firstDepartment: componentDepartment || currentDefaultDepartment,
    };

    setActiveBom((current) => {
      if (!current) return current;
      const parts = current.parts.map((part, index) =>
        index === currentPartIndex ? { ...part, bomItems: [...part.bomItems, component] } : part,
      );

      if (component.isManufactured && !parts.some((part) => part.partNumber === component.partNumber)) {
        parts.splice(currentPartIndex + 1, 0, {
          id: `mfg-${component.id}`,
          source: component.source,
          sourceLineId: component.sourceLineId ?? null,
          inventoryItemId: component.inventoryItemId ?? null,
          partNumber: component.partNumber,
          description: component.description,
          quantity: component.quantity,
          bomItems: [],
          hasBOM: false,
        });
      }

      return { ...current, parts, updatedAt: new Date().toISOString() };
    });
    resetComponentForm();
  }

  function removeComponent(componentId: string) {
    setActiveBom((current) => {
      if (!current) return current;
      const queuedPartId = `mfg-${componentId}`;
      return {
        ...current,
        parts: current.parts
          .map((part, index) =>
            index === currentPartIndex
              ? { ...part, bomItems: part.bomItems.filter((component) => component.id !== componentId) }
              : part,
          )
          .filter((part) => part.id !== queuedPartId),
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function updateComponent(componentId: string, patch: Partial<DraftBomComponent>) {
    setActiveBom((current) => {
      if (!current) return current;
      const queuedPartId = `mfg-${componentId}`;
      const currentComponent = current.parts[currentPartIndex]?.bomItems.find((component) => component.id === componentId);
      if (!currentComponent) return current;

      const updatedComponent = {
        ...currentComponent,
        ...patch,
        partNumber: patch.partNumber ?? currentComponent.partNumber,
        description: patch.description ?? currentComponent.description,
      };

      let parts = current.parts.map((part, index) =>
        index === currentPartIndex
          ? {
              ...part,
              bomItems: part.bomItems.map((component) => (component.id === componentId ? updatedComponent : component)),
            }
          : part,
      );

      const queuedIndex = parts.findIndex((part) => part.id === queuedPartId);
      if (updatedComponent.isManufactured && updatedComponent.partNumber.trim()) {
        const queuedPart: DraftBomPart = {
          id: queuedPartId,
          source: updatedComponent.source,
          sourceLineId: updatedComponent.sourceLineId ?? null,
          inventoryItemId: updatedComponent.inventoryItemId ?? null,
          partNumber: updatedComponent.partNumber.trim(),
          description: updatedComponent.description.trim() || updatedComponent.partNumber.trim(),
          quantity: updatedComponent.quantity,
          bomItems: queuedIndex >= 0 ? parts[queuedIndex].bomItems : [],
          hasBOM: queuedIndex >= 0 ? parts[queuedIndex].hasBOM : false,
        };
        if (queuedIndex >= 0) {
          parts = parts.map((part, index) => (index === queuedIndex ? queuedPart : part));
        } else {
          parts.splice(currentPartIndex + 1, 0, queuedPart);
        }
      } else if (queuedIndex >= 0) {
        parts = parts.filter((part) => part.id !== queuedPartId);
      }

      return { ...current, parts, updatedAt: new Date().toISOString() };
    });
  }

  function saveAndAdvance() {
    if (!activeBom || !currentPart) return;
    const nextBom = {
      ...activeBom,
      parts: activeBom.parts.map((part, index) => (index === currentPartIndex ? { ...part, hasBOM: true } : part)),
      updatedAt: new Date().toISOString(),
    };

    onSaveWizardBom(nextBom.rootPart, nextBom);

    if (currentPartIndex < nextBom.parts.length - 1) {
      setActiveBom(nextBom);
      setCurrentPartIndex(currentPartIndex + 1);
      resetComponentForm();
      return;
    }

    setActiveBom(null);
    setCurrentPartIndex(0);
    resetComponentForm();
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="space-y-4">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-teal-700" />
            <h2 className="font-semibold text-slate-950">BOM Wizard</h2>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Create another draft BOM from a draft part, inventory item, or new part.
          </p>

          <div className="mt-4 grid gap-3">
            <Select value={sourceMode} onValueChange={(value) => setSourceMode(value as DraftBomSource)} disabled={!isEditMode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft-part">Draft parts list</SelectItem>
                <SelectItem value="inventory-item">Inventory items</SelectItem>
                <SelectItem value="new-part">Create new part</SelectItem>
              </SelectContent>
            </Select>

            {sourceMode === 'draft-part' ? (
              <Select value={selectedLineId} onValueChange={setSelectedLineId} disabled={!isEditMode}>
                <SelectTrigger>
                  <SelectValue placeholder="Select draft part" />
                </SelectTrigger>
                <SelectContent>
                  {draftPartLines.map((line) => (
                    <SelectItem key={line.id} value={line.id}>
                      {linePartNumber(line)} - {lineDescription(line)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            {sourceMode === 'inventory-item' ? (
              <div className="grid gap-2">
                <Input value={inventorySearch} onChange={(event) => setInventorySearch(event.target.value)} placeholder="Search inventory" disabled={!isEditMode} />
                <Select value={selectedInventoryId} onValueChange={setSelectedInventoryId} disabled={!isEditMode}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select inventory item" />
                  </SelectTrigger>
                  <SelectContent>
                    {inventoryMatches.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {inventoryPartNumber(item)} - {inventoryDescription(item)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {sourceMode === 'new-part' ? (
              <div className="grid gap-2">
                <Input value={newPartNumber} onChange={(event) => setNewPartNumber(event.target.value)} placeholder="Part number" disabled={!isEditMode} />
                <Input value={newPartDescription} onChange={(event) => setNewPartDescription(event.target.value)} placeholder="Description" disabled={!isEditMode} />
              </div>
            ) : null}

            <Button type="button" onClick={startNewBom} disabled={!isEditMode}>
              <Plus className="mr-2 h-4 w-4" />
              Start draft BOM
            </Button>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Existing draft BOMs</h3>
          <div className="mt-3 space-y-2">
            {savedDraftBoms.map((bom) => {
              const linkedLine = findLineForBom(bom);
              return (
                <div
                  key={bom.id}
                  className="flex gap-2 rounded-md border border-slate-200 p-3 text-sm hover:border-teal-300 hover:bg-teal-50"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => loadExistingBom(bom)}
                    disabled={!isEditMode}
                  >
                    <span className="block font-medium text-slate-950">{bom.name} {bom.revision}</span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {linkedLine ? linePartNumber(linkedLine) : `${bom.rootPart.partNumber} (part removed)`} - {bom.parts.length} configured part{bom.parts.length === 1 ? '' : 's'}
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => {
                      onDeleteWizardBom(bom.id);
                      if (activeBom?.id === bom.id) {
                        setActiveBom(null);
                        setCurrentPartIndex(0);
                      }
                    }}
                    disabled={!isEditMode}
                    aria-label={`Delete ${bom.name}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              );
            })}
            {savedDraftBoms.length === 0 ? (
              <p className="text-sm text-slate-500">No child draft BOMs have been saved yet.</p>
            ) : null}
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        {!activeBom || !currentPart ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Choose a source part to begin a draft BOM.
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">{activeBom.name}</h3>
                <p className="text-sm text-slate-600">
                  Part {currentPartIndex + 1} of {activeBom.parts.length}: {currentPart.partNumber} - {currentPart.description}
                </p>
              </div>
              <Badge variant="outline">{activeBom.revision}</Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              {activeBom.parts.map((part, index) => (
                <Button
                  key={part.id}
                  type="button"
                  variant={index === currentPartIndex ? 'default' : part.hasBOM ? 'outline' : 'secondary'}
                  size="sm"
                  onClick={() => {
                    setCurrentPartIndex(index);
                    resetComponentForm();
                  }}
                >
                  {part.hasBOM ? <Check className="mr-1 h-3 w-3" /> : null}
                  {part.partNumber}
                </Button>
              ))}
            </div>

            {queuedManufacturedParts.length > 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Manufactured sub-parts queued next: {queuedManufacturedParts.map((part) => part.partNumber).join(', ')}
              </div>
            ) : null}

            <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="grid gap-3 lg:grid-cols-[160px_minmax(180px,1fr)_minmax(180px,1fr)_100px_150px_auto]">
                <Select value={componentSource} onValueChange={(value) => setComponentSource(value as DraftBomSource)} disabled={!isEditMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft-part">Draft part</SelectItem>
                    <SelectItem value="inventory-item">Inventory</SelectItem>
                    <SelectItem value="new-part">New part</SelectItem>
                  </SelectContent>
                </Select>

                {componentSource === 'draft-part' ? (
                  <Select value={componentLineId} onValueChange={syncComponentFromDraftLine} disabled={!isEditMode}>
                    <SelectTrigger>
                      <SelectValue placeholder="Draft part" />
                    </SelectTrigger>
                    <SelectContent>
                      {draftPartLines.map((line) => (
                        <SelectItem key={line.id} value={line.id}>
                          {linePartNumber(line)} - {lineDescription(line)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : componentSource === 'inventory-item' ? (
                  <div className="grid gap-2">
                    <Input
                      value={componentInventorySearch}
                      onChange={(event) => setComponentInventorySearch(event.target.value)}
                      placeholder="Search inventory"
                      disabled={!isEditMode}
                    />
                    <Select value={componentInventoryId} onValueChange={syncComponentFromInventory} disabled={!isEditMode}>
                      <SelectTrigger>
                        <SelectValue placeholder="Inventory item" />
                      </SelectTrigger>
                      <SelectContent>
                        {componentInventoryMatches.map((item) => (
                          <SelectItem key={item.id} value={String(item.id)}>
                            {inventoryPartNumber(item)} - {inventoryDescription(item)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <Input value={componentPartNumber} onChange={(event) => setComponentPartNumber(event.target.value)} placeholder="Part number" disabled={!isEditMode} />
                )}

                <Input value={componentDescription} onChange={(event) => setComponentDescription(event.target.value)} placeholder="Description" disabled={!isEditMode} />
                <Input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={componentQuantity}
                  onChange={(event) => setComponentQuantity(event.target.value)}
                  placeholder="Qty"
                  disabled={!isEditMode}
                />
                <Select value={componentDepartment} onValueChange={setComponentDepartment} disabled={!isEditMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {bomDepartmentOptionsWithCurrent(departmentOptions, componentDepartment).map((department) => (
                      <SelectItem key={department.value} value={department.value}>
                        {department.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" onClick={addComponent} disabled={!isEditMode || !componentPartNumber.trim()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add
                </Button>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={componentManufactured} onCheckedChange={(checked) => setComponentManufactured(checked === true)} disabled={!isEditMode} />
                Manufactured component
              </label>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Part number</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>First department</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="w-[70px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentPart.bomItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                        Add components for this draft BOM part.
                      </TableCell>
                    </TableRow>
                  ) : (
                    currentPart.bomItems.map((component) => (
                      <TableRow key={component.id}>
                        <TableCell className="min-w-[160px]">
                          <Input
                            className="h-9 font-medium"
                            value={component.partNumber}
                            onChange={(event) => updateComponent(component.id, { partNumber: event.target.value })}
                            disabled={!isEditMode}
                            aria-label="BOM component part number"
                          />
                        </TableCell>
                        <TableCell className="min-w-[240px]">
                          <Input
                            className="h-9"
                            value={component.description}
                            onChange={(event) => updateComponent(component.id, { description: event.target.value })}
                            disabled={!isEditMode}
                            aria-label="BOM component description"
                          />
                        </TableCell>
                        <TableCell className="min-w-[100px]">
                          <Input
                            className="h-9 text-right tabular-nums"
                            type="number"
                            min="0.001"
                            step="0.001"
                            value={component.quantity}
                            onChange={(event) => {
                              const quantity = Number(event.target.value);
                              updateComponent(component.id, { quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1 });
                            }}
                            disabled={!isEditMode}
                            aria-label="BOM component quantity"
                          />
                        </TableCell>
                        <TableCell className="min-w-[160px]">
                          <Select
                            value={component.firstDepartment || currentDefaultDepartment}
                            onValueChange={(value) => updateComponent(component.id, { firstDepartment: value })}
                            disabled={!isEditMode}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {bomDepartmentOptionsWithCurrent(departmentOptions, component.firstDepartment).map((department) => (
                                <SelectItem key={department.value} value={department.value}>
                                  {department.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={component.isManufactured}
                              onCheckedChange={(checked) => updateComponent(component.id, { isManufactured: checked === true })}
                              disabled={!isEditMode}
                              aria-label="BOM component is manufactured"
                            />
                            <Badge variant={component.isManufactured ? 'secondary' : 'outline'}>
                              {component.isManufactured ? 'Manufactured' : 'Purchased'}
                            </Badge>
                          </label>
                        </TableCell>
                        <TableCell>
                          <Button type="button" variant="ghost" size="sm" onClick={() => removeComponent(component.id)} disabled={!isEditMode}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end">
              <Button type="button" onClick={saveAndAdvance} disabled={!isEditMode}>
                {currentPartIndex < activeBom.parts.length - 1 ? 'Save & Next' : 'Save Draft BOM'}
              </Button>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}

function AssemblyTreeWorkspace({ tree }: { tree: AssemblyTreeNode[] }) {
  const totals = tree.reduce(
    (acc, node) => {
      const nodes = flattenAssemblyTree(node);
      acc.ready += nodes.filter((item) => item.manufactureState === 'ready').length;
      acc.ordered += nodes.filter((item) => isOrderedStatus(item.displayStatus)).length;
      acc.onHand += nodes.filter((item) => item.displayStatus === 'On Hand').length;
      acc.needsPlan += nodes.filter((item) => item.manufactureState === 'needs-plan').length;
      return acc;
    },
    { ready: 0, ordered: 0, onHand: 0, needsPlan: 0 },
  );

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-semibold text-slate-950">Assembly Tree</h2>
          <p className="text-sm text-slate-600">
            {tree.length} created BOM{tree.length === 1 ? '' : 's'} broken down by on-hand and ordered parts.
          </p>
        </div>
        <div className="grid grid-cols-4 gap-2 text-sm">
          <AssemblyOrderStatusCount label="Ready" value={totals.ready} tone="ready" />
          <AssemblyOrderStatusCount label="On hand" value={totals.onHand} tone="on-hand" />
          <AssemblyOrderStatusCount label="Ordered" value={totals.ordered} tone="active" />
          <AssemblyOrderStatusCount label="Need plan" value={totals.needsPlan} tone="quote" />
        </div>
      </div>

      {tree.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">
          Create a BOM in the BOM wizard to see what can be manufactured.
        </div>
      ) : (
        <Accordion type="multiple" className="divide-y divide-slate-200">
          {tree.map((node) => (
            <AssemblyTreeAccordionNode key={node.id} node={node} depth={0} />
          ))}
        </Accordion>
      )}
    </section>
  );
}

function AssemblyTreeAccordionNode({ node, depth }: { node: AssemblyTreeNode; depth: number }) {
  const canExpand = node.children.length > 0 || node.isManufactured;
  const rowContent = (
    <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-[minmax(220px,1fr)_auto_auto_auto_auto] md:items-center">
      <div className="min-w-0" style={{ paddingLeft: `${depth * 16}px` }}>
        <div className="truncate font-semibold text-slate-950">{node.description}</div>
        <div className="truncate text-sm font-normal text-slate-600">{node.partNumber}</div>
        {node.bomLabel ? (
          <div className="truncate text-xs font-normal text-teal-700">{node.bomLabel}</div>
        ) : null}
      </div>
      <div className="text-sm font-normal tabular-nums text-slate-600">
        Req {node.quantityRequired.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </div>
      <div className="text-sm font-normal tabular-nums text-slate-600">
        On hand {node.availableQuantity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </div>
      <ManufactureStateBadge state={node.manufactureState} />
      <StatusBadge status={node.displayStatus} />
    </div>
  );

  if (!canExpand) {
    return (
      <div className="px-4 py-3">
        {rowContent}
      </div>
    );
  }

  return (
    <AccordionItem value={node.id} className="border-0">
      <AccordionTrigger className="gap-4 px-4 text-left hover:no-underline">
        {rowContent}
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">
        {node.children.length > 0 ? (
          <Accordion type="multiple" className="rounded-md border border-slate-200">
            {node.children.map((child) => (
              <AssemblyTreeAccordionNode key={child.id} node={child} depth={depth + 1} />
            ))}
          </Accordion>
        ) : (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            No BOM breakdown has been created for this manufactured part yet.
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function flattenAssemblyTree(node: AssemblyTreeNode): AssemblyTreeNode[] {
  return [node, ...node.children.flatMap(flattenAssemblyTree)];
}

function ManufactureStateBadge({ state }: { state: AssemblyManufactureState }) {
  const label =
    state === 'ready'
      ? 'Can manufacture'
      : state === 'needs-plan'
        ? 'Needs plan'
        : 'Waiting';
  const className =
    state === 'ready'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50'
      : state === 'needs-plan'
        ? 'border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-50'
        : 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-50';

  return (
    <Badge variant="outline" className={cn('justify-center whitespace-nowrap', className)}>
      {label}
    </Badge>
  );
}

function AssemblyOrderStatusCount({ label, value, tone }: { label: string; value: number; tone: 'quote' | 'active' | 'on-hand' | 'ready' }) {
  const className =
    tone === 'ready' || tone === 'on-hand'
      ? 'border-emerald-200 bg-emerald-50'
      : tone === 'active'
        ? 'border-sky-200 bg-sky-50'
        : 'border-orange-200 bg-orange-50';

  return (
    <div className={cn('rounded-md border px-3 py-2 text-center', className)}>
      <div className="text-xs font-medium uppercase text-slate-600">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-slate-950">{value}</div>
    </div>
  );
}

function searchInventoryItems(items: InventoryItemOption[], query: string) {
  const normalized = query.trim().toLowerCase();
  const source = normalized.length >= 2
    ? items.filter((item) =>
        [item.name, item.description, item.agPartNumber, item.supplierPartNumber, item.manufacturerPartNumber, item.manufacturer]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(normalized),
      )
    : items;
  return source.slice(0, 50);
}

function SourcingLineTable({
  lines,
  visibleColumns,
  customColumns,
  emptyMessage,
}: {
  lines: BomLine[];
  visibleColumns: SourcingColumnId[];
  customColumns: string[];
  emptyMessage: string;
}) {
  const totalColumns = Math.max(visibleColumns.length + customColumns.length, 1);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {visibleColumns.includes('supplier') ? <TableHead className="w-[140px]">Supplier</TableHead> : null}
            {visibleColumns.includes('supplierItemId') ? <TableHead className="w-[130px]">Supplier Item</TableHead> : null}
            {visibleColumns.includes('agPartNumber') ? <TableHead className="w-[110px]">AG Part #</TableHead> : null}
            {visibleColumns.includes('description') ? <TableHead className="min-w-[320px]">Description</TableHead> : null}
            {visibleColumns.includes('qtyNeeded') ? <TableHead className="w-[80px] text-right">Qty</TableHead> : null}
            {visibleColumns.includes('unitCost') ? <TableHead className="w-[110px] text-right">Unit Cost</TableHead> : null}
            {visibleColumns.includes('extCost') ? <TableHead className="w-[120px] text-right">Ext Cost</TableHead> : null}
            {visibleColumns.includes('action') ? <TableHead className="w-[140px]">Action</TableHead> : null}
            {visibleColumns.includes('status') ? <TableHead className="w-[130px]">Status</TableHead> : null}
            {customColumns.map((columnName) => (
              <TableHead key={columnName} className="min-w-[160px]">
                {columnName}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.length === 0 ? (
            <TableRow>
              <TableCell colSpan={totalColumns} className="h-24 text-center text-slate-500">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            lines.map((line) => {
              const extCost = asNumber(line.unitCost) * asNumber(line.qtyNeeded);
              return (
                <TableRow key={line.id}>
                  {visibleColumns.includes('supplier') ? <TableCell className="font-medium">{line.supplier || 'Unassigned'}</TableCell> : null}
                  {visibleColumns.includes('supplierItemId') ? <TableCell>{line.supplierItemId || '-'}</TableCell> : null}
                  {visibleColumns.includes('agPartNumber') ? <TableCell>{line.agPartNumber || '-'}</TableCell> : null}
                  {visibleColumns.includes('description') ? <TableCell>{line.description || '-'}</TableCell> : null}
                  {visibleColumns.includes('qtyNeeded') ? <TableCell className="text-right tabular-nums">{line.qtyNeeded || '-'}</TableCell> : null}
                  {visibleColumns.includes('unitCost') ? <TableCell className="text-right tabular-nums">
                    {line.unitCost === '' ? '-' : money(asNumber(line.unitCost))}
                  </TableCell> : null}
                  {visibleColumns.includes('extCost') ? <TableCell className="text-right tabular-nums">{money(extCost)}</TableCell> : null}
                  {visibleColumns.includes('action') ? <TableCell>{line.action}</TableCell> : null}
                  {visibleColumns.includes('status') ? <TableCell>
                    <StatusBadge status={line.status} />
                  </TableCell> : null}
                  {customColumns.map((columnName) => (
                    <TableCell key={columnName}>{line.customFields?.[columnName] || '-'}</TableCell>
                  ))}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function CustomColumnLineTable({
  lines,
  customColumns,
  onUpdateCustomField,
  isEditMode,
}: {
  lines: BomLine[];
  customColumns: string[];
  onUpdateCustomField: (lineId: string, columnName: string, value: string) => void;
  isEditMode: boolean;
}) {
  const totalColumns = 2 + Math.max(customColumns.length, 1);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[260px]">Part description</TableHead>
            <TableHead className="w-[130px]">AG Part #</TableHead>
            {customColumns.length === 0 ? <TableHead className="min-w-[180px]">Custom columns</TableHead> : null}
            {customColumns.map((columnName) => (
              <TableHead key={columnName} className="min-w-[180px]">
                {columnName}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.length === 0 ? (
            <TableRow>
              <TableCell colSpan={totalColumns} className="h-24 text-center text-slate-500">
                Add BOM lines before using custom columns.
              </TableCell>
            </TableRow>
          ) : (
            lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell className="font-medium">{line.description || '-'}</TableCell>
                <TableCell>{line.agPartNumber || '-'}</TableCell>
                {customColumns.length === 0 ? (
                  <TableCell className="text-slate-500">Add custom columns from BOM details.</TableCell>
                ) : null}
                {customColumns.map((columnName) => (
                  <TableCell key={columnName}>
                    <Input
                      className="h-9"
                      value={line.customFields?.[columnName] ?? ''}
                      onChange={(event) => onUpdateCustomField(line.id, columnName, event.target.value)}
                      disabled={!isEditMode}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function EditableCell({
  value,
  onChange,
  disabled = false,
  wide = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  wide?: boolean;
}) {
  return (
    <TableCell className={wide ? 'min-w-[260px]' : undefined}>
      <Input className="h-9" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} />
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
