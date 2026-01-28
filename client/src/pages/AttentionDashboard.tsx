import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Eye, Clock, CheckCircle, RefreshCw } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface AttentionMetrics {
  entityId: string;
  entityType: string;
  currentStatus: string;
  assignedUserId?: number | null;
  assignedUserIds?: number[] | null;
  lastConfirmedAt: string | null;
  lastConfirmedByUserId: number | null;
  updatedAt: string | null;
  attentionRisk: 'low' | 'medium' | 'high' | null;
  hoursSinceConfirmation: number | null;
  hasSeenLatestUpdate: boolean;
  viewedBy: Record<string, string>;
}

interface DashboardData {
  tickets: AttentionMetrics[];
  orders: AttentionMetrics[];
  qcItems: AttentionMetrics[];
  productionDelays: AttentionMetrics[];
  summary: {
    highRiskCount: number;
    mediumRiskCount: number;
    lowRiskCount: number;
    totalUnconfirmed: number;
  };
}

function getRiskBadge(risk: 'low' | 'medium' | 'high' | null) {
  if (!risk) return <Badge variant="outline">No Risk</Badge>;
  
  switch (risk) {
    case 'high':
      return <Badge variant="destructive">High Risk</Badge>;
    case 'medium':
      return <Badge className="bg-yellow-500 text-white">Medium Risk</Badge>;
    case 'low':
      return <Badge className="bg-blue-500 text-white">Low Risk</Badge>;
  }
}

function formatTimeAgo(date: string | null): string {
  if (!date) return 'Never';
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

function MetricsTable({ 
  metrics, 
  entityType,
  onConfirm 
}: { 
  metrics: AttentionMetrics[]; 
  entityType: string;
  onConfirm: (entityType: string, entityId: string) => void;
}) {
  if (metrics.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No {entityType} items require attention at this time.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Last Confirmed</TableHead>
          <TableHead>Time Since</TableHead>
          <TableHead>Risk Level</TableHead>
          <TableHead>Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {metrics.map((item) => (
          <TableRow key={item.entityId} className={
            item.attentionRisk === 'high' ? 'bg-red-50 dark:bg-red-950' :
            item.attentionRisk === 'medium' ? 'bg-yellow-50 dark:bg-yellow-950' :
            ''
          }>
            <TableCell className="font-mono text-sm">
              {item.entityId.substring(0, 8)}...
            </TableCell>
            <TableCell>
              <Badge variant="outline">{item.currentStatus}</Badge>
            </TableCell>
            <TableCell>
              {item.lastConfirmedAt ? formatTimeAgo(item.lastConfirmedAt) : 'Never confirmed'}
            </TableCell>
            <TableCell>
              {item.hoursSinceConfirmation !== null 
                ? `${Math.round(item.hoursSinceConfirmation)}h`
                : '—'}
            </TableCell>
            <TableCell>
              {getRiskBadge(item.attentionRisk)}
            </TableCell>
            <TableCell>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => onConfirm(item.entityType, item.entityId)}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Confirm State
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function AttentionDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery<DashboardData>({
    queryKey: ['/api/attention/dashboard'],
    refetchInterval: 60000, // Refresh every minute
  });

  const confirmMutation = useMutation({
    mutationFn: async ({ entityType, entityId }: { entityType: string; entityId: string }) => {
      return apiRequest('/api/attention/confirm', {
        method: 'POST',
        body: JSON.stringify({ entityType, entityId }),
      });
    },
    onSuccess: () => {
      toast({ title: 'State confirmed successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/attention/dashboard'] });
    },
    onError: (error) => {
      toast({ 
        title: 'Failed to confirm state', 
        description: String(error),
        variant: 'destructive'
      });
    },
  });

  const handleConfirm = (entityType: string, entityId: string) => {
    confirmMutation.mutate({ entityType, entityId });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-destructive">
              Failed to load attention dashboard. Please try again.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const summary = data?.summary || {
    highRiskCount: 0,
    mediumRiskCount: 0,
    lowRiskCount: 0,
    totalUnconfirmed: 0,
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Attention Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Monitor state confidence across the system. Items shown here may need review or confirmation.
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>High Risk</CardDescription>
            <CardTitle className="text-3xl text-red-600">{summary.highRiskCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4 mr-1 text-red-500" />
              Needs immediate attention
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Medium Risk</CardDescription>
            <CardTitle className="text-3xl text-yellow-600">{summary.mediumRiskCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-muted-foreground">
              <Clock className="h-4 w-4 mr-1 text-yellow-500" />
              Review soon
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Low Risk</CardDescription>
            <CardTitle className="text-3xl text-blue-600">{summary.lowRiskCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-muted-foreground">
              <Eye className="h-4 w-4 mr-1 text-blue-500" />
              Monitor
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Never Confirmed</CardDescription>
            <CardTitle className="text-3xl">{summary.totalUnconfirmed}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4 mr-1" />
              Awaiting first confirmation
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Attention Items by Domain</CardTitle>
          <CardDescription>
            These items have not been confirmed recently. Confirming state means "I have checked this and the current state is still accurate."
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="tickets">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="tickets">
                Tickets ({data?.tickets.length || 0})
              </TabsTrigger>
              <TabsTrigger value="orders">
                Orders ({data?.orders.length || 0})
              </TabsTrigger>
              <TabsTrigger value="qc">
                QC Items ({data?.qcItems.length || 0})
              </TabsTrigger>
              <TabsTrigger value="delays">
                Delays ({data?.productionDelays.length || 0})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="tickets" className="mt-4">
              <MetricsTable 
                metrics={data?.tickets || []} 
                entityType="ticket"
                onConfirm={handleConfirm}
              />
            </TabsContent>

            <TabsContent value="orders" className="mt-4">
              <MetricsTable 
                metrics={data?.orders || []} 
                entityType="order"
                onConfirm={handleConfirm}
              />
            </TabsContent>

            <TabsContent value="qc" className="mt-4">
              <MetricsTable 
                metrics={data?.qcItems || []} 
                entityType="qc_item"
                onConfirm={handleConfirm}
              />
            </TabsContent>

            <TabsContent value="delays" className="mt-4">
              <MetricsTable 
                metrics={data?.productionDelays || []} 
                entityType="production_delay"
                onConfirm={handleConfirm}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What This Dashboard Shows</CardTitle>
        </CardHeader>
        <CardContent className="prose dark:prose-invert max-w-none">
          <p className="text-muted-foreground">
            This dashboard answers: <strong>"Do we have confidence in the current state of work?"</strong>
          </p>
          <ul className="text-sm text-muted-foreground space-y-2 mt-4">
            <li><strong>High Risk:</strong> Item state has not been confirmed beyond the threshold for its status (e.g., escalated tickets without confirmation for 8+ hours)</li>
            <li><strong>Medium Risk:</strong> Approaching staleness threshold - should be reviewed soon</li>
            <li><strong>Low Risk:</strong> Recently active but nearing confirmation window</li>
            <li><strong>Confirm State:</strong> Click to mark "I have checked this and the current state is still accurate"</li>
          </ul>
          <p className="text-xs text-muted-foreground mt-4">
            Note: This dashboard does NOT track page clicks, mouse activity, or time-on-page. 
            We measure awareness and confirmation, not effort.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
