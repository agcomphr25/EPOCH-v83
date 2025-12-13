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
} from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'wouter';

interface VoiceNote {
  id: string;
  transcription: string;
  linkedOrderId: string | null;
  noteType: string;
  category: string | null;
  tags: string[] | null;
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

export default function VoiceNotesPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [interimTranscription, setInterimTranscription] = useState('');
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterResolved, setFilterResolved] = useState('all');
  const [selectedNote, setSelectedNote] = useState<VoiceNote | null>(null);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolveNotes, setResolveNotes] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<VoiceNote | null>(null);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  
  const recognitionRef = useRef<any>(null);
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
    
    if (SpeechRecognition) {
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
        setIsRecording(false);
        toast({
          title: 'Recording Error',
          description: `Error: ${event.error}. Please try again.`,
          variant: 'destructive',
        });
      };
      
      recognition.onend = () => {
        if (isRecording) {
          recognition.start();
        }
      };
      
      recognitionRef.current = recognition;
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [isRecording, toast]);

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

  const startRecording = () => {
    if (recognitionRef.current) {
      setTranscription('');
      setInterimTranscription('');
      recognitionRef.current.start();
      setIsRecording(true);
    } else {
      toast({
        title: 'Not Supported',
        description: 'Speech recognition is not supported in this browser. Please use Chrome or Edge.',
        variant: 'destructive',
      });
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
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

  const filteredNotes = notes.filter(note => {
    if (search) {
      const searchLower = search.toLowerCase();
      return (
        note.transcription.toLowerCase().includes(searchLower) ||
        (note.linkedOrderId?.toLowerCase().includes(searchLower)) ||
        (note.category?.toLowerCase().includes(searchLower))
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Voice Notes</h1>
          <p className="text-muted-foreground">Record and track issues using your voice</p>
        </div>
      </div>

      <Tabs defaultValue="record" className="space-y-4">
        <TabsList>
          <TabsTrigger value="record" data-testid="tab-record">
            <Mic className="w-4 h-4 mr-2" />
            Record
          </TabsTrigger>
          <TabsTrigger value="notes" data-testid="tab-notes">
            <Clock className="w-4 h-4 mr-2" />
            Notes ({notes.length})
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
                Record Voice Note
              </CardTitle>
              <CardDescription>
                Press the button and speak clearly. Say "order" followed by the order number to auto-link.
                <br />
                Example: "Hey Epoch, there was a problem with the metal insert on order EL069"
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                Voice Notes History
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search notes..."
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
                            <p className="text-sm">{note.transcription}</p>
                            <div className="flex flex-wrap gap-2">
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
                                {format(new Date(note.recordedAt), 'MMM d, yyyy h:mm a')}
                              </span>
                            </div>
                            {note.resolvedNotes && (
                              <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
                                <strong>Resolution:</strong> {note.resolvedNotes}
                              </p>
                            )}
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
