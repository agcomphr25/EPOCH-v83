import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, CheckCircle2, XCircle, CheckCircle, AlertTriangle, Tag } from 'lucide-react';

const FIELD_LABELS: Record<string, string> = {
  stock_model:   'Stock Model',
  material:      'Material',
  handedness:    'Handedness',
  action_inlet:  'Action Inlet',
  barrel_inlet:  'Barrel Inlet',
  bottom_metal:  'Bottom Metal',
  paint_options: 'Paint',
  texture:       'Texture',
  action_length: 'Action Length',
  qds:           'QDS',
};

// ─── Tab 1: Order → Item Code ──────────────────────────────────────────────

function OrderToItemCodeTab() {
  const [input, setInput] = useState('');
  const [orderId, setOrderId] = useState('');

  const { data, isFetching, isError } = useQuery<any>({
    queryKey: ['/api/admin/order-lookup', orderId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/order-lookup?orderId=${encodeURIComponent(orderId)}`);
      if (!res.ok) throw new Error('Lookup failed');
      return res.json();
    },
    enabled: !!orderId,
  });

  const handleSearch = () => setOrderId(input.trim());

  const candidates: any[] = data?.candidates ?? [];
  const matches: any[] = data?.matches ?? [];
  const topScore: number = data?.topScore ?? 0;
  const maxPossible: number = data?.maxPossible ?? 0;
  const totalScored: number = data?.totalScored ?? 0;
  const isPerfect = topScore > 0 && topScore === maxPossible;
  const isDefinitive = matches.length === 1;

  const selectCandidate = (candidateOrderId: string) => {
    setInput(candidateOrderId);
    setOrderId(candidateOrderId);
  };

  const directItemCode: string | null = (() => {
    if (!data?.order) return null;
    const o = data.order;
    const candidate = o.poi_item_id || o.item_id || null;
    if (!candidate || /^\d+$/.test(candidate.trim())) return null;
    return candidate.trim();
  })();

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        Enter a production order ID to find its matching item code from the product catalog.
      </p>

      <div className="flex gap-2 max-w-lg">
        <Input
          placeholder="e.g. PO-P18432-41-1"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          autoFocus
        />
        <Button onClick={handleSearch} disabled={!input.trim() || isFetching}>
          <Search className="h-4 w-4 mr-2" />
          {isFetching ? 'Searching...' : 'Search'}
        </Button>
      </div>

      {isError && (
        <p className="text-sm text-red-500">Something went wrong. Check the order ID and try again.</p>
      )}

      {data && !data.order && candidates.length === 0 && (
        <p className="text-sm text-muted-foreground">No production order found for <strong>{orderId}</strong>.</p>
      )}

      {candidates.length > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {candidates.length} matching orders — select one to view details
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((c: any) => (
                  <TableRow
                    key={c.order_id}
                    className="cursor-pointer hover:bg-muted/60"
                    onClick={() => selectCandidate(c.order_id)}
                  >
                    <TableCell className="font-mono font-medium">{c.order_id}</TableCell>
                    <TableCell>{c.po_number || '—'}</TableCell>
                    <TableCell>{c.current_department || '—'}</TableCell>
                    <TableCell><Badge variant="outline">{c.production_status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {data?.order && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Order Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-sm">
                <div><dt className="text-muted-foreground">Order ID</dt><dd className="font-mono font-medium">{data.order.order_id}</dd></div>
                <div><dt className="text-muted-foreground">PO Number</dt><dd className="font-medium">{data.order.po_number}</dd></div>
                <div><dt className="text-muted-foreground">Current Dept</dt><dd className="font-medium">{data.order.current_department || '—'}</dd></div>
                <div><dt className="text-muted-foreground">Status</dt><dd><Badge variant="outline">{data.order.production_status}</Badge></dd></div>
              </dl>
              {data.specs && Object.keys(data.specs).length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Specifications</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(data.specs as Record<string, string>)
                      .filter(([, v]) => v && typeof v === 'string')
                      .map(([k, v]) => (
                        <span key={k} className="text-xs bg-muted px-2 py-0.5 rounded">
                          <span className="text-muted-foreground">{k}:</span> {v}
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {directItemCode ? (
            <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
              <CardContent className="py-4 flex items-center gap-4">
                <Tag className="h-5 w-5 text-blue-600 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-0.5">
                    Associated Item Code (via PO link)
                  </p>
                  <p className="font-mono font-bold text-lg text-blue-900 dark:text-blue-100">
                    {directItemCode}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed border-muted">
              <CardContent className="py-4 flex items-center gap-3 text-muted-foreground">
                <Tag className="h-4 w-4 shrink-0 opacity-50" />
                <p className="text-sm">No direct item code linked to this order — see spec-match results below.</p>
              </CardContent>
            </Card>
          )}

          {matches.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <XCircle className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No item codes match this order's specifications.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {isPerfect && isDefinitive ? (
                        <>
                          <CheckCircle className="h-5 w-5 text-green-600" />
                          Exact Match Found
                        </>
                      ) : isPerfect ? (
                        <>
                          <CheckCircle className="h-5 w-5 text-green-600" />
                          {matches.length} Exact Matches
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-5 w-5 text-yellow-500" />
                          Closest Match{matches.length > 1 ? 'es' : ''} — Partial
                        </>
                      )}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {isPerfect && isDefinitive
                        ? `All ${maxPossible} scorable spec fields match perfectly.`
                        : isPerfect
                        ? `All ${maxPossible} spec fields match. ${matches.length} products share this item code.`
                        : `Best match is ${topScore}/${maxPossible} spec fields. ${totalScored - matches.length} lower-scoring products filtered out.`}
                    </p>
                  </div>
                  <Badge variant={isPerfect ? 'default' : 'secondary'} className="shrink-0 text-sm px-3 py-1">
                    {topScore}/{maxPossible}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item Code</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Matched Fields</TableHead>
                      {!isPerfect && <TableHead>Mismatches</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matches.map((m: any) => (
                      <TableRow key={m.id} className={isPerfect ? 'bg-green-50 dark:bg-green-950/20' : ''}>
                        <TableCell className="font-mono font-semibold text-sm">{m.product_name}</TableCell>
                        <TableCell className="text-sm">{m.customer_name || '—'}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {m.matchedFields.map((f: string) => (
                              <span key={f} className="flex items-center gap-0.5 text-xs text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400 px-1.5 py-0.5 rounded">
                                <CheckCircle2 className="h-3 w-3" /> {FIELD_LABELS[f] ?? f}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                        {!isPerfect && (
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {m.mismatchedFields.map((f: string) => (
                                <span key={f} className="flex items-center gap-0.5 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 px-1.5 py-0.5 rounded">
                                  <XCircle className="h-3 w-3" /> {FIELD_LABELS[f] ?? f}
                                </span>
                              ))}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab 2: Item Code → Orders ─────────────────────────────────────────────

function ItemCodeToOrdersTab() {
  const [input, setInput] = useState('');
  const [itemCode, setItemCode] = useState('');

  const { data, isFetching, isError } = useQuery<any>({
    queryKey: ['/api/admin/item-code-lookup', itemCode],
    queryFn: async () => {
      const res = await fetch(`/api/admin/item-code-lookup?itemCode=${encodeURIComponent(itemCode)}`);
      if (!res.ok) throw new Error('Lookup failed');
      return res.json();
    },
    enabled: !!itemCode,
  });

  const handleSearch = () => setItemCode(input.trim());

  const orders: any[] = data?.orders ?? [];

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        Enter a full or partial item code to find all production orders linked to it.
      </p>

      <div className="flex gap-2 max-w-lg">
        <Input
          placeholder="e.g. AG-CRB-AHV105-SR"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <Button onClick={handleSearch} disabled={!input.trim() || isFetching}>
          <Search className="h-4 w-4 mr-2" />
          {isFetching ? 'Searching...' : 'Search'}
        </Button>
      </div>

      {isError && (
        <p className="text-sm text-red-500">Something went wrong. Check the item code and try again.</p>
      )}

      {data && orders.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <XCircle className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No production orders found matching <strong className="font-mono">{itemCode}</strong>.</p>
          </CardContent>
        </Card>
      )}

      {orders.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {orders.length} order{orders.length !== 1 ? 's' : ''} matching <span className="font-mono">{itemCode}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Current Dept</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Item Code</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o: any) => (
                  <TableRow key={o.order_id}>
                    <TableCell className="font-mono font-medium">{o.order_id}</TableCell>
                    <TableCell>{o.po_number || '—'}</TableCell>
                    <TableCell>{o.current_department || '—'}</TableCell>
                    <TableCell><Badge variant="outline">{o.production_status}</Badge></TableCell>
                    <TableCell className="font-mono text-sm">{o.resolved_item_code || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function OrderLookupPage() {
  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Order Lookup</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Look up production orders by order ID or item code.
        </p>
      </div>

      <Tabs defaultValue="order-to-item">
        <TabsList>
          <TabsTrigger value="order-to-item">Order → Item Code</TabsTrigger>
          <TabsTrigger value="item-to-orders">Item Code → Orders</TabsTrigger>
        </TabsList>

        <TabsContent value="order-to-item" className="mt-6">
          <OrderToItemCodeTab />
        </TabsContent>

        <TabsContent value="item-to-orders" className="mt-6">
          <ItemCodeToOrdersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
