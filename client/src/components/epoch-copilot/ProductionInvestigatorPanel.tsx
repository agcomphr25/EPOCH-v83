import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FlaskConical,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  ShieldCheck,
  Wrench,
  XCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  payload?: { partial?: boolean; traceId?: string } | null;
  createdAt: string;
};

type Activity = {
  id?: string;
  messageId?: string;
  traceId: string;
  sequence: number;
  toolName: string;
  sanitizedArguments: Record<string, string>;
  rationale: string;
  status: 'success' | 'failure';
  resultSummary: string;
  durationMs: number;
  errorCode?: string | null;
};

type ConversationDetail = {
  conversation: Conversation;
  messages: Message[];
  activities: Activity[];
};

const starters = [
  'What department is FD740 in?',
  'Has FD740 had any production problems?',
  'Something seems wrong with FD740. Investigate it.',
];

function activityHref(activity: Activity): string | null {
  const order = activity.sanitizedArguments.order_number;
  const department = activity.sanitizedArguments.department;
  if (activity.toolName === 'get_order' && order)
    return `/orders-list?search=${encodeURIComponent(order)}`;
  if (activity.toolName === 'get_order_history' && order)
    return `/admin/inspector/production-order?orderId=${encodeURIComponent(order)}`;
  if (activity.toolName === 'get_kickbacks' && order)
    return `/kickback-tracking?orderId=${encodeURIComponent(order)}`;
  if (activity.toolName === 'get_department_status' && department)
    return `/admin/control-tower?department=${encodeURIComponent(department)}`;
  return null;
}

function formatArguments(args: Record<string, string>) {
  return Object.entries(args)
    .map(([key, value]) => `${key}: "${value}"`)
    .join(', ');
}

export default function ProductionInvestigatorPanel({
  onReturnToCopilot,
}: {
  onReturnToCopilot: () => void;
}) {
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ['/api/production-investigator/conversations'],
    queryFn: () => apiRequest('/api/production-investigator/conversations'),
  });

  const { data: detail, isLoading } = useQuery<ConversationDetail>({
    queryKey: [
      '/api/production-investigator/conversations',
      activeConversationId,
    ],
    queryFn: () =>
      apiRequest(
        `/api/production-investigator/conversations/${activeConversationId}`
      ),
    enabled: Boolean(activeConversationId),
  });

  useEffect(() => {
    if (!activeConversationId && conversations.length > 0) {
      setActiveConversationId(conversations[0].id);
    }
  }, [activeConversationId, conversations]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [detail?.messages.length]);

  const activitiesByMessage = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const activity of detail?.activities || []) {
      if (!activity.messageId) continue;
      map.set(activity.messageId, [
        ...(map.get(activity.messageId) || []),
        activity,
      ]);
    }
    return map;
  }, [detail?.activities]);

  const createConversation = useMutation({
    mutationFn: () =>
      apiRequest('/api/production-investigator/conversations', {
        method: 'POST',
        body: { title: 'New production investigation' },
      }),
    onSuccess: (conversation: Conversation) => {
      setActiveConversationId(conversation.id);
      queryClient.invalidateQueries({
        queryKey: ['/api/production-investigator/conversations'],
      });
    },
  });

  const send = useMutation({
    mutationFn: (message: string) => {
      const suffix = activeConversationId
        ? `/${activeConversationId}/messages`
        : '/messages';
      return apiRequest(`/api/production-investigator/conversations${suffix}`, {
        method: 'POST',
        body: { message },
      });
    },
    onSuccess: (response: { conversation: Conversation }) => {
      setActiveConversationId(response.conversation.id);
      setDraft('');
      queryClient.invalidateQueries({
        queryKey: ['/api/production-investigator/conversations'],
      });
      queryClient.invalidateQueries({
        queryKey: [
          '/api/production-investigator/conversations',
          response.conversation.id,
        ],
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Investigation failed',
        description:
          error?.message ||
          'The Production Investigator could not complete the request.',
        variant: 'destructive',
      });
    },
  });

  function submit(value = draft) {
    const message = value.trim();
    if (!message || send.isPending) return;
    send.mutate(message);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-amber-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <FlaskConical className="h-5 w-5 text-amber-700" />
              <h1 className="text-2xl font-semibold text-slate-950">
                Production Investigator
              </h1>
              <Badge className="bg-amber-100 text-amber-950 hover:bg-amber-100">
                Experimental
              </Badge>
              <Badge variant="outline" className="gap-1">
                <ShieldCheck className="h-3 w-3" />
                Read only
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Investigates production orders with controlled EPOCH tools and a
              visible audit trail.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onReturnToCopilot}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" /> Normal Copilot
            </Button>
            <Button
              type="button"
              onClick={() => createConversation.mutate()}
              className="gap-2"
            >
              <Plus className="h-4 w-4" /> New Investigation
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4" />
                Investigation history
              </CardTitle>
              <CardDescription>
                Stored separately from normal Copilot chats.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {conversations.length === 0 ? (
                <p className="text-sm text-slate-500">No investigations yet.</p>
              ) : (
                conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => setActiveConversationId(conversation.id)}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm ${activeConversationId === conversation.id ? 'border-amber-300 bg-amber-50' : 'bg-white hover:bg-slate-50'}`}
                  >
                    <span className="block truncate font-medium">
                      {conversation.title}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {new Date(conversation.updatedAt).toLocaleString()}
                    </span>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Try with FD740</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {starters.map((starter) => (
                <Button
                  key={starter}
                  variant="outline"
                  className="h-auto w-full justify-start whitespace-normal text-left"
                  onClick={() => submit(starter)}
                  disabled={send.isPending}
                >
                  {starter}
                </Button>
              ))}
            </CardContent>
          </Card>
        </aside>

        <main className="flex min-h-[calc(100vh-140px)] flex-col rounded-md border bg-white">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold">
              {detail?.conversation.title || 'Ask the Production Investigator'}
            </h2>
            <p className="text-xs text-slate-500">
              Maximum five read-only tool calls per question.
            </p>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : null}
            {!isLoading && !detail?.messages.length ? (
              <div className="grid min-h-[400px] place-items-center text-center">
                <div className="max-w-md">
                  <Wrench className="mx-auto h-10 w-10 text-amber-700" />
                  <h3 className="mt-3 text-lg font-semibold">
                    Investigate an EPOCH production order
                  </h3>
                  <p className="mt-2 text-sm text-slate-600">
                    Ask what happened, whether an order is at risk, or why it
                    may be delayed. Every lookup will appear in Agent Activity.
                  </p>
                </div>
              </div>
            ) : null}
            {detail?.messages.map((message) => {
              const activities = activitiesByMessage.get(message.id) || [];
              return (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[min(820px,100%)] rounded-md px-4 py-3 ${message.role === 'user' ? 'bg-blue-700 text-white' : 'border bg-slate-50'}`}
                  >
                    <p className="whitespace-pre-wrap text-sm leading-6">
                      {message.content}
                    </p>
                    {message.role === 'assistant' &&
                    message.payload?.partial ? (
                      <Badge
                        variant="outline"
                        className="mt-3 border-amber-400 bg-amber-50"
                      >
                        Partial answer
                      </Badge>
                    ) : null}
                    {activities.length > 0 ? (
                      <div className="mt-4 space-y-2 border-t pt-3 text-slate-950">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                          <Wrench className="h-3.5 w-3.5" />
                          Agent Activity
                        </div>
                        {activities.map((activity) => {
                          const href = activityHref(activity);
                          return (
                            <div
                              key={`${activity.traceId}-${activity.sequence}`}
                              className="rounded-md border bg-white p-3 text-sm"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2 font-medium">
                                  {activity.status === 'success' ? (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                  ) : (
                                    <XCircle className="h-4 w-4 text-red-600" />
                                  )}
                                  {activity.sequence}. {activity.toolName}
                                </div>
                                <span className="flex items-center gap-1 text-xs text-slate-500">
                                  <Clock3 className="h-3 w-3" />
                                  {activity.durationMs} ms
                                </span>
                              </div>
                              <code className="mt-2 block rounded bg-slate-100 px-2 py-1 text-xs">
                                {activity.toolName}({'{'}
                                {formatArguments(activity.sanitizedArguments)}
                                {'}'})
                              </code>
                              <p className="mt-2 text-xs">
                                <span className="font-semibold">Why:</span>{' '}
                                {activity.rationale}
                              </p>
                              <p className="mt-1 text-xs text-slate-600">
                                <span className="font-semibold text-slate-800">
                                  Result:
                                </span>{' '}
                                {activity.resultSummary}
                              </p>
                              {href ? (
                                <Link href={href}>
                                  <a className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
                                    Verify in EPOCH{' '}
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                </Link>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {send.isPending ? (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-md border bg-amber-50 px-4 py-3 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Investigating with read-only EPOCH tools…
                </div>
              </div>
            ) : null}
            <div ref={endRef} />
          </div>
          <div className="border-t p-4">
            <div className="flex gap-3">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
                placeholder="Ask about a production order…"
                className="min-h-[56px] resize-none"
              />
              <Button
                type="button"
                onClick={() => submit()}
                disabled={!draft.trim() || send.isPending}
                className="h-[56px] w-[56px] p-0"
                aria-label="Investigate"
              >
                <Send className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
