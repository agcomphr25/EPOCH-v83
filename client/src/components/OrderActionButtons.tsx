import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, TrendingDown, Shuffle, AlertTriangle } from 'lucide-react';

interface OrderActionButtonsProps {
  orderId: string;
  onSalesOrderView?: (orderId: string) => void;
  onReportKickback?: (orderId: string) => void;
  showReassignButton?: boolean;
  hasKickbacks?: boolean;
  kickbackStatus?: string | null;
  onKickbackBadgeClick?: (orderId: string) => void;
  className?: string;
}

export default function OrderActionButtons({
  orderId,
  onSalesOrderView,
  onReportKickback,
  showReassignButton = true,
  hasKickbacks = false,
  kickbackStatus = null,
  onKickbackBadgeClick,
  className = '',
}: OrderActionButtonsProps) {
  const [, setLocation] = useLocation();

  const kickbackBadgeColor =
    kickbackStatus === 'CRITICAL'
      ? 'bg-red-600 hover:bg-red-700'
      : kickbackStatus === 'HIGH'
        ? 'bg-orange-600 hover:bg-orange-700'
        : kickbackStatus === 'MEDIUM'
          ? 'bg-yellow-600 hover:bg-yellow-700'
          : 'bg-gray-600 hover:bg-gray-700';

  return (
    <div className={`flex items-center gap-1 flex-wrap ${className}`}>
      {onSalesOrderView && (
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onSalesOrderView(orderId);
          }}
          title="View Sales Order"
          className="h-6 w-6 p-0"
        >
          <Eye className="w-3 h-3" />
        </Button>
      )}

      {onReportKickback && (
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onReportKickback(orderId);
          }}
          title="Report Kickback"
          className="h-6 w-6 p-0"
          data-testid={`button-report-kickback-${orderId}`}
        >
          <TrendingDown className="h-3 w-3" />
        </Button>
      )}

      {showReassignButton && (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setLocation(`/order-department-transfer?orderId=${encodeURIComponent(orderId)}`);
          }}
          title="Reassign Department"
          className="h-6 w-6 p-0 text-purple-600 hover:text-purple-800 hover:bg-purple-50"
        >
          <Shuffle className="h-3 w-3" />
        </Button>
      )}

      {hasKickbacks && (
        <Badge
          variant="destructive"
          className={`cursor-pointer hover:opacity-80 transition-opacity text-xs px-1 py-0 ${kickbackBadgeColor}`}
          onClick={(e) => {
            e.stopPropagation();
            onKickbackBadgeClick?.(orderId);
          }}
        >
          <AlertTriangle className="w-3 h-3 mr-1" />
          Kickback
        </Badge>
      )}
    </div>
  );
}
