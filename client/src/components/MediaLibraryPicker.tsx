import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, FileText, Image as ImageIcon, Check, X } from 'lucide-react';
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
  category: string | null;
  isArchived: boolean;
}

interface MediaLibraryPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string, filename: string) => void;
  acceptedTypes?: string[];
  title?: string;
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

function formatFileSize(bytes: number | null) {
  if (!bytes) return 'Unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getMediaUrl(storagePath: string | null): string {
  if (!storagePath) return '';
  // Cloud storage paths start with /objects/ (or objects/ without leading slash)
  if (storagePath.startsWith('/objects/')) {
    return storagePath;
  }
  if (storagePath.startsWith('objects/')) {
    // Normalize to include leading slash for proper routing
    return `/${storagePath}`;
  }
  // Legacy local storage paths - serve through media API
  const filename = storagePath.split('/').pop();
  return `/api/media/file/${filename}`;
}

export default function MediaLibraryPicker({
  open,
  onOpenChange,
  onSelect,
  acceptedTypes = ['application/pdf'],
  title = 'Select from Media Library',
}: MediaLibraryPickerProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);

  const { data: mediaItems = [], isLoading } = useQuery<MediaItem[]>({
    queryKey: ['/api/media', { search, category, includeArchived: false }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (category && category !== 'all') params.set('category', category);
      params.set('includeArchived', 'false');
      const response = await fetch(`/api/media?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch media');
      return response.json();
    },
    enabled: open,
  });

  const filteredItems = mediaItems.filter((item) => {
    if (acceptedTypes.length === 0) return true;
    return acceptedTypes.some(
      (type) =>
        item.mimeType === type ||
        (type === 'application/pdf' && item.filename.toLowerCase().endsWith('.pdf'))
    );
  });

  const handleSelect = () => {
    if (selectedItem) {
      const url = getMediaUrl(selectedItem.storagePath);
      onSelect(url, selectedItem.filename);
      setSelectedItem(null);
      onOpenChange(false);
    }
  };

  const handleClose = () => {
    setSelectedItem(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search files..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-media-search"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[180px]" data-testid="select-media-category">
              <SelectValue placeholder="Category" />
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

        <ScrollArea className="h-[400px] pr-4">
          {isLoading ? (
            <div className="grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <FileText className="h-12 w-12 mb-2 opacity-50" />
              <p>No PDF files found</p>
              <p className="text-sm">Try adjusting your search or category filter</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {filteredItems.map((item) => {
                const isSelected = selectedItem?.id === item.id;
                const isPdf = item.mimeType === 'application/pdf' || item.filename.toLowerCase().endsWith('.pdf');
                
                return (
                  <Card
                    key={item.id}
                    className={`p-3 cursor-pointer transition-all hover:bg-accent ${
                      isSelected ? 'ring-2 ring-primary bg-accent' : ''
                    }`}
                    onClick={() => setSelectedItem(item)}
                    data-testid={`media-item-${item.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0">
                        {isPdf ? (
                          <FileText className="h-10 w-10 text-red-500" />
                        ) : (
                          <ImageIcon className="h-10 w-10 text-blue-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">
                            {item.title || item.filename}
                          </span>
                          {isSelected && (
                            <Check className="h-4 w-4 text-primary flex-shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatFileSize(item.fileSize)}</span>
                          <span>•</span>
                          <span>
                            {format(new Date(item.captureDate || item.createdAt), 'MMM d, yyyy')}
                          </span>
                          {item.category && (
                            <>
                              <span>•</span>
                              <Badge variant="secondary" className="text-xs py-0">
                                {item.category}
                              </Badge>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} data-testid="button-cancel-media">
            Cancel
          </Button>
          <Button
            onClick={handleSelect}
            disabled={!selectedItem}
            data-testid="button-select-media"
          >
            Select File
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
