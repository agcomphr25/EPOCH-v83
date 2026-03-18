import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Package,
  CheckCircle,
  AlertTriangle,
  Shield,
  Loader2,
  Truck,
  Search,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  FileText,
  Download,
  ClipboardCheck,
} from 'lucide-react';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

type SerializedUnit = {
  id: string;
  barcode: string;
  serialNumber: string;
  sequenceNumber: number;
  partNumber: string;
  partName: string;
  poNumber: string;
  poId: number;
  poItemId: number;
  customerName: string;
  customerId: string;
  status: string;
  currentDepartment: string;
  currentStageIndex: number;
  buildFamilyKey: string | null;
  sku: string | null;
  drawingName: string | null;
  customerSerialNumber: string | null;
  completedAt: string | null;
  finalizedAt: string | null;
  finalizedBy: string | null;
};

type POGroup = {
  poNumber: string;
  poId: number;
  customerName: string;
  units: SerializedUnit[];
  totalUnits: number;
  finalizedCount: number;
  readyToShip: number;
  inProduction: number;
};

type CreatedShipment = {
  lotId: string;
  slipId: string;
  slipNumber: string;
  certId?: string;
  certNumber?: string;
};

export default function P2ShippingTab() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedPO, setExpandedPO] = useState<string | null>(null);
  const [finalizingPO, setFinalizingPO] = useState<string | null>(null);
  const [skuInputs, setSkuInputs] = useState<Record<string, string>>({});
  const [drawingInputs, setDrawingInputs] = useState<Record<string, string>>({});
  const [selectedSerials, setSelectedSerials] = useState<Record<string, Set<string>>>({});
  const [createdShipments, setCreatedShipments] = useState<Record<string, CreatedShipment>>({});
  const [creatingShipmentFor, setCreatingShipmentFor] = useState<string | null>(null);
  const [generatingCertFor, setGeneratingCertFor] = useState<string | null>(null);

  const { data: shippingUnits = [], isLoading, refetch } = useQuery<SerializedUnit[]>({
    queryKey: ['/api/p2/serialized-items/shipping-queue'],
    refetchInterval: 15000,
  });

  const poGroups = useMemo(() => {
    const groups: Record<string, POGroup> = {};

    for (const unit of shippingUnits) {
      const key = unit.poNumber;
      if (!groups[key]) {
        groups[key] = {
          poNumber: unit.poNumber,
          poId: unit.poId,
          customerName: unit.customerName,
          units: [],
          totalUnits: 0,
          finalizedCount: 0,
          readyToShip: 0,
          inProduction: 0,
        };
      }
      groups[key].units.push(unit);
      groups[key].totalUnits++;
      if (unit.finalizedAt && unit.sku && unit.drawingName) {
        groups[key].finalizedCount++;
      }
      if (unit.completedAt) {
        groups[key].readyToShip++;
      } else {
        groups[key].inProduction++;
      }
    }

    return Object.values(groups).sort((a, b) => {
      const aReady = a.readyToShip > 0 && a.finalizedCount < a.readyToShip ? 0 : 1;
      const bReady = b.readyToShip > 0 && b.finalizedCount < b.readyToShip ? 0 : 1;
      if (aReady !== bReady) return aReady - bReady;
      return a.poNumber.localeCompare(b.poNumber);
    });
  }, [shippingUnits]);

  const filteredGroups = useMemo(() => {
    if (!searchTerm.trim()) return poGroups;
    const term = searchTerm.toLowerCase();
    return poGroups.filter(
      (g) =>
        g.poNumber.toLowerCase().includes(term) ||
        g.customerName.toLowerCase().includes(term) ||
        g.units.some(
          (u) =>
            u.barcode.toLowerCase().includes(term) ||
            u.serialNumber.toLowerCase().includes(term) ||
            u.partNumber.toLowerCase().includes(term)
        )
    );
  }, [poGroups, searchTerm]);

  const finalizeMutation = useMutation({
    mutationFn: async (data: {
      serializedItemIds: string[];
      sku: string;
      drawingName: string;
      performedBy: string;
    }) => {
      return await apiRequest('/api/p2/serialized-items/finalize', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2/serialized-items/shipping-queue'] });
      toast({ title: 'Units Finalized', description: 'SKU and drawing name assigned successfully.' });
      setFinalizingPO(null);
    },
    onError: (error: any) => {
      const rd = error?.responseData;
      toast({
        title: 'Finalization Failed',
        description: rd?.error || error.message || 'Failed to finalize units',
        variant: 'destructive',
      });
    },
  });

  const handleFinalize = (poNumber: string, group: POGroup) => {
    const sku = skuInputs[poNumber]?.trim();
    const drawing = drawingInputs[poNumber]?.trim();
    if (!sku || !drawing) {
      toast({
        title: 'Missing Fields',
        description: 'Both SKU and Drawing Name are required.',
        variant: 'destructive',
      });
      return;
    }
    const eligibleUnits = group.units.filter(
      (u) => u.completedAt && (!u.finalizedAt || !u.sku || !u.drawingName)
    );
    if (eligibleUnits.length === 0) {
      toast({ title: 'Nothing to Finalize', description: 'All completed units are already finalized.' });
      return;
    }
    setFinalizingPO(poNumber);
    finalizeMutation.mutate({
      serializedItemIds: eligibleUnits.map((u) => u.id),
      sku,
      drawingName: drawing,
      performedBy: 'shipping',
    });
  };

  const toggleSerial = (poNumber: string, serialId: string) => {
    setSelectedSerials((prev) => {
      const current = new Set(prev[poNumber] ?? []);
      if (current.has(serialId)) {
        current.delete(serialId);
      } else {
        current.add(serialId);
      }
      return { ...prev, [poNumber]: current };
    });
  };

  const toggleSelectAll = (poNumber: string, finalizedIds: string[]) => {
    setSelectedSerials((prev) => {
      const current = prev[poNumber] ?? new Set<string>();
      const allSelected = finalizedIds.every((id) => current.has(id));
      const next = new Set(allSelected ? [] : finalizedIds);
      return { ...prev, [poNumber]: next };
    });
  };

  const handleCreateShipment = async (poNumber: string) => {
    const sel = selectedSerials[poNumber];
    if (!sel || sel.size === 0) return;

    setCreatingShipmentFor(poNumber);
    try {
      const lotRes = await apiRequest('/api/p2/lots', {
        method: 'POST',
        body: JSON.stringify({
          serialIds: Array.from(sel),
          createdBy: 'shipping',
        }),
      });
      const lot = await lotRes.json();

      const slipRes = await apiRequest('/api/p2/packing-slips', {
        method: 'POST',
        body: JSON.stringify({
          lotId: lot.id,
          createdBy: 'shipping',
        }),
      });
      const slip = await slipRes.json();

      setCreatedShipments((prev) => ({
        ...prev,
        [poNumber]: { lotId: lot.id, slipId: slip.id, slipNumber: slip.packingSlipNumber },
      }));
      setSelectedSerials((prev) => ({ ...prev, [poNumber]: new Set() }));
      toast({ title: 'Shipment Created', description: `Packing slip ${slip.packingSlipNumber} generated.` });
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

  const handleGenerateCoC = async (poNumber: string) => {
    const shipment = createdShipments[poNumber];
    if (!shipment) return;

    setGeneratingCertFor(poNumber);
    try {
      const certRes = await apiRequest('/api/p2/certificates', {
        method: 'POST',
        body: JSON.stringify({
          lotId: shipment.lotId,
          createdBy: 'shipping',
        }),
      });
      const cert = await certRes.json();

      setCreatedShipments((prev) => ({
        ...prev,
        [poNumber]: { ...prev[poNumber], certId: cert.id, certNumber: cert.certificateNumber },
      }));
      toast({ title: 'CoC Generated', description: `Certificate ${cert.certificateNumber} created.` });
    } catch (err: any) {
      toast({
        title: 'CoC Failed',
        description: err?.message || 'Failed to generate certificate',
        variant: 'destructive',
      });
    } finally {
      setGeneratingCertFor(null);
    }
  };

  const summary = useMemo(() => {
    let totalUnits = 0;
    let finalized = 0;
    let readyToShip = 0;
    let needsFinalization = 0;

    for (const g of poGroups) {
      totalUnits += g.totalUnits;
      finalized += g.finalizedCount;
      readyToShip += g.readyToShip;
      needsFinalization += g.units.filter(
        (u) => u.completedAt && (!u.finalizedAt || !u.sku || !u.drawingName)
      ).length;
    }

    return { totalUnits, finalized, readyToShip, needsFinalization, poCount: poGroups.length };
  }, [poGroups]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span className="text-muted-foreground">Loading shipping queue...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <div className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold">{summary.poCount}</div>
            <div className="text-xs text-muted-foreground">POs with Units</div>
          </div>
        </Card>
        <Card>
          <div className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold">{summary.totalUnits}</div>
            <div className="text-xs text-muted-foreground">Total Units</div>
          </div>
        </Card>
        <Card>
          <div className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-green-600">{summary.finalized}</div>
            <div className="text-xs text-muted-foreground">Finalized</div>
          </div>
        </Card>
        <Card>
          <div className="pt-4 pb-3 text-center">
            <div
              className={`text-2xl font-bold ${
                summary.needsFinalization > 0 ? 'text-amber-600' : 'text-green-600'
              }`}
            >
              {summary.needsFinalization}
            </div>
            <div className="text-xs text-muted-foreground">Needs Finalization</div>
          </div>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by PO number, customer, barcode, or part number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {filteredGroups.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/50">
          <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground font-medium">
            {searchTerm ? 'No matching POs found' : 'No units in shipping pipeline'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {searchTerm
              ? 'Try a different search term'
              : 'Units will appear here when they reach Final QC, Shipping, or are completed'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGroups.map((group) => {
            const isExpanded = expandedPO === group.poNumber;
            const completedUnfinalized = group.units.filter(
              (u) => u.completedAt && (!u.finalizedAt || !u.sku || !u.drawingName)
            );
            const allCompletedFinalized =
              completedUnfinalized.length === 0 && group.readyToShip > 0;
            const statusColor = allCompletedFinalized
              ? 'border-green-200 dark:border-green-800'
              : completedUnfinalized.length > 0
              ? 'border-amber-200 dark:border-amber-800'
              : 'border-border';

            const finalizedUnits = group.units.filter(
              (u) => !!(u.finalizedAt && u.sku && u.drawingName)
            );
            const finalizedIds = finalizedUnits.map((u) => u.id);
            const selectionForPO = selectedSerials[group.poNumber] ?? new Set<string>();
            const selectedCount = selectionForPO.size;
            const shipment = createdShipments[group.poNumber];

            return (
              <Card key={group.poNumber} className={statusColor}>
                <div
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-accent/30 transition-colors"
                  onClick={() => setExpandedPO(isExpanded ? null : group.poNumber)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex items-center justify-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <div className="font-medium text-sm flex items-center gap-2">
                        {group.poNumber}
                        <span className="text-muted-foreground font-normal">
                          — {group.customerName}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3">
                        <span>{group.totalUnits} unit(s)</span>
                        <span className="text-green-600">{group.readyToShip} completed</span>
                        {group.inProduction > 0 && (
                          <span className="text-blue-600">{group.inProduction} in production</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {allCompletedFinalized ? (
                      <Badge
                        variant="outline"
                        className="bg-green-50 text-green-700 border-green-300 dark:bg-green-900/20 dark:text-green-400"
                      >
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Ready to Ship
                      </Badge>
                    ) : completedUnfinalized.length > 0 ? (
                      <Badge
                        variant="outline"
                        className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400"
                      >
                        <Shield className="w-3 h-3 mr-1" />
                        {completedUnfinalized.length} Need Finalization
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/20 dark:text-blue-400"
                      >
                        <Loader2 className="w-3 h-3 mr-1" />
                        In Production
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-xs">
                      {group.finalizedCount}/{group.totalUnits} finalized
                    </Badge>
                  </div>
                </div>

                {isExpanded && (
                  <CardContent className="pt-0 pb-4 space-y-4">
                    {completedUnfinalized.length > 0 && (
                      <div className="p-4 bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg space-y-3">
                        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm font-medium">
                          <Shield className="w-4 h-4" />
                          {completedUnfinalized.length} completed unit(s) need SKU/Drawing
                          assignment
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label
                              htmlFor={`sku-${group.poNumber}`}
                              className="text-xs font-medium"
                            >
                              SKU *
                            </Label>
                            <Input
                              id={`sku-${group.poNumber}`}
                              placeholder="Enter SKU"
                              value={skuInputs[group.poNumber] || ''}
                              onChange={(e) =>
                                setSkuInputs((prev) => ({
                                  ...prev,
                                  [group.poNumber]: e.target.value,
                                }))
                              }
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label
                              htmlFor={`drawing-${group.poNumber}`}
                              className="text-xs font-medium"
                            >
                              Drawing Name *
                            </Label>
                            <Input
                              id={`drawing-${group.poNumber}`}
                              placeholder="Enter drawing name"
                              value={drawingInputs[group.poNumber] || ''}
                              onChange={(e) =>
                                setDrawingInputs((prev) => ({
                                  ...prev,
                                  [group.poNumber]: e.target.value,
                                }))
                              }
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleFinalize(group.poNumber, group)}
                          disabled={
                            finalizeMutation.isPending && finalizingPO === group.poNumber
                          }
                          className="bg-amber-600 hover:bg-amber-700 text-white"
                        >
                          {finalizeMutation.isPending && finalizingPO === group.poNumber ? (
                            <>
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              Finalizing...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Finalize {completedUnfinalized.length} Unit(s)
                            </>
                          )}
                        </Button>
                      </div>
                    )}

                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            {finalizedIds.length > 0 && (
                              <th className="px-3 py-2 w-8">
                                <Checkbox
                                  checked={
                                    finalizedIds.length > 0 &&
                                    finalizedIds.every((id) => selectionForPO.has(id))
                                  }
                                  onCheckedChange={() =>
                                    toggleSelectAll(group.poNumber, finalizedIds)
                                  }
                                  aria-label="Select all finalized"
                                />
                              </th>
                            )}
                            <th className="px-3 py-2 text-left font-medium text-xs">Barcode</th>
                            <th className="px-3 py-2 text-left font-medium text-xs">Part</th>
                            <th className="px-3 py-2 text-left font-medium text-xs">Department</th>
                            <th className="px-3 py-2 text-left font-medium text-xs">Status</th>
                            <th className="px-3 py-2 text-left font-medium text-xs">SKU</th>
                            <th className="px-3 py-2 text-left font-medium text-xs">Drawing</th>
                            <th className="px-3 py-2 text-left font-medium text-xs">Finalized</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {group.units.map((unit) => {
                            const isFinalized = !!(
                              unit.finalizedAt &&
                              unit.sku &&
                              unit.drawingName
                            );
                            const isCompleted = !!unit.completedAt;
                            const isSelected = selectionForPO.has(unit.id);

                            return (
                              <tr
                                key={unit.id}
                                className={
                                  isSelected
                                    ? 'bg-blue-50/60 dark:bg-blue-900/20'
                                    : isFinalized
                                    ? 'bg-green-50/50 dark:bg-green-900/10'
                                    : isCompleted
                                    ? 'bg-amber-50/50 dark:bg-amber-900/10'
                                    : ''
                                }
                              >
                                {finalizedIds.length > 0 && (
                                  <td className="px-3 py-2">
                                    {isFinalized ? (
                                      <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={() =>
                                          toggleSerial(group.poNumber, unit.id)
                                        }
                                        aria-label={`Select ${unit.serialNumber}`}
                                      />
                                    ) : (
                                      <span className="w-4 h-4 inline-block" />
                                    )}
                                  </td>
                                )}
                                <td className="px-3 py-2 font-mono text-xs">{unit.barcode}</td>
                                <td className="px-3 py-2 text-xs">
                                  <div>{unit.partNumber}</div>
                                  <div className="text-muted-foreground text-[10px]">
                                    {unit.partName}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-xs">{unit.currentDepartment}</td>
                                <td className="px-3 py-2">
                                  <span
                                    className={`text-xs px-1.5 py-0.5 rounded ${
                                      isCompleted
                                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                        : unit.status === 'HOLD'
                                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                    }`}
                                  >
                                    {isCompleted ? 'COMPLETED' : unit.status}
                                  </span>
                                  {!isCompleted && unit.status === 'ACTIVE' && (
                                    <span className="ml-1 text-[10px] text-muted-foreground">
                                      (in production)
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-xs">
                                  {unit.sku || (
                                    <span className="text-muted-foreground italic">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-xs">
                                  {unit.drawingName || (
                                    <span className="text-muted-foreground italic">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  {isFinalized ? (
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                  ) : isCompleted ? (
                                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {finalizedIds.length > 0 && !shipment && (
                      <div className="flex items-center justify-between p-3 bg-muted/30 border rounded-lg">
                        <div className="text-sm text-muted-foreground">
                          {selectedCount > 0
                            ? `${selectedCount} unit(s) selected for shipment`
                            : `${finalizedIds.length} finalized unit(s) available — select to create shipment`}
                        </div>
                        <Button
                          size="sm"
                          disabled={selectedCount === 0 || creatingShipmentFor === group.poNumber}
                          onClick={() => handleCreateShipment(group.poNumber)}
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          {creatingShipmentFor === group.poNumber ? (
                            <>
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              Creating...
                            </>
                          ) : (
                            <>
                              <Truck className="w-3 h-3 mr-1" />
                              Create Shipment ({selectedCount})
                            </>
                          )}
                        </Button>
                      </div>
                    )}

                    {shipment && (
                      <div className="p-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg space-y-3">
                        <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm font-semibold">
                          <CheckCircle className="w-4 h-4" />
                          Shipment created — {shipment.slipNumber}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-green-300 text-green-700 hover:bg-green-50"
                            onClick={() =>
                              window.open(`/api/p2/packing-slips/${shipment.slipId}/pdf`, '_blank')
                            }
                          >
                            <Download className="w-3 h-3 mr-1" />
                            Packing Slip PDF
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            className="border-green-300 text-green-700 hover:bg-green-50"
                            onClick={() =>
                              window.open(`/p2/packing-slip/${shipment.slipId}`, '_blank')
                            }
                          >
                            <FileText className="w-3 h-3 mr-1" />
                            View Packing Slip
                          </Button>

                          {shipment.certId ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-blue-300 text-blue-700 hover:bg-blue-50"
                              onClick={() =>
                                window.open(
                                  `/api/p2/certificates/${shipment.certId}/pdf`,
                                  '_blank'
                                )
                              }
                            >
                              <Download className="w-3 h-3 mr-1" />
                              CoC PDF — {shipment.certNumber}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-blue-300 text-blue-700 hover:bg-blue-50"
                              disabled={generatingCertFor === group.poNumber}
                              onClick={() => handleGenerateCoC(group.poNumber)}
                            >
                              {generatingCertFor === group.poNumber ? (
                                <>
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                  Generating...
                                </>
                              ) : (
                                <>
                                  <ClipboardCheck className="w-3 h-3 mr-1" />
                                  Generate CoC
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    {allCompletedFinalized && !shipment && (
                      <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg">
                        <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm">
                          <Truck className="w-4 h-4" />
                          <span className="font-medium">
                            All completed units finalized — select units above to create shipment
                          </span>
                        </div>
                        <Badge variant="outline" className="text-green-700 border-green-300">
                          {group.readyToShip} unit(s) ready
                        </Badge>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
