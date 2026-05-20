import { useMemo } from 'react';
import type { ComponentType } from 'react';
import {
  Factory,
  FileText,
  GraduationCap,
  Layers,
  Package,
  Scissors,
  Settings,
  Wrench,
} from 'lucide-react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';

import PipelineVisualization from '@/components/PipelineVisualization';
import MyTasksControlCenter from '@/components/MyTasksControlCenter';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { isOrderInDepartment } from '@/lib/departmentUtils';

interface ManufacturingOperationsDashboardProps {
  ownerName: string;
  hiddenNavHrefs?: string[];
  subtitle?: string;
}

interface DashboardNavCard {
  href: string;
  icon: ComponentType<{ className?: string }>;
  iconColor: string;
  hoverBorder: string;
  title: string;
  subtitle: string;
  badge: number | null;
  badgeColor?: string;
}

export default function ManufacturingOperationsDashboard({
  ownerName,
  hiddenNavHrefs = [],
  subtitle = 'Cutting Table, CNC & Gunsmith Operations',
}: ManufacturingOperationsDashboardProps) {
  const { data: currentUser } = useQuery<{
    id: number;
    username: string;
    role: string;
    employeeId?: number;
  }>({
    queryKey: ['currentUser'],
  });

  const { data: allOrders = [] } = useQuery<unknown[]>({
    queryKey: ['/api/orders/all'],
    refetchInterval: 60000,
  });

  const queueCounts = useMemo(() => {
    const cnc = allOrders.filter((order) =>
      isOrderInDepartment(order, 'CNC')
    ).length;
    const gunsmith = allOrders.filter((order) =>
      isOrderInDepartment(order, 'Gunsmith')
    ).length;
    return { cnc, gunsmith };
  }, [allOrders]);

  const navCards: DashboardNavCard[] = [
    {
      href: '/cutting-control-center/dashboard',
      icon: Scissors,
      iconColor: 'text-blue-600',
      hoverBorder: 'hover:border-blue-200',
      title: 'Cutting Operator',
      subtitle: 'Operator dashboard & job queue',
      badge: null,
    },
    {
      href: '/department-queue/cnc',
      icon: Settings,
      iconColor: 'text-yellow-600',
      hoverBorder: 'hover:border-yellow-200',
      title: 'CNC Queue',
      subtitle: 'CNC department orders',
      badge: queueCounts.cnc > 0 ? queueCounts.cnc : null,
      badgeColor: 'bg-yellow-100 text-yellow-800',
    },
    {
      href: '/department-queue/gunsmith',
      icon: Wrench,
      iconColor: 'text-red-600',
      hoverBorder: 'hover:border-red-200',
      title: 'Gunsmith Queue',
      subtitle: 'Gunsmith department orders',
      badge: queueCounts.gunsmith > 0 ? queueCounts.gunsmith : null,
      badgeColor: 'bg-red-100 text-red-800',
    },
    {
      href: '/fabric-inventory',
      icon: Layers,
      iconColor: 'text-indigo-600',
      hoverBorder: 'hover:border-indigo-200',
      title: 'Fabric Inventory',
      subtitle: 'Fabric rolls & stock levels',
      badge: null,
    },
    {
      href: '/all-orders',
      icon: FileText,
      iconColor: 'text-green-600',
      hoverBorder: 'hover:border-green-200',
      title: 'All Orders',
      subtitle: 'View all orders',
      badge: null,
    },
    {
      href: '/inventory/parts-request',
      icon: Package,
      iconColor: 'text-purple-600',
      hoverBorder: 'hover:border-purple-200',
      title: 'Request Parts',
      subtitle: 'Submit parts requests',
      badge: null,
    },
    {
      href: '/training',
      icon: GraduationCap,
      iconColor: 'text-teal-600',
      hoverBorder: 'hover:border-teal-200',
      title: 'Training Modules',
      subtitle: 'Complete training courses',
      badge: null,
    },
  ].filter((card) => !hiddenNavHrefs.includes(card.href));

  return (
    <div className="p-6 space-y-6 max-w-full mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {ownerName}'s Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {subtitle}
          </p>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          EPOCH v8 Manufacturing ERP
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {navCards.map((card) => (
          <Link key={card.href} href={card.href}>
            <Card
              className={`hover:shadow-lg transition-shadow cursor-pointer border-2 ${card.hoverBorder} h-full`}
            >
              <CardContent className="p-4 text-center">
                <div className="relative inline-block">
                  <card.icon
                    className={`w-8 h-8 ${card.iconColor} mx-auto mb-3`}
                  />
                  {card.badge !== null && (
                    <Badge
                      className={`absolute -top-2 -right-4 text-xs px-1.5 py-0.5 ${card.badgeColor}`}
                    >
                      {card.badge}
                    </Badge>
                  )}
                </div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {card.title}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {card.subtitle}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {currentUser?.employeeId && (
        <MyTasksControlCenter
          employeeId={currentUser.employeeId}
          userName={currentUser.username}
          compact={false}
        />
      )}

      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-lg">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
                <Factory className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <span>Production Pipeline Overview</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <PipelineVisualization />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
