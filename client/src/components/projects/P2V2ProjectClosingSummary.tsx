import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Lock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function P2V2ProjectClosingSummary({
  projectId,
}: {
  projectId: string;
}) {
  const { data } = useQuery<{
    closingUnlocked: boolean;
    nextAction?: string;
  }>({
    queryKey: [
      '/api/projects',
      projectId,
      'workflow-v2',
      'p2-handoff',
      'closing-summary',
    ],
    queryFn: async () => {
      const response = await fetch(
        `/api/projects/${projectId}/workflow-v2/p2-handoff`,
        { credentials: 'include' }
      );
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(body?.message || 'Unable to load P2 closing evidence');
      return {
        closingUnlocked: Boolean(body?.closingUnlocked),
        nextAction:
          typeof body?.nextAction === 'string' ? body.nextAction : undefined,
      };
    },
  });
  const unlocked = Boolean(data?.closingUnlocked);
  return (
    <Card data-testid="p2-v2-project-closing">
      <CardHeader>
        <CardTitle>Controlled Project Closing</CardTitle>
        <CardDescription>
          Project Closing is separate from Shipping and preserves every closing
          and reopening revision.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!unlocked && (
          <div className="flex gap-2 rounded bg-amber-50 p-3 text-sm text-amber-900">
            <Lock className="h-4 w-4" />
            <span>
              Not Ready — Project Closing remains locked until P2 quantities,
              Quality/Product Release, certifications, shipment, and blocking
              holds are resolved.
            </span>
          </div>
        )}
        <p className="text-sm">
          <strong>Next required action:</strong>{' '}
          {unlocked
            ? 'Open the controlled closing workspace, complete the checklist, submit, and obtain closing approval.'
            : data?.nextAction || 'Complete P2 execution.'}
        </p>
        <Button asChild variant={unlocked ? 'default' : 'outline'}>
          <a href={`/projects/${projectId}/closing`}>
            <ExternalLink className="mr-2 h-4 w-4" />
            Open authoritative Project Closing record
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
