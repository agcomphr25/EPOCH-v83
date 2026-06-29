import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Link } from 'wouter';
import { 
  FileText,
  Package,
  CheckCircle,
  Clock,
  AlertCircle,
  Layers,
  Factory,
  TrendingUp,
  FolderOpen,
  PlayCircle
} from 'lucide-react';
import { format } from 'date-fns';

interface P2StatusDashboardProps {
  onStartBOM: (poId: number) => void;
  onViewPO?: (poId: number) => void;
  selectedPOIds?: number[];
}

interface POStatus {
  id: number;
  poNumber: string;
  customerName: string;
  dueDate: string;
  totalItems: number;
  completedItems: number;
  scheduledItems: number;
  inProductionItems: number;
  scrappedItems?: number;
  pendingItems: number;
  hasBOMsNeeded: boolean;
  status: 'pending' | 'scheduled' | 'in_progress' | 'completed';
  rawStatus?: string;
  projectId?: string | null;
  projectCode?: string | null;
  projectName?: string | null;
  linkedWadCount?: number;
  approvedWadCount?: number;
  releasedWadCount?: number;
  wadNumbers?: string | null;
  p2WadConnectionStatus?: 'WAD_READY' | 'WAD_INCOMPLETE' | 'WAD_MISSING' | 'WAD_NOT_MATCHED' | 'NO_PROJECT_LINK';
  p2WadConnectionLabel?: string;
}

export default function P2StatusDashboard({ onStartBOM, onViewPO, selectedPOIds = [] }: P2StatusDashboardProps) {
  const [activeSortBy, setActiveSortBy] = useState<'default' | 'project_asc' | 'project_desc'>('default');

  const {
    data: poStatuses = [],
    error: poStatusesError,
    isError: isPOStatusesError,
    isLoading,
    refetch: refetchPOStatuses,
  } = useQuery<POStatus[]>({
    queryKey: ['/api/p2/control-center/po-statuses'],
  });

  const { data: recentActivity = [] } = useQuery<any[]>({
    queryKey: ['/api/p2/control-center/recent-activity'],
  });

  const filteredPOStatuses = selectedPOIds.length > 0
    ? poStatuses.filter((po) => selectedPOIds.includes(po.id))
    : poStatuses;

  const activePOs = filteredPOStatuses.filter((po) => po.status !== 'completed');
  const completedPOs = filteredPOStatuses.filter((po) => po.status === 'completed');
  const posNeedingBOMs = filteredPOStatuses.filter((po) => po.hasBOMsNeeded);

  const sortedActivePOs = [...activePOs].sort((a, b) => {
    if (activeSortBy === 'default') return 0;
    const aP = a.projectName || '';
    const bP = b.projectName || '';
    if (!aP && !bP) return 0;
    if (!aP) return 1;
    if (!bP) return -1;
    const cmp = aP.localeCompare(bP);
    return activeSortBy === 'project_asc' ? cmp : -cmp;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'in_progress':
        return <Factory className="h-4 w-4 text-blue-600" />;
      case 'scheduled':
        return <Clock className="h-4 w-4 text-green-600" />;
      default:
        return <Clock className="h-4 w-4 text-amber-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: 'default' | 'secondary' | 'outline'; label: string }> = {
      pending: { variant: 'outline', label: 'Pending' },
      scheduled: { variant: 'outline', label: 'Scheduled' },
      in_progress: { variant: 'default', label: 'In Progress' },
      completed: { variant: 'secondary', label: 'Completed' },
    };
    const c = config[status] || config.pending;
    return <Badge variant={c.variant}>{c.label}</Badge>;
  };

  const getReadyForProductionBadge = (po: POStatus) => {
    if (po.rawStatus === 'READY_FOR_PRODUCTION') {
      return (
        <Badge className="gap-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border border-green-300">
          <PlayCircle className="h-3 w-3" />
          Ready for Production
        </Badge>
      );
    }
    return null;
  };

  const getWadConnectionBadge = (po: POStatus) => {
    const status = po.p2WadConnectionStatus || (po.projectId ? 'WAD_MISSING' : 'NO_PROJECT_LINK');
    const config: Record<string, { className: string; label: string; title: string }> = {
      WAD_READY: {
        className: 'border-green-300 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300',
        label: po.p2WadConnectionLabel || 'WAD ready',
        title: po.wadNumbers ? `WAD: ${po.wadNumbers}` : 'Linked WAD is approved or released',
      },
      WAD_INCOMPLETE: {
        className: 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
        label: po.p2WadConnectionLabel || 'WAD incomplete',
        title: po.wadNumbers ? `WAD: ${po.wadNumbers}` : 'Linked project has WAD work that is not ready',
      },
      WAD_MISSING: {
        className: 'border-red-300 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
        label: po.p2WadConnectionLabel || 'WAD missing',
        title: 'Linked project has no visible WAD work order',
      },
      WAD_NOT_MATCHED: {
        className: 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
        label: po.p2WadConnectionLabel || 'WAD not matched',
        title: 'Linked project has WAD work, but not for this P2 line',
      },
      NO_PROJECT_LINK: {
        className: 'border-slate-300 bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-300',
        label: po.p2WadConnectionLabel || 'No project link',
        title: 'Assign a project to show WAD context',
      },
    };
    const badge = config[status] || config.WAD_MISSING;

    return (
      <Badge variant="outline" className={`gap-1 ${badge.className}`} title={badge.title}>
        <FileText className="h-3 w-3" />
        {badge.label}
      </Badge>
    );
  };

  const getProgressPercentage = (po: POStatus): number => {
    if (po.totalItems === 0) return 0;
    return Math.round((po.completedItems / po.totalItems) * 100);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Loading status dashboard...
        </CardContent>
      </Card>
    );
  }

  if (isPOStatusesError) {
    const message = poStatusesError instanceof Error
      ? poStatusesError.message
      : 'Failed to fetch PO statuses';

    return (
      <Card className="border-destructive/40">
        <CardContent className="py-12 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
          <p className="font-medium text-destructive">P2 order status could not be loaded</p>
          <p className="text-sm text-muted-foreground mt-2">{message}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => refetchPOStatuses()}
            data-testid="button-retry-p2-statuses"
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* BOMs Needed Alert */}
      {posNeedingBOMs.length > 0 && (
        <Card className="border-l-4 border-l-amber-500 bg-amber-50/50 dark:bg-amber-900/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <AlertCircle className="h-5 w-5" />
              BOMs Needed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {posNeedingBOMs.map((po) => (
                <div 
                  key={po.id} 
                  className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 rounded-lg border"
                >
                  <div>
                    <span className="font-medium">{po.poNumber}</span>
                    <span className="text-muted-foreground ml-2">- {po.customerName}</span>
                  </div>
                  <Button 
                    size="sm" 
                    onClick={() => onStartBOM(po.id)}
                    data-testid={`button-start-bom-${po.id}`}
                  >
                    <Layers className="h-4 w-4 mr-1" />
                    Configure BOMs
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Status Tabs */}
      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active" className="flex items-center gap-2">
            <Factory className="h-4 w-4" />
            Active ({activePOs.length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Completed ({completedPOs.length})
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Recent Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          {activePOs.length > 0 && (
            <div className="flex justify-end mb-3">
              <Select
                value={activeSortBy}
                onValueChange={(v) => setActiveSortBy(v as typeof activeSortBy)}
              >
                <SelectTrigger className="w-44" data-testid="select-active-sort-by">
                  <SelectValue placeholder="Sort by..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default Order</SelectItem>
                  <SelectItem value="project_asc">Project A→Z</SelectItem>
                  <SelectItem value="project_desc">Project Z→A</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {sortedActivePOs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No active P2 orders</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {sortedActivePOs.map((po) => (
                <Card key={po.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          {getStatusIcon(po.status)}
                          <span className="font-semibold text-lg">{po.poNumber}</span>
                          {getStatusBadge(po.status)}
                          {getReadyForProductionBadge(po)}
                          {getWadConnectionBadge(po)}
                          {po.hasBOMsNeeded && (
                            <Badge variant="destructive" className="gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Needs BOM
                            </Badge>
                          )}
                        </div>
                        <p className="text-muted-foreground mb-1">{po.customerName}</p>
                        {po.projectName && (
                          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mb-2">
                            <FolderOpen className="h-3 w-3" />
                            <span>Project: <span className="font-medium text-foreground">{po.projectName}</span></span>
                            {po.projectId && (
                              <>
                                <Link href={`/projects/${po.projectId}`}>
                                  <Button variant="link" size="sm" className="h-auto p-0 text-xs">
                                    {po.projectCode || 'Project Detail'}
                                  </Button>
                                </Link>
                                <Link href={`/pm-control-center?project=${po.projectId}`}>
                                  <Button variant="link" size="sm" className="h-auto p-0 text-xs">
                                    PM Control
                                  </Button>
                                </Link>
                              </>
                            )}
                          </div>
                        )}
                        
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span>Progress</span>
                            <span className="font-medium">
                              {po.completedItems} / {po.totalItems} items
                            </span>
                          </div>
                          <Progress value={getProgressPercentage(po)} className="h-2" />
                        </div>

                        <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Due: {po.dueDate ? format(new Date(po.dueDate), 'MMM d, yyyy') : 'Not set'}
                          </span>
                          {po.inProductionItems > 0 && (
                            <span className="flex items-center gap-1 text-blue-600">
                              <Factory className="h-3 w-3" />
                              {po.inProductionItems} in production
                            </span>
                          )}
                          {po.scheduledItems > 0 && (
                            <span className="flex items-center gap-1 text-green-600">
                              <Clock className="h-3 w-3" />
                              {po.scheduledItems} scheduled
                            </span>
                          )}
                          {(po.scrappedItems ?? 0) > 0 && (
                            <span className="flex items-center gap-1 text-red-600">
                              <AlertCircle className="h-3 w-3" />
                              {po.scrappedItems} scrapped
                            </span>
                          )}
                          {po.pendingItems > 0 && (
                            <span className="flex items-center gap-1 text-amber-600">
                              <Clock className="h-3 w-3" />
                              {po.pendingItems} pending
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        {po.projectId && (
                          <Link href={`/pm-control-center?project=${po.projectId}`}>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full"
                              data-testid={`button-pm-control-${po.id}`}
                            >
                              PM Control
                            </Button>
                          </Link>
                        )}
                        <Button 
                          size="sm" 
                          variant={po.hasBOMsNeeded ? "default" : "outline"}
                          onClick={() => onStartBOM(po.id)}
                          data-testid={`button-configure-bom-${po.id}`}
                        >
                          <Layers className="h-4 w-4 mr-1" />
                          {po.hasBOMsNeeded ? "Configure BOMs" : "View BOMs"}
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => onViewPO?.(po.id)}
                          data-testid={`button-view-po-${po.id}`}
                        >
                          View PO <FileText className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed">
          {completedPOs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No completed P2 orders yet</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO Number</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-center">Items</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completedPOs.map((po) => (
                    <TableRow key={po.id}>
                      <TableCell className="font-medium">{po.poNumber}</TableCell>
                      <TableCell>{po.customerName}</TableCell>
                      <TableCell className="text-center">{po.totalItems}</TableCell>
                      <TableCell>
                        {po.dueDate ? format(new Date(po.dueDate), 'MMM d, yyyy') : '-'}
                      </TableCell>
                      <TableCell>{getStatusBadge(po.status)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {po.projectId && (
                            <Link href={`/pm-control-center?project=${po.projectId}`}>
                              <Button
                                size="sm"
                                variant="outline"
                                data-testid={`button-pm-control-completed-${po.id}`}
                              >
                                PM Control
                              </Button>
                            </Link>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onViewPO?.(po.id)}
                            data-testid={`button-view-completed-po-${po.id}`}
                          >
                            View PO <FileText className="h-4 w-4 ml-1" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest updates across all P2 orders</CardDescription>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No recent activity
                </div>
              ) : (
                <div className="space-y-4">
                  {recentActivity.map((activity: any, idx: number) => (
                    <div 
                      key={idx}
                      className="flex items-start gap-3 p-3 rounded-lg border"
                    >
                      <div className={`p-2 rounded-full ${
                        activity.type === 'completed' 
                          ? 'bg-green-100 text-green-600' 
                          : activity.type === 'scheduled'
                          ? 'bg-blue-100 text-blue-600'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {activity.type === 'completed' ? (
                          <CheckCircle className="h-4 w-4" />
                        ) : activity.type === 'scheduled' ? (
                          <FileText className="h-4 w-4" />
                        ) : (
                          <Factory className="h-4 w-4" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{activity.message}</p>
                        <p className="text-sm text-muted-foreground">
                          {activity.timestamp 
                            ? format(new Date(activity.timestamp), 'MMM d, yyyy h:mm a')
                            : ''
                          }
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
