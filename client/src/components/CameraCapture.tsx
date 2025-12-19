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
import { Camera, Upload, X, Image, Loader2, ScanLine } from 'lucide-react';
import DocumentScanner from './DocumentScanner';

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
  const [mode, setMode] = useState<'select' | 'camera' | 'upload' | 'preview' | 'scan'>('select');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState('other');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [scanMode, setScanMode] = useState(false);
  const [imageToScan, setImageToScan] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const uploadMutation = useMutation({
    mutationFn: async ({ file, title, notes, category }: { file: File; title: string; notes: string; category: string }) => {
      // Step 1: Request presigned URL for cloud storage
      const urlResponse = await fetch('/api/media/request-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type,
        }),
      });
      
      if (!urlResponse.ok) {
        throw new Error('Failed to get upload URL');
      }
      
      const { uploadURL, objectPath } = await urlResponse.json();
      
      // Step 2: Upload file directly to cloud storage
      const uploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      
      if (!uploadResponse.ok) {
        throw new Error('Failed to upload to cloud storage');
      }
      
      // Step 3: Complete upload - save metadata to database
      const completeResponse = await fetch('/api/media/complete-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          objectPath,
          filename: file.name,
          mimeType: file.type,
          fileSize: file.size,
          title: title || file.name,
          notes,
          category,
        }),
      });
      
      if (!completeResponse.ok) {
        throw new Error('Failed to complete upload');
      }
      
      return completeResponse.json();
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
      setCameraLoading(true);
      setMode('camera');
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera not supported in this browser. Please use the upload option.');
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraLoading(false);
    } catch (error: any) {
      console.error('Camera access error:', error);
      let errorMessage = 'Could not access camera. Try uploading a file instead.';
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Camera access denied. Please allow camera permissions or use the upload option.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No camera found on this device. Please use the upload option.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      setCameraError(errorMessage);
      setCameraLoading(false);
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
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
        
        stopCamera();
        
        if (scanMode) {
          setImageToScan(imageDataUrl);
          setMode('scan');
        } else {
          setCapturedImage(imageDataUrl);
          canvas.toBlob((blob) => {
            if (blob) {
              const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
              setCapturedFile(file);
            }
          }, 'image/jpeg', 0.8);
          setMode('preview');
        }
      }
    }
  }, [stopCamera, scanMode]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const imageDataUrl = event.target?.result as string;
        if (scanMode) {
          setImageToScan(imageDataUrl);
          setMode('scan');
        } else {
          setCapturedFile(file);
          setCapturedImage(imageDataUrl);
          setMode('preview');
        }
      };
      reader.readAsDataURL(file);
    }
  }, [scanMode]);

  const handleScanComplete = useCallback((processedFile: File, preview: string) => {
    setCapturedFile(processedFile);
    setCapturedImage(preview);
    setImageToScan(null);
    setMode('preview');
    if (processedFile.type === 'application/pdf') {
      setCategory('document');
    }
  }, []);

  const handleScanCancel = useCallback(() => {
    setImageToScan(null);
    setMode('select');
  }, []);

  const handleSave = useCallback(() => {
    if (!capturedFile) return;
    
    uploadMutation.mutate({
      file: capturedFile,
      title: title || capturedFile.name,
      notes,
      category,
    });
  }, [capturedFile, title, notes, category, uploadMutation]);

  const handleClose = useCallback(() => {
    stopCamera();
    setCapturedImage(null);
    setCapturedFile(null);
    setTitle('');
    setNotes('');
    setCategory('other');
    setCameraError(null);
    setCameraLoading(false);
    setScanMode(false);
    setImageToScan(null);
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
      // Block closing while upload is in progress
      if (!isOpen && uploadMutation.isPending) return;
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
      <DialogContent 
        className="sm:max-w-lg"
        onPointerDownOutside={(e) => {
          // Prevent closing by clicking outside while saving
          if (uploadMutation.isPending) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          // Prevent closing with Escape while saving
          if (uploadMutation.isPending) e.preventDefault();
        }}
      >
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
              <div className="flex items-center justify-center gap-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                <ScanLine className="h-5 w-5 text-blue-600" />
                <span className="text-sm font-medium">Document Scanner Mode</span>
                <label className="relative inline-flex items-center cursor-pointer ml-auto">
                  <input
                    type="checkbox"
                    checked={scanMode}
                    onChange={(e) => setScanMode(e.target.checked)}
                    className="sr-only peer"
                    data-testid="toggle-scan-mode"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                </label>
              </div>
              {scanMode && (
                <p className="text-xs text-muted-foreground text-center">
                  Auto-detects document edges, straightens, and enhances scanned images
                </p>
              )}
              <Button
                onClick={startCamera}
                className="h-24 flex flex-col gap-2"
                variant="outline"
                data-testid="button-use-camera"
              >
                {scanMode ? <ScanLine className="h-8 w-8" /> : <Camera className="h-8 w-8" />}
                <span>{scanMode ? 'Scan with Camera' : 'Use Camera'}</span>
              </Button>
              <Button
                onClick={() => fileInputRef.current?.click()}
                className="h-24 flex flex-col gap-2"
                variant="outline"
                data-testid="button-upload-file"
              >
                <Upload className="h-8 w-8" />
                <span>{scanMode ? 'Scan from File' : 'Upload File'}</span>
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
              {cameraError && (
                <p className="text-sm text-red-500 text-center">{cameraError}</p>
              )}
            </div>
          )}

          {/* Document Scanning View */}
          {mode === 'scan' && imageToScan && (
            <DocumentScanner
              imageData={imageToScan}
              onProcessed={handleScanComplete}
              onCancel={handleScanCancel}
            />
          )}

          {/* Camera View */}
          {mode === 'camera' && (
            <div className="relative">
              <div className="relative bg-gray-900 rounded-lg min-h-[300px] flex items-center justify-center">
                {cameraLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-10">
                    <Loader2 className="h-8 w-8 animate-spin mb-2" />
                    <span className="text-sm">Starting camera...</span>
                  </div>
                )}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full rounded-lg"
                  style={{ display: cameraLoading ? 'none' : 'block' }}
                />
              </div>
              <canvas ref={canvasRef} className="hidden" />
              <div className="flex justify-center gap-2 mt-4">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button 
                  onClick={capturePhoto} 
                  disabled={cameraLoading}
                  data-testid="button-take-photo"
                >
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
