import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'wouter';
import { Eye, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WatchRule {
  id: number;
  userId: string;
  customerId: string;
  customerName: string;
  departmentId: number | null;
  departmentName: string;
  label: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface WatchRuleCardsProps {
  userId: string;
}

export default function WatchRuleCards({ userId }: WatchRuleCardsProps) {
  const { data: watchRules = [], isLoading, isError } = useQuery<WatchRule[]>({
    queryKey: [`/api/watch-rules?userId=${userId}`],
    enabled: !!userId,
  });

  const activeRules = watchRules.filter(rule => rule.isActive);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (activeRules.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-center">
          <Eye className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-500 dark:text-gray-400 mb-3">
            No active watch rules configured
          </p>
          <Link href="/watch-rules">
            <Button variant="outline" size="sm" className="flex items-center gap-2 mx-auto">
              <Settings className="w-4 h-4" />
              Set up watch rules
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {activeRules.map((rule) => (
          <WatchRuleCard key={rule.id} rule={rule} />
        ))}
      </div>
      <div className="flex justify-end">
        <Link href="/watch-rules">
          <Button variant="outline" size="sm" className="flex items-center gap-2" data-testid="button-manage-watch-rules">
            <Settings className="w-4 h-4" />
            Manage Watch Rules
          </Button>
        </Link>
      </div>
    </>
  );
}

function WatchRuleCard({ rule }: { rule: WatchRule }) {
  const { data: orderCount = { count: 0 }, isLoading, isError } = useQuery<{ count: number }>({
    queryKey: [`/api/watch-rules/${rule.id}/count`],
  });

  const displayLabel = rule.label || `${rule.customerName} - ${rule.departmentName}`;

  return (
    <Link href={`/orders-list?customerId=${rule.customerId}&department=${rule.departmentName}`}>
      <Card
        className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-purple-200"
        data-testid={`card-watch-rule-${rule.id}`}
      >
        <CardContent className="p-4 text-center">
          <Eye className="w-8 h-8 text-purple-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
            {displayLabel}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            {rule.customerName} → {rule.departmentName}
          </p>
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            {isLoading ? (
              <div className="text-sm text-gray-400">Loading...</div>
            ) : isError ? (
              <div className="text-sm text-red-500">Error loading count</div>
            ) : (
              <>
                <div className="text-2xl font-bold text-purple-600">{orderCount.count}</div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {orderCount.count === 1 ? 'order' : 'orders'}
                </p>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
