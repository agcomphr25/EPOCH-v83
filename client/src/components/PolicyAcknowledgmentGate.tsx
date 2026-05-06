import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { ShieldAlert, Download } from 'lucide-react';

interface Policy {
  id: string;
  key: string;
  title: string;
  description: string | null;
  source: 'in-repo' | 'external-upload';
}
interface PolicyVersion {
  id: string;
  versionNumber: number;
  body: string | null;
  uploadedFileUrl: string | null;
  uploadedFileName: string | null;
  publishedAt: string;
}
interface OutstandingRow {
  policy: Policy;
  currentVersion: PolicyVersion;
}

const SUPPRESS_ROUTES = ['/login', '/badge-scan', '/p2-traveler', '/p2-traveler-viewer', '/traveler', '/production/timers'];

export default function PolicyAcknowledgmentGate() {
  const [location] = useLocation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);

  const suppressed = SUPPRESS_ROUTES.some((r) => location === r || location.startsWith(r + '/'));

  const { data: sessionUser } = useQuery<{ id: number } | null>({
    queryKey: ['/api/auth/session'],
    retry: false,
  });

  const { data: outstanding = [] } = useQuery<OutstandingRow[]>({
    queryKey: ['/api/policies/outstanding'],
    enabled: !!sessionUser?.id && !suppressed,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (suppressed) {
      setOpen(false);
      return;
    }
    if (outstanding.length > 0) {
      setOpen(true);
      setActiveIndex(0);
      setHasScrolledToEnd(false);
    } else {
      setOpen(false);
    }
  }, [outstanding.length, suppressed]);

  const current = outstanding[activeIndex];

  const ackMutation = useMutation({
    mutationFn: (key: string) => apiRequest(`/api/policies/${key}/acknowledge`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/policies/outstanding'] });
      queryClient.invalidateQueries({ queryKey: ['/api/policies/me/acknowledgments'] });
      if (activeIndex < outstanding.length - 1) {
        setActiveIndex((i) => i + 1);
        setHasScrolledToEnd(false);
      } else {
        toast({ title: 'All policies acknowledged', description: 'Thank you.' });
      }
    },
    onError: (err: any) =>
      toast({ title: 'Failed to acknowledge', description: err?.message ?? 'Unknown error', variant: 'destructive' }),
  });

  const total = outstanding.length;
  const requiresScrollGate = useMemo(() => !!current?.currentVersion.body, [current]);

  if (!current || !open) return null;

  return (
    <Dialog open={open} onOpenChange={() => { /* blocking modal — cannot dismiss */ }}>
      <DialogContent
        className="max-w-3xl max-h-[90vh]"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        data-testid="dialog-policy-ack-gate"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
            Action required: acknowledge {total === 1 ? 'this policy' : `${total} policies`}
          </DialogTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" data-testid="badge-policy-progress">
              {activeIndex + 1} of {total}
            </Badge>
            <span className="font-medium text-foreground">{current.policy.title}</span>
            <Badge variant="secondary">v{current.currentVersion.versionNumber}</Badge>
          </div>
        </DialogHeader>

        <ScrollArea
          className="max-h-[55vh] pr-4 border rounded-md p-4"
          onScrollCapture={(e) => {
            const el = e.currentTarget.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
            const target = el ?? (e.currentTarget as HTMLElement);
            if (target.scrollHeight - target.scrollTop - target.clientHeight < 24) {
              setHasScrolledToEnd(true);
            }
          }}
        >
          {current.currentVersion.body ? (
            <div className="prose prose-sm dark:prose-invert max-w-none" data-testid="text-policy-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{current.currentVersion.body}</ReactMarkdown>
            </div>
          ) : current.currentVersion.uploadedFileUrl ? (
            <div className="space-y-3">
              <p className="text-sm">
                This policy is provided as a downloadable file ({current.currentVersion.uploadedFileName}).
                Please download and read it before acknowledging.
              </p>
              <a
                href={current.currentVersion.uploadedFileUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => setHasScrolledToEnd(true)}
              >
                <Button variant="outline" className="gap-2" data-testid="button-download-policy">
                  <Download className="h-4 w-4" /> Download policy
                </Button>
              </a>
            </div>
          ) : (
            <div className="text-muted-foreground">No content available.</div>
          )}
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="text-xs text-muted-foreground mr-auto">
            {requiresScrollGate && !hasScrolledToEnd
              ? 'Scroll to the end of the policy to enable acknowledgment.'
              : 'By acknowledging you confirm you have read and understood this policy.'}
          </div>
          <Button
            onClick={() => ackMutation.mutate(current.policy.key)}
            disabled={ackMutation.isPending || (requiresScrollGate && !hasScrolledToEnd)}
            data-testid="button-acknowledge-gate"
          >
            {ackMutation.isPending ? 'Recording…' : 'I acknowledge this policy'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
