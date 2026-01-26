import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Camera, Play, ScanBarcode, X } from 'lucide-react';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface ProductionProgram {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

interface StartProductionTimerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function StartProductionTimerModal({
  open,
  onOpenChange,
}: StartProductionTimerModalProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [programId, setProgramId] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [sku, setSku] = useState('');
  const [notes, setNotes] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [barcodeSupported, setBarcodeSupported] = useState(false);

  const { data: programs, isLoading: programsLoading } = useQuery<ProductionProgram[]>({
    queryKey: ['/api/production/timers/programs'],
    enabled: open,
  });

  useEffect(() => {
    if ('BarcodeDetector' in window) {
      setBarcodeSupported(true);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      stopScanning();
      setProgramId('');
      setInstanceName('');
      setSku('');
      setNotes('');
    }
  }, [open]);

  const startMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/production/timers/runs/start', {
        method: 'POST',
        body: JSON.stringify({
          programId,
          instanceName: instanceName.trim(),
          sku: sku.trim() || undefined,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/production/timers/runs'] });
      toast({ title: 'Timer started successfully' });
      onOpenChange(false);
      setLocation('/app/production/stations');
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to start timer',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const startScanning = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsScanning(true);

      if ('BarcodeDetector' in window) {
        const detector = new (window as any).BarcodeDetector({
          formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'qr_code', 'upc_a', 'upc_e'],
        });

        const scanFrame = async () => {
          if (!videoRef.current || !isScanning) return;

          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const scannedValue = barcodes[0].rawValue;
              setSku(scannedValue);
              toast({ title: 'Barcode scanned', description: scannedValue });
              stopScanning();
              return;
            }
          } catch (err) {
            console.error('Barcode detection error:', err);
          }

          if (isScanning) {
            requestAnimationFrame(scanFrame);
          }
        };

        scanFrame();
      }
    } catch (err) {
      console.error('Camera access error:', err);
      toast({
        title: 'Camera access denied',
        description: 'Please allow camera access to scan barcodes',
        variant: 'destructive',
      });
      setIsScanning(false);
    }
  };

  const stopScanning = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!programId || !instanceName.trim()) {
      toast({
        title: 'Missing required fields',
        description: 'Please select a program and enter an instance name',
        variant: 'destructive',
      });
      return;
    }
    startMutation.mutate();
  };

  const isValid = programId && instanceName.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Play className="w-5 h-5" />
            Start Production Timer
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="program">Program *</Label>
            <Select value={programId} onValueChange={setProgramId}>
              <SelectTrigger id="program">
                <SelectValue placeholder="Select a program..." />
              </SelectTrigger>
              <SelectContent>
                {programsLoading ? (
                  <div className="p-2 text-center text-muted-foreground">
                    Loading programs...
                  </div>
                ) : programs?.length === 0 ? (
                  <div className="p-2 text-center text-muted-foreground">
                    No active programs available
                  </div>
                ) : (
                  programs?.map((program) => (
                    <SelectItem key={program.id} value={program.id}>
                      {program.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="instanceName">Instance Name *</Label>
            <Input
              id="instanceName"
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
              placeholder="e.g., Batch #123, Station A, etc."
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sku">SKU</Label>
            <div className="flex gap-2">
              <Input
                id="sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Enter SKU or scan barcode"
                className="flex-1"
              />
              {barcodeSupported && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={isScanning ? stopScanning : startScanning}
                  title={isScanning ? 'Stop scanning' : 'Scan barcode'}
                >
                  {isScanning ? (
                    <X className="w-4 h-4" />
                  ) : (
                    <ScanBarcode className="w-4 h-4" />
                  )}
                </Button>
              )}
            </div>
          </div>

          {isScanning && (
            <div className="relative rounded-lg overflow-hidden bg-black">
              <video
                ref={videoRef}
                className="w-full h-48 object-cover"
                playsInline
                muted
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="border-2 border-green-500 w-3/4 h-16 rounded-lg" />
              </div>
              <p className="absolute bottom-2 left-0 right-0 text-center text-white text-sm bg-black/50 py-1">
                Point camera at barcode
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes..."
              rows={2}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!isValid || startMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {startMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start Timer
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
