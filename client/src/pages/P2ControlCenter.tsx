import { useState, useEffect, useMemo } from 'react';
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
  PenLine,
  XCircle,
  FolderOpen,
  FileWarning,
  Truck,
  ChevronDown,
  ChevronRight,
  Filter,
  X,
  Lock,
  GitBranch,
  ShieldCheck
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import P2POCreationWizard from '@/components/p2/P2POCreationWizard';
import P2BOMWizard from '@/components/p2/P2BOMWizard';
import P2ProductionScheduler from '@/components/p2/P2ProductionScheduler';
import P2StatusDashboard from '@/components/p2/P2StatusDashboard';
import P2ProductionQueue from '@/components/p2/P2ProductionQueue';
import CertificationAuthorizationMatrix from './CertificationAuthorizationMatrix';
import PartRoutingManagement from './PartRoutingManagement';
import RoutingDocumentManagement from './RoutingDocumentManagement';
import P2ChangesTab from '@/components/p2/P2ChangesTab';
import P2ShippingTab from '@/components/p2/P2ShippingTab';
import P2NonconformingTab from '@/components/p2/P2ScrappedItemsTab';
import { P2POItemsManager } from '@/components/P2POItemsManager';
import { TravelerCapturedDataById } from '@/components/p2/TravelerCapturedData';
import ProgramManufacturingOrchestration from '@/components/p2/ProgramManufacturingOrchestration';
import P2FrozenProductionDemand from '@/components/p2/P2FrozenProductionDemand';
import P2GenealogyViewer from '@/components/p2/P2GenealogyViewer';
import P2ActivationReadiness from '@/components/p2/P2ActivationReadiness';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';

interface P2Stats {
  openPOs: number;
  pendingBOMs: number;
  scheduledItems: number;
  inProduction: number;
  completedThisWeek: number;
  pendingQC: number;
  activeTravelers?: number;
}

interface P2LedgerStatus {
  id: number;
  poNumber: string;
  customerName: string;
  status: string;
  projectId: string | null;
  projectCode?: string | null;
  projectName?: string | null;
  scheduledItems: number;
  inProductionItems: number;
}

interface Traveler {
  id: string;
  travelerNumber: string;
  partNumber: string;
  partName: string | null;
  workOrderId: string | null;
  lotNumber: string | null;
  serialNumber: string | null;
  status: string;
  quantity: number;
  routingName: string | null;
  routingRevision: string | null;
  partRoutingId: string | null;
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
  const genealogyEnabled = import.meta.env.VITE_P2_GENEALOGY_VIEWER_ENABLED === 'true';
  const activationReadinessEnabled =
    import.meta.env.VITE_P2_CONTROLLED_ACTIVATION_READINESS_ENABLED === 'true';
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const urlParams = new URLSearchParams(window.location.search);
  const tabFromUrl = urlParams.get('tab');
  const poFromUrl = urlParams.get('po') || undefined;
  const poIdFromUrl = urlParams.get('poId') ? Number(urlParams.get('poId')) : null;
  const editPoIdFromUrl = urlParams.get('editPoId') ? Number(urlParams.get('editPoId')) : null;
  const unitsFromUrl = urlParams.get('units') || undefined;
  // Project context: passed from PM/WAD project workflow cards
  const wadProjectId = urlParams.get('projectId') || '';
  const wadProjectName = urlParams.get('projectName') || '';
  const wadPoId = urlParams.get('poId') || '';
  type ProductionMapView = 'overview' | 'tree' | 'swimlane';
  const resolveProductionMapView = (tab: string | null): ProductionMapView => {
    if (tab === 'assembly-tree') return 'tree';
    if (tab === 'swimlane') return 'swimlane';
    return 'overview';
  };
  const resolveControlCenterTab = (tab: string | null) => {
    if (tab === 'pos' || tab === 'customers') return 'status';
    if (tab === 'program' || tab === 'assembly-tree' || tab === 'swimlane') return 'production-map';
    return tab || 'status';
  };
  const [activeTab, setActiveTab] = useState(resolveControlCenterTab(tabFromUrl));
  const [productionMapView, setProductionMapView] = useState<ProductionMapView>(resolveProductionMapView(tabFromUrl));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab) {
      setActiveTab(resolveControlCenterTab(tab));
      if (tab === 'program' || tab === 'assembly-tree' || tab === 'swimlane') {
        setProductionMapView(resolveProductionMapView(tab));
      }
    }
  }, [location]);

  const [showPOWizard, setShowPOWizard] = useState(false);
  const [showBOMWizard, setShowBOMWizard] = useState(false);
  const [selectedPOForBOM, setSelectedPOForBOM] = useState<number | null>(null);
  const [selectedPOIds, setSelectedPOIds] = useState<number[]>([]);
  const [editingPOId, setEditingPOId] = useState<number | null>(editPoIdFromUrl);
  const [lineItemCorrection, setLineItemCorrection] = useState<{ poId: number; poNumber: string } | null>(null);
  const [pendingLineItemCorrection, setPendingLineItemCorrection] = useState<{ poId: number; poNumber: string } | null>(null);
  const [lineItemCorrectionReason, setLineItemCorrectionReason] = useState('');

  const { data: stats } = useQuery<P2Stats>({
    queryKey: ['/api/p2/control-center/stats'],
    refetchInterval: 30000,
  });

  const { data: pendingActions = [] } = useQuery<any[]>({
    queryKey: ['/api/p2/control-center/pending-actions'],
    refetchInterval: 30000,
  });

  const { data: pipelineProjects = [] } = useQuery<{
    projectId: string;
      projectCode: string;
      projectName: string;
      currentStage: string;
      maxAllowedStageKey?: string;
    closingStatus?: 'MISSING' | 'INCOMPLETE' | 'COMPLETE';
  }[]>({
    queryKey: ['/api/projects/pipeline'],
    refetchInterval: 60000,
  });

  const closingAggregate = pipelineProjects.reduce(
    (acc, p) => {
      const s = p.closingStatus ?? 'MISSING';
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Per-step gate lock counts: projects at their maxAllowedStageKey ceiling (can't advance)
  // Maps conceptual Control Center step → which pipeline stage(s) to check
  const STAGE_GATE_CEILING: Record<string, string[]> = {
    step1: ['quote_submitted'],        // Can't advance to purchase_review (needs Quote)
    step2: ['purchase_review'],        // Can't advance to po_received (needs Purchase Review)
    step3: ['po_received'],            // Can't advance to p2_release (needs Preproduction)
    step3b: ['p2_release'],            // Can't advance to production (needs P2 Release Gate)
    step4: ['production'],             // Can't advance to completed (needs P2 Order + closing)
  };
  const gateBlockedCounts = Object.fromEntries(
    Object.entries(STAGE_GATE_CEILING).map(([step, stages]) => {
      const count = pipelineProjects.filter(
        (p) => stages.includes(p.currentStage) && p.maxAllowedStageKey === p.currentStage
      ).length;
      return [step, count];
    })
  );

  const { data: allPOStatuses = [] } = useQuery<P2LedgerStatus[]>({
    queryKey: ['/api/p2/control-center/po-statuses'],
    refetchInterval: 30000,
  });

  const startLineItemCorrection = useMutation({
    mutationFn: ({ poId, reason }: { poId: number; reason: string }) =>
      apiRequest(`/api/p2/purchase-orders/${poId}/line-item-correction/start`, {
        method: 'POST',
        body: { reason },
        timeout: 15000,
      }),
    onSuccess: () => {
      if (pendingLineItemCorrection) setLineItemCorrection(pendingLineItemCorrection);
      setPendingLineItemCorrection(null);
      toast({ title: 'Correction opened', description: 'The PO is temporarily unlocked and the reason was audited.' });
    },
    onError: (error: Error) => toast({ title: 'Cannot edit this PO', description: error.message, variant: 'destructive' }),
  });

  const finishLineItemCorrection = async () => {
    if (!lineItemCorrection) return;
    try {
      await apiRequest(`/api/p2/purchase-orders/${lineItemCorrection.poId}/line-item-correction/complete`, {
        method: 'POST',
        body: { reason: lineItemCorrectionReason },
        }
      );
      queryClient.invalidateQueries({ queryKey: ['/api/p2/control-center/po-statuses'] });
      toast({ title: 'Correction completed', description: 'The PO was relocked and the correction was audited.' });
      setLineItemCorrection(null);
      setLineItemCorrectionReason('');
    } catch (error) {
      toast({ title: 'Could not relock PO', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    }
  };

  const openPOs = useMemo(
    () => allPOStatuses.filter((po) => po.status !== 'completed'),
    [allPOStatuses]
  );
  const serializedLedgerStats = useMemo(
    () => allPOStatuses.reduce(
      (totals, po) => ({
          scheduledItems:
            totals.scheduledItems + Number(po.scheduledItems || 0),
          inProduction: totals.inProduction + Number(po.inProductionItems || 0),
      }),
      { scheduledItems: 0, inProduction: 0 },
    ),
    [allPOStatuses],
  );
  const poFilterOptions = useMemo(
    () => activeTab === 'shipping' ? allPOStatuses : openPOs,
    [activeTab, allPOStatuses, openPOs]
  );

  useEffect(() => {
    if (selectedPOIds.length === 0) return;
    const knownPOIdSet = new Set(allPOStatuses.map((po) => po.id));
    const pruned = selectedPOIds.filter((id) => knownPOIdSet.has(id));
    if (pruned.length !== selectedPOIds.length) {
      setSelectedPOIds(pruned);
    }
  }, [allPOStatuses]);

  useEffect(() => {
    if (allPOStatuses.length === 0) return;
    const selectedPO = poIdFromUrl
      ? allPOStatuses.find((po) => po.id === poIdFromUrl)
      : poFromUrl
        ? allPOStatuses.find((po) => po.poNumber === poFromUrl)
        : null;
    if (selectedPO) {
      setSelectedPOIds([selectedPO.id]);
    }
  }, [poIdFromUrl, poFromUrl, allPOStatuses]);

  const selectedPONumbers = selectedPOIds.length > 0
    ? allPOStatuses.filter((po) => selectedPOIds.includes(po.id)).map((po) => po.poNumber)
      : poFromUrl
      ? [poFromUrl]
        : [];
  const selectedProjectId = selectedPOIds.length === 1
      ? allPOStatuses.find((po) => po.id === selectedPOIds[0])?.projectId ||
        undefined
    : undefined;
  const programProjectId = selectedProjectId || wadProjectId || undefined;

  const togglePOFilter = (poId: number) => {
    setSelectedPOIds((prev) =>
      prev.includes(poId) ? prev.filter((id) => id !== poId) : [...prev, poId]
    );
  };

  const clearPOFilter = () => {
    setSelectedPOIds([]);
  };

  useEffect(() => {
    if (!editPoIdFromUrl || !Number.isFinite(editPoIdFromUrl)) return;
    setEditingPOId(editPoIdFromUrl);
    setShowBOMWizard(false);
    setSelectedPOForBOM(null);
    setShowPOWizard(true);
  }, [editPoIdFromUrl]);

  const handlePOCreated = (poId: number) => {
    setShowPOWizard(false);
    if (editingPOId) {
      setEditingPOId(null);
      setSelectedPOIds([poId]);
      queryClient.invalidateQueries({ queryKey: ['/api/p2-purchase-orders-bypass'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2/control-center/po-statuses'] });
      setActiveTab('setup');
      return;
    }
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
          existingPoId={editingPOId}
          onComplete={handlePOCreated}
          onCancel={() => {
            setShowPOWizard(false);
            setEditingPOId(null);
          }}
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

  if (lineItemCorrection) {
    return (
      <div className="container mx-auto p-6">
        <P2POItemsManager
          poId={lineItemCorrection.poId}
          poNumber={lineItemCorrection.poNumber}
          correctionReason={lineItemCorrectionReason}
          onBack={finishLineItemCorrection}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {wadProjectId && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950 px-4 py-3">
          <FileText className="h-4 w-4 text-blue-600 shrink-0" />
          <div className="flex-1 text-sm">
            <span className="font-medium text-blue-800 dark:text-blue-200">Project context:</span>
            <span className="ml-2 text-blue-700 dark:text-blue-300">{wadProjectName || 'Project'}</span>
            {wadPoId && <span className="ml-2 text-blue-600 dark:text-blue-400">· PO ID {wadPoId}</span>}
          </div>
          <Link href={`/projects/${wadProjectId}`}>
            <Button variant="outline" size="sm" className="text-blue-700 border-blue-300 hover:bg-blue-100">
              Back to Project
            </Button>
          </Link>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">P2 Control Center</h1>
          <p className="text-muted-foreground">
            Complete workflow management for P2 purchase orders
          </p>
        </div>
        <div className="flex items-center gap-3">
          {(() => {
            if (selectedPOIds.length !== 1) return null;
            const selectedPO = allPOStatuses.find(
              (po) => po.id === selectedPOIds[0]
            );
            if (!selectedPO?.projectId) return null;
            return (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => navigate(`/projects/${selectedPO.projectId}`)}
                  title={selectedPO.projectName || undefined}
                >
                  <FolderOpen className="h-4 w-4 mr-2" />
                  {selectedPO.projectCode || 'Project'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate(`/pm-control-center?project=${selectedPO.projectId}`)}
                >
                  <BarChart3 className="h-4 w-4 mr-2" />
                  PM Control
                </Button>
              </div>
            );
          })()}
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
                  {(gateBlockedCounts['step1'] ?? 0) > 0 && (
                    <div className="flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                      <Lock className="h-2.5 w-2.5" />
                      <span>{gateBlockedCounts['step1']} gate blocked</span>
                    </div>
                  )}
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
                  {(gateBlockedCounts['step2'] ?? 0) > 0 && (
                    <div className="flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                      <Lock className="h-2.5 w-2.5" />
                      <span>{gateBlockedCounts['step2']} gate blocked</span>
                    </div>
                  )}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${serializedLedgerStats.scheduledItems > 0 ? 'bg-purple-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  <Calendar className="h-4 w-4" />
                </div>
                <div className="text-sm">
                  <div className="font-medium">3. Schedule</div>
                  <div className="text-xs text-muted-foreground">{serializedLedgerStats.scheduledItems} scheduled</div>
                  {(gateBlockedCounts['step3'] ?? 0) > 0 && (
                    <div className="flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                      <Lock className="h-2.5 w-2.5" />
                      <span>{gateBlockedCounts['step3']} gate blocked</span>
                    </div>
                  )}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${serializedLedgerStats.inProduction > 0 ? 'bg-green-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  <Factory className="h-4 w-4" />
                </div>
                <div className="text-sm">
                  <div className="font-medium">4. Production</div>
                  <div className="text-xs text-muted-foreground">{serializedLedgerStats.inProduction} active</div>
                  {(gateBlockedCounts['step4'] ?? 0) > 0 && (
                    <div className="flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                      <Lock className="h-2.5 w-2.5" />
                      <span>{gateBlockedCounts['step4']} gate blocked</span>
                    </div>
                  )}
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
                  {pipelineProjects.length > 0 && (
                    <div className="flex items-center gap-1 mt-0.5">
                      {(closingAggregate['COMPLETE'] ?? 0) > 0 && (
                        <span className="text-[10px] px-1 py-0 rounded bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 font-medium">
                          {closingAggregate['COMPLETE']} Complete
                        </span>
                      )}
                      {(closingAggregate['INCOMPLETE'] ?? 0) > 0 && (
                        <span className="text-[10px] px-1 py-0 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300 font-medium">
                          {closingAggregate['INCOMPLETE']} Incomplete
                        </span>
                      )}
                      {(closingAggregate['MISSING'] ?? 0) > 0 && (
                        <span className="text-[10px] px-1 py-0 rounded bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 font-medium">
                          {closingAggregate['MISSING']} Missing
                        </span>
                      )}
                    </div>
                  )}
                  {(() => {
                    const needAttention = pipelineProjects.filter(
                      p => (p.closingStatus ?? 'MISSING') !== 'COMPLETE'
                    );
                    if (needAttention.length === 0) {
                      return (
                        <Link href="/projects/pipeline" className="text-[10px] text-primary underline-offset-2 hover:underline mt-0.5 inline-block">
                          View closing records →
                        </Link>
                      );
                    }
                    return (
                      <div className="mt-0.5 space-y-0.5">
                        {needAttention.slice(0, 3).map(p => (
                          <Link key={p.projectId} href={`/projects/${p.projectId}/closing`} className="block text-[10px] text-primary underline-offset-2 hover:underline truncate max-w-[120px]">
                            {p.projectCode} closing →
                          </Link>
                        ))}
                        {needAttention.length > 3 && (
                          <Link href="/projects/pipeline" className="block text-[10px] text-muted-foreground underline-offset-2 hover:underline">
                            +{needAttention.length - 3} more →
                          </Link>
                        )}
                      </div>
                    );
                  })()}
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
            <div className="text-2xl font-bold mt-1">{serializedLedgerStats.scheduledItems}</div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-accent/50" onClick={() => setActiveTab('production')} data-testid="card-in-production">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Factory className="h-4 w-4 text-green-600" />
              <span className="text-sm text-muted-foreground">In Production</span>
            </div>
            <div className="text-2xl font-bold mt-1">{serializedLedgerStats.inProduction}</div>
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
                    {daysText && (
                      <span className="ml-1 opacity-80">({daysText})</span>
                    )}
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* PO Filter Bar */}
      {poFilterOptions.length > 1 && (
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Filter className="h-4 w-4" />
              Filter by PO:
            </div>

            {/* Multi-select PO picker dropdown */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5">
                  {selectedPOIds.length === 0 ? (
                    <>All POs <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /></>
                  ) : (
                    <>{selectedPOIds.length} PO{selectedPOIds.length > 1 ? 's' : ''} selected <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /></>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" align="start">
                <div className="space-y-1">
                  {/* All POs option */}
                  <button
                    onClick={clearPOFilter}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors ${
                      selectedPOIds.length === 0
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'hover:bg-accent'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                      selectedPOIds.length === 0 ? 'bg-primary border-primary' : 'border-muted-foreground'
                    }`}>
                      {selectedPOIds.length === 0 && <CheckCircle className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    All POs
                  </button>

                  <div className="h-px bg-border my-1" />

                  {/* Individual PO options */}
                  {poFilterOptions.map((po) => {
                    const isChecked = selectedPOIds.includes(po.id);
                    return (
                      <div
                        key={po.id}
                        role="option"
                        aria-selected={isChecked}
                        onClick={() => togglePOFilter(po.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left hover:bg-accent transition-colors cursor-pointer select-none"
                      >
                        <Checkbox
                          checked={isChecked}
                          className="flex-shrink-0 pointer-events-none"
                          tabIndex={-1}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{po.poNumber}</span>
                          <span className="text-muted-foreground ml-1.5 text-xs truncate block">{po.customerName}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>

            {/* Clear button */}
            {selectedPOIds.length > 0 && (
              <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-foreground" onClick={clearPOFilter}>
                <X className="h-3.5 w-3.5 mr-1" />
                Clear filter
              </Button>
            )}
          </div>

          {/* Active filter chips */}
          {selectedPOIds.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Showing:</span>
              {poFilterOptions.filter((po) => selectedPOIds.includes(po.id)).map((po) => (
                  <Badge
                  key={po.id}
                  variant="secondary"
                    className="gap-1 pl-2 pr-1 py-0.5 text-xs font-normal"
                >
                    <span className="font-medium">{po.poNumber}</span>
                    <span className="text-muted-foreground">
                      — {po.customerName}
                    </span>
                    <button
                      onClick={() => togglePOFilter(po.id)}
                      className="ml-0.5 rounded-full hover:bg-muted p-0.5"
                      aria-label={`Remove ${po.poNumber} filter`}
                  >
                      <X className="h-3 w-3" />
                  </button>
                </Badge>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex flex-wrap w-full sticky top-0 z-20 bg-background border-b border-border shadow-sm">
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
          <TabsTrigger value="production-map" className="flex items-center gap-2" data-testid="tab-production-map">
            <Layers className="h-4 w-4" />
            Production Map
          </TabsTrigger>
          <TabsTrigger value="frozen-demand" className="flex items-center gap-2" data-testid="tab-frozen-demand">
            <Lock className="h-4 w-4" />
            Frozen Demand
          </TabsTrigger>
          {genealogyEnabled && (
            <TabsTrigger value="genealogy" className="flex items-center gap-2" data-testid="tab-genealogy">
              <GitBranch className="h-4 w-4" />
              Genealogy
            </TabsTrigger>
          )}
          {activationReadinessEnabled && (
            <TabsTrigger
              value="pilot-readiness"
              className="flex items-center gap-2"
              data-testid="tab-pilot-readiness"
            >
              <ShieldCheck className="h-4 w-4" />
              Pilot Readiness
            </TabsTrigger>
          )}
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
          <TabsTrigger value="scrapped" className="flex items-center gap-2" data-testid="tab-scrapped">
            <XCircle className="h-4 w-4" />
            Nonconforming
          </TabsTrigger>
        </TabsList>

        <TabsContent value="status">
          <P2StatusDashboard 
            onStartBOM={(poId) => {
              setSelectedPOForBOM(poId);
              setShowBOMWizard(true);
            }} 
            onViewPO={(poId) => {
              navigate(`/p2/purchase-orders/${poId}/preview`);
            }}
            onManageItems={(poId, poNumber) => {
              setPendingLineItemCorrection({ poId, poNumber });
              setLineItemCorrectionReason('');
            }}
            selectedPOIds={selectedPOIds}
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
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule">
          <P2ProductionScheduler selectedPONumbers={selectedPONumbers} />
        </TabsContent>

        <TabsContent value="production">
          <P2ProductionQueue selectedPONumbers={selectedPONumbers} />
        </TabsContent>

        <TabsContent value="production-map" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Production Map</CardTitle>
                  <CardDescription>
                    One PO shown as a program summary, assembly hierarchy, or production swimlane.
                  </CardDescription>
                </div>
                <Tabs
                  value={productionMapView}
                  onValueChange={(value) => setProductionMapView(value as ProductionMapView)}
                >
                  <TabsList aria-label="Production Map view">
                    <TabsTrigger value="overview" className="gap-2" data-testid="production-map-view-program">
                      <Layers className="h-4 w-4" />
                      Program
                    </TabsTrigger>
                    <TabsTrigger value="tree" className="gap-2" data-testid="production-map-view-assembly">
                      <Route className="h-4 w-4" />
                      Assembly
                    </TabsTrigger>
                    <TabsTrigger value="swimlane" className="gap-2" data-testid="production-map-view-swimlane">
                      <BarChart3 className="h-4 w-4" />
                      Swimlane
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
          </Card>

          {programProjectId ? (
            <ProgramManufacturingOrchestration mode={productionMapView} projectId={programProjectId} />
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Layers className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="font-medium">Select one PO to view its Production Map</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Program, Assembly, and Swimlane are interchangeable views of the same selected PO.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="frozen-demand">
          <P2FrozenProductionDemand projectId={programProjectId} />
        </TabsContent>

        {genealogyEnabled && (
          <TabsContent value="genealogy">
            <P2GenealogyViewer />
          </TabsContent>
        )}

        {activationReadinessEnabled && (
          <TabsContent value="pilot-readiness">
            <P2ActivationReadiness />
          </TabsContent>
        )}

        <TabsContent value="shipping" className="space-y-4">
          <div className="flex flex-wrap justify-end gap-2">
            <Link href="/p2/material-transfer" className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20 transition-colors">
              <ScrollText className="h-3.5 w-3.5" />
              Material Transfer Form
            </Link>
            <Link href="/p2/ready-to-ship" className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              Ready to Ship Dashboard
            </Link>
          </div>
          <P2ShippingTab initialPO={poFromUrl} initialUnits={unitsFromUrl} selectedPOIds={selectedPOIds} />
        </TabsContent>

        <TabsContent value="travelers">
          <P2TravelersTab selectedPONumbers={selectedPONumbers} />
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
          <CertificationAuthorizationMatrix defaultProgram="P2" defaultStatus="ACTIVE" />
        </TabsContent>

        <TabsContent value="scrapped">
          <P2NonconformingTab selectedPOIds={selectedPOIds} />
        </TabsContent>
      </Tabs>

      <Dialog
        open={!!pendingLineItemCorrection}
        onOpenChange={(open) => {
          if (!open && !startLineItemCorrection.isPending) setPendingLineItemCorrection(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Correct PO line items</DialogTitle>
            <DialogDescription>
              This is for correcting the original PO before production begins. The PO will be temporarily unlocked and every change will retain this audit reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="line-item-correction-reason">Correction reason</Label>
            <Input
              id="line-item-correction-reason"
              value={lineItemCorrectionReason}
              onChange={(event) => setLineItemCorrectionReason(event.target.value)}
              placeholder="Example: Add omitted shipping line from original customer PO"
              data-testid="input-line-item-correction-reason"
            />
            <p className="text-xs text-muted-foreground">At least 10 characters are required.</p>
            {startLineItemCorrection.isError && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                {startLineItemCorrection.error instanceof Error
                  ? startLineItemCorrection.error.message
                  : 'The correction could not be opened. Please try again.'}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingLineItemCorrection(null)}>Cancel</Button>
            <Button
              disabled={lineItemCorrectionReason.trim().length < 10 || startLineItemCorrection.isPending}
              onClick={() => pendingLineItemCorrection && startLineItemCorrection.mutate({
                poId: pendingLineItemCorrection.poId,
                reason: lineItemCorrectionReason.trim(),
                })
              }
              data-testid="button-start-line-item-correction"
            >
              {startLineItemCorrection.isPending ? 'Opening...' : 'Open audited correction'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function POsNeedingBOMs({ onSelectPO }: { onSelectPO: (poId: number) => void }) {
  const { data: posNeedingBOMs = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/p2/control-center/pos-needing-boms'],
  });

  if (isLoading) {
    return (
      <div className="text-center py-4 text-muted-foreground">Loading...</div>
    );
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

function P2TravelersTab({ selectedPONumbers = [] }: { selectedPONumbers?: string[] }) {
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

  const activeRoutings = routings.filter((r) => r.isActive);

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

  const travelersForSelectedPOs = selectedPONumbers.length > 0
    ? travelers.filter((traveler) => {
        const sourceFields = [
          traveler.lotNumber,
          traveler.workOrderId,
          traveler.travelerNumber,
        ].filter((value): value is string => !!value);
        return selectedPONumbers.some((poNumber) =>
            sourceFields.some((value) =>
              value.toLowerCase().includes(poNumber.toLowerCase())
            )
        );
      })
    : travelers;

  const filteredTravelers = travelersForSelectedPOs.filter((t) => {
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
    draft: travelersForSelectedPOs.filter(t => t.status === 'DRAFT').length,
    inProgress: travelersForSelectedPOs.filter(t => t.status === 'IN_PROGRESS').length,
    completed: travelersForSelectedPOs.filter((t) => t.status === 'COMPLETED')
      .length,
    blocked: travelersForSelectedPOs.filter((t) => t.status === 'BLOCKED')
      .length,
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
                  : selectedPONumbers.length > 0
                  ? 'No travelers found for the selected PO filter.'
                  : 'Generate a traveler from a part routing to get started.'}
              </p>
              {statusFilter === 'all' && selectedPONumbers.length === 0 && (
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
                  <TableHead>Serial #</TableHead>
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
                      <TableCell className="font-mono text-sm">{traveler.serialNumber || '-'}</TableCell>
                      <TableCell>
                        {traveler.routingName ? (
                          traveler.partRoutingId ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/p2-control-center?tab=routing&routingId=${traveler.partRoutingId}`);
                              }}
                              className="text-left text-blue-600 hover:underline dark:text-blue-400"
                              data-testid={`link-routing-${traveler.partRoutingId}`}
                            >
                              <span>{traveler.routingName}</span>
                              {traveler.routingRevision && (
                                <Badge variant="outline" className="ml-2 text-xs">
                                  Rev {traveler.routingRevision}
                                </Badge>
                              )}
                            </button>
                          ) : (
                            <div>
                              <span>{traveler.routingName}</span>
                              {traveler.routingRevision && (
                                <Badge variant="outline" className="ml-2 text-xs">
                                  Rev {traveler.routingRevision}
                                </Badge>
                              )}
                            </div>
                          )
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
