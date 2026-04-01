import { useQuery } from '@tanstack/react-query';

export type EventCategory =
  | 'status_department'
  | 'spec_change'
  | 'shipping'
  | 'payment'
  | 'ncr_scrap'
  | 'admin_override'
  | 'production';

export interface OrderActivityEvent {
  id: string;
  eventType: string;
  eventCategory: EventCategory;
  timestamp: string;
  title: string;
  actorName: string | null;
  actorRole: string | null;
  source: string;
  isLegacy: boolean;
  beforeAfterSummary: string | null;
  fieldsChanged: Record<string, { before: any; after: any }> | null;
  reason: string | null;
  meta: Record<string, any> | null;
  rawType: 'audit' | 'transition' | 'scrap';
  department?: string;
  cycleNumber?: number;
  durationMinutes?: number;
}

export interface UseOrderActivityOptions {
  category?: string;
  actor?: string;
  source?: string;
  from?: string;
  to?: string;
}

export function useOrderActivity(orderId: string, options: UseOrderActivityOptions = {}) {
  const params = new URLSearchParams();
  if (options.category && options.category !== 'all') params.set('category', options.category);
  if (options.actor && options.actor.trim()) params.set('actor', options.actor.trim());
  if (options.source && options.source !== 'all') params.set('source', options.source);
  if (options.from) params.set('from', options.from);
  if (options.to) params.set('to', options.to);

  const queryString = params.toString();
  const url = `/api/orders/${orderId}/activity${queryString ? `?${queryString}` : ''}`;

  return useQuery<OrderActivityEvent[]>({
    queryKey: ['/api/orders', orderId, 'activity', options],
    queryFn: async () => {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch order activity');
      return res.json();
    },
    enabled: !!orderId,
    staleTime: 30000,
  });
}
