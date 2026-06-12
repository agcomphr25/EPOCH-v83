import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import {
  Calculator,
  Check,
  FileSpreadsheet,
  Filter,
  Layers,
  PackagePlus,
  Plus,
  Save,
  SlidersHorizontal,
  Trash2,
  Upload,
} from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
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
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { privateerDraftBomLines, type PrivateerDraftBomLine } from '@/data/privateerDraftBom';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
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
type BuiltInWorkspaceTabId = 'po-draft' | 'parts-request' | 'direct-labor' | 'bom-wizard' | 'assembly-tree';
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
  | 'status'
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
  laborEstimateLines?: DraftLaborEstimateLine[];
  customLaborDepartments?: string[];
  poVisibleColumns?: PoColumnId[];
  partsRequestVisibleColumns?: PartsRequestColumnId[];
  directLaborVisibleColumns?: DirectLaborColumnId[];
  assemblyVisibleColumns?: SourcingColumnId[];
  customColumns?: string[];
  customPoColumns?: string[];
  workspaceTabs?: WorkspaceTabId[];
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

type AssemblyStockState = 'on-hand' | 'low-stock' | 'blocked';
type AssemblyTreeNode = {
  id: string;
  partNumber: string;
  description: string;
  quantityRequired: number;
  inventoryItem: InventoryItemOption | null;
  stockState: AssemblyStockState;
  availableQuantity: number;
  reorderPoint: number;
  children: AssemblyTreeNode[];
};

type CsvImportResult = {
  lines: BomLine[];
  linkedCount: number;
  customColumns: string[];
};

const STORAGE_KEY = 'epoch:draft-boms';
const RD_PROJECTS_STORAGE_KEY = 'epoch.rdProjects.v1';
const VENDOR_PO_HANDOFF_KEY = 'epoch:draft-bom-vendor-po-handoff';
const PRIVATEER_DRAFT_ID = 'privateer';
const NEW_DRAFT_VALUE = '__new_draft__';
const LEGACY_R_AND_D_PROJECT_VALUE = '__r_and_d__';
const P2_PROJECT_VALUE_PREFIX = 'p2:';
const RD_PROJECT_VALUE_PREFIX = 'rd:';

const statuses: BomStatus[] = ['Needs Review', 'Needs Quote', 'RFQ Sent', 'On Order', 'On Hand', 'ETA / Inbound', 'Hold'];
const defaultWorkspaceTabs: BuiltInWorkspaceTabId[] = ['po-draft', 'parts-request', 'direct-labor', 'bom-wizard', 'assembly-tree'];
const workspaceTabLabels: Record<BuiltInWorkspaceTabId, string> = {
  'po-draft': 'PO draft',
  'parts-request': 'Parts/request',
  'direct-labor': 'Draft Direct Labor Estimate',
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
    laborEstimateLines: [newLaborEstimateLine()],
    customLaborDepartments: [],
    poVisibleColumns: defaultPoColumns,
    partsRequestVisibleColumns: defaultPartsRequestColumns,
    directLaborVisibleColumns: defaultDirectLaborColumns,
    assemblyVisibleColumns: defaultSourcingColumns,
    customColumns: [],
    customPoColumns: [],
    workspaceTabs: defaultWorkspaceTabs,
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
  return {
    ...draft,
    projectId: draft.projectId ?? null,
    projectCode: draft.projectCode ?? null,
    projectName: draft.projectName ?? draft.project ?? null,
    projectType: draft.projectType ?? null,
    lines: (draft.lines ?? []).map((line) => ({
      ...line,
      isDraftPart: line.isDraftPart ?? !line.inventoryItemId,
      isManufactured: line.isManufactured ?? false,
      firstDepartment: line.firstDepartment ?? defaultDepartment,
      childDraftBoms: line.childDraftBoms ?? [],
    })),
    laborEstimateLines: (draft.laborEstimateLines?.length ? draft.laborEstimateLines : [newLaborEstimateLine()]).map((line) => ({
      ...line,
      department: line.department || defaultDepartment,
      employeeRole: line.employeeRole ?? '',
      hourlyRate: line.hourlyRate ?? '',
      hoursPerPart: line.hoursPerPart ?? '',
      quantityPerPo: line.quantityPerPo ?? 1,
    })),
    customLaborDepartments: draft.customLaborDepartments ?? [],
    poVisibleColumns: draft.poVisibleColumns ?? defaultPoColumns,
    partsRequestVisibleColumns: draft.partsRequestVisibleColumns ?? defaultPartsRequestColumns,
    directLaborVisibleColumns: draft.directLaborVisibleColumns ?? defaultDirectLaborColumns,
    assemblyVisibleColumns: draft.assemblyVisibleColumns ?? defaultSourcingColumns,
    customColumns: uniqueColumnNames([...(draft.customColumns ?? []), ...(draft.customPoColumns ?? [])]),
    customPoColumns: draft.customPoColumns ?? [],
    workspaceTabs: normalizeWorkspaceTabs(draft.workspaceTabs),
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

function buildAssemblyTreeNode(
  part: DraftBomPart | DraftBomComponent,
  inventoryItems: InventoryItemOption[],
  requiredQuantity: number,
  children: DraftBomComponent[] = [],
  partLookup = new Map<string, DraftBomPart>(),
): AssemblyTreeNode {
  const inventoryItem = resolveInventoryForPart(inventoryItems, part.inventoryItemId, part.partNumber);
  const nodeQuantity = requiredQuantity || 1;
  return {
    id: `${part.id}-${part.partNumber}-${nodeQuantity}`,
    partNumber: part.partNumber,
    description: part.description,
    quantityRequired: nodeQuantity,
    inventoryItem,
    stockState: assemblyStockState(inventoryItem, nodeQuantity),
    availableQuantity: inventoryStockQuantity(inventoryItem),
    reorderPoint: inventoryReorderPoint(inventoryItem),
    children: children.map((component) => {
      const componentPart = partLookup.get(component.partNumber);
      const childQuantity = nodeQuantity * (component.quantity || 1);
      return buildAssemblyTreeNode(
        component,
        inventoryItems,
        childQuantity,
        componentPart?.bomItems ?? [],
        partLookup,
      );
    }),
  };
}

function buildAssemblyTree(lines: BomLine[], inventoryItems: InventoryItemOption[]) {
  return lines.map((line) => {
    const rootPart = draftLineToPart(line);
    const primaryBom = line.childDraftBoms?.[0];
    const partLookup = new Map<string, DraftBomPart>(
      primaryBom?.parts.map((part) => [part.partNumber, part]) ?? [],
    );
    return buildAssemblyTreeNode(
      primaryBom?.rootPart ?? rootPart,
      inventoryItems,
      asNumber(line.qtyNeeded) || 1,
      primaryBom?.rootPart.bomItems?.length ? primaryBom.rootPart.bomItems : primaryBom?.parts[0]?.bomItems ?? [],
      partLookup,
    );
  });
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
        status: parseImportStatus(csvField(row, ['status']), fallbackStatus),
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
  if (sourceTabs.includes('direct-labor')) return sourceTabs;

  const nextTabs = [...sourceTabs];
  const partsRequestIndex = nextTabs.indexOf('parts-request');
  nextTabs.splice(partsRequestIndex >= 0 ? partsRequestIndex + 1 : nextTabs.length, 0, 'direct-labor');
  return nextTabs;
}

function uniqueColumnNames(columns: string[]) {
  return columns.reduce<string[]>((result, column) => {
    const label = column.trim();
    if (!label || result.includes(label)) return result;
    return [...result, label];
  }, []);
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

function savedDraftListWith(drafts: BomDraft[], draft: BomDraft) {
  const withoutCurrent = drafts.filter((item) => item.id !== draft.id);
  return [draft, ...withoutCurrent].slice(0, 12);
}

export default function DraftBOMBuilderPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [savedDrafts, setSavedDrafts] = useState<BomDraft[]>(() => loadDrafts());
  const [selectedDraftId, setSelectedDraftId] = useState<string>(PRIVATEER_DRAFT_ID);
  const [draft, setDraft] = useState<BomDraft>(() => loadDrafts()[0] ?? createPrivateerDraft());
  const [rdProjects, setRdProjects] = useState<RDProjectOption[]>(() => readRDProjectOptions());
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(true);
  const [visibleWorkspaceTabs, setVisibleWorkspaceTabs] = useState<WorkspaceTabId[]>(() => draft.workspaceTabs ?? defaultWorkspaceTabs);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTabId>('po-draft');
  const [poDescription, setPoDescription] = useState('');
  const [partsRequestDescription, setPartsRequestDescription] = useState('');
  const [sortPartsByVendor, setSortPartsByVendor] = useState(false);
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
  const selectedProjectValue =
    draft.projectType === 'P2_PROJECT' && draft.projectId
      ? `${P2_PROJECT_VALUE_PREFIX}${draft.projectId}`
      : draft.projectType === 'R_AND_D' && draft.projectId
        ? `${RD_PROJECT_VALUE_PREFIX}${draft.projectId}`
        : draft.projectType === 'R_AND_D'
          ? LEGACY_R_AND_D_PROJECT_VALUE
          : '';

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
  const partsRequestLines = useMemo(() => {
    const lines = [...draft.lines];
    if (!sortPartsByVendor) return lines;
    return lines.sort((a, b) => {
      const vendorCompare = (a.supplier || '').localeCompare(b.supplier || '');
      if (vendorCompare !== 0) return vendorCompare;
      return (a.description || '').localeCompare(b.description || '');
    });
  }, [draft.lines, sortPartsByVendor]);
  const assemblyTree = useMemo(
    () => buildAssemblyTree(partsRequestLines, activeInventoryItems),
    [activeInventoryItems, partsRequestLines],
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

    if (selectedDraftId !== nextDraft.id) {
      setSelectedDraftId(nextDraft.id);
    }
  }, [
    customColumns,
    draft,
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

    return {
      materialTotal,
      laborTotal,
      laborHours,
      selectedTotal,
      onHandTotal,
      needsQuote,
      rfqSent,
      lineCount: draft.lines.length,
    };
  }, [draft.laborEstimateLines, draft.lines, selectedLines]);

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
      const rootLine =
        sourceLine ??
        ({
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
        } as BomLine);

      const linkedPart = { ...part, sourceLineId: rootLine.id };
      const linkedBom: DraftPartBom = {
        ...bom,
        rootPart: linkedPart,
        parts: bom.parts.map((queuedPart, index) =>
          index === 0 ? { ...queuedPart, sourceLineId: rootLine.id } : queuedPart,
        ),
        updatedAt: new Date().toISOString(),
      };

      const nextLines = sourceLine ? current.lines : [rootLine, ...current.lines];
      return {
        ...current,
        lines: nextLines.map((line) => {
          if (line.id !== rootLine.id) return line;
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

    setCustomColumns((current) => uniqueColumnNames([...current, ...result.customColumns]));
    setDraft((current) => ({
      ...current,
      lines: [...result.lines, ...current.lines],
      customColumns: uniqueColumnNames([...(current.customColumns ?? []), ...result.customColumns]),
      customPoColumns: uniqueColumnNames([...(current.customPoColumns ?? []), ...result.customColumns]),
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

  function saveDraft() {
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

  function deleteCurrentDraft() {
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

    saveDrafts(remainingDrafts);
    setSavedDrafts(remainingDrafts);
    applyDraftSelection(fallbackDraft);
    setIsDetailsOpen(false);
    toast({ title: 'Draft deleted', description: `${draft.name} was removed from saved draft BOMs.` });
  }

  function clearCurrentDraft() {
    const confirmed = window.confirm(`Clear "${draft.name} - ${draft.revision}" and start over? This cannot be undone.`);
    if (!confirmed) return;

    const clearedDraft: BomDraft = {
      ...draft,
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
    };

    const shouldPersist = !!selectedDraftId && savedDrafts.some((item) => item.id === draft.id);
    if (shouldPersist) {
      const nextDrafts = savedDrafts.map((item) => (item.id === draft.id ? clearedDraft : item));
      saveDrafts(nextDrafts);
      setSavedDrafts(nextDrafts);
    }

    applyDraftSelection(clearedDraft);
    toast({
      title: 'Draft cleared',
      description: shouldPersist ? `${draft.name} was reset and saved.` : `${draft.name} was reset in the current workspace.`,
    });
  }

  function applyProjectToDraft(current: BomDraft, selectedProject: ProjectSelectOption): BomDraft {
    const unnamedDraft = current.name === 'New Draft BOM' || current.name === current.project || current.name.trim() === '';
    return {
      ...current,
      name: unnamedDraft ? selectedProject.projectName : current.name,
      project: selectedProject.project,
      projectId: selectedProject.id,
      projectCode: selectedProject.projectCode,
      projectName: selectedProject.projectName,
      projectType: selectedProject.projectType,
    };
  }

  function updateDraftProject(value: string) {
    const selectedProject = combinedProjectOptions.find((project) => project.value === value);
    if (!selectedProject) return;

    const savedProjectDraft = savedDrafts.find(
      (item) => item.projectType === selectedProject.projectType && item.projectId === selectedProject.id,
    );

    if (savedProjectDraft) {
      loadDraft(savedProjectDraft.id);
      return;
    }

    setSelectedDraftId('');
    setDraft((current) => applyProjectToDraft(current, selectedProject));
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
      laborEstimateLines: [newLaborEstimateLine()],
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
              <h1 className="text-2xl font-semibold tracking-normal text-slate-950">Draft Builder</h1>
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
              <Label htmlFor="active-project">Project</Label>
              <Select value={selectedProjectValue} onValueChange={updateDraftProject} disabled={!isEditMode}>
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
                  checked={isEditMode}
                  onCheckedChange={setIsEditMode}
                  aria-label="Toggle draft editing"
                />
                <Label htmlFor="draft-edit-mode" className="cursor-pointer">
                  Editing
                </Label>
              </div>
              <Button type="button" variant="outline" onClick={() => setIsDetailsOpen(true)}>
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                BOM details
              </Button>
              <Button type="button" variant="outline" onClick={startBlankDraft} disabled={!isEditMode}>
                <Plus className="mr-2 h-4 w-4" />
                New draft
              </Button>
              <Button variant="outline" onClick={selectOrderable}>
                <Filter className="mr-2 h-4 w-4" />
                Select orderable
              </Button>
              <Button variant="outline" onClick={saveDraft} disabled={!isEditMode}>
                <Save className="mr-2 h-4 w-4" />
                Save draft
              </Button>
              <Button onClick={markSelectedFinalized} disabled={!isEditMode || selectedLines.length === 0}>
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
                    disabled={!isEditMode}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="draft-revision">Revision</Label>
                    <Input
                      id="draft-revision"
                      value={draft.revision}
                      onChange={(event) => setDraft((current) => ({ ...current, revision: event.target.value }))}
                      disabled={!isEditMode}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="draft-project">Project</Label>
                    <Select value={selectedProjectValue} onValueChange={updateDraftProject} disabled={!isEditMode}>
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
                    disabled={!isEditMode}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="draft-notes">Notes</Label>
                  <Textarea
                    id="draft-notes"
                    value={draft.notes}
                    onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                    rows={3}
                    disabled={!isEditMode}
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
                  disabled={!isEditMode}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addCustomColumn();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addCustomColumn} disabled={!isEditMode || !newColumnName.trim()}>
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
                    disabled={!isEditMode}
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
                  isEditMode={isEditMode}
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
                  sortByVendor={sortPartsByVendor}
                  onDescriptionChange={setPartsRequestDescription}
                  onCreateLine={createLineFromPartsRequestDescription}
                  onSortByVendorChange={setSortPartsByVendor}
                  onUpdateLine={updateLine}
                  onUpdateCustomField={updateLineCustomField}
                  onUpdateNumberLine={(id, field, value) => updateLine(id, { [field]: value === '' ? '' : Number(value) } as Partial<BomLine>)}
                  onImportCsv={importPartsRequestCsv}
                  onCreateVendorPoDraft={createVendorPoHandoff}
                  onFinalizeSelected={markSelectedFinalized}
                  onDeleteLine={deleteLine}
                  isEditMode={isEditMode}
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
                  isEditMode={isEditMode}
                />
              </TabsContent>
            ) : null}

            {visibleWorkspaceTabs.includes('bom-wizard') ? (
              <TabsContent value="bom-wizard" className="mt-4">
                <DraftBomWizardWorkspace
                  draftLines={draft.lines}
                  inventoryItems={activeInventoryItems}
                  seedLineId={wizardSeedLineId}
                  onSeedLineConsumed={() => setWizardSeedLineId(null)}
                  onSaveWizardBom={saveWizardBom}
                  isEditMode={isEditMode}
                />
              </TabsContent>
            ) : null}

            {visibleWorkspaceTabs.includes('assembly-tree') ? (
              <TabsContent value="assembly-tree" className="mt-4">
                <AssemblyTreeWorkspace tree={assemblyTree} lineCount={partsRequestLines.length} />
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
                      isEditMode={isEditMode}
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
  if (columnId === 'status') return line.status;
  if (columnId === 'source') return line.inventoryItemId ? `Inventory #${line.inventoryItemId}` : 'Draft part';
  return '-';
}

function PartsRequestWorkspace({
  lines,
  visibleColumns,
  customColumns,
  description,
  matches,
  sortByVendor,
  onDescriptionChange,
  onCreateLine,
  onSortByVendorChange,
  onUpdateLine,
  onUpdateCustomField,
  onUpdateNumberLine,
  onImportCsv,
  onCreateVendorPoDraft,
  onFinalizeSelected,
  onDeleteLine,
  isEditMode,
}: {
  lines: BomLine[];
  visibleColumns: PartsRequestColumnId[];
  customColumns: string[];
  description: string;
  matches: InventoryItemOption[];
  sortByVendor: boolean;
  onDescriptionChange: (value: string) => void;
  onCreateLine: (item?: InventoryItemOption) => void;
  onSortByVendorChange: (value: boolean) => void;
  onUpdateLine: (id: string, patch: Partial<BomLine>) => void;
  onUpdateCustomField: (lineId: string, columnName: string, value: string) => void;
  onUpdateNumberLine: (id: string, field: 'unitCost' | 'actualCost' | 'qtyNeeded', value: string) => void;
  onImportCsv: (file: File, linkInventoryMatches: boolean) => Promise<void>;
  onCreateVendorPoDraft: () => void;
  onFinalizeSelected: () => void;
  onDeleteLine: (lineId: string) => void;
  isEditMode: boolean;
}) {
  const typedDescription = description.trim();
  const selectedCount = lines.filter((line) => line.include).length;
  const totalColumns = 3 + visibleColumns.length + customColumns.length;
  const [linkInventoryMatches, setLinkInventoryMatches] = useState(false);
  const [isImportingCsv, setIsImportingCsv] = useState(false);

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
              variant={sortByVendor ? 'default' : 'outline'}
              onClick={() => onSortByVendorChange(!sortByVendor)}
            >
              <Filter className="mr-2 h-4 w-4" />
              Sort by vendor
            </Button>
            <Button type="button" variant="outline" onClick={onCreateVendorPoDraft} disabled={selectedCount === 0}>
              <PackagePlus className="mr-2 h-4 w-4" />
              Create Vendor PO draft
            </Button>
            <Button type="button" onClick={onFinalizeSelected} disabled={!isEditMode || selectedCount === 0}>
              <Check className="mr-2 h-4 w-4" />
              Finalize checked
            </Button>
          </div>
        </div>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[112px]">Include</TableHead>
                <TableHead className="min-w-[300px]">Part description</TableHead>
                {visibleColumns.includes('supplier') ? <TableHead className="w-[160px]">Vendor / Supplier</TableHead> : null}
                {visibleColumns.includes('supplierItemId') ? <TableHead className="w-[170px]">Supplier Part #</TableHead> : null}
                {visibleColumns.includes('manufacturer') ? <TableHead className="w-[160px]">Manufacturer</TableHead> : null}
                {visibleColumns.includes('unitCost') ? <TableHead className="w-[130px] text-right">Estimated Cost</TableHead> : null}
                {visibleColumns.includes('actualCost') ? <TableHead className="w-[120px] text-right">Actual Cost</TableHead> : null}
                {visibleColumns.includes('qtyNeeded') ? <TableHead className="w-[100px] text-right">Quantity</TableHead> : null}
                {visibleColumns.includes('service') ? <TableHead className="w-[90px]">Service</TableHead> : null}
                {visibleColumns.includes('agPartNumber') ? <TableHead className="w-[130px]">AG Part #</TableHead> : null}
                {visibleColumns.includes('status') ? <TableHead className="w-[150px]">Status</TableHead> : null}
                {customColumns.map((columnName) => (
                  <TableHead key={columnName} className="min-w-[160px]">
                    {columnName}
                  </TableHead>
                ))}
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
              ) : (
                lines.map((line) => (
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

function DraftBomWizardWorkspace({
  draftLines,
  inventoryItems,
  seedLineId,
  onSeedLineConsumed,
  onSaveWizardBom,
  isEditMode,
}: {
  draftLines: BomLine[];
  inventoryItems: InventoryItemOption[];
  seedLineId: string | null;
  onSeedLineConsumed: () => void;
  onSaveWizardBom: (part: DraftBomPart, bom: DraftPartBom) => void;
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
  const [componentDepartment, setComponentDepartment] = useState(defaultDepartment);

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

  useEffect(() => {
    if (!seedLineId) return;
    const line = draftLines.find((item) => item.id === seedLineId);
    if (!line) {
      onSeedLineConsumed();
      return;
    }
    setSourceMode('draft-part');
    setSelectedLineId(line.id);
    setActiveBom(createDraftPartBom(draftLineToPart(line), line.childDraftBoms?.length ?? 0));
    setCurrentPartIndex(0);
    onSeedLineConsumed();
  }, [draftLines, onSeedLineConsumed, seedLineId]);

  function startNewBom() {
    let rootPart: DraftBomPart | null = null;
    let existingCount = 0;

    if (sourceMode === 'draft-part' && selectedLine) {
      rootPart = draftLineToPart(selectedLine);
      existingCount = selectedLine.childDraftBoms?.length ?? 0;
    } else if (sourceMode === 'inventory-item' && selectedInventoryItem) {
      rootPart = inventoryItemToPart(selectedInventoryItem);
    } else if (sourceMode === 'new-part') {
      rootPart = newWizardPart(newPartNumber, newPartDescription);
    }

    if (!rootPart) return;
    setActiveBom(createDraftPartBom(rootPart, existingCount));
    setCurrentPartIndex(0);
  }

  function loadExistingBom(line: BomLine, bom: DraftPartBom) {
    setSourceMode('draft-part');
    setSelectedLineId(line.id);
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
    setComponentDepartment(defaultDepartment);
  }

  function syncComponentFromDraftLine(lineId: string) {
    const line = draftLines.find((item) => item.id === lineId);
    setComponentLineId(lineId);
    if (!line) return;
    setComponentPartNumber(linePartNumber(line));
    setComponentDescription(lineDescription(line));
    setComponentManufactured(line.isManufactured === true);
    setComponentDepartment(line.firstDepartment ?? defaultDepartment);
  }

  function syncComponentFromInventory(itemId: string) {
    const item = inventoryItems.find((entry) => String(entry.id) === itemId);
    setComponentInventoryId(itemId);
    if (!item) return;
    setComponentPartNumber(inventoryPartNumber(item));
    setComponentDescription(inventoryDescription(item));
    setComponentManufactured(isInventoryManufactured(item));
    setComponentDepartment(defaultDepartment);
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
      firstDepartment: componentDepartment || defaultDepartment,
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
      return {
        ...current,
        parts: current.parts.map((part, index) =>
          index === currentPartIndex
            ? { ...part, bomItems: part.bomItems.filter((component) => component.id !== componentId) }
            : part,
        ),
        updatedAt: new Date().toISOString(),
      };
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
            {draftLines.flatMap((line) =>
              (line.childDraftBoms ?? []).map((bom) => (
                <button
                  key={bom.id}
                  type="button"
                  className="block w-full rounded-md border border-slate-200 p-3 text-left text-sm hover:border-teal-300 hover:bg-teal-50"
                  onClick={() => loadExistingBom(line, bom)}
                  disabled={!isEditMode}
                >
                  <span className="block font-medium text-slate-950">{bom.name} {bom.revision}</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {linePartNumber(line)} - {bom.parts.length} configured part{bom.parts.length === 1 ? '' : 's'}
                  </span>
                </button>
              )),
            )}
            {draftLines.every((line) => !line.childDraftBoms?.length) ? (
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
                    {departmentOptions.map((department) => (
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
                        <TableCell className="font-medium">{component.partNumber}</TableCell>
                        <TableCell>{component.description}</TableCell>
                        <TableCell className="text-right tabular-nums">{component.quantity}</TableCell>
                        <TableCell>{departmentOptions.find((department) => department.value === component.firstDepartment)?.label ?? component.firstDepartment}</TableCell>
                        <TableCell>
                          <Badge variant={component.isManufactured ? 'secondary' : 'outline'}>
                            {component.isManufactured ? 'Manufactured' : 'Purchased'}
                          </Badge>
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

function AssemblyTreeWorkspace({ tree, lineCount }: { tree: AssemblyTreeNode[]; lineCount: number }) {
  const totals = tree.reduce(
    (acc, node) => {
      const nodes = flattenAssemblyTree(node);
      acc.onHand += nodes.filter((item) => item.stockState === 'on-hand').length;
      acc.lowStock += nodes.filter((item) => item.stockState === 'low-stock').length;
      acc.blocked += nodes.filter((item) => item.stockState === 'blocked').length;
      return acc;
    },
    { onHand: 0, lowStock: 0, blocked: 0 },
  );

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-semibold text-slate-950">Assembly Tree</h2>
          <p className="text-sm text-slate-600">
            {lineCount} parts/request line{lineCount === 1 ? '' : 's'} mapped with BOM wizard children and inventory readiness.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <AssemblyStatusCount label="On hand" value={totals.onHand} state="on-hand" />
          <AssemblyStatusCount label="Low" value={totals.lowStock} state="low-stock" />
          <AssemblyStatusCount label="Blocked" value={totals.blocked} state="blocked" />
        </div>
      </div>

      {tree.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">
          Add parts/request lines to build an assembly tree.
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
  return (
    <AccordionItem value={node.id} className="border-0">
      <AccordionTrigger className="gap-4 px-4 text-left hover:no-underline">
        <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-[minmax(220px,1fr)_auto_auto_auto] md:items-center">
          <div className="min-w-0" style={{ paddingLeft: `${depth * 16}px` }}>
            <div className="truncate font-semibold text-slate-950">{node.partNumber}</div>
            <div className="truncate text-sm font-normal text-slate-600">{node.description}</div>
          </div>
          <div className="text-sm font-normal tabular-nums text-slate-600">
            Req {node.quantityRequired.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
          <div className="text-sm font-normal tabular-nums text-slate-600">
            On hand {node.availableQuantity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
          <AssemblyStockBadge node={node} />
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">
        {node.children.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
            No BOM wizard children configured.
          </div>
        ) : (
          <Accordion type="multiple" className="rounded-md border border-slate-200">
            {node.children.map((child) => (
              <AssemblyTreeAccordionNode key={child.id} node={child} depth={depth + 1} />
            ))}
          </Accordion>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function flattenAssemblyTree(node: AssemblyTreeNode): AssemblyTreeNode[] {
  return [node, ...node.children.flatMap(flattenAssemblyTree)];
}

function AssemblyStatusCount({ label, value, state }: { label: string; value: number; state: AssemblyStockState }) {
  return (
    <div className={cn('rounded-md border px-3 py-2 text-center', assemblyStatusClassName(state, 'panel'))}>
      <div className="text-xs font-medium uppercase text-slate-600">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-slate-950">{value}</div>
    </div>
  );
}

function AssemblyStockBadge({ node }: { node: AssemblyTreeNode }) {
  const label =
    node.stockState === 'on-hand'
      ? 'On hand'
      : node.stockState === 'low-stock'
        ? 'Low stock'
        : 'Blocked';

  return (
    <Badge className={cn('justify-center whitespace-nowrap border', assemblyStatusClassName(node.stockState, 'badge'))}>
      {label}
    </Badge>
  );
}

function assemblyStatusClassName(state: AssemblyStockState, surface: 'badge' | 'panel') {
  if (state === 'on-hand') {
    return surface === 'badge'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50'
      : 'border-emerald-200 bg-emerald-50';
  }
  if (state === 'low-stock') {
    return surface === 'badge'
      ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50'
      : 'border-amber-200 bg-amber-50';
  }
  return surface === 'badge'
    ? 'border-red-200 bg-red-50 text-red-800 hover:bg-red-50'
    : 'border-red-200 bg-red-50';
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
