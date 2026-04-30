import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RotateCcw, FileText } from 'lucide-react';

type NonconformanceItem = {
  id: number;
  orderId: string | null;
  rmaNumber: string | null;
  customerName: string | null;
  stockModel: string | null;
  issueCause: string | null;
  serialNumber: string | null;
  disposition: string | null;
  status: string;
  notes: string | null;
  repairDepartment: string | null;
};

type Props = {
  repairDepartment: string;
  className?: string;
};

export function ReturnsRepairsSection({ repairDepartment, className }: Props) {
  const [, setLocation] = useLocation();

  const { data: items = [] } = useQuery<NonconformanceItem[]>({
    queryKey: ['/api/nonconformance', { repairDepartment }],
    queryFn: async () => {
      const result = await apiRequest('/api/nonconformance?limit=100');
      return (result || []).filter(
        (item: NonconformanceItem) =>
          item.repairDepartment?.toLowerCase() === repairDepartment.toLowerCase() &&
          item.status !== 'Resolved' &&
          item.status !== 'Closed' &&
          (item.disposition === 'Repair' || item.disposition === 'Return')
      );
    },
    refetchInterval: 30000,
  });

  if (items.length === 0) return null;

  return (
    <Card className={`border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20${className ? ` ${className}` : ''}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-300">
          <RotateCcw className="h-5 w-5" />
          Returns & Repairs ({items.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Card
              key={item.id}
              className="bg-white dark:bg-gray-800 border-orange-200 dark:border-orange-800"
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border-orange-300"
                    >
                      {item.disposition?.toUpperCase() || 'RETURN'}
                    </Badge>
                    <span className="font-semibold">
                      {item.orderId || item.rmaNumber || `RMA-${item.id}`}
                    </span>
                  </div>
                </div>
                <div className="space-y-1 text-sm">
                  {item.serialNumber && (
                    <div className="text-gray-600 dark:text-gray-400">
                      Serial: {item.serialNumber}
                    </div>
                  )}
                  <div className="text-gray-600 dark:text-gray-400">
                    Customer: {item.customerName || 'N/A'}
                  </div>
                  {item.stockModel && (
                    <div className="text-gray-600 dark:text-gray-400">
                      Model: {item.stockModel}
                    </div>
                  )}
                  <div className="text-gray-600 dark:text-gray-400">
                    Issue: {item.issueCause || 'N/A'}
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                    <Badge
                      variant="outline"
                      className={
                        item.status === 'Open'
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                      }
                    >
                      {item.status}
                    </Badge>
                    <div className="flex items-center gap-2">
                      {item.notes && (
                        <div className="relative group">
                          <FileText className="h-4 w-4 text-gray-500 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300" />
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-normal max-w-xs z-50 shadow-lg">
                            <div className="font-semibold mb-1">Notes:</div>
                            <div>{item.notes}</div>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-100"></div>
                          </div>
                        </div>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLocation('/nonconformance')}
                        className="text-xs"
                      >
                        View Details
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
