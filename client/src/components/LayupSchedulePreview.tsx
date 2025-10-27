import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Calendar, CheckCircle2, XCircle, AlertTriangle, Package, Printer } from 'lucide-react';
import { format } from 'date-fns';

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

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto print:max-w-full print:max-h-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-6 h-6" />
            Layup Schedule Preview
          </DialogTitle>
          <p className="text-sm text-gray-500">
            Week starting {weekStart ? format(new Date(weekStart), 'MMM dd, yyyy') : ''}
          </p>
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

          <div className={`${hasOverflow ? 'bg-yellow-50' : 'bg-gray-50'} p-4 rounded-lg`}>
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
        <div className="space-y-6">
          <h3 className="text-lg font-semibold">Scheduled Items</h3>
          
          {scheduledDays.map(day => (
            <div key={day} className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Badge variant={day === 5 ? 'secondary' : 'default'} className="text-sm">
                  {dayNames[day]}
                </Badge>
                <span className="text-sm text-gray-500">
                  {itemsByDay[day]?.length || 0} items
                </span>
                {day === 5 && (
                  <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                    Overflow Day
                  </Badge>
                )}
              </div>

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
            {isApproving ? 'Approving...' : `Approve & Move to Barcode (${scheduledItems.length} items)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
