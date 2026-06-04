import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Bot,
  ExternalLink,
  Loader2,
  MessageSquare,
  Plus,
  Save,
  Search,
  Send,
  Sparkles,
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
  username: string;
  createdAt: string;
  updatedAt: string;
};

type RecordCard = {
  type: 'order' | 'customer' | 'purchase_order';
  id: string;
  title: string;
  subtitle: string;
  href: string;
  badges: string[];
};

type CopilotGuide = {
  title: string;
  status: 'approved' | 'draft';
  label: string;
  routeHints: Array<{ label: string; href: string }>;
  steps: Array<{ title: string; body: string; href?: string }>;
};

type CopilotPayload = {
  answer: string;
  mode: 'record_search' | 'how_to' | 'mixed' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  recordCards: RecordCard[];
  guide?: CopilotGuide;
  followUpQuestions: string[];
  ownerFinancialPlaceholder: {
    enabled: false;
    message: string;
  };
};

type CopilotMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  payload?: CopilotPayload | null;
  createdAt: string;
};

type ConversationDetail = {
  conversation: Conversation;
  messages: CopilotMessage[];
};

const starterPrompts = [
  'How do I create a new order?',
  'Find customer Dan Vastyn',
  'Find purchase order Alpine',
  'Who worked on order ROC2600123?',
];

function formatDate(value?: string) {
  if (!value) return '';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function recordTypeLabel(type: RecordCard['type']) {
  if (type === 'purchase_order') return 'Purchase Order';
  return type === 'order' ? 'Order' : 'Customer';
}

export default function EpochCopilotPage() {
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [draftMessage, setDraftMessage] = useState('');
  const [optimisticMessages, setOptimisticMessages] = useState<
    CopilotMessage[]
  >([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: conversations = [], isLoading: conversationsLoading } =
    useQuery<Conversation[]>({
      queryKey: ['/api/epoch-copilot/conversations'],
      queryFn: async () => apiRequest('/api/epoch-copilot/conversations'),
    });

  const { data: activeConversation, isLoading: messagesLoading } =
    useQuery<ConversationDetail>({
      queryKey: ['/api/epoch-copilot/conversations', activeConversationId],
      queryFn: async () =>
        apiRequest(`/api/epoch-copilot/conversations/${activeConversationId}`),
      enabled: Boolean(activeConversationId),
    });

  const visibleMessages = useMemo(() => {
    return [...(activeConversation?.messages || []), ...optimisticMessages];
  }, [activeConversation?.messages, optimisticMessages]);

  useEffect(() => {
    if (!activeConversationId && conversations.length > 0) {
      setActiveConversationId(conversations[0].id);
    }
  }, [activeConversationId, conversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }, [visibleMessages.length]);

  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      const suffix = activeConversationId
        ? `/${activeConversationId}/messages`
        : '/messages';
      return apiRequest(`/api/epoch-copilot/conversations${suffix}`, {
        method: 'POST',
        body: { message },
      });
    },
    onMutate: async (message) => {
      setOptimisticMessages((prev) => [
        ...prev,
        {
          id: `pending-${Date.now()}`,
          role: 'user',
          content: message,
          createdAt: new Date().toISOString(),
        },
      ]);
    },
    onSuccess: (data: { conversation: Conversation }) => {
      setActiveConversationId(data.conversation.id);
      setDraftMessage('');
      setOptimisticMessages([]);
      queryClient.invalidateQueries({
        queryKey: ['/api/epoch-copilot/conversations'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/epoch-copilot/conversations', data.conversation.id],
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Copilot error',
        description: error?.message || 'Failed to ask EPOCH Copilot.',
        variant: 'destructive',
      });
    },
  });

  const createConversationMutation = useMutation({
    mutationFn: async () =>
      apiRequest('/api/epoch-copilot/conversations', {
        method: 'POST',
        body: { title: 'New Copilot conversation' },
      }),
    onSuccess: (conversation: Conversation) => {
      setActiveConversationId(conversation.id);
      setOptimisticMessages([]);
      queryClient.invalidateQueries({
        queryKey: ['/api/epoch-copilot/conversations'],
      });
    },
  });

  const saveGuideMutation = useMutation({
    mutationFn: async ({
      guide,
      prompt,
    }: {
      guide: CopilotGuide;
      prompt?: string;
    }) => {
      return apiRequest('/api/epoch-copilot/draft-guides', {
        method: 'POST',
        body: {
          title: guide.title,
          prompt,
          guide,
        },
      });
    },
    onSuccess: () => {
      toast({
        title: 'Draft guide saved',
        description: 'The guide is saved for later review and refinement.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Could not save guide',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  function submitMessage(message = draftMessage) {
    const clean = message.trim();
    if (!clean || sendMessageMutation.isPending) return;
    sendMessageMutation.mutate(clean);
  }

  const latestUserPrompt = [...visibleMessages]
    .reverse()
    .find((message) => message.role === 'user')?.content;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-blue-700" />
              <h1 className="text-2xl font-semibold tracking-normal text-slate-950">
                EPOCH Copilot
              </h1>
              <Badge variant="outline">Phase 1</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Admin-only assistant for EPOCH records, how-to guides, and
              operational training capture.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => createConversationMutation.mutate()}
            disabled={createConversationMutation.isPending}
            className="gap-2"
          >
            {createConversationMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            New Chat
          </Button>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4" />
                History
              </CardTitle>
              <CardDescription>Private per-user conversations.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {conversationsLoading ? (
                <div className="text-sm text-slate-500">
                  Loading conversations...
                </div>
              ) : conversations.length === 0 ? (
                <div className="rounded-md border border-dashed p-3 text-sm text-slate-500">
                  Ask a question to start your first Copilot thread.
                </div>
              ) : (
                conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => {
                      setActiveConversationId(conversation.id);
                      setOptimisticMessages([]);
                    }}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                      activeConversationId === conversation.id
                        ? 'border-blue-300 bg-blue-50 text-blue-950'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block truncate font-medium">
                      {conversation.title}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {formatDate(conversation.updatedAt)}
                    </span>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4" />
                Starters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {starterPrompts.map((prompt) => (
                <Button
                  key={prompt}
                  type="button"
                  variant="outline"
                  className="h-auto w-full justify-start whitespace-normal text-left"
                  onClick={() => submitMessage(prompt)}
                  disabled={sendMessageMutation.isPending}
                >
                  {prompt}
                </Button>
              ))}
            </CardContent>
          </Card>
        </aside>

        <main className="flex min-h-[calc(100vh-140px)] flex-col rounded-md border bg-white">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                {activeConversation?.conversation?.title || 'Ask EPOCH Copilot'}
              </h2>
              <p className="text-xs text-slate-500">
                Orders, customers, purchase orders, and Phase 1 how-to guides.
              </p>
            </div>
            <Badge variant="secondary">Financial mode disabled</Badge>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messagesLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading messages...
              </div>
            ) : visibleMessages.length === 0 ? (
              <div className="grid min-h-[420px] place-items-center">
                <div className="max-w-md text-center">
                  <Bot className="mx-auto h-10 w-10 text-blue-700" />
                  <h3 className="mt-3 text-lg font-semibold text-slate-950">
                    Ask about EPOCH work
                  </h3>
                  <p className="mt-2 text-sm text-slate-600">
                    Try a record search, a how-to question, or a messy process
                    question you want turned into a draft guide.
                  </p>
                </div>
              </div>
            ) : (
              visibleMessages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[min(760px,100%)] rounded-md px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-blue-700 text-white'
                        : 'border bg-slate-50 text-slate-950'
                    }`}
                  >
                    <p className="whitespace-pre-wrap text-sm leading-6">
                      {message.content}
                    </p>
                    {message.payload ? (
                      <CopilotAnswer
                        payload={message.payload}
                        latestUserPrompt={latestUserPrompt}
                        onSaveGuide={(guide, prompt) =>
                          saveGuideMutation.mutate({ guide, prompt })
                        }
                        isSavingGuide={saveGuideMutation.isPending}
                      />
                    ) : null}
                  </div>
                </div>
              ))
            )}
            {sendMessageMutation.isPending ? (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-md border bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  EPOCH Copilot is thinking...
                </div>
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t p-4">
            <div className="flex gap-3">
              <Textarea
                value={draftMessage}
                onChange={(event) => setDraftMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    submitMessage();
                  }
                }}
                placeholder="Ask EPOCH Copilot about an order, customer, PO, or how to do something in EPOCH..."
                className="min-h-[56px] resize-none"
              />
              <Button
                type="button"
                onClick={() => submitMessage()}
                disabled={!draftMessage.trim() || sendMessageMutation.isPending}
                className="h-[56px] w-[56px] shrink-0 p-0"
                aria-label="Send message"
              >
                {sendMessageMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function CopilotAnswer({
  payload,
  latestUserPrompt,
  onSaveGuide,
  isSavingGuide,
}: {
  payload: CopilotPayload;
  latestUserPrompt?: string;
  onSaveGuide: (guide: CopilotGuide, prompt?: string) => void;
  isSavingGuide: boolean;
}) {
  const canSaveGuide = payload.guide?.status === 'draft';

  return (
    <div className="mt-4 space-y-3">
      {payload.recordCards?.length ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-slate-500">
            <Search className="h-3.5 w-3.5" />
            Matching EPOCH Records
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {payload.recordCards.map((card) => (
              <Link key={`${card.type}-${card.id}`} href={card.href}>
                <a className="block rounded-md border bg-white p-3 text-slate-950 transition hover:border-blue-300 hover:bg-blue-50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {card.title}
                      </div>
                      <div className="mt-1 line-clamp-2 text-xs text-slate-600">
                        {card.subtitle || recordTypeLabel(card.type)}
                      </div>
                    </div>
                    <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge variant="outline">
                      {recordTypeLabel(card.type)}
                    </Badge>
                    {card.badges?.slice(0, 2).map((badge) => (
                      <Badge key={badge} variant="secondary">
                        {badge}
                      </Badge>
                    ))}
                  </div>
                </a>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {payload.guide ? (
        <div className="rounded-md border bg-white p-3 text-slate-950">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-blue-700" />
                <h3 className="text-sm font-semibold">{payload.guide.title}</h3>
                <Badge
                  variant={
                    payload.guide.status === 'approved' ? 'default' : 'outline'
                  }
                >
                  {payload.guide.label ||
                    (payload.guide.status === 'approved'
                      ? 'Approved Guide'
                      : 'Draft Guide')}
                </Badge>
              </div>
              {payload.guide.routeHints?.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {payload.guide.routeHints.map((route) => (
                    <Link key={route.href} href={route.href}>
                      <a className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-slate-50">
                        {route.label}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
            {canSaveGuide ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => onSaveGuide(payload.guide!, latestUserPrompt)}
                disabled={isSavingGuide}
              >
                {isSavingGuide ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save as Draft Guide
              </Button>
            ) : null}
          </div>
          <ol className="mt-3 space-y-2">
            {payload.guide.steps?.map((step, index) => (
              <li
                key={`${step.title}-${index}`}
                className="rounded-md bg-slate-50 p-3"
              >
                <div className="text-sm font-semibold">
                  {index + 1}. {step.title}
                </div>
                <div className="mt-1 text-sm text-slate-700">{step.body}</div>
                {step.href ? (
                  <Link href={step.href}>
                    <a className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
                      Open related page
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </Link>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {payload.followUpQuestions?.length ? (
        <div className="rounded-md border border-dashed bg-white p-3 text-slate-700">
          <div className="text-xs font-semibold uppercase tracking-normal text-slate-500">
            Good follow-up questions
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {payload.followUpQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
