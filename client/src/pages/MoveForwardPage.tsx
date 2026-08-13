import { useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Brain,
  Check,
  Circle,
  History,
  Lightbulb,
  Mic,
  MicOff,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';

import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

type Item = {
  id?: number;
  itemType: string;
  title: string;
  details?: string | null;
  category?: string | null;
  priority: string;
  dueDate?: string | null;
  amountCents?: number | null;
  status?: string;
};
type Capture = {
  id: number;
  originalText: string;
  status: string;
  updatedAt: string;
};
type Question = { id: number; question: string };
type Dashboard = {
  today: Item[];
  upcoming: Item[];
  unprocessed: Capture[];
  pendingRules: Array<{ id: number; triggerText: string; instruction: string }>;
  history: Item[];
};

const TYPES = [
  ['task', 'Task'],
  ['reminder', 'Reminder / commitment'],
  ['accounting_attention', 'Accounting attention'],
  ['production_quality_discussion', 'Production / quality discussion'],
  ['compliance_attention', 'Compliance attention'],
  ['person_follow_up', 'Person follow-up'],
  ['idea_process_improvement', 'Idea / process improvement'],
  ['reference_note', 'Reference note'],
];

function dollars(cents?: number | null) {
  return cents == null
    ? ''
    : `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

export default function MoveForwardPage() {
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [capture, setCapture] = useState<Capture | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [question, setQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState('');
  const [search, setSearch] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const { data } = useQuery<Dashboard>({
    queryKey: ['/api/move-forward/dashboard', search],
    queryFn: async () =>
      (
        await fetch(
          `/api/move-forward/dashboard${search ? `?search=${encodeURIComponent(search)}` : ''}`,
          { credentials: 'include' }
        )
      ).json(),
  });

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ['/api/move-forward/dashboard'],
    });
  const analyze = useMutation({
    mutationFn: async (id: number) =>
      (
        await apiRequest(`/api/move-forward/captures/${id}/analyze`, {
          method: 'POST',
        })
      ).json(),
    onSuccess: (result) => {
      if (result.unprocessed) {
        toast({
          title: 'Saved to Unprocessed',
          description: 'Analysis can be retried later.',
        });
        resetCapture();
        refresh();
        return;
      }
      setItems(result.items || []);
      setQuestion(result.question);
      setCapture(result.capture);
    },
    onError: () =>
      toast({
        title: 'The draft is safe',
        description: 'Analysis could not run. It remains in Unprocessed.',
        variant: 'destructive',
      }),
  });
  const saveDraft = useMutation({
    mutationFn: async ({
      originalText,
      inputMethod,
    }: {
      originalText: string;
      inputMethod: string;
    }) =>
      (
        await apiRequest('/api/move-forward/captures', {
          method: 'POST',
          body: { originalText, inputMethod },
        })
      ).json(),
    onSuccess: (saved) => {
      setCapture(saved);
      analyze.mutate(saved.id);
    },
  });
  const clarify = useMutation({
    mutationFn: async ({ deferred = false }: { deferred?: boolean }) =>
      (
        await apiRequest(
          `/api/move-forward/captures/${capture!.id}/clarifications/${question!.id}`,
          {
            method: 'POST',
            body: { answer: deferred ? 'Ask me later' : answer },
          }
        )
      ).json(),
    onSuccess: (result) => {
      setQuestion(result.question);
      setItems(result.items || items);
      setAnswer('');
    },
  });
  const confirm = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/move-forward/captures/${capture!.id}/confirm`, {
        method: 'POST',
        body: { items },
      }),
    onSuccess: () => {
      toast({
        title: 'Moved forward',
        description: `${items.length} item${items.length === 1 ? '' : 's'} saved.`,
      });
      resetCapture();
      refresh();
    },
  });
  const complete = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/move-forward/items/${id}/complete`, { method: 'PATCH' }),
    onSuccess: refresh,
  });

  function resetCapture() {
    setText('');
    setCapture(null);
    setItems([]);
    setQuestion(null);
    setAnswer('');
  }
  function begin() {
    if (text.trim())
      saveDraft.mutate({ originalText: text.trim(), inputMethod: 'typed' });
  }
  function updateItem(index: number, patch: Partial<Item>) {
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item))
    );
  }

  async function toggleRecording() {
    if (isRecording) {
      recorder.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      recorder.current = mediaRecorder;
      chunks.current = [];
      mediaRecorder.ondataavailable = (event) =>
        chunks.current.push(event.data);
      mediaRecorder.onstop = async () => {
        setIsRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks.current, {
          type: mediaRecorder.mimeType || 'audio/webm',
        });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        bytes.forEach((byte) => {
          binary += String.fromCharCode(byte);
        });
        try {
          const result = await (
            await apiRequest('/api/move-forward/transcribe', {
              method: 'POST',
              body: { audio: btoa(binary), inputFormat: 'webm' },
            })
          ).json();
          setText(result.text || '');
        } catch {
          toast({
            title: 'Could not transcribe recording',
            variant: 'destructive',
          });
        }
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      toast({
        title: 'Microphone access is unavailable',
        variant: 'destructive',
      });
    }
  }

  return (
    <div
      className="max-w-6xl mx-auto space-y-5"
      data-testid="move-forward-page"
    >
      <div className="flex items-center gap-3">
        <Brain className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Move Forward</h1>
          <p className="text-sm text-muted-foreground">
            Get it out of your head. Turn it into useful next steps.
          </p>
        </div>
      </div>

      <Card className="border-primary/30 shadow-sm">
        <CardContent className="pt-6 space-y-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!!capture}
            rows={4}
            placeholder="Type or speak whatever is on your mind…"
            className="text-base"
          />
          <div className="flex justify-between gap-2">
            <Button
              variant={isRecording ? 'destructive' : 'outline'}
              onClick={toggleRecording}
              disabled={!!capture}
            >
              {isRecording ? (
                <MicOff className="h-4 w-4 mr-2" />
              ) : (
                <Mic className="h-4 w-4 mr-2" />
              )}
              {isRecording ? 'Stop' : 'Speak'}
            </Button>
            <Button
              onClick={begin}
              disabled={
                !text.trim() ||
                !!capture ||
                saveDraft.isPending ||
                analyze.isPending
              }
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {saveDraft.isPending || analyze.isPending
                ? 'Organizing…'
                : 'Organize this'}
            </Button>
          </div>
          {capture && (
            <p className="text-xs text-emerald-700 flex items-center gap-1">
              <Check className="h-3 w-3" />
              Draft saved privately
            </p>
          )}
        </CardContent>
      </Card>

      {question && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-base">One quick question</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>{question.question}</p>
            <div className="flex gap-2">
              <Input
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && answer.trim()) clarify.mutate({});
                }}
                placeholder="Your answer…"
              />
              <Button
                onClick={() => clarify.mutate({})}
                disabled={!answer.trim()}
              >
                Answer
              </Button>
              <Button
                variant="ghost"
                onClick={() => clarify.mutate({ deferred: true })}
              >
                Ask me later
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {capture && !question && items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review what EPOCH found</CardTitle>
            <p className="text-sm text-muted-foreground">
              Edit, remove, or add items. Nothing becomes active until you
              confirm.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.map((item, index) => (
              <div
                key={`${item.id || 'new'}-${index}`}
                className="grid gap-2 rounded-lg border p-3 md:grid-cols-[190px_1fr_130px_140px_36px]"
              >
                <Select
                  value={item.itemType}
                  onValueChange={(value) =>
                    updateItem(index, { itemType: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={item.title}
                  onChange={(e) => updateItem(index, { title: e.target.value })}
                />
                <Select
                  value={item.priority}
                  onValueChange={(priority) => updateItem(index, { priority })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['CRITICAL', 'HIGH', 'NORMAL', 'LOW'].map((p) => (
                      <SelectItem value={p} key={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={item.dueDate || ''}
                  onChange={(e) =>
                    updateItem(index, { dueDate: e.target.value || null })
                  }
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() =>
                    setItems((current) => current.filter((_, i) => i !== index))
                  }
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
                {(item.amountCents != null || item.category) && (
                  <div className="md:col-start-2 md:col-span-3 text-xs text-muted-foreground">
                    {item.category}
                    {item.amountCents != null
                      ? ` · ${dollars(item.amountCents)}`
                      : ''}
                  </div>
                )}
              </div>
            ))}
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() =>
                  setItems((current) => [
                    ...current,
                    {
                      itemType: 'task',
                      title: '',
                      priority: 'NORMAL',
                      dueDate: null,
                    },
                  ])
                }
              >
                <Plus className="h-4 w-4 mr-2" />
                Add item
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={resetCapture}>
                  Cancel
                </Button>
                <Button
                  onClick={() => confirm.mutate()}
                  disabled={
                    !items.length ||
                    items.some((i) => !i.title.trim()) ||
                    confirm.isPending
                  }
                >
                  <Check className="h-4 w-4 mr-2" />
                  Confirm {items.length} item{items.length === 1 ? '' : 's'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!capture && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <ItemList
              title="Move today"
              icon={<Send className="h-4 w-4" />}
              items={data?.today || []}
              onComplete={(id) => complete.mutate(id)}
            />
            <ItemList
              title="Coming up"
              icon={<Circle className="h-4 w-4" />}
              items={data?.upcoming || []}
              onComplete={(id) => complete.mutate(id)}
            />
          </div>
          {(data?.unprocessed?.length || 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Needs clarification or processing
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data!.unprocessed.map((draft) => (
                  <div
                    className="flex items-center justify-between border rounded p-3"
                    key={draft.id}
                  >
                    <span className="text-sm line-clamp-2">
                      {draft.originalText}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setText(draft.originalText);
                        setCapture(draft);
                        analyze.mutate(draft.id);
                      }}
                    >
                      Process
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" />
                Search history
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search original concepts, actions, categories, dates, or amounts…"
                />
              </div>
              {search && (
                <div className="space-y-2">
                  {data?.history.map((item) => (
                    <div key={item.id} className="border rounded p-3">
                      <div className="flex gap-2">
                        <Badge variant="outline">
                          {TYPES.find((t) => t[0] === item.itemType)?.[1] ||
                            item.itemType}
                        </Badge>
                        <span className="font-medium text-sm">
                          {item.title}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          {(data?.pendingRules?.length || 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Lightbulb className="h-4 w-4" />
                  Suggested learning rules
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data!.pendingRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex justify-between gap-3 border rounded p-3"
                  >
                    <span className="text-sm">
                      <strong>{rule.triggerText}:</strong> {rule.instruction}
                    </span>
                    <Button
                      size="sm"
                      onClick={async () => {
                        await apiRequest(
                          `/api/move-forward/rules/${rule.id}/approve`,
                          { method: 'PATCH' }
                        );
                        refresh();
                      }}
                    >
                      Approve
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function ItemList({
  title,
  icon,
  items,
  onComplete,
}: {
  title: string;
  icon: ReactNode;
  items: Item[];
  onComplete: (id: number) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {icon}
          {title}
          <Badge variant="secondary">{items.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing here.</p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-2 border rounded-md p-3"
            >
              <button
                onClick={() => item.id && onComplete(item.id)}
                className="mt-0.5"
              >
                <Circle className="h-4 w-4 text-muted-foreground hover:text-green-600" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {item.category ||
                    TYPES.find((t) => t[0] === item.itemType)?.[1]}
                  {item.dueDate ? ` · ${item.dueDate}` : ''}
                  {item.amountCents != null
                    ? ` · ${dollars(item.amountCents)}`
                    : ''}
                </p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
