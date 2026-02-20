import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Ticket } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useLocation } from 'wouter';

interface TicketCountInfo {
  count: number;
  hasHighPriority: boolean;
  statuses: string[];
  ticketIds: string[];
}

type TicketMap = Record<string, TicketCountInfo>;

export function useOrderTicketCounts(orderIds: string[]) {
  return useQuery<TicketMap>({
    queryKey: ['/api/tickets/by-orders', orderIds.sort().join(',')],
    queryFn: () =>
      apiRequest('/api/tickets/by-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds }),
      }),
    enabled: orderIds.length > 0,
    staleTime: 60000,
    refetchInterval: 120000,
  });
}

interface TicketBadgeProps {
  orderId: string;
  ticketMap: TicketMap | undefined;
}

export default function TicketBadge({ orderId, ticketMap }: TicketBadgeProps) {
  const [, setLocation] = useLocation();

  if (!ticketMap || !ticketMap[orderId]) return null;

  const info = ticketMap[orderId];
  const isHigh = info.hasHighPriority;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (info.count === 1 && info.ticketIds?.length === 1) {
      setLocation(`/tickets?orderId=${orderId}&ticketId=${info.ticketIds[0]}`);
    } else {
      setLocation(`/tickets?orderId=${orderId}`);
    }
  };

  return (
    <Badge
      className={`cursor-pointer text-xs font-semibold px-2 py-0.5 flex items-center gap-1 border-2 shadow-sm animate-none ${
        isHigh
          ? 'bg-red-500 text-white hover:bg-red-600 border-red-600 dark:bg-red-600 dark:hover:bg-red-700 dark:border-red-700'
          : 'bg-amber-500 text-white hover:bg-amber-600 border-amber-600 dark:bg-amber-600 dark:hover:bg-amber-700 dark:border-amber-700'
      }`}
      title={`${info.count} open ticket${info.count > 1 ? 's' : ''} linked to this order${isHigh ? ' (HIGH PRIORITY)' : ''} — click to view`}
      onClick={handleClick}
    >
      <Ticket className="h-3.5 w-3.5" />
      {info.count} {info.count === 1 ? 'Ticket' : 'Tickets'}
    </Badge>
  );
}
