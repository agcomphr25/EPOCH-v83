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
    // Add print class to body to trigger print styles
    document.body.classList.add('printing-schedule');
    
    // Trigger print
    setTimeout(() => {
      window.print();
      
      // Remove print class after printing
      setTimeout(() => {
        document.body.classList.remove('printing-schedule');
      }, 100);
    }, 100);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto print:fixed print:inset-0 print:max-w-none print:max-h-none print:overflow-visible print:p-8 print:bg-white">
        <DialogHeader className="print:block print:mb-6">
          <div className="flex items-center justify-between print:relative">
            <div>
              <DialogTitle className="flex items-center gap-2 print:text-3xl print:font-bold print:mb-2">
                <Calendar className="w-6 h-6 print:hidden" />
                Layup Schedule
              </DialogTitle>
              <p className="text-sm text-gray-500 print:text-xl print:text-black print:font-semibold">
                Week starting {weekStart ? format(new Date(weekStart), 'MMM dd, yyyy') : ''}
              </p>
            </div>
            {/* Schedule Barcode - appears in top right corner when printed */}
            <div className="flex flex-col items-center border rounded-lg p-3 bg-white print:absolute print:top-0 print:right-0 print:border-2 print:border-black print:rounded print:p-2">
              <p className="text-xs text-gray-600 mb-1 print:text-sm print:text-black print:font-semibold print:mb-2">Scan to Complete Layup</p>
              <svg ref={barcodeRef} className="w-48 print:w-56"></svg>
            </div>
          </div>
        </DialogHeader>

        {/* Summary Statistics */}
        <div className="grid grid-cols-3 gap-4 mb-6 print:grid-cols-3 print:gap-6 print:mb-8 print:border-2 print:border-black print:p-4 print:rounded">
          <div className="bg-blue-50 p-4 rounded-lg print:bg-white print:border-2 print:border-blue-700 print:p-3">
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-5 h-5 text-blue-600 print:w-6 print:h-6" />
              <span className="text-sm font-medium text-gray-700 print:text-base print:text-black print:font-bold">Total Items</span>
            </div>
            <div className="text-2xl font-bold text-blue-700 print:text-3xl print:text-black">{totalItems}</div>
          </div>

          <div className="bg-green-50 p-4 rounded-lg print:bg-white print:border-2 print:border-green-700 print:p-3">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-5 h-5 text-green-600 print:w-6 print:h-6" />
              <span className="text-sm font-medium text-gray-700 print:text-base print:text-black print:font-bold">Scheduled</span>
            </div>
            <div className="text-2xl font-bold text-green-700 print:text-3xl print:text-black">{scheduledItems.length}</div>
          </div>

          <div className={`${hasOverflow ? 'bg-yellow-50' : 'bg-gray-50'} p-4 rounded-lg print:bg-white print:border-2 ${hasOverflow ? 'print:border-yellow-700' : 'print:border-gray-400'} print:p-3`}>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className={`w-5 h-5 ${hasOverflow ? 'text-yellow-600' : 'text-gray-400'} print:w-6 print:h-6`} />
              <span className="text-sm font-medium text-gray-700 print:text-base print:text-black print:font-bold">Overflow</span>
            </div>
            <div className={`text-2xl font-bold ${hasOverflow ? 'text-yellow-700' : 'text-gray-400'} print:text-3xl print:text-black`}>
              {overflowItems.length}
            </div>
          </div>
        </div>

        {/* Scheduled Items by Day */}
        <div className="space-y-6 print:space-y-8">
          <h3 className="text-lg font-semibold print:text-2xl print:font-bold print:mb-6 print:border-b-4 print:border-black print:pb-2">Scheduled Items</h3>
          
          {scheduledDays.map(day => (
            <div key={day} className="border rounded-lg p-4 print:border-4 print:border-black print:rounded-lg print:p-6 print:page-break-inside-avoid print:mb-8">
              <div className="flex items-center gap-2 mb-3 print:mb-6 print:pb-3 print:border-b-4 print:border-black">
                <Badge variant={day === 5 ? 'secondary' : 'default'} className="text-sm print:text-2xl print:font-bold print:bg-black print:text-white print:px-4 print:py-2">
                  {dayNames[day]}
                </Badge>
                <span className="text-sm text-gray-500 print:text-xl print:text-black print:font-bold">
                  ({itemsByDay[day]?.length || 0} items)
                </span>
                {day === 5 && (
                  <Badge variant="outline" className="text-yellow-600 border-yellow-600 print:hidden">
                    Overflow Day
                  </Badge>
                )}
              </div>

              {/* Desktop/Preview Table View */}
              <div className="print:hidden">
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
              <div className="hidden print:block space-y-4">
                {itemsByDay[day]?.map((item, idx) => (
                  <div key={idx} className="border-3 border-black rounded-lg p-4 bg-white flex items-start gap-4">
                    {/* Large Checkbox */}
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-8 h-8 border-3 border-black rounded-md"></div>
                    </div>
                    
                    {/* Order Details */}
                    <div className="flex-grow grid grid-cols-4 gap-3 text-sm">
                      <div>
                        <div className="font-bold text-xs text-gray-700 uppercase">Order ID</div>
                        <div className="font-mono font-bold text-lg mt-1">{item.orderId}</div>
                      </div>
                      <div>
                        <div className="font-bold text-xs text-gray-700 uppercase">Stock Model</div>
                        <div className="font-bold text-base mt-1">{item.stockModel}</div>
                      </div>
                      <div>
                        <div className="font-bold text-xs text-gray-700 uppercase">Mold</div>
                        <div className="font-bold text-lg mt-1">{item.moldId}</div>
                      </div>
                      <div>
                        <div className="font-bold text-xs text-gray-700 uppercase">Action / Material</div>
                        <div className="font-bold text-base mt-1">
                          {item.actionLength || '-'} / {item.material || '-'}
                        </div>
                      </div>
                    </div>
                    
                    {/* Badges */}
                    {(item.hasLOP || item.hasADL || item.hasHeavyFill) && (
                      <div className="flex-shrink-0 flex flex-col gap-2 text-xs font-bold">
                        {item.hasLOP && (
                          <span className="px-3 py-2 bg-green-100 border-2 border-green-800 rounded text-sm">LOP</span>
                        )}
                        {item.hasADL && (
                          <span className="px-3 py-2 bg-blue-100 border-2 border-blue-800 rounded text-sm">ADL</span>
                        )}
                        {item.hasHeavyFill && (
                          <span className="px-3 py-2 bg-orange-100 border-2 border-orange-800 rounded text-sm">HEAVY</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                
                {/* Signature Line for Each Day */}
                <div className="mt-8 pt-6 border-t-4 border-black flex justify-between items-end">
                  <div>
                    <div className="text-base font-bold mb-2">Completed by:</div>
                    <div className="border-b-3 border-black w-80 h-10"></div>
                  </div>
                  <div>
                    <div className="text-base font-bold mb-2">Date:</div>
                    <div className="border-b-3 border-black w-40 h-10"></div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Overflow Items */}
        {hasOverflow && (
          <div className="mt-6 border border-yellow-300 rounded-lg p-4 bg-yellow-50">
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
                    <TableCell className="text-sm text-yellow-700">{item.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter className="mt-6 print:hidden">
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
            disabled={isApproving}
            data-testid="button-cancel-schedule"
          >
            Cancel
          </Button>
          <Button
            onClick={onApprove}
            disabled={isApproving || scheduledItems.length === 0}
            className="bg-green-600 hover:bg-green-700"
            data-testid="button-approve-schedule"
          >
            {isApproving ? 'Approving...' : `Approve & Progress to Layup (${scheduledItems.length} items)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
