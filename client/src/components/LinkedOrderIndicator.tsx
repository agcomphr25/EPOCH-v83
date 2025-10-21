import { useQuery } from '@tanstack/react-query';
import { Link2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface LinkedOrderIndicatorProps {
  orderId: string;
  variant?: 'badge' | 'icon' | 'compact';
}

interface LinkGroupData {
  id: number;
  name: string | null;
  requiresApprovalToSeparate: boolean;
  notes: string | null;
  createdBy: string | null;
}

interface LinkedOrderData {
  id: number;
  linkGroupId: number;
  orderId: string;
  addedAt: string;
}

interface LinkDataResponse {
  linked: boolean;
  linkGroup: LinkGroupData | null;
  orders: LinkedOrderData[];
}

export function LinkedOrderIndicator({ orderId, variant = 'badge' }: LinkedOrderIndicatorProps) {
  const { data: linkData, isLoading } = useQuery<LinkDataResponse>({
    queryKey: ['/api/linked-orders/order', orderId],
    enabled: !!orderId,
    staleTime: 30000,
  });

  if (isLoading || !linkData?.linked) {
    return null;
  }

  const linkedOrders = linkData.orders || [];
  const linkGroup = linkData.linkGroup;
  const orderCount = linkedOrders.length;

  if (variant === 'icon') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div 
              className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300"
              data-testid={`linked-indicator-${orderId}`}
            >
              <Link2 className="h-3.5 w-3.5" />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-sm">
              Linked with {orderCount - 1} other order{orderCount - 1 !== 1 ? 's' : ''}
              {linkGroup?.name && ` (${linkGroup.name})`}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (variant === 'compact') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant="secondary" 
              className="flex items-center gap-1 text-xs"
              data-testid={`linked-badge-${orderId}`}
            >
              <Link2 className="h-3 w-3" />
              {orderCount}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-sm">
              {orderCount} linked orders
              {linkGroup?.name && ` - ${linkGroup.name}`}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
            data-testid={`linked-badge-${orderId}`}
          >
            <Link2 className="h-3.5 w-3.5" />
            <span>Linked ({orderCount} orders)</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            {linkGroup?.name && (
              <p className="font-semibold">{linkGroup.name}</p>
            )}
            <p className="text-sm">
              This order is linked with {orderCount - 1} other order{orderCount - 1 !== 1 ? 's' : ''}
            </p>
            {linkGroup?.requiresApprovalToSeparate && (
              <p className="text-xs text-muted-foreground">
                Requires approval to unlink
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
