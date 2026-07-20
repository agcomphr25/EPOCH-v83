import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar, Printer, Package, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { LayupSchedulePreview } from './LayupSchedulePreview';

interface Week {
  week_start: string;
  first_day: string;
  last_day: string;
  created_at: string;
  order_count: number;
  po_order_count: number;
  regular_order_count: number;
  order_ids: string[];
  schedule_days: string[];
}

interface ScheduleHistoryDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ScheduleHistoryDialog({ open, onClose }: ScheduleHistoryDialogProps) {
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [showReprintDialog, setShowReprintDialog] = useState(false);

  // Fetch list of weeks with schedules
  const { data: weeksData, isLoading: weeksLoading } = useQuery({
    queryKey: ['/api/layup-schedule/weeks'],
    enabled: open,
  });

  // Fetch schedule data for selected week
  const { data: scheduleData, isLoading: scheduleLoading } = useQuery({
    queryKey: ['/api/layup-schedule/week', selectedWeek],
    enabled: !!selectedWeek && showReprintDialog,
  });

  const weeks: Week[] = (weeksData as any)?.weeks || [];

  const handleReprint = (weekStart: string) => {
    setSelectedWeek(weekStart);
    setShowReprintDialog(true);
  };

  const handleCloseReprint = () => {
    setShowReprintDialog(false);
    setSelectedWeek(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-6 h-6" />
              Schedule History & Reprint
            </DialogTitle>
            <p className="text-sm text-gray-500 mt-1">
              View and reprint past layup schedules
            </p>
          </DialogHeader>

          {weeksLoading ? (
            <div className="flex items-center justify-center p-12">
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-sm text-gray-500">Loading schedule history...</p>
              </div>
            </div>
          ) : weeks.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12">
              <FileText className="w-16 h-16 text-gray-300 mb-4" />
              <p className="text-gray-500">No schedules found</p>
              <p className="text-sm text-gray-400 mt-1">
                Scheduled work will appear here
              </p>
            </div>
          ) : (
            <div>
              <div className="mb-4 flex items-center gap-2 text-sm text-gray-600">
                <Package className="w-4 h-4" />
                <span>Showing {weeks.length} week{weeks.length !== 1 ? 's' : ''} with schedules</span>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Week Starting</TableHead>
                    <TableHead>Created Date</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weeks.map((week) => (
                    <TableRow key={week.week_start}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <div>
                            <div className="font-semibold">{format(new Date(week.week_start), 'MMM dd, yyyy')}</div>
                            <div className="text-xs text-gray-600 mt-1">
                              <span className="font-medium">Schedule Days:</span>
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {week.schedule_days.map((day) => (
                                <Badge 
                                  key={day} 
                                  variant="outline" 
                                  className="text-xs px-1.5 py-0"
                                >
                                  {format(new Date(day), 'MMM dd')}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {format(new Date(week.created_at), 'MMM dd, yyyy')}
                          </span>
                          <span className="text-xs text-gray-500">
                            {format(new Date(week.created_at), 'h:mm a')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-md">
                          {week.order_ids.slice(0, 8).map((orderId) => (
                            <Badge 
                              key={orderId} 
                              variant="outline" 
                              className="text-xs font-mono"
                            >
                              {orderId}
                            </Badge>
                          ))}
                          {week.order_ids.length > 8 && (
                            <Badge variant="secondary" className="text-xs">
                              +{week.order_ids.length - 8} more
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col gap-1 items-end">
                          <Badge variant="secondary" className="font-mono">
                            {week.order_count} total
                          </Badge>
                          <div className="flex gap-1">
                            <Badge variant="outline" className="text-xs font-mono">
                              {week.regular_order_count} reg
                            </Badge>
                            <Badge variant="outline" className="text-xs font-mono text-green-700 border-green-300">
                              {week.po_order_count} PO
                            </Badge>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReprint(week.week_start)}
                          data-testid={`button-reprint-${week.week_start}`}
                        >
                          <Printer className="w-4 h-4 mr-2" />
                          Reprint
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reprint Dialog - reuses existing LayupSchedulePreview component */}
      {selectedWeek && scheduleData && (
        <LayupSchedulePreview
          open={showReprintDialog}
          onClose={handleCloseReprint}
          scheduledItems={(scheduleData as any).scheduledItems || []}
          overflowItems={[]}
          weekStart={selectedWeek}
          totalItems={(scheduleData as any).totalItems || 0}
          onApprove={() => {
            // No approval action for reprints
            handleCloseReprint();
          }}
          isApproving={false}
          isHistoricalReprint
        />
      )}
    </>
  );
}
