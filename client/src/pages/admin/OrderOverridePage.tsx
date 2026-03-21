import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, Search, ShieldAlert, CheckCircle2, Pencil, X, ChevronDown, ChevronUp } from 'lucide-react';
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

  // Fetch current user to enforce frontend gate (backend also enforces)
  const { data: currentUser } = useQuery<any>({
    queryKey: ['currentUser'],
    staleTime: 60_000,
  });

  const isAuthorized = currentUser?.username === 'glennj';

  // Fetch column metadata
  const { data: colData } = useQuery<{ columns: ColumnMeta[] }>({
    queryKey: ['/api/admin/order-override/columns'],
    enabled: isAuthorized,
    staleTime: 5 * 60_000,
  });

  // Fetch order row
  const { data: orderData, isFetching: orderLoading, isError: orderError } = useQuery<{ order: Record<string, any> }>({
    queryKey: ['/api/admin/order-override/order', orderId],
    queryFn: () => apiRequest(`/api/admin/order-override/order/${encodeURIComponent(orderId)}`),
    enabled: !!orderId && isAuthorized,
    staleTime: 0,
  });

  const order = orderData?.order ?? null;
  const resolvedOrderId = order?.order_id ?? orderId;

  // Mutation
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
      toast({ title: 'Saved', description: `"${vars.columnName}" updated and logged.` });
    },
    onError: (err: any, vars) => {
      setSavingColumn(null);
      toast({ title: 'Error', description: err.message ?? 'Update failed', variant: 'destructive' });
    },
  });

  const columns = useMemo(() => {
    const cols = colData?.columns ?? [];
    const visible = showAdvanced ? cols : cols.filter(c => c.tier !== 'advanced');
    if (!filterText.trim()) return visible;
    const lower = filterText.toLowerCase();
    return visible.filter(c => c.column_name.toLowerCase().includes(lower));
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
    const currentVal = order ? formatValue(order[col.column_name]) : '';
    setEditingColumn(col.column_name);
    setDraftValue(pendingEdits[col.column_name]?.new_value ?? currentVal);
    setDraftReason(pendingEdits[col.column_name]?.reason ?? '');
  };

  const cancelEdit = () => {
    setEditingColumn(null);
    setDraftValue('');
    setDraftReason('');
  };

  const stagePending = (colName: string) => {
    if (!order) return;
    if (!draftReason.trim()) {
      toast({ title: 'Reason required', description: 'Enter a reason before staging this change.', variant: 'destructive' });
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
    setEditingColumn(null);
    setDraftValue('');
    setDraftReason('');
  };

  const saveOne = async (colName: string) => {
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
    const entries = Object.values(pendingEdits);
    if (!entries.length) return;
    for (const edit of entries) {
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

      {/* Column editor — only show when order loaded */}
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
            <div className="divide-y">
              {columns.map(col => {
                const currentVal = order[col.column_name];
                const pending = pendingEdits[col.column_name];
                const isSaved = savedColumns.has(col.column_name);
                const isEditing = editingColumn === col.column_name;
                const isSaving = savingColumn === col.column_name;

                return (
                  <div key={col.column_name} className={`px-4 py-3 ${pending ? 'bg-amber-50 dark:bg-amber-950/10' : ''} ${isSaved ? 'bg-green-50 dark:bg-green-950/10' : ''}`}>
                    {/* Column header row */}
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

                    {/* Current / pending value display */}
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

                    {/* Inline editor */}
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
                            <Input
                              value={draftValue}
                              onChange={e => setDraftValue(e.target.value)}
                              className="h-8 text-sm font-mono"
                              placeholder="Enter new value (blank = null)"
                              autoFocus
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">
                            Reason for change <span className="text-red-500">*</span>
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
                            disabled={!draftReason.trim()}
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
              })}

              {columns.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No columns match your filter.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
