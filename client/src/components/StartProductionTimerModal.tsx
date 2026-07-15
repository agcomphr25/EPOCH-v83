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

interface TravelerScanResolution {
  scannedTravelerBarcode: string;
  traveler: {
    id: string;
    travelerNumber: string;
    serialNumber: string | null;
    lotNumber: string | null;
    partNumber: string | null;
    partName: string | null;
    status: string;
  } | null;
  serializedItem: {
    id: string;
    barcode: string;
    travelerBarcode: string | null;
    serialNumber: string | null;
    partNumber: string | null;
    partName: string | null;
    currentDepartment: string | null;
    status: string;
    mandrelNumber: number | null;
  } | null;
  routing: {
    id: string;
    ovenCureDepartment: string | null;
    timerConfig: {
      enabled?: boolean;
      defaultProgramId?: string;
      defaultProgramName?: string;
    } | null;
  } | null;
  timerDefaults: {
    serialNumber: string;
    mandrelNumber: number | null;
    programId: string | null;
    programName: string | null;
    departmentName: string | null;
  };
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
  enableTravelerScan?: boolean;
  requireAuth?: (action: () => void, description?: string) => void;
  getAuthHeaders?: () => Record<string, string>;
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
  enableTravelerScan = false,
  requireAuth,
  getAuthHeaders,
}: StartProductionTimerModalProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const travelerInputRef = useRef<HTMLInputElement>(null);
  const serialInputRef = useRef<HTMLInputElement>(null);
  const scanningActiveRef = useRef(false);

  const [travelerBarcode, setTravelerBarcode] = useState('');
  const [resolvedTraveler, setResolvedTraveler] = useState<TravelerScanResolution | null>(null);
  const [programId, setProgramId] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [mandrelNumber, setMandrelNumber] = useState('');
  const [ovenNumber, setOvenNumber] = useState('');
  const [ovenTemperature, setOvenTemperature] = useState('');
  const [ovenSlot, setOvenSlot] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [barcodeSupported, setBarcodeSupported] = useState(false);
  const [isResolvingTraveler, setIsResolvingTraveler] = useState(false);

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
        if (enableTravelerScan && !defaultSerialNumber) {
          travelerInputRef.current?.focus();
        } else if (!defaultSerialNumber) {
          serialInputRef.current?.focus();
        }
      }, 100);
    } else {
      stopScanning();
      setProgramId('');
      setTravelerBarcode('');
      setResolvedTraveler(null);
      setSerialNumber('');
      setMandrelNumber('');
      setOvenNumber('');
      setOvenSlot('');
    }
  }, [open, defaultSerialNumber, defaultProgramId, enableTravelerScan]);

  useEffect(() => {
    if (!open || defaultProgramId || programId || !programs?.length) return;
    if (programs.length === 1) {
      setProgramId(programs[0].id);
    }
  }, [open, defaultProgramId, programId, programs]);

  const applyTravelerResolution = (resolution: TravelerScanResolution) => {
    setResolvedTraveler(resolution);
    setTravelerBarcode(resolution.scannedTravelerBarcode);
    setSerialNumber(resolution.timerDefaults.serialNumber || '');
    if (resolution.timerDefaults.mandrelNumber) {
      setMandrelNumber(String(resolution.timerDefaults.mandrelNumber));
    }
    if (resolution.timerDefaults.programId) {
      setProgramId(resolution.timerDefaults.programId);
    }
  };

  const resolveTravelerScan = async (scanValue: string) => {
    const trimmed = scanValue.trim();
    if (!trimmed) return;

    setIsResolvingTraveler(true);
    try {
      const resolution = await apiRequest(`/api/production/timers/traveler-scan/${encodeURIComponent(trimmed)}`);
      applyTravelerResolution(resolution);
      toast({
        title: 'Traveler loaded',
        description: resolution.traveler?.travelerNumber || resolution.serializedItem?.barcode || trimmed,
      });
    } catch (error: any) {
      setResolvedTraveler(null);
      toast({
        title: 'Traveler not found',
        description: error.message || 'Scan a traveler or serialized item barcode.',
        variant: 'destructive',
      });
    } finally {
      setIsResolvingTraveler(false);
    }
  };

  const startMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/production/timers/runs/start', {
        method: 'POST',
        headers: getAuthHeaders?.(),
        body: JSON.stringify({
          programId,
          serialNumber: serialNumber.trim(),
          mandrelNumber: parseInt(mandrelNumber, 10),
          ovenNumber: parseInt(ovenNumber, 10),
          ...(ovenTemperature.trim() ? { ovenTemperature: parseFloat(ovenTemperature) } : {}),
          ovenSlot,
          ...(resolvedTraveler?.scannedTravelerBarcode || travelerBarcode.trim()
            ? { scannedTravelerBarcode: resolvedTraveler?.scannedTravelerBarcode || travelerBarcode.trim() }
            : {}),
          ...(badgeId ? { badgeId } : {}),
          ...(travelerId || resolvedTraveler?.traveler?.id ? { travelerId: travelerId || resolvedTraveler?.traveler?.id } : {}),
          ...(travelerStepId ? { travelerStepId } : {}),
          ...(travelerTaskId ? { travelerTaskId } : {}),
          ...(departmentName || resolvedTraveler?.timerDefaults.departmentName ? { departmentName: departmentName || resolvedTraveler?.timerDefaults.departmentName } : {}),
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

      scanningActiveRef.current = true;
      setIsScanning(true);

      if ('BarcodeDetector' in window) {
        const detector = new (window as any).BarcodeDetector({
          formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'qr_code', 'upc_a', 'upc_e'],
        });

        const scanFrame = async () => {
          if (!videoRef.current || !scanningActiveRef.current) return;

          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const scannedValue = barcodes[0].rawValue;
              if (enableTravelerScan) {
                await resolveTravelerScan(scannedValue);
              } else {
                setSerialNumber(scannedValue);
              }
              toast({ title: 'Barcode scanned', description: scannedValue });
              stopScanning();
              return;
            }
          } catch (err) {
            console.error('Barcode detection error:', err);
          }

          if (scanningActiveRef.current) {
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
      scanningActiveRef.current = false;
      setIsScanning(false);
    }
  };

  const stopScanning = () => {
    scanningActiveRef.current = false;
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
    const startTimer = () => startMutation.mutate();
    if (requireAuth && !badgeId) {
      requireAuth(startTimer, 'start this timer');
      return;
    }
    startTimer();
  };

  const isValid = programId && serialNumber.trim() && mandrelNumber && ovenNumber && ovenSlot;
  const showProgramSelector = !enableTravelerScan || (!programId && (programs?.length || 0) > 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <ScanBarcode className="w-5 h-5" />
            Scan Traveler to Start Timer
          </DialogTitle>
          <DialogDescription>
            Scan the traveler, then enter mandrel, oven, and side.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {enableTravelerScan && (
            <div className="space-y-2">
              <Label htmlFor="travelerBarcode" className="text-base font-semibold">Traveler Barcode *</Label>
              <div className="flex gap-2 rounded-lg border-2 border-emerald-300 bg-emerald-50/70 p-3 dark:border-emerald-700 dark:bg-emerald-950/30">
                <Input
                  id="travelerBarcode"
                  ref={travelerInputRef}
                  value={travelerBarcode}
                  onChange={(e) => setTravelerBarcode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      resolveTravelerScan(travelerBarcode);
                    }
                  }}
                  placeholder="Scan traveler barcode"
                  className="h-14 flex-1 bg-white font-mono text-lg dark:bg-slate-950"
                  autoComplete="off"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => resolveTravelerScan(travelerBarcode)}
                  disabled={!travelerBarcode.trim() || isResolvingTraveler}
                  className="h-14 border-emerald-300 bg-white dark:bg-slate-950"
                >
                  {isResolvingTraveler ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ScanBarcode className="w-4 h-4" />
                  )}
                </Button>
              </div>
              {resolvedTraveler && (
                <div className="rounded-md border bg-slate-50 p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">
                      {resolvedTraveler.traveler?.travelerNumber || resolvedTraveler.serializedItem?.barcode}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {resolvedTraveler.timerDefaults.departmentName || resolvedTraveler.serializedItem?.currentDepartment || 'No department'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Serial: {resolvedTraveler.timerDefaults.serialNumber || '-'}</span>
                    <span>Part: {resolvedTraveler.serializedItem?.partNumber || resolvedTraveler.traveler?.partNumber || '-'}</span>
                    <span>Mandrel: {resolvedTraveler.timerDefaults.mandrelNumber || 'Enter below'}</span>
                    <span>Program: {resolvedTraveler.timerDefaults.programName || 'Select below'}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {showProgramSelector && (
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
          )}

          {!enableTravelerScan && (
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
          )}

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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
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
              <Label htmlFor="ovenTemperature">Oven Temp (°F)</Label>
              <Input
                id="ovenTemperature"
                type="number"
                min="0"
                max="2000"
                step="0.1"
                inputMode="decimal"
                value={ovenTemperature}
                onChange={(event) => setOvenTemperature(event.target.value)}
                placeholder="e.g. 250"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ovenSlot">Side *</Label>
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
