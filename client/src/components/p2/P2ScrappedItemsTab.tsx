import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle,
  ClipboardList,
  Wrench,
  Plus,
  Trash2,
  Package,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface ScrappedItem {
  id: string;
  serialNumber: string;
  barcode: string;
  partNumber: string;
  partName: string;
  poId: number | null;
  poNumber: string;
  customerName: string;
  currentDepartment: string;
  status: string;
  scrapReason: string | null;
  scrapBy: string | null;
  scrapAt: string | null;
  createdAt: string;
  disposition: Disposition | null;
}

interface Disposition {
  id: number;
  serializedItemId: string;
  dispositionType: string;
  poId: number | null;
  poNumber: string | null;
  authorization: string;
  partNumber: string;
  serialNumber: string;
  dispositionDate: string;
  reasonType: string;
  reasonOther: string | null;
  notes: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
}

interface Rma {
  rma: {
    id: number;
    dispositionId: number;
    serializedItemId: string;
    rmaNumber: string;
    status: string;
    traceableMaterials: TraceableMaterial[];
    shippedAt: string | null;
    completedAt: string | null;
    notes: string | null;
    createdAt: string;
  };
  disposition: Disposition | null;
  item: ScrappedItem | null;
}

interface TraceableMaterial {
  partNumber?: string;
  name: string;
  lot: string;
  qty: string;
}

interface InventoryItemOption {
  agPartNumber: string;
  name: string;
  purchaseUnit?: string | null;
}

interface ProjectOption {
  id: string;
  projectCode: string;
  projectName: string;
  poId: number | null;
  poNumber: string | null;
}

const DISPOSITION_TYPES = ['Scrap', 'Repair', 'Use as Is', 'Use for Reference', 'Return to Vendor'] as const;
const USE_AS_IS_DEPARTMENTS = ['Pending Layup', 'Layup', 'Assemble/Disassembly', 'CNC', 'Finish', 'Paint', 'Final QC'] as const;
const REASON_QUALITY = 'quality';
const REASON_OTHER = 'other';
const QUALITY_LABEL = 'Quality does not meet customer tolerances/requirements';

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  try {
    return format(new Date(dateStr), 'MMM d, yyyy');
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return '—';
  try {
    return format(new Date(dateStr), 'MMM d, yyyy h:mm a');
  } catch {
    return dateStr;
  }
}

function DispositionDialog({
  item,
  onClose,
  onSuccess,
}: {
  item: ScrappedItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const today = format(new Date(), 'yyyy-MM-dd');

  const [dispositionType, setDispositionType] = useState<string>('');
  const [authorization, setAuthorization] = useState('');
  const [dispositionDate, setDispositionDate] = useState(today);
  const [reasonType, setReasonType] = useState<string>(REASON_QUALITY);
  const [reasonOther, setReasonOther] = useState('');
  const [useAsIsDestination, setUseAsIsDestination] = useState<'inventory' | 'production'>('inventory');
  const [returnProjectId, setReturnProjectId] = useState('');
  const [returnDepartment, setReturnDepartment] = useState('');
  const [notes, setNotes] = useState('');

  const { data: projects = [] } = useQuery<ProjectOption[]>({
    queryKey: ['/api/pm-dashboard/projects'],
    enabled: dispositionType === 'Use as Is' && useAsIsDestination === 'production',
  });

  const createMutation = useMutation({
    mutationFn: (data: object) =>
      apiRequest('/api/p2/nonconforming-dispositions', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2/serialized-items/scrapped'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2/serialized-items/closed-ncr'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2/rmas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2/control-center/production-queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2/control-center/scheduling-list'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2/control-center/po-statuses'] });
      toast({ title: 'Disposition filed', description: 'The disposition report has been submitted.' });
      onSuccess();
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err?.message || 'Failed to file disposition', variant: 'destructive' });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispositionType) {
      toast({ title: 'Missing field', description: 'Please select a disposition type.', variant: 'destructive' });
      return;
    }
    if (!authorization.trim()) {
      toast({ title: 'Missing field', description: 'Authorization is required.', variant: 'destructive' });
      return;
    }
    if (reasonType === REASON_OTHER && !reasonOther.trim()) {
      toast({ title: 'Missing field', description: 'Please describe the reason.', variant: 'destructive' });
      return;
    }
    if (dispositionType === 'Use as Is' && useAsIsDestination === 'production') {
      if (!returnProjectId) {
        toast({ title: 'Missing field', description: 'Please select a return project.', variant: 'destructive' });
        return;
      }
      if (!returnDepartment) {
        toast({ title: 'Missing field', description: 'Please select a return department.', variant: 'destructive' });
        return;
      }
    }
    createMutation.mutate({
      serializedItemId: item.id,
      dispositionType,
      poId: item.poId || null,
      poNumber: item.poNumber || null,
      authorization: authorization.trim(),
      partNumber: item.partNumber,
      serialNumber: item.serialNumber,
      dispositionDate,
      reasonType,
      reasonOther: reasonType === REASON_OTHER ? reasonOther.trim() : null,
      useAsIsDestination,
      returnProjectId: useAsIsDestination === 'production' ? returnProjectId : null,
      returnDepartment: useAsIsDestination === 'production' ? returnDepartment : null,
      notes: notes.trim() || null,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-orange-500" />
            Disposition Report
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Part Number</Label>
              <Input value={item.partNumber} readOnly className="bg-muted" />
            </div>
            <div>
              <Label>Serial Number</Label>
              <Input value={item.serialNumber} readOnly className="bg-muted" />
            </div>
          </div>

          <div>
            <Label>Project / PO</Label>
            <Input value={item.poNumber || '—'} readOnly className="bg-muted" />
          </div>

          <div>
            <Label htmlFor="dispositionType">Disposition *</Label>
            <Select
              value={dispositionType}
              onValueChange={(value) => {
                setDispositionType(value);
                setUseAsIsDestination('inventory');
                setReturnProjectId('');
                setReturnDepartment('');
              }}
            >
              <SelectTrigger id="dispositionType">
                <SelectValue placeholder="Select disposition..." />
              </SelectTrigger>
              <SelectContent>
                {DISPOSITION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {dispositionType === 'Use as Is' && (
            <div className="space-y-3 rounded-md border p-3">
              <Label>Use As Is Destination *</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3">
                  <input
                    type="radio"
                    name="useAsIsDestination"
                    value="inventory"
                    checked={useAsIsDestination === 'inventory'}
                    onChange={() => {
                      setUseAsIsDestination('inventory');
                      setReturnProjectId('');
                      setReturnDepartment('');
                    }}
                  />
                  <span>
                    <span className="block text-sm font-medium">Send to inventory</span>
                    <span className="block text-xs text-muted-foreground">
                      Capture this serial as on hand under its part number.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3">
                  <input
                    type="radio"
                    name="useAsIsDestination"
                    value="production"
                    checked={useAsIsDestination === 'production'}
                    onChange={() => setUseAsIsDestination('production')}
                  />
                  <span>
                    <span className="block text-sm font-medium">Return to production</span>
                    <span className="block text-xs text-muted-foreground">
                      Reactivate this serial at a selected project and department.
                    </span>
                  </span>
                </label>
              </div>

              {useAsIsDestination === 'production' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="returnProjectId">Project *</Label>
                    <Select value={returnProjectId} onValueChange={setReturnProjectId}>
                      <SelectTrigger id="returnProjectId">
                        <SelectValue placeholder="Select project..." />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.projectCode} - {project.projectName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="returnDepartment">Department *</Label>
                    <Select value={returnDepartment} onValueChange={setReturnDepartment}>
                      <SelectTrigger id="returnDepartment">
                        <SelectValue placeholder="Select department..." />
                      </SelectTrigger>
                      <SelectContent>
                        {USE_AS_IS_DEPARTMENTS.map((department) => (
                          <SelectItem key={department} value={department}>{department}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <Label htmlFor="authorization">Authorization *</Label>
            <Input
              id="authorization"
              value={authorization}
              onChange={(e) => setAuthorization(e.target.value)}
              placeholder="Name or role..."
            />
          </div>

          <div>
            <Label htmlFor="dispositionDate">Date *</Label>
            <Input
              id="dispositionDate"
              type="date"
              value={dispositionDate}
              onChange={(e) => setDispositionDate(e.target.value)}
            />
          </div>

          <div>
            <Label>Reason *</Label>
            <div className="space-y-2 mt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="reasonType"
                  value={REASON_QUALITY}
                  checked={reasonType === REASON_QUALITY}
                  onChange={() => setReasonType(REASON_QUALITY)}
                />
                <span className="text-sm">{QUALITY_LABEL}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="reasonType"
                  value={REASON_OTHER}
                  checked={reasonType === REASON_OTHER}
                  onChange={() => setReasonType(REASON_OTHER)}
                />
                <span className="text-sm">Other</span>
              </label>
              {reasonType === REASON_OTHER && (
                <Textarea
                  placeholder="Describe reason..."
                  value={reasonOther}
                  onChange={(e) => setReasonOther(e.target.value)}
                  rows={2}
                />
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              File Disposition
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RmaRow({ rma, onUpdated }: { rma: Rma; onUpdated: () => void }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [materials, setMaterials] = useState<TraceableMaterial[]>(
    rma.rma.traceableMaterials || []
  );
  const [newMaterial, setNewMaterial] = useState<TraceableMaterial>({ name: '', lot: '', qty: '' });

  const { data: inventoryItems = [] } = useQuery<InventoryItemOption[]>({
    queryKey: ['/api/inventory/items/part-numbers'],
    enabled: expanded && rma.rma.status === 'open',
  });

  const updateMutation = useMutation({
    mutationFn: (data: object) =>
      apiRequest(`/api/p2/rmas/${rma.rma.id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2/rmas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2/serialized-items/scrapped'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2/serialized-items/closed-ncr'] });
      onUpdated();
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err?.message || 'Failed to update RMA', variant: 'destructive' });
    },
  });

  const addMaterial = () => {
    if (!newMaterial.partNumber && !newMaterial.name.trim()) return;
    const updated = [...materials, { ...newMaterial }];
    setMaterials(updated);
    setNewMaterial({ partNumber: undefined, name: '', lot: '', qty: '' });
    updateMutation.mutate({ traceableMaterials: updated });
  };

  const selectMaterial = (partNumber: string) => {
    const item = inventoryItems.find((option) => option.agPartNumber === partNumber);
    setNewMaterial({
      ...newMaterial,
      partNumber,
      name: item?.name || newMaterial.name,
    });
  };

  const removeMaterial = (idx: number) => {
    const updated = materials.filter((_, i) => i !== idx);
    setMaterials(updated);
    updateMutation.mutate({ traceableMaterials: updated });
  };

  const markShipped = () => {
    updateMutation.mutate({ status: 'shipped', traceableMaterials: materials });
    toast({ title: 'RMA marked as shipped' });
  };

  const markComplete = () => {
    updateMutation.mutate({ status: 'complete', traceableMaterials: materials });
    toast({ title: 'RMA marked as complete' });
  };

  const statusColor = rma.rma.status === 'open'
    ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
    : rma.rma.status === 'shipped'
    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';

  return (
    <div className="border rounded-md mb-2">
      <button
        type="button"
        className="w-full flex items-center justify-between p-3 text-left hover:bg-accent/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="font-mono font-medium text-sm">{rma.rma.rmaNumber}</span>
          <span className="text-sm text-muted-foreground">
            {rma.item?.partNumber} — SN {rma.item?.serialNumber || rma.disposition?.serialNumber}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>
            {rma.rma.status.charAt(0).toUpperCase() + rma.rma.status.slice(1)}
          </span>
          <span className="text-xs text-muted-foreground">{formatDate(rma.rma.createdAt)}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t pt-3">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Customer</span>
              <p className="font-medium">{rma.item?.customerName || '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">PO</span>
              <p className="font-medium">{rma.item?.poNumber || '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Authorized by</span>
              <p className="font-medium">{rma.disposition?.authorization || '—'}</p>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
              <Package className="h-4 w-4" />
              Traceable Materials
            </h4>
            {materials.length > 0 && (
              <Table className="mb-2">
                <TableHeader>
                  <TableRow>
                    <TableHead>Part #</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead>Lot #</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materials.map((m, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-sm">{m.partNumber || 'â€”'}</TableCell>
                      <TableCell className="text-sm">{m.name}</TableCell>
                      <TableCell className="font-mono text-sm">{m.lot}</TableCell>
                      <TableCell className="text-sm">{m.qty}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-destructive"
                          onClick={() => removeMaterial(idx)}
                          disabled={rma.rma.status !== 'open' || updateMutation.isPending}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {rma.rma.status === 'open' && (
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label className="text-xs">Inventory Item</Label>
                  <Select value={newMaterial.partNumber || ''} onValueChange={selectMaterial}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select item..." />
                    </SelectTrigger>
                    <SelectContent>
                      {inventoryItems.map((item) => (
                        <SelectItem key={item.agPartNumber} value={item.agPartNumber}>
                          {item.agPartNumber} - {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-28">
                  <Label className="text-xs">Lot #</Label>
                  <Input
                    placeholder="Lot..."
                    value={newMaterial.lot}
                    onChange={(e) => setNewMaterial({ ...newMaterial, lot: e.target.value })}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="w-20">
                  <Label className="text-xs">Qty</Label>
                  <Input
                    placeholder="Qty"
                    value={newMaterial.qty}
                    onChange={(e) => setNewMaterial({ ...newMaterial, qty: e.target.value })}
                    className="h-8 text-sm"
                  />
                </div>
                <Button size="sm" variant="outline" onClick={addMaterial} disabled={updateMutation.isPending}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>

          {rma.rma.status === 'open' && (
            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                onClick={markShipped}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Wrench className="h-3 w-3 mr-1" />}
                Mark Shipped
              </Button>
            </div>
          )}
          {rma.rma.status === 'shipped' && (
            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                onClick={markComplete}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                Mark Complete
              </Button>
              <span className="text-xs text-muted-foreground self-center">
                Shipped {formatDateTime(rma.rma.shippedAt)}
              </span>
            </div>
          )}
          {rma.rma.status === 'complete' && (
            <div className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1 pt-2">
              <CheckCircle className="h-4 w-4" />
              Completed {formatDateTime(rma.rma.completedAt)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function P2NonconformingTab({ selectedPOIds = [] }: { selectedPOIds?: number[] } = {}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState<ScrappedItem | null>(null);

  const { data: openNcrItemsRaw = [], isLoading, isError, error, refetch: refetchItems } = useQuery<ScrappedItem[]>({
    queryKey: ['/api/p2/serialized-items/scrapped'],
    refetchInterval: 60000,
  });

  const openNcrItems = selectedPOIds.length > 0
    ? openNcrItemsRaw.filter((item) => item.poId !== null && selectedPOIds.includes(item.poId))
    : openNcrItemsRaw;

  const { data: closedNcrItemsRaw = [], isLoading: closedNcrLoading } = useQuery<ScrappedItem[]>({
    queryKey: ['/api/p2/serialized-items/closed-ncr'],
    refetchInterval: 60000,
  });

  const closedNcrItems = selectedPOIds.length > 0
    ? closedNcrItemsRaw.filter((item) => item.poId !== null && selectedPOIds.includes(item.poId))
    : closedNcrItemsRaw;

  const { data: rmasRaw = [], refetch: refetchRmas } = useQuery<Rma[]>({
    queryKey: ['/api/p2/rmas'],
    refetchInterval: 60000,
  });

  const filtered = openNcrItems.filter((item) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      item.serialNumber?.toLowerCase().includes(term) ||
      item.partNumber?.toLowerCase().includes(term) ||
      item.partName?.toLowerCase().includes(term) ||
      item.poNumber?.toLowerCase().includes(term) ||
      item.customerName?.toLowerCase().includes(term) ||
      item.scrapReason?.toLowerCase().includes(term) ||
      item.scrapBy?.toLowerCase().includes(term)
    );
  });

  const needsDispositionCount = openNcrItems.filter((i) => !i.disposition).length;
  const openRmaCount = rmasRaw.filter((r) => r.rma.status === 'open').length;
  const activeRmas = rmasRaw.filter((r) => r.rma.status === 'open' || r.rma.status === 'shipped');

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-destructive">
          <AlertCircle className="h-12 w-12 mb-3" />
          <p className="font-medium">Failed to load nonconforming items</p>
          <p className="text-sm text-muted-foreground mt-1">
            {error instanceof Error ? error.message : 'An unexpected error occurred'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {selectedItem && (
        <DispositionDialog
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onSuccess={() => setSelectedItem(null)}
        />
      )}

      <Tabs defaultValue="items" className="space-y-4">
        <TabsList>
          <TabsTrigger value="items" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Nonconforming Items
            {needsDispositionCount > 0 && (
              <Badge variant="destructive" className="ml-1 text-xs px-1.5">{needsDispositionCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="rmas" className="flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            RMAs
            {activeRmas.length > 0 && (
              <Badge variant="outline" className="ml-1 text-xs px-1.5 bg-orange-100 text-orange-700 border-orange-300">
                {activeRmas.length} active
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="closed" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Closed NCR
            {closedNcrItems.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs px-1.5">{closedNcrItems.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="items">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                  Open Nonconforming P2 Items
                  <Badge variant="secondary" className="ml-2">{openNcrItems.length}</Badge>
                  {needsDispositionCount > 0 && (
                    <Badge variant="destructive" className="ml-1">
                      {needsDispositionCount} need disposition
                    </Badge>
                  )}
                </CardTitle>
                <div className="relative w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by serial, part, PO, customer..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  {openNcrItems.length === 0 ? (
                    <>
                      <p className="font-medium">No open nonconforming items</p>
                      <p className="text-sm">Items opened as NCR will appear here until disposition is complete</p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium">No results</p>
                      <p className="text-sm">No items match your search</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Serial Number</TableHead>
                        <TableHead>Part Number</TableHead>
                        <TableHead>Part Name</TableHead>
                        <TableHead>PO Number</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Disposition</TableHead>
                        <TableHead>Flagged At</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((item) => {
                        const hasDispo = !!item.disposition;
                        const isResolved = item.disposition?.resolved;
                        return (
                          <TableRow
                            key={item.id}
                            className="cursor-pointer hover:bg-accent/30"
                            onClick={() => !hasDispo && setSelectedItem(item)}
                          >
                            <TableCell>
                              {!hasDispo ? (
                                <Badge variant="destructive" className="text-xs whitespace-nowrap">
                                  Needs Attention
                                </Badge>
                              ) : isResolved ? (
                                <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs border-0">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Resolved
                                </Badge>
                              ) : (
                                <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs border-0">
                                  In Progress
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="font-mono font-medium">{item.serialNumber}</TableCell>
                            <TableCell className="font-mono text-sm">{item.partNumber}</TableCell>
                            <TableCell className="max-w-[180px] truncate" title={item.partName}>
                              {item.partName}
                            </TableCell>
                            <TableCell className="font-medium">{item.poNumber}</TableCell>
                            <TableCell>{item.customerName}</TableCell>
                            <TableCell>
                              {hasDispo ? (
                                <span className="text-sm font-medium">{item.disposition!.dispositionType}</span>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm whitespace-nowrap">
                              {formatDateTime(item.scrapAt)}
                            </TableCell>
                            <TableCell>
                              {!hasDispo && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedItem(item);
                                  }}
                                >
                                  <ClipboardList className="h-3 w-3 mr-1" />
                                  File Disposition
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rmas">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-blue-500" />
                  Active RMAs
                  <Badge variant="secondary" className="ml-2">{activeRmas.length}</Badge>
                </CardTitle>
                <div className="flex items-center gap-2">
                  {openRmaCount > 0 && (
                    <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-300">
                      {openRmaCount} open
                    </Badge>
                  )}
                  {rmasRaw.length > activeRmas.length && (
                    <span className="text-xs text-muted-foreground">
                      {rmasRaw.length - activeRmas.length} completed
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {activeRmas.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Wrench className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">No active RMAs</p>
                  <p className="text-sm">RMAs are created when a disposition type of "Repair" is filed</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {activeRmas.map((rma) => (
                    <RmaRow
                      key={rma.rma.id}
                      rma={rma}
                      onUpdated={() => {
                        refetchItems();
                        refetchRmas();
                      }}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="closed">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Closed NCR
                  <Badge variant="secondary" className="ml-2">{closedNcrItems.length}</Badge>
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {closedNcrLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : closedNcrItems.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">No closed NCR records</p>
                  <p className="text-sm">Completed dispositions will appear here</p>
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Serial Number</TableHead>
                        <TableHead>Part Number</TableHead>
                        <TableHead>PO Number</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Final Disposition</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Authorized By</TableHead>
                        <TableHead>Closed At</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {closedNcrItems.map((item) => (
                        <TableRow key={`${item.id}-${item.disposition?.id || 'closed'}`}>
                          <TableCell className="font-mono font-medium">{item.serialNumber}</TableCell>
                          <TableCell className="font-mono text-sm">{item.partNumber}</TableCell>
                          <TableCell className="font-medium">{item.poNumber}</TableCell>
                          <TableCell>{item.customerName}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{item.disposition?.dispositionType || 'Resolved'}</Badge>
                          </TableCell>
                          <TableCell className="max-w-[220px] truncate" title={item.disposition?.reasonOther || item.disposition?.reasonType || ''}>
                            {item.disposition?.reasonType === REASON_OTHER
                              ? item.disposition?.reasonOther || 'Other'
                              : QUALITY_LABEL}
                          </TableCell>
                          <TableCell>{item.disposition?.authorization || 'â€”'}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {formatDateTime(item.disposition?.resolvedAt || item.disposition?.createdAt || item.scrapAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
