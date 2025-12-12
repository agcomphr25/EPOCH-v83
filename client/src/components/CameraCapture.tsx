import { useState, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { useToast } from '@/hooks/use-toast';
import { Camera, Upload, X, Image, Loader2 } from 'lucide-react';

interface CameraCaptureProps {
  onCaptureComplete?: (media: any) => void;
  trigger?: React.ReactNode;
}

const CATEGORIES = [
  { value: 'packing_slip', label: 'Packing Slip' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'photo', label: 'Photo' },
  { value: 'document', label: 'Document' },
  { value: 'other', label: 'Other' },
];

export default function CameraCapture({ onCaptureComplete, trigger }: CameraCaptureProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'select' | 'camera' | 'upload' | 'preview'>('select');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState('other');
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/media/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to upload');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/media'] });
      toast({
        title: 'Success',
        description: 'Image saved to Media Library',
      });
      onCaptureComplete?.(data);
      handleClose();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save image',
        variant: 'destructive',
      });
    },
  });

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setMode('camera');
    } catch (error: any) {
      console.error('Camera access error:', error);
      setCameraError(error.message || 'Could not access camera. Try uploading a file instead.');
      setMode('select');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const capturePhoto = useCallback(() => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setCapturedImage(imageDataUrl);
        
        // Convert to File
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
            setCapturedFile(file);
          }
        }, 'image/jpeg', 0.8);
        
        stopCamera();
        setMode('preview');
      }
    }
  }, [stopCamera]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCapturedFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setCapturedImage(event.target?.result as string);
        setMode('preview');
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleSave = useCallback(() => {
    if (!capturedFile) return;
    
    const formData = new FormData();
    formData.append('file', capturedFile);
    formData.append('title', title || capturedFile.name);
    formData.append('notes', notes);
    formData.append('category', category);
    formData.append('tags', JSON.stringify([]));
    
    uploadMutation.mutate(formData);
  }, [capturedFile, title, notes, category, uploadMutation]);

  const handleClose = useCallback(() => {
    stopCamera();
    setCapturedImage(null);
    setCapturedFile(null);
    setTitle('');
    setNotes('');
    setCategory('other');
    setCameraError(null);
    setMode('select');
    setOpen(false);
  }, [stopCamera]);

  const handleRetake = useCallback(() => {
    setCapturedImage(null);
    setCapturedFile(null);
    setMode('select');
  }, []);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleClose();
      else setOpen(true);
    }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" data-testid="button-capture-media">
            <Camera className="mr-2 h-4 w-4" />
            Capture Image
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Capture Image</DialogTitle>
          <DialogDescription>
            Take a photo with your camera or upload an image file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mode Selection */}
          {mode === 'select' && (
            <div className="flex flex-col gap-3">
              <Button
                onClick={startCamera}
                className="h-24 flex flex-col gap-2"
                variant="outline"
                data-testid="button-use-camera"
              >
                <Camera className="h-8 w-8" />
                <span>Use Camera</span>
              </Button>
              <Button
                onClick={() => fileInputRef.current?.click()}
                className="h-24 flex flex-col gap-2"
                variant="outline"
                data-testid="button-upload-file"
              >
                <Upload className="h-8 w-8" />
                <span>Upload File</span>
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={handleFileSelect}
              />
              {cameraError && (
                <p className="text-sm text-red-500 text-center">{cameraError}</p>
              )}
            </div>
          )}

          {/* Camera View */}
          {mode === 'camera' && (
            <div className="relative">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full rounded-lg"
              />
              <canvas ref={canvasRef} className="hidden" />
              <div className="flex justify-center gap-2 mt-4">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button onClick={capturePhoto} data-testid="button-take-photo">
                  <Camera className="mr-2 h-4 w-4" />
                  Take Photo
                </Button>
              </div>
            </div>
          )}

          {/* Preview */}
          {mode === 'preview' && capturedImage && (
            <div className="space-y-4">
              <div className="relative">
                <img
                  src={capturedImage}
                  alt="Captured"
                  className="w-full rounded-lg max-h-64 object-contain bg-gray-100"
                />
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute top-2 right-2"
                  onClick={handleRetake}
                  data-testid="button-retake"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="title">Title (optional)</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter a title..."
                    data-testid="input-media-title"
                  />
                </div>

                <div>
                  <Label htmlFor="category">Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger data-testid="select-media-category">
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

                <div>
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add any notes..."
                    rows={2}
                    data-testid="input-media-notes"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {mode === 'preview' && (
          <DialogFooter>
            <Button variant="outline" onClick={handleRetake}>
              Retake
            </Button>
            <Button
              onClick={handleSave}
              disabled={uploadMutation.isPending}
              data-testid="button-save-media"
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Image className="mr-2 h-4 w-4" />
                  Save to Library
                </>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
