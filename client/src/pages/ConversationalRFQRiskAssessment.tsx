import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Mic,
  Pause,
  Play,
  Save,
  Send,
  Square,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import type { P2Customer } from '@shared/schema';
import {
  CONFIDENCE_THRESHOLD,
  RISK_FIELD_DEFINITIONS,
  RISK_FIELD_LABELS,
  RISK_VALUES,
  getReviewStatus,
  type MemorySuggestion,
  type RFQRiskSession,
  type RiskFieldKey,
  type RiskValue,
} from '@shared/rfqRiskAssessment';

type SpeechRecognitionConstructor = new () => {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

const statusTone: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-emerald-100 text-emerald-800',
  paused: 'bg-amber-100 text-amber-800',
  review: 'bg-blue-100 text-blue-800',
  saved: 'bg-slate-100 text-slate-700',
  completed: 'bg-emerald-100 text-emerald-800',
};

function confidenceLabel(confidence: number) {
  if (confidence >= CONFIDENCE_THRESHOLD) return 'Accepted';
  if (confidence >= 0.6) return 'Review';
  return 'Missing';
}

function fieldTone(value: RiskValue | null) {
  if (value === 'EXTREME') return 'destructive';
  if (value === 'HIGH') return 'destructive';
  if (value === 'MEDIUM') return 'secondary';
  return 'outline';
}

export default function ConversationalRFQRiskAssessment() {
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [session, setSession] = useState<RFQRiskSession | null>(null);
  const [utterance, setUtterance] = useState('');
  const [targetField, setTargetField] = useState<RiskFieldKey>('equipment_requirements');
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<InstanceType<SpeechRecognitionConstructor> | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: customers = [] } = useQuery<P2Customer[]>({
    queryKey: ['/api/p2-customers-bypass'],
  });

  const { data: sessions = [] } = useQuery<RFQRiskSession[]>({
    queryKey: ['/api/rfq-risk-sessions'],
  });

  const { data: memory = { suggestions: [] } } = useQuery<{ suggestions: MemorySuggestion[] }>({
    queryKey: ['/api/rfq-risk-sessions', session?.id, 'memory-suggestions'],
    enabled: Boolean(session?.id),
  });

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.customerId === selectedCustomerId),
    [customers, selectedCustomerId]
  );

  const startSession = useMutation({
    mutationFn: () =>
      apiRequest('/api/rfq-risk-sessions', {
        method: 'POST',
        body: {
          customerId: selectedCustomerId,
          customerName: selectedCustomer?.customerName,
        },
      }),
    onSuccess: (data: RFQRiskSession) => {
      setSession(data);
      queryClient.invalidateQueries({ queryKey: ['/api/rfq-risk-sessions'] });
      toast({ title: 'RFQ Risk Assessment Started', description: data.rfqId });
    },
  });

  const sendUtterance = useMutation({
    mutationFn: (text: string) =>
      apiRequest(`/api/rfq-risk-sessions/${session?.id}/utterances`, {
        method: 'POST',
        body: { text, targetField },
      }),
    onSuccess: (data: RFQRiskSession & { command?: { type: string } }) => {
      setSession(data);
      setUtterance('');
      queryClient.invalidateQueries({ queryKey: ['/api/rfq-risk-sessions'] });
      if (data.command?.type === 'finish') {
        toast({ title: 'Review Ready', description: 'Low-confidence and missing fields are listed below.' });
      }
    },
  });

  const updateField = useMutation({
    mutationFn: ({ field, value, notes }: { field: RiskFieldKey; value: RiskValue; notes?: string }) =>
      apiRequest(`/api/rfq-risk-sessions/${session?.id}/fields`, {
        method: 'PATCH',
        body: { field, value, notes },
      }),
    onSuccess: (data: RFQRiskSession) => setSession(data),
  });

  const setSessionAction = useMutation({
    mutationFn: (action: 'pause' | 'resume' | 'save' | 'finish') =>
      apiRequest(`/api/rfq-risk-sessions/${session?.id}/${action}`, { method: 'POST' }),
    onSuccess: (data: RFQRiskSession) => {
      setSession(data);
      queryClient.invalidateQueries({ queryKey: ['/api/rfq-risk-sessions'] });
    },
  });

  function startListening() {
    const browserWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      toast({
        title: 'Voice Unavailable',
        description: 'This browser does not expose speech recognition. Use the text capture box.',
        variant: 'destructive',
      });
      return;
    }

    const nextRecognition = new Recognition();
    nextRecognition.continuous = false;
    nextRecognition.interimResults = false;
    nextRecognition.onresult = (event: any) => {
      const text = event.results?.[0]?.[0]?.transcript ?? '';
      setUtterance(text);
      if (text && session) sendUtterance.mutate(text);
    };
    nextRecognition.onend = () => setIsListening(false);
    nextRecognition.start();
    setRecognition(nextRecognition);
    setIsListening(true);
  }

  function stopListening() {
    recognition?.stop();
    setIsListening(false);
  }

  function handleResume(existingSession: RFQRiskSession) {
    setSession(existingSession);
    setSelectedCustomerId(existingSession.customerId);
  }

  const currentFields = session?.fields;
  const review = session?.reviewSummary;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">Conversational RFQ Risk Assessment</h1>
            <p className="text-sm text-slate-600">
              Start a guided draft, capture discussion, and review structured risk outputs before release.
            </p>
          </div>
          {session && (
            <div className="flex items-center gap-2">
              <Badge className={statusTone[session.status] ?? statusTone.draft}>{session.status.replace('_', ' ')}</Badge>
              <Badge variant={session.scoreSummary.warning ? 'destructive' : 'outline'}>
                Total {session.scoreSummary.totalScore}
              </Badge>
            </div>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <section className="space-y-4">
            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle className="text-base">Session</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Customer</Label>
                  <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((customer) => (
                        <SelectItem key={customer.customerId} value={customer.customerId}>
                          {customer.customerName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full"
                  disabled={!selectedCustomerId || startSession.isPending}
                  onClick={() => startSession.mutate()}
                >
                  <Play className="mr-2 h-4 w-4" />
                  Start RFQ Risk Assessment
                </Button>
                {session && (
                  <div className="grid grid-cols-3 gap-2">
                    <Button variant="outline" size="sm" onClick={() => setSessionAction.mutate('pause')}>
                      <Pause className="mr-1 h-4 w-4" />
                      Pause
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setSessionAction.mutate('resume')}>
                      <Play className="mr-1 h-4 w-4" />
                      Resume
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setSessionAction.mutate('save')}>
                      <Save className="mr-1 h-4 w-4" />
                      Save
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle className="text-base">Resume Draft</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {sessions.length === 0 ? (
                  <p className="text-sm text-slate-500">No saved conversational drafts.</p>
                ) : (
                  sessions.slice(0, 6).map((item) => (
                    <button
                      key={item.id}
                      className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:bg-slate-50"
                      onClick={() => handleResume(item)}
                    >
                      <span>
                        <span className="font-medium">{item.rfqId}</span>
                        <span className="block text-xs text-slate-500">{item.customerName || item.customerId}</span>
                      </span>
                      <Badge variant="outline">{item.status}</Badge>
                    </button>
                  ))
                )}
              </CardContent>
            </Card>

            {session && (
              <Card className="rounded-lg">
                <CardHeader>
                  <CardTitle className="text-base">Risk Score</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md border bg-white p-3">
                      <div className="text-xs text-slate-500">Internal</div>
                      <div className="text-xl font-semibold">{session.scoreSummary.internalSubtotal}</div>
                    </div>
                    <div className="rounded-md border bg-white p-3">
                      <div className="text-xs text-slate-500">External</div>
                      <div className="text-xl font-semibold">{session.scoreSummary.externalSubtotal}</div>
                    </div>
                    <div className="rounded-md border bg-white p-3">
                      <div className="text-xs text-slate-500">Total</div>
                      <div className="text-xl font-semibold">{session.scoreSummary.totalScore}</div>
                    </div>
                  </div>
                  {session.scoreSummary.warning && (
                    <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                      <AlertTriangle className="mt-0.5 h-4 w-4" />
                      Total exceeds threshold {session.scoreSummary.warningThreshold}.
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </section>

          <main className="space-y-4">
            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span>Voice Capture</span>
                  <span className="flex items-center gap-2 text-sm font-normal text-slate-600">
                    {isListening ? <Mic className="h-4 w-4 text-emerald-700" /> : <Circle className="h-4 w-4" />}
                    {isListening ? 'Listening' : 'Idle'}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-[1fr_260px]">
                  <Textarea
                    value={utterance}
                    onChange={(event) => setUtterance(event.target.value)}
                    placeholder='Try: "We do not have the equipment" or "Mark that as high risk"'
                    className="min-h-24"
                  />
                  <div className="space-y-2">
                    <Label>Override target for "Mark that as..."</Label>
                    <Select value={targetField} onValueChange={(value) => setTargetField(value as RiskFieldKey)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RISK_FIELD_DEFINITIONS.map((field) => (
                          <SelectItem key={field.key} value={field.key}>
                            {field.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={!session || !utterance.trim()} onClick={() => sendUtterance.mutate(utterance)}>
                    <Send className="mr-2 h-4 w-4" />
                    Add Statement
                  </Button>
                  <Button variant="outline" disabled={!session || isListening} onClick={startListening}>
                    <Mic className="mr-2 h-4 w-4" />
                    Voice
                  </Button>
                  <Button variant="outline" disabled={!isListening} onClick={stopListening}>
                    <Square className="mr-2 h-4 w-4" />
                    Stop
                  </Button>
                  <Button variant="outline" disabled={!session} onClick={() => sendUtterance.mutate('Ignore that')}>
                    Ignore that
                  </Button>
                  <Button variant="outline" disabled={!session} onClick={() => setSessionAction.mutate('finish')}>
                    End assessment
                  </Button>
                </div>
              </CardContent>
            </Card>

            {session && memory.suggestions.length > 0 && (
              <Card className="rounded-lg border-blue-200 bg-blue-50">
                <CardHeader>
                  <CardTitle className="text-base">Memory Suggestions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {memory.suggestions.map((suggestion) => (
                    <div key={`${suggestion.field}-${suggestion.value}`} className="flex items-center justify-between gap-3">
                      <span className="text-sm">{suggestion.note}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          updateField.mutate({
                            field: suggestion.field,
                            value: suggestion.value,
                            notes: suggestion.note,
                          })
                        }
                      >
                        Apply
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {session && currentFields && (
              <Card className="rounded-lg">
                <CardHeader>
                  <CardTitle className="text-base">Review Screen</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  {(['internal', 'external'] as const).map((group) => (
                    <div key={group} className="space-y-2">
                      <h2 className="text-sm font-semibold uppercase tracking-normal text-slate-600">{group} risks</h2>
                      <div className="overflow-hidden rounded-md border bg-white">
                        {RISK_FIELD_DEFINITIONS.filter((field) => field.group === group).map((definition) => {
                          const field = currentFields[definition.key];
                          const reviewStatus = getReviewStatus(field);
                          return (
                            <div
                              key={definition.key}
                              className="grid gap-3 border-b px-3 py-3 last:border-b-0 md:grid-cols-[220px_150px_130px_1fr]"
                            >
                              <div>
                                <div className="font-medium">{definition.label}</div>
                                <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                                  {reviewStatus === 'accepted' ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                                  ) : (
                                    <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
                                  )}
                                  {confidenceLabel(field.confidence)}
                                </div>
                              </div>
                              <Select
                                value={field.value ?? ''}
                                onValueChange={(value) =>
                                  updateField.mutate({ field: definition.key, value: value as RiskValue })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Missing" />
                                </SelectTrigger>
                                <SelectContent>
                                  {RISK_VALUES.map((value) => (
                                    <SelectItem key={value} value={value}>
                                      {value}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Badge variant={fieldTone(field.value)} className="h-9 justify-center rounded-md">
                                {Math.round(field.confidence * 100)}%
                              </Badge>
                              <p className="text-sm text-slate-600">{field.notes || 'No conversation evidence captured yet.'}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {review && (
              <Card className="rounded-lg">
                <CardHeader>
                  <CardTitle className="text-base">End-of-Session Review</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                  <div>
                    <h3 className="text-sm font-semibold">Completed</h3>
                    <p className="mt-1 text-sm text-slate-600">{review.completedFields.length} fields accepted</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">Low Confidence</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {review.lowConfidenceFields.map((field) => RISK_FIELD_LABELS[field]).join(', ') || 'None'}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">Missing</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {review.missingFields.map((field) => RISK_FIELD_LABELS[field]).join(', ') || 'None'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
