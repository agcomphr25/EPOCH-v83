import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Search, ShieldAlert, CheckCircle2, Pencil, X, Clock, FastForward } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';

type Tier = 'safe' | 'restricted' | 'advanced';

interface ColumnMeta {
  column_name: string;
  data_type: string;
  is_nullable: boolean;
  tier: Tier;
}

interface PendingEdit {
  column_name: string;
  original_value: any;
  new_value: string;
  reason: string;
}

interface ExpediteRow {
  requestedId: string;
  orderId: string | null;
  customerName: string | null;
  currentDepartment: string | null;
  productionDepartment: string | null;
  eligible: boolean;
  alreadyAtShippingQc: boolean;
  blockers: string[];
}

interface ExpediteUndoPreview {
  batch: null | { correlationId: string; completedAt: string; originalReason: string };
  rows: Array<{ orderId: string; previousDepartment: string | null; currentDepartment: string | null; eligible: boolean; blockers: string[] }>;
  canUndo: boolean;
}

const PURE_PRECISION_IDS = Array.from({ length: 16 }, (_, index) => `FB${250 + index}`);

const TIER_BADGE: Record<Tier, JSX.Element> = {
  safe: <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Safe</Badge>,
  restricted: <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">Restricted</Badge>,
  advanced: <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">Advanced</Badge>,
};

function formatValue(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const SECTION_MAP: Record<string, string> = {
  current_department: 'Production',
  status: 'Production',
  customer_id: 'Customer / Order',
  model_id: 'Customer / Order',
  customer_name: 'Customer / Order',
  customer_po: 'Customer / Order',
  fb_order_number: 'Customer / Order',
  due_date: 'Dates',
  order_date: 'Dates',
  notes: 'Notes',
  agr_order_details: 'Notes',
  scrap_reason: 'Notes',
};

const SECTION_ORDER = ['Production', 'Customer / Order', 'Dates', 'Notes'];

export default function OrderOverridePage() {
  const { toast } = useToast();

  const [orderInput, setOrderInput] = useState('');
  const [orderId, setOrderId] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pendingEdits, setPendingEdits] = useState<Record<string, PendingEdit>>({});
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [draftReason, setDraftReason] = useState('');
  const [filterText, setFilterText] = useState('');
  const [savingColumn, setSavingColumn] = useState<string | null>(null);
  const [savedColumns, setSavedColumns] = useState<Set<string>>(new Set());
  const [expediteOrderIds, setExpediteOrderIds] = useState(PURE_PRECISION_IDS.join('\n'));
  const [expediteReason, setExpediteReason] = useState('Temporary abbreviated Pure Precision stock process');
  const [expeditePreview, setExpeditePreview] = useState<ExpediteRow[] | null>(null);
  const [undoPreview, setUndoPreview] = useState<ExpediteUndoPreview | null>(null);
  const [undoReason, setUndoReason] = useState('Wrong P1 PO batch selected; restoring each order to its audited prior department');
  const parsedExpediteIds = useMemo(() => [...new Set(expediteOrderIds.split(/[\s,]+/).map(value => value.trim().toUpperCase()).filter(Boolean))], [expediteOrderIds]);

  const { data: currentUser } = useQuery<any>({ queryKey: ['currentUser'], staleTime: 60_000 });
  const isAuthorized = currentUser?.username === 'glennj';

  const { data: colData } = useQuery<{ columns: ColumnMeta[] }>({
    queryKey: ['/api/admin/order-override/columns'],
    enabled: isAuthorized,
    staleTime: 5 * 60_000,
  });

  const { data: statusData } = useQuery<{ statuses: { id: number; name: string; display_name: string }[] }>({
    queryKey: ['/api/admin/order-statuses'],
    enabled: isAuthorized,
    staleTime: 5 * 60_000,
  });

  const { data: deptData } = useQuery<{ departments: string[] }>({
    queryKey: ['/api/admin/order-departments'],
    enabled: isAuthorized,
    staleTime: 5 * 60_000,
  });

  const { data: orderData, isFetching: orderLoading, isError: orderError } = useQuery<{ order: Record<string, any> }>({
    queryKey: ['/api/admin/order-override/order', orderId],
    queryFn: () => apiRequest(`/api/admin/order-override/order/${encodeURIComponent(orderId)}`),
    enabled: !!orderId && isAuthorized,
    staleTime: 0,
  });

  const order = orderData?.order ?? null;
  const resolvedOrderId = order?.order_id ?? orderId;

  const { data: historyData } = useQuery<{ events: any[] }>({
    queryKey: ['/api/admin/order-flight-recorder', resolvedOrderId],
    queryFn: () => apiRequest(`/api/admin/order-flight-recorder/${encodeURIComponent(resolvedOrderId)}`),
    enabled: !!resolvedOrderId && isAuthorized && !!order,
    staleTime: 30_000,
  });

  const overrideMutation = useMutation({
    mutationFn: (payload: { orderId: string; columnName: string; newValue: string; reason: string }) =>
      apiRequest('/api/admin/order-override', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: (_, vars) => {
      setSavedColumns(prev => new Set([...prev, vars.columnName]));
      setSavingColumn(null);
      setPendingEdits(prev => {
        const next = { ...prev };
        delete next[vars.columnName];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/order-override/order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/order-flight-recorder', resolvedOrderId] });
      toast({ title: 'Saved', description: `"${vars.columnName}" updated and logged.` });
    },
    onError: (err: any) => {
      setSavingColumn(null);
      toast({ title: 'Error', description: err.message ?? 'Update failed', variant: 'destructive' });
    },
  });

  const previewExpedite = useMutation({
    mutationFn: () => apiRequest('/api/admin/p1-expedite/preview', {
      method: 'POST', body: JSON.stringify({ ids: parsedExpediteIds }),
    }),
    onSuccess: (data: any) => setExpeditePreview(data.rows),
    onError: (err: any) => toast({ title: 'Preview failed', description: err.message, variant: 'destructive' }),
  });

  const executeExpedite = useMutation({
    mutationFn: () => apiRequest('/api/admin/p1-expedite/execute', {
      method: 'POST', body: JSON.stringify({ ids: parsedExpediteIds, reason: expediteReason }),
    }),
    onSuccess: (data: any) => {
      toast({ title: 'Fast track complete', description: `${data.changed.length} orders moved to Shipping QC. Batch ${data.correlationId}` });
      previewExpedite.mutate();
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
    },
    onError: (err: any) => toast({ title: 'Nothing was changed', description: err.message, variant: 'destructive' }),
  });

  const previewUndo = useMutation({
    mutationFn: () => apiRequest('/api/admin/p1-expedite/undo-preview', {
      method: 'POST', body: JSON.stringify({ ids: parsedExpediteIds }),
    }),
    onSuccess: (data: ExpediteUndoPreview) => setUndoPreview(data),
    onError: (err: any) => toast({ title: 'Undo preview failed', description: err.message, variant: 'destructive' }),
  });

  const executeUndo = useMutation({
    mutationFn: () => apiRequest('/api/admin/p1-expedite/undo', {
      method: 'POST', body: JSON.stringify({ ids: parsedExpediteIds, reason: undoReason }),
    }),
    onSuccess: (data: any) => {
      toast({ title: 'Fast track reversed', description: `${data.restored.length} orders restored to their prior departments.` });
      setUndoPreview(null);
      setExpeditePreview(null);
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
    },
    onError: (err: any) => toast({ title: 'Nothing was changed', description: err.message, variant: 'destructive' }),
  });

  const { grouped, ungrouped } = useMemo(() => {
    const cols = colData?.columns ?? [];
    const visible = showAdvanced ? cols : cols.filter(c => c.tier !== 'advanced');

    if (filterText.trim()) {
      const lower = filterText.toLowerCase();
      return { grouped: null, ungrouped: visible.filter(c => c.column_name.toLowerCase().includes(lower)) };
    }

    const sections: Record<string, ColumnMeta[]> = {};
    const other: ColumnMeta[] = [];

    for (const col of visible) {
      const section = SECTION_MAP[col.column_name];
      if (section) {
        if (!sections[section]) sections[section] = [];
        sections[section].push(col);
      } else {
        other.push(col);
      }
    }

    return { grouped: { sections, other }, ungrouped: null };
  }, [colData, showAdvanced, filterText]);

  const handleSearch = () => {
    const trimmed = orderInput.trim();
    if (!trimmed) return;
    setOrderId(trimmed);
    setPendingEdits({});
    setEditingColumn(null);
    setSavedColumns(new Set());
  };

  const startEdit = (col: ColumnMeta) => {
    setEditingColumn(col.column_name);
    setDraftValue(pendingEdits[col.column_name]?.new_value ?? (order ? formatValue(order[col.column_name]) : ''));
    setDraftReason(pendingEdits[col.column_name]?.reason ?? '');
  };

  const cancelEdit = () => {
    setEditingColumn(null);
    setDraftValue('');
    setDraftReason('');
  };

  const stagePending = (colName: string) => {
    if (!order) return;
    if (draftReason.trim().length < 5) {
      toast({ title: 'Reason required', description: 'Enter a reason (min 5 characters).', variant: 'destructive' });
      return;
    }
    setPendingEdits(prev => ({
      ...prev,
      [colName]: {
        column_name: colName,
        original_value: order[colName],
        new_value: draftValue,
        reason: draftReason,
      },
    }));
    cancelEdit();
  };

  const saveOne = (colName: string) => {
    const edit = pendingEdits[colName];
    if (!edit) return;
    setSavingColumn(colName);
    overrideMutation.mutate({
      orderId: resolvedOrderId,
      columnName: colName,
      newValue: edit.new_value,
      reason: edit.reason,
    });
  };

  const saveAll = async () => {
    for (const edit of Object.values(pendingEdits)) {
      setSavingColumn(edit.column_name);
      await overrideMutation.mutateAsync({
        orderId: resolvedOrderId,
        columnName: edit.column_name,
        newValue: edit.new_value,
        reason: edit.reason,
      }).catch(() => {});
    }
  };

  if (!isAuthorized) {
    return (
      <div className="container mx-auto p-8 max-w-lg">
        <Card className="border-red-200">
          <CardContent className="pt-6 flex flex-col items-center gap-3 text-center">
            <ShieldAlert className="w-12 h-12 text-red-500" />
            <h2 className="text-lg font-semibold">Access Restricted</h2>
            <p className="text-sm text-muted-foreground">This tool is only accessible to glennj.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pendingCount = Object.keys(pendingEdits).length;
  const statuses = statusData?.statuses ?? [];
  const departments = deptData?.departments ?? [];
  const recentEvents = (historyData?.events ?? []).slice(-10).reverse();

  const renderColumnEditor = (col: ColumnMeta) => {
    const currentVal = order![col.column_name];
    const pending = pendingEdits[col.column_name];
    const isSaved = savedColumns.has(col.column_name);
    const isEditing = editingColumn === col.column_name;
    const isSaving = savingColumn === col.column_name;
    const reasonShort = draftReason.trim().length > 0 && draftReason.trim().length < 5;

    return (
      <div
        key={col.column_name}
        className={`px-4 py-3 ${pending ? 'bg-amber-50 dark:bg-amber-950/10' : ''} ${isSaved ? 'bg-green-50 dark:bg-green-950/10' : ''}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-mono font-medium truncate">{col.column_name}</span>
            {TIER_BADGE[col.tier]}
            <span className="text-xs text-muted-foreground">{col.data_type}</span>
            {isSaved && <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />}
            {pending && !isSaved && (
              <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs">Pending</Badge>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {pending && !isEditing && (
              <Button variant="default" size="sm" className="h-7 text-xs" onClick={() => saveOne(col.column_name)} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            )}
            {!isEditing && (
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => startEdit(col)}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>

        {!isEditing && (
          <div className="mt-1 text-xs text-muted-foreground font-mono break-all">
            {pending ? (
              <span>
                <span className="line-through opacity-50">{formatValue(currentVal) || <em>empty</em>}</span>
                {' → '}
                <span className="text-amber-700 dark:text-amber-400 font-semibold">{pending.new_value || <em>empty</em>}</span>
                <span className="ml-2 not-italic text-muted-foreground normal-case">({pending.reason})</span>
              </span>
            ) : (
              <span className={!formatValue(currentVal) ? 'italic opacity-40' : ''}>
                {formatValue(currentVal) || 'null'}
              </span>
            )}
          </div>
        )}

        {isEditing && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Current value</Label>
                <div className="text-xs font-mono bg-muted rounded px-2 py-1.5 min-h-[32px] break-all">
                  {formatValue(currentVal) || <span className="italic opacity-40">null</span>}
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">New value</Label>
                {col.column_name === 'status' && statuses.length > 0 ? (
                  <Select value={draftValue} onValueChange={setDraftValue}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {statuses.map(s => (
                        <SelectItem key={s.id} value={s.name}>{s.display_name || s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : col.column_name === 'current_department' && departments.length > 0 ? (
                  <Select value={draftValue} onValueChange={setDraftValue}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map(d => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={draftValue}
                    onChange={e => setDraftValue(e.target.value)}
                    className="h-8 text-sm font-mono"
                    placeholder="Enter new value (blank = null)"
                    autoFocus
                  />
                )}
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">
                Reason for change <span className="text-red-500">*</span>
                {reasonShort && (
                  <span className="ml-1 text-red-400 font-normal">
                    ({5 - draftReason.trim().length} more chars needed)
                  </span>
                )}
              </Label>
              <Textarea
                value={draftReason}
                onChange={e => setDraftReason(e.target.value)}
                placeholder="Explain why this value is being changed..."
                className="text-sm min-h-[64px]"
              />
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => stagePending(col.column_name)}
                disabled={draftReason.trim().length < 5}
              >
                Stage Change
              </Button>
              <Button variant="ghost" size="sm" onClick={cancelEdit}>
                <X className="w-3.5 h-3.5 mr-1" /> Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-amber-500" />
            Order Data Override
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Directly modify any column in <code className="text-xs bg-muted px-1 rounded">all_orders</code>.
            Every change is individually logged with reason, old value, new value, and timestamp.
          </p>
        </div>
        <Badge variant="outline" className="border-amber-400 text-amber-700 text-xs">
          glennj only
        </Badge>
      </div>

      <Card className="border-blue-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FastForward className="w-4 h-4 text-blue-600" /> Pure Precision Fast Track
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Move FB250–FB265 directly to Shipping QC without completing or signing skipped department steps.
            The normal P1 route is not changed.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="expedite-orders">Order IDs ({parsedExpediteIds.length})</Label>
            <Textarea id="expedite-orders" value={expediteOrderIds} onChange={event => { setExpediteOrderIds(event.target.value); setExpeditePreview(null); setUndoPreview(null); }} className="mt-1 font-mono min-h-28" />
            <p className="text-xs text-muted-foreground mt-1">One per line or comma-separated. This first batch is prefilled with FB250–FB265.</p>
          </div>
          <div>
            <Label htmlFor="expedite-reason">Audit reason</Label>
            <Textarea id="expedite-reason" value={expediteReason} onChange={event => setExpediteReason(event.target.value)} className="mt-1" />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => previewExpedite.mutate()} disabled={previewExpedite.isPending}>
              {previewExpedite.isPending ? 'Checking…' : `Preview ${parsedExpediteIds.length} Orders`}
            </Button>
            <Button
              onClick={() => {
                if (window.confirm('Move every eligible order in this batch to Shipping QC? This action is audited.')) executeExpedite.mutate();
              }}
              disabled={!expeditePreview || expeditePreview.some(row => !row.eligible) || expediteReason.trim().length < 10 || executeExpedite.isPending}
            >
              {executeExpedite.isPending ? 'Moving…' : 'Move Batch to Shipping QC'}
            </Button>
          </div>
          {expeditePreview && (
            <div className="border rounded-md overflow-hidden">
              <div className="grid grid-cols-[90px_1fr_1fr_2fr] gap-3 bg-muted px-3 py-2 text-xs font-semibold">
                <span>Order</span><span>Customer</span><span>Current department</span><span>Validation</span>
              </div>
              <div className="divide-y max-h-80 overflow-y-auto">
                {expeditePreview.map(row => (
                  <div key={row.requestedId} className="grid grid-cols-[90px_1fr_1fr_2fr] gap-3 px-3 py-2 text-xs items-center">
                    <span className="font-mono font-semibold">{row.requestedId}</span>
                    <span>{row.customerName ?? '—'}</span>
                    <span>{row.currentDepartment ?? '—'}</span>
                    {row.eligible ? (
                      <span className="text-green-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {row.alreadyAtShippingQc ? 'Already at Shipping QC' : 'Ready'}</span>
                    ) : (
                      <span className="text-red-600">{row.blockers.join('; ')}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {expeditePreview?.some(row => !row.eligible) && (
            <p className="text-xs text-amber-700 flex gap-1"><AlertTriangle className="w-3.5 h-3.5" /> The batch is locked until every validation issue is resolved; no partial updates are allowed.</p>
          )}
          <div className="border-t pt-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Undo Selected Fast-Track Batch</h3>
              <p className="text-xs text-muted-foreground">Uses the order IDs entered above to find their exact historical batch, then restores every order to its audited prior department. Other batches are untouched.</p>
            </div>
            <Textarea value={undoReason} onChange={event => setUndoReason(event.target.value)} aria-label="Rollback audit reason" />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => previewUndo.mutate()} disabled={previewUndo.isPending}>
                {previewUndo.isPending ? 'Checking…' : 'Preview Selected Batch Undo'}
              </Button>
              <Button
                variant="destructive"
                disabled={!undoPreview?.canUndo || undoReason.trim().length < 10 || executeUndo.isPending}
                onClick={() => {
                  if (window.confirm(`Restore all ${undoPreview?.rows.length ?? 0} orders to their prior departments? This rollback will be audited.`)) executeUndo.mutate();
                }}
              >
                {executeUndo.isPending ? 'Restoring…' : 'Undo Selected Fast-Track Batch'}
              </Button>
            </div>
            {undoPreview && (
              <div className="border rounded-md overflow-hidden">
                <div className="px-3 py-2 bg-muted text-xs">
                  {undoPreview.batch ? <>Batch <span className="font-mono">{undoPreview.batch.correlationId}</span> · {new Date(undoPreview.batch.completedAt).toLocaleString()}</> : 'No unreversed fast-track batch found.'}
                </div>
                <div className="divide-y max-h-72 overflow-y-auto">
                  {undoPreview.rows.map(row => (
                    <div key={row.orderId} className="grid grid-cols-[100px_1fr_2fr] gap-3 px-3 py-2 text-xs">
                      <span className="font-mono font-semibold">{row.orderId}</span>
                      <span>Shipping QC → {row.previousDepartment ?? 'Unknown'}</span>
                      {row.eligible ? <span className="text-green-700">Ready to restore</span> : <span className="text-red-600">{row.blockers.join('; ')}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Order Search */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Find Order</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Order ID or FB Order Number..."
              value={orderInput}
              onChange={e => setOrderInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="max-w-xs"
            />
            <Button onClick={handleSearch} disabled={!orderInput.trim()}>
              <Search className="w-4 h-4 mr-1" /> Load Order
            </Button>
          </div>

          {orderLoading && <p className="text-sm text-muted-foreground mt-3">Loading...</p>}
          {orderError && (
            <p className="text-sm text-red-600 mt-3 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" /> Order not found.
            </p>
          )}

          {order && (
            <div className="mt-3 p-3 bg-muted rounded text-sm space-y-1">
              <div className="font-semibold">{order.order_id}</div>
              <div className="text-muted-foreground">
                {order.customer_name && <span className="mr-3">{order.customer_name}</span>}
                {order.status && <span className="mr-3">Status: {order.status}</span>}
                {order.current_department && <span>Dept: {order.current_department}</span>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit history — shown once order is loaded */}
      {order && recentEvents.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Recent History
              <span className="text-xs font-normal text-muted-foreground">
                (last {recentEvents.length} events)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y max-h-56 overflow-y-auto">
              {recentEvents.map((h, i) => (
                <div key={i} className="px-4 py-2 text-xs flex gap-3 items-baseline">
                  <span className="text-muted-foreground shrink-0 w-36 tabular-nums">
                    {h.timestamp ? new Date(h.timestamp).toLocaleString() : '—'}
                  </span>
                  <span className="flex-1 truncate">{h.description}</span>
                  {h.actor && (
                    <span className="text-muted-foreground shrink-0">by {h.actor}</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending changes summary + save all */}
      {pendingCount > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-amber-800 dark:text-amber-300">
                {pendingCount} staged change{pendingCount > 1 ? 's' : ''} not yet saved
              </div>
              <Button
                size="sm"
                onClick={saveAll}
                disabled={overrideMutation.isPending}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                Save All ({pendingCount})
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Column editor */}
      {order && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle className="text-base">Edit Columns</CardTitle>
              <div className="flex items-center gap-4">
                <Input
                  placeholder="Filter columns..."
                  value={filterText}
                  onChange={e => setFilterText(e.target.value)}
                  className="h-8 text-sm w-48"
                />
                <div className="flex items-center gap-2 text-sm">
                  <Switch
                    id="advanced-toggle"
                    checked={showAdvanced}
                    onCheckedChange={setShowAdvanced}
                  />
                  <Label htmlFor="advanced-toggle" className="text-sm cursor-pointer">
                    Show advanced columns
                  </Label>
                </div>
              </div>
            </div>
            {showAdvanced && (
              <div className="flex items-start gap-2 mt-2 p-2 bg-red-50 dark:bg-red-950/20 rounded text-xs text-red-700 dark:text-red-400">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                Advanced columns include internal fields. Changes here can affect system behaviour. Proceed carefully.
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {/* Flat filtered list */}
            {ungrouped && (
              <div className="divide-y">
                {ungrouped.map(col => renderColumnEditor(col))}
                {ungrouped.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No columns match your filter.
                  </div>
                )}
              </div>
            )}

            {/* Grouped sections (no filter active) */}
            {grouped && (
              <div>
                {SECTION_ORDER.map(section => {
                  const cols = grouped.sections[section];
                  if (!cols?.length) return null;
                  return (
                    <div key={section}>
                      <div className="px-4 py-2 bg-muted/50 border-y text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {section}
                      </div>
                      <div className="divide-y">
                        {cols.map(col => renderColumnEditor(col))}
                      </div>
                    </div>
                  );
                })}
                {grouped.other.length > 0 && (
                  <div>
                    <div className="px-4 py-2 bg-muted/50 border-y text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Other
                    </div>
                    <div className="divide-y">
                      {grouped.other.map(col => renderColumnEditor(col))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
