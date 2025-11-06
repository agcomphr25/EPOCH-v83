import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

type CostHistoryEntry = {
  id: number;
  inventoryItemId: number;
  vendorId: number | null;
  vendorName?: string;
  receivedDate: string;
  purchaseUnitCost: number;
  usageUnitCost: number;
  currency: string;
  poLineItemId?: number | null;
  notes?: string | null;
  createdAt: string;
  purchaseUnit?: string;
  usageUnit?: string;
};

interface InventoryItemCostHistoryProps {
  agPartNumber: string;
  currentCost?: number | null;
  purchaseUnit?: string | null;
  usageUnit?: string | null;
}

export default function InventoryItemCostHistory({
  agPartNumber,
  currentCost,
  purchaseUnit,
  usageUnit,
}: InventoryItemCostHistoryProps) {
  const { data: costHistory = [], isLoading } = useQuery<CostHistoryEntry[]>({
    queryKey: ['/api/inventory/items', agPartNumber, 'cost-history'],
    queryFn: () => apiRequest(`/api/inventory/items/${agPartNumber}/cost-history`),
    enabled: !!agPartNumber,
  });

  const getCostTrend = (current: number, previous?: number) => {
    if (!previous) return null;
    const diff = current - previous;
    const percentChange = ((diff / previous) * 100).toFixed(1);
    
    if (Math.abs(diff) < 0.01) {
      return { icon: Minus, color: 'text-gray-500', text: 'No change' };
    }
    
    if (diff > 0) {
      return {
        icon: TrendingUp,
        color: 'text-red-500',
        text: `+${percentChange}% increase`,
      };
    }
    
    return {
      icon: TrendingDown,
      color: 'text-green-500',
      text: `${percentChange}% decrease`,
    };
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Cost History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading cost history...</div>
        </CardContent>
      </Card>
    );
  }

  if (costHistory.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Cost History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            No cost history available. Cost history will be automatically created when vendor PO items are received.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm">Cost History</CardTitle>
          {currentCost && (
            <Badge variant="outline">
              Current: ${currentCost.toFixed(4)}/{usageUnit || 'unit'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-64 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Purchase Cost</TableHead>
                <TableHead>Usage Cost</TableHead>
                <TableHead>Trend</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {costHistory.map((entry, index) => {
                const previousEntry = costHistory[index + 1];
                const trend = getCostTrend(entry.usageUnitCost, previousEntry?.usageUnitCost);
                const TrendIcon = trend?.icon;
                
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="text-xs">
                      {format(new Date(entry.receivedDate), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell className="text-xs">
                      {entry.vendorName || `ID: ${entry.vendorId}`}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>
                        <div className="font-medium">
                          ${entry.purchaseUnitCost.toFixed(2)}
                        </div>
                        <div className="text-muted-foreground">
                          per {purchaseUnit || 'unit'}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>
                        <div className="font-medium">
                          ${entry.usageUnitCost.toFixed(4)}
                        </div>
                        <div className="text-muted-foreground">
                          per {usageUnit || 'unit'}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {trend && TrendIcon && (
                        <div className={`flex items-center gap-1 ${trend.color}`}>
                          <TrendIcon className="w-3 h-3" />
                          <span className="text-xs">{trend.text}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {entry.notes && (
                        <div className="max-w-xs truncate" title={entry.notes}>
                          {entry.notes}
                        </div>
                      )}
                      {entry.poLineItemId && (
                        <div className="text-muted-foreground">
                          PO Line #{entry.poLineItemId}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
