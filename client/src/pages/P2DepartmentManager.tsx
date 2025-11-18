import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useBarcodeInput } from '@/hooks/useBarcodeInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Scan,
  Package,
  ArrowRight,
  Pause,
  Play,
  Trash2,
  History,
  CheckCircle,
  Clock,
  AlertCircle,
  Route,
} from 'lucide-react';
import PartRoutingWizard from '@/components/PartRoutingWizard';

const P2_DEPARTMENTS = [
  'Layup',
  'Assemble/Disassembly',
  'CNC',
  'Finish',
  'Paint',
  'Final QC',
] as const;

type Department = typeof P2_DEPARTMENTS[number];

interface P2SerializedItem {
  id: string;  // UUID
  serialNumber: string;
  barcode: string;
  poNumber: string;
  partNumber: string;
  partName: string;
  customerName: string;
  currentDepartment: string;
  currentStageIndex: number;
  status: 'ACTIVE' | 'COMPLETED' | 'SCRAPPED' | 'HOLD';
  sequenceNumber: number;
  notes?: string;
  holdReason?: string;
  scrapReason?: string;
  createdAt: string;
  updatedAt: string;
}

interface P2SerializedItemEvent {
  id: string;  // UUID
  eventType: string;
  fromDepartment?: string;
  toDepartment?: string;
  performedBy: string;
  notes?: string;
  createdAt: string;
}

interface MaterialRequirement {
  partId: string;
  partNumber: string;
  partName: string;
  requiredFields: string[];
}

interface PartRouting {
  id: string;
  inventoryItemId: string;
  partNumber: string;
  partName: string;
  departmentSequence: string[];
  traceabilityConfig: Record<string, string[]>;
  departmentMaterials?: Record<string, MaterialRequirement[]>;
}

interface TraceabilityData {
  lotNumber?: string;
  batchNumber?: string;
  expirationDate?: string;
  serialNumber?: string;
  revision?: string;
}

interface MaterialTraceabilityData {
  [partId: string]: TraceabilityData;
}

export default function P2DepartmentManager() {
  const [selectedDepartment, setSelectedDepartment] = useState<Department>('Layup');
  const [selectedItem, setSelectedItem] = useState<P2SerializedItem | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [holdReason, setHoldReason] = useState('');
  const [scrapReason, setScrapReason] = useState('');
  const [showHoldDialog, setShowHoldDialog] = useState(false);
  const [showScrapDialog, setShowScrapDialog] = useState(false);
  const [showRoutingWizard, setShowRoutingWizard] = useState(false);
  const [showTraceabilityDialog, setShowTraceabilityDialog] = useState(false);
  const [traceabilityData, setTraceabilityData] = useState<TraceabilityData>({});
  const [materialTraceabilityData, setMaterialTraceabilityData] = useState<MaterialTraceabilityData>({});
  const [pendingTransitionItemId, setPendingTransitionItemId] = useState<string | null>(null);
  const [pendingTransitionDepartment, setPendingTransitionDepartment] = useState<string | null>(null);
  const [requiredTraceabilityFields, setRequiredTraceabilityFields] = useState<string[]>([]);
  const [requiredMaterials, setRequiredMaterials] = useState<MaterialRequirement[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle barcode scan - defined early so it can be used by the hook
  const handleBarcodeScan = async (scanned: string) => {
    try {
      const item: P2SerializedItem = await apiRequest(`/api/p2/barcode/${scanned}`);
      
      if (item.currentDepartment !== selectedDepartment) {
        toast({
          title: 'Wrong Department',
          description: `This item is in ${item.currentDepartment}, not ${selectedDepartment}`,
          variant: 'destructive',
        });
        return;
      }

      setSelectedItem(item);
      toast({
        title: 'Item Scanned',
        description: `${item.partName} - ${item.serialNumber}`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Item not found',
        variant: 'destructive',
      });
    }
  };

  // Barcode scanner hook
  const {
    barcode,
    scannedBarcode,
    setBarcode,
    clearScan,
  } = useBarcodeInput();

  // Handle barcode scan when scannedBarcode changes
  useEffect(() => {
    if (scannedBarcode) {
      handleBarcodeScan(scannedBarcode);
      clearScan();
    }
  }, [scannedBarcode, clearScan, handleBarcodeScan]);

  // Fetch department queue
  const { data: queueItems = [], isLoading } = useQuery<P2SerializedItem[]>({
    queryKey: [`/api/p2/departments/${selectedDepartment}/queue?status=ACTIVE`],
  });

  // Fetch item history
  const { data: itemHistory = [] } = useQuery<P2SerializedItemEvent[]>({
    queryKey: selectedItem ? [`/api/p2/serialized-items/${selectedItem.id}/history`] : [],
    enabled: !!selectedItem && showHistory,
  });

  // Fetch part routing for selected item
  const { data: partRouting } = useQuery<PartRouting>({
    queryKey: selectedItem ? [`/api/part-routings/part/${selectedItem.partNumber}`] : [],
    enabled: !!selectedItem,
  });

  // Get required traceability fields for current department
  const getRequiredTraceabilityFields = () => {
    if (!partRouting || !selectedItem) return [];
    return partRouting.traceabilityConfig[selectedItem.currentDepartment] || [];
  };

  // Get required fields for a specific item and department (independent of state)
  const getRequiredFieldsForItem = async (partNumber: string, department: string): Promise<{ itemFields: string[]; materials: MaterialRequirement[] }> => {
    const routing: PartRouting = await apiRequest(`/api/part-routings/part/${partNumber}`);
    return {
      itemFields: routing.traceabilityConfig[department] || [],
      materials: routing.departmentMaterials?.[department] || [],
    };
  };

  // Save traceability mutation
  const saveTraceabilityMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: TraceabilityData & { department: string } }) =>
      apiRequest(`/api/p2/serialized-items/${itemId}/traceability`, {
        method: 'POST',
        body: {
          ...data,
          recordedBy: 'system',
        },
      }),
    onSuccess: () => {
      toast({
        title: 'Traceability Recorded',
        description: 'Traceability data saved successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save traceability data',
        variant: 'destructive',
      });
    },
  });

  // Handle transition - check for traceability requirements first
  const handleTransition = async (item: P2SerializedItem) => {
    try {
      // Fetch traceability requirements for this specific item
      const requirements = await getRequiredFieldsForItem(item.partNumber, item.currentDepartment);
      
      if (requirements.itemFields.length > 0 || requirements.materials.length > 0) {
        // Capture item and requirements for traceability dialog
        setSelectedItem(item);
        setPendingTransitionItemId(item.id);
        setPendingTransitionDepartment(item.currentDepartment);
        setRequiredTraceabilityFields(requirements.itemFields);
        setRequiredMaterials(requirements.materials);
        setShowTraceabilityDialog(true);
      } else {
        // No traceability required, proceed directly
        transitionMutation.mutate(item.id);
      }
    } catch (error: any) {
      // Fail closed - routing fetch failed, block advancement
      const errorMessage = (error.message || '').toLowerCase();
      const isNoRoutingConfigured = 
        errorMessage.includes('no active routing found') ||
        errorMessage.includes('part routing not found') ||
        errorMessage.includes('404');
      
      if (isNoRoutingConfigured) {
        // No routing configured for this part, allow advancement without traceability
        transitionMutation.mutate(item.id);
      } else {
        // Network error or server error - block advancement and show error
        toast({
          title: 'Cannot Verify Traceability Requirements',
          description: error.message || 'Failed to load routing configuration. Cannot advance item.',
          variant: 'destructive',
        });
      }
    }
  };

  // Transition mutation
  const transitionMutation = useMutation({
    mutationFn: (itemId: string) =>
      apiRequest(`/api/p2/serialized-items/${itemId}/transition`, {
        method: 'POST',
        body: { username: 'system' },
      }),
    onSuccess: () => {
      // Invalidate both ACTIVE and HOLD queues since held items can be released then advanced
      P2_DEPARTMENTS.forEach((dept) => {
        queryClient.invalidateQueries({ 
          queryKey: [`/api/p2/departments/${dept}/queue?status=ACTIVE`] 
        });
        queryClient.invalidateQueries({ 
          queryKey: [`/api/p2/departments/${dept}/queue?status=HOLD`] 
        });
      });
      toast({
        title: 'Success',
        description: 'Item transitioned to next department',
      });
      clearScan();
      setSelectedItem(null);
      setTraceabilityData({});
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to transition item',
        variant: 'destructive',
      });
    },
  });

  // Hold mutation
  const holdMutation = useMutation({
    mutationFn: ({ itemId, reason }: { itemId: string; reason: string }) =>
      apiRequest(`/api/p2/serialized-items/${itemId}/hold`, {
        method: 'POST',
        body: { reason, username: 'system' },
      }),
    onSuccess: () => {
      // Invalidate both ACTIVE and HOLD queues since items move between statuses
      P2_DEPARTMENTS.forEach((dept) => {
        queryClient.invalidateQueries({ 
          queryKey: [`/api/p2/departments/${dept}/queue?status=ACTIVE`] 
        });
        queryClient.invalidateQueries({ 
          queryKey: [`/api/p2/departments/${dept}/queue?status=HOLD`] 
        });
      });
      // Also invalidate history if we're viewing it
      if (selectedItem) {
        queryClient.invalidateQueries({
          queryKey: [`/api/p2/serialized-items/${selectedItem.id}/history`]
        });
      }
      toast({
        title: 'Success',
        description: 'Item placed on hold',
      });
      setShowHoldDialog(false);
      setHoldReason('');
      setSelectedItem(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to place item on hold',
        variant: 'destructive',
      });
    },
  });

  // Release mutation
  const releaseMutation = useMutation({
    mutationFn: (itemId: string) =>
      apiRequest(`/api/p2/serialized-items/${itemId}/release`, {
        method: 'POST',
        body: { username: 'system' },
      }),
    onSuccess: () => {
      // Invalidate both ACTIVE and HOLD queues since items move between statuses
      P2_DEPARTMENTS.forEach((dept) => {
        queryClient.invalidateQueries({ 
          queryKey: [`/api/p2/departments/${dept}/queue?status=ACTIVE`] 
        });
        queryClient.invalidateQueries({ 
          queryKey: [`/api/p2/departments/${dept}/queue?status=HOLD`] 
        });
      });
      toast({
        title: 'Success',
        description: 'Item released from hold',
      });
      setSelectedItem(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to release item from hold',
        variant: 'destructive',
      });
    },
  });

  // Scrap mutation
  const scrapMutation = useMutation({
    mutationFn: ({ itemId, reason }: { itemId: string; reason: string }) =>
      apiRequest(`/api/p2/serialized-items/${itemId}/scrap`, {
        method: 'POST',
        body: { reason, username: 'system' },
      }),
    onSuccess: () => {
      // Invalidate both ACTIVE and HOLD queues since scrapped items disappear from view
      P2_DEPARTMENTS.forEach((dept) => {
        queryClient.invalidateQueries({ 
          queryKey: [`/api/p2/departments/${dept}/queue?status=ACTIVE`] 
        });
        queryClient.invalidateQueries({ 
          queryKey: [`/api/p2/departments/${dept}/queue?status=HOLD`] 
        });
      });
      // Also invalidate history if we're viewing it
      if (selectedItem) {
        queryClient.invalidateQueries({
          queryKey: [`/api/p2/serialized-items/${selectedItem.id}/history`]
        });
      }
      toast({
        title: 'Success',
        description: 'Item scrapped',
      });
      setShowScrapDialog(false);
      setScrapReason('');
      setSelectedItem(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to scrap item',
        variant: 'destructive',
      });
    },
  });

  // Focus input on department change
  useEffect(() => {
    inputRef.current?.focus();
  }, [selectedDepartment]);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline', icon: any }> = {
      ACTIVE: { variant: 'default', icon: CheckCircle },
      HOLD: { variant: 'secondary', icon: Pause },
      SCRAPPED: { variant: 'destructive', icon: Trash2 },
      COMPLETED: { variant: 'outline', icon: CheckCircle },
    };

    const config = variants[status] || variants.ACTIVE;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
            P2 Department Manager
          </h1>
          <p className="text-muted-foreground">
            Track and manage serialized items through manufacturing workflow
          </p>
        </div>
        <Button
          data-testid="button-configure-routing"
          onClick={() => setShowRoutingWizard(true)}
          className="flex items-center gap-2"
        >
          <Route className="h-4 w-4" />
          Configure Part Routing
        </Button>
      </div>

      {/* Barcode Scanner Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scan className="h-5 w-5" />
            Barcode Scanner
          </CardTitle>
          <CardDescription>
            Scan item barcode to select and process
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="barcode-input">Barcode</Label>
              <Input
                id="barcode-input"
                ref={inputRef}
                data-testid="input-barcode"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Scan or enter barcode..."
                className="font-mono text-lg"
                autoFocus
              />
            </div>
            {selectedItem && (
              <div className="flex gap-2">
                <Button
                  data-testid="button-transition"
                  onClick={() => handleTransition(selectedItem)}
                  disabled={transitionMutation.isPending}
                >
                  <ArrowRight className="mr-2 h-4 w-4" />
                  Advance to Next Department
                </Button>
                <Button
                  data-testid="button-hold"
                  variant="outline"
                  onClick={() => setShowHoldDialog(true)}
                >
                  <Pause className="mr-2 h-4 w-4" />
                  Hold
                </Button>
                <Button
                  data-testid="button-scrap"
                  variant="destructive"
                  onClick={() => setShowScrapDialog(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Scrap
                </Button>
                <Button
                  data-testid="button-history"
                  variant="outline"
                  onClick={() => setShowHistory(true)}
                >
                  <History className="mr-2 h-4 w-4" />
                  History
                </Button>
              </div>
            )}
          </div>

          {/* Selected Item Display */}
          {selectedItem && (
            <div className="mt-4 p-4 border rounded-lg bg-muted/50" data-testid="card-selected-item">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Serial Number</p>
                  <p className="font-mono font-semibold" data-testid="text-serial-number">{selectedItem.serialNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Part</p>
                  <p className="font-semibold" data-testid="text-part-name">{selectedItem.partName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">PO Number</p>
                  <p className="font-semibold">{selectedItem.poNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Customer</p>
                  <p className="font-semibold">{selectedItem.customerName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  {getStatusBadge(selectedItem.status)}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Department</p>
                  <p className="font-semibold">{selectedItem.currentDepartment}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Department Tabs */}
      <Tabs value={selectedDepartment} onValueChange={(v) => setSelectedDepartment(v as Department)}>
        <TabsList className="grid w-full grid-cols-6">
          {P2_DEPARTMENTS.map((dept) => (
            <TabsTrigger key={dept} value={dept} data-testid={`tab-${dept.toLowerCase().replace(/[\/\s]/g, '-')}`}>
              {dept}
            </TabsTrigger>
          ))}
        </TabsList>

        {P2_DEPARTMENTS.map((dept) => (
          <TabsContent key={dept} value={dept} className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  {dept} Queue ({queueItems.length} items)
                </CardTitle>
                <CardDescription>
                  Items currently in the {dept} department
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8">
                    <Clock className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                    <p className="mt-2 text-muted-foreground">Loading queue...</p>
                  </div>
                ) : queueItems.length === 0 ? (
                  <div className="text-center py-8">
                    <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground" />
                    <p className="mt-2 text-muted-foreground">No items in this department</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Serial Number</TableHead>
                        <TableHead>Part Number</TableHead>
                        <TableHead>Part Name</TableHead>
                        <TableHead>PO Number</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {queueItems.map((item) => (
                        <TableRow 
                          key={item.id} 
                          data-testid={`row-item-${item.id}`}
                          className={selectedItem?.id === item.id ? 'bg-muted' : ''}
                        >
                          <TableCell className="font-mono text-sm">{item.serialNumber}</TableCell>
                          <TableCell className="font-mono">{item.partNumber}</TableCell>
                          <TableCell>{item.partName}</TableCell>
                          <TableCell>{item.poNumber}</TableCell>
                          <TableCell>{item.customerName}</TableCell>
                          <TableCell>{getStatusBadge(item.status)}</TableCell>
                          <TableCell>{new Date(item.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                data-testid={`button-advance-${item.id}`}
                                onClick={() => handleTransition(item)}
                                disabled={transitionMutation.isPending || item.status !== 'ACTIVE'}
                              >
                                <ArrowRight className="mr-1 h-3 w-3" />
                                Advance
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                data-testid={`button-hold-${item.id}`}
                                onClick={() => {
                                  setSelectedItem(item);
                                  setShowHoldDialog(true);
                                }}
                                disabled={item.status !== 'ACTIVE'}
                              >
                                <Pause className="mr-1 h-3 w-3" />
                                Hold
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                data-testid={`button-scrap-${item.id}`}
                                onClick={() => {
                                  setSelectedItem(item);
                                  setShowScrapDialog(true);
                                }}
                              >
                                <Trash2 className="mr-1 h-3 w-3" />
                                Scrap
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                data-testid={`button-history-${item.id}`}
                                onClick={() => {
                                  setSelectedItem(item);
                                  setShowHistory(true);
                                }}
                              >
                                <History className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Hold Dialog */}
      <Dialog open={showHoldDialog} onOpenChange={setShowHoldDialog}>
        <DialogContent data-testid="dialog-hold">
          <DialogHeader>
            <DialogTitle>Place Item on Hold</DialogTitle>
            <DialogDescription>
              Provide a reason for placing this item on hold
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="hold-reason">Hold Reason</Label>
              <Textarea
                id="hold-reason"
                data-testid="input-hold-reason"
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                placeholder="Enter reason for hold..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowHoldDialog(false)}>
                Cancel
              </Button>
              <Button
                data-testid="button-confirm-hold"
                onClick={() => {
                  if (selectedItem && holdReason) {
                    holdMutation.mutate({ itemId: selectedItem.id, reason: holdReason });
                  }
                }}
                disabled={!holdReason || holdMutation.isPending}
              >
                Confirm Hold
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Scrap Dialog */}
      <Dialog open={showScrapDialog} onOpenChange={setShowScrapDialog}>
        <DialogContent data-testid="dialog-scrap">
          <DialogHeader>
            <DialogTitle>Scrap Item</DialogTitle>
            <DialogDescription>
              Provide a reason for scrapping this item
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="scrap-reason">Scrap Reason</Label>
              <Textarea
                id="scrap-reason"
                data-testid="input-scrap-reason"
                value={scrapReason}
                onChange={(e) => setScrapReason(e.target.value)}
                placeholder="Enter reason for scrap..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowScrapDialog(false)}>
                Cancel
              </Button>
              <Button
                data-testid="button-confirm-scrap"
                variant="destructive"
                onClick={() => {
                  if (selectedItem && scrapReason) {
                    scrapMutation.mutate({ itemId: selectedItem.id, reason: scrapReason });
                  }
                }}
                disabled={!scrapReason || scrapMutation.isPending}
              >
                Confirm Scrap
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-3xl" data-testid="dialog-history">
          <DialogHeader>
            <DialogTitle>Item History</DialogTitle>
            <DialogDescription>
              {selectedItem?.serialNumber} - {selectedItem?.partName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {itemHistory.map((event) => (
              <div key={event.id} className="border rounded p-3 space-y-1" data-testid={`event-${event.id}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <Badge>{event.eventType}</Badge>
                    {event.fromDepartment && event.toDepartment && (
                      <span className="ml-2 text-sm">
                        {event.fromDepartment} → {event.toDepartment}
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">By: {event.performedBy}</p>
                {event.notes && (
                  <p className="text-sm">{event.notes}</p>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Traceability Dialog */}
      <Dialog open={showTraceabilityDialog} onOpenChange={setShowTraceabilityDialog}>
        <DialogContent data-testid="dialog-traceability">
          <DialogHeader>
            <DialogTitle>Record Traceability Data</DialogTitle>
            <DialogDescription>
              Enter required traceability information for {selectedItem?.currentDepartment}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {requiredTraceabilityFields.includes('lotNumber') && (
              <div>
                <Label htmlFor="lot-number">Lot Number *</Label>
                <Input
                  id="lot-number"
                  data-testid="input-lot-number"
                  value={traceabilityData.lotNumber || ''}
                  onChange={(e) => setTraceabilityData({ ...traceabilityData, lotNumber: e.target.value })}
                  placeholder="Scan or enter lot number..."
                />
              </div>
            )}
            {requiredTraceabilityFields.includes('batchNumber') && (
              <div>
                <Label htmlFor="batch-number">Batch Number *</Label>
                <Input
                  id="batch-number"
                  data-testid="input-batch-number"
                  value={traceabilityData.batchNumber || ''}
                  onChange={(e) => setTraceabilityData({ ...traceabilityData, batchNumber: e.target.value })}
                  placeholder="Scan or enter batch number..."
                />
              </div>
            )}
            {requiredTraceabilityFields.includes('expirationDate') && (
              <div>
                <Label htmlFor="expiration-date">Expiration Date *</Label>
                <Input
                  id="expiration-date"
                  data-testid="input-expiration-date"
                  type="date"
                  value={traceabilityData.expirationDate || ''}
                  onChange={(e) => setTraceabilityData({ ...traceabilityData, expirationDate: e.target.value })}
                />
              </div>
            )}
            {requiredTraceabilityFields.includes('serialNumber') && (
              <div>
                <Label htmlFor="component-serial">Component Serial Number *</Label>
                <Input
                  id="component-serial"
                  data-testid="input-component-serial"
                  value={traceabilityData.serialNumber || ''}
                  onChange={(e) => setTraceabilityData({ ...traceabilityData, serialNumber: e.target.value })}
                  placeholder="Scan or enter component serial..."
                />
              </div>
            )}
            {requiredTraceabilityFields.includes('revision') && (
              <div>
                <Label htmlFor="revision">Revision *</Label>
                <Input
                  id="revision"
                  data-testid="input-revision"
                  value={traceabilityData.revision || ''}
                  onChange={(e) => setTraceabilityData({ ...traceabilityData, revision: e.target.value })}
                  placeholder="Enter revision..."
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => {
                setShowTraceabilityDialog(false);
                setTraceabilityData({});
                setPendingTransitionItemId(null);
                setPendingTransitionDepartment(null);
                setRequiredTraceabilityFields([]);
              }}>
                Cancel
              </Button>
              <Button
                data-testid="button-confirm-traceability"
                onClick={async () => {
                  if (!pendingTransitionItemId || !pendingTransitionDepartment) {
                    toast({
                      title: 'Error',
                      description: 'No item queued for transition',
                      variant: 'destructive',
                    });
                    return;
                  }

                  // Validate required fields are filled
                  const missingFields = requiredTraceabilityFields.filter(field => {
                    const value = traceabilityData[field as keyof TraceabilityData];
                    return !value || value.trim() === '';
                  });

                  if (missingFields.length > 0) {
                    toast({
                      title: 'Missing Required Fields',
                      description: 'Please fill in all required traceability fields',
                      variant: 'destructive',
                    });
                    return;
                  }

                  try {
                    // Save traceability data first
                    await saveTraceabilityMutation.mutateAsync({
                      itemId: pendingTransitionItemId,
                      data: { ...traceabilityData, department: pendingTransitionDepartment },
                    });

                    // Proceed with transition after successful save
                    transitionMutation.mutate(pendingTransitionItemId);
                    
                    // Reset dialog state
                    setShowTraceabilityDialog(false);
                    setTraceabilityData({});
                    setPendingTransitionItemId(null);
                    setPendingTransitionDepartment(null);
                    setRequiredTraceabilityFields([]);
                  } catch (error) {
                    // Error handling is done by mutation onError
                  }
                }}
                disabled={saveTraceabilityMutation.isPending || transitionMutation.isPending || requiredTraceabilityFields.length === 0}
              >
                Save & Advance
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Part Routing Wizard */}
      <PartRoutingWizard
        open={showRoutingWizard}
        onOpenChange={setShowRoutingWizard}
      />
    </div>
  );
}
