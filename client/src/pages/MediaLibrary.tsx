import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import CameraCapture from '@/components/CameraCapture';
import {
  Search,
  Camera,
  MoreVertical,
  Trash2,
  Edit,
  Archive,
  Eye,
  Link2,
  FileText,
  Image as ImageIcon,
  Calendar,
  User,
  Loader2,
  X,
  Download,
  ExternalLink,
  Upload,
  FolderPlus,
  Folder,
  FolderOpen,
  ChevronRight,
  Home,
  MoveRight,
} from 'lucide-react';
import { format } from 'date-fns';

interface MediaItem {
  id: string;
  filename: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  folderId: string | null;
  capturedById: number | null;
  capturedByName: string | null;
  captureDate: string;
  title: string | null;
  notes: string | null;
  tags: string[] | null;
  category: string | null;
  thumbnailPath: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

interface MediaFolder {
  id: string;
  name: string;
  parentId: string | null;
  visibleToRoles: string[] | null;
  createdAt: string;
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

function getCategoryLabel(value: string | null) {
  return CATEGORIES.find(c => c.value === value)?.label || value || 'Other';
}

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

export default function MediaLibrary() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [editingMedia, setEditingMedia] = useState<MediaItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<MediaItem | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [movingItem, setMovingItem] = useState<MediaItem | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: folders = [] } = useQuery<MediaFolder[]>({
    queryKey: ['/api/media/folders'],
  });

  const currentFolder = folders.find(f => f.id === currentFolderId);
  const childFolders = folders.filter(f => f.parentId === currentFolderId);

  const getBreadcrumbs = () => {
    const crumbs: { id: string | null; name: string }[] = [{ id: null, name: 'Root' }];
    let folder = currentFolder;
    const folderPath: MediaFolder[] = [];
    while (folder) {
      folderPath.unshift(folder);
      folder = folders.find(f => f.id === folder?.parentId);
    }
    return [...crumbs, ...folderPath.map(f => ({ id: f.id, name: f.name }))];
  };

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      return apiRequest('/api/media/folders', {
        method: 'POST',
        body: { name, parentId: currentFolderId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/media/folders'] });
      toast({ title: 'Folder created successfully' });
      setIsCreateFolderOpen(false);
      setNewFolderName('');
    },
    onError: () => {
      toast({ title: 'Failed to create folder', variant: 'destructive' });
    },
  });

  const moveItemMutation = useMutation({
    mutationFn: async ({ itemId, folderId }: { itemId: string; folderId: string | null }) => {
      return apiRequest(`/api/media/${itemId}/move`, {
        method: 'PATCH',
        body: { folderId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/media'] });
      toast({ title: 'Item moved successfully' });
      setMovingItem(null);
    },
    onError: () => {
      toast({ title: 'Failed to move item', variant: 'destructive' });
    },
  });
  
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', file.name);
    formData.append('category', 'document');
    if (currentFolderId) {
      formData.append('folderId', currentFolderId);
    }
    
    try {
      const response = await fetch('/api/media/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }
      
      await queryClient.invalidateQueries({ queryKey: ['/api/media'] });
      toast({ title: 'Success', description: `${file.name} uploaded successfully` });
    } catch (error: any) {
      toast({ 
        title: 'Upload Failed', 
        description: error.message || 'Failed to upload file', 
        variant: 'destructive' 
      });
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const { data: mediaItems = [], isLoading } = useQuery<MediaItem[]>({
    queryKey: ['/api/media', { search, category, includeArchived, folderId: currentFolderId }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (category !== 'all') params.set('category', category);
      if (includeArchived) params.set('includeArchived', 'true');
      if (currentFolderId) params.set('folderId', currentFolderId);
      const res = await fetch(`/api/media?${params}`, { credentials: 'include' });
      const data = await res.json();
      // Ensure we always return an array even if API returns an error object
      return Array.isArray(data) ? data : [];
    },
  });

  // Safely filter items - ensure mediaItems is always an array
  const safeMediaItems = Array.isArray(mediaItems) ? mediaItems : [];
  const filteredItems = currentFolderId 
    ? safeMediaItems.filter(item => item.folderId === currentFolderId)
    : safeMediaItems.filter(item => !item.folderId);

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; title?: string; notes?: string; category?: string; isArchived?: boolean }) => {
      return apiRequest(`/api/media/${id}`, { method: 'PATCH', body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/media'] });
      toast({ title: 'Success', description: 'Media updated' });
      setEditingMedia(null);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update media', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/media/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/media'] });
      toast({ title: 'Success', description: 'Media deleted' });
      setDeleteConfirm(null);
      setSelectedMedia(null);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete media', variant: 'destructive' });
    },
  });

  const handleEdit = (media: MediaItem) => {
    setEditTitle(media.title || '');
    setEditNotes(media.notes || '');
    setEditCategory(media.category || 'other');
    setEditingMedia(media);
  };

  const handleSaveEdit = () => {
    if (!editingMedia) return;
    updateMutation.mutate({
      id: editingMedia.id,
      title: editTitle,
      notes: editNotes,
      category: editCategory,
    });
  };

  const handleArchive = (media: MediaItem) => {
    updateMutation.mutate({
      id: media.id,
      isArchived: !media.isArchived,
    });
  };

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Media Library</h1>
          <p className="text-muted-foreground">
            Captured images and documents for quick reference
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline"
            onClick={() => setIsCreateFolderOpen(true)}
          >
            <FolderPlus className="mr-2 h-4 w-4" />
            New Folder
          </Button>
          <Button 
            variant="outline" 
            disabled={isUploading}
            onClick={() => document.getElementById('file-upload-input')?.click()}
            data-testid="button-upload-file"
          >
            {isUploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {isUploading ? 'Uploading...' : 'Upload File'}
          </Button>
          <input
            id="file-upload-input"
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp"
            onChange={handleFileUpload}
            className="hidden"
          />
          <CameraCapture
            trigger={
              <Button data-testid="button-new-capture">
                <Camera className="mr-2 h-4 w-4" />
                Capture New
              </Button>
            }
          />
        </div>
      </div>

      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-1 mb-4 text-sm">
        {getBreadcrumbs().map((crumb, index, arr) => (
          <div key={crumb.id ?? 'root'} className="flex items-center">
            <button
              onClick={() => setCurrentFolderId(crumb.id)}
              className={`flex items-center gap-1 px-2 py-1 rounded hover:bg-muted ${
                index === arr.length - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground'
              }`}
            >
              {index === 0 ? <Home className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
              {crumb.name}
            </button>
            {index < arr.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title, filename, or notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-search-media"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[180px]" data-testid="select-filter-category">
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
        <Button
          variant={includeArchived ? 'secondary' : 'outline'}
          onClick={() => setIncludeArchived(!includeArchived)}
          data-testid="button-toggle-archived"
        >
          <Archive className="mr-2 h-4 w-4" />
          {includeArchived ? 'Showing Archived' : 'Show Archived'}
        </Button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : filteredItems.length === 0 && childFolders.length === 0 ? (
        <div className="text-center py-12">
          <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">This folder is empty</h3>
          <p className="text-muted-foreground">
            Create a folder, upload files, or capture images.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {/* Folders first */}
          {childFolders.map((folder) => (
            <Card
              key={folder.id}
              className="group cursor-pointer transition-all hover:ring-2 hover:ring-primary"
              onClick={() => setCurrentFolderId(folder.id)}
            >
              <CardContent className="p-0">
                <div className="aspect-square flex flex-col items-center justify-center bg-muted/50 rounded-t-lg">
                  <FolderOpen className="h-16 w-16 text-amber-500" />
                </div>
                <div className="p-3 border-t">
                  <p className="font-medium text-sm truncate">{folder.name}</p>
                  <p className="text-xs text-muted-foreground">Folder</p>
                </div>
              </CardContent>
            </Card>
          ))}
          {/* Then media items */}
          {filteredItems.map((media) => (
            <Card
              key={media.id}
              className={`group cursor-pointer transition-all hover:ring-2 hover:ring-primary ${
                media.isArchived ? 'opacity-60' : ''
              }`}
              onClick={() => setSelectedMedia(media)}
              data-testid={`card-media-${media.id}`}
            >
              <CardContent className="p-0">
                <div className="relative aspect-square">
                  {media.mimeType.startsWith('image/') ? (
                    <img
                      src={getMediaUrl(media.storagePath)}
                      alt={media.title || media.filename}
                      className="w-full h-full object-cover rounded-t-lg"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-muted rounded-t-lg">
                      <FileText className="h-12 w-12 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button size="icon" variant="secondary" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedMedia(media); }}>
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(media); }}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setMovingItem(media); }}>
                          <MoveRight className="mr-2 h-4 w-4" />
                          Move to Folder
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleArchive(media); }}>
                          <Archive className="mr-2 h-4 w-4" />
                          {media.isArchived ? 'Unarchive' : 'Archive'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirm(media); }}
                          className="text-red-600"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {media.isArchived && (
                    <Badge className="absolute top-2 left-2 bg-gray-500">Archived</Badge>
                  )}
                </div>
                <div className="p-3">
                  <p className="font-medium text-sm truncate">
                    {media.title || media.filename}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {getCategoryLabel(media.category)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(media.captureDate), 'MMM d, yyyy')}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* View Dialog */}
      <Dialog open={!!selectedMedia} onOpenChange={() => setSelectedMedia(null)}>
        <DialogContent className={selectedMedia?.mimeType === 'application/pdf' ? "max-w-4xl h-[85vh]" : "max-w-3xl"}>
          {selectedMedia && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedMedia.title || selectedMedia.filename}</DialogTitle>
                <DialogDescription>
                  {getCategoryLabel(selectedMedia.category)} | {formatFileSize(selectedMedia.fileSize)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 flex-1">
                <div className="relative bg-muted rounded-lg overflow-hidden">
                  {selectedMedia.mimeType.startsWith('image/') ? (
                    <img
                      src={getMediaUrl(selectedMedia.storagePath)}
                      alt={selectedMedia.title || selectedMedia.filename}
                      className="w-full max-h-[60vh] object-contain"
                    />
                  ) : selectedMedia.mimeType === 'application/pdf' ? (
                    <iframe
                      src={getMediaUrl(selectedMedia.storagePath)}
                      className="w-full h-[calc(85vh-220px)] border-0"
                      title="PDF Preview"
                    />
                  ) : (
                    <div className="h-48 flex flex-col items-center justify-center gap-2">
                      <FileText className="h-16 w-16 text-muted-foreground" />
                      <p className="text-muted-foreground text-sm">Preview not available</p>
                      <p className="text-muted-foreground text-xs">Download or open to view this file</p>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedMedia.capturedByName || 'Unknown'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>{format(new Date(selectedMedia.captureDate), 'MMM d, yyyy h:mm a')}</span>
                  </div>
                </div>
                {selectedMedia.notes && (
                  <div>
                    <p className="text-muted-foreground text-sm">Notes</p>
                    <p className="text-sm">{selectedMedia.notes}</p>
                  </div>
                )}
              </div>
              <DialogFooter className="flex-wrap gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    const url = getMediaUrl(selectedMedia.storagePath);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = selectedMedia.filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                  data-testid="button-download-media"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
                <Button variant="outline" asChild>
                  <a 
                    href={getMediaUrl(selectedMedia.storagePath)} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    data-testid="button-open-new-tab"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open
                  </a>
                </Button>
                <Button variant="outline" onClick={() => handleEdit(selectedMedia)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <Button variant="outline" onClick={() => handleArchive(selectedMedia)}>
                  <Archive className="mr-2 h-4 w-4" />
                  {selectedMedia.isArchived ? 'Unarchive' : 'Archive'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingMedia} onOpenChange={() => setEditingMedia(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Media</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                data-testid="input-edit-title"
              />
            </div>
            <div>
              <Label htmlFor="edit-category">Category</Label>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger data-testid="select-edit-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.filter(c => c.value !== 'all').map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={3}
                data-testid="input-edit-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMedia(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Media</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteConfirm?.title || deleteConfirm?.filename}"?
              This action cannot be undone and will also remove all attachments.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Folder Dialog */}
      <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Create a folder to organize your documents and images.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="folderName">Folder Name</Label>
            <Input
              id="folderName"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="e.g., Onboarding Documents"
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateFolderOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => createFolderMutation.mutate(newFolderName)}
              disabled={!newFolderName.trim() || createFolderMutation.isPending}
            >
              {createFolderMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Item Dialog */}
      <Dialog open={!!movingItem} onOpenChange={() => setMovingItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Move to Folder</DialogTitle>
            <DialogDescription>
              Select a destination folder for "{movingItem?.title || movingItem?.filename}".
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => movingItem && moveItemMutation.mutate({ itemId: movingItem.id, folderId: null })}
            >
              <Home className="mr-2 h-4 w-4" />
              Root (No folder)
            </Button>
            {folders.map((folder) => (
              <Button
                key={folder.id}
                variant="outline"
                className="w-full justify-start"
                onClick={() => movingItem && moveItemMutation.mutate({ itemId: movingItem.id, folderId: folder.id })}
              >
                <Folder className="mr-2 h-4 w-4 text-amber-500" />
                {folder.name}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
