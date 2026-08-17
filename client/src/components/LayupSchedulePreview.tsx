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
  stockModelId?: string | null;
  stockModelName?: string | null;
  stockModelDisplayName?: string | null;
  originalRef?: string | null;
  customerName: string;
  scheduledDate: string;
  moldId: string;
  dayOfWeek: number;
  dayName: string;
  actionLength?: string | null;
  actionInlet?: string | null;
  material?: string | null;
  hasLOP?: boolean;
  lopValue?: string | null;
  hasADL?: boolean;
  hasHeavyFill?: boolean;
  isFlatTop?: boolean;
}

interface OverflowItem {
  orderId: string;
  fbOrderNumber: string;
  stockModel: string;
  stockModelDisplayName?: string | null;
  originalRef?: string | null;
  errorCode?: 'STOCK_MODEL_UNRESOLVED' | 'NO_COMPATIBLE_MOLD' | 'NO_AVAILABLE_CAPACITY';
  customerName: string;
  reason: string;
}

function stockModelLabel(item: {
  stockModel: string;
  stockModelDisplayName?: string | null;
  originalRef?: string | null;
}): string {
  return item.stockModelDisplayName || item.stockModel || item.originalRef || 'Unresolved stock model';
}

const PRINT_ITEMS_PER_PAGE = 12;

function chunkItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

interface LayupSchedulePreviewProps {
  open: boolean;
  onClose: () => void;
  scheduledItems: ScheduledItem[];
  overflowItems: OverflowItem[];
  weekStart: string;
  totalItems: number;
  onApprove: () => void | Promise<unknown>;
  isApproving: boolean;
  isHistoricalReprint?: boolean;
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
  isHistoricalReprint = false,
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
    if (!open || !scheduleBarcode) {
      return;
    }

    // Wait for DOM to be ready
    const timer = setTimeout(() => {
      if (barcodeRef.current) {
        try {
          console.log('📊 Generating barcode:', scheduleBarcode);
          JsBarcode(barcodeRef.current, scheduleBarcode, {
            format: 'CODE128',
            width: 2,
            height: 60,
            displayValue: true,
            fontSize: 14,
            textAlign: 'center',
            textPosition: 'bottom',
            margin: 5,
            background: '#ffffff',
            lineColor: '#000000',
          });
          console.log('✅ Barcode generated successfully');
        } catch (error) {
          console.error('❌ Error generating schedule barcode:', error);
        }
      } else {
        console.warn('⚠️ Barcode ref still not available after timeout');
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [scheduleBarcode, open]);

  const handlePrint = async () => {
    // Best-effort print preparation must not prevent a newly generated
    // schedule from being committed. Capture any barcode failure now, then
    // save before reporting the recoverable print problem.
    let barcodeDataURL = '';
    let barcodeError: unknown = null;
    try {
      if (!barcodeRef.current) {
        throw new Error('Barcode not ready for printing');
      }

      // Wait a bit to ensure SVG is fully rendered
      await new Promise(resolve => setTimeout(resolve, 100));

      const svgElement = barcodeRef.current;
      
      // Check if the SVG has content
      if (!svgElement.hasChildNodes()) {
        console.error('❌ Barcode SVG is empty!');
        throw new Error('Barcode not generated');
      }
      
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgElement);
      
      console.log('📊 SVG String length:', svgString.length);
      console.log('📊 Barcode ID:', scheduleBarcode);
      
      // Properly encode for data URL
      const encodedSvg = btoa(unescape(encodeURIComponent(svgString)));
      barcodeDataURL = 'data:image/svg+xml;base64,' + encodedSvg;
      
      console.log('📊 Barcode data URL length:', barcodeDataURL.length);
    } catch (error) {
      console.error('❌ Error converting barcode:', error);
      barcodeError = error;
    }

    // Open the window during the user's click so popup blockers allow it. A
    // newly generated schedule must be committed before anything is printed;
    // otherwise the paper schedule has no durable history record.
    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!printWindow && isHistoricalReprint) {
      alert('Please allow popups to print the schedule');
      return;
    }

    if (printWindow && !isHistoricalReprint) {
      printWindow.document.write('<p style="font-family: sans-serif; padding: 24px">Saving schedule before printing...</p>');
    }

    if (!isHistoricalReprint) {
      try {
        await onApprove();
      } catch (error) {
        console.error('Failed to save schedule before printing:', error);
        printWindow?.close();
        return;
      }
    }

    if (barcodeError) {
      printWindow?.close();
      alert(
        isHistoricalReprint
          ? 'The barcode is not ready for printing. Please close and reopen the saved schedule, then try again.'
          : 'Schedule saved, but the barcode was not ready to print. Reprint it from Schedule History.'
      );
      return;
    }

    // Popup blocking must never prevent the approved schedule from being
    // persisted. The user can enable popups and reprint the saved schedule
    // from history without recreating or progressing the schedule again.
    if (!printWindow) {
      alert('Schedule saved. Please allow popups, then reprint it from Schedule History.');
      return;
    }

    // Generate the HTML only after the schedule save has succeeded.
    const printHTML = generatePrintHTML(barcodeDataURL);

    printWindow.document.open();
    printWindow.document.write(printHTML);

    // Register before closing the document. A fast popup can finish loading
    // synchronously during close(), which previously lost the event and never
    // opened the browser print dialog.
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
        // Don't auto-close so user can save as PDF
      }, 250);
    };
    printWindow.document.close();
  };

  const generatePrintHTML = (barcodeDataURL: string) => {
    const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const scheduledDays = [1, 2, 3, 4, 5].filter(day => itemsByDay[day]?.length > 0);
    const printableDayPages = scheduledDays.flatMap((day) => {
      const dayItems = itemsByDay[day] || [];
      return chunkItems(dayItems, PRINT_ITEMS_PER_PAGE).map((items, pageIndex, pages) => ({
        day,
        items,
        pageIndex,
        pageCount: pages.length,
        totalForDay: dayItems.length,
      }));
    });
    
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Layup Schedule - ${weekStart ? format(new Date(weekStart), 'MMM dd, yyyy') : ''}</title>
  <style>
    @page { size: letter landscape; margin: 0.3in; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; 
      padding: 8px; 
      color: #1a1a1a; 
      background: white;
      font-size: 9px;
      line-height: 1.2;
    }
    .header { 
      display: flex; 
      justify-content: space-between; 
      align-items: center;
      margin-bottom: 8px; 
      padding-bottom: 6px; 
      border-bottom: 1.5px solid #2c3e50;
    }
    .header h1 { 
      font-size: 18px; 
      font-weight: 700; 
      color: #2c3e50;
      margin-bottom: 2px;
    }
    .header p { 
      font-size: 11px; 
      font-weight: 500;
      color: #555;
    }
    .barcode-box { 
      text-align: center; 
      border: 1px solid #ddd; 
      padding: 4px 6px; 
      border-radius: 3px;
      background: #f8f9fa;
    }
    .barcode-box p { 
      font-size: 7px; 
      font-weight: 600; 
      margin-bottom: 2px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .barcode-box img { width: 220px; height: auto; }
    .summary { 
      display: flex; 
      gap: 6px; 
      margin-bottom: 8px;
    }
    .summary-item { 
      flex: 1; 
      text-align: center; 
      padding: 4px 6px; 
      border: 1px solid #e0e0e0; 
      border-radius: 3px;
      background: linear-gradient(to bottom, #ffffff, #f8f9fa);
    }
    .summary-item .label { 
      font-size: 7px; 
      font-weight: 600; 
      text-transform: uppercase; 
      color: #666;
      letter-spacing: 0.3px;
      margin-bottom: 2px;
    }
    .summary-item .value { 
      font-size: 16px; 
      font-weight: 700;
      color: #2c3e50;
    }
    .day-page {
      break-after: page;
      page-break-after: always;
    }
    .day-page:last-child {
      break-after: auto;
      page-break-after: auto;
    }
    .day-section { 
      break-inside: auto;
      page-break-inside: auto;
      margin-bottom: 10px;
      border: 1px solid #dee2e6; 
      border-radius: 4px;
      overflow: visible;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }
    .day-header { 
      font-size: 11px; 
      font-weight: 700; 
      padding: 4px 8px; 
      background: linear-gradient(to right, #2c3e50, #34495e);
      color: white;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .day-header .count {
      font-size: 9px;
      font-weight: 500;
      opacity: 0.9;
    }
    .day-content {
      padding: 6px;
      background: white;
    }
    .order-item { 
      display: flex; 
      gap: 6px; 
      padding: 4px 6px; 
      border: 1px solid #e8e8e8; 
      border-radius: 2px; 
      margin-bottom: 3px;
      background: #ffffff;
    }
    .order-item:last-of-type {
      margin-bottom: 0;
    }
    .checkbox { 
      width: 16px; 
      height: 16px; 
      border: 1.5px solid #2c3e50; 
      border-radius: 2px; 
      flex-shrink: 0; 
      margin-top: 1px;
      background: white;
    }
    .order-details { 
      flex-grow: 1; 
      display: grid; 
      grid-template-columns: 1fr 1.3fr 0.9fr 1.1fr; 
      gap: 6px;
      align-items: start;
    }
    .field-label { 
      font-size: 7px; 
      font-weight: 600; 
      text-transform: uppercase; 
      color: #888;
      letter-spacing: 0.2px;
      margin-bottom: 1px;
    }
    .field-value { 
      font-size: 9px; 
      font-weight: 600;
      color: #2c3e50;
      font-family: "Courier New", Consolas, monospace;
      line-height: 1.3;
    }
    .badges { 
      display: flex; 
      gap: 3px; 
      flex-shrink: 0;
      align-items: flex-start;
    }
    .badge { 
      padding: 2px 6px; 
      border: 1px solid; 
      border-radius: 2px; 
      font-size: 7px; 
      font-weight: 700; 
      text-align: center;
      white-space: nowrap;
      line-height: 1.3;
    }
    .badge-lop { 
      background: linear-gradient(to bottom, #d1fae5, #a7f3d0);
      border-color: #059669; 
      color: #065f46;
    }
    .badge-adl { 
      background: linear-gradient(to bottom, #dbeafe, #bfdbfe);
      border-color: #2563eb; 
      color: #1e40af;
    }
    .badge-heavy { 
      background: linear-gradient(to bottom, #fed7aa, #fdba74);
      border-color: #ea580c; 
      color: #9a3412;
    }
    .badge-flattop {
      background: linear-gradient(to bottom, #fef9c3, #fef08a);
      border-color: #ca8a04;
      color: #713f12;
    }
    .badge-stiller { 
      background: linear-gradient(to bottom, #fef3c7, #fde68a);
      border-color: #d97706; 
      color: #92400e;
    }
    .badge-smr { 
      background: linear-gradient(to bottom, #f3e8ff, #e9d5ff);
      border-color: #9333ea; 
      color: #6b21a8;
    }
    .signature { 
      display: flex; 
      gap: 12px; 
      margin-top: 6px; 
      padding-top: 6px; 
      border-top: 1px solid #dee2e6;
    }
    .sig-field { 
      flex: 1;
      min-width: 0;
    }
    .sig-label { 
      font-size: 7px; 
      font-weight: 600; 
      margin-bottom: 2px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.2px;
    }
    .sig-line { 
      border-bottom: 1px solid #2c3e50; 
      height: 20px;
    }
    .sig-date { 
      flex: 0 0 100px;
    }
    @media print { 
      body { padding: 0; }
      .day-page { break-after: page; page-break-after: always; }
      .day-page:last-child { break-after: auto; page-break-after: auto; }
      .day-header { break-after: avoid; page-break-after: avoid; }
      .order-item { break-inside: avoid; }
      .signature { break-inside: avoid; page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Layup Schedule</h1>
      <p>Week of ${weekStart ? format(new Date(weekStart), 'MMM dd, yyyy') : ''}</p>
    </div>
    <div class="barcode-box">
      <p>Scan to Complete</p>
      <img src="${barcodeDataURL}" alt="Barcode" />
    </div>
  </div>
  
  <div class="summary">
    <div class="summary-item">
      <div class="label">Total</div>
      <div class="value">${totalItems}</div>
    </div>
    <div class="summary-item">
      <div class="label">Scheduled</div>
      <div class="value">${scheduledItems.length}</div>
    </div>
    <div class="summary-item">
      <div class="label">Overflow</div>
      <div class="value">${overflowItems.length}</div>
    </div>
  </div>
  
  ${printableDayPages.map(({ day, items, pageIndex, pageCount, totalForDay }) => `
    <div class="day-page" data-print-day="${dayNames[day]}" data-print-page="${pageIndex + 1}">
    <div class="day-section">
      <div class="day-header">
        <span>${dayNames[day]}${pageIndex > 0 ? ' (continued)' : ''}</span>
        <span class="count">${totalForDay} items${pageCount > 1 ? ` • page ${pageIndex + 1} of ${pageCount}` : ''}</span>
      </div>
      <div class="day-content">
        ${items.map(item => `
          <div class="order-item">
            <div class="checkbox"></div>
            <div class="order-details">
              <div>
                <div class="field-label">Order ID</div>
                <div class="field-value">${item.orderId}</div>
              </div>
              <div>
                <div class="field-label">Stock Model</div>
                <div class="field-value">${stockModelLabel(item)}</div>
              </div>
              <div>
                <div class="field-label">Mold</div>
                <div class="field-value">${item.moldId}</div>
              </div>
              <div>
                <div class="field-label">Action / Material</div>
                <div class="field-value">${item.actionLength || '-'} / ${item.material || '-'}</div>
              </div>
            </div>
            ${(() => {
              const actionLength = (item.actionLength || '').toLowerCase().trim();
              const actionInlet = (item.actionInlet || '').toLowerCase().trim();
              const isMA = actionLength === 'ma' || actionLength === 'medium';
              const stillerInlets = ['xm+', 'xm_plus', 'xmplus', 'lone peak', 'lone_peak', 'lonepeak', 'stiller', 'bighorn', 'big_horn', 'big horn'];
              const hasStillerInlet = stillerInlets.some(pattern => actionInlet.includes(pattern));
              const showStiller = isMA && hasStillerInlet;
              const showSMR = isMA && !hasStillerInlet;
              const hasBadges = item.hasLOP || item.hasADL || item.hasHeavyFill || item.isFlatTop || showStiller || showSMR;
              return hasBadges ? `
              <div class="badges">
                ${item.hasLOP ? `<div class="badge badge-lop">LOP ${item.lopValue || ''}</div>` : ''}
                ${item.hasADL ? '<div class="badge badge-adl">ADL</div>' : ''}
                ${item.hasHeavyFill ? '<div class="badge badge-heavy">HEAVY</div>' : ''}
                ${item.isFlatTop ? '<div class="badge badge-flattop">FLAT TOP</div>' : ''}
                ${showStiller ? '<div class="badge badge-stiller">Stiller</div>' : ''}
                ${showSMR ? '<div class="badge badge-smr">SMR</div>' : ''}
              </div>
            ` : '';
            })()}
          </div>
        `).join('')}
        ${pageIndex === pageCount - 1 ? `<div class="signature">
          <div class="sig-field">
            <div class="sig-label">Completed By</div>
            <div class="sig-line"></div>
          </div>
          <div class="sig-field sig-date">
            <div class="sig-label">Date</div>
            <div class="sig-line"></div>
          </div>
        </div>` : ''}
      </div>
    </div>
    </div>
  `).join('')}
</body>
</html>`;
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
            <div className="flex flex-col items-center border rounded-lg p-3 bg-gray-50">
              <p className="text-xs text-gray-600 mb-2 font-semibold">Scan to Complete Layup</p>
              <div className="bg-white p-2 rounded">
                <svg ref={barcodeRef} data-testid="barcode-svg" style={{ width: '240px', height: '80px' }}></svg>
              </div>
              {scheduleBarcode && (
                <p className="text-xs text-gray-500 mt-2 font-mono">{scheduleBarcode}</p>
              )}
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
                          <Badge variant="outline">{stockModelLabel(item)}</Badge>
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
                                LOP {item.lopValue || ''}
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
                            {item.isFlatTop && (
                              <Badge className="bg-yellow-100 text-yellow-900 border-yellow-300 text-xs">
                                Flat Top
                              </Badge>
                            )}
                            {(() => {
                              const actionLength = (item.actionLength || '').toLowerCase().trim();
                              const actionInlet = (item.actionInlet || '').toLowerCase().trim();
                              const isMA = actionLength === 'ma' || actionLength === 'medium';
                              const stillerInlets = ['xm+', 'xm_plus', 'xmplus', 'lone peak', 'lone_peak', 'lonepeak', 'stiller', 'bighorn', 'big_horn', 'big horn'];
                              const hasStillerInlet = stillerInlets.some(pattern => actionInlet.includes(pattern));
                              if (isMA && hasStillerInlet) {
                                return (
                                  <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
                                    Stiller
                                  </Badge>
                                );
                              }
                              if (isMA && !hasStillerInlet) {
                                return (
                                  <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-xs">
                                    SMR
                                  </Badge>
                                );
                              }
                              return null;
                            })()}
                            {!item.hasLOP && !item.hasADL && !item.hasHeavyFill && !item.isFlatTop && !(
                              (item.actionLength || '').toLowerCase() === 'ma' || (item.actionLength || '').toLowerCase() === 'medium'
                            ) && (
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
                        <div className="layup-field-value">{stockModelLabel(item)}</div>
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
                    
                    {(() => {
                      const actionLength = (item.actionLength || '').toLowerCase().trim();
                      const actionInlet = (item.actionInlet || '').toLowerCase().trim();
                      const isMA = actionLength === 'ma' || actionLength === 'medium';
                      const stillerInlets = ['xm+', 'xm_plus', 'xmplus', 'lone peak', 'lone_peak', 'lonepeak', 'stiller', 'bighorn', 'big_horn', 'big horn'];
                      const hasStillerInlet = stillerInlets.some(pattern => actionInlet.includes(pattern));
                      const showStiller = isMA && hasStillerInlet;
                      const showSMR = isMA && !hasStillerInlet;
                      const hasBadges = item.hasLOP || item.hasADL || item.hasHeavyFill || item.isFlatTop || showStiller || showSMR;
                      return hasBadges ? (
                        <div className="layup-badges">
                          {item.hasLOP && <span className="layup-badge layup-badge-lop">LOP {item.lopValue || ''}</span>}
                          {item.hasADL && <span className="layup-badge layup-badge-adl">ADL</span>}
                          {item.hasHeavyFill && <span className="layup-badge layup-badge-heavy">HEAVY</span>}
                          {item.isFlatTop && <span className="layup-badge layup-badge-flattop">FLAT TOP</span>}
                          {showStiller && <span className="layup-badge layup-badge-stiller">Stiller</span>}
                          {showSMR && <span className="layup-badge layup-badge-smr">SMR</span>}
                        </div>
                      ) : null;
                    })()}
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
                      <Badge variant="outline">{stockModelLabel(item)}</Badge>
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
            disabled={isApproving}
            data-testid="button-print-schedule"
          >
            <Printer className="w-4 h-4 mr-2" />
            {isHistoricalReprint ? 'Print Schedule' : isApproving ? 'Saving...' : 'Approve, Save & Print'}
          </Button>
          <Button
            variant="outline"
            onClick={onClose}
            data-testid="button-close-preview"
          >
            Cancel
          </Button>
          {!isHistoricalReprint && (
            <Button
              onClick={onApprove}
              disabled={isApproving}
              data-testid="button-approve-schedule"
            >
              {isApproving ? 'Approving...' : 'Approve & Progress Orders'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
