import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  BADGE_ACTION_TYPES,
  ACTION_TYPE_LABELS,
  type BadgeActionType,
} from '@/lib/badgeActionTypes';
import { Scan, User, CheckCircle2, ArrowRight, X, Trash2, Package } from 'lucide-react';
import { Input } from '@/components/ui/input';

type ScanState = 'READY' | 'EMPLOYEE_SCANNED' | 'ORDERS_SCANNED' | 'PROCESSING';

type EmployeeBadgeActionResponse = {
  employee: {
    id: number;
    name: string;
    employeeCode: string;
  };
  action: {
    id: string;
    actionType: string;
    actionConfig: any;
    isActive: boolean;
  } | null;
};

export default function BadgeScanner() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [scanState, setScanState] = useState<ScanState>('READY');
  const [scannedEmployee, setScannedEmployee] = useState<EmployeeBadgeActionResponse | null>(null);
  const [scannedOrderBarcodes, setScannedOrderBarcodes] = useState<string[]>([]);
  const [employeeBarcodeInput, setEmployeeBarcodeInput] = useState('');
  const [orderBarcodeInput, setOrderBarcodeInput] = useState('');

  const handleEmployeeBadgeScan = async (barcode: string) => {
    try {
      const employeeCode = barcode;

      const response = await apiRequest(
        `/api/employee-badges/employee-badge-actions/by-employee/${employeeCode}`
      ) as EmployeeBadgeActionResponse;

      if (!response.action) {
        toast({
          title: 'No Action Configured',
          description: `Employee ${response.employee.name} has no badge action configured. Please contact admin.`,
          variant: 'destructive',
        });
        return;
      }

      setScannedEmployee(response);

      // For actions that don't need a second scan, execute immediately
      if (
        response.action.actionType === BADGE_ACTION_TYPES.CLOCK_IN_OUT ||
        response.action.actionType === BADGE_ACTION_TYPES.QUICK_NAVIGATION
      ) {
        setScanState('PROCESSING');
        await executeImmediateAction(response);
      } else {
        setScanState('EMPLOYEE_SCANNED');
        toast({
          title: 'Employee Identified',
          description: `Welcome, ${response.employee.name}! Ready to scan order.`,
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to identify employee',
        variant: 'destructive',
      });
    }
  };

  const executeImmediateAction = async (employeeData: EmployeeBadgeActionResponse) => {
    try {
      const actionType = employeeData.action?.actionType as BadgeActionType;
      const actionConfig = employeeData.action?.actionConfig;

      // Execute with audit logging via unified endpoint
      const result = await apiRequest('/api/employee-badges/execute-badge-action', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: employeeData.employee.id,
          employeeCode: employeeData.employee.employeeCode,
          actionType,
          actionConfig,
          targetBarcode: null, // No target for immediate actions
        }),
      });

      // Handle client-side navigation if needed
      if (actionType === BADGE_ACTION_TYPES.QUICK_NAVIGATION) {
        const targetPage = actionConfig.targetPage;
        toast({
          title: 'Navigating...',
          description: `Going to ${targetPage}`,
        });
        setTimeout(() => {
          setLocation(targetPage);
        }, 500);
      } else {
        toast({
          title: 'Success!',
          description: result.message || 'Action completed successfully',
        });
      }

      resetScanner();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to execute action',
        variant: 'destructive',
      });
      setScanState('READY');
    }
  };

  const handleOrderScan = async (barcode: string) => {
    if (!scannedEmployee || !scannedEmployee.action) return;

    // Check for duplicates
    if (scannedOrderBarcodes.includes(barcode)) {
      toast({
        title: 'Duplicate Scan',
        description: `Order ${barcode} is already in the list`,
        variant: 'destructive',
      });
      return;
    }

    setScannedOrderBarcodes([...scannedOrderBarcodes, barcode]);
    setScanState('ORDERS_SCANNED');

    toast({
      title: 'Order Added',
      description: `Order ${barcode} added. Total: ${scannedOrderBarcodes.length + 1}`,
    });
  };

  const removeOrder = (barcode: string) => {
    setScannedOrderBarcodes(scannedOrderBarcodes.filter(b => b !== barcode));
    if (scannedOrderBarcodes.length === 1) {
      setScanState('EMPLOYEE_SCANNED');
    }
  };

  const executeActionMutation = useMutation({
    mutationFn: async () => {
      if (!scannedEmployee || !scannedEmployee.action || scannedOrderBarcodes.length === 0) return;

      const actionType = scannedEmployee.action.actionType as BadgeActionType;
      const actionConfig = scannedEmployee.action.actionConfig;

      // Execute actions for all scanned barcodes
      const results = [];
      for (const barcode of scannedOrderBarcodes) {
        try {
          const result = await apiRequest('/api/employee-badges/execute-badge-action', {
            method: 'POST',
            body: JSON.stringify({
              employeeId: scannedEmployee.employee.id,
              employeeCode: scannedEmployee.employee.employeeCode,
              actionType,
              actionConfig,
              targetBarcode: barcode,
            }),
          });
          results.push({ barcode, success: true, result });
        } catch (error: any) {
          results.push({ barcode, success: false, error: error.message });
        }
      }

      return results;
    },
    onSuccess: (results: any) => {
      const successCount = results.filter((r: any) => r.success).length;
      const failureCount = results.filter((r: any) => !r.success).length;

      if (failureCount === 0) {
        toast({
          title: 'All Actions Completed!',
          description: `Successfully processed ${successCount} order(s)`,
        });
      } else {
        toast({
          title: 'Batch Completed with Errors',
          description: `Success: ${successCount}, Failed: ${failureCount}`,
          variant: 'destructive',
        });
      }
      resetScanner();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to execute actions',
        variant: 'destructive',
      });
      setScanState('ORDERS_SCANNED');
    },
  });

  const resetScanner = () => {
    setScanState('READY');
    setScannedEmployee(null);
    setScannedOrderBarcodes([]);
    setEmployeeBarcodeInput('');
    setOrderBarcodeInput('');
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Scan className="h-8 w-8" />
          <h1 className="text-3xl font-bold">Badge Scanner</h1>
        </div>
        {scanState !== 'READY' && (
          <Button variant="outline" onClick={resetScanner} data-testid="button-reset">
            <X className="h-4 w-4 mr-2" />
            Reset
          </Button>
        )}
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Scan Status</span>
            {scanState === 'EMPLOYEE_SCANNED' && <Badge variant="default">Employee Scanned</Badge>}
            {scanState === 'ORDERS_SCANNED' && (
              <Badge variant="default">
                {scannedOrderBarcodes.length} Order{scannedOrderBarcodes.length !== 1 ? 's' : ''} Ready
              </Badge>
            )}
            {scanState === 'PROCESSING' && <Badge variant="secondary">Processing...</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1: Employee Badge */}
          <div className="flex items-start gap-4">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full ${
                scanState !== 'READY' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
              }`}
            >
              {scanState !== 'READY' ? <CheckCircle2 className="h-5 w-5" /> : <span>1</span>}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Scan Employee Badge</h3>
              {scannedEmployee ? (
                <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-md">
                  <p className="font-medium flex items-center gap-2">
                    <User className="h-4 w-4" />
                    {scannedEmployee.employee.name}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Action: {ACTION_TYPE_LABELS[scannedEmployee.action?.actionType as BadgeActionType]}
                  </p>
                  {scannedEmployee.action?.actionType === BADGE_ACTION_TYPES.P1_DEPARTMENT_PROGRESS && (
                    <p className="text-sm text-muted-foreground">
                      {scannedEmployee.action.actionConfig.fromDepartment}
                      <ArrowRight className="inline h-3 w-3 mx-1" />
                      {scannedEmployee.action.actionConfig.toDepartment}
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-2">
                  <Input
                    type="password"
                    value={employeeBarcodeInput}
                    onChange={(e) => setEmployeeBarcodeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && employeeBarcodeInput.trim()) {
                        handleEmployeeBadgeScan(employeeBarcodeInput.trim());
                        setEmployeeBarcodeInput('');
                      }
                    }}
                    placeholder="Scan badge..."
                    disabled={scanState !== 'READY'}
                    autoFocus
                    data-testid="input-employee-barcode"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Order/Item Barcode */}
          {scannedEmployee && (
            <div className="flex items-start gap-4">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  scanState === 'ORDERS_SCANNED' || scanState === 'PROCESSING'
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}
              >
                {scanState === 'ORDERS_SCANNED' || scanState === 'PROCESSING' ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <span>2</span>
                )}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">
                  {scannedEmployee.action?.actionType === BADGE_ACTION_TYPES.P1_DEPARTMENT_PROGRESS
                    ? 'Scan Order Barcodes'
                    : scannedEmployee.action?.actionType === BADGE_ACTION_TYPES.P2_DEPARTMENT_PROGRESS
                    ? 'Scan P2 Item Barcodes'
                    : 'Scan Items'}
                </h3>
                <div className="mt-2 space-y-2">
                  <Input
                    type="text"
                    value={orderBarcodeInput}
                    onChange={(e) => setOrderBarcodeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && orderBarcodeInput.trim()) {
                        handleOrderScan(orderBarcodeInput.trim());
                        setOrderBarcodeInput('');
                      }
                    }}
                    placeholder="Scan or type barcode (press Enter to add)..."
                    disabled={scanState === 'PROCESSING'}
                    autoFocus={scanState === 'EMPLOYEE_SCANNED' || scanState === 'ORDERS_SCANNED'}
                    data-testid="input-order-barcode"
                  />

                  {/* Scanned Orders List */}
                  {scannedOrderBarcodes.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-sm font-medium flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Scanned Orders ({scannedOrderBarcodes.length})
                      </p>
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {scannedOrderBarcodes.map((barcode, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded-md"
                          >
                            <span className="font-medium">{barcode}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeOrder(barcode)}
                              disabled={scanState === 'PROCESSING'}
                              data-testid={`button-remove-${barcode}`}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Execute Button */}
          {scanState === 'ORDERS_SCANNED' && scannedOrderBarcodes.length > 0 && (
            <div className="pt-4 space-y-2">
              <Button
                className="w-full"
                size="lg"
                onClick={() => {
                  setScanState('PROCESSING');
                  executeActionMutation.mutate();
                }}
                disabled={executeActionMutation.isPending}
                data-testid="button-execute-action"
              >
                {executeActionMutation.isPending
                  ? `Processing ${scannedOrderBarcodes.length} order(s)...`
                  : `Process ${scannedOrderBarcodes.length} Order${scannedOrderBarcodes.length !== 1 ? 's' : ''}`}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                You can scan more orders before processing
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>1. Scan your employee badge to identify yourself and load your configured action</p>
          <p>2. Scan multiple order or item barcodes (press Enter after each scan)</p>
          <p>3. Click "Process Orders" to perform the configured action on all scanned items</p>
          <p className="pt-2 text-muted-foreground">
            <strong>Batch Processing:</strong> You can scan multiple orders at once for faster
            workflows. Remove any mistakes before processing.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
