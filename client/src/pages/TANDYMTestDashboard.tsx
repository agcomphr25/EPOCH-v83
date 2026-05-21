import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, DollarSign, TrendingUp, CreditCard, Calendar, FolderKanban, ExternalLink, FileBarChart, Percent } from 'lucide-react';
import { Link } from 'wouter';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import MyTasksControlCenter from '@/components/MyTasksControlCenter';

interface ShippedOrderDiscount {
  orderId: string;
  discountType: string;
  discountAmount: number;
  orderTotal: number;
}

interface ProjectStep {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
}

interface Project {
  id: string;
  projectCode: string;
  projectName: string;
  status: string;
  currentStepType: string;
  steps?: ProjectStep[];
  customer?: {
    customerName: string;
  };
  projectManager?: {
    firstName: string;
    lastName: string;
  };
}

interface DashboardWidgetData {
  totalRevenue: number;
  averagePayment: number;
  prevMonthCCRevenue: number;
  lastYearCCRevenue: number;
  metadata: {
    currentMonth: number;
    currentYear: number;
    prevMonth: number;
    prevMonthYear: number;
    lastYearMonth: number;
    lastYear: number;
  };
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function TANDYMTestDashboard() {
  const { data: currentUser } = useQuery<{ id: number; username: string; role: string; employeeId?: number }>({
    queryKey: ['currentUser'],
  });
  const { data: resolvedEmployee } = useQuery<{ employeeId: number | null }>({
    queryKey: ['/api/timekeeping/my-employee-id'],
    enabled: !!currentUser && !currentUser.employeeId,
  });
  const dashboardEmployeeId = currentUser?.employeeId ?? resolvedEmployee?.employeeId ?? null;

  const { data, isLoading, error } = useQuery<DashboardWidgetData>({
    queryKey: ['/api/finance/dashboard-widgets'],
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
  });

  const { data: shippedDiscounts } = useQuery<ShippedOrderDiscount[]>({
    queryKey: ['/api/reports/shipped-orders-discounts'],
  });

  const activeProjects = projects?.filter(p => p.status === 'active') || [];
  const recentDiscounts = shippedDiscounts?.slice(0, 5) || [];
  const activeProjectsCount = activeProjects.length;

  const formatStepType = (stepType: string) => {
    const stepLabels: Record<string, string> = {
      rfq_risk_assessment: 'RFQ Risk Assessment',
      quote: 'Quote',
      purchase_review: 'Purchase Review',
      preproduction_checklist: 'Pre-production Checklist',
      p2_order: 'P2 Order',
    };
    return stepLabels[stepType] || stepType;
  };

  const getProgress = (steps?: ProjectStep[]) => {
    if (!steps?.length) return 0;
    const completed = steps.filter(s => s.status === 'completed').length;
    return Math.round((completed / steps.length) * 100);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <p className="text-red-600">Error loading dashboard data. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const prevMonthName = data ? MONTHS[data.metadata.prevMonth - 1] : '';
  const lastYearMonthName = data ? MONTHS[data.metadata.lastYearMonth - 1] : '';

  return (
    <div className="p-6 space-y-6" data-testid="tandym-dashboard">
      <h1 className="text-2xl font-bold" data-testid="page-title">Tandym Dashboard</h1>

      {dashboardEmployeeId && (
        <MyTasksControlCenter
          employeeId={dashboardEmployeeId}
          userName={currentUser?.username ?? 'tandym'}
          compact={false}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <HoverCard>
            <HoverCardTrigger asChild>
              <Card className="h-48 cursor-pointer hover:shadow-lg transition-shadow" data-testid="widget-gross-margin">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Percent className="h-5 w-5 text-emerald-600" />
                    Gross Margin
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-gray-400">--</p>
                  <p className="text-sm text-muted-foreground mt-2">Hover for discounts</p>
                </CardContent>
              </Card>
            </HoverCardTrigger>
            <HoverCardContent className="w-80" side="right">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Percent className="h-4 w-4" />
                  Recent Shipped Order Discounts
                </h4>
                {recentDiscounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recent discounts</p>
                ) : (
                  <ScrollArea className="h-32">
                    <div className="space-y-2">
                      {recentDiscounts.map((discount, idx) => (
                        <div key={idx} className="flex justify-between text-sm border-b pb-1">
                          <span className="font-medium">{discount.orderId}</span>
                          <span className="text-muted-foreground">
                            {discount.discountType}: {formatCurrency(discount.discountAmount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
                <Link href="/shipped-orders-discounts">
                  <span className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                    View All Discounts <ExternalLink className="h-3 w-3" />
                  </span>
                </Link>
              </div>
            </HoverCardContent>
          </HoverCard>

          <Card className="h-48" data-testid="widget-placeholder-2">
            <CardHeader>
              <CardTitle className="text-lg">Operating Cash Flow</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-gray-400">--</p>
              <p className="text-sm text-muted-foreground mt-2">Coming soon</p>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card className="h-auto min-h-48" data-testid="widget-active-projects">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FolderKanban className="h-5 w-5 text-indigo-600" />
                  Active Projects
                  <Badge variant="secondary" className="ml-2">{activeProjectsCount}</Badge>
                </CardTitle>
                <Link href="/projects" data-testid="link-view-all-projects">
                  <span className="text-sm text-indigo-600 hover:underline flex items-center gap-1">
                    View All <ExternalLink className="h-3 w-3" />
                  </span>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {activeProjectsCount === 0 ? (
                <p className="text-sm text-muted-foreground">No active projects</p>
              ) : (
                <ScrollArea className="h-48">
                  <Accordion type="single" collapsible className="w-full">
                    {activeProjects.map((project) => (
                      <AccordionItem key={project.id} value={project.id} data-testid={`accordion-project-${project.id}`}>
                        <AccordionTrigger className="text-sm hover:no-underline py-2">
                          <div className="flex items-center justify-between w-full pr-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{project.projectCode}</span>
                              <span className="text-muted-foreground">-</span>
                              <span>{project.projectName}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Progress value={getProgress(project.steps)} className="h-2 w-16" />
                              <span className="text-xs text-muted-foreground w-8">{getProgress(project.steps)}%</span>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3 pl-2 text-sm">
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Progress</span>
                                <span className="font-medium">{getProgress(project.steps)}%</span>
                              </div>
                              <Progress value={getProgress(project.steps)} className="h-2" />
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Customer:</span>
                              <span>{project.customer?.customerName || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Current Step:</span>
                              <Badge variant="outline">{formatStepType(project.currentStepType)}</Badge>
                            </div>
                            {project.projectManager && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Project Manager:</span>
                                <span>{project.projectManager.firstName} {project.projectManager.lastName}</span>
                              </div>
                            )}
                            <Link href={`/projects/${project.id}`}>
                              <span className="text-indigo-600 hover:underline text-xs flex items-center gap-1 mt-2">
                                View Details <ExternalLink className="h-3 w-3" />
                              </span>
                            </Link>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          <Link href="/gateway-reports" data-testid="link-gateway-reports">
            <Card className="h-48 cursor-pointer hover:shadow-lg transition-shadow" data-testid="widget-gateway-reports">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileBarChart className="h-5 w-5 text-blue-600" />
                  Gateway Reports
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">View payment gateway transaction reports and analytics</p>
                <span className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-4">
                  View Reports <ExternalLink className="h-3 w-3" />
                </span>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-2xl">
        <Link href="/payment-analytics" data-testid="link-total-revenue">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full" data-testid="widget-total-revenue">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-600" />
                Total Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">
                {data ? formatCurrency(data.totalRevenue) : '--'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Month to date</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/payment-analytics" data-testid="link-average-payment">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full" data-testid="widget-average-payment">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-600" />
                Average Payment
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-blue-600">
                {data ? formatCurrency(data.averagePayment) : '--'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Per transaction</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/payment-analytics" data-testid="link-prev-month-cc">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full" data-testid="widget-prev-month-cc">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-purple-600" />
                CC Revenue (Last Month)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-purple-600">
                {data ? formatCurrency(data.prevMonthCCRevenue) : '--'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {prevMonthName} {data?.metadata.prevMonthYear}
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/payment-analytics" data-testid="link-last-year-cc">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow h-full" data-testid="widget-last-year-cc">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4 text-orange-600" />
                CC Revenue (Same Month Last Year)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-orange-600">
                {data ? formatCurrency(data.lastYearCCRevenue) : '--'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {lastYearMonthName} {data?.metadata.lastYear}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
