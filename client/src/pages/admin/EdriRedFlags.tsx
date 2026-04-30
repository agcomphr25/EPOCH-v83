import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { AlertOctagon, CheckCircle2, Filter } from 'lucide-react';
import EdriSubNav from '@/components/EdriSubNav';
import { format } from 'date-fns';

const DOMAIN_LABELS: Record<string, string> = {
  TIMEKEEPING: 'Timekeeping', CHARGE_CODE: 'Charge Code', ACCOUNTING: 'Accounting',
  PROCUREMENT: 'Procurement', INVENTORY: 'Inventory', POLICY: 'Policy', GOVT_PROPERTY: 'Govt. Property',
};

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    HIGH: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    MEDIUM: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    LOW: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[severity] ?? ''}`}>{severity}</span>;
}

export default function EdriRedFlags() {
  const { toast } = useToast();
  const [domainFilter, setDomainFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState('all');
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [selectedFlag, setSelectedFlag] = useState<any>(null);
  const [resolutionNote, setResolutionNote] = useState('');

  const params = new URLSearchParams();
  if (domainFilter !== 'all') params.set('domainKey', domainFilter);
  if (severityFilter !== 'all') params.set('severity', severityFilter);
  if (activeFilter !== 'all') params.set('isActive', activeFilter);

  const { data: flags = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/edri/red-flags', domainFilter, severityFilter, activeFilter],
    queryFn: async () => {
      const res = await fetch(`/api/edri/red-flags?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) =>
      apiRequest('PATCH', `/api/edri/red-flags/${id}/resolve`, { resolutionNote: note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/edri/red-flags'] });
      queryClient.invalidateQueries({ queryKey: ['/api/edri/snapshot/latest'] });
      setResolveDialogOpen(false);
      setResolutionNote('');
      toast({ title: 'Red flag resolved' });
    },
    onError: () => toast({ title: 'Failed to resolve flag', variant: 'destructive' }),
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <EdriSubNav />

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <AlertOctagon className="h-8 w-8 text-red-500" />
            Red Flag Engine
          </h1>
          <p className="text-muted-foreground">Active and resolved DCAA compliance violations</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Filter className="h-4 w-4" />Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Domain</Label>
              <Select value={domainFilter} onValueChange={setDomainFilter}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Domains</SelectItem>
                  {Object.entries(DOMAIN_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Severity</Label>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="CRITICAL">Critical</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={activeFilter} onValueChange={setActiveFilter}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="true">Active Only</SelectItem>
                  <SelectItem value="false">Resolved Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : flags.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
          <p className="text-muted-foreground">No red flags match the current filters</p>
        </div>
      ) : (
        <div className="space-y-3">
          {flags.map((flag: any) => (
            <div key={flag.id} className={`p-4 rounded-lg border ${flag.isActive ? 'bg-background' : 'bg-muted/30'}`}>
              <div className="flex items-start gap-3">
                <AlertOctagon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${flag.severity === 'CRITICAL' ? 'text-red-500' : flag.severity === 'HIGH' ? 'text-orange-500' : 'text-yellow-500'}`} />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <SeverityBadge severity={flag.severity} />
                    <Badge variant="outline" className="text-xs">{DOMAIN_LABELS[flag.domainKey] ?? flag.domainKey}</Badge>
                    <span className="font-semibold text-sm">{flag.title}</span>
                    {!flag.isActive && <Badge className="bg-green-100 text-green-800 text-xs">Resolved</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{flag.description}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {flag.farCitation && <span className="text-blue-600 dark:text-blue-400">FAR: {flag.farCitation}</span>}
                    <span>Detected: {flag.detectedAt ? format(new Date(flag.detectedAt), 'MMM d, yyyy') : '—'}</span>
                    {flag.resolvedAt && <span>Resolved: {format(new Date(flag.resolvedAt), 'MMM d, yyyy')} by {flag.resolvedByDisplayName}</span>}
                    <span>Recovery: +{flag.potentialScoreRecovery ?? 0} pts</span>
                  </div>
                  {flag.resolutionNote && (
                    <p className="text-xs italic text-muted-foreground">Resolution: {flag.resolutionNote}</p>
                  )}
                </div>
                {flag.isActive && (
                  <Button size="sm" variant="outline" onClick={() => { setSelectedFlag(flag); setResolveDialogOpen(true); }}>
                    Resolve
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Red Flag</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{selectedFlag?.title}</p>
            <div className="space-y-1">
              <Label>Resolution Note <span className="text-red-500">*</span></Label>
              <Textarea
                placeholder="Describe the corrective action taken..."
                value={resolutionNote}
                onChange={e => setResolutionNote(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => selectedFlag && resolveMutation.mutate({ id: selectedFlag.id, note: resolutionNote })}
              disabled={!resolutionNote.trim() || resolveMutation.isPending}
            >
              {resolveMutation.isPending ? 'Resolving...' : 'Mark Resolved'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
