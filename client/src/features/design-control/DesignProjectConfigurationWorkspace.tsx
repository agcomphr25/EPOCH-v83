import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { expandDesignControlTerm } from '@shared/designControlTerminology';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Plus,
  Search,
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
import { Textarea } from '@/components/ui/textarea';
import { usePermissions } from '@/hooks/usePermissions';

type ItemType =
  | 'PRODUCT'
  | 'ASSEMBLY'
  | 'SUBASSEMBLY'
  | 'MANUFACTURED_PART'
  | 'PURCHASED_COMPONENT'
  | 'TOOLING'
  | 'SOFTWARE';
interface ConfigurationItem {
  id: string;
  configurationItemNumber: string;
  partNumber: string;
  title: string;
  itemType: ItemType;
  makeBuyDesignation: string;
  designResponsibility?: string | null;
  inventoryItemId?: number | null;
  lifecycleStatus: string;
}
interface Relationship {
  id: string;
  parentConfigurationItemId: string;
  childConfigurationItemId: string;
  quantity: string;
  unitOfMeasure: string;
  sortOrder: number;
}
interface Revision {
  id: string;
  configurationItemId: string;
  revisionIdentifier: string;
  revisionSequence: number;
  lifecycleState: string;
  changeSummary: string;
  effectivityStart?: string | null;
  effectivityEnd?: string | null;
  sourceEcrId?: string | null;
  sourceEcnId?: string | null;
}
interface CoverageEntry {
  role: string;
  status: string;
  applicability?: {
    id: string;
    decision: string;
    justification?: string;
    approvalStatus: string;
  } | null;
  artifact?: {
    sourceModule: string;
    sourceRecordId: string;
    artifactNumber: string;
    revisionSnapshot: string;
  } | null;
}
interface Summary {
  established: boolean;
  message?: string;
  workspace?: { configurationStatus: string };
  authoritativeDesignControl?: {
    id: string;
    title?: string;
    status?: string;
  } | null;
  currentEngineeringRelease?: {
    release_revision: string;
    release_status: string;
  } | null;
  parts?: Array<{
    item: ConfigurationItem;
    currentRevision: Revision | null;
    coverage: CoverageEntry[];
  }>;
  totals?: Record<string, number | boolean>;
}

const steps = [
  {
    title: 'Product Structure',
    help: 'Build the product, its assemblies, and the components that belong beneath them.',
  },
  {
    title: 'Parts and Revisions',
    help: 'Identify the current controlled revision and proposed effectivity for each part.',
  },
  {
    title: 'Make/Buy Decisions',
    help: 'Assign whether each part is manufactured here or purchased, and who owns the design.',
  },
  {
    title: 'Documentation Requirements',
    help: 'Decide which manufacturing and quality records each part requires.',
  },
  {
    title: 'Coverage Review',
    help: 'Review authoritative evidence links and resolve missing or pending coverage.',
  },
];
const labels: Record<string, string> = {
  DRAWING_CAD: `Drawing / ${expandDesignControlTerm('CAD')}`,
  BOM: expandDesignControlTerm('BOM'),
  ROUTING: 'Routing',
  TRAVELER: 'Traveler',
  WORK_INSTRUCTION: 'Work instructions',
  INSPECTION_PLAN: 'Inspection plan',
  TEST_PROCEDURE: 'Test procedure',
  MATERIAL_SPECIFICATION: 'Material specification',
  TOOLING_FIXTURE: 'Tooling / fixtures',
  CNC_PROGRAM: 'CNC program',
  SUPPLIER_REQUIREMENT: 'Supplier requirements',
  TRAINING_CERTIFICATION: 'Training / certification',
  PACKAGING_SHIPPING: 'Packaging / shipping',
};

async function requestJson(
  path: string,
  init?: { method?: string; body?: string; headers?: Record<string, string> }
) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload.message ?? payload.error ?? 'Request failed');
  return payload;
}

export function DesignProjectConfigurationWorkspace({
  projectId,
  projectName,
  designControlReadiness,
}: {
  projectId: string;
  projectName: string;
  designControlReadiness: string;
}) {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canEdit = can('design.configuration.edit');
  const canApprove = can('design.configuration.applicability.approve');
  const [step, setStep] = useState(0);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState('');
  const [itemForm, setItemForm] = useState({
    configurationItemNumber: '',
    partNumber: '',
    title: '',
    itemType: 'MANUFACTURED_PART' as ItemType,
    parentId: '',
    quantity: '1',
    unitOfMeasure: 'EA',
    inventoryItemId: '',
  });
  const [revisionForm, setRevisionForm] = useState({
    revisionIdentifier: '',
    changeSummary: '',
    predecessorRevisionId: '',
    effectivityStart: '',
    effectivityEnd: '',
    sourceEcrId: '',
    sourceEcnId: '',
  });

  const summaryQuery = useQuery<Summary>({
    queryKey: ['/api/rd-projects', projectId, 'configuration', 'summary'],
    queryFn: () =>
      requestJson(
        `/api/rd-projects/${encodeURIComponent(projectId)}/configuration/summary`
      ),
    retry: false,
  });
  const treeQuery = useQuery<{
    items: ConfigurationItem[];
    relationships: Relationship[];
    revisions: Revision[];
  }>({
    queryKey: ['/api/rd-projects', projectId, 'configuration', 'tree'],
    queryFn: () =>
      requestJson(
        `/api/rd-projects/${encodeURIComponent(projectId)}/configuration/tree`
      ),
    enabled: summaryQuery.data?.established === true,
    retry: false,
  });
  const summary = summaryQuery.data;
  const items = treeQuery.data?.items ?? [];
  const relationships = useMemo(
    () => treeQuery.data?.relationships ?? [],
    [treeQuery.data?.relationships]
  );
  const revisions = treeQuery.data?.revisions ?? [];
  const selectedItem =
    items.find((item) => item.id === selectedItemId) ?? items[0] ?? null;
  const selectedCoverage = summary?.parts?.find(
    (part) => part.item.id === selectedItem?.id
  );
  const childrenByParent = useMemo(() => {
    const map = new Map<string, Relationship[]>();
    for (const relation of relationships)
      map.set(
        relation.parentConfigurationItemId,
        [...(map.get(relation.parentConfigurationItemId) ?? []), relation].sort(
          (a, b) => a.sortOrder - b.sortOrder
        )
      );
    return map;
  }, [relationships]);
  const childIds = new Set(
    relationships.map((relation) => relation.childConfigurationItemId)
  );
  const roots = items.filter((item) => !childIds.has(item.id));

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['/api/rd-projects', projectId, 'configuration', 'summary'],
      }),
      queryClient.invalidateQueries({
        queryKey: ['/api/rd-projects', projectId, 'configuration', 'tree'],
      }),
    ]);
  }
  async function mutate(path: string, method: string, body?: unknown) {
    setNotice('');
    try {
      const result = await requestJson(path, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      await refresh();
      setNotice('Draft saved.');
      return result;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to save');
      return null;
    }
  }
  async function activate() {
    await mutate(
      `/api/rd-projects/${encodeURIComponent(projectId)}/configuration/activate`,
      'POST',
      {}
    );
  }
  async function createItem() {
    const created = await mutate(
      `/api/rd-projects/${encodeURIComponent(projectId)}/configuration/items`,
      'POST',
      {
        configurationItemNumber: itemForm.configurationItemNumber,
        partNumber: itemForm.partNumber,
        title: itemForm.title,
        itemType: itemForm.itemType,
        inventoryItemId: itemForm.inventoryItemId
          ? Number(itemForm.inventoryItemId)
          : null,
        makeBuyDesignation:
          itemForm.itemType === 'PURCHASED_COMPONENT'
            ? 'BUY'
            : itemForm.itemType === 'MANUFACTURED_PART'
              ? 'MAKE'
              : 'UNDETERMINED',
        parentConfigurationItemId: itemForm.parentId || null,
        quantity: itemForm.parentId ? Number(itemForm.quantity) : undefined,
        unitOfMeasure: itemForm.parentId ? itemForm.unitOfMeasure : undefined,
        sortOrder: itemForm.parentId
          ? (childrenByParent.get(itemForm.parentId)?.length ?? 0)
          : undefined,
      }
    );
    if (created) {
      setSelectedItemId(created.item.id);
      setItemForm({
        configurationItemNumber: '',
        partNumber: '',
        title: '',
        itemType: 'MANUFACTURED_PART',
        parentId: '',
        quantity: '1',
        unitOfMeasure: 'EA',
        inventoryItemId: '',
      });
    }
  }
  async function updateItem(fields: Partial<ConfigurationItem>) {
    if (selectedItem)
      await mutate(
        `/api/rd-projects/${encodeURIComponent(projectId)}/configuration/items/${selectedItem.id}`,
        'PATCH',
        fields
      );
  }
  async function createRevision() {
    if (!selectedItem) return;
    await mutate(
      `/api/rd-projects/${encodeURIComponent(projectId)}/configuration/items/${selectedItem.id}/revisions`,
      'POST',
      Object.fromEntries(
        Object.entries(revisionForm).map(([key, value]) => [key, value || null])
      )
    );
    setRevisionForm({
      revisionIdentifier: '',
      changeSummary: '',
      predecessorRevisionId: '',
      effectivityStart: '',
      effectivityEnd: '',
      sourceEcrId: '',
      sourceEcnId: '',
    });
  }
  async function setRequirement(
    role: string,
    decision: string,
    justification?: string
  ) {
    if (selectedItem)
      await mutate(
        `/api/rd-projects/${encodeURIComponent(projectId)}/configuration/items/${selectedItem.id}/applicability/${role}`,
        'PUT',
        { decision, justification: justification || null }
      );
  }

  function TreeNode({
    item,
    depth = 0,
  }: {
    item: ConfigurationItem;
    depth?: number;
  }) {
    const relations = childrenByParent.get(item.id) ?? [];
    const isOpen = expanded.has(item.id);
    const matches =
      !search ||
      `${item.partNumber} ${item.title}`
        .toLowerCase()
        .includes(search.toLowerCase());
    const descendantMatches = relations.some((relation) => {
      const child = items.find(
        (candidate) => candidate.id === relation.childConfigurationItemId
      );
      return (
        child &&
        `${child.partNumber} ${child.title}`
          .toLowerCase()
          .includes(search.toLowerCase())
      );
    });
    if (!matches && !descendantMatches) return null;
    return (
      <div>
        <button
          className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-muted ${selectedItem?.id === item.id ? 'bg-blue-50 ring-1 ring-blue-200' : ''}`}
          style={{ paddingLeft: 8 + depth * 18 }}
          onClick={() => setSelectedItemId(item.id)}
        >
          <span
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((current) => {
                const next = new Set(current);
                next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                return next;
              });
            }}
          >
            {relations.length ? (
              isOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )
            ) : (
              <span className="inline-block w-4" />
            )}
          </span>
          <span className="font-medium">{item.partNumber}</span>
          <span className="truncate text-muted-foreground">{item.title}</span>
          <Badge variant="outline" className="ml-auto">
            {item.itemType.replaceAll('_', ' ')}
          </Badge>
        </button>
        {(isOpen || Boolean(search)) &&
          relations.map((relation) => {
            const child = items.find(
              (candidate) => candidate.id === relation.childConfigurationItemId
            );
            return child ? (
              <TreeNode key={relation.id} item={child} depth={depth + 1} />
            ) : null;
          })}
      </div>
    );
  }

  if (summaryQuery.isLoading)
    return (
      <Card>
        <CardContent className="py-8">
          Loading controlled configuration…
        </CardContent>
      </Card>
    );
  if (!summary?.established)
    return (
      <Card className="border-amber-200">
        <CardHeader>
          <CardTitle>Part &amp; Assembly Configuration</CardTitle>
          <CardDescription>
            {summary?.message ??
              'Configuration has not been established for this legacy project.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Starting is explicit and audited. It does not create inferred links,
            alter production, or enable release blocking.
          </p>
          {canEdit && (
            <Button onClick={activate}>Start Controlled Configuration</Button>
          )}
        </CardContent>
      </Card>
    );

  const totals = summary.totals ?? {};
  return (
    <div className="space-y-4" data-testid={`configuration-step-${step + 1}`}>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Part &amp; Assembly Configuration</CardTitle>
              <CardDescription>
                {projectId} · {projectName}
              </CardDescription>
            </div>
            <Badge>{summary.workspace?.configurationStatus ?? 'DRAFT'}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <div>
            <p className="text-xs text-muted-foreground">Engineering release</p>
            <p className="font-medium">
              {summary.currentEngineeringRelease
                ? `Revision ${summary.currentEngineeringRelease.release_revision} · ${summary.currentEngineeringRelease.release_status}`
                : 'No current release'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              Authoritative Design Control
            </p>
            <p className="font-medium">
              {summary.authoritativeDesignControl?.title ?? 'Not initialized'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              Design Control readiness
            </p>
            <p className="font-medium">
              {designControlReadiness.replaceAll('_', ' ')}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              Configuration coverage
            </p>
            <Progress
              className="mt-2"
              value={Number(totals.completenessPercentage ?? 0)}
            />
            <p className="mt-1 text-xs">
              {String(totals.completenessPercentage ?? 0)}% informational only
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              Production enforcement
            </p>
            <p className="font-medium text-emerald-700">Disabled in Phase 2</p>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-2 md:grid-cols-5">
        {steps.map((entry, index) => (
          <button
            key={entry.title}
            onClick={() => setStep(index)}
            className={`rounded-lg border p-3 text-left ${step === index ? 'border-blue-500 bg-blue-50' : 'bg-card'}`}
          >
            <span className="text-xs text-muted-foreground">
              Step {index + 1}
            </span>
            <p className="font-medium">{entry.title}</p>
          </button>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{steps[step].title}</CardTitle>
          <CardDescription>{steps[step].help}</CardDescription>
        </CardHeader>
        <CardContent>
          {step === 0 && (
            <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search part number or name"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <div className="max-h-[520px] overflow-auto rounded border p-2">
                  {roots.length ? (
                    roots.map((item) => <TreeNode key={item.id} item={item} />)
                  ) : (
                    <p className="p-6 text-center text-sm text-muted-foreground">
                      Add the top-level product to begin the structure.
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-3 rounded border p-4">
                <h3 className="font-semibold">
                  <Plus className="mr-2 inline h-4 w-4" />
                  Add product structure item
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Label>
                    Configuration number
                    <Input
                      value={itemForm.configurationItemNumber}
                      onChange={(e) =>
                        setItemForm({
                          ...itemForm,
                          configurationItemNumber: e.target.value,
                        })
                      }
                    />
                  </Label>
                  <Label>
                    Part number
                    <Input
                      value={itemForm.partNumber}
                      onChange={(e) =>
                        setItemForm({ ...itemForm, partNumber: e.target.value })
                      }
                    />
                  </Label>
                </div>
                <Label>
                  Part name
                  <Input
                    value={itemForm.title}
                    onChange={(e) =>
                      setItemForm({ ...itemForm, title: e.target.value })
                    }
                  />
                </Label>
                <Label>
                  Type
                  <Select
                    value={itemForm.itemType}
                    onValueChange={(value: ItemType) =>
                      setItemForm({ ...itemForm, itemType: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        'PRODUCT',
                        'ASSEMBLY',
                        'SUBASSEMBLY',
                        'MANUFACTURED_PART',
                        'PURCHASED_COMPONENT',
                        'TOOLING',
                        'SOFTWARE',
                      ].map((type) => (
                        <SelectItem key={type} value={type}>
                          {type.replaceAll('_', ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Label>
                <Label>
                  Parent assembly
                  <Select
                    value={itemForm.parentId || 'root'}
                    onValueChange={(value) =>
                      setItemForm({
                        ...itemForm,
                        parentId: value === 'root' ? '' : value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="root">Top level</SelectItem>
                      {items
                        .filter((item) =>
                          ['PRODUCT', 'ASSEMBLY', 'SUBASSEMBLY'].includes(
                            item.itemType
                          )
                        )
                        .map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.partNumber} — {item.title}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  <Label>
                    Quantity
                    <Input
                      type="number"
                      min="0.000001"
                      value={itemForm.quantity}
                      onChange={(e) =>
                        setItemForm({ ...itemForm, quantity: e.target.value })
                      }
                    />
                  </Label>
                  <Label>
                    Unit
                    <Input
                      value={itemForm.unitOfMeasure}
                      onChange={(e) =>
                        setItemForm({
                          ...itemForm,
                          unitOfMeasure: e.target.value,
                        })
                      }
                    />
                  </Label>
                  <Label>
                    Inventory ID
                    <Input
                      type="number"
                      value={itemForm.inventoryItemId}
                      onChange={(e) =>
                        setItemForm({
                          ...itemForm,
                          inventoryItemId: e.target.value,
                        })
                      }
                    />
                  </Label>
                </div>
                <Button
                  disabled={
                    !canEdit ||
                    !itemForm.partNumber ||
                    !itemForm.title ||
                    !itemForm.configurationItemNumber
                  }
                  onClick={createItem}
                >
                  Add item
                </Button>
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
              <PartList
                items={items}
                selectedId={selectedItem?.id}
                onSelect={setSelectedItemId}
              />
              <div className="space-y-4 rounded border p-4">
                {selectedItem ? (
                  <>
                    <div>
                      <h3 className="font-semibold">
                        {selectedItem.partNumber} — {selectedItem.title}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {selectedItem.itemType.replaceAll('_', ' ')} ·{' '}
                        {selectedItem.lifecycleStatus}
                      </p>
                    </div>
                    <div className="space-y-2">
                      {revisions
                        .filter(
                          (revision) =>
                            revision.configurationItemId === selectedItem.id
                        )
                        .sort((a, b) => b.revisionSequence - a.revisionSequence)
                        .map((revision) => (
                          <div key={revision.id} className="rounded border p-3">
                            <div className="flex justify-between">
                              <span className="font-medium">
                                Revision {revision.revisionIdentifier}
                              </span>
                              <Badge variant="outline">
                                {revision.lifecycleState}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {revision.changeSummary}
                            </p>
                          </div>
                        ))}
                    </div>
                    <h4 className="font-medium">Create draft revision</h4>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Label>
                        Revision
                        <Input
                          value={revisionForm.revisionIdentifier}
                          onChange={(e) =>
                            setRevisionForm({
                              ...revisionForm,
                              revisionIdentifier: e.target.value,
                            })
                          }
                        />
                      </Label>
                      <Label>
                        Predecessor
                        <Select
                          value={revisionForm.predecessorRevisionId || 'none'}
                          onValueChange={(value) =>
                            setRevisionForm({
                              ...revisionForm,
                              predecessorRevisionId:
                                value === 'none' ? '' : value,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              Initial revision
                            </SelectItem>
                            {revisions
                              .filter(
                                (revision) =>
                                  revision.configurationItemId ===
                                  selectedItem.id
                              )
                              .map((revision) => (
                                <SelectItem
                                  key={revision.id}
                                  value={revision.id}
                                >
                                  {revision.revisionIdentifier} (
                                  {revision.lifecycleState})
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </Label>
                    </div>
                    <Label>
                      Change summary
                      <Textarea
                        value={revisionForm.changeSummary}
                        onChange={(e) =>
                          setRevisionForm({
                            ...revisionForm,
                            changeSummary: e.target.value,
                          })
                        }
                      />
                    </Label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Label>
                        Proposed effectivity start
                        <Input
                          value={revisionForm.effectivityStart}
                          onChange={(e) =>
                            setRevisionForm({
                              ...revisionForm,
                              effectivityStart: e.target.value,
                            })
                          }
                        />
                      </Label>
                      <Label>
                        Proposed effectivity end
                        <Input
                          value={revisionForm.effectivityEnd}
                          onChange={(e) =>
                            setRevisionForm({
                              ...revisionForm,
                              effectivityEnd: e.target.value,
                            })
                          }
                        />
                      </Label>
                      <Label>
                        {expandDesignControlTerm('ECR')} identifier
                        <Input
                          value={revisionForm.sourceEcrId}
                          onChange={(e) =>
                            setRevisionForm({
                              ...revisionForm,
                              sourceEcrId: e.target.value,
                            })
                          }
                        />
                      </Label>
                      <Label>
                        {expandDesignControlTerm('ECN')} identifier
                        <Input
                          value={revisionForm.sourceEcnId}
                          onChange={(e) =>
                            setRevisionForm({
                              ...revisionForm,
                              sourceEcnId: e.target.value,
                            })
                          }
                        />
                      </Label>
                    </div>
                    <Button
                      disabled={
                        !canEdit ||
                        !revisionForm.revisionIdentifier ||
                        !revisionForm.changeSummary
                      }
                      onClick={createRevision}
                    >
                      Create draft revision
                    </Button>
                  </>
                ) : (
                  <p>Select a part.</p>
                )}
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
              <PartList
                items={items}
                selectedId={selectedItem?.id}
                onSelect={setSelectedItemId}
              />
              <div className="space-y-4 rounded border p-4">
                {selectedItem ? (
                  <>
                    <h3 className="font-semibold">
                      {selectedItem.partNumber} — {selectedItem.title}
                    </h3>
                    <Label>
                      Make / buy decision
                      <Select
                        value={selectedItem.makeBuyDesignation}
                        disabled={!canEdit}
                        onValueChange={(value) =>
                          updateItem({ makeBuyDesignation: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MAKE">
                            Make — manufactured here
                          </SelectItem>
                          <SelectItem value="BUY">
                            Buy — purchased component
                          </SelectItem>
                          <SelectItem value="UNDETERMINED">
                            Decision needed
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </Label>
                    <Label>
                      Design responsibility
                      <Input
                        disabled={!canEdit}
                        defaultValue={selectedItem.designResponsibility ?? ''}
                        onBlur={(event) =>
                          updateItem({
                            designResponsibility: event.target.value,
                          })
                        }
                        placeholder="Engineering owner, supplier, or team"
                      />
                    </Label>
                    <Label>
                      Linked inventory item
                      <Input
                        disabled={!canEdit}
                        type="number"
                        defaultValue={selectedItem.inventoryItemId ?? ''}
                        onBlur={(event) =>
                          updateItem({
                            inventoryItemId: event.target.value
                              ? Number(event.target.value)
                              : null,
                          })
                        }
                        placeholder="Inventory item ID (optional)"
                      />
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Save Draft occurs when a field changes. Inventory linkage
                      is explicit; no part-number match is used.
                    </p>
                  </>
                ) : (
                  <p>Select a part.</p>
                )}
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
              <PartList
                items={items.filter((item) =>
                  ['MANUFACTURED_PART', 'PURCHASED_COMPONENT'].includes(
                    item.itemType
                  )
                )}
                selectedId={selectedItem?.id}
                onSelect={setSelectedItemId}
              />
              <div className="space-y-2">
                {selectedCoverage?.coverage.map((entry) => (
                  <RequirementRow
                    key={entry.role}
                    entry={entry}
                    canEdit={canEdit}
                    canApprove={canApprove}
                    onSet={(decision, justification) =>
                      setRequirement(entry.role, decision, justification)
                    }
                    onSubmit={() =>
                      entry.applicability &&
                      mutate(
                        `/api/rd-projects/${projectId}/configuration/applicability/${entry.applicability.id}/submit`,
                        'POST',
                        {}
                      )
                    }
                    onApprove={() =>
                      entry.applicability &&
                      mutate(
                        `/api/rd-projects/${projectId}/configuration/applicability/${entry.applicability.id}/approve`,
                        'POST',
                        {}
                      )
                    }
                  />
                )) ?? (
                  <p className="text-sm text-muted-foreground">
                    Select a manufactured part or purchased component.
                  </p>
                )}
              </div>
            </div>
          )}
          {step === 4 && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric
                  label="Configuration items"
                  value={totals.totalConfigurationItems}
                />
                <Metric
                  label="Parts missing revisions"
                  value={totals.partsMissingRevisions}
                />
                <Metric
                  label="Pending N/A approvals"
                  value={totals.pendingNotApplicableApprovals}
                />
                <Metric
                  label="Completeness"
                  value={`${totals.completenessPercentage ?? 0}%`}
                />
              </div>
              {summary.parts?.map((part) => (
                <Card key={part.item.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      {part.item.partNumber} — {part.item.title}
                    </CardTitle>
                    <CardDescription>
                      Revision{' '}
                      {part.currentRevision?.revisionIdentifier ?? 'missing'} ·
                      evaluated separately for this part
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {part.coverage.map((entry) => (
                      <Badge
                        key={entry.role}
                        variant={
                          entry.status === 'Missing' ||
                          entry.status.includes('Required')
                            ? 'destructive'
                            : 'outline'
                        }
                      >
                        {labels[entry.role]}: {entry.status}
                        {entry.artifact && (
                          <a
                            className="ml-1"
                            href={`/${entry.artifact.sourceModule}/${entry.artifact.sourceRecordId}`}
                          >
                            <ExternalLink className="inline h-3 w-3" />
                          </a>
                        )}
                      </Badge>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      <div className="flex flex-wrap justify-between gap-2">
        <Button
          variant="outline"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          Return to project
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refresh}>
            Save Draft
          </Button>
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          {step < steps.length - 1 && (
            <Button onClick={() => setStep(step + 1)}>
              Next: {steps[step + 1].title}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function PartList({
  items,
  selectedId,
  onSelect,
}: {
  items: ConfigurationItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="max-h-[520px] space-y-1 overflow-auto rounded border p-2">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onSelect(item.id)}
          className={`w-full rounded p-3 text-left hover:bg-muted ${selectedId === item.id ? 'bg-blue-50 ring-1 ring-blue-200' : ''}`}
        >
          <span className="font-medium">{item.partNumber}</span>
          <span className="ml-2 text-sm text-muted-foreground">
            {item.title}
          </span>
          <Badge variant="outline" className="float-right">
            {item.makeBuyDesignation}
          </Badge>
        </button>
      ))}
    </div>
  );
}
function Metric({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{String(value ?? 0)}</p>
    </div>
  );
}
function RequirementRow({
  entry,
  canEdit,
  canApprove,
  onSet,
  onSubmit,
  onApprove,
}: {
  entry: CoverageEntry;
  canEdit: boolean;
  canApprove: boolean;
  onSet: (decision: string, justification?: string) => void;
  onSubmit: () => void;
  onApprove: () => void;
}) {
  const [justification, setJustification] = useState(
    entry.applicability?.justification ?? ''
  );
  return (
    <div className="rounded border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{labels[entry.role] ?? entry.role}</p>
          <p className="text-xs text-muted-foreground">
            Coverage: {entry.status}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!canEdit}
            onClick={() => onSet('REQUIRED')}
          >
            Required
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!canEdit}
            onClick={() => onSet('OPTIONAL')}
          >
            Optional
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!canEdit || !justification.trim()}
            onClick={() => onSet('NOT_APPLICABLE', justification)}
          >
            Not Applicable
          </Button>
          {entry.applicability?.approvalStatus === 'DRAFT' && (
            <Button size="sm" disabled={!canEdit} onClick={onSubmit}>
              Submit approval
            </Button>
          )}
          {entry.applicability?.approvalStatus === 'PENDING' && (
            <Button size="sm" disabled={!canApprove} onClick={onApprove}>
              Approve N/A
            </Button>
          )}
        </div>
      </div>
      <Input
        className="mt-2"
        value={justification}
        onChange={(e) => setJustification(e.target.value)}
        placeholder="Justification required for Not Applicable"
      />
    </div>
  );
}
