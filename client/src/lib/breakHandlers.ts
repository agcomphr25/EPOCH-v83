export interface BreakHandlerDeps {
  startBreak: () => Promise<void>;
  endBreak: () => Promise<void>;
  invalidateQueries: (opts: { queryKey: string[] }) => void;
  refetchHours: () => void;
  toast: (opts: { title: string; variant?: string }) => void;
}

export const SESSIONS_QUERY_KEY = '/api/labor/sessions';

export async function runHandleStartBreak(deps: BreakHandlerDeps): Promise<void> {
  const { startBreak, invalidateQueries, toast } = deps;
  try {
    await startBreak();
    invalidateQueries({ queryKey: [SESSIONS_QUERY_KEY] });
    toast({ title: 'Break started' });
  } catch {
    toast({ title: 'Failed to start break', variant: 'destructive' });
  }
}

export async function runHandleEndBreak(deps: BreakHandlerDeps): Promise<void> {
  const { endBreak, invalidateQueries, refetchHours, toast } = deps;
  try {
    await endBreak();
    refetchHours();
    invalidateQueries({ queryKey: [SESSIONS_QUERY_KEY] });
    toast({ title: 'Break ended — back to work!' });
  } catch {
    toast({ title: 'Failed to end break', variant: 'destructive' });
  }
}
