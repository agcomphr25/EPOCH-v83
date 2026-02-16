import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Scan,
  User,
  Package,
  CheckCircle,
  XCircle,
  Clock,
  Play,
  ArrowRight,
  AlertCircle,
  Clipboard,
  QrCode,
  FileText,
  Camera,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CameraScanner } from '@/components/CameraScanner';
import { useLocation } from 'wouter';

type ScanState = 'READY' | 'BADGE_SCANNED' | 'PART_SCANNED' | 'TASK_ACTIVE';

interface Employee {
  id: number;
  employeeCode: string;
  name: string;
}

interface SerializedItem {
  id: string;
  barcode: string;
  serialNumber: string;
  partNumber: string;
  partName: string;
  customerName: string;
  currentDepartment: string;
  currentStageIndex: number;
  status: string;
}

interface TraceabilityRequirement {
  type: string;
  label: string;
}

interface MaterialRequirement {
  partId: string;
  partNumber: string;
  partName: string;
  requiredFields: string[];
}

interface QCStandard {
  standard: string;
  tolerance: string;
  requirement: string;
}

interface DepartmentConfig {
  materials?: MaterialRequirement[];
  customDataFields?: Array<{
    fieldName: string;
    fieldType: 'text' | 'number' | 'date' | 'textarea';
    isRequired: boolean;
  }>;
  qcStandards?: QCStandard[];
  allowMultipleTasks?: boolean;
}

interface VerificationData {
  employee: Employee;
  serializedItem: SerializedItem;
  nextDepartment: string;
  isCertified: boolean;
  departmentConfig: DepartmentConfig;
  traceabilityRequirements: TraceabilityRequirement[];
  routing: {
    id: string;
    departmentSequence: string[];
    currentStageIndex: number;
  };
}

interface ActiveTask {
  id: string;
  barcode: string;
  partNumber: string;
  partName: string;
  department: string;
  startedAt: string;
}

export default function P2TravelerPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [scanState, setScanState] = useState<ScanState>('READY');
  const [badgeInput, setBadgeInput] = useState('');
  const [partInput, setPartInput] = useState('');
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [verificationData, setVerificationData] = useState<VerificationData | null>(null);
  const [activeTask, setActiveTask] = useState<ActiveTask | null>(null);
  
  // Traceability and custom data states
  const [traceabilityData, setTraceabilityData] = useState<Array<{
    inventoryPartId?: string;
    inventoryPartNumber?: string;
    type: string;
    label: string;
    value: string;
  }>>([]);
  const [customData, setCustomData] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [traceabilityMode, setTraceabilityMode] = useState<'scan' | 'manual'>('scan');
  const [cameraTarget, setCameraTarget] = useState<'badge' | 'part' | null>(null);

  // Get active tasks for current employee
  const { data: activeTasks } = useQuery<ActiveTask[]>({
    queryKey: ['/api/p2-traveler/active-tasks', employee?.id],
    enabled: !!employee?.id,
  });

  // Reset handler
  const resetScanner = () => {
    setScanState('READY');
    setBadgeInput('');
    setPartInput('');
    setEmployee(null);
    setVerificationData(null);
    setActiveTask(null);
    setTraceabilityData([]);
    setCustomData({});
    setNotes('');
    setTraceabilityMode('scan');
  };

  // Handle badge scan
  const handleBadgeScan = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!badgeInput.trim()) {
      toast({
        title: 'Error',
        description: 'Please scan or enter employee badge code',
        variant: 'destructive',
      });
      return;
    }

    try {
      const data = await apiRequest(`/api/p2-traveler/badge-lookup/${badgeInput.trim()}`) as Employee;
      setEmployee(data);
      setScanState('BADGE_SCANNED');
      toast({
        title: 'Badge Scanned',
        description: `Welcome, ${data.name}. Now scan the part barcode.`,
      });
    } catch (error: any) {
      toast({
        title: 'Badge Not Found',
        description: error.message || 'No employee found with that badge code',
        variant: 'destructive',
      });
    }
  };

  // Handle part scan
  const handlePartScan = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!partInput.trim()) {
      toast({
        title: 'Error',
        description: 'Please scan or enter part barcode',
        variant: 'destructive',
      });
      return;
    }

    try {
      const data = await apiRequest(
        `/api/p2-traveler/verify-certification/${badgeInput}/${partInput}`
      ) as VerificationData;

      setEmployee(data.employee);
      setVerificationData(data);

      if (!data.isCertified) {
        toast({
          title: 'Not Certified',
          description: `${data.employee.name} is not certified for ${data.nextDepartment}`,
          variant: 'destructive',
        });
        return;
      }

      // Initialize traceability fields based on requirements
      const initialTraceability: any[] = [];
      const materialFieldTypes = new Set<string>();
      
      // Add material requirements
      if (data.departmentConfig.materials) {
        data.departmentConfig.materials.forEach((material: MaterialRequirement) => {
          material.requiredFields.forEach((fieldType: string) => {
            materialFieldTypes.add(fieldType);
            initialTraceability.push({
              inventoryPartId: material.partId,
              inventoryPartNumber: material.partNumber,
              type: fieldType,
              label: `${material.partName} - ${fieldType.replace(/_/g, ' ').toUpperCase()}`,
              value: '',
            });
          });
        });
      }

      // Add general traceability requirements (skip any already covered by materials)
      if (data.traceabilityRequirements) {
        data.traceabilityRequirements.forEach((req: any) => {
          if (typeof req === 'string' && !materialFieldTypes.has(req)) {
            initialTraceability.push({
              type: req,
              label: req.replace(/_/g, ' ').toUpperCase(),
              value: '',
            });
          }
        });
      }

      setTraceabilityData(initialTraceability);

      // Initialize custom data fields
      if (data.departmentConfig.customDataFields) {
        const initialCustomData: Record<string, string> = {};
        data.departmentConfig.customDataFields.forEach((field: { fieldName: string; fieldType: string; isRequired: boolean }) => {
          initialCustomData[field.fieldName] = '';
        });
        setCustomData(initialCustomData);
      }

      setScanState('PART_SCANNED');
      toast({
        title: 'Part Verified',
        description: `Opening full traveler for ${data.serializedItem.partName}`,
      });

      setLocation(`/p2-traveler-viewer?barcode=${encodeURIComponent(partInput.trim())}`);
    } catch (error: any) {
      toast({
        title: 'Verification Failed',
        description: error.message || 'Failed to verify part',
        variant: 'destructive',
      });
    }
  };

  // Start task mutation
  const startTaskMutation = useMutation({
    mutationFn: async () => {
      if (!verificationData) throw new Error('No verification data');

      // Validate required traceability data
      const missingFields = traceabilityData.filter(item => !item.value.trim());
      if (missingFields.length > 0) {
        throw new Error('Please fill in all traceability fields');
      }

      // Validate required custom data
      if (verificationData.departmentConfig.customDataFields) {
        const missingCustom = verificationData.departmentConfig.customDataFields.filter(
          field => field.isRequired && !customData[field.fieldName]?.trim()
        );
        if (missingCustom.length > 0) {
          throw new Error(`Please fill in required fields: ${missingCustom.map(f => f.fieldName).join(', ')}`);
        }
      }

      const item = verificationData.serializedItem;
      if (!item) throw new Error('No part data available. Please scan the part again.');

      const response = await apiRequest('/api/p2-traveler/start-task', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: verificationData.employee.id,
          employeeCode: verificationData.employee.employeeCode,
          employeeName: verificationData.employee.name,
          barcode: item.barcode,
          serializedItemId: item.id,
          department: verificationData.nextDepartment,
          partNumber: item.partNumber,
          partName: item.partName || item.partNumber || 'Unknown',
          traceabilityData,
          customData: Object.keys(customData).length > 0 ? customData : null,
          notes,
        }),
      }) as any;

      return response.workTask || response;
    },
    onSuccess: (workTask) => {
      setActiveTask(workTask);
      setScanState('TASK_ACTIVE');
      queryClient.invalidateQueries({ queryKey: ['/api/p2-traveler/active-tasks', employee?.id] });
      toast({
        title: 'Task Started',
        description: `Working on ${workTask.partName} in ${workTask.department}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to Start Task',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Complete task mutation
  const completeTaskMutation = useMutation({
    mutationFn: async () => {
      if (!activeTask) throw new Error('No active task');

      // Re-verify badge and part
      if (!badgeInput.trim() || !partInput.trim()) {
        throw new Error('Please scan badge and part to complete task');
      }

      const response = await apiRequest('/api/p2-traveler/complete-task', {
        method: 'POST',
        body: JSON.stringify({
          taskId: activeTask.id,
          employeeCode: badgeInput,
          barcode: partInput,
          notes,
        }),
      });

      return response;
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Task Completed',
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/p2-traveler/active-tasks', employee?.id] });
      resetScanner();
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to Complete Task',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Handle traceability data update
  const updateTraceabilityField = (index: number, value: string) => {
    const updated = [...traceabilityData];
    updated[index].value = value;
    setTraceabilityData(updated);
  };

  // Handle custom data update
  const updateCustomField = (fieldName: string, value: string) => {
    setCustomData(prev => ({ ...prev, [fieldName]: value }));
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clipboard className="h-6 w-6" />
            P2 Production Traveler
          </CardTitle>
          <CardDescription>
            Scan badge and part to track production tasks with full AS9100 traceability
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* State Indicator */}
          <div className="flex gap-2 items-center justify-center">
            <Badge variant={scanState === 'READY' ? 'default' : 'secondary'} data-testid="badge-state-ready">
              <User className="h-3 w-3 mr-1" />
              Badge
            </Badge>
            <ArrowRight className="h-4 w-4" />
            <Badge variant={scanState === 'BADGE_SCANNED' ? 'default' : scanState === 'PART_SCANNED' || scanState === 'TASK_ACTIVE' ? 'secondary' : 'outline'} data-testid="badge-state-part">
              <Package className="h-3 w-3 mr-1" />
              Part
            </Badge>
            <ArrowRight className="h-4 w-4" />
            <Badge variant={scanState === 'PART_SCANNED' ? 'default' : scanState === 'TASK_ACTIVE' ? 'secondary' : 'outline'} data-testid="badge-state-task">
              <Clipboard className="h-3 w-3 mr-1" />
              Task
            </Badge>
            <ArrowRight className="h-4 w-4" />
            <Badge variant={scanState === 'TASK_ACTIVE' ? 'default' : 'outline'} data-testid="badge-state-active">
              <Clock className="h-3 w-3 mr-1" />
              Active
            </Badge>
          </div>

          <Separator />

          {/* Step 1: Badge Scan */}
          {scanState === 'READY' && (
            <form onSubmit={handleBadgeScan} className="space-y-4" data-testid="form-badge-scan">
              <div className="space-y-2">
                <Label htmlFor="badge-input" className="flex items-center gap-2">
                  <Scan className="h-4 w-4" />
                  Scan Employee Badge
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="badge-input"
                    type="text"
                    value={badgeInput}
                    onChange={(e) => setBadgeInput(e.target.value)}
                    placeholder="Scan or enter badge code..."
                    autoFocus
                    className="flex-1"
                    data-testid="input-badge-code"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setCameraTarget('badge')}
                    title="Use camera to scan"
                  >
                    <Camera className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Button type="submit" className="w-full" data-testid="button-submit-badge">
                <Scan className="h-4 w-4 mr-2" />
                Continue
              </Button>
            </form>
          )}

          {/* Step 2: Part Scan */}
          {scanState === 'BADGE_SCANNED' && (
            <div className="space-y-4">
              <Alert>
                <User className="h-4 w-4" />
                <AlertDescription>
                  Employee: <strong>{employee?.name || badgeInput}</strong>
                  {employee?.name && <span className="text-muted-foreground ml-2">({badgeInput})</span>}
                </AlertDescription>
              </Alert>

              <form onSubmit={handlePartScan} className="space-y-4" data-testid="form-part-scan">
                <div className="space-y-2">
                  <Label htmlFor="part-input" className="flex items-center gap-2">
                    <Scan className="h-4 w-4" />
                    Scan Part Barcode
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="part-input"
                      type="text"
                      value={partInput}
                      onChange={(e) => setPartInput(e.target.value)}
                      placeholder="Scan or enter part barcode..."
                      autoFocus
                      className="flex-1"
                      data-testid="input-part-barcode"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setCameraTarget('part')}
                      title="Use camera to scan"
                    >
                      <Camera className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={resetScanner} className="flex-1" data-testid="button-cancel">
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1" data-testid="button-submit-part">
                    <Scan className="h-4 w-4 mr-2" />
                    Verify Part
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* Step 3: Traceability Entry & Task Start */}
          {scanState === 'PART_SCANNED' && verificationData && (
            <div className="space-y-4">
              {/* Part Info */}
              <Alert>
                <Package className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <div><strong>Part:</strong> {verificationData.serializedItem.partName} ({verificationData.serializedItem.partNumber})</div>
                    <div><strong>Serial:</strong> {verificationData.serializedItem.serialNumber}</div>
                    <div><strong>Customer:</strong> {verificationData.serializedItem.customerName}</div>
                    <div><strong>Department:</strong> {verificationData.nextDepartment}</div>
                  </div>
                </AlertDescription>
              </Alert>

              {/* Certification Status */}
              <Alert variant={verificationData.isCertified ? 'default' : 'destructive'}>
                {verificationData.isCertified ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <AlertDescription>
                  {verificationData.isCertified ? (
                    `${verificationData.employee.name} is certified for ${verificationData.nextDepartment}`
                  ) : (
                    `${verificationData.employee.name} is NOT certified for ${verificationData.nextDepartment}`
                  )}
                </AlertDescription>
              </Alert>

              {verificationData.isCertified && (
                <>
                  {/* Material Traceability Section */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold">Material Traceability</Label>
                      <Tabs value={traceabilityMode} onValueChange={(v) => setTraceabilityMode(v as 'scan' | 'manual')}>
                        <TabsList className="h-8">
                          <TabsTrigger value="scan" className="text-xs px-3 gap-1" data-testid="tab-scan-mode">
                            <QrCode className="h-3 w-3" />
                            Scan Barcode
                          </TabsTrigger>
                          <TabsTrigger value="manual" className="text-xs px-3 gap-1" data-testid="tab-manual-mode">
                            <FileText className="h-3 w-3" />
                            Control Number
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>

                    {traceabilityMode === 'scan' ? (
                      <div className="space-y-3">
                        <Alert>
                          <QrCode className="h-4 w-4" />
                          <AlertDescription>
                            Scan material packet barcode to capture lot/batch traceability data
                          </AlertDescription>
                        </Alert>
                        {traceabilityData.map((item, index) => (
                          <div key={index} className="space-y-2">
                            <Label htmlFor={`trace-${index}`}>{item.label}</Label>
                            <Input
                              id={`trace-${index}`}
                              type="text"
                              value={item.value}
                              onChange={(e) => updateTraceabilityField(index, e.target.value)}
                              placeholder={`Scan barcode for ${item.label}...`}
                              autoFocus={index === 0}
                              data-testid={`input-trace-${index}`}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <Alert>
                          <FileText className="h-4 w-4" />
                          <AlertDescription>
                            Enter internal control number to link traceability records
                          </AlertDescription>
                        </Alert>
                        {traceabilityData.map((item, index) => (
                          <div key={index} className="space-y-2">
                            <Label htmlFor={`trace-manual-${index}`}>{item.label} - Control Number</Label>
                            <Input
                              id={`trace-manual-${index}`}
                              type="text"
                              value={item.value}
                              onChange={(e) => updateTraceabilityField(index, e.target.value)}
                              placeholder="Enter internal control number..."
                              autoFocus={index === 0}
                              data-testid={`input-trace-manual-${index}`}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Custom Data Fields */}
                  {verificationData.departmentConfig.customDataFields && verificationData.departmentConfig.customDataFields.length > 0 && (
                    <div className="space-y-3">
                      <Label className="text-base font-semibold">Department-Specific Data</Label>
                      {verificationData.departmentConfig.customDataFields.map((field, index) => (
                        <div key={index} className="space-y-2">
                          <Label htmlFor={`custom-${field.fieldName}`}>
                            {field.fieldName}
                            {field.isRequired && <span className="text-red-500 ml-1">*</span>}
                          </Label>
                          {field.fieldType === 'textarea' ? (
                            <Textarea
                              id={`custom-${field.fieldName}`}
                              value={customData[field.fieldName] || ''}
                              onChange={(e) => updateCustomField(field.fieldName, e.target.value)}
                              placeholder={`Enter ${field.fieldName}...`}
                              data-testid={`input-custom-${field.fieldName}`}
                            />
                          ) : (
                            <Input
                              id={`custom-${field.fieldName}`}
                              type={field.fieldType}
                              value={customData[field.fieldName] || ''}
                              onChange={(e) => updateCustomField(field.fieldName, e.target.value)}
                              placeholder={`Enter ${field.fieldName}...`}
                              data-testid={`input-custom-${field.fieldName}`}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* QC Standards / Tolerance Requirements */}
                  {verificationData.departmentConfig.qcStandards && verificationData.departmentConfig.qcStandards.length > 0 && (
                    <div className="space-y-3">
                      <Label className="text-base font-semibold">QC Standards & Tolerances</Label>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium">Standard</th>
                              <th className="text-left px-3 py-2 font-medium">Tolerance</th>
                              <th className="text-left px-3 py-2 font-medium">Requirement</th>
                            </tr>
                          </thead>
                          <tbody>
                            {verificationData.departmentConfig.qcStandards.map((qc, index) => (
                              <tr key={index} className={index % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                                <td className="px-3 py-2 font-mono font-medium">{qc.standard}</td>
                                <td className="px-3 py-2 font-mono">{qc.tolerance}</td>
                                <td className="px-3 py-2">{qc.requirement}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes (Optional)</Label>
                    <Textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Enter any notes about this task..."
                      data-testid="input-notes"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={resetScanner} className="flex-1" data-testid="button-cancel-task">
                      Cancel
                    </Button>
                    <Button
                      onClick={() => startTaskMutation.mutate()}
                      disabled={startTaskMutation.isPending}
                      className="flex-1"
                      data-testid="button-start-task"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      {startTaskMutation.isPending ? 'Starting...' : 'Start Task'}
                    </Button>
                  </div>
                </>
              )}

              {!verificationData.isCertified && (
                <Button variant="outline" onClick={resetScanner} className="w-full" data-testid="button-reset">
                  Start Over
                </Button>
              )}
            </div>
          )}

          {/* Step 4: Active Task - Complete */}
          {scanState === 'TASK_ACTIVE' && activeTask && (
            <div className="space-y-4">
              <Alert>
                <Clock className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <div><strong>Active Task:</strong> {activeTask.partName}</div>
                    <div><strong>Department:</strong> {activeTask.department}</div>
                    <div><strong>Started:</strong> {new Date(activeTask.startedAt).toLocaleString()}</div>
                  </div>
                </AlertDescription>
              </Alert>

              <Alert variant="default">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  To complete this task, rescan your badge and the part barcode
                </AlertDescription>
              </Alert>

              <form onSubmit={(e) => {
                e.preventDefault();
                completeTaskMutation.mutate();
              }} className="space-y-4" data-testid="form-complete-task">
                <div className="space-y-2">
                  <Label htmlFor="complete-badge">Scan Employee Badge</Label>
                  <Input
                    id="complete-badge"
                    type="text"
                    value={badgeInput}
                    onChange={(e) => setBadgeInput(e.target.value)}
                    placeholder="Scan badge to verify..."
                    autoFocus
                    data-testid="input-complete-badge"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="complete-part">Scan Part Barcode</Label>
                  <Input
                    id="complete-part"
                    type="text"
                    value={partInput}
                    onChange={(e) => setPartInput(e.target.value)}
                    placeholder="Scan part to verify..."
                    data-testid="input-complete-part"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="complete-notes">Completion Notes (Optional)</Label>
                  <Textarea
                    id="complete-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Enter any completion notes..."
                    data-testid="input-complete-notes"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={completeTaskMutation.isPending || !badgeInput.trim() || !partInput.trim()}
                  className="w-full"
                  data-testid="button-complete-task"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {completeTaskMutation.isPending ? 'Completing...' : 'Complete Task'}
                </Button>
              </form>
            </div>
          )}

          {/* Active Tasks Overview */}
          {activeTasks && activeTasks.length > 0 && scanState === 'READY' && (
            <div className="mt-6">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <strong>You have {activeTasks.length} active task(s)</strong>
                    {activeTasks.map((task) => (
                      <div key={task.id} className="text-sm">
                        • {task.partName} in {task.department}
                      </div>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            </div>
          )}
        </CardContent>
      </Card>

      <CameraScanner
        isOpen={cameraTarget !== null}
        onClose={() => setCameraTarget(null)}
        onBarcodeDetected={(barcode) => {
          if (cameraTarget === 'badge') {
            setBadgeInput(barcode);
          } else if (cameraTarget === 'part') {
            setPartInput(barcode);
          }
          setCameraTarget(null);
        }}
      />
    </div>
  );
}
