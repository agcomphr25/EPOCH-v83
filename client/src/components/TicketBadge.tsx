import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Ticket } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useLocation } from 'wouter';

interface TicketCountInfo {
  count: number;
  hasHighPriority: boolean;
  statuses: string[];
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

  return (
    <Badge
      className={`cursor-pointer text-xs px-1.5 py-0 flex items-center gap-1 ${
        isHigh
          ? 'bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900 dark:text-red-300 dark:hover:bg-red-800'
          : 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900 dark:text-amber-300 dark:hover:bg-amber-800'
      }`}
      title={`${info.count} open ticket${info.count > 1 ? 's' : ''} linked to this order${isHigh ? ' (HIGH PRIORITY)' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        setLocation(`/tickets?orderId=${orderId}`);
      }}
    >
      <Ticket className="h-3 w-3" />
      {info.count}
    </Badge>
  );
}
