import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'wouter';
import { Eye, Settings, Users, User, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface WatchRule {
  id: number;
  userId: string;
  customerId: string;
  customerName: string;
  departmentId: number | null;
  departmentName: string;
  label: string | null;
  trackedOrderIds: string[] | null;
  visibilityScope: string;
  visibilityEmployeeId: number | null;
  visibilityEmployeeIds: number[] | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface WatchRuleCardsProps {
  userId: string;
  employeeId?: number;
  showManageButton?: boolean;
}

export default function WatchRuleCards({ userId, employeeId, showManageButton = true }: WatchRuleCardsProps) {
  const queryParams = new URLSearchParams({ userId });
  if (employeeId) {
    queryParams.set('includeShared', 'true');
    queryParams.set('viewerEmployeeId', employeeId.toString());
  }
  
  const { data: watchRules = [], isLoading, isError } = useQuery<WatchRule[]>({
    queryKey: [`/api/watch-rules?${queryParams.toString()}`],
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
      {showManageButton && (
        <div className="flex justify-end">
          <Link href="/watch-rules">
            <Button variant="outline" size="sm" className="flex items-center gap-2" data-testid="button-manage-watch-rules">
              <Settings className="w-4 h-4" />
              Manage Watch Rules
            </Button>
          </Link>
        </div>
      )}
    </>
  );
}

function WatchRuleCard({ rule }: { rule: WatchRule }) {
  const { data: orderCount = { count: 0 }, isLoading, isError } = useQuery<{ count: number }>({
    queryKey: [`/api/watch-rules/${rule.id}/count`],
  });

  const displayLabel = rule.label || `${rule.customerName} - ${rule.departmentName}`;

  const getVisibilityInfo = () => {
    switch (rule.visibilityScope) {
      case 'EVERYONE':
        return { icon: Users, label: 'Everyone', color: 'bg-green-100 text-green-700' };
      case 'SPECIFIC_EMPLOYEES':
      case 'SPECIFIC_EMPLOYEE':
        const count = rule.visibilityEmployeeIds?.length || (rule.visibilityEmployeeId ? 1 : 0);
        return { icon: User, label: count > 0 ? `Shared (${count})` : 'Shared', color: 'bg-blue-100 text-blue-700' };
      case 'USER_ONLY':
      default:
        return { icon: Lock, label: 'Private', color: 'bg-gray-100 text-gray-700' };
    }
  };

  const visibility = getVisibilityInfo();
  const VisibilityIcon = visibility.icon;

  return (
    <Link href={`/orders-list?customerId=${rule.customerId}&department=${rule.departmentName}`}>
      <Card
        className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-purple-200"
        data-testid={`card-watch-rule-${rule.id}`}
      >
        <CardContent className="p-4 text-center relative">
          <div className="absolute top-2 right-2">
            <Badge className={`${visibility.color} text-xs flex items-center gap-1`}>
              <VisibilityIcon className="w-3 h-3" />
              {visibility.label}
            </Badge>
          </div>
          <Eye className="w-8 h-8 text-purple-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
            {displayLabel}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            {rule.customerName} → {rule.departmentName}
          </p>
          {rule.trackedOrderIds && rule.trackedOrderIds.length > 0 && (
            <Badge variant="outline" className="text-xs mb-2">
              Tracking {rule.trackedOrderIds.length} specific order{rule.trackedOrderIds.length !== 1 ? 's' : ''}
            </Badge>
          )}
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
