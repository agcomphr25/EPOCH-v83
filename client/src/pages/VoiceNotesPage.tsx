import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  Mic,
  MicOff,
  Search,
  Check,
  X,
  Trash2,
  Clock,
  AlertCircle,
  Package,
  BarChart3,
  RefreshCw,
  Filter,
  User,
  Calendar,
  Tag,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Volume2,
  Loader2,
} from 'lucide-react';
import { Link } from 'wouter';

interface VoiceNote {
  id: string;
  transcription: string;
  title: string | null;
  summary: string | null;
  linkedOrderId: string | null;
  noteType: string;
  category: string | null;
  tags: string[] | null;
  extractedTasks: string[] | null;
  suggestedLinks: Array<{ type: string; id: string; label: string; confidence?: string }> | null;
  followUpQuestions: string[] | null;
  visibility: string;
  recordedById: number | null;
  recordedByUsername: string;
  recordedAt: string;
  isResolved: boolean;
  resolvedAt: string | null;
  resolvedById: number | null;
  resolvedNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface VoiceNotesAnalytics {
  total: number;
  unresolved: number;
  byCategory: { category: string; count: number }[];
  byUser: { username: string; count: number }[];
  recentNotes: VoiceNote[];
  linkedToOrders: number;
}

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

function getVoicePermissionMessage(errorCode?: string) {
  switch (errorCode) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access is blocked. Click the site settings icon in the address bar, allow microphone access for EPOCH, then try again.';
    case 'audio-capture':
      return 'No microphone was detected. Check that a microphone is connected and available to the browser.';
    case 'network':
      return 'Speech recognition could not reach the browser speech service. Check the connection and try again.';
    default:
      return errorCode ? `Speech recognition error: ${errorCode}.` : 'Speech recognition could not start.';
  }
}

export default function VoiceNotesPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [interimTranscription, setInterimTranscription] = useState('');
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterResolved, setFilterResolved] = useState('all');
  const [selectedNote, setSelectedNote] = useState<VoiceNote | null>(null);
  const [latestCapture, setLatestCapture] = useState<VoiceNote | null>(null);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolveNotes, setResolveNotes] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<VoiceNote | null>(null);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [isAssistantRecording, setIsAssistantRecording] = useState(false);
  const [assistantStatus, setAssistantStatus] = useState('');
  
  const recognitionRef = useRef<any>(null);
  const isRecordingRef = useRef(false);
  const assistantRecorderRef = useRef<MediaRecorder | null>(null);
  const assistantAudioChunksRef = useRef<Blob[]>([]);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    fetch('/api/voice-notes/access/check', { credentials: 'include' })
      .then(res => res.json())
      .then(data => setHasAccess(data.hasAccess))
      .catch(() => setHasAccess(false));
  }, []);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognition && !recognitionRef.current) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      
      recognition.onresult = (event: any) => {
        let interimText = '';
        let finalText = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalText += transcript + ' ';
          } else {
            interimText += transcript;
          }
        }
        
        if (finalText) {
          setTranscription(prev => prev + finalText);
        }
        setInterimTranscription(interimText);
      };
      
      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error !== 'aborted') {
          setIsRecording(false);
          isRecordingRef.current = false;
          toast({
            title: event.error === 'not-allowed' || event.error === 'service-not-allowed'
              ? 'Microphone Blocked'
              : 'Recording Error',
            description: getVoicePermissionMessage(event.error),
            variant: 'destructive',
          });
        }
      };
      
      recognition.onend = () => {
        if (isRecordingRef.current) {
          try {
            recognition.start();
          } catch (e) {
            console.log('Recognition restart prevented');
          }
        }
      };
      
      recognitionRef.current = recognition;
    }
    
    return () => {
      if (recognitionRef.current && !isRecordingRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore stop errors
        }
      }
    };
  }, [toast]);

  const { data: notes = [], isLoading: notesLoading } = useQuery<VoiceNote[]>({
    queryKey: ['/api/voice-notes', { category: filterCategory, isResolved: filterResolved }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterCategory !== 'all') params.set('category', filterCategory);
      if (filterResolved !== 'all') params.set('isResolved', filterResolved);
      const res = await fetch(`/api/voice-notes?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch notes');
      return res.json();
    },
    enabled: hasAccess === true,
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery<VoiceNotesAnalytics>({
    queryKey: ['/api/voice-notes/analytics'],
    queryFn: async () => {
      const res = await fetch('/api/voice-notes/analytics', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch analytics');
      return res.json();
    },
    enabled: hasAccess === true,
  });

  const createNoteMutation = useMutation({
    mutationFn: async (data: { transcription: string }) => {
      return apiRequest('/api/voice-notes', { method: 'POST', body: data });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/voice-notes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/voice-notes/analytics'] });
      setLatestCapture(data);
      setTranscription('');
      setInterimTranscription('');
      
      let message = 'Voice note saved successfully!';
      if (data.orderVerified && data.linkedOrderId) {
        message = `Note linked to order ${data.linkedOrderId}`;
      } else if (data.extractedOrderId && !data.orderVerified) {
        message = `Note saved. Order "${data.extractedOrderId}" was not found in the system.`;
      }
      
      toast({ title: 'Success', description: message });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to save voice note', variant: 'destructive' });
    },
  });

  const assistantCaptureMutation = useMutation({
    mutationFn: async (data: { audio: string; inputFormat: 'webm'; voice: 'nova'; speakResponse: boolean }) => {
      return apiRequest('/api/voice-notes/assistant-capture', {
        method: 'POST',
        body: data,
        timeout: 120000,
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/voice-notes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/voice-notes/analytics'] });
      setLatestCapture(data);
      setTranscription(data.userTranscript || data.transcription || '');
      setInterimTranscription('');
      setAssistantStatus(data.assistantTranscript || 'EPOCH captured the note.');

      if (data.audioResponse && data.audioFormat) {
        const audio = new Audio(`data:audio/${data.audioFormat};base64,${data.audioResponse}`);
        audio.play().catch(() => {
          toast({
            title: 'Captured',
            description: data.assistantTranscript || 'EPOCH saved the note, but audio playback was blocked by the browser.',
          });
        });
      } else {
        toast({ title: 'Captured', description: data.assistantTranscript || 'EPOCH saved the note.' });
      }
    },
    onError: (error: any) => {
      setAssistantStatus('');
      toast({
        title: 'Voice Capture Failed',
        description: error?.message || 'Failed to process the voice note',
        variant: 'destructive',
      });
    },
  });

  const resolveNoteMutation = useMutation({
    mutationFn: async ({ id, resolvedNotes }: { id: string; resolvedNotes: string }) => {
      return apiRequest(`/api/voice-notes/${id}/resolve`, { method: 'PATCH', body: { resolvedNotes } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/voice-notes'] });
      setResolveDialogOpen(false);
      setSelectedNote(null);
      setResolveNotes('');
      toast({ title: 'Success', description: 'Note marked as resolved' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to resolve note', variant: 'destructive' });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/voice-notes/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/voice-notes'] });
      setDeleteConfirm(null);
      toast({ title: 'Success', description: 'Voice note deleted' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete note', variant: 'destructive' });
    },
  });

  const startRecording = async () => {
    if (recognitionRef.current) {
      setTranscription('');
      setInterimTranscription('');
      try {
        const stream = await navigator.mediaDevices?.getUserMedia?.({ audio: true });
        stream?.getTracks().forEach(track => track.stop());
        isRecordingRef.current = true;
        setIsRecording(true);
        recognitionRef.current.start();
      } catch (e) {
        setIsRecording(false);
        isRecordingRef.current = false;
        const error = e as { name?: string; message?: string };
        if (error?.name === 'InvalidStateError') {
          isRecordingRef.current = true;
          setIsRecording(true);
          console.log('Recognition already started');
          return;
        }

        const permissionDenied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
        toast({
          title: permissionDenied ? 'Microphone Blocked' : 'Recording Error',
          description: permissionDenied
            ? getVoicePermissionMessage('not-allowed')
            : error?.message || getVoicePermissionMessage(),
          variant: 'destructive',
        });
      }
    } else {
      toast({
        title: 'Not Supported',
        description: 'Speech recognition is not supported in this browser. Please use Chrome or Edge.',
        variant: 'destructive',
      });
    }
  };

  const stopRecording = () => {
    isRecordingRef.current = false;
    setIsRecording(false);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.log('Recognition already stopped');
      }
    }
  };

  const handleSaveNote = () => {
    const finalText = (transcription + interimTranscription).trim();
    if (!finalText) {
      toast({ title: 'Error', description: 'No transcription to save', variant: 'destructive' });
      return;
    }
    createNoteMutation.mutate({ transcription: finalText });
  };

  const blobToBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Could not read audio recording'));
        return;
      }
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read audio recording'));
    reader.readAsDataURL(blob);
  });

  const startAssistantRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast({
        title: 'Not Supported',
        description: 'EPOCH voice capture needs microphone recording support in this browser.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorderOptions = MediaRecorder.isTypeSupported('audio/webm')
        ? { mimeType: 'audio/webm' }
        : undefined;
      const recorder = new MediaRecorder(stream, recorderOptions);
      assistantAudioChunksRef.current = [];
      assistantRecorderRef.current = recorder;
      setAssistantStatus('EPOCH is listening...');

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          assistantAudioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        setIsAssistantRecording(false);

        const audioBlob = new Blob(assistantAudioChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size === 0) {
          setAssistantStatus('');
          toast({ title: 'No Audio', description: 'EPOCH did not receive any audio.', variant: 'destructive' });
          return;
        }

        try {
          setAssistantStatus('EPOCH is transcribing and filing this...');
          const audio = await blobToBase64(audioBlob);
          assistantCaptureMutation.mutate({
            audio,
            inputFormat: 'webm',
            voice: 'nova',
            speakResponse: true,
          });
        } catch (error: any) {
          setAssistantStatus('');
          toast({
            title: 'Recording Error',
            description: error?.message || 'Could not read the recording.',
            variant: 'destructive',
          });
        }
      };

      recorder.start();
      setIsAssistantRecording(true);
    } catch (error: any) {
      setAssistantStatus('');
      toast({
        title: 'Microphone Blocked',
        description: error?.message || 'Please allow microphone access to use EPOCH voice capture.',
        variant: 'destructive',
      });
    }
  };

  const stopAssistantRecording = () => {
    if (assistantRecorderRef.current && assistantRecorderRef.current.state !== 'inactive') {
      setAssistantStatus('EPOCH is finishing the recording...');
      assistantRecorderRef.current.stop();
    }
  };

  const filteredNotes = notes.filter(note => {
    if (search) {
      const searchLower = search.toLowerCase();
      return (
        note.transcription.toLowerCase().includes(searchLower) ||
        (note.title?.toLowerCase().includes(searchLower)) ||
        (note.summary?.toLowerCase().includes(searchLower)) ||
        (note.linkedOrderId?.toLowerCase().includes(searchLower)) ||
        (note.category?.toLowerCase().includes(searchLower)) ||
        (note.tags?.some(tag => tag.toLowerCase().includes(searchLower))) ||
        (note.extractedTasks?.some(task => task.toLowerCase().includes(searchLower)))
      );
    }
    return true;
  });

  if (hasAccess === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (hasAccess === false) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <AlertCircle className="w-16 h-16 text-destructive" />
        <h1 className="text-2xl font-bold">Access Denied</h1>
        <p className="text-muted-foreground">You do not have permission to access voice notes.</p>
      </div>
    );
  }

  const isSpeechSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  return (
    <div className="container mx-auto py-6 space-y-6" data-testid="voice-notes-page">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Knowledge Capture</h1>
          <p className="text-muted-foreground">
            EPOCH voice journal for business observations, production concerns, and process knowledge.
          </p>
        </div>
        <Badge variant="outline" className="w-fit">
          Private to {hasAccess ? 'you' : 'current user'}
        </Badge>
      </div>

      {latestCapture && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Captured: {latestCapture.title || 'Knowledge note'}
            </CardTitle>
            {latestCapture.summary && (
              <CardDescription>{latestCapture.summary}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Classification</p>
              <Badge variant="secondary">{latestCapture.noteType.replace(/_/g, ' ')}</Badge>
              <div className="flex flex-wrap gap-1">
                {latestCapture.tags?.slice(0, 6).map(tag => (
                  <Badge key={tag} variant="outline">{tag}</Badge>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Suggested Links</p>
              {latestCapture.suggestedLinks?.length ? (
                <div className="space-y-1">
                  {latestCapture.suggestedLinks.slice(0, 4).map(link => (
                    <div key={`${link.type}-${link.id}`} className="text-sm">
                      <span className="font-medium capitalize">{link.type}:</span> {link.label}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No links suggested yet.</p>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Follow-Up Prompts</p>
              <ul className="space-y-1 text-sm">
                {latestCapture.followUpQuestions?.slice(0, 3).map(question => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="record" className="space-y-4">
        <TabsList>
          <TabsTrigger value="record" data-testid="tab-record">
            <Mic className="w-4 h-4 mr-2" />
            Capture
          </TabsTrigger>
          <TabsTrigger value="notes" data-testid="tab-notes">
            <Clock className="w-4 h-4 mr-2" />
            Journal ({notes.length})
          </TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-analytics">
            <BarChart3 className="w-4 h-4 mr-2" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="record" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mic className="w-5 h-5" />
                Capture a Private Knowledge Note
              </CardTitle>
              <CardDescription>
                Talk naturally. Kentro keeps the transcript, classifies the note, suggests links, and asks follow-up questions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-medium">
                      <Volume2 className="h-4 w-4" />
                      EPOCH Voice Capture
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Records audio, transcribes it server-side, files it privately, and plays a short confirmation.
                    </p>
                    {assistantStatus && (
                      <p className="text-sm font-medium text-primary">{assistantStatus}</p>
                    )}
                  </div>
                  <Button
                    variant={isAssistantRecording ? 'destructive' : 'default'}
                    onClick={isAssistantRecording ? stopAssistantRecording : startAssistantRecording}
                    disabled={assistantCaptureMutation.isPending}
                    data-testid="button-assistant-voice-capture"
                  >
                    {assistantCaptureMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : isAssistantRecording ? (
                      <MicOff className="mr-2 h-4 w-4" />
                    ) : (
                      <Mic className="mr-2 h-4 w-4" />
                    )}
                    {assistantCaptureMutation.isPending
                      ? 'Filing...'
                      : isAssistantRecording
                        ? 'Stop'
                        : 'Talk to EPOCH'}
                  </Button>
                </div>
              </div>

              {!isSpeechSupported ? (
                <div className="p-4 bg-destructive/10 text-destructive rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  <span>Speech recognition is not supported in this browser. Please use Chrome or Edge.</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-center">
                    <Button
                      size="lg"
                      variant={isRecording ? 'destructive' : 'default'}
                      className="w-48 h-48 rounded-full"
                      onClick={isRecording ? stopRecording : startRecording}
                      data-testid="button-record"
                    >
                      <div className="flex flex-col items-center gap-2">
                        {isRecording ? (
                          <>
                            <MicOff className="w-16 h-16" />
                            <span className="text-lg">Stop Recording</span>
                          </>
                        ) : (
                          <>
                            <Mic className="w-16 h-16" />
                            <span className="text-lg">Start Recording</span>
                          </>
                        )}
                      </div>
                    </Button>
                  </div>

                  {isRecording && (
                    <div className="flex justify-center">
                      <div className="flex items-center gap-2 text-destructive animate-pulse">
                        <div className="w-3 h-3 bg-destructive rounded-full" />
                        <span>Recording...</span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Transcription</Label>
                    <Textarea
                      value={transcription + interimTranscription}
                      onChange={(e) => setTranscription(e.target.value)}
                      placeholder="Your voice will be transcribed here..."
                      rows={4}
                      className="resize-none"
                      data-testid="input-transcription"
                    />
                    <p className="text-sm text-muted-foreground">
                      {interimTranscription && <span className="text-blue-500">(listening...)</span>}
                    </p>
                  </div>

                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setTranscription('');
                        setInterimTranscription('');
                      }}
                      disabled={!transcription && !interimTranscription}
                      data-testid="button-clear"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Clear
                    </Button>
                    <Button
                      onClick={handleSaveNote}
                      disabled={(!transcription && !interimTranscription) || createNoteMutation.isPending}
                      data-testid="button-save-note"
                    >
                      <Check className="w-4 h-4 mr-2" />
                      {createNoteMutation.isPending ? 'Saving...' : 'Save Note'}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Business Manager Journal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search notes, tags, tasks, or topics..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9"
                      data-testid="input-search-notes"
                    />
                  </div>
                </div>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-[180px]" data-testid="select-category-filter">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="production concern">Production Concern</SelectItem>
                    <SelectItem value="process observation">Process Observation</SelectItem>
                    <SelectItem value="employee process observation">Employee Observation</SelectItem>
                    <SelectItem value="customer order context">Customer / Order Context</SelectItem>
                    <SelectItem value="meeting recap">Meeting Recap</SelectItem>
                    <SelectItem value="training insight">Training Insight</SelectItem>
                    <SelectItem value="engineering knowledge">Engineering Knowledge</SelectItem>
                    <SelectItem value="journal">Journal</SelectItem>
                    <SelectItem value="metal insert">Metal Insert</SelectItem>
                    <SelectItem value="duratec">Duratec</SelectItem>
                    <SelectItem value="thickness">Thickness</SelectItem>
                    <SelectItem value="paint">Paint</SelectItem>
                    <SelectItem value="cnc">CNC</SelectItem>
                    <SelectItem value="layup">Layup</SelectItem>
                    <SelectItem value="finish">Finish</SelectItem>
                    <SelectItem value="quality">Quality</SelectItem>
                    <SelectItem value="shipping">Shipping</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterResolved} onValueChange={setFilterResolved}>
                  <SelectTrigger className="w-[180px]" data-testid="select-resolved-filter">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="false">Unresolved</SelectItem>
                    <SelectItem value="true">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {notesLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-24" />
                  ))}
                </div>
              ) : filteredNotes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No voice notes found
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredNotes.map((note) => (
                    <Card key={note.id} className={`${note.isResolved ? 'opacity-60' : ''}`} data-testid={`card-note-${note.id}`}>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1 space-y-2">
                            <div>
                              <h3 className="font-semibold leading-tight">{note.title || 'Knowledge capture note'}</h3>
                              {note.summary && (
                                <p className="mt-1 text-sm text-muted-foreground">{note.summary}</p>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline">
                                {note.noteType.replace(/_/g, ' ')}
                              </Badge>
                              {note.linkedOrderId && (
                                <Link href={`/orders/${note.linkedOrderId}`}>
                                  <Badge variant="outline" className="cursor-pointer hover:bg-primary/10">
                                    <Package className="w-3 h-3 mr-1" />
                                    {note.linkedOrderId}
                                    <ExternalLink className="w-3 h-3 ml-1" />
                                  </Badge>
                                </Link>
                              )}
                              {note.category && (
                                <Badge variant="secondary">
                                  <Tag className="w-3 h-3 mr-1" />
                                  {note.category}
                                </Badge>
                              )}
                              {note.visibility === 'private' && (
                                <Badge variant="outline">Private</Badge>
                              )}
                              {note.isResolved ? (
                                <Badge variant="default" className="bg-green-600">
                                  <CheckCircle2 className="w-3 h-3 mr-1" />
                                  Resolved
                                </Badge>
                              ) : (
                                <Badge variant="destructive">
                                  <XCircle className="w-3 h-3 mr-1" />
                                  Unresolved
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {note.recordedByUsername}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(note.recordedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                              </span>
                            </div>
                            {note.resolvedNotes && (
                              <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
                                <strong>Resolution:</strong> {note.resolvedNotes}
                              </p>
                            )}
                            {note.extractedTasks?.length ? (
                              <div className="rounded-md border border-border bg-muted/30 p-3">
                                <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Possible Tasks</p>
                                <ul className="space-y-1 text-sm">
                                  {note.extractedTasks.slice(0, 3).map(task => (
                                    <li key={task}>{task}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                            {note.suggestedLinks?.length ? (
                              <div className="flex flex-wrap gap-2">
                                {note.suggestedLinks.slice(0, 5).map(link => (
                                  <Badge key={`${link.type}-${link.id}`} variant="outline">
                                    <span className="capitalize">{link.type}</span>: {link.label}
                                  </Badge>
                                ))}
                              </div>
                            ) : null}
                            {note.followUpQuestions?.length ? (
                              <details className="rounded-md border border-border bg-background p-3">
                                <summary className="cursor-pointer text-sm font-medium">Follow-up questions</summary>
                                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                                  {note.followUpQuestions.map(question => (
                                    <li key={question}>{question}</li>
                                  ))}
                                </ul>
                              </details>
                            ) : null}
                            <details className="text-sm">
                              <summary className="cursor-pointer text-muted-foreground">Transcript</summary>
                              <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted p-3">{note.transcription}</p>
                            </details>
                          </div>
                          <div className="flex gap-2">
                            {!note.isResolved && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedNote(note);
                                  setResolveDialogOpen(true);
                                }}
                                data-testid={`button-resolve-${note.id}`}
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive"
                              onClick={() => setDeleteConfirm(note)}
                              data-testid={`button-delete-${note.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          {analyticsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : analytics ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold" data-testid="text-total-notes">{analytics.total}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Unresolved</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-destructive" data-testid="text-unresolved-notes">{analytics.unresolved}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Linked to Orders</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-blue-600" data-testid="text-linked-orders">{analytics.linkedToOrders}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Resolution Rate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-green-600" data-testid="text-resolution-rate">
                      {analytics.total > 0 ? Math.round(((analytics.total - analytics.unresolved) / analytics.total) * 100) : 0}%
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Notes by Category</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics.byCategory.length === 0 ? (
                      <p className="text-muted-foreground text-sm">No categorized notes yet</p>
                    ) : (
                      <div className="space-y-2">
                        {analytics.byCategory.map((item) => (
                          <div key={item.category} className="flex justify-between items-center">
                            <span className="capitalize">{item.category || 'Uncategorized'}</span>
                            <Badge variant="secondary">{item.count}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Notes by User</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics.byUser.length === 0 ? (
                      <p className="text-muted-foreground text-sm">No notes recorded yet</p>
                    ) : (
                      <div className="space-y-2">
                        {analytics.byUser.map((item) => (
                          <div key={item.username} className="flex justify-between items-center">
                            <span>{item.username}</span>
                            <Badge variant="secondary">{item.count}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}
        </TabsContent>
      </Tabs>

      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Note</DialogTitle>
            <DialogDescription>
              Mark this note as resolved and add any resolution notes.
            </DialogDescription>
          </DialogHeader>
          {selectedNote && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm">{selectedNote.transcription}</p>
              </div>
              <div className="space-y-2">
                <Label>Resolution Notes (optional)</Label>
                <Textarea
                  value={resolveNotes}
                  onChange={(e) => setResolveNotes(e.target.value)}
                  placeholder="How was this issue resolved?"
                  rows={3}
                  data-testid="input-resolve-notes"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedNote) {
                  resolveNoteMutation.mutate({ id: selectedNote.id, resolvedNotes: resolveNotes });
                }
              }}
              disabled={resolveNoteMutation.isPending}
              data-testid="button-confirm-resolve"
            >
              {resolveNoteMutation.isPending ? 'Resolving...' : 'Mark Resolved'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Voice Note</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this voice note? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirm) {
                  deleteNoteMutation.mutate(deleteConfirm.id);
                }
              }}
              disabled={deleteNoteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteNoteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
