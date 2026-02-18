import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Package, Calendar, Hash, Snowflake, CheckCircle, AlertTriangle } from 'lucide-react';

interface FabricInventoryItem {
  id: string;
  internalControlNumber: string;
  expirationDate: string;
  batchNumber: string;
  fabricType: string;
  brand: string;
  freezerNumber: string;
  partNumber: string;
  rollNumber: string;
  quantityInStock: number;
  status: string;
  nickname: string;
}

interface FabricInventoryPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (item: FabricInventoryItem) => void;
}

export default function FabricInventoryPicker({ open, onClose, onSelect }: FabricInventoryPickerProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: items = [], isLoading } = useQuery<FabricInventoryItem[]>({
    queryKey: ['/api/inventory/fabric', debouncedSearch],
    queryFn: async () => {
      const params = debouncedSearch ? `?search=${encodeURIComponent(debouncedSearch)}` : '';
      const res = await fetch(`/api/inventory/fabric${params}`);
      if (!res.ok) throw new Error('Failed to fetch fabric inventory');
      return res.json();
    },
    enabled: open,
  });

  const isExpired = (dateStr: string) => {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  };

  const handleSelect = (item: FabricInventoryItem) => {
    onSelect(item);
    onClose();
    setSearch('');
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setSearch(''); } }}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Select Material from Fabric Inventory
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by ICN, fabric type, part number, batch..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            autoFocus
          />
        </div>

        <ScrollArea className="h-[400px] pr-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              Loading inventory...
            </div>
          ) : items.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              {search ? 'No matching inventory found' : 'No active fabric inventory'}
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const expired = isExpired(item.expirationDate);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors hover:bg-accent ${
                      expired ? 'border-red-200 bg-red-50/50' : 'border-border'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-semibold text-sm">
                            {item.internalControlNumber || 'No ICN'}
                          </span>
                          {expired && (
                            <Badge variant="destructive" className="text-xs gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Expired
                            </Badge>
                          )}
                          {item.quantityInStock > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              Qty: {item.quantityInStock}
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {item.fabricType && <span>{item.fabricType}</span>}
                          {item.brand && <span> — {item.brand}</span>}
                          {item.nickname && <span> ({item.nickname})</span>}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {item.batchNumber && (
                            <span className="flex items-center gap-1">
                              <Hash className="h-3 w-3" />
                              Batch: {item.batchNumber}
                            </span>
                          )}
                          {item.expirationDate && (
                            <span className={`flex items-center gap-1 ${expired ? 'text-red-600 font-medium' : ''}`}>
                              <Calendar className="h-3 w-3" />
                              Exp: {item.expirationDate}
                            </span>
                          )}
                          {item.freezerNumber && (
                            <span className="flex items-center gap-1">
                              <Snowflake className="h-3 w-3" />
                              Freezer: {item.freezerNumber}
                            </span>
                          )}
                          {item.partNumber && (
                            <span>P/N: {item.partNumber}</span>
                          )}
                        </div>
                      </div>
                      <CheckCircle className="h-4 w-4 text-muted-foreground/30 shrink-0 mt-1" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => { onClose(); setSearch(''); }}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
