import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, CheckCircle2, XCircle, Star } from 'lucide-react';

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

export default function OrderLookupPage() {
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

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Order → Item Code Lookup</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Enter a production order ID to find its matching item code from the product catalog.
        </p>
      </div>

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

      {data && !data.order && (
        <p className="text-sm text-muted-foreground">No production order found for <strong>{orderId}</strong>.</p>
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

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Item Code Matches
                <span className="text-muted-foreground font-normal text-sm ml-2">({data.matches?.length ?? 0} found)</span>
              </CardTitle>
              <CardDescription>Sorted by best spec match. Top result is the most likely item code.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {!data.matches?.length ? (
                <p className="p-4 text-sm text-muted-foreground">No matching item codes found in the product catalog.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Item Code</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Matched Fields</TableHead>
                      <TableHead>Mismatches</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.matches.map((m: any, idx: number) => (
                      <TableRow key={m.id} className={idx === 0 ? 'bg-green-50 dark:bg-green-950/20' : ''}>
                        <TableCell>
                          {idx === 0 && <Star className="h-4 w-4 text-yellow-500 fill-yellow-400" />}
                        </TableCell>
                        <TableCell className="font-mono font-semibold text-sm">{m.product_name}</TableCell>
                        <TableCell className="text-sm">{m.customer_name || '—'}</TableCell>
                        <TableCell>
                          <Badge variant={idx === 0 ? 'default' : 'secondary'}>
                            {m.score}/{Object.keys(FIELD_LABELS).length}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {m.matchedFields.map((f: string) => (
                              <span key={f} className="flex items-center gap-0.5 text-xs text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400 px-1.5 py-0.5 rounded">
                                <CheckCircle2 className="h-3 w-3" /> {FIELD_LABELS[f] ?? f}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {m.mismatchedFields.map((f: string) => (
                              <span key={f} className="flex items-center gap-0.5 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 px-1.5 py-0.5 rounded">
                                <XCircle className="h-3 w-3" /> {FIELD_LABELS[f] ?? f}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
