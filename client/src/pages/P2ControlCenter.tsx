import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Settings, 
  Calendar, 
  Factory, 
  BarChart3, 
  FileText,
  Package,
  CheckCircle,
  Clock,
  AlertCircle,
  ArrowRight,
  Layers,
  Route,
  Award,
  ClipboardList,
  ScrollText,
  Play,
  Eye,
  Plus,
  Ban,
  PenLine
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import P2POCreationWizard from '@/components/p2/P2POCreationWizard';
import P2BOMWizard from '@/components/p2/P2BOMWizard';
import P2ProductionScheduler from '@/components/p2/P2ProductionScheduler';
import P2StatusDashboard from '@/components/p2/P2StatusDashboard';
import P2ProductionQueue from '@/components/p2/P2ProductionQueue';
import P2CertificationsManager from './P2CertificationsManager';
import PartRoutingManagement from './PartRoutingManagement';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface P2Stats {
  openPOs: number;
  pendingBOMs: number;
  scheduledItems: number;
  inProduction: number;
  completedThisWeek: number;
  pendingQC: number;
  activeTravelers?: number;
}

interface Traveler {
  id: string;
  travelerNumber: string;
  partNumber: string;
  partName: string | null;
  workOrderId: string | null;
  status: string;
  quantity: number;
  routingName: string | null;
  routingRevision: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface PartRouting {
  id: string;
  partNumber: string;
  partName: string;
  routingName: string;
  routingRevision: number;
  isActive: boolean;
}

export default function P2ControlCenter() {
  const [activeTab, setActiveTab] = useState('status');
  const [showPOWizard, setShowPOWizard] = useState(false);
  const [showBOMWizard, setShowBOMWizard] = useState(false);
  const [selectedPOForBOM, setSelectedPOForBOM] = useState<number | null>(null);

  const { data: stats } = useQuery<P2Stats>({
    queryKey: ['/api/p2/control-center/stats'],
    refetchInterval: 30000,
  });

  const { data: pendingActions = [] } = useQuery<any[]>({
    queryKey: ['/api/p2/control-center/pending-actions'],
    refetchInterval: 30000,
  });

  const handlePOCreated = (poId: number) => {
    setShowPOWizard(false);
    setSelectedPOForBOM(poId);
    setShowBOMWizard(true);
  };

  const handleBOMComplete = () => {
    setShowBOMWizard(false);
    setSelectedPOForBOM(null);
    setActiveTab('schedule');
  };

  const getActionBadge = (type: string) => {
    const config: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof Clock }> = {
      'needs_bom': { variant: 'destructive', icon: AlertCircle },
      'needs_schedule': { variant: 'secondary', icon: Calendar },
      'in_production': { variant: 'default', icon: Factory },
      'pending_qc': { variant: 'outline', icon: CheckCircle },
    };
    const c = config[type] || { variant: 'secondary' as const, icon: Clock };
    return c;
  };

  if (showPOWizard) {
    return (
      <div className="container mx-auto p-6">
        <P2POCreationWizard 
          onComplete={handlePOCreated}
          onCancel={() => setShowPOWizard(false)}
        />
      </div>
    );
  }

  if (showBOMWizard && selectedPOForBOM) {
    return (
      <div className="container mx-auto p-6">
        <P2BOMWizard
          poId={selectedPOForBOM}
          onComplete={handleBOMComplete}
          onCancel={() => {
            setShowBOMWizard(false);
            setSelectedPOForBOM(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">P2 Control Center</h1>
          <p className="text-muted-foreground">
            Complete workflow management for P2 purchase orders
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/p2-forms">
            <Button variant="outline" data-testid="button-p2-forms">
              <ClipboardList className="h-4 w-4 mr-2" />
              P2 Forms
            </Button>
          </Link>
          <Button onClick={() => setShowPOWizard(true)} data-testid="button-new-po">
            <FileText className="h-4 w-4 mr-2" />
            New P2 Order
          </Button>
        </div>
      </div>

      {/* Workflow Progress Indicator */}
      <Card className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 border-none">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${(stats?.openPOs || 0) > 0 ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  <FileText className="h-4 w-4" />
                </div>
                <div className="text-sm">
                  <div className="font-medium">1. Create PO</div>
                  <div className="text-xs text-muted-foreground">{stats?.openPOs || 0} active</div>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${(stats?.pendingBOMs || 0) > 0 ? 'bg-amber-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  <Layers className="h-4 w-4" />
                </div>
                <div className="text-sm">
                  <div className="font-medium">2. Configure BOM</div>
                  <div className="text-xs text-muted-foreground">{stats?.pendingBOMs || 0} pending</div>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${(stats?.scheduledItems || 0) > 0 ? 'bg-purple-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  <Calendar className="h-4 w-4" />
                </div>
                <div className="text-sm">
                  <div className="font-medium">3. Schedule</div>
                  <div className="text-xs text-muted-foreground">{stats?.scheduledItems || 0} scheduled</div>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${(stats?.inProduction || 0) > 0 ? 'bg-green-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  <Factory className="h-4 w-4" />
                </div>
                <div className="text-sm">
                  <div className="font-medium">4. Production</div>
                  <div className="text-xs text-muted-foreground">{stats?.inProduction || 0} in progress</div>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${(stats?.completedThisWeek || 0) > 0 ? 'bg-emerald-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  <CheckCircle className="h-4 w-4" />
                </div>
                <div className="text-sm">
                  <div className="font-medium">5. Complete</div>
                  <div className="text-xs text-muted-foreground">{stats?.completedThisWeek || 0} this week</div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card className="cursor-pointer hover:bg-accent/50" onClick={() => setActiveTab('status')} data-testid="card-open-pos">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-muted-foreground">Open POs</span>
            </div>
            <div className="text-2xl font-bold mt-1">{stats?.openPOs || 0}</div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-accent/50" onClick={() => setActiveTab('setup')} data-testid="card-pending-boms">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-amber-600" />
              <span className="text-sm text-muted-foreground">Need BOMs</span>
            </div>
            <div className="text-2xl font-bold mt-1">{stats?.pendingBOMs || 0}</div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-accent/50" onClick={() => setActiveTab('schedule')} data-testid="card-scheduled">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-purple-600" />
              <span className="text-sm text-muted-foreground">Scheduled</span>
            </div>
            <div className="text-2xl font-bold mt-1">{stats?.scheduledItems || 0}</div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-accent/50" onClick={() => setActiveTab('production')} data-testid="card-in-production">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Factory className="h-4 w-4 text-green-600" />
              <span className="text-sm text-muted-foreground">In Production</span>
            </div>
            <div className="text-2xl font-bold mt-1">{stats?.inProduction || 0}</div>
          </CardContent>
        </Card>

        <Card data-testid="card-completed">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              <span className="text-sm text-muted-foreground">Done This Week</span>
            </div>
            <div className="text-2xl font-bold mt-1">{stats?.completedThisWeek || 0}</div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-accent/50" onClick={() => setActiveTab('production')} data-testid="card-pending-qc">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              <span className="text-sm text-muted-foreground">Pending QC</span>
            </div>
            <div className="text-2xl font-bold mt-1">{stats?.pendingQC || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* What's Next Panel */}
      {pendingActions.length > 0 && (
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <ArrowRight className="h-5 w-5" />
              What's Next
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {pendingActions.slice(0, 5).map((action, idx) => {
                const badgeConfig = getActionBadge(action.type);
                const Icon = badgeConfig.icon;
                return (
                  <Badge 
                    key={idx} 
                    variant={badgeConfig.variant}
                    className="cursor-pointer py-1.5 px-3"
                    onClick={() => {
                      if (action.type === 'needs_bom') {
                        setSelectedPOForBOM(action.poId);
                        setShowBOMWizard(true);
                      } else if (action.type === 'needs_schedule') {
                        setActiveTab('schedule');
                      }
                    }}
                  >
                    <Icon className="h-3 w-3 mr-1" />
                    {action.label}
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="status" className="flex items-center gap-2" data-testid="tab-status">
            <BarChart3 className="h-4 w-4" />
            Status
          </TabsTrigger>
          <TabsTrigger value="setup" className="flex items-center gap-2" data-testid="tab-setup">
            <Settings className="h-4 w-4" />
            Setup
          </TabsTrigger>
          <TabsTrigger value="schedule" className="flex items-center gap-2" data-testid="tab-schedule">
            <Calendar className="h-4 w-4" />
            Schedule
          </TabsTrigger>
          <TabsTrigger value="production" className="flex items-center gap-2" data-testid="tab-production">
            <Factory className="h-4 w-4" />
            Production
          </TabsTrigger>
          <TabsTrigger value="travelers" className="flex items-center gap-2" data-testid="tab-travelers">
            <ScrollText className="h-4 w-4" />
            Travelers
          </TabsTrigger>
          <TabsTrigger value="routing" className="flex items-center gap-2" data-testid="tab-routing">
            <Route className="h-4 w-4" />
            Routing
          </TabsTrigger>
          <TabsTrigger value="certifications" className="flex items-center gap-2" data-testid="tab-certifications">
            <Award className="h-4 w-4" />
            Certifications
          </TabsTrigger>
        </TabsList>

        <TabsContent value="status">
          <P2StatusDashboard 
            onStartBOM={(poId) => {
              setSelectedPOForBOM(poId);
              setShowBOMWizard(true);
            }} 
            onViewPO={(poId) => {
              setSelectedPOForBOM(poId);
              setActiveTab('schedule');
            }}
          />
        </TabsContent>

        <TabsContent value="setup">
          <Card>
            <CardHeader>
              <CardTitle>P2 Order Setup</CardTitle>
              <CardDescription>
                Create new P2 purchase orders and configure BOMs for production
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setShowPOWizard(true)}>
                  <CardContent className="p-6 flex items-center gap-4">
                    <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900">
                      <FileText className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Create New P2 Order</h3>
                      <p className="text-sm text-muted-foreground">
                        Step-by-step wizard for new customer orders
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setShowBOMWizard(true)}>
                  <CardContent className="p-6 flex items-center gap-4">
                    <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-900">
                      <Layers className="h-6 w-6 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Configure BOMs</h3>
                      <p className="text-sm text-muted-foreground">
                        Set up bill of materials for parts
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* List of POs needing BOMs */}
              <POsNeedingBOMs onSelectPO={(poId) => {
                setSelectedPOForBOM(poId);
                setShowBOMWizard(true);
              }} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule">
          <P2ProductionScheduler />
        </TabsContent>

        <TabsContent value="production">
          <P2ProductionQueue />
        </TabsContent>

        <TabsContent value="travelers">
          <P2TravelersTab />
        </TabsContent>

        <TabsContent value="routing">
          <PartRoutingManagement />
        </TabsContent>

        <TabsContent value="certifications">
          <P2CertificationsManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function POsNeedingBOMs({ onSelectPO }: { onSelectPO: (poId: number) => void }) {
  const { data: posNeedingBOMs = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/p2/control-center/pos-needing-boms'],
  });

  if (isLoading) {
    return <div className="text-center py-4 text-muted-foreground">Loading...</div>;
  }

  if (posNeedingBOMs.length === 0) {
    return (
      <div className="text-center py-8 border rounded-lg bg-muted/50">
        <CheckCircle className="h-8 w-8 mx-auto text-green-600 mb-2" />
        <p className="text-muted-foreground">All P2 orders have BOMs configured</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="font-medium">Orders Needing BOM Setup</h4>
      <div className="border rounded-lg divide-y">
        {posNeedingBOMs.map((po) => (
          <div 
            key={po.id} 
            className="p-3 flex items-center justify-between hover:bg-accent/50 cursor-pointer"
            onClick={() => onSelectPO(po.id)}
          >
            <div>
              <span className="font-medium">{po.poNumber}</span>
              <span className="text-muted-foreground ml-2">- {po.customerName}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{po.itemCount} items</Badge>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function P2TravelersTab() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedRoutingId, setSelectedRoutingId] = useState<string>('');
  const [workOrderId, setWorkOrderId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: travelers = [], isLoading: travelersLoading } = useQuery<Traveler[]>({
    queryKey: ['/api/travelers'],
    refetchInterval: 15000,
  });

  const { data: routings = [] } = useQuery<PartRouting[]>({
    queryKey: ['/api/part-routings'],
  });

  const activeRoutings = routings.filter(r => r.isActive);

  const generateTravelerMutation = useMutation({
    mutationFn: async (data: { routingId: string; workOrderId?: string; quantity?: number; createdBy: string }) => {
      return apiRequest(`/api/travelers/from-routing/${data.routingId}`, {
        method: 'POST',
        body: JSON.stringify({
          workOrderId: data.workOrderId,
          quantity: data.quantity,
          createdBy: data.createdBy,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/travelers'] });
      setShowCreateDialog(false);
      setSelectedRoutingId('');
      setWorkOrderId('');
      setQuantity(1);
      toast({
        title: 'Traveler Created',
        description: 'A new traveler has been generated from the routing.',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to create traveler',
      });
    },
  });

  const filteredTravelers = travelers.filter(t => {
    if (statusFilter === 'all') return true;
    return t.status === statusFilter;
  });

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
      DRAFT: { variant: 'outline' },
      IN_PROGRESS: { variant: 'default', className: 'bg-blue-600' },
      COMPLETED: { variant: 'default', className: 'bg-green-600' },
      BLOCKED: { variant: 'destructive' },
      CANCELED: { variant: 'secondary' },
    };
    const config = configs[status] || { variant: 'outline' };
    return (
      <Badge variant={config.variant} className={config.className}>
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const handleCreateTraveler = () => {
    if (!selectedRoutingId) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please select a routing',
      });
      return;
    }

    generateTravelerMutation.mutate({
      routingId: selectedRoutingId,
      workOrderId: workOrderId || undefined,
      quantity,
      createdBy: 'system',
    });
  };

  const travelerStats = {
    draft: travelers.filter(t => t.status === 'DRAFT').length,
    inProgress: travelers.filter(t => t.status === 'IN_PROGRESS').length,
    completed: travelers.filter(t => t.status === 'COMPLETED').length,
    blocked: travelers.filter(t => t.status === 'BLOCKED').length,
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ScrollText className="h-5 w-5" />
                Production Travelers
              </CardTitle>
              <CardDescription>
                AS9100-compliant digital travelers for tracking work through production
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-traveler">
              <Plus className="h-4 w-4 mr-2" />
              Generate Traveler
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <Card className="cursor-pointer hover:bg-accent/50" onClick={() => setStatusFilter('DRAFT')}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <PenLine className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-muted-foreground">Draft</span>
                </div>
                <div className="text-2xl font-bold mt-1">{travelerStats.draft}</div>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:bg-accent/50" onClick={() => setStatusFilter('IN_PROGRESS')}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Play className="h-4 w-4 text-blue-500" />
                  <span className="text-sm text-muted-foreground">In Progress</span>
                </div>
                <div className="text-2xl font-bold mt-1">{travelerStats.inProgress}</div>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:bg-accent/50" onClick={() => setStatusFilter('COMPLETED')}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-muted-foreground">Completed</span>
                </div>
                <div className="text-2xl font-bold mt-1">{travelerStats.completed}</div>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:bg-accent/50" onClick={() => setStatusFilter('BLOCKED')}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Ban className="h-4 w-4 text-red-500" />
                  <span className="text-sm text-muted-foreground">Blocked</span>
                </div>
                <div className="text-2xl font-bold mt-1">{travelerStats.blocked}</div>
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center gap-4 mb-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48" data-testid="select-status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="BLOCKED">Blocked</SelectItem>
                <SelectItem value="CANCELED">Canceled</SelectItem>
              </SelectContent>
            </Select>
            {statusFilter !== 'all' && (
              <Button variant="ghost" size="sm" onClick={() => setStatusFilter('all')}>
                Clear Filter
              </Button>
            )}
          </div>

          {travelersLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredTravelers.length === 0 ? (
            <div className="text-center py-12 border rounded-lg bg-muted/50">
              <ScrollText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-2">No Travelers Found</h3>
              <p className="text-muted-foreground mb-4">
                {statusFilter !== 'all' 
                  ? `No travelers with status "${statusFilter.replace('_', ' ')}" found.`
                  : 'Generate a traveler from a part routing to get started.'}
              </p>
              {statusFilter === 'all' && (
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Generate First Traveler
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Traveler #</TableHead>
                  <TableHead>Part Number</TableHead>
                  <TableHead>Work Order</TableHead>
                  <TableHead>Routing</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTravelers.map((traveler) => (
                  <TableRow key={traveler.id} data-testid={`row-traveler-${traveler.id}`}>
                    <TableCell className="font-mono font-medium">{traveler.travelerNumber}</TableCell>
                    <TableCell>
                      <div>
                        <span className="font-medium">{traveler.partNumber}</span>
                        {traveler.partName && (
                          <div className="text-xs text-muted-foreground">{traveler.partName}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{traveler.workOrderId || '-'}</TableCell>
                    <TableCell>
                      {traveler.routingName ? (
                        <div>
                          <span>{traveler.routingName}</span>
                          {traveler.routingRevision && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              Rev {traveler.routingRevision}
                            </Badge>
                          )}
                        </div>
                      ) : '-'}
                    </TableCell>
                    <TableCell>{traveler.quantity}</TableCell>
                    <TableCell>{getStatusBadge(traveler.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(traveler.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/travelers/${traveler.id}`)}
                          data-testid={`button-view-traveler-${traveler.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {(traveler.status === 'DRAFT' || traveler.status === 'IN_PROGRESS') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/travelers/${traveler.id}/execute`)}
                            data-testid={`button-execute-traveler-${traveler.id}`}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Traveler from Routing</DialogTitle>
            <DialogDescription>
              Select a part routing to generate a new production traveler with all steps, tasks, and traceability requirements.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="routing">Part Routing *</Label>
              <Select value={selectedRoutingId} onValueChange={setSelectedRoutingId}>
                <SelectTrigger data-testid="select-routing">
                  <SelectValue placeholder="Select a routing..." />
                </SelectTrigger>
                <SelectContent>
                  {activeRoutings.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground text-center">
                      No active routings available
                    </div>
                  ) : (
                    activeRoutings.map((routing) => (
                      <SelectItem key={routing.id} value={routing.id}>
                        {routing.partNumber} - {routing.partName}
                        {routing.routingRevision && ` (Rev ${routing.routingRevision})`}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="workOrderId">Work Order ID (Optional)</Label>
              <Input
                id="workOrderId"
                placeholder="e.g., WO-2024-001"
                value={workOrderId}
                onChange={(e) => setWorkOrderId(e.target.value)}
                data-testid="input-work-order"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                data-testid="input-quantity"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateTraveler}
              disabled={generateTravelerMutation.isPending || !selectedRoutingId}
              data-testid="button-confirm-create-traveler"
            >
              {generateTravelerMutation.isPending ? 'Generating...' : 'Generate Traveler'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
