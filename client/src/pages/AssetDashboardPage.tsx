import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BarChart3,
  AlertTriangle,
  Clock,
  Wrench,
  XCircle,
  Activity,
  Shield,
  TrendingDown,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { format, subDays, isAfter } from 'date-fns';

type MaintenanceSchedule = {
  id: number;
  equipment: string;
  frequency: string;
  startDate: string;
  nextDue: string;
  isActive: boolean;
};

type AssetRow = {
  id: string;
  assetTag: string;
  name: string;
  status: string;
  categoryName: string | null;
  locationName: string | null;
};

type WorkOrderRow = {
  id: string;
  assetId: string | null;
  type: string;
  title: string;
  priority: string;
  status: string;
  reportedAt: string;
  downtimeStart: string | null;
  downtimeEnd: string | null;
  assetName: string | null;
  assetTag: string | null;
};

type AssetAnalytic = {
  assetId: string;
  assetTag: string;
  assetName: string;
  mtbfDays: number | null;
  reactiveCount90d: number;
  highFailureRisk: boolean;
  downtimeImpactScore: number;
  totalDowntimeHours: number;
};

type AnalyticsResponse = {
  assets: AssetAnalytic[];
  summary: {
    totalAssets: number;
    highFailureRiskCount: number;
    avgMtbfDays: number | null;
    totalDowntimeImpact: number;
  };
};

const COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function AssetDashboardPage() {
  const { data: assets = [] } = useQuery<AssetRow[]>({
    queryKey: ['/api/assets'],
  });

  const { data: workOrders = [] } = useQuery<WorkOrderRow[]>({
    queryKey: ['/api/work-orders'],
  });

  const { data: schedules = [] } = useQuery<MaintenanceSchedule[]>({
    queryKey: ['/api/maintenance-schedules'],
  });

  const { data: analytics } = useQuery<AnalyticsResponse>({
    queryKey: ['/api/assets/analytics'],
  });

  const outOfServiceAssets = useMemo(
    () => assets.filter((a) => a.status === 'out_of_service'),
    [assets]
  );

  const overdueSchedules = useMemo(() => {
    const now = new Date();
    return schedules.filter((s) => {
      if (!s.isActive || !s.nextDue) return false;
      return new Date(s.nextDue) < now;
    });
  }, [schedules]);

  const reactiveHotspots = useMemo(() => {
    const cutoff = subDays(new Date(), 90);
    const counts = new Map<string, { assetTag: string; name: string; count: number }>();
    workOrders
      .filter((wo) => wo.type === 'reactive' && wo.assetId && isAfter(new Date(wo.reportedAt), cutoff))
      .forEach((wo) => {
        const key = wo.assetId!;
        if (!counts.has(key)) {
          counts.set(key, { assetTag: wo.assetTag || '', name: wo.assetName || '', count: 0 });
        }
        counts.get(key)!.count++;
      });
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [workOrders]);

  const downtimeByAsset = useMemo(() => {
    const cutoff = subDays(new Date(), 30);
    const hours = new Map<string, { label: string; hours: number }>();
    workOrders
      .filter((wo) => wo.downtimeStart && wo.assetId && isAfter(new Date(wo.downtimeStart), cutoff))
      .forEach((wo) => {
        const start = new Date(wo.downtimeStart!);
        const end = wo.downtimeEnd ? new Date(wo.downtimeEnd) : new Date();
        const h = (end.getTime() - start.getTime()) / 3600000;
        const key = wo.assetId!;
        const label = wo.assetTag ? `${wo.assetTag}` : key.slice(0, 8);
        if (!hours.has(key)) {
          hours.set(key, { label, hours: 0 });
        }
        hours.get(key)!.hours += h;
      });
    return Array.from(hours.values())
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 10)
      .map((d) => ({ ...d, hours: parseFloat(d.hours.toFixed(1)) }));
  }, [workOrders]);

  const openWOs = workOrders.filter((wo) => wo.status === 'open' || wo.status === 'in_progress').length;
  const activeDowntime = workOrders.filter((wo) => wo.downtimeStart && !wo.downtimeEnd).length;

  const highFailureRiskAssets = useMemo(() => {
    if (!analytics) return [];
    return analytics.assets.filter((a) => a.highFailureRisk);
  }, [analytics]);

  const topDowntimeImpact = useMemo(() => {
    if (!analytics) return [];
    return analytics.assets
      .filter((a) => a.downtimeImpactScore > 0)
      .sort((a, b) => b.downtimeImpactScore - a.downtimeImpactScore)
      .slice(0, 10);
  }, [analytics]);

  const mtbfData = useMemo(() => {
    if (!analytics) return [];
    return analytics.assets
      .filter((a) => a.mtbfDays !== null)
      .sort((a, b) => (a.mtbfDays ?? 0) - (b.mtbfDays ?? 0))
      .slice(0, 10);
  }, [analytics]);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          Asset Dashboard
        </h1>
        <p className="text-gray-500">Equipment health and maintenance overview</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{assets.length}</p>
            <p className="text-xs text-gray-500">Total Assets</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{outOfServiceAssets.length}</p>
            <p className="text-xs text-gray-500">Out of Service</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-yellow-600">{openWOs}</p>
            <p className="text-xs text-gray-500">Open Work Orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{activeDowntime}</p>
            <p className="text-xs text-gray-500">Active Downtime</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-600">{analytics?.summary.highFailureRiskCount ?? 0}</p>
            <p className="text-xs text-gray-500">High Failure Risk</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">
              {analytics?.summary.avgMtbfDays != null ? `${analytics.summary.avgMtbfDays}d` : '—'}
            </p>
            <p className="text-xs text-gray-500">Avg MTBF (days)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-600">
              {analytics?.summary.totalDowntimeImpact ?? 0}
            </p>
            <p className="text-xs text-gray-500">Total Downtime Impact Score</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* High Failure Risk Assets */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              High Failure Risk Assets
              {highFailureRiskAssets.length > 0 && (
                <Badge className="bg-orange-100 text-orange-800 text-xs ml-auto">
                  {highFailureRiskAssets.length} flagged
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {highFailureRiskAssets.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No high failure risk assets</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset</TableHead>
                    <TableHead>Failures (90d)</TableHead>
                    <TableHead>MTBF</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {highFailureRiskAssets.map((a) => (
                    <TableRow key={a.assetId}>
                      <TableCell className="text-sm font-medium">{a.assetTag} - {a.assetName}</TableCell>
                      <TableCell>
                        <Badge className="bg-red-100 text-red-800 text-xs">{a.reactiveCount90d}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {a.mtbfDays != null ? `${a.mtbfDays}d` : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-orange-100 text-orange-800 text-xs">High Failure Risk</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* MTBF Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              Mean Time Between Failures (MTBF)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {mtbfData.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">No MTBF data available (needs 2+ reactive WOs per asset)</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={mtbfData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" unit="d" />
                  <YAxis type="category" dataKey="assetTag" width={80} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: any) => [`${value} days`, 'MTBF']}
                    labelFormatter={(label: any) => {
                      const item = mtbfData.find((d) => d.assetTag === label);
                      return item ? `${item.assetTag} - ${item.assetName}` : label;
                    }}
                  />
                  <Bar dataKey="mtbfDays" name="MTBF (days)" radius={[0, 4, 4, 0]}>
                    {mtbfData.map((item, i) => (
                      <Cell
                        key={i}
                        fill={item.highFailureRisk ? '#ef4444' : item.mtbfDays! < 30 ? '#f59e0b' : '#10b981'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Downtime Impact Score */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-purple-500" />
              Downtime Impact Score (hours x severity)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topDowntimeImpact.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No downtime impact data</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset</TableHead>
                    <TableHead>Downtime (hrs)</TableHead>
                    <TableHead>Impact Score</TableHead>
                    <TableHead>Risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topDowntimeImpact.map((a) => (
                    <TableRow key={a.assetId}>
                      <TableCell className="text-sm font-medium">{a.assetTag} - {a.assetName}</TableCell>
                      <TableCell className="text-sm">{a.totalDowntimeHours}h</TableCell>
                      <TableCell>
                        <Badge
                          className={
                            a.downtimeImpactScore >= 100
                              ? 'bg-red-100 text-red-800 text-xs'
                              : a.downtimeImpactScore >= 50
                              ? 'bg-yellow-100 text-yellow-800 text-xs'
                              : 'bg-green-100 text-green-800 text-xs'
                          }
                        >
                          {a.downtimeImpactScore}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {a.highFailureRisk && (
                          <Badge className="bg-orange-100 text-orange-800 text-xs">High Failure Risk</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Overdue PM */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-red-500" />
              Overdue Preventive Maintenance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {overdueSchedules.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No overdue schedules</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Equipment</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Due Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overdueSchedules.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium text-sm">{s.equipment}</TableCell>
                      <TableCell className="text-sm">{s.frequency}</TableCell>
                      <TableCell>
                        <Badge className="bg-red-100 text-red-800 text-xs">
                          {format(new Date(s.nextDue), 'MM/dd/yyyy')}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Reactive Hotspots */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4 text-orange-500" />
              Top Reactive Work Orders (90 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {reactiveHotspots.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No reactive work orders in last 90 days</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset</TableHead>
                    <TableHead>Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reactiveHotspots.map((item) => (
                    <TableRow key={item.assetTag}>
                      <TableCell className="text-sm">{item.assetTag} - {item.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.count}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Downtime Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              Downtime Hours by Asset (30 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {downtimeByAsset.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">No downtime data in last 30 days</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={downtimeByAsset} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" unit="h" />
                  <YAxis type="category" dataKey="label" width={80} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value: any) => [`${value}h`, 'Downtime']} />
                  <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                    {downtimeByAsset.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Out of Service Assets */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-500" />
            Assets Currently Out of Service
          </CardTitle>
        </CardHeader>
        <CardContent>
          {outOfServiceAssets.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">All assets operational</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset Tag</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outOfServiceAssets.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-sm">{a.assetTag}</TableCell>
                    <TableCell className="text-sm">{a.name}</TableCell>
                    <TableCell className="text-sm">{a.categoryName || '—'}</TableCell>
                    <TableCell className="text-sm">{a.locationName || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
