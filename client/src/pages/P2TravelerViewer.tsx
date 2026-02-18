import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Search,
  Package,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Thermometer,
  Gauge,
  ClipboardCheck,
  FileText,
  Printer,
  FileSignature,
  History,
  ArrowRight,
  AlertCircle,
  ChevronRight,
  BarChart3,
  Layers,
  Download,
  Plus,
} from 'lucide-react';
import { format } from 'date-fns';

interface TravelerData {
  serializedItem: any;
  purchaseOrder: any;
  poItem: any;
  routing: any;
  departmentProgress: any[];
  workTasks: any[];
  events: any[];
  traceabilityData: any[];
  customData: any[];
  ovenCureLogs: any[];
  vacuumLeakTests: any[];
  finalInspectionResults: any[];
  qcSubmissions: any[];
  signatures: any[];
  lotNumbers: any[];
}

export default function P2TravelerViewer() {
  const { toast } = useToast();
  const [location] = useLocation();

  const urlBarcode = (() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('barcode') || '';
    } catch { return ''; }
  })();

  const [searchBarcode, setSearchBarcode] = useState(urlBarcode);
  const [searchedBarcode, setSearchedBarcode] = useState<string | null>(urlBarcode || null);
  const [isGeneratingDocs, setIsGeneratingDocs] = useState(false);
  const [showLotDialog, setShowLotDialog] = useState(false);
  const [newLotData, setNewLotData] = useState({
    customerName: '',
    poNumber: '',
    partNumber: '',
    partName: '',
    createdBy: 'system',
  });

  useEffect(() => {
    if (urlBarcode && urlBarcode !== searchedBarcode) {
      setSearchBarcode(urlBarcode);
      setSearchedBarcode(urlBarcode);
    }
  }, [urlBarcode]);

  const { data: travelerData, isLoading, error } = useQuery<TravelerData>({
    queryKey: [`/api/p2-traveler-viewer/item/${searchedBarcode}`],
    enabled: !!searchedBarcode,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchBarcode.trim()) {
      setSearchedBarcode(searchBarcode.trim());
    }
  };

  const createLotMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('/api/p2-traveler-viewer/lot-number', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (result: any) => {
      toast({
        title: 'Lot Created',
        description: `Lot ${result.lot.lotNumber} created successfully`,
      });
      setShowLotDialog(false);
      queryClient.invalidateQueries({ queryKey: [`/api/p2-traveler-viewer/item/${searchedBarcode}`] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create lot',
        variant: 'destructive',
      });
    },
  });

  const generateDocumentsMutation = useMutation({
    mutationFn: async ({ lotId, options }: { lotId: string; options: any }) => {
      return await apiRequest(`/api/p2-traveler-viewer/generate-from-lot/${lotId}`, {
        method: 'POST',
        body: JSON.stringify(options),
      });
    },
    onSuccess: (result: any) => {
      toast({
        title: 'Documents Generated',
        description: 'Documents have been generated successfully',
      });
      queryClient.invalidateQueries({ queryKey: [`/api/p2-traveler-viewer/item/${searchedBarcode}`] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate documents',
        variant: 'destructive',
      });
    },
  });

  const handleCreateLot = () => {
    if (!travelerData?.serializedItem) return;
    
    createLotMutation.mutate({
      ...newLotData,
      barcodes: [travelerData.serializedItem.barcode],
      serializedItemIds: [travelerData.serializedItem.id],
      quantity: 1,
      partNumber: travelerData.serializedItem.partNumber,
      partName: travelerData.serializedItem.partName,
      customerId: travelerData.purchaseOrder?.customerId,
      customerName: travelerData.purchaseOrder?.customerName || newLotData.customerName,
      poNumber: travelerData.purchaseOrder?.poNumber || newLotData.poNumber,
    });
  };

  const getDepartmentStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <Badge className="bg-green-100 text-green-800" data-testid="badge-status-completed"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case 'IN_PROGRESS':
        return <Badge className="bg-blue-100 text-blue-800" data-testid="badge-status-in-progress"><Clock className="h-3 w-3 mr-1" />In Progress</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800" data-testid="badge-status-pending">Pending</Badge>;
    }
  };

  const getResultBadge = (result: string) => {
    switch (result?.toUpperCase()) {
      case 'PASS':
        return <Badge className="bg-green-100 text-green-800" data-testid="badge-result-pass"><CheckCircle className="h-3 w-3 mr-1" />PASS</Badge>;
      case 'FAIL':
        return <Badge className="bg-red-100 text-red-800" data-testid="badge-result-fail"><XCircle className="h-3 w-3 mr-1" />FAIL</Badge>;
      case 'PENDING':
        return <Badge className="bg-yellow-100 text-yellow-800" data-testid="badge-result-pending"><Clock className="h-3 w-3 mr-1" />PENDING</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800" data-testid="badge-result-unknown">{result || 'N/A'}</Badge>;
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900" data-testid="page-title">P2 Traveler Viewer</h1>
          <p className="text-gray-500 mt-1">AS9100-Compliant Production Data Interface</p>
        </div>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="barcode-search" className="sr-only">Barcode</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="barcode-search"
                  placeholder="Scan or enter barcode..."
                  value={searchBarcode}
                  onChange={(e) => setSearchBarcode(e.target.value)}
                  className="pl-10"
                  data-testid="input-barcode-search"
                />
              </div>
            </div>
            <Button type="submit" data-testid="button-search">
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
          </form>
        </CardContent>
      </Card>

      {isLoading && (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock className="h-8 w-8 animate-spin mx-auto text-gray-400" />
            <p className="text-gray-500 mt-4">Loading traveler data...</p>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-8 w-8 mx-auto text-red-400" />
            <p className="text-red-500 mt-4">Failed to load traveler data. Please check the barcode and try again.</p>
          </CardContent>
        </Card>
      )}

      {travelerData && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card data-testid="card-part-info">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Part Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs text-gray-500">Barcode</Label>
                  <p className="font-mono font-bold text-lg" data-testid="text-barcode">{travelerData.serializedItem.barcode}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Serial Number</Label>
                  <p className="font-semibold" data-testid="text-serial-number">{travelerData.serializedItem.serialNumber}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Part Number</Label>
                  <p data-testid="text-part-number">{travelerData.serializedItem.partNumber}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Part Name</Label>
                  <p data-testid="text-part-name">{travelerData.serializedItem.partName}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Status</Label>
                  <div data-testid="text-status">{getDepartmentStatusBadge(travelerData.serializedItem.status)}</div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-po-info">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Purchase Order
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {travelerData.purchaseOrder ? (
                  <>
                    <div>
                      <Label className="text-xs text-gray-500">PO Number</Label>
                      <p className="font-semibold" data-testid="text-po-number">{travelerData.purchaseOrder.poNumber}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Customer</Label>
                      <p data-testid="text-customer-name">{travelerData.purchaseOrder.customerName}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Line Item</Label>
                      <p data-testid="text-line-item">{travelerData.poItem?.lineNumber || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Quantity</Label>
                      <p data-testid="text-quantity">{travelerData.poItem?.quantity || 1}</p>
                    </div>
                  </>
                ) : (
                  <p className="text-gray-500">No PO data available</p>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-routing-info">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowRight className="h-5 w-5" />
                  Routing Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Current Department</span>
                    <Badge className="bg-blue-100 text-blue-800" data-testid="badge-current-department">
                      {travelerData.serializedItem.currentDepartment}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Stage</span>
                    <span className="font-semibold" data-testid="text-stage">
                      {(travelerData.serializedItem.currentStageIndex || 0) + 1} / {travelerData.routing?.departmentSequence?.length || 0}
                    </span>
                  </div>
                  <Separator className="my-4" />
                  <div className="space-y-1">
                    {travelerData.departmentProgress?.map((dept: any, index: number) => (
                      <div key={dept.department} className="flex items-center gap-2 text-sm" data-testid={`dept-progress-${dept.department}`}>
                        {dept.status === 'COMPLETED' ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : dept.status === 'IN_PROGRESS' ? (
                          <Clock className="h-4 w-4 text-blue-500" />
                        ) : (
                          <div className="h-4 w-4 border-2 rounded-full border-gray-300" />
                        )}
                        <span className={dept.status === 'COMPLETED' ? 'text-green-700' : dept.status === 'IN_PROGRESS' ? 'text-blue-700' : 'text-gray-500'}>
                          {dept.department}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="technicians" className="w-full">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="technicians" data-testid="tab-technicians">
                <User className="h-4 w-4 mr-2" />
                Technicians
              </TabsTrigger>
              <TabsTrigger value="traceability" data-testid="tab-traceability">
                <Layers className="h-4 w-4 mr-2" />
                Material Traceability
              </TabsTrigger>
              <TabsTrigger value="oven-cures" data-testid="tab-oven-cures">
                <Thermometer className="h-4 w-4 mr-2" />
                Oven Cures
              </TabsTrigger>
              <TabsTrigger value="vacuum-tests" data-testid="tab-vacuum-tests">
                <Gauge className="h-4 w-4 mr-2" />
                Vacuum Tests
              </TabsTrigger>
              <TabsTrigger value="inspections" data-testid="tab-inspections">
                <ClipboardCheck className="h-4 w-4 mr-2" />
                Inspections
              </TabsTrigger>
              <TabsTrigger value="signatures" data-testid="tab-signatures">
                <FileSignature className="h-4 w-4 mr-2" />
                Signatures
              </TabsTrigger>
              <TabsTrigger value="history" data-testid="tab-history">
                <History className="h-4 w-4 mr-2" />
                Event Log
              </TabsTrigger>
              <TabsTrigger value="documents" data-testid="tab-documents">
                <FileText className="h-4 w-4 mr-2" />
                Documents
              </TabsTrigger>
            </TabsList>

            <TabsContent value="technicians" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Technician Assignments & Work History</CardTitle>
                  <CardDescription>All technicians who have worked on this item with AS9100 certification tracking</CardDescription>
                </CardHeader>
                <CardContent>
                  {travelerData.workTasks && travelerData.workTasks.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Department</TableHead>
                          <TableHead>Technician</TableHead>
                          <TableHead>Started</TableHead>
                          <TableHead>Completed</TableHead>
                          <TableHead>Duration</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {travelerData.workTasks.map((task: any, index: number) => (
                          <TableRow key={task.id} data-testid={`row-task-${index}`}>
                            <TableCell className="font-medium">{task.department}</TableCell>
                            <TableCell>{task.employeeName}</TableCell>
                            <TableCell>{format(new Date(task.startedAt), 'MMM d, yyyy h:mm a')}</TableCell>
                            <TableCell>
                              {task.completedAt ? format(new Date(task.completedAt), 'MMM d, yyyy h:mm a') : '-'}
                            </TableCell>
                            <TableCell>{task.durationMinutes ? `${task.durationMinutes} min` : '-'}</TableCell>
                            <TableCell>{getDepartmentStatusBadge(task.status)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-center text-gray-500 py-8">No work tasks recorded</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="traceability" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Material Traceability Records</CardTitle>
                  <CardDescription>Batch numbers, lot codes, and material certifications per AS9100 requirements</CardDescription>
                </CardHeader>
                <CardContent>
                  {travelerData.traceabilityData && travelerData.traceabilityData.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Department</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Label</TableHead>
                          <TableHead>Value</TableHead>
                          <TableHead>Part Number</TableHead>
                          <TableHead>Recorded By</TableHead>
                          <TableHead>Recorded At</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {travelerData.traceabilityData.map((trace: any, index: number) => (
                          <TableRow key={trace.id} data-testid={`row-trace-${index}`}>
                            <TableCell className="font-medium">{trace.department}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{trace.traceabilityType}</Badge>
                            </TableCell>
                            <TableCell>{trace.traceabilityLabel}</TableCell>
                            <TableCell className="font-mono">{trace.traceabilityValue}</TableCell>
                            <TableCell>{trace.inventoryPartNumber || '-'}</TableCell>
                            <TableCell>{trace.recordedBy}</TableCell>
                            <TableCell>{format(new Date(trace.createdAt), 'MMM d, yyyy h:mm a')}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-center text-gray-500 py-8">No traceability records found</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="oven-cures" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Oven Cure Logs</CardTitle>
                  <CardDescription>Temperature profiles, cycle times, and cure verification data</CardDescription>
                </CardHeader>
                <CardContent>
                  {travelerData.ovenCureLogs && travelerData.ovenCureLogs.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Department</TableHead>
                          <TableHead>Oven ID</TableHead>
                          <TableHead>Target Temp</TableHead>
                          <TableHead>Actual Temp</TableHead>
                          <TableHead>Duration</TableHead>
                          <TableHead>Start Time</TableHead>
                          <TableHead>End Time</TableHead>
                          <TableHead>Operator</TableHead>
                          <TableHead>Result</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {travelerData.ovenCureLogs.map((log: any, index: number) => (
                          <TableRow key={log.id} data-testid={`row-oven-${index}`}>
                            <TableCell className="font-medium">{log.department}</TableCell>
                            <TableCell>{log.ovenId || '-'}</TableCell>
                            <TableCell>{log.targetTemperature ? `${log.targetTemperature}°F` : '-'}</TableCell>
                            <TableCell>{log.actualTemperature ? `${log.actualTemperature}°F` : '-'}</TableCell>
                            <TableCell>{log.actualDuration ? `${log.actualDuration} min` : '-'}</TableCell>
                            <TableCell>{format(new Date(log.startTime), 'MMM d, yyyy h:mm a')}</TableCell>
                            <TableCell>{log.endTime ? format(new Date(log.endTime), 'MMM d, yyyy h:mm a') : '-'}</TableCell>
                            <TableCell>{log.operatorName || '-'}</TableCell>
                            <TableCell>{getResultBadge(log.result)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-center text-gray-500 py-8">No oven cure logs recorded</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="vacuum-tests" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Vacuum Leak Tests</CardTitle>
                  <CardDescription>Pressure readings, hold times, and leak test results</CardDescription>
                </CardHeader>
                <CardContent>
                  {travelerData.vacuumLeakTests && travelerData.vacuumLeakTests.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Department</TableHead>
                          <TableHead>Test #</TableHead>
                          <TableHead>Initial Pressure</TableHead>
                          <TableHead>Final Pressure</TableHead>
                          <TableHead>Pressure Drop</TableHead>
                          <TableHead>Hold Time</TableHead>
                          <TableHead>Operator</TableHead>
                          <TableHead>Result</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {travelerData.vacuumLeakTests.map((test: any, index: number) => (
                          <TableRow key={test.id} data-testid={`row-vacuum-${index}`}>
                            <TableCell className="font-medium">{test.department}</TableCell>
                            <TableCell>{test.testNumber || index + 1}</TableCell>
                            <TableCell>{test.initialPressure ? `${test.initialPressure} inHg` : '-'}</TableCell>
                            <TableCell>{test.finalPressure ? `${test.finalPressure} inHg` : '-'}</TableCell>
                            <TableCell>
                              {test.pressureDrop !== undefined ? (
                                <span className={test.pressureDrop <= (test.maxAllowableDrop || 1) ? 'text-green-600' : 'text-red-600'}>
                                  {test.pressureDrop} inHg
                                </span>
                              ) : '-'}
                            </TableCell>
                            <TableCell>{test.holdTime ? `${test.holdTime} min` : '-'}</TableCell>
                            <TableCell>{test.operatorName || '-'}</TableCell>
                            <TableCell>{getResultBadge(test.result)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-center text-gray-500 py-8">No vacuum leak tests recorded</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="inspections" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Final Inspection Results</CardTitle>
                  <CardDescription>Tolerance checks, visual inspections, and QC approvals</CardDescription>
                </CardHeader>
                <CardContent>
                  {travelerData.finalInspectionResults && travelerData.finalInspectionResults.length > 0 ? (
                    <div className="space-y-6">
                      {travelerData.finalInspectionResults.map((inspection: any, index: number) => (
                        <div key={inspection.id} className="border rounded-lg p-4" data-testid={`inspection-${index}`}>
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h4 className="font-semibold">{inspection.inspectionType} Inspection</h4>
                              <p className="text-sm text-gray-500">
                                {format(new Date(inspection.inspectionDate), 'MMM d, yyyy h:mm a')}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {getResultBadge(inspection.overallResult)}
                              {inspection.inspectorName && (
                                <span className="text-sm text-gray-500">by {inspection.inspectorName}</span>
                              )}
                            </div>
                          </div>
                          
                          {inspection.toleranceChecks && (
                            <div className="mb-4">
                              <h5 className="font-medium text-sm mb-2">Tolerance Checks</h5>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Dimension</TableHead>
                                    <TableHead>Nominal</TableHead>
                                    <TableHead>Measured</TableHead>
                                    <TableHead>Tolerance</TableHead>
                                    <TableHead>Result</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {(inspection.toleranceChecks as any[]).map((check: any, idx: number) => (
                                    <TableRow key={idx}>
                                      <TableCell>{check.dimension}</TableCell>
                                      <TableCell>{check.nominal}</TableCell>
                                      <TableCell>{check.measured}</TableCell>
                                      <TableCell>±{check.tolerance}</TableCell>
                                      <TableCell>{getResultBadge(check.result)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}

                          {inspection.visualChecks && (
                            <div>
                              <h5 className="font-medium text-sm mb-2">Visual Checks</h5>
                              <div className="grid grid-cols-2 gap-2">
                                {(inspection.visualChecks as any[]).map((check: any, idx: number) => (
                                  <div key={idx} className="flex items-center gap-2">
                                    {check.result === 'PASS' ? (
                                      <CheckCircle className="h-4 w-4 text-green-500" />
                                    ) : (
                                      <XCircle className="h-4 w-4 text-red-500" />
                                    )}
                                    <span className="text-sm">{check.description}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {inspection.qaMgrApproval && (
                            <div className="mt-4 pt-4 border-t">
                              <div className="flex items-center gap-2 text-sm text-green-600">
                                <CheckCircle className="h-4 w-4" />
                                QA Manager Approved: {inspection.qaMgrApproval}
                                {inspection.qaMgrApprovalDate && (
                                  <span className="text-gray-500">
                                    on {format(new Date(inspection.qaMgrApprovalDate), 'MMM d, yyyy')}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-gray-500 py-8">No inspection results recorded</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="signatures" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Electronic Signatures</CardTitle>
                  <CardDescription>All digital signatures captured for AS9100 compliance - Department transfer verifications and work completion confirmations</CardDescription>
                </CardHeader>
                <CardContent>
                  {travelerData.signatures && travelerData.signatures.length > 0 ? (
                    <div className="space-y-4">
                      {travelerData.signatures.map((sig: any, index: number) => (
                        <div key={sig.id || index} className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-900" data-testid={`signature-${index}`}>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <FileSignature className="h-5 w-5 text-blue-600" />
                              <Badge variant={sig.type === 'Department Transfer' ? 'default' : 'outline'}>
                                {sig.type}
                              </Badge>
                              {sig.declarationAccepted && (
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Verified
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-gray-500">
                              {sig.signedAt ? format(new Date(sig.signedAt), 'MMM d, yyyy h:mm a') : 'N/A'}
                            </span>
                          </div>
                          
                          {sig.type === 'Department Transfer' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="text-gray-500">From:</span>
                                  <Badge variant="outline">{sig.fromDepartment}</Badge>
                                  <ArrowRight className="h-4 w-4 text-gray-400" />
                                  <span className="text-gray-500">To:</span>
                                  <Badge variant="default">{sig.toDepartment}</Badge>
                                </div>
                                <div className="text-sm">
                                  <span className="text-gray-500">Signed by:</span>{' '}
                                  <span className="font-medium">{sig.signedBy}</span>
                                  {sig.signedByUsername && (
                                    <span className="text-gray-400 ml-1">(@{sig.signedByUsername})</span>
                                  )}
                                </div>
                                {sig.workInstructionRef && (
                                  <div className="text-sm">
                                    <span className="text-gray-500">Work Instruction:</span>{' '}
                                    <span className="font-mono text-blue-600">{sig.workInstructionRef}</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex justify-end items-start">
                                {sig.signatureData && (
                                  <div className="bg-white dark:bg-gray-800 border rounded p-2">
                                    <img 
                                      src={sig.signatureData} 
                                      alt="Signature" 
                                      className="max-h-20 object-contain"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <div className="space-y-1">
                                <div className="text-sm text-gray-500">
                                  {sig.department || sig.fromDepartment || 'N/A'}
                                </div>
                                <div className="text-sm">
                                  <span className="font-medium">{sig.signedBy}</span>
                                </div>
                              </div>
                              {sig.signatureData && (
                                <div className="bg-white dark:bg-gray-800 border rounded p-2">
                                  <img 
                                    src={sig.signatureData} 
                                    alt="Signature" 
                                    className="max-h-16 object-contain"
                                  />
                                </div>
                              )}
                            </div>
                          )}
                          
                          {sig.notes && (
                            <div className="mt-2 pt-2 border-t text-sm text-gray-600">
                              <span className="font-medium">Notes:</span> {sig.notes}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-gray-500 py-8">No signatures recorded</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Complete Event Log</CardTitle>
                  <CardDescription>Chronological audit trail of all actions</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    {travelerData.events && travelerData.events.length > 0 ? (
                      <div className="space-y-3">
                        {travelerData.events.map((event: any, index: number) => (
                          <div key={event.id} className="flex items-start gap-3 pb-3 border-b last:border-0" data-testid={`event-${index}`}>
                            <div className="flex-shrink-0 mt-1">
                              {event.eventType === 'DEPARTMENT_COMPLETE' ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : event.eventType === 'QC_PASS' ? (
                                <CheckCircle className="h-4 w-4 text-blue-500" />
                              ) : event.eventType === 'QC_FAIL' ? (
                                <XCircle className="h-4 w-4 text-red-500" />
                              ) : (
                                <History className="h-4 w-4 text-gray-400" />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">{event.eventType}</Badge>
                                <span className="text-xs text-gray-500">
                                  {format(new Date(event.createdAt), 'MMM d, yyyy h:mm a')}
                                </span>
                              </div>
                              {event.notes && <p className="text-sm mt-1">{event.notes}</p>}
                              <p className="text-xs text-gray-400 mt-1">by {event.performedBy}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-gray-500 py-8">No events recorded</p>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Documents & Lot Numbers</CardTitle>
                  <CardDescription>Generate packing slips, certificates of conformance, and manage lot assignments</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-semibold">Lot Assignments</h4>
                        <Dialog open={showLotDialog} onOpenChange={setShowLotDialog}>
                          <DialogTrigger asChild>
                            <Button size="sm" data-testid="button-create-lot">
                              <Plus className="h-4 w-4 mr-2" />
                              Create Lot
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Create New Lot</DialogTitle>
                              <DialogDescription>
                                Create a new lot number and add this item to it
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div>
                                <Label>Customer Name</Label>
                                <Input
                                  value={newLotData.customerName || travelerData.purchaseOrder?.customerName || ''}
                                  onChange={(e) => setNewLotData({ ...newLotData, customerName: e.target.value })}
                                  placeholder="Customer name"
                                  data-testid="input-lot-customer"
                                />
                              </div>
                              <div>
                                <Label>PO Number</Label>
                                <Input
                                  value={newLotData.poNumber || travelerData.purchaseOrder?.poNumber || ''}
                                  onChange={(e) => setNewLotData({ ...newLotData, poNumber: e.target.value })}
                                  placeholder="PO number"
                                  data-testid="input-lot-po"
                                />
                              </div>
                              <div>
                                <Label>Created By</Label>
                                <Input
                                  value={newLotData.createdBy}
                                  onChange={(e) => setNewLotData({ ...newLotData, createdBy: e.target.value })}
                                  placeholder="Your name or code"
                                  data-testid="input-lot-created-by"
                                />
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setShowLotDialog(false)}>Cancel</Button>
                              <Button onClick={handleCreateLot} disabled={createLotMutation.isPending} data-testid="button-confirm-create-lot">
                                {createLotMutation.isPending ? 'Creating...' : 'Create Lot'}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>

                      {travelerData.lotNumbers && travelerData.lotNumbers.length > 0 ? (
                        <div className="space-y-3">
                          {travelerData.lotNumbers.map((lot: any) => (
                            <div key={lot.id} className="border rounded-lg p-4" data-testid={`lot-${lot.lotNumber}`}>
                              <div className="flex items-center justify-between">
                                <div>
                                  <h5 className="font-mono font-bold">{lot.lotNumber}</h5>
                                  <p className="text-sm text-gray-500">
                                    {lot.quantity} item(s) | {lot.customerName} | {lot.poNumber}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge className={lot.status === 'OPEN' ? 'bg-yellow-100 text-yellow-800' : lot.status === 'CLOSED' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}>
                                    {lot.status}
                                  </Badge>
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => {
                                      generateDocumentsMutation.mutate({
                                        lotId: lot.id,
                                        options: {
                                          createdBy: 'system',
                                          generatePackingSlip: true,
                                          generateCertificate: true,
                                          generateTestReport: true,
                                        }
                                      });
                                    }}
                                    disabled={generateDocumentsMutation.isPending}
                                    data-testid={`button-generate-docs-${lot.lotNumber}`}
                                  >
                                    <FileText className="h-4 w-4 mr-2" />
                                    Generate Docs
                                  </Button>
                                </div>
                              </div>
                              
                              {(lot.packingSlipId || lot.certificateId) && (
                                <div className="mt-3 pt-3 border-t flex gap-4">
                                  {lot.packingSlipId && (
                                    <a href={`/p2/packing-slip/${lot.packingSlipId}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                                      <Printer className="h-4 w-4" />
                                      Packing Slip
                                    </a>
                                  )}
                                  {lot.certificateId && (
                                    <a href={`/p2/certificate/${lot.certificateId}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                                      <FileText className="h-4 w-4" />
                                      Certificate of Conformance
                                    </a>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-center text-gray-500 py-8">No lot assignments</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {!isLoading && !error && !travelerData && searchedBarcode && (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-8 w-8 mx-auto text-gray-400" />
            <p className="text-gray-500 mt-4">No traveler data found for barcode: {searchedBarcode}</p>
          </CardContent>
        </Card>
      )}

      {!searchedBarcode && (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="h-8 w-8 mx-auto text-gray-400" />
            <p className="text-gray-500 mt-4">Enter a barcode to view traveler data</p>
            <p className="text-sm text-gray-400 mt-2">
              View complete AS9100-compliant production records including technician assignments,
              material traceability, oven cures, vacuum tests, and inspection results.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
