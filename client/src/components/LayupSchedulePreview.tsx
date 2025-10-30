import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Calendar, CheckCircle2, XCircle, AlertTriangle, Package, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

interface ScheduledItem {
  orderId: string;
  fbOrderNumber: string;
  stockModel: string;
  customerName: string;
  scheduledDate: string;
  moldId: string;
  dayOfWeek: number;
  dayName: string;
  actionLength?: string | null;
  material?: string | null;
  hasLOP?: boolean;
  hasADL?: boolean;
  hasHeavyFill?: boolean;
}

interface OverflowItem {
  orderId: string;
  fbOrderNumber: string;
  stockModel: string;
  customerName: string;
  reason: string;
}

interface LayupSchedulePreviewProps {
  open: boolean;
  onClose: () => void;
  scheduledItems: ScheduledItem[];
  overflowItems: OverflowItem[];
  weekStart: string;
  totalItems: number;
  onApprove: () => void;
  isApproving: boolean;
}

export function LayupSchedulePreview({
  open,
  onClose,
  scheduledItems,
  overflowItems,
  weekStart,
  totalItems,
  onApprove,
  isApproving,
}: LayupSchedulePreviewProps) {
  const barcodeRef = useRef<SVGSVGElement>(null);
  const printContentRef = useRef<HTMLDivElement>(null);
  
  // Generate barcode ID from week start date
  const scheduleBarcode = weekStart ? `LAYUP${format(new Date(weekStart), 'yyyyMMdd')}` : '';
  
  // Group scheduled items by day
  const itemsByDay = scheduledItems.reduce((acc, item) => {
    const day = item.dayOfWeek;
    if (!acc[day]) {
      acc[day] = [];
    }
    acc[day].push(item);
    return acc;
  }, {} as Record<number, ScheduledItem[]>);

  const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const scheduledDays = [1, 2, 3, 4, 5].filter(day => itemsByDay[day]?.length > 0);

  const hasOverflow = overflowItems.length > 0;

  // Generate barcode when component opens or week changes
  useEffect(() => {
    if (barcodeRef.current && scheduleBarcode && open) {
      try {
        JsBarcode(barcodeRef.current, scheduleBarcode, {
          format: 'CODE39',
          width: 2,
          height: 60,
          displayValue: true,
          fontSize: 14,
          textAlign: 'center',
          textPosition: 'bottom',
          margin: 10,
          background: '#ffffff',
          lineColor: '#000000',
        });
      } catch (error) {
        console.error('Error generating schedule barcode:', error);
      }
    }
  }, [scheduleBarcode, open]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto" id="layup-schedule-content">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="w-6 h-6" />
                Layup Schedule
              </DialogTitle>
              <p className="text-sm text-gray-500 mt-1">
                Week starting {weekStart ? format(new Date(weekStart), 'MMM dd, yyyy') : ''}
              </p>
            </div>
            {/* Schedule Barcode */}
            <div className="flex flex-col items-center border rounded-lg p-3 bg-white">
              <p className="text-xs text-gray-600 mb-1 font-semibold">Scan to Complete Layup</p>
              <svg ref={barcodeRef} className="w-48"></svg>
            </div>
          </div>
        </DialogHeader>

        {/* Summary Statistics */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">Total Items</span>
            </div>
            <div className="text-2xl font-bold text-blue-700">{totalItems}</div>
          </div>

          <div className="bg-green-50 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-gray-700">Scheduled</span>
            </div>
            <div className="text-2xl font-bold text-green-700">{scheduledItems.length}</div>
          </div>

          <div className={hasOverflow ? 'bg-yellow-50 p-4 rounded-lg' : 'bg-gray-50 p-4 rounded-lg'}>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className={`w-5 h-5 ${hasOverflow ? 'text-yellow-600' : 'text-gray-400'}`} />
              <span className="text-sm font-medium text-gray-700">Overflow</span>
            </div>
            <div className={`text-2xl font-bold ${hasOverflow ? 'text-yellow-700' : 'text-gray-400'}`}>
              {overflowItems.length}
            </div>
          </div>
        </div>

        {/* Scheduled Items by Day */}
        <div className="space-y-6" ref={printContentRef}>
          <h3 className="text-lg font-semibold">Scheduled Items</h3>
          
          {scheduledDays.map(day => (
            <div key={day} className="border rounded-lg p-4 layup-day-section">
              <div className="flex items-center gap-2 mb-3 layup-day-header">
                <Badge variant={day === 5 ? 'secondary' : 'default'} className="text-sm">
                  {dayNames[day]}
                </Badge>
                <span className="text-sm text-gray-500">
                  ({itemsByDay[day]?.length || 0} items)
                </span>
                {day === 5 && (
                  <Badge variant="outline" className="text-yellow-600 border-yellow-600 no-print">
                    Overflow Day
                  </Badge>
                )}
              </div>

              {/* Desktop/Preview Table View */}
              <div className="desktop-only">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Stock Model</TableHead>
                      <TableHead>Mold</TableHead>
                      <TableHead>Action Length</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead>Badges</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemsByDay[day]?.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-sm">{item.orderId}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.stockModel}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">{item.moldId}</TableCell>
                        <TableCell className="text-sm">
                          {item.actionLength ? `${item.actionLength}"` : '-'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {item.material || '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {item.hasLOP && (
                              <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">
                                LOP
                              </Badge>
                            )}
                            {item.hasADL && (
                              <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs">
                                ADL
                              </Badge>
                            )}
                            {item.hasHeavyFill && (
                              <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-xs">
                                Heavy Fill
                              </Badge>
                            )}
                            {!item.hasLOP && !item.hasADL && !item.hasHeavyFill && (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Print-Only Checklist View */}
              <div className="print-only">
                {itemsByDay[day]?.map((item, idx) => (
                  <div key={idx} className="layup-order-item">
                    <div className="layup-checkbox"></div>
                    
                    <div className="layup-order-details">
                      <div>
                        <div className="layup-field-label">Order ID</div>
                        <div className="layup-field-value">{item.orderId}</div>
                      </div>
                      <div>
                        <div className="layup-field-label">Stock Model</div>
                        <div className="layup-field-value">{item.stockModel}</div>
                      </div>
                      <div>
                        <div className="layup-field-label">Mold</div>
                        <div className="layup-field-value">{item.moldId}</div>
                      </div>
                      <div>
                        <div className="layup-field-label">Action / Material</div>
                        <div className="layup-field-value">
                          {item.actionLength || '-'} / {item.material || '-'}
                        </div>
                      </div>
                    </div>
                    
                    {(item.hasLOP || item.hasADL || item.hasHeavyFill) && (
                      <div className="layup-badges">
                        {item.hasLOP && <span className="layup-badge layup-badge-lop">LOP</span>}
                        {item.hasADL && <span className="layup-badge layup-badge-adl">ADL</span>}
                        {item.hasHeavyFill && <span className="layup-badge layup-badge-heavy">HEAVY</span>}
                      </div>
                    )}
                  </div>
                ))}
                
                {/* Signature Line */}
                <div className="layup-signature">
                  <div className="layup-signature-field">
                    <div className="layup-signature-label">Completed by:</div>
                    <div className="layup-signature-line"></div>
                  </div>
                  <div className="layup-signature-field layup-signature-date">
                    <div className="layup-signature-label">Date:</div>
                    <div className="layup-signature-line"></div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Overflow Items */}
        {hasOverflow && (
          <div className="mt-6 border border-yellow-300 rounded-lg p-4 bg-yellow-50 no-print">
            <div className="flex items-center gap-2 mb-3">
              <XCircle className="w-5 h-5 text-yellow-600" />
              <h3 className="text-lg font-semibold text-yellow-900">
                Items That Could Not Be Scheduled ({overflowItems.length})
              </h3>
            </div>

            <Alert className="mb-4">
              <AlertDescription>
                The following items could not be scheduled due to capacity constraints or incompatible molds.
                These items will remain in the production queue.
              </AlertDescription>
            </Alert>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Stock Model</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overflowItems.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-sm">{item.orderId}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.stockModel}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{item.customerName}</TableCell>
                    <TableCell className="text-sm text-yellow-700">{item.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter className="gap-2 mt-6 no-print">
          <Button
            variant="outline"
            onClick={handlePrint}
            data-testid="button-print-schedule"
          >
            <Printer className="w-4 h-4 mr-2" />
            Print Schedule
          </Button>
          <Button
            variant="outline"
            onClick={onClose}
            data-testid="button-close-preview"
          >
            Cancel
          </Button>
          <Button
            onClick={onApprove}
            disabled={isApproving}
            data-testid="button-approve-schedule"
          >
            {isApproving ? 'Approving...' : 'Approve & Progress Orders'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
