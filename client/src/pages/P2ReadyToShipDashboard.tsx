import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowLeft,
  Truck,
  Package,
  CheckCircle,
  AlertTriangle,
  Clock,
  Search,
  ExternalLink,
  Zap,
  Users,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import ShipmentSummaryModal from '@/components/p2/ShipmentSummaryModal';

type SerializedUnit = {
  id: string;
  barcode: string;
  serialNumber: string;
  partNumber: string;
  partName: string;
  poNumber: string;
  poId: number;
  customerId: string;
  customerName: string;
  status: string;
  completedAt: string | null;
  finalizedAt: string | null;
  sku: string | null;
  drawingName: string | null;
};

type POSummary = {
  poNumber: string;
  poId: number;
  customerName: string;
  customerId: string;
  totalUnits: number;
  readyCount: number;
  needsFinalizationCount: number;
  inProductionCount: number;
  readyUnits: SerializedUnit[];
};

type CustomerSummary = {
  customerName: string;
  totalUnits: number;
  readyCount: number;
  poCount: number;
};

export default function P2ReadyToShipDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [summaryModalPO, setSummaryModalPO] = useState<string | null>(null);
  const [summaryModalSerials, setSummaryModalSerials] = useState<SerializedUnit[]>([]);
  const [creatingShipmentFor, setCreatingShipmentFor] = useState<string | null>(null);

  const { data: units = [], isLoading, refetch } = useQuery<SerializedUnit[]>({
    queryKey: ['/api/p2/serialized-items/shipping-queue'],
    refetchInterval: 30000,
  });

  // Derive groupings
  const { poSummaries, customerSummaries, totals } = useMemo(() => {
    const byPO: Record<string, POSummary> = {};
    const byCust: Record<string, CustomerSummary> = {};

    for (const u of units) {
      const isReady = !!(u.finalizedAt && u.sku && u.drawingName && u.status === 'COMPLETED');
      const needsFinalization = !!(u.completedAt && u.status === 'COMPLETED' && (!u.finalizedAt || !u.sku || !u.drawingName));
      const inProduction = !u.completedAt;

      // PO group
      if (!byPO[u.poNumber]) {
        byPO[u.poNumber] = {
          poNumber: u.poNumber,
          poId: u.poId,
          customerName: u.customerName,
          customerId: u.customerId,
          totalUnits: 0,
          readyCount: 0,
          needsFinalizationCount: 0,
          inProductionCount: 0,
          readyUnits: [],
        };
      }
      byPO[u.poNumber].totalUnits++;
      if (isReady) { byPO[u.poNumber].readyCount++; byPO[u.poNumber].readyUnits.push(u); }
      if (needsFinalization) byPO[u.poNumber].needsFinalizationCount++;
      if (inProduction) byPO[u.poNumber].inProductionCount++;

      // Customer group
      if (!byCust[u.customerName]) {
        byCust[u.customerName] = { customerName: u.customerName, totalUnits: 0, readyCount: 0, poCount: 0 };
      }
      byCust[u.customerName].totalUnits++;
      if (isReady) byCust[u.customerName].readyCount++;
    }

    // Count POs per customer
    for (const po of Object.values(byPO)) {
      byCust[po.customerName].poCount++;
    }

    const totalReady = units.filter((u) => !!(u.finalizedAt && u.sku && u.drawingName && u.status === 'COMPLETED')).length;
    const totalNeedsFinalization = units.filter((u) => !!(u.completedAt && u.status === 'COMPLETED' && (!u.finalizedAt || !u.sku || !u.drawingName))).length;
    const totalInProduction = units.filter((u) => !u.completedAt).length;

    return {
      poSummaries: Object.values(byPO).sort((a, b) => b.readyCount - a.readyCount || a.poNumber.localeCompare(b.poNumber)),
      customerSummaries: Object.values(byCust).sort((a, b) => b.readyCount - a.readyCount),
      totals: { totalReady, totalNeedsFinalization, totalInProduction, totalPOs: Object.keys(byPO).length },
    };
  }, [units]);

  const filteredPOs = useMemo(() => {
    if (!search.trim()) return poSummaries;
    const t = search.toLowerCase();
    return poSummaries.filter(
      (p) => p.poNumber.toLowerCase().includes(t) || p.customerName.toLowerCase().includes(t)
    );
  }, [poSummaries, search]);

  const handleShipAll = (po: POSummary) => {
    if (po.readyUnits.length === 0) return;
    setSummaryModalSerials(po.readyUnits);
    setSummaryModalPO(po.poNumber);
  };

  const handleConfirmShipment = async () => {
    const po = summaryModalPO;
    if (!po) return;
    const serials = summaryModalSerials;
    setSummaryModalPO(null);
    setSummaryModalSerials([]);
    setCreatingShipmentFor(po);
    try {
      const lot = await apiRequest('/api/p2/lots', {
        method: 'POST',
        body: JSON.stringify({ serialIds: serials.map((s) => s.id), createdBy: 'shipping' }),
      });
      const slip = await apiRequest('/api/p2/packing-slips', {
        method: 'POST',
        body: JSON.stringify({ lotId: lot.id, createdBy: 'shipping' }),
      });
      toast({
        title: 'Shipment Created',
        description: `Packing slip ${slip.packingSlipNumber} generated. View it in the Shipping tab.`,
      });
      refetch();
    } catch (err: any) {
      toast({
        title: 'Shipment Failed',
        description: err?.message || 'Failed to create shipment',
        variant: 'destructive',
      });
    } finally {
      setCreatingShipmentFor(null);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-6xl">
      {summaryModalPO && (
        <ShipmentSummaryModal
          serials={summaryModalSerials}
          onConfirm={handleConfirmShipment}
          onCancel={() => { setSummaryModalPO(null); setSummaryModalSerials([]); }}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation('/p2-control-center')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Ready to Ship Dashboard</h1>
          <p className="text-sm text-muted-foreground">Live view of finalized units awaiting shipment</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
        <Button variant="outline" size="sm" onClick={() => setLocation('/p2-control-center?tab=shipping')}>
          <ExternalLink className="h-4 w-4 mr-2" />
          Shipping Tab
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 text-center border-green-200 dark:border-green-800">
          <div className="flex items-center justify-center mb-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
          </div>
          <div className="text-3xl font-bold text-green-600">{totals.totalReady}</div>
          <div className="text-xs text-muted-foreground mt-1">Ready to Ship</div>
        </Card>
        <Card className="p-4 text-center border-amber-200 dark:border-amber-800">
          <div className="flex items-center justify-center mb-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <div className="text-3xl font-bold text-amber-600">{totals.totalNeedsFinalization}</div>
          <div className="text-xs text-muted-foreground mt-1">Needs Finalization</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="flex items-center justify-center mb-2">
            <Clock className="h-5 w-5 text-blue-600" />
          </div>
          <div className="text-3xl font-bold text-blue-600">{totals.totalInProduction}</div>
          <div className="text-xs text-muted-foreground mt-1">In Production</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="flex items-center justify-center mb-2">
            <Package className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="text-3xl font-bold">{totals.totalPOs}</div>
          <div className="text-xs text-muted-foreground mt-1">Active POs</div>
        </Card>
      </div>

      {/* PO Table */}
      <Card>
        <div className="p-4 border-b flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">By Purchase Order</h2>
            <Badge variant="secondary">{filteredPOs.length}</Badge>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search PO or customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading shipping queue...
          </div>
        ) : filteredPOs.length === 0 ? (
          <div className="text-center py-12">
            <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">{search ? 'No matching POs' : 'No units in shipping queue'}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO Number</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-center">
                  <span className="text-green-600">Ready</span>
                </TableHead>
                <TableHead className="text-center">
                  <span className="text-amber-600">Needs Fin.</span>
                </TableHead>
                <TableHead className="text-center">In Prod.</TableHead>
                <TableHead className="text-center">Total</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPOs.map((po) => (
                <TableRow key={po.poNumber} className={po.readyCount > 0 ? 'bg-green-50/30 dark:bg-green-900/5' : ''}>
                  <TableCell className="font-mono font-medium text-sm">{po.poNumber}</TableCell>
                  <TableCell className="text-sm">{po.customerName}</TableCell>
                  <TableCell className="text-center">
                    {po.readyCount > 0 ? (
                      <Badge className="bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400">
                        {po.readyCount}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {po.needsFinalizationCount > 0 ? (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                        {po.needsFinalizationCount}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">
                    {po.inProductionCount > 0 ? po.inProductionCount : '—'}
                  </TableCell>
                  <TableCell className="text-center text-sm font-medium">{po.totalUnits}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => setLocation('/p2-control-center?tab=shipping')}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        View
                      </Button>
                      <Button
                        size="sm"
                        disabled={po.readyCount === 0 || creatingShipmentFor === po.poNumber}
                        className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                        onClick={() => handleShipAll(po)}
                      >
                        {creatingShipmentFor === po.poNumber ? (
                          <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Creating...</>
                        ) : (
                          <><Zap className="h-3 w-3 mr-1" />Ship All Ready</>
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Customer summary */}
      {customerSummaries.length > 0 && (
        <Card>
          <div className="p-4 border-b flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">By Customer</h2>
            <Badge variant="secondary">{customerSummaries.length}</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
            {customerSummaries.map((c) => (
              <div
                key={c.customerName}
                className="border rounded-md p-3 space-y-1.5"
              >
                <div className="font-medium text-sm truncate" title={c.customerName}>{c.customerName}</div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{c.poCount} PO{c.poCount !== 1 ? 's' : ''}</span>
                  <span>{c.totalUnits} unit{c.totalUnits !== 1 ? 's' : ''}</span>
                </div>
                {c.readyCount > 0 ? (
                  <Badge className="w-full justify-center text-xs bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400">
                    {c.readyCount} ready to ship
                  </Badge>
                ) : (
                  <Badge variant="outline" className="w-full justify-center text-xs text-muted-foreground">
                    None ready
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
