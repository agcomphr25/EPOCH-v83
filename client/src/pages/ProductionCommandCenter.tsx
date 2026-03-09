import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Ticket,
  Package,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from '@/components/ui/sheet';
import DashboardGrid from '@/components/widgets/DashboardGrid';
import { PCC_LAYOUT } from '@/config/pccLayout';

// ── Types ──────────────────────────────────────────────────────────────────────

interface IntegrityStatus {
  healthy: boolean;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  affectedDepartments: string[];
  lastCheckTime: string | null;
}

interface MetricValue {
  metric: string;
  name: string;
  value: number;
  unit: string;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
          {label}
        </div>
        {children}
      </div>
    </div>
  );
}

function QuickLink({
  href,
  label,
  description,
}: {
  href: string;
  label: string;
  description: string;
}) {
  return (
    <Link href={href}>
      <div className="flex items-center justify-between rounded-md px-3 py-2.5 hover:bg-accent cursor-pointer group transition-colors">
        <div>
          <div className="text-sm font-medium group-hover:text-primary transition-colors">
            {label}
          </div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
      </div>
    </Link>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ProductionCommandCenter() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: currentUser } = useQuery<{ id: number; username: string; role: string }>({
    queryKey: ['currentUser'],
  });

  const { data: integrityStatus, isLoading: integrityLoading } =
    useQuery<IntegrityStatus>({
      queryKey: ['/api/admin/queue-integrity/status'],
      staleTime: 5 * 60 * 1000,
      enabled: drawerOpen,
    });

  const { data: shortagesMetric, isLoading: shortagesLoading } =
    useQuery<MetricValue>({
      queryKey: ['/api/metrics/open_inventory_shortages'],
      staleTime: 60_000,
      enabled: drawerOpen,
    });

  const { data: ticketsMetric, isLoading: ticketsLoading } =
    useQuery<MetricValue>({
      queryKey: ['/api/metrics/open_tickets'],
      staleTime: 60_000,
      enabled: drawerOpen,
    });

  return (
    <div className="p-6 space-y-6 max-w-full mx-auto">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-3 group text-left"
          aria-label="Open system status drawer"
        >
          <Activity className="h-7 w-7 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                Production Command Center
              </h1>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Live operational metrics · click for system status
            </p>
          </div>
        </button>

        {currentUser && (
          <div className="text-xs text-muted-foreground text-right">
            <div className="font-medium">{currentUser.username.toUpperCase()}</div>
            <div>EPOCH v8 Manufacturing ERP</div>
          </div>
        )}
      </div>

      {/* ── Dashboard Grid ───────────────────────────────────────────────────── */}
      <DashboardGrid layout={PCC_LAYOUT} />

      {/* ── System Status Drawer ─────────────────────────────────────────────── */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-[360px] sm:w-[420px] overflow-y-auto">
          <SheetHeader className="flex flex-row items-center justify-between pb-0">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-blue-500" />
              Operational Status
            </SheetTitle>
            <SheetClose asChild>
              <Button variant="ghost" size="icon" className="-mr-2 h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </SheetClose>
          </SheetHeader>

          <div className="mt-4 space-y-0 divide-y divide-border">
            {/* Queue Integrity */}
            <StatusRow
              label="Queue Integrity"
              icon={<ShieldCheck className="h-4 w-4 text-indigo-500" />}
            >
              {integrityLoading ? (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Checking…
                </div>
              ) : integrityStatus ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    {integrityStatus.healthy ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-sm font-medium text-green-600 dark:text-green-400">
                          All queues healthy
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                          Issues detected
                        </span>
                      </>
                    )}
                  </div>
                  {!integrityStatus.healthy && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {integrityStatus.criticalCount > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {integrityStatus.criticalCount} critical
                        </Badge>
                      )}
                      {integrityStatus.warningCount > 0 && (
                        <Badge
                          variant="outline"
                          className="text-xs border-amber-500 text-amber-700 dark:text-amber-400"
                        >
                          {integrityStatus.warningCount} warnings
                        </Badge>
                      )}
                      {integrityStatus.affectedDepartments.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          Depts: {integrityStatus.affectedDepartments.join(', ')}
                        </span>
                      )}
                    </div>
                  )}
                  {integrityStatus.lastCheckTime && (
                    <div className="text-xs text-muted-foreground">
                      Last check:{' '}
                      {new Date(integrityStatus.lastCheckTime).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground italic">
                  Status unavailable
                </span>
              )}
            </StatusRow>

            {/* Inventory Shortages */}
            <StatusRow
              label="Open Inventory Shortages"
              icon={<Package className="h-4 w-4 text-orange-500" />}
            >
              {shortagesLoading ? (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading…
                </div>
              ) : shortagesMetric != null ? (
                <div className="flex items-center gap-2">
                  <span
                    className={`text-2xl font-bold tabular-nums ${
                      shortagesMetric.value > 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-green-600 dark:text-green-400'
                    }`}
                  >
                    {shortagesMetric.value}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {shortagesMetric.value === 1 ? 'shortage' : 'shortages'}
                  </span>
                  {shortagesMetric.value === 0 && (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  )}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground italic">Unavailable</span>
              )}
            </StatusRow>

            {/* Open Tickets */}
            <StatusRow
              label="Attention Alerts"
              icon={<Ticket className="h-4 w-4 text-blue-500" />}
            >
              {ticketsLoading ? (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading…
                </div>
              ) : ticketsMetric != null ? (
                <div className="flex items-center gap-2">
                  <span
                    className={`text-2xl font-bold tabular-nums ${
                      ticketsMetric.value > 0
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-green-600 dark:text-green-400'
                    }`}
                  >
                    {ticketsMetric.value}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    open {ticketsMetric.value === 1 ? 'ticket' : 'tickets'}
                  </span>
                  {ticketsMetric.value === 0 && (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  )}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground italic">Unavailable</span>
              )}
            </StatusRow>
          </div>

          {/* Quick Links */}
          <div className="mt-5">
            <Separator className="mb-4" />
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 px-3">
              Quick Links
            </div>
            <div className="space-y-0.5">
              <QuickLink
                href="/admin/queue-integrity"
                label="Queue Integrity Monitor"
                description="View and resolve queue discrepancies"
              />
              <QuickLink
                href="/inventory/enhanced-mrp"
                label="Inventory & MRP"
                description="Manage materials and shortages"
              />
              <QuickLink
                href="/inventory/material-intelligence"
                label="Material Intelligence"
                description="Build capacity and purchasing radar"
              />
              <QuickLink
                href="/tickets"
                label="Open Tickets"
                description="View and manage attention items"
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
