import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { AuditDrawer } from './AuditDrawer';
import { Search, FileSearch } from 'lucide-react';

interface AuditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ENTITY_TYPE_ORDER = [
  'Order',
  'Inventory',
  'Customer',
  'BOM',
  'Department',
  'Employee',
  'Feature',
  'Payment',
  'Shipment',
  'StockModel',
  'Training',
  'User',
  'Vendor',
];

export function AuditModal({ open, onOpenChange }: AuditModalProps) {
  const [selectedEntityType, setSelectedEntityType] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Fetch available entity types
  const { data: entityTypesData } = useQuery<{ entityTypes: string[] }>({
    queryKey: ['/api/audit/entity-types'],
    queryFn: async () => {
      const response = await fetch('/api/audit/entity-types');
      if (!response.ok) throw new Error('Failed to fetch entity types');
      return response.json();
    },
    enabled: open,
  });

  // Sort entity types by the predefined order
  const sortedEntityTypes =
    entityTypesData?.entityTypes.sort((a, b) => {
      const aIndex = ENTITY_TYPE_ORDER.indexOf(a);
      const bIndex = ENTITY_TYPE_ORDER.indexOf(b);

      // If both are in the order list, sort by order
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }

      // If only a is in the order list, it comes first
      if (aIndex !== -1) return -1;

      // If only b is in the order list, it comes first
      if (bIndex !== -1) return 1;

      // If neither is in the order list, sort alphabetically
      return a.localeCompare(b);
    }) || [];

  // Fetch entities for selected type
  const { data: entitiesData, isLoading: entitiesLoading, error: entitiesError } = useQuery<{
    entities: string[];
  }>({
    queryKey: [
      '/api/audit/entities',
      selectedEntityType,
      { search: searchQuery },
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      const url = `/api/audit/entities/${selectedEntityType}${searchQuery ? `?${params}` : ''}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch entities');
      return response.json();
    },
    enabled: !!selectedEntityType && open,
  });

  // Reset search when entity type changes
  useEffect(() => {
    setSearchQuery('');
    setSelectedEntityId('');
  }, [selectedEntityType]);

  const handleViewAudit = () => {
    if (selectedEntityType && selectedEntityId) {
      setDrawerOpen(true);
    }
  };

  const handleDrawerClose = () => {
    setDrawerOpen(false);
    // Don't reset selections so user can go back if needed
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]" data-testid="dialog-audit-modal">
          <DialogHeader>
            <DialogTitle data-testid="text-modal-title">
              <div className="flex items-center gap-2">
                <FileSearch className="h-5 w-5" />
                Audit Trail Viewer
              </div>
            </DialogTitle>
            <DialogDescription data-testid="text-modal-description">
              Select an entity type and search for a specific record to view its
              audit history.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Entity Type Selection */}
            <div className="space-y-2">
              <Label htmlFor="entity-type">Entity Type</Label>
              <Select
                value={selectedEntityType}
                onValueChange={setSelectedEntityType}
              >
                <SelectTrigger id="entity-type" data-testid="select-entity-type">
                  <SelectValue placeholder="Select entity type..." />
                </SelectTrigger>
                <SelectContent>
                  {sortedEntityTypes.map((type) => (
                    <SelectItem key={type} value={type} data-testid={`option-entity-${type}`}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Entity ID Search */}
            {selectedEntityType && (
              <div className="space-y-2">
                <Label htmlFor="entity-id">
                  {selectedEntityType === 'Order'
                    ? 'Order ID'
                    : selectedEntityType === 'Customer'
                    ? 'Customer ID'
                    : selectedEntityType === 'Inventory'
                    ? 'Part Number'
                    : `${selectedEntityType} ID`}
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="entity-id"
                      placeholder={
                        selectedEntityType === 'Order'
                          ? 'Search by Order ID...'
                          : `Search by ${selectedEntityType} ID...`
                      }
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                      data-testid="input-search-entity"
                    />
                  </div>
                </div>

                {/* Entity Selection List */}
                {entitiesData && entitiesData.entities.length > 0 && (
                  <div className="border rounded-lg max-h-48 overflow-y-auto">
                    {entitiesData.entities.map((entityId) => (
                      <button
                        key={entityId}
                        onClick={() => setSelectedEntityId(entityId)}
                        className={`w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors ${
                          selectedEntityId === entityId
                            ? 'bg-primary/10 font-medium'
                            : ''
                        }`}
                        data-testid={`button-select-entity-${entityId}`}
                      >
                        {entityId}
                      </button>
                    ))}
                  </div>
                )}

                {entitiesLoading && (
                  <div className="text-sm text-muted-foreground py-4 text-center">
                    Loading...
                  </div>
                )}

                {entitiesError && (
                  <div className="text-sm text-destructive py-4 text-center">
                    Failed to load entities. Please try again.
                  </div>
                )}

                {entitiesData && entitiesData.entities.length === 0 && !entitiesError && (
                  <div
                    className="text-sm text-muted-foreground py-4 text-center"
                    data-testid="text-no-results"
                  >
                    No matching {selectedEntityType.toLowerCase()}s found
                  </div>
                )}
              </div>
            )}

            {/* Manual Entry Option */}
            {selectedEntityType && (
              <div className="space-y-2">
                <Label htmlFor="manual-entity-id">Or enter manually</Label>
                <Input
                  id="manual-entity-id"
                  placeholder={`Enter ${selectedEntityType} ID`}
                  value={selectedEntityId}
                  onChange={(e) => setSelectedEntityId(e.target.value)}
                  data-testid="input-manual-entity-id"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleViewAudit}
              disabled={!selectedEntityType || !selectedEntityId}
              data-testid="button-view-audit"
            >
              View Audit Trail
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Audit Drawer */}
      {selectedEntityType && selectedEntityId && (
        <AuditDrawer
          open={drawerOpen}
          onOpenChange={handleDrawerClose}
          entityType={selectedEntityType}
          entityId={selectedEntityId}
        />
      )}
    </>
  );
}
