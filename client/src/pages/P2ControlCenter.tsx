import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  PenLine,
  Users,
  Pencil,
  Trash2,
  Mail,
  Phone,
  Building,
  FolderOpen,
  FileWarning,
  Truck,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import P2POCreationWizard from '@/components/p2/P2POCreationWizard';
import P2BOMWizard from '@/components/p2/P2BOMWizard';
import P2ProductionScheduler from '@/components/p2/P2ProductionScheduler';
import P2StatusDashboard from '@/components/p2/P2StatusDashboard';
import P2ProductionQueue from '@/components/p2/P2ProductionQueue';
import P2CertificationsManager from './P2CertificationsManager';
import PartRoutingManagement from './PartRoutingManagement';
import RoutingDocumentManagement from './RoutingDocumentManagement';
import { P2POManager } from '@/components/P2POManager';
import { P2POItemsManager } from '@/components/P2POItemsManager';
import P2ChangesTab from '@/components/p2/P2ChangesTab';
import P2ShippingTab from '@/components/p2/P2ShippingTab';
import { TravelerCapturedDataById } from '@/components/p2/TravelerCapturedData';
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
  const [poItemsView, setPOItemsView] = useState<{ poId: number; poNumber: string } | null>(null);

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

  const getActionIcon = (type: string) => {
    const iconMap: Record<string, typeof Clock> = {
      'needs_bom': AlertCircle,
      'needs_schedule': Calendar,
      'in_production': Factory,
      'pending_qc': CheckCircle,
    };
    return iconMap[type] || Clock;
  };

  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'critical':
        return { 
          variant: 'destructive' as const, 
          className: 'bg-red-600 hover:bg-red-700 text-white border-red-600',
          indicator: '🔴'
        };
      case 'warning':
        return { 
          variant: 'default' as const, 
          className: 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500',
          indicator: '🟡'
        };
      case 'info':
      default:
        return { 
          variant: 'secondary' as const, 
          className: 'bg-green-100 hover:bg-green-200 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-100',
          indicator: '🟢'
        };
    }
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
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <ArrowRight className="h-5 w-5" />
                What's Next
              </CardTitle>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">🔴 Blocking</span>
                <span className="flex items-center gap-1">🟡 Due Soon</span>
                <span className="flex items-center gap-1">🟢 On Track</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {pendingActions.slice(0, 8).map((action, idx) => {
                const Icon = getActionIcon(action.type);
                const severityStyle = getSeverityStyle(action.severity || 'info');
                const daysText = action.daysUntilDue !== null && action.daysUntilDue !== undefined
                  ? action.daysUntilDue < 0 
                    ? `${Math.abs(action.daysUntilDue)}d overdue`
                    : action.daysUntilDue === 0 
                      ? 'Due today'
                      : `${action.daysUntilDue}d left`
                  : '';
                return (
                  <Badge 
                    key={idx} 
                    variant={severityStyle.variant}
                    className={`cursor-pointer py-1.5 px-3 ${severityStyle.className}`}
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
                    {daysText && <span className="ml-1 opacity-80">({daysText})</span>}
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-12">
          <TabsTrigger value="status" className="flex items-center gap-2" data-testid="tab-status">
            <BarChart3 className="h-4 w-4" />
            Status
          </TabsTrigger>
          <TabsTrigger value="customers" className="flex items-center gap-2" data-testid="tab-customers">
            <Users className="h-4 w-4" />
            Customers
          </TabsTrigger>
          <TabsTrigger value="pos" className="flex items-center gap-2" data-testid="tab-pos">
            <FileText className="h-4 w-4" />
            POs
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
          <TabsTrigger value="shipping" className="flex items-center gap-2" data-testid="tab-shipping">
            <Truck className="h-4 w-4" />
            Shipping
          </TabsTrigger>
          <TabsTrigger value="travelers" className="flex items-center gap-2" data-testid="tab-travelers">
            <ScrollText className="h-4 w-4" />
            Travelers
          </TabsTrigger>
          <TabsTrigger value="changes" className="flex items-center gap-2" data-testid="tab-changes">
            <FileWarning className="h-4 w-4" />
            Changes
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-2" data-testid="tab-documents">
            <FolderOpen className="h-4 w-4" />
            Docs
          </TabsTrigger>
          <TabsTrigger value="routing" className="flex items-center gap-2" data-testid="tab-routing">
            <Route className="h-4 w-4" />
            Routing
          </TabsTrigger>
          <TabsTrigger value="certifications" className="flex items-center gap-2" data-testid="tab-certifications">
            <Award className="h-4 w-4" />
            Certs
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

        <TabsContent value="customers">
          <P2CustomersTab />
        </TabsContent>

        <TabsContent value="pos">
          {poItemsView ? (
            <P2POItemsManager
              poId={poItemsView.poId}
              poNumber={poItemsView.poNumber}
              onBack={() => setPOItemsView(null)}
            />
          ) : (
            <P2POManager 
              onManageItems={(poId, poNumber) => setPOItemsView({ poId, poNumber })} 
            />
          )}
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

        <TabsContent value="shipping">
          <P2ShippingTab />
        </TabsContent>

        <TabsContent value="travelers">
          <P2TravelersTab />
        </TabsContent>

        <TabsContent value="changes">
          <P2ChangesTab />
        </TabsContent>

        <TabsContent value="documents">
          <RoutingDocumentManagement />
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
  const [expandedTravelerId, setExpandedTravelerId] = useState<string | null>(null);

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
                  <>
                    <TableRow
                      key={traveler.id}
                      data-testid={`row-traveler-${traveler.id}`}
                      className={`cursor-pointer ${expandedTravelerId === traveler.id ? 'bg-muted/50' : 'hover:bg-muted/30'}`}
                      onClick={() => setExpandedTravelerId(expandedTravelerId === traveler.id ? null : traveler.id)}
                    >
                      <TableCell className="font-mono font-medium">
                        <div className="flex items-center gap-2">
                          {expandedTravelerId === traveler.id ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          {traveler.travelerNumber}
                        </div>
                      </TableCell>
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
                            onClick={(e) => { e.stopPropagation(); navigate(`/travelers/${traveler.id}`); }}
                            data-testid={`button-view-traveler-${traveler.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {(traveler.status === 'DRAFT' || traveler.status === 'IN_PROGRESS') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); navigate(`/travelers/${traveler.id}/execute`); }}
                              data-testid={`button-execute-traveler-${traveler.id}`}
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedTravelerId === traveler.id && (
                      <TableRow key={`${traveler.id}-details`}>
                        <TableCell colSpan={8} className="p-0 border-b-2 border-primary/20">
                          <div className="bg-muted/20 p-4">
                            <TravelerCapturedDataById travelerId={traveler.id} />
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
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

interface P2Customer {
  id: number;
  customerId: string;
  customerName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  billingAddress: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingZip: string | null;
  shippingAddress: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingZip: string | null;
  shipToAddress: string | null;
  paymentTerms: string;
  status: string;
  notes: string | null;
  rfqPrefix: string | null;
  rfqSequences: Record<string, number> | null;
  createdAt: string;
  updatedAt: string;
}

interface P2CustomerContact {
  id: number;
  customerId: number;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
}

function P2CustomersTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<P2Customer | null>(null);
  const [editTab, setEditTab] = useState<'details' | 'contacts'>('details');
  const [showAddContactDialog, setShowAddContactDialog] = useState(false);
  const [editingContact, setEditingContact] = useState<P2CustomerContact | null>(null);
  const [contactFormData, setContactFormData] = useState({
    name: '',
    title: '',
    email: '',
    phone: '',
    isPrimary: false,
  });
  const [formData, setFormData] = useState({
    customerId: '',
    customerName: '',
    contactEmail: '',
    contactPhone: '',
    billingAddress: '',
    billingCity: '',
    billingState: '',
    billingZip: '',
    shippingAddress: '',
    shippingCity: '',
    shippingState: '',
    shippingZip: '',
    shipToAddress: '',
    paymentTerms: 'NET_30',
    status: 'ACTIVE',
    notes: '',
    rfqPrefix: '',
  });

  const { data: customers = [], isLoading } = useQuery<P2Customer[]>({
    queryKey: ['/api/p2-customers-bypass'],
    refetchInterval: 30000,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest('/api/p2/customers', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/p2-customers-bypass'] });
      setShowAddDialog(false);
      resetForm();
      toast({ title: 'Customer created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create customer', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof formData }) => {
      return apiRequest(`/api/p2/customers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/p2-customers-bypass'] });
      setShowEditDialog(false);
      setSelectedCustomer(null);
      resetForm();
      toast({ title: 'Customer updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update customer', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/p2/customers/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/p2-customers-bypass'] });
      toast({ title: 'Customer deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete customer', description: error.message, variant: 'destructive' });
    },
  });

  const { data: contacts = [], refetch: refetchContacts } = useQuery<P2CustomerContact[]>({
    queryKey: ['/api/p2/customers', selectedCustomer?.id, 'contacts'],
    queryFn: async () => {
      if (!selectedCustomer?.id) return [];
      const response = await fetch(`/api/p2/customers/${selectedCustomer.id}/contacts`);
      if (!response.ok) throw new Error('Failed to fetch contacts');
      return response.json();
    },
    enabled: !!selectedCustomer?.id && showEditDialog && editTab === 'contacts',
  });

  const createContactMutation = useMutation({
    mutationFn: async (data: typeof contactFormData & { customerId: number }) => {
      return apiRequest(`/api/p2/customers/${data.customerId}/contacts`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      refetchContacts();
      setShowAddContactDialog(false);
      resetContactForm();
      toast({ title: 'Contact added successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to add contact', description: error.message, variant: 'destructive' });
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof contactFormData }) => {
      return apiRequest(`/api/p2/customers/${selectedCustomer?.id}/contacts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      refetchContacts();
      setEditingContact(null);
      resetContactForm();
      toast({ title: 'Contact updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update contact', description: error.message, variant: 'destructive' });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/p2/customers/${selectedCustomer?.id}/contacts/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      refetchContacts();
      toast({ title: 'Contact deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete contact', description: error.message, variant: 'destructive' });
    },
  });

  const resetContactForm = () => {
    setContactFormData({
      name: '',
      title: '',
      email: '',
      phone: '',
      isPrimary: false,
    });
  };

  const resetForm = () => {
    setFormData({
      customerId: '',
      customerName: '',
      contactEmail: '',
      contactPhone: '',
      billingAddress: '',
      billingCity: '',
      billingState: '',
      billingZip: '',
      shippingAddress: '',
      shippingCity: '',
      shippingState: '',
      shippingZip: '',
      shipToAddress: '',
      paymentTerms: 'NET_30',
      status: 'ACTIVE',
      notes: '',
      rfqPrefix: '',
    });
  };

  const openEditDialog = (customer: P2Customer) => {
    setSelectedCustomer(customer);
    setEditTab('details');
    setFormData({
      customerId: customer.customerId,
      customerName: customer.customerName,
      contactEmail: customer.contactEmail || '',
      contactPhone: customer.contactPhone || '',
      billingAddress: customer.billingAddress || '',
      billingCity: customer.billingCity || '',
      billingState: customer.billingState || '',
      billingZip: customer.billingZip || '',
      shippingAddress: customer.shippingAddress || '',
      shippingCity: customer.shippingCity || '',
      shippingState: customer.shippingState || '',
      shippingZip: customer.shippingZip || '',
      shipToAddress: customer.shipToAddress || '',
      paymentTerms: customer.paymentTerms || 'NET_30',
      status: customer.status,
      notes: customer.notes || '',
      rfqPrefix: customer.rfqPrefix || '',
    });
    setShowEditDialog(true);
  };

  const handleSubmit = () => {
    if (!formData.customerId || !formData.customerName) {
      toast({ title: 'Customer ID and Name are required', variant: 'destructive' });
      return;
    }
    createMutation.mutate(formData);
  };

  const handleUpdate = () => {
    if (!selectedCustomer) return;
    updateMutation.mutate({ id: selectedCustomer.id, data: formData });
  };

  const handleDelete = (customer: P2Customer) => {
    if (confirm(`Are you sure you want to delete ${customer.customerName}?`)) {
      deleteMutation.mutate(customer.id);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>P2 Customers</CardTitle>
            <CardDescription>
              Manage customers for P2 purchase orders and RFQ tracking
            </CardDescription>
          </div>
          <Button onClick={() => { resetForm(); setShowAddDialog(true); }} data-testid="button-add-p2-customer">
            <Plus className="h-4 w-4 mr-2" />
            Add Customer
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : customers.length === 0 ? (
          <div className="text-center py-8 border rounded-lg bg-muted/50">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No P2 customers yet</p>
            <p className="text-sm text-muted-foreground mt-1">Add your first P2 customer to get started</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-mono text-sm">{customer.customerId}</TableCell>
                  <TableCell className="font-medium">{customer.customerName}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-sm">
                      {customer.contactEmail && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {customer.contactEmail}
                        </div>
                      )}
                      {customer.contactPhone && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {customer.contactPhone}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={customer.status === 'ACTIVE' ? 'default' : 'secondary'}>
                      {customer.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => openEditDialog(customer)}
                        data-testid={`button-edit-customer-${customer.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleDelete(customer)}
                        className="text-red-600 hover:text-red-700"
                        data-testid={`button-delete-customer-${customer.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add P2 Customer</DialogTitle>
            <DialogDescription>
              Create a new customer for P2 purchase orders
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4 overflow-y-auto flex-1 pr-2">
            <div className="space-y-2">
              <Label htmlFor="customerId">Customer ID *</Label>
              <Input
                id="customerId"
                placeholder="e.g., STRATA-G"
                value={formData.customerId}
                onChange={(e) => setFormData({ ...formData, customerId: e.target.value.toUpperCase() })}
                data-testid="input-customer-id"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerName">Customer Name *</Label>
              <Input
                id="customerName"
                placeholder="e.g., Strata-G Solutions"
                value={formData.customerName}
                onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                data-testid="input-customer-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactEmail">Contact Email</Label>
              <Input
                id="contactEmail"
                type="email"
                placeholder="contact@example.com"
                value={formData.contactEmail}
                onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                data-testid="input-contact-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactPhone">Contact Phone</Label>
              <Input
                id="contactPhone"
                placeholder="(555) 123-4567"
                value={formData.contactPhone}
                onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                data-testid="input-contact-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rfqPrefix">RFQ Prefix (3 letters)</Label>
              <Input
                id="rfqPrefix"
                placeholder="e.g., STR"
                maxLength={3}
                value={formData.rfqPrefix}
                onChange={(e) => setFormData({ ...formData, rfqPrefix: e.target.value.toUpperCase() })}
                data-testid="input-rfq-prefix"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentTerms">Payment Terms</Label>
              <Select value={formData.paymentTerms} onValueChange={(v) => setFormData({ ...formData, paymentTerms: v })}>
                <SelectTrigger data-testid="select-payment-terms">
                  <SelectValue placeholder="Select terms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NET_15">Net 15</SelectItem>
                  <SelectItem value="NET_30">Net 30</SelectItem>
                  <SelectItem value="NET_45">Net 45</SelectItem>
                  <SelectItem value="NET_60">Net 60</SelectItem>
                  <SelectItem value="DUE_ON_RECEIPT">Due on Receipt</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 border-t pt-4 mt-2">
              <Label className="text-base font-medium">Billing Address</Label>
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="billingAddress">Street Address</Label>
              <Input
                id="billingAddress"
                placeholder="123 Main St"
                value={formData.billingAddress}
                onChange={(e) => setFormData({ ...formData, billingAddress: e.target.value })}
                data-testid="input-billing-address"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="billingCity">City</Label>
              <Input
                id="billingCity"
                placeholder="City"
                value={formData.billingCity}
                onChange={(e) => setFormData({ ...formData, billingCity: e.target.value })}
                data-testid="input-billing-city"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="billingState">State</Label>
                <Input
                  id="billingState"
                  placeholder="State"
                  value={formData.billingState}
                  onChange={(e) => setFormData({ ...formData, billingState: e.target.value })}
                  data-testid="input-billing-state"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billingZip">ZIP</Label>
                <Input
                  id="billingZip"
                  placeholder="ZIP"
                  value={formData.billingZip}
                  onChange={(e) => setFormData({ ...formData, billingZip: e.target.value })}
                  data-testid="input-billing-zip"
                />
              </div>
            </div>
            <div className="col-span-2 border-t pt-4 mt-2">
              <Label className="text-base font-medium">Shipping Address</Label>
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="shippingAddress">Street Address</Label>
              <Input
                id="shippingAddress"
                placeholder="456 Warehouse Rd"
                value={formData.shippingAddress}
                onChange={(e) => setFormData({ ...formData, shippingAddress: e.target.value })}
                data-testid="input-shipping-address"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shippingCity">City</Label>
              <Input
                id="shippingCity"
                placeholder="City"
                value={formData.shippingCity}
                onChange={(e) => setFormData({ ...formData, shippingCity: e.target.value })}
                data-testid="input-shipping-city"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="shippingState">State</Label>
                <Input
                  id="shippingState"
                  placeholder="State"
                  value={formData.shippingState}
                  onChange={(e) => setFormData({ ...formData, shippingState: e.target.value })}
                  data-testid="input-shipping-state"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shippingZip">ZIP</Label>
                <Input
                  id="shippingZip"
                  placeholder="ZIP"
                  value={formData.shippingZip}
                  onChange={(e) => setFormData({ ...formData, shippingZip: e.target.value })}
                  data-testid="input-shipping-zip"
                />
              </div>
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                placeholder="Any additional notes..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                data-testid="input-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleSubmit} 
              disabled={createMutation.isPending}
              data-testid="button-save-customer"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Customer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit P2 Customer: {selectedCustomer?.customerName}</DialogTitle>
            <DialogDescription>
              Update customer details or manage additional contacts
            </DialogDescription>
          </DialogHeader>
          
          <Tabs value={editTab} onValueChange={(v) => setEditTab(v as 'details' | 'contacts')} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">Customer Details</TabsTrigger>
              <TabsTrigger value="contacts">Additional Contacts</TabsTrigger>
            </TabsList>
            
            <TabsContent value="details" className="mt-4">
              <div className="grid grid-cols-2 gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-customerId">Customer ID</Label>
                  <Input
                    id="edit-customerId"
                    value={formData.customerId}
                    disabled
                    className="bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-customerName">Customer Name *</Label>
                  <Input
                    id="edit-customerName"
                    value={formData.customerName}
                    onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                    data-testid="input-edit-customer-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-contactEmail">Contact Email</Label>
                  <Input
                    id="edit-contactEmail"
                    type="email"
                    value={formData.contactEmail}
                    onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                    data-testid="input-edit-contact-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-contactPhone">Contact Phone</Label>
                  <Input
                    id="edit-contactPhone"
                    value={formData.contactPhone}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                    data-testid="input-edit-contact-phone"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-rfqPrefix">RFQ Prefix (3 letters)</Label>
                  <Input
                    id="edit-rfqPrefix"
                    maxLength={3}
                    value={formData.rfqPrefix}
                    onChange={(e) => setFormData({ ...formData, rfqPrefix: e.target.value.toUpperCase() })}
                    data-testid="input-edit-rfq-prefix"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-paymentTerms">Payment Terms</Label>
                  <Select value={formData.paymentTerms} onValueChange={(v) => setFormData({ ...formData, paymentTerms: v })}>
                    <SelectTrigger data-testid="select-edit-payment-terms">
                      <SelectValue placeholder="Select terms" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NET_15">Net 15</SelectItem>
                      <SelectItem value="NET_30">Net 30</SelectItem>
                      <SelectItem value="NET_45">Net 45</SelectItem>
                      <SelectItem value="NET_60">Net 60</SelectItem>
                      <SelectItem value="DUE_ON_RECEIPT">Due on Receipt</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-status">Status</Label>
                  <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                    <SelectTrigger data-testid="select-edit-status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="INACTIVE">Inactive</SelectItem>
                      <SelectItem value="SUSPENDED">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 border-t pt-4 mt-2">
                  <Label className="text-base font-medium">Billing Address</Label>
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="edit-billingAddress">Street Address</Label>
                  <Input
                    id="edit-billingAddress"
                    value={formData.billingAddress}
                    onChange={(e) => setFormData({ ...formData, billingAddress: e.target.value })}
                    data-testid="input-edit-billing-address"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-billingCity">City</Label>
                  <Input
                    id="edit-billingCity"
                    value={formData.billingCity}
                    onChange={(e) => setFormData({ ...formData, billingCity: e.target.value })}
                    data-testid="input-edit-billing-city"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-billingState">State</Label>
                    <Input
                      id="edit-billingState"
                      value={formData.billingState}
                      onChange={(e) => setFormData({ ...formData, billingState: e.target.value })}
                      data-testid="input-edit-billing-state"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-billingZip">ZIP</Label>
                    <Input
                      id="edit-billingZip"
                      value={formData.billingZip}
                      onChange={(e) => setFormData({ ...formData, billingZip: e.target.value })}
                      data-testid="input-edit-billing-zip"
                    />
                  </div>
                </div>
                <div className="col-span-2 border-t pt-4 mt-2">
                  <Label className="text-base font-medium">Shipping Address</Label>
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="edit-shippingAddress">Street Address</Label>
                  <Input
                    id="edit-shippingAddress"
                    value={formData.shippingAddress}
                    onChange={(e) => setFormData({ ...formData, shippingAddress: e.target.value })}
                    data-testid="input-edit-shipping-address"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-shippingCity">City</Label>
                  <Input
                    id="edit-shippingCity"
                    value={formData.shippingCity}
                    onChange={(e) => setFormData({ ...formData, shippingCity: e.target.value })}
                    data-testid="input-edit-shipping-city"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-shippingState">State</Label>
                    <Input
                      id="edit-shippingState"
                      value={formData.shippingState}
                      onChange={(e) => setFormData({ ...formData, shippingState: e.target.value })}
                      data-testid="input-edit-shipping-state"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-shippingZip">ZIP</Label>
                    <Input
                      id="edit-shippingZip"
                      value={formData.shippingZip}
                      onChange={(e) => setFormData({ ...formData, shippingZip: e.target.value })}
                      data-testid="input-edit-shipping-zip"
                    />
                  </div>
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="edit-notes">Notes</Label>
                  <Input
                    id="edit-notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    data-testid="input-edit-notes"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
                <Button 
                  onClick={handleUpdate} 
                  disabled={updateMutation.isPending}
                  data-testid="button-update-customer"
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </TabsContent>

            <TabsContent value="contacts" className="mt-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Manage additional contacts for this customer
                  </p>
                  <Button 
                    size="sm" 
                    onClick={() => { resetContactForm(); setShowAddContactDialog(true); }}
                    data-testid="button-add-contact"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Contact
                  </Button>
                </div>
                
                {contacts.length === 0 ? (
                  <div className="text-center py-8 border rounded-lg bg-muted/50">
                    <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No additional contacts</p>
                    <p className="text-sm text-muted-foreground">Add contacts to track multiple points of communication</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contacts.map((contact) => (
                        <TableRow key={contact.id}>
                          <TableCell className="font-medium">
                            {contact.name}
                            {contact.isPrimary && (
                              <Badge variant="secondary" className="ml-2 text-xs">Primary</Badge>
                            )}
                          </TableCell>
                          <TableCell>{contact.title || '-'}</TableCell>
                          <TableCell>
                            {contact.email ? (
                              <div className="flex items-center gap-1 text-sm">
                                <Mail className="h-3 w-3" />
                                {contact.email}
                              </div>
                            ) : '-'}
                          </TableCell>
                          <TableCell>
                            {contact.phone ? (
                              <div className="flex items-center gap-1 text-sm">
                                <Phone className="h-3 w-3" />
                                {contact.phone}
                              </div>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingContact(contact);
                                  setContactFormData({
                                    name: contact.name,
                                    title: contact.title || '',
                                    email: contact.email || '',
                                    phone: contact.phone || '',
                                    isPrimary: contact.isPrimary,
                                  });
                                }}
                                data-testid={`button-edit-contact-${contact.id}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => {
                                  if (confirm(`Delete contact ${contact.name}?`)) {
                                    deleteContactMutation.mutate(contact.id);
                                  }
                                }}
                                data-testid={`button-delete-contact-${contact.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setShowEditDialog(false)}>Close</Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddContactDialog} onOpenChange={setShowAddContactDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Contact</DialogTitle>
            <DialogDescription>Add a new contact for {selectedCustomer?.customerName}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="contact-name">Name *</Label>
              <Input
                id="contact-name"
                value={contactFormData.name}
                onChange={(e) => setContactFormData({ ...contactFormData, name: e.target.value })}
                data-testid="input-contact-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-title">Title</Label>
              <Input
                id="contact-title"
                placeholder="e.g., Purchasing Manager"
                value={contactFormData.title}
                onChange={(e) => setContactFormData({ ...contactFormData, title: e.target.value })}
                data-testid="input-contact-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-email">Email</Label>
              <Input
                id="contact-email"
                type="email"
                value={contactFormData.email}
                onChange={(e) => setContactFormData({ ...contactFormData, email: e.target.value })}
                data-testid="input-contact-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-phone">Phone</Label>
              <Input
                id="contact-phone"
                value={contactFormData.phone}
                onChange={(e) => setContactFormData({ ...contactFormData, phone: e.target.value })}
                data-testid="input-contact-phone"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddContactDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!contactFormData.name || !selectedCustomer) return;
                createContactMutation.mutate({ ...contactFormData, customerId: selectedCustomer.id });
              }}
              disabled={createContactMutation.isPending || !contactFormData.name}
              data-testid="button-save-contact"
            >
              {createContactMutation.isPending ? 'Adding...' : 'Add Contact'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingContact} onOpenChange={(open) => !open && setEditingContact(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Contact</DialogTitle>
            <DialogDescription>Update contact information</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-contact-name">Name *</Label>
              <Input
                id="edit-contact-name"
                value={contactFormData.name}
                onChange={(e) => setContactFormData({ ...contactFormData, name: e.target.value })}
                data-testid="input-edit-contact-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-contact-title">Title</Label>
              <Input
                id="edit-contact-title"
                value={contactFormData.title}
                onChange={(e) => setContactFormData({ ...contactFormData, title: e.target.value })}
                data-testid="input-edit-contact-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-contact-email">Email</Label>
              <Input
                id="edit-contact-email"
                type="email"
                value={contactFormData.email}
                onChange={(e) => setContactFormData({ ...contactFormData, email: e.target.value })}
                data-testid="input-edit-contact-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-contact-phone">Phone</Label>
              <Input
                id="edit-contact-phone"
                value={contactFormData.phone}
                onChange={(e) => setContactFormData({ ...contactFormData, phone: e.target.value })}
                data-testid="input-edit-contact-phone"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingContact(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!editingContact || !contactFormData.name) return;
                updateContactMutation.mutate({ id: editingContact.id, data: contactFormData });
              }}
              disabled={updateContactMutation.isPending || !contactFormData.name}
              data-testid="button-update-contact"
            >
              {updateContactMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
