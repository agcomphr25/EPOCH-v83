import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import CameraCapture from '@/components/CameraCapture';
import {
  Paperclip,
  Image as ImageIcon,
  FileText,
  X,
  Search,
  Check,
  Camera,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';

interface MediaItem {
  id: string;
  filename: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  capturedByName: string | null;
  captureDate: string;
  title: string | null;
  notes: string | null;
  category: string | null;
}

interface AttachmentData {
  attachment: {
    id: string;
    mediaId: string;
    entityType: string;
    entityId: string;
    attachedByName: string | null;
    attachedAt: string;
    notes: string | null;
  };
  media: MediaItem;
}

interface MediaAttachmentPickerProps {
  entityType: 'order' | 'invoice' | 'purchase_order' | 'packing_slip' | 'other';
  entityId: string;
  trigger?: React.ReactNode;
  onAttachmentChange?: () => void;
  compact?: boolean;
}

const CATEGORIES = [
  { value: 'all', label: 'All Categories' },
  { value: 'packing_slip', label: 'Packing Slip' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'photo', label: 'Photo' },
  { value: 'document', label: 'Document' },
  { value: 'other', label: 'Other' },
];

export default function MediaAttachmentPicker({
  entityType,
  entityId,
  trigger,
  onAttachmentChange,
  compact = false,
}: MediaAttachmentPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [selectedMedia, setSelectedMedia] = useState<string[]>([]);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: attachments = [], isLoading: attachmentsLoading } = useQuery<AttachmentData[]>({
    queryKey: ['/api/media/attachments', entityType, entityId],
    queryFn: async () => {
      const res = await fetch(`/api/media/attachments/${entityType}/${entityId}`, {
        credentials: 'include',
      });
      return res.json();
    },
    enabled: !!entityId,
  });

  const { data: mediaItems = [], isLoading: mediaLoading } = useQuery<MediaItem[]>({
    queryKey: ['/api/media', { search, category }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (category !== 'all') params.set('category', category);
      const res = await fetch(`/api/media?${params}`, { credentials: 'include' });
      return res.json();
    },
    enabled: open,
  });

  const attachMutation = useMutation({
    mutationFn: async (mediaId: string) => {
      return apiRequest('/api/media/attachments', {
        method: 'POST',
        body: { mediaId, entityType, entityId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/media/attachments', entityType, entityId] });
      toast({ title: 'Attached', description: 'Image attached successfully' });
      onAttachmentChange?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to attach image',
        variant: 'destructive',
      });
    },
  });

  const detachMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      return apiRequest(`/api/media/attachments/${attachmentId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/media/attachments', entityType, entityId] });
      toast({ title: 'Removed', description: 'Attachment removed' });
      onAttachmentChange?.();
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to remove attachment', variant: 'destructive' });
    },
  });

  const handleAttachSelected = async () => {
    for (const mediaId of selectedMedia) {
      const alreadyAttached = attachments.some((a) => a.media.id === mediaId);
      if (!alreadyAttached) {
        await attachMutation.mutateAsync(mediaId);
      }
    }
    setSelectedMedia([]);
    setOpen(false);
  };

  const toggleSelection = (mediaId: string) => {
    setSelectedMedia((prev) =>
      prev.includes(mediaId) ? prev.filter((id) => id !== mediaId) : [...prev, mediaId]
    );
  };

  const alreadyAttachedIds = attachments.map((a) => a.media.id);

  const availableMedia = mediaItems.filter((m) => !alreadyAttachedIds.includes(m.id));

  if (!entityId) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Current Attachments */}
      {!compact && attachments.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Attached Images</p>
          <div className="flex flex-wrap gap-2">
            {attachments.map((att) => (
              <div
                key={att.attachment.id}
                className="relative group rounded-md overflow-hidden border"
                data-testid={`attachment-${att.attachment.id}`}
              >
                {att.media.mimeType.startsWith('image/') ? (
                  <img
                    src={`/api/media/file/${att.media.storagePath.split('/').pop()}`}
                    alt={att.media.title || att.media.filename}
                    className="w-16 h-16 object-cover"
                  />
                ) : (
                  <div className="w-16 h-16 flex items-center justify-center bg-muted">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <Button
                  size="icon"
                  variant="destructive"
                  className="absolute -top-1 -right-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => detachMutation.mutate(att.attachment.id)}
                  disabled={detachMutation.isPending}
                  data-testid={`button-remove-attachment-${att.attachment.id}`}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Compact view with count badge */}
      {compact && attachments.length > 0 && (
        <Badge variant="secondary" className="gap-1">
          <Paperclip className="h-3 w-3" />
          {attachments.length} attached
        </Badge>
      )}

      {/* Picker Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          {trigger || (
            <Button variant="outline" size="sm" data-testid="button-attach-media">
              <Paperclip className="mr-2 h-4 w-4" />
              Attach Image
              {attachments.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {attachments.length}
                </Badge>
              )}
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Attach Images</DialogTitle>
            <DialogDescription>
              Select images from your Media Library to attach to this {entityType.replace('_', ' ')}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Actions Row */}
            <div className="flex gap-2">
              <CameraCapture
                trigger={
                  <Button variant="outline" size="sm" data-testid="button-capture-new">
                    <Camera className="mr-2 h-4 w-4" />
                    Capture New
                  </Button>
                }
                onCaptureComplete={(media) => {
                  attachMutation.mutate(media.id);
                }}
              />
            </div>

            {/* Filters */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search media..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-attach-media"
                />
              </div>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-[150px]" data-testid="select-attach-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Media Grid */}
            <ScrollArea className="h-[300px]">
              {mediaLoading ? (
                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-square rounded-md" />
                  ))}
                </div>
              ) : availableMedia.length === 0 ? (
                <div className="text-center py-8">
                  <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No available images found</p>
                  <p className="text-sm text-muted-foreground">
                    Capture a new image or adjust filters
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {availableMedia.map((media) => {
                    const isSelected = selectedMedia.includes(media.id);
                    return (
                      <Card
                        key={media.id}
                        className={`cursor-pointer transition-all ${
                          isSelected ? 'ring-2 ring-primary' : 'hover:ring-1 hover:ring-muted-foreground'
                        }`}
                        onClick={() => toggleSelection(media.id)}
                        data-testid={`card-select-media-${media.id}`}
                      >
                        <CardContent className="p-0 relative">
                          <div className="aspect-square">
                            {media.mimeType.startsWith('image/') ? (
                              <img
                                src={`/api/media/file/${media.storagePath.split('/').pop()}`}
                                alt={media.title || media.filename}
                                className="w-full h-full object-cover rounded-t-lg"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-muted rounded-t-lg">
                                <FileText className="h-8 w-8 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          {isSelected && (
                            <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-1">
                              <Check className="h-3 w-3" />
                            </div>
                          )}
                          <div className="p-2">
                            <p className="text-xs truncate">
                              {media.title || media.filename}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(media.captureDate), 'MMM d')}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAttachSelected}
              disabled={selectedMedia.length === 0 || attachMutation.isPending}
              data-testid="button-confirm-attach"
            >
              {attachMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Attach {selectedMedia.length > 0 ? `(${selectedMedia.length})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AttachedImagesPreview({
  entityType,
  entityId,
}: {
  entityType: string;
  entityId: string;
}) {
  const { data: attachments = [] } = useQuery<AttachmentData[]>({
    queryKey: ['/api/media/attachments', entityType, entityId],
    queryFn: async () => {
      const res = await fetch(`/api/media/attachments/${entityType}/${entityId}`, {
        credentials: 'include',
      });
      return res.json();
    },
    enabled: !!entityId,
  });

  if (attachments.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      <Paperclip className="h-3 w-3 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{attachments.length}</span>
      <div className="flex -space-x-2">
        {attachments.slice(0, 3).map((att) => (
          <div
            key={att.attachment.id}
            className="w-6 h-6 rounded-full overflow-hidden border-2 border-background"
          >
            {att.media.mimeType.startsWith('image/') ? (
              <img
                src={`/api/media/file/${att.media.storagePath.split('/').pop()}`}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center">
                <FileText className="h-3 w-3 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}
        {attachments.length > 3 && (
          <div className="w-6 h-6 rounded-full bg-muted border-2 border-background flex items-center justify-center">
            <span className="text-xs">+{attachments.length - 3}</span>
          </div>
        )}
      </div>
    </div>
  );
}
