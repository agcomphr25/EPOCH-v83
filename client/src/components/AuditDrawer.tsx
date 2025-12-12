import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  History,
  Clock,
  User,
  ArrowRight,
  AlertCircle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Package,
  DollarSign,
  Truck,
  Factory,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

interface AuditEvent {
  id: number;
  entityType: string;
  entityId: string;
  action: string;
  actorId: number | null;
  actorName: string | null;
  actorRole: string | null;
  reason: string | null;
  fieldsChanged: Record<string, { before: any; after: any }> | null;
  meta: Record<string, any> | null;
  ipAddress: string | null;
  timestamp: string;
  createdAt: string;
}

interface DepartmentTransition {
  id: string;
  entityType: string;
  entityId: string;
  cycleNumber: number;
  department: string;
  enteredAt: string;
  exitedAt: string | null;
  durationMinutes: number | null;
  exitReason: string | null;
}

interface ScrapCycle {
  id: string;
  entityType: string;
  originalEntityId: string;
  cycleNumber: number;
  scrapReason: string;
  scrapDepartment: string | null;
  restartEntityId: string | null;
  restartedAt: string | null;
  scrappedAt: string;
}

interface AuditFullData {
  events: AuditEvent[];
  transitions: DepartmentTransition[];
  scrapCycles: ScrapCycle[];
  timeSummary: Record<string, number>;
}

interface AuditDrawerProps {
  entityType: 'p1_order' | 'p2_order' | 'p2_serialized_item' | 'p2_project';
  entityId: string;
  trigger?: React.ReactNode;
}

const actionIcons: Record<string, any> = {
  ORDER_CREATED: Factory,
  ORDER_FINALIZED: CheckCircle,
  DEPARTMENT_CHANGE: ArrowRight,
  STATUS_CHANGE: RefreshCw,
  SCRAP_DECLARED: XCircle,
  ORDER_RESTARTED: RefreshCw,
  PAYMENT_RECEIVED: DollarSign,
  SHIPPED: Truck,
  TRACKING_ADDED: Package,
  default: History,
};

const actionColors: Record<string, string> = {
  ORDER_CREATED: 'bg-green-100 text-green-700 border-green-300',
  ORDER_FINALIZED: 'bg-blue-100 text-blue-700 border-blue-300',
  DEPARTMENT_CHANGE: 'bg-purple-100 text-purple-700 border-purple-300',
  STATUS_CHANGE: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  SCRAP_DECLARED: 'bg-red-100 text-red-700 border-red-300',
  ORDER_RESTARTED: 'bg-orange-100 text-orange-700 border-orange-300',
  PAYMENT_RECEIVED: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  SHIPPED: 'bg-cyan-100 text-cyan-700 border-cyan-300',
  ORDER_CANCELLED: 'bg-red-100 text-red-700 border-red-300',
  default: 'bg-gray-100 text-gray-700 border-gray-300',
};

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

function formatValue(value: any): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function AuditDrawer({ entityType, entityId, trigger }: AuditDrawerProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('timeline');

  const { data, isLoading } = useQuery<AuditFullData>({
    queryKey: ['/api/audit/full', entityType, entityId],
    enabled: open,
  });

  const events = data?.events || [];
  const transitions = data?.transitions || [];
  const scrapCycles = data?.scrapCycles || [];
  const timeSummary = data?.timeSummary || {};

  const totalTimeMinutes = Object.values(timeSummary).reduce((a, b) => a + b, 0);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" data-testid="button-audit-trail">
            <History className="h-4 w-4 mr-2" />
            Audit Trail
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-[500px] sm:w-[600px] sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Audit Trail
          </SheetTitle>
          <SheetDescription>
            Complete history for {entityType.replace(/_/g, ' ')} {entityId}
          </SheetDescription>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="departments">Departments</TabsTrigger>
            <TabsTrigger value="cycles">Scrap Cycles</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="mt-4">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No audit events recorded yet</p>
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-280px)]">
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                  <div className="space-y-4 pl-10">
                    {events.map((event) => {
                      const Icon = actionIcons[event.action] || actionIcons.default;
                      const colorClass = actionColors[event.action] || actionColors.default;

                      return (
                        <div
                          key={event.id}
                          className="relative"
                          data-testid={`audit-event-${event.id}`}
                        >
                          <div
                            className={`absolute -left-10 w-8 h-8 rounded-full border-2 flex items-center justify-center ${colorClass}`}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <Card>
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between">
                                <div>
                                  <Badge variant="outline" className={colorClass}>
                                    {event.action.replace(/_/g, ' ')}
                                  </Badge>
                                  {event.reason && (
                                    <p className="text-sm mt-2">{event.reason}</p>
                                  )}
                                </div>
                                <div className="text-right text-xs text-muted-foreground">
                                  <div>
                                    {format(new Date(event.createdAt), 'MMM d, yyyy')}
                                  </div>
                                  <div>
                                    {format(new Date(event.createdAt), 'h:mm a')}
                                  </div>
                                </div>
                              </div>

                              {event.fieldsChanged && Object.keys(event.fieldsChanged).length > 0 && (
                                <div className="mt-3 pt-3 border-t space-y-2">
                                  {Object.entries(event.fieldsChanged).map(([field, change]) => (
                                    <div key={field} className="text-sm">
                                      <span className="font-medium">{field}:</span>{' '}
                                      <span className="text-muted-foreground line-through">
                                        {formatValue(change.before)}
                                      </span>{' '}
                                      <ArrowRight className="inline h-3 w-3" />{' '}
                                      <span className="text-foreground">
                                        {formatValue(change.after)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {event.actorName && (
                                <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                                  <User className="h-3 w-3" />
                                  {event.actorName}
                                  {event.actorRole && (
                                    <Badge variant="outline" className="text-xs ml-1">
                                      {event.actorRole}
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="departments" className="mt-4">
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Total Production Time
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {totalTimeMinutes > 0 ? formatDuration(totalTimeMinutes) : 'N/A'}
                    </div>
                  </CardContent>
                </Card>

                {Object.keys(timeSummary).length > 0 ? (
                  <div className="space-y-2">
                    {Object.entries(timeSummary).map(([dept, minutes]) => (
                      <div
                        key={dept}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <span className="font-medium">{dept}</span>
                        <Badge variant="secondary">{formatDuration(minutes)}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No department transitions recorded</p>
                  </div>
                )}

                {transitions.length > 0 && (
                  <Card className="mt-4">
                    <CardHeader>
                      <CardTitle className="text-sm">Transition History</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-64">
                        <div className="space-y-2">
                          {transitions.map((t) => (
                            <div
                              key={t.id}
                              className="flex items-center justify-between p-2 border rounded text-sm"
                            >
                              <div>
                                <div className="font-medium">{t.department}</div>
                                <div className="text-xs text-muted-foreground">
                                  Cycle {t.cycleNumber} -{' '}
                                  {format(new Date(t.enteredAt), 'MMM d, h:mm a')}
                                </div>
                              </div>
                              <div className="text-right">
                                {t.durationMinutes ? (
                                  <Badge variant="outline">
                                    {formatDuration(t.durationMinutes)}
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">In Progress</Badge>
                                )}
                                {t.exitReason && t.exitReason !== 'completed' && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    {t.exitReason}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="cycles" className="mt-4">
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : scrapCycles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50 text-green-500" />
                <p>No scrap events - clean production run!</p>
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-280px)]">
                <div className="space-y-4">
                  {scrapCycles.map((cycle) => (
                    <Card key={cycle.id} className="border-red-200">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-red-500" />
                            Cycle {cycle.cycleNumber} - Scrapped
                          </span>
                          <Badge variant="destructive">
                            {format(new Date(cycle.scrappedAt), 'MMM d, yyyy')}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div>
                          <span className="text-sm text-muted-foreground">Reason:</span>
                          <p className="text-sm font-medium">{cycle.scrapReason}</p>
                        </div>
                        {cycle.scrapDepartment && (
                          <div>
                            <span className="text-sm text-muted-foreground">Department:</span>
                            <p className="text-sm">{cycle.scrapDepartment}</p>
                          </div>
                        )}
                        {cycle.restartEntityId ? (
                          <div className="pt-2 border-t">
                            <Badge variant="outline" className="bg-green-50 text-green-700">
                              Restarted as {cycle.restartEntityId}
                            </Badge>
                            {cycle.restartedAt && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {formatDistanceToNow(new Date(cycle.restartedAt), {
                                  addSuffix: true,
                                })}
                              </p>
                            )}
                          </div>
                        ) : (
                          <Badge variant="outline" className="bg-yellow-50 text-yellow-700">
                            Not Restarted
                          </Badge>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
