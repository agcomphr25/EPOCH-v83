import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  Search,
  Download,
  ShieldCheck,
  GitBranch,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  FileDown,
  ChevronRight,
  ChevronDown,
  PenTool,
} from 'lucide-react';

type TraceabilitySearchKey =
  | 'lotIcn'
  | 'rollNumber'
  | 'travelerNumber'
  | 'workOrder'
  | 'chargeCode'
  | 'project'
  | 'operatorBadge'
  | 'ncrId'
  | 'barcode';

const SEARCH_KEYS: Array<{ value: TraceabilitySearchKey; label: string; placeholder: string }> = [
  { value: 'lotIcn', label: 'Material ICN', placeholder: 'ICN-MAT-20251223-000184' },
  { value: 'rollNumber', label: 'Roll #', placeholder: 'ROLL-001 or fabric ICN' },
  { value: 'travelerNumber', label: 'Traveler #', placeholder: 'TRV-000123' },
  { value: 'workOrder', label: 'WAD / Work Order #', placeholder: 'WO-000456' },
  { value: 'chargeCode', label: 'Charge Code', placeholder: 'DLM-100' },
  { value: 'project', label: 'Project ID', placeholder: 'uuid' },
  { value: 'operatorBadge', label: 'Operator Badge', placeholder: 'badge scan code or employee code' },
  { value: 'ncrId', label: 'NCR # / RMA', placeholder: '1234 or RMA-2024-001' },
  { value: 'barcode', label: 'Barcode', placeholder: 'lot or part barcode' },
];

interface SourceLink {
  module: string;
  recordId: string | null;
  href: string | null;
  label: string;
}

interface TraceabilityNode {
  id: string;
  transactionNumber: string;
  step: string;
  transactionType: string;
  occurredAt: string;
  agPartNumber: string;
  partName: string | null;
  lotIcn: string | null;
  locationId: string | null;
  quantityDelta: string;
  quantityBefore: string;
  quantityAfter: string;
  unitOfMeasure: string;
  statusBefore: string | null;
  statusAfter: string | null;
  performedByDisplayName: string;
  approvedByDisplayName: string | null;
  approvalId: string | null;
  digitalSignatureId: string | null;
  travelerNumber: string | null;
  travelerStepName: string | null;
  workOrderNumber: string | null;
  chargeCode: string | null;
  projectId: string | null;
  projectName: string | null;
  reasonCode: string | null;
  notes: string | null;
  sourceModule: string;
  sourceRecordId: string | null;
  sourceLink: SourceLink;
  ledgerLink: string;
  eventHash: string;
  reversedTransactionId: string | null;
  branchKey: string;
}

interface TraceabilityEdge {
  from: string;
  to: string;
  kind: 'lineage' | 'reversal';
}

interface TraceabilityChain {
  query: { key: TraceabilitySearchKey; value: string };
  resolved: {
    label: string;
    detail?: string;
    matchedEntities: Array<{ kind: string; id: string; label: string; href: string | null }>;
    notFound?: boolean;
  };
  nodes: TraceabilityNode[];
  edges: TraceabilityEdge[];
  branches: Array<{ key: string; label: string; rootIds: string[]; nodeIds: string[] }>;
  travelerCaptures: TravelerMaterialCapture[];
  expiringMaterials: ExpiringMaterial[];
  ncrs: Array<{
    id: number;
    rmaNumber: string | null;
    issueCause: string;
    disposition: string;
    status: string | null;
    dispositionDate: string;
    href: string;
  }>;
  generatedAt: string;
}

interface TravelerMaterialCapture {
  id: string;
  source: 'p2_serialized_item_traceability' | 'p2_work_tasks.traceability_data';
  serializedItemId: string;
  serialNumber: string;
  barcode: string;
  travelerBarcode: string | null;
  poNumber: string;
  partNumber: string;
  partName: string;
  status: string;
  currentDepartment: string;
  department: string;
  travelerId: string | null;
  travelerNumber: string | null;
  travelerStatus: string | null;
  workOrderNumber: string | null;
  projectName: string | null;
  inventoryPartNumber: string | null;
  traceabilityType: string;
  traceabilityLabel: string;
  traceabilityValue: string;
  recordedBy: string;
  recordedAt: string;
  materialIcn: string | null;
  materialRollNumber: string | null;
  materialExpirationDate: string | null;
  materialStatus: string | null;
  materialLocation: string | null;
  href: string;
}

interface ExpiringMaterial {
  id: string;
  source: 'material_lots' | 'cutting_fabric_inventory';
  internalControlNumber: string | null;
  rollNumber: string | null;
  materialPartNumber: string | null;
  materialName: string | null;
  status: string | null;
  location: string | null;
  expirationDate: string;
  daysUntilExpiration: number;
  quantityRemaining: string | null;
  href: string | null;
}

interface VerifyResponse {
  checked: number;
  ok: boolean;
  mismatches: Array<{ id: string; transactionNumber: string; expectedHash: string; actualHash: string }>;
  verifiedAt: string;
}

const STEP_COLORS: Record<string, string> = {
  RECEIVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  PUT_AWAY: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
  TRANSFERRED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  RESERVED: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200',
  UNRESERVED: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-200',
  ISSUED: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  CONSUMED: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200',
  STATUS_CHANGED: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-200',
  QUARANTINED: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
  RELEASED: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-200',
  SCRAPPED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
  ADJUSTED: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200',
  COUNT_ADJUSTED: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200',
  SPLIT: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-200',
  MERGED: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-200',
  EXPIRED: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200',
  RETURNED: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-200',
  REVERSED: 'bg-gray-200 text-gray-900 dark:bg-gray-800 dark:text-gray-100',
};

function fmt(d: string) {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleString();
}

interface TreeBuild {
  childrenOf: Map<string, Array<{ childId: string; kind: 'lineage' | 'reversal' }>>;
}

function buildTree(edges: TraceabilityEdge[]): TreeBuild {
  const childrenOf = new Map<string, Array<{ childId: string; kind: 'lineage' | 'reversal' }>>();
  for (const e of edges) {
    const arr = childrenOf.get(e.from) ?? [];
    arr.push({ childId: e.to, kind: e.kind });
    childrenOf.set(e.from, arr);
  }
  return { childrenOf };
}

interface TreeNodeRowProps {
  node: TraceabilityNode;
  depth: number;
  childrenOf: TreeBuild['childrenOf'];
  nodeMap: Map<string, TraceabilityNode>;
  onSelect: (n: TraceabilityNode) => void;
  edgeKind?: 'lineage' | 'reversal';
  visited: Set<string>;
  verifyStatus: 'unknown' | 'ok' | 'mismatch';
  mismatchSet: Set<string>;
}

function TreeNodeRow({
  node,
  depth,
  childrenOf,
  nodeMap,
  onSelect,
  edgeKind,
  visited,
  verifyStatus,
  mismatchSet,
}: TreeNodeRowProps) {
  const children = childrenOf.get(node.id) ?? [];
  const [expanded, setExpanded] = useState<boolean>(depth < 2); // first two levels open by default
  const hasChildren = children.length > 0;

  const isCycle = visited.has(node.id);
  const nextVisited = useMemo(() => {
    const s = new Set(visited);
    s.add(node.id);
    return s;
  }, [visited, node.id]);

  return (
    <div
      className="text-sm"
      style={{ paddingLeft: depth * 18 }}
      data-testid={`tree-node-${node.id}`}
    >
      <div
        className="flex items-start gap-2 py-1 hover:bg-accent/50 rounded cursor-pointer pr-2"
        onClick={() => onSelect(node)}
      >
        <button
          type="button"
          className="mt-0.5 h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          disabled={!hasChildren}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          data-testid={`button-toggle-${node.id}`}
        >
          {hasChildren ? (
            expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
          )}
        </button>
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {edgeKind === 'reversal' && (
            <Badge variant="destructive" className="text-[10px] uppercase">reverses</Badge>
          )}
          <Badge variant="outline" className={STEP_COLORS[node.step] ?? ''}>
            {node.step}
          </Badge>
          <span className="text-xs text-muted-foreground">{fmt(node.occurredAt)}</span>
          <span className="font-mono text-xs">{node.agPartNumber}</span>
          <span
            className={`font-mono text-xs ${
              Number(node.quantityDelta) < 0
                ? 'text-red-600'
                : Number(node.quantityDelta) > 0
                ? 'text-green-700'
                : ''
            }`}
          >
            Δ {node.quantityDelta} {node.unitOfMeasure}
          </span>
          <span className="text-xs">by {node.performedByDisplayName}</span>
          {node.approvedByDisplayName && (
            <Badge variant="secondary" className="text-[10px]">
              <PenTool className="h-3 w-3 mr-1" />
              approved {node.approvedByDisplayName}
            </Badge>
          )}
          {node.digitalSignatureId && (
            <Badge variant="secondary" className="text-[10px]">signed</Badge>
          )}
          {node.locationId && (
            <span className="text-xs text-muted-foreground">@ {node.locationId}</span>
          )}
          {verifyStatus !== 'unknown' && (
            verifyStatus === 'ok' ? (
              <Badge
                variant="outline"
                className="border-green-300 text-green-700 dark:border-green-800 dark:text-green-300"
                data-testid={`status-verify-ok-${node.id}`}
              >
                <CheckCircle2 className="h-3 w-3 mr-1" /> verified
              </Badge>
            ) : (
              <Badge variant="destructive" data-testid={`status-verify-mismatch-${node.id}`}>
                <AlertTriangle className="h-3 w-3 mr-1" /> hash mismatch
              </Badge>
            )
          )}
        </div>
      </div>
      {hasChildren && expanded && !isCycle && (
        <div className="border-l border-muted ml-2.5">
          {children.map((c) => {
            const child = nodeMap.get(c.childId);
            if (!child) return null;
            const childStatus: 'unknown' | 'ok' | 'mismatch' =
              verifyStatus === 'unknown'
                ? 'unknown'
                : mismatchSet.has(child.id)
                ? 'mismatch'
                : 'ok';
            return (
              <TreeNodeRow
                key={`${node.id}->${c.childId}`}
                node={child}
                depth={depth + 1}
                childrenOf={childrenOf}
                nodeMap={nodeMap}
                onSelect={onSelect}
                edgeKind={c.kind}
                visited={nextVisited}
                verifyStatus={childStatus}
                mismatchSet={mismatchSet}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

interface BranchPanelProps {
  branch: { key: string; label: string; rootIds: string[]; nodeIds: string[] };
  nodeMap: Map<string, TraceabilityNode>;
  childrenOf: TreeBuild['childrenOf'];
  onSelect: (n: TraceabilityNode) => void;
  hasVerified: boolean;
  mismatchSet: Set<string>;
}

function BranchPanel({ branch, nodeMap, childrenOf, onSelect, hasVerified, mismatchSet }: BranchPanelProps) {
  const [open, setOpen] = useState(true);
  return (
    <div data-testid={`branch-${branch.key}`}>
      <button
        type="button"
        className="w-full flex items-center gap-2 mb-2 text-left"
        onClick={() => setOpen((v) => !v)}
        data-testid={`button-branch-toggle-${branch.key}`}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <Badge variant="secondary" className="font-medium">{branch.label}</Badge>
        <span className="text-xs text-muted-foreground">
          {branch.nodeIds.length} step(s) · {branch.rootIds.length} root(s)
        </span>
      </button>
      {open && (
        <div className="border-l-2 border-muted pl-2">
          {branch.rootIds.map((rootId) => {
            const root = nodeMap.get(rootId);
            if (!root) return null;
            const status: 'unknown' | 'ok' | 'mismatch' = !hasVerified
              ? 'unknown'
              : mismatchSet.has(root.id)
              ? 'mismatch'
              : 'ok';
            return (
              <TreeNodeRow
                key={rootId}
                node={root}
                depth={0}
                childrenOf={childrenOf}
                nodeMap={nodeMap}
                onSelect={onSelect}
                visited={new Set()}
                verifyStatus={status}
                mismatchSet={mismatchSet}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function InventoryTraceabilityPage() {
  const { toast } = useToast();
  const [searchKey, setSearchKey] = useState<TraceabilitySearchKey>('lotIcn');
  const [searchValue, setSearchValue] = useState('');
  const [chain, setChain] = useState<TraceabilityChain | null>(null);
  const [selected, setSelected] = useState<TraceabilityNode | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);

  const placeholder = useMemo(
    () => SEARCH_KEYS.find((k) => k.value === searchKey)?.placeholder ?? '',
    [searchKey],
  );

  const nodeMap = useMemo(() => {
    const m = new Map<string, TraceabilityNode>();
    if (chain) for (const n of chain.nodes) m.set(n.id, n);
    return m;
  }, [chain]);

  const tree = useMemo(() => buildTree(chain?.edges ?? []), [chain?.edges]);

  const searchMutation = useMutation({
    mutationFn: async () => {
      const qs = new URLSearchParams({ key: searchKey, value: searchValue.trim() }).toString();
      return apiRequest<TraceabilityChain>(`/api/traceability/search?${qs}`);
    },
    onSuccess: (data) => {
      setChain(data);
      setVerifyResult(null);
      if (!data.nodes.length && !data.travelerCaptures?.length) {
        const notFound = data.resolved.notFound === true;
        toast({
          title: notFound
            ? `Not found: ${data.query.value}`
            : 'No traceability events found',
          description: notFound
            ? `No ${SEARCH_KEYS.find((k) => k.value === data.query.key)?.label ?? 'entity'} matching "${data.query.value}" exists in the system.`
            : data.resolved.matchedEntities.length
            ? 'Entity resolved but no inventory ledger events are linked yet.'
            : 'Could not resolve the search value to a known entity.',
          variant: notFound ? 'destructive' : 'default',
        });
      }
    },
    onError: (err: unknown) => {
      toast({
        title: 'Search failed',
        description: err instanceof Error ? err.message : 'Unable to build traceability chain.',
        variant: 'destructive',
      });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      // Always verify the *displayed* chain snapshot (entry IDs the user sees),
      // never the current search-form value, to keep verification consistent
      // with the rendered evidence.
      const entryIds = chain ? chain.nodes.map((n) => n.id) : [];
      return apiRequest<VerifyResponse>('/api/traceability/verify', {
        method: 'POST',
        body: JSON.stringify({ entryIds, key: searchKey, value: searchValue.trim() }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: (data) => {
      setVerifyResult(data);
      toast({
        title: data.ok ? 'Chain integrity verified' : 'Chain integrity FAILED',
        description: `${data.checked} entries checked — ${data.mismatches.length} mismatch(es)`,
        variant: data.ok ? 'default' : 'destructive',
      });
    },
    onError: (err: unknown) => {
      toast({
        title: 'Verification failed',
        description: err instanceof Error ? err.message : 'Unable to verify chain integrity.',
        variant: 'destructive',
      });
    },
  });

  const mismatchSet = useMemo<Set<string>>(() => {
    return new Set(verifyResult?.mismatches?.map((m) => m.id) ?? []);
  }, [verifyResult]);

  const exportFile = async (format: 'csv' | 'pdf') => {
    if (!chain || chain.nodes.length === 0) return;
    const k = encodeURIComponent(chain.query.key);
    const v = encodeURIComponent(chain.query.value);
    // POST the displayed snapshot's entryIds so the export evidence matches
    // the rendered chain exactly (not whatever the search form now contains).
    const entryIds = chain.nodes.map((n) => n.id);
    try {
      const res = await fetch(`/api/traceability/${k}/${v}/export?format=${format}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryIds }),
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const cd = res.headers.get('content-disposition') ?? '';
      const m = /filename="([^"]+)"/.exec(cd);
      const filename = m?.[1] ?? `traceability-${chain.query.key}.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({
        title: 'Export failed',
        description: err instanceof Error ? err.message : 'Could not download export.',
        variant: 'destructive',
      });
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchValue.trim()) return;
    searchMutation.mutate();
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Material Traceability Viewer</h1>
        <p className="text-sm text-muted-foreground">
          Reconstruct the end-to-end material chain from any anchor — lot ICN,
          traveler, WAD, charge code, work order, operator badge, NCR, project,
          or barcode. Read-only. Backed by the immutable inventory transaction ledger.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Search</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col md:flex-row gap-3 items-end">
            <div className="w-full md:w-64">
              <Label>Search by</Label>
              <Select value={searchKey} onValueChange={(v) => setSearchKey(v as TraceabilitySearchKey)}>
                <SelectTrigger data-testid="select-search-key">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEARCH_KEYS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label>Value</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder={placeholder}
                  className="pl-9"
                  data-testid="input-search-value"
                />
              </div>
            </div>
            <Button
              type="submit"
              disabled={!searchValue.trim() || searchMutation.isPending}
              data-testid="button-search"
            >
              <Search className="h-4 w-4 mr-1" />
              {searchMutation.isPending ? 'Searching…' : 'Build chain'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {searchMutation.isPending && (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {chain && !searchMutation.isPending && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="text-base" data-testid="text-resolved-label">
                    {chain.resolved.label}
                  </CardTitle>
                  {chain.resolved.detail && (
                    <p className="text-xs text-muted-foreground mt-1">{chain.resolved.detail}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {chain.nodes.length} ledger event(s) across {chain.branches.length} branch(es)
                    {chain.travelerCaptures.length > 0 && ` - ${chain.travelerCaptures.length} traveler material capture(s)`}
                    {chain.ncrs.length > 0 && ` · ${chain.ncrs.length} linked NCR(s)`}
                  </p>
                  {chain.resolved.matchedEntities.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {chain.resolved.matchedEntities.map((m) =>
                        m.href ? (
                          <Link key={`${m.kind}-${m.id}`} href={m.href}>
                            <a
                              className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                              data-testid={`link-resolved-${m.kind}`}
                            >
                              {m.kind}: {m.label}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </Link>
                        ) : (
                          <span key={`${m.kind}-${m.id}`} className="text-xs text-muted-foreground">
                            {m.kind}: {m.label}
                          </span>
                        ),
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => verifyMutation.mutate()}
                    disabled={chain.nodes.length === 0 || verifyMutation.isPending}
                    data-testid="button-verify-chain"
                  >
                    <ShieldCheck className="h-4 w-4 mr-1" />
                    {verifyMutation.isPending ? 'Verifying…' : 'Verify chain integrity'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportFile('csv')}
                    disabled={chain.nodes.length === 0}
                    data-testid="button-export-csv"
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Export CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportFile('pdf')}
                    disabled={chain.nodes.length === 0}
                    data-testid="button-export-pdf"
                  >
                    <FileDown className="h-4 w-4 mr-1" />
                    Export PDF
                  </Button>
                </div>
              </div>
            </CardHeader>
            {verifyResult && (
              <CardContent className="pt-0">
                <div
                  className={`rounded border p-3 text-sm flex items-start gap-2 ${
                    verifyResult.ok
                      ? 'border-green-300 bg-green-50 dark:bg-green-900/20'
                      : 'border-red-300 bg-red-50 dark:bg-red-900/20'
                  }`}
                  data-testid="status-verify-result"
                >
                  {verifyResult.ok ? (
                    <CheckCircle2 className="h-5 w-5 text-green-700 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-red-700 mt-0.5" />
                  )}
                  <div>
                    <div className="font-medium">
                      {verifyResult.ok
                        ? 'Chain integrity OK'
                        : `Chain integrity FAILED (${verifyResult.mismatches.length} mismatch)`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Verified {verifyResult.checked} entries at {fmt(verifyResult.verifiedAt)}
                    </div>
                    {!verifyResult.ok && (
                      <ul className="mt-2 text-xs space-y-1">
                        {verifyResult.mismatches.slice(0, 5).map((m) => (
                          <li key={m.id} className="font-mono">
                            {m.transactionNumber}: expected {m.expectedHash.slice(0, 12)}…
                            got {m.actualHash.slice(0, 12)}…
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {chain.travelerCaptures.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Serialized Items Using This Material</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {chain.travelerCaptures.map((capture) => (
                  <div key={`${capture.source}-${capture.id}`} className="rounded border p-3 text-sm" data-testid={`traveler-capture-${capture.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{capture.currentDepartment}</Badge>
                          <span className="font-mono text-xs">{capture.serialNumber}</span>
                          <span className="text-xs text-muted-foreground">{capture.poNumber}</span>
                          <Badge variant="outline" className="text-[10px]">{capture.status}</Badge>
                        </div>
                        <div className="font-medium">{capture.partNumber} - {capture.partName}</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                          <span><span className="text-muted-foreground">Traveler:</span> {capture.travelerNumber ?? capture.travelerBarcode ?? 'Not linked'}</span>
                          <span><span className="text-muted-foreground">Department:</span> {capture.department}</span>
                          <span><span className="text-muted-foreground">Captured:</span> {capture.traceabilityLabel} = <span className="font-mono">{capture.traceabilityValue}</span></span>
                          <span><span className="text-muted-foreground">Recorded by:</span> {capture.recordedBy} on {fmt(capture.recordedAt)}</span>
                          {capture.materialIcn && (
                            <span><span className="text-muted-foreground">Material ICN:</span> <span className="font-mono">{capture.materialIcn}</span></span>
                          )}
                          {capture.materialRollNumber && (
                            <span><span className="text-muted-foreground">Roll #:</span> <span className="font-mono">{capture.materialRollNumber}</span></span>
                          )}
                          {capture.materialExpirationDate && (
                            <span><span className="text-muted-foreground">Expires:</span> {new Date(capture.materialExpirationDate).toLocaleDateString()}</span>
                          )}
                          {capture.materialLocation && (
                            <span><span className="text-muted-foreground">Location:</span> {capture.materialLocation}</span>
                          )}
                        </div>
                      </div>
                      <Link href={capture.href}>
                        <a className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 whitespace-nowrap">
                          Traveler info <ExternalLink className="h-3 w-3" />
                        </a>
                      </Link>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {chain.expiringMaterials.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Materials Expiring Soon</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {chain.expiringMaterials.slice(0, 12).map((material) => (
                  <div key={`${material.source}-${material.id}`} className="rounded border p-3 text-sm" data-testid={`expiring-material-${material.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{material.materialPartNumber ?? 'Material'}{material.materialName ? ` - ${material.materialName}` : ''}</div>
                        <div className="text-xs text-muted-foreground">
                          {material.internalControlNumber && <span className="font-mono">{material.internalControlNumber}</span>}
                          {material.rollNumber && <span className="font-mono"> - Roll {material.rollNumber}</span>}
                        </div>
                      </div>
                      <Badge variant={material.daysUntilExpiration <= 7 ? 'destructive' : 'outline'}>
                        {material.daysUntilExpiration}d
                      </Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <span><span className="text-muted-foreground">Expires:</span> {new Date(material.expirationDate).toLocaleDateString()}</span>
                      <span><span className="text-muted-foreground">Qty:</span> {material.quantityRemaining ?? 'N/A'}</span>
                      <span><span className="text-muted-foreground">Status:</span> {material.status ?? 'N/A'}</span>
                      <span><span className="text-muted-foreground">Location:</span> {material.location ?? 'N/A'}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {chain.nodes.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground" data-testid="text-empty-chain">
                {chain.travelerCaptures.length > 0
                  ? 'No immutable ledger events are linked to this anchor yet. Traveler material captures are shown above.'
                  : 'No ledger events linked to this anchor yet.'}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <GitBranch className="h-4 w-4" />
                  Chain (expandable tree)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {chain.branches.map((branch) => (
                  <BranchPanel
                    key={branch.key}
                    branch={branch}
                    nodeMap={nodeMap}
                    childrenOf={tree.childrenOf}
                    onSelect={setSelected}
                    hasVerified={!!verifyResult}
                    mismatchSet={mismatchSet}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {chain.ncrs.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Linked Nonconformance Records</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {chain.ncrs.map((n) => (
                  <div key={n.id} className="rounded border p-3 text-sm" data-testid={`ncr-${n.id}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">
                        <Link href={n.href}>
                          <a className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">
                            NCR #{n.id}
                            {n.rmaNumber && (
                              <span className="text-muted-foreground ml-1">({n.rmaNumber})</span>
                            )}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </Link>
                      </div>
                      <Badge variant="outline">{n.status ?? 'Open'}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Cause: {n.issueCause}</div>
                    <div className="text-xs">
                      Disposition: {n.disposition} on {n.dispositionDate}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Badge variant="outline" className={STEP_COLORS[selected.step] ?? ''}>
                    {selected.step}
                  </Badge>
                  <span className="font-mono text-xs">{selected.transactionNumber}</span>
                </SheetTitle>
                <SheetDescription>
                  {fmt(selected.occurredAt)} — by {selected.performedByDisplayName}
                </SheetDescription>
              </SheetHeader>
              <dl className="mt-4 space-y-3 text-sm">
                <Row label="Part">{selected.agPartNumber}{selected.partName ? ` — ${selected.partName}` : ''}</Row>
                {selected.lotIcn && <Row label="Lot ICN"><span className="font-mono">{selected.lotIcn}</span></Row>}
                <Row label="Quantity">
                  before {selected.quantityBefore} → after {selected.quantityAfter} (Δ {selected.quantityDelta} {selected.unitOfMeasure})
                </Row>
                {(selected.statusBefore || selected.statusAfter) && (
                  <Row label="Status">
                    {selected.statusBefore ?? '—'} → {selected.statusAfter ?? '—'}
                  </Row>
                )}
                {selected.locationId && <Row label="Location">{selected.locationId}</Row>}
                {(selected.approvedByDisplayName || selected.approvalId) && (
                  <Row label="Approval">
                    {selected.approvedByDisplayName ?? 'system'}{' '}
                    {selected.approvalId && (
                      <span className="font-mono text-xs text-muted-foreground">
                        · {selected.approvalId.slice(0, 8)}…
                      </span>
                    )}
                  </Row>
                )}
                {selected.digitalSignatureId && (
                  <Row label="Digital signature">
                    <span className="font-mono text-xs">{selected.digitalSignatureId}</span>
                  </Row>
                )}
                {selected.travelerNumber && (
                  <Row label="Traveler">
                    <Link href={`/manufacturing-queue?search=${encodeURIComponent(selected.travelerNumber)}`}>
                      <a className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">
                        {selected.travelerNumber}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Link>
                    {selected.travelerStepName && (
                      <span className="text-xs text-muted-foreground ml-2">step: {selected.travelerStepName}</span>
                    )}
                  </Row>
                )}
                {selected.workOrderNumber && (
                  <Row label="Work order">
                    <Link href={`/manufacturing-queue?search=${encodeURIComponent(selected.workOrderNumber)}`}>
                      <a className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">
                        {selected.workOrderNumber}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Link>
                  </Row>
                )}
                {selected.chargeCode && <Row label="Charge code">{selected.chargeCode}</Row>}
                {selected.projectName && <Row label="Project">{selected.projectName}</Row>}
                {selected.reasonCode && <Row label="Reason">{selected.reasonCode}</Row>}
                {selected.notes && <Row label="Notes">{selected.notes}</Row>}
                <Row label="Source">
                  {selected.sourceLink.href ? (
                    <Link href={selected.sourceLink.href}>
                      <a
                        className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                        data-testid="link-source"
                      >
                        {selected.sourceLink.label}
                        {selected.sourceRecordId && (
                          <span className="font-mono text-xs text-muted-foreground">
                            · {selected.sourceRecordId}
                          </span>
                        )}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Link>
                  ) : (
                    <span>
                      {selected.sourceModule}
                      {selected.sourceRecordId ? ` / ${selected.sourceRecordId}` : ''}
                    </span>
                  )}
                </Row>
                <Row label="Ledger entry">
                  <Link href={selected.ledgerLink}>
                    <a
                      className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                      data-testid="link-ledger"
                    >
                      View in inventory ledger <ExternalLink className="h-3 w-3" />
                    </a>
                  </Link>
                </Row>
                <Row label="Event hash"><span className="font-mono text-xs break-all">{selected.eventHash}</span></Row>
                {selected.reversedTransactionId && (
                  <Row label="Reverses">
                    <span className="font-mono text-xs">{selected.reversedTransactionId}</span>
                  </Row>
                )}
              </dl>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
