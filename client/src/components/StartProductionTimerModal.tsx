import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { Loader2, Play, ScanBarcode, X } from 'lucide-react';
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
  defaultSerialNumber?: string;
  defaultProgramId?: string;
  onTimerStarted?: () => void;
  navigateToStation?: boolean;
  badgeId?: string;
  travelerId?: string;
  travelerStepId?: string;
  travelerTaskId?: string;
  departmentName?: string;
}

export default function StartProductionTimerModal({
  open,
  onOpenChange,
  defaultSerialNumber,
  defaultProgramId,
  onTimerStarted,
  navigateToStation = true,
  badgeId,
  travelerId,
  travelerStepId,
  travelerTaskId,
  departmentName,
}: StartProductionTimerModalProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const serialInputRef = useRef<HTMLInputElement>(null);

  const [programId, setProgramId] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [description, setDescription] = useState('');
  const [mandrelNumber, setMandrelNumber] = useState('');
  const [ovenNumber, setOvenNumber] = useState('');
  const [ovenSlot, setOvenSlot] = useState('');
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
    if (open) {
      if (defaultSerialNumber) {
        setSerialNumber(defaultSerialNumber);
      }
      if (defaultProgramId) {
        setProgramId(defaultProgramId);
      }
      setTimeout(() => {
        if (!defaultSerialNumber) {
          serialInputRef.current?.focus();
        }
      }, 100);
    } else {
      stopScanning();
      setProgramId('');
      setSerialNumber('');
      setDescription('');
      setMandrelNumber('');
      setOvenNumber('');
      setOvenSlot('');
      setNotes('');
    }
  }, [open, defaultSerialNumber, defaultProgramId]);

  const startMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/production/timers/runs/start', {
        method: 'POST',
        body: JSON.stringify({
          programId,
          serialNumber: serialNumber.trim(),
          description: description.trim() || undefined,
          mandrelNumber: parseInt(mandrelNumber, 10),
          ovenNumber: parseInt(ovenNumber, 10),
          ovenSlot,
          ...(badgeId ? { badgeId } : {}),
          ...(travelerId ? { travelerId } : {}),
          ...(travelerStepId ? { travelerStepId } : {}),
          ...(travelerTaskId ? { travelerTaskId } : {}),
          ...(departmentName ? { departmentName } : {}),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/production/timers/runs'] });
      toast({ title: 'Timer started successfully' });
      onOpenChange(false);
      if (onTimerStarted) {
        onTimerStarted();
      }
      if (navigateToStation) {
        setLocation('/app/production/stations');
      }
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
              setSerialNumber(scannedValue);
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
    if (!isValid) {
      toast({
        title: 'Missing required fields',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }
    startMutation.mutate();
  };

  const isValid = programId && serialNumber.trim() && mandrelNumber && ovenNumber && ovenSlot;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Play className="w-5 h-5" />
            Start Timer
          </DialogTitle>
          <DialogDescription>
            Configure production run parameters
          </DialogDescription>
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
            <Label htmlFor="serialNumber">Serial # *</Label>
            <div className="flex gap-2">
              <Input
                id="serialNumber"
                ref={serialInputRef}
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                  }
                }}
                placeholder="Enter or scan serial number"
                className="flex-1"
                autoComplete="off"
                required
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
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter description (optional)"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="mandrel">Mandrel # *</Label>
              <Select value={mandrelNumber} onValueChange={setMandrelNumber}>
                <SelectTrigger id="mandrel">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="oven">Oven # *</Label>
              <Select value={ovenNumber} onValueChange={setOvenNumber}>
                <SelectTrigger id="oven">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ovenSlot">Oven Slot *</Label>
              <Select value={ovenSlot} onValueChange={setOvenSlot}>
                <SelectTrigger id="ovenSlot">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">R</SelectItem>
                  <SelectItem value="B">L</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

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
