import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Package,
  Layers,
  AlertCircle,
} from 'lucide-react';

function formatLayupRequirementType(type: string): string {
  switch (type) {
    case 'MATERIAL':
      return 'Prepreg / Material';
    case 'CONSUMABLE':
      return 'Consumable';
    case 'COMPONENT':
      return 'Component / Packet';
    case 'KIT_ITEM':
      return 'Kit Item';
    case 'SUBASSEMBLY':
      return 'Subassembly';
    default:
      return type;
  }
}

type AllocationRequirement = {
  id: string;
  manufacturingQueueId: number;
  requiredItemId: number | null;
  requiredPartNumber: string;
  requiredPartName: string | null;
  requirementType: string;
  unitOfMeasure: string;
  requiredQty: string;
  allocatedQty: string | null;
  stagedQty: string | null;
  consumedQty: string | null;
  allocationStatus: string | null;
  isCritical: boolean | null;
  notes: string | null;
  materialLotId: string | null;
  internalControlNumber: string | null;
};

type MaterialLot = {
  id: string;
  internalControlNumber: string | null;
  materialPartNumber: string | null;
  supplier: string | null;
  remainingQty: string;
  unitOfMeasure: string;
  status: string;
  storageLocation: string | null;
  expirationDate: string | null;
  totalOutTimeMinutes: number | null;
  maxOutTimeMinutes: number | null;
};

type KitQueueItem = {
  id: number;
  inventoryItem: {
    agPartNumber: string | null;
    name: string;
  } | null;
  readinessStatus: string | null;
  percentReady: string | null;
};

function ShortfallBadge({
  required,
  allocated,
  staged,
  uom,
}: {
  required: number;
  allocated: number;
  staged: number;
  uom: string;
}) {
  const covered = Math.max(allocated, staged);
  const shortfall = Math.max(0, required - covered);
  if (shortfall <= 0) {
    return (
      <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 font-semibold text-sm whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        Met
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold text-sm whitespace-nowrap">
      <XCircle className="w-3.5 h-3.5 shrink-0" />
      Short {shortfall} {uom}
    </span>
  );
}

function LotComplianceBadges({ lot }: { lot: MaterialLot }) {
  const now = new Date();
  const isExpired = lot.expirationDate ? new Date(lot.expirationDate) < now : false;
  const outTimeExceeded =
    lot.maxOutTimeMinutes != null &&
    lot.totalOutTimeMinutes != null &&
    lot.totalOutTimeMinutes >= lot.maxOutTimeMinutes;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {lot.internalControlNumber && (
        <span className="inline-flex items-center text-xs text-blue-600 dark:text-blue-400 font-mono">
          ICN: {lot.internalControlNumber}
        </span>
      )}
      <span className="inline-flex items-center text-xs text-muted-foreground dark:text-gray-400">
        Rem: {parseFloat(lot.remainingQty)} {lot.unitOfMeasure}
      </span>
      {lot.expirationDate && (
        <Badge
          className={`text-xs ${isExpired ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'}`}
        >
          {isExpired ? <XCircle className="w-3 h-3 mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
          {isExpired ? 'EXPIRED' : 'Exp OK'}: {new Date(lot.expirationDate).toLocaleDateString()}
        </Badge>
      )}
      {lot.maxOutTimeMinutes != null && (
        <Badge
          className={`text-xs ${outTimeExceeded ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'}`}
        >
          {outTimeExceeded ? <XCircle className="w-3 h-3 mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
          Out-time: {lot.totalOutTimeMinutes ?? 0}/{lot.maxOutTimeMinutes} min
        </Badge>
      )}
    </div>
  );
}

function RequirementRow({
  req,
  queueId,
  isLayup,
  onActionComplete,
}: {
  req: AllocationRequirement;
  queueId: number;
  isLayup?: boolean;
  onActionComplete: () => void;
}) {
  const { toast } = useToast();
  const [allocQty, setAllocQty] = useState('');
  const [selectedLotId, setSelectedLotId] = useState<string>('');
  const [reserveQty, setReserveQty] = useState('');

  const required = parseFloat(req.requiredQty ?? '0');
  const allocated = parseFloat(req.allocatedQty ?? '0');
  const staged = parseFloat(req.stagedQty ?? '0');
  const covered = Math.max(allocated, staged);
  const shortfall = Math.max(0, required - covered);

  const { data: lots = [], isLoading: lotsLoading } = useQuery<MaterialLot[]>({
    queryKey: ['/api/material-lots', req.requiredPartNumber],
    queryFn: () => apiRequest(`/api/material-lots`),
    select: (data: MaterialLot[]) =>
      data.filter(
        (lot) =>
          lot.materialPartNumber === req.requiredPartNumber &&
          (lot.status === 'ACCEPTED' || lot.status === 'ISSUED') &&
          parseFloat(lot.remainingQty) > 0
      ),
  });

  const { data: reservedLotData } = useQuery<MaterialLot | null>({
    queryKey: ['/api/material-lots/single', req.materialLotId],
    queryFn: (): Promise<MaterialLot | null> =>
      apiRequest(`/api/material-lots/${req.materialLotId}`) as Promise<MaterialLot | null>,
    enabled: isLayup === true && req.materialLotId != null,
  });

  const allocateMutation = useMutation({
    mutationFn: () =>
      apiRequest('/api/allocation-control/allocate', {
        method: 'POST',
        body: JSON.stringify({
          requirementId: req.id,
          queueId,
          agPartNumber: req.requiredPartNumber,
          quantity: parseFloat(allocQty),
        }),
      }),
    onSuccess: () => {
      toast({
        title: 'Allocated',
        description: `Allocated ${allocQty} ${req.unitOfMeasure} of ${req.requiredPartNumber}`,
      });
      setAllocQty('');
      onActionComplete();
    },
    onError: (err: any) => {
      toast({
        title: 'Allocation failed',
        description: err?.message ?? 'Unknown error',
        variant: 'destructive',
      });
    },
  });

  const reserveLotMutation = useMutation({
    mutationFn: () =>
      apiRequest('/api/allocation-control/reserve-lot', {
        method: 'POST',
        body: JSON.stringify({
          requirementId: req.id,
          queueId,
          materialLotId: selectedLotId,
          quantity: parseFloat(reserveQty),
        }),
      }),
    onSuccess: () => {
      const lot = lots.find((l) => l.id === selectedLotId);
      toast({
        title: 'Lot reserved',
        description: `Lot ${lot?.internalControlNumber ?? selectedLotId.slice(0, 8)} reserved for ${req.requiredPartNumber}`,
      });
      setSelectedLotId('');
      setReserveQty('');
      onActionComplete();
    },
    onError: (err: any) => {
      toast({
        title: 'Reservation failed',
        description: err?.message ?? 'Unknown error',
        variant: 'destructive',
      });
    },
  });

  const canAllocate = allocQty && parseFloat(allocQty) > 0 && !allocateMutation.isPending;
  const canReserve =
    selectedLotId &&
    reserveQty &&
    parseFloat(reserveQty) > 0 &&
    !reserveLotMutation.isPending;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
      {/* Header row: part info + shortage status */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold dark:text-white">
              {req.requiredPartNumber}
            </span>
            <Badge variant="outline" className="text-xs">
              {isLayup ? formatLayupRequirementType(req.requirementType) : req.requirementType}
            </Badge>
            {req.isCritical && (
              <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 text-xs">
                <AlertCircle className="w-3 h-3 mr-1" />
                Critical
              </Badge>
            )}
          </div>
          {req.requiredPartName && (
            <p className="text-sm text-muted-foreground dark:text-gray-400 truncate">
              {req.requiredPartName}
            </p>
          )}
          {req.internalControlNumber && !isLayup && (
            <p className="text-xs text-blue-600 dark:text-blue-400">
              ICN: {req.internalControlNumber}
            </p>
          )}
          {isLayup && req.materialLotId && reservedLotData && (
            <LotComplianceBadges lot={reservedLotData} />
          )}
          {isLayup && !req.materialLotId && (
            <p className="text-xs text-muted-foreground dark:text-gray-500 italic">No lot reserved — quantity-only check applies</p>
          )}
        </div>
        <div className="shrink-0 mt-0.5">
          <ShortfallBadge
            required={required}
            allocated={allocated}
            staged={staged}
            uom={req.unitOfMeasure}
          />
        </div>
      </div>

      {/* Qty summary grid */}
      <div className="grid grid-cols-4 gap-2 text-center text-sm">
        <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
          <p className="text-xs text-muted-foreground dark:text-gray-400">Required</p>
          <p className="font-semibold dark:text-white">{required}</p>
          <p className="text-xs text-muted-foreground dark:text-gray-500">{req.unitOfMeasure}</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
          <p className="text-xs text-muted-foreground dark:text-gray-400">Allocated</p>
          <p className={`font-semibold ${allocated > 0 ? 'text-blue-600 dark:text-blue-400' : 'dark:text-white'}`}>{allocated}</p>
          <p className="text-xs text-muted-foreground dark:text-gray-500">{req.unitOfMeasure}</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
          <p className="text-xs text-muted-foreground dark:text-gray-400">Staged</p>
          <p className={`font-semibold ${staged > 0 ? 'text-amber-600 dark:text-amber-400' : 'dark:text-white'}`}>{staged}</p>
          <p className="text-xs text-muted-foreground dark:text-gray-500">{req.unitOfMeasure}</p>
        </div>
        <div className={`rounded p-2 ${shortfall > 0 ? 'bg-red-50 dark:bg-red-950' : 'bg-green-50 dark:bg-green-950'}`}>
          <p className="text-xs text-muted-foreground dark:text-gray-400">Shortfall</p>
          <p className={`font-semibold ${shortfall > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
            {shortfall > 0 ? `-${shortfall}` : '0'}
          </p>
          <p className="text-xs text-muted-foreground dark:text-gray-500">{req.unitOfMeasure}</p>
        </div>
      </div>

      {/* Allocate from balance */}
      <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-700">
        <p className="text-xs font-semibold text-muted-foreground dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
          <Package className="w-3 h-3" /> Allocate from General Balance
        </p>
        <div className="flex gap-2">
          <Input
            type="number"
            min="0.01"
            step="0.01"
            placeholder={`Qty (${req.unitOfMeasure})`}
            value={allocQty}
            onChange={(e) => setAllocQty(e.target.value)}
            className="h-8 text-sm dark:bg-gray-800 dark:border-gray-700"
          />
          <Button
            size="sm"
            disabled={!canAllocate}
            onClick={() => allocateMutation.mutate()}
            className="h-8 whitespace-nowrap"
          >
            {allocateMutation.isPending ? 'Allocating…' : 'Allocate'}
          </Button>
        </div>
      </div>

      {/* Reserve specific lot */}
      <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-700">
        <p className="text-xs font-semibold text-muted-foreground dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
          <Layers className="w-3 h-3" /> Reserve Specific Lot (ICN)
        </p>
        {lotsLoading ? (
          <Skeleton className="h-8 w-full" />
        ) : lots.length === 0 ? (
          <p className="text-xs text-muted-foreground dark:text-gray-500 italic">
            No ACCEPTED/ISSUED lots available for {req.requiredPartNumber}.
          </p>
        ) : (
          <div className="flex gap-2">
            <Select value={selectedLotId} onValueChange={setSelectedLotId}>
              <SelectTrigger className="h-8 text-sm flex-1 dark:bg-gray-800 dark:border-gray-700 min-w-0">
                <SelectValue placeholder="Select lot (ICN)…" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                {lots.map((lot) => (
                  <SelectItem key={lot.id} value={lot.id}>
                    {lot.internalControlNumber ?? lot.id.slice(0, 8)} — {parseFloat(lot.remainingQty)} {lot.unitOfMeasure} avail
                    {lot.storageLocation ? ` @ ${lot.storageLocation}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Qty"
              value={reserveQty}
              onChange={(e) => setReserveQty(e.target.value)}
              className="h-8 text-sm w-20 dark:bg-gray-800 dark:border-gray-700"
              disabled={!selectedLotId}
            />
            <Button
              size="sm"
              disabled={!canReserve}
              onClick={() => reserveLotMutation.mutate()}
              variant="outline"
              className="h-8 whitespace-nowrap dark:bg-gray-800 dark:border-gray-700 dark:text-white"
            >
              {reserveLotMutation.isPending ? 'Reserving…' : 'Reserve'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function RequirementDrawer({
  kit,
  open,
  onClose,
  onQueueRefetch,
  isLayup,
}: {
  kit: KitQueueItem | null;
  open: boolean;
  onClose: () => void;
  onQueueRefetch: () => void;
  isLayup?: boolean;
}) {
  const {
    data: requirements = [],
    isLoading,
    refetch,
  } = useQuery<AllocationRequirement[]>({
    queryKey: ['/api/allocation-control/queue', kit?.id],
    queryFn: () => apiRequest(`/api/allocation-control/queue/${kit!.id}`),
    enabled: open && kit != null,
  });

  const handleActionComplete = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['/api/manufacturing-queue'] });
    onQueueRefetch();
  };

  const readinessColor = {
    READY: 'text-green-600 dark:text-green-400',
    PARTIAL: 'text-yellow-600 dark:text-yellow-400',
    BLOCKED: 'text-red-600 dark:text-red-400',
    NOT_READY: 'text-gray-500 dark:text-gray-400',
  }[kit?.readinessStatus ?? 'NOT_READY'] ?? 'text-gray-500 dark:text-gray-400';

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto dark:bg-gray-900 dark:border-gray-800"
      >
        <SheetHeader className="pb-4 border-b border-gray-200 dark:border-gray-700">
          <SheetTitle className="dark:text-white">
            {isLayup ? 'Layup Allocation Control' : 'Allocation Control'}
          </SheetTitle>
          <SheetDescription className="dark:text-gray-400 space-y-0.5">
            <span className="font-mono font-semibold text-foreground dark:text-white">
              {kit?.inventoryItem?.agPartNumber ?? `Queue #${kit?.id}`}
            </span>
            {' — '}
            {kit?.inventoryItem?.name ?? (isLayup ? 'Layup Item' : 'Kit Item')}
            <br />
            Readiness:{' '}
            <span className={`font-semibold ${readinessColor}`}>
              {kit?.readinessStatus ?? 'UNKNOWN'}
              {kit?.percentReady ? ` · ${Math.round(parseFloat(kit.percentReady))}%` : ''}
            </span>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {isLoading ? (
            <>
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </>
          ) : requirements.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground dark:text-gray-400 flex flex-col items-center gap-3">
              <AlertTriangle className="w-9 h-9 opacity-30" />
              <div className="space-y-1">
                <p className="text-sm font-medium">No allocation requirements found</p>
                <p className="text-xs">Use the Actions menu on the queue row to generate requirements first.</p>
              </div>
            </div>
          ) : (
            requirements.map((req) => (
              <RequirementRow
                key={req.id}
                req={req}
                queueId={kit!.id}
                isLayup={isLayup}
                onActionComplete={handleActionComplete}
              />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
