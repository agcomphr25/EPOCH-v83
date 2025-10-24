import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface PrintableWeeklyScheduleProps {
  weekStartDate: string;
  daySchedules: any[];
}

export default function PrintableWeeklySchedule({
  weekStartDate,
  daySchedules,
}: PrintableWeeklyScheduleProps) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="printable-schedule">
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .printable-schedule, .printable-schedule * {
            visibility: visible;
          }
          .printable-schedule {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="p-8">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold">Weekly Layup Schedule</h1>
          <p className="text-gray-600 mt-2">
            Week of {format(new Date(weekStartDate), 'MMMM dd, yyyy')}
          </p>
        </div>

        {daySchedules.map((daySchedule) => (
          <div key={daySchedule.dayOfWeek} className="mb-8 page-break">
            <div className="mb-4">
              <h2 className="text-2xl font-bold">
                {daySchedule.dayOfWeek} - {format(new Date(daySchedule.date), 'MMM dd')}
              </h2>
              <p className="text-gray-600">
                Molds Used: {daySchedule.moldsUsed} | Available: {daySchedule.moldsAvailable}
              </p>
            </div>

            {daySchedule.assignments.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Stock Model</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead>Mold #</TableHead>
                    <TableHead>Action Length</TableHead>
                    <TableHead>LOP</TableHead>
                    <TableHead>ADL</TableHead>
                    <TableHead>Heavy Fill</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {daySchedule.assignments.map((assignment: any) => {
                    const details = assignment.orderDetails || assignment.poProductDetails;
                    
                    return (
                      <TableRow key={assignment.id}>
                        <TableCell className="font-medium">
                          {assignment.itemType === 'order'
                            ? assignment.orderId
                            : `PO: ${details?.poNumber || 'N/A'}`}
                        </TableCell>
                        <TableCell>{details?.customerName || 'N/A'}</TableCell>
                        <TableCell>{details?.stockModel || details?.productName || 'N/A'}</TableCell>
                        <TableCell>{details?.material || 'N/A'}</TableCell>
                        <TableCell>{assignment.moldCount}</TableCell>
                        <TableCell>{details?.actionLength || 'N/A'}</TableCell>
                        <TableCell>{details?.lop || 'N/A'}</TableCell>
                        <TableCell>{details?.adl || 'N/A'}</TableCell>
                        <TableCell>
                          {details?.heavyFill ? 'Yes' : 'No'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <p className="text-gray-500 italic">No assignments for this day</p>
            )}
          </div>
        ))}

        <div className="mt-8 text-sm text-gray-600">
          <p>Generated on {format(new Date(), 'MMMM dd, yyyy hh:mm a')}</p>
        </div>
      </div>
    </div>
  );
}
