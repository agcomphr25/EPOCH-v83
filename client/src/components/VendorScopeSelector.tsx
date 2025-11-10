import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, List, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ItemGroup, InventoryItem } from '@shared/schema';

interface VendorScopeData {
  groups: number[];
  items: number[];
}

interface VendorScopeSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export default function VendorScopeSelector({ value, onChange }: VendorScopeSelectorProps) {
  const [scopeData, setScopeData] = useState<VendorScopeData>({ groups: [], items: [] });
  const [isLegacyData, setIsLegacyData] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [itemSort, setItemSort] = useState<'name' | 'partNumber' | 'selected'>('name');
  const [itemFilter, setItemFilter] = useState<'all' | 'selected' | 'unselected'>('all');

  // Parse the JSON string value into scopeData (with backward compatibility for plain text)
  useEffect(() => {
    if (value) {
      try {
        const parsed = JSON.parse(value);
        // Validate that it has the expected structure
        if (parsed && typeof parsed === 'object' && 'groups' in parsed && 'items' in parsed) {
          setScopeData(parsed);
          setIsLegacyData(false);
        } else {
          // Invalid JSON structure, treat as empty
          setScopeData({ groups: [], items: [] });
          setIsLegacyData(false);
        }
      } catch {
        // Not valid JSON - this is a legacy plain-text scope value
        // Keep the existing plain text value by not changing it
        // The component will show it as empty, but won't clear it on save
        setScopeData({ groups: [], items: [] });
        setIsLegacyData(true);
      }
    } else {
      setScopeData({ groups: [], items: [] });
      setIsLegacyData(false);
    }
  }, [value]);

  // Fetch all item groups
  const { data: allGroups = [] } = useQuery<ItemGroup[]>({
    queryKey: ['/api/inventory/groups'],
  });

  // Fetch all inventory items
  const { data: allItems = [] } = useQuery<InventoryItem[]>({
    queryKey: ['/api/enhanced/inventory/items'],
  });

  const handleGroupToggle = (groupId: number) => {
    const newGroups = scopeData.groups.includes(groupId)
      ? scopeData.groups.filter(id => id !== groupId)
      : [...scopeData.groups, groupId];
    
    const newData = { ...scopeData, groups: newGroups };
    setScopeData(newData);
    onChange(JSON.stringify(newData));
  };

  const handleItemToggle = (itemId: number) => {
    const newItems = scopeData.items.includes(itemId)
      ? scopeData.items.filter(id => id !== itemId)
      : [...scopeData.items, itemId];
    
    const newData = { ...scopeData, items: newItems };
    setScopeData(newData);
    onChange(JSON.stringify(newData));
  };

  const selectedGroupNames = allGroups
    .filter(g => scopeData.groups.includes(g.id))
    .map(g => g.name);
  
  const selectedItemNames = allItems
    .filter(i => scopeData.items.includes(i.id))
    .map(i => `${i.agPartNumber} - ${i.name}`);

  // Filter and sort items for display (memoized for performance)
  const filteredAndSortedItems = React.useMemo(() => {
    return allItems
      .filter(item => {
        // Apply search filter
        const searchLower = itemSearch.toLowerCase();
        const itemName = item.name || '';
        const itemPartNumber = item.agPartNumber || '';
        const matchesSearch = !itemSearch || 
          itemName.toLowerCase().includes(searchLower) ||
          itemPartNumber.toLowerCase().includes(searchLower);
        
        // Apply selection filter
        const isSelected = scopeData.items.includes(item.id);
        const matchesFilter = 
          itemFilter === 'all' ||
          (itemFilter === 'selected' && isSelected) ||
          (itemFilter === 'unselected' && !isSelected);
        
        return matchesSearch && matchesFilter;
      })
      .sort((a, b) => {
        // Apply sorting
        if (itemSort === 'selected') {
          const aSelected = scopeData.items.includes(a.id) ? 1 : 0;
          const bSelected = scopeData.items.includes(b.id) ? 1 : 0;
          if (aSelected !== bSelected) return bSelected - aSelected;
          return (a.name || '').localeCompare(b.name || '');
        } else if (itemSort === 'partNumber') {
          return (a.agPartNumber || '').localeCompare(b.agPartNumber || '');
        } else {
          return (a.name || '').localeCompare(b.name || '');
        }
      });
  }, [allItems, itemSearch, itemFilter, itemSort, scopeData.items]);

  return (
    <div className="space-y-4">
      {/* Legacy Data Warning */}
      {isLegacyData && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-md">
          <div className="flex items-start gap-2">
            <Package className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-amber-900 dark:text-amber-100">Legacy Scope Data</p>
              <p className="text-amber-700 dark:text-amber-300 mt-1">
                This vendor has legacy text-based scope data: "{value?.substring(0, 60)}{value && value.length > 60 ? '...' : ''}"
              </p>
              <p className="text-amber-600 dark:text-amber-400 mt-1 text-xs">
                Select groups or items below to migrate to the new format, or leave unchanged to preserve existing data.
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Summary */}
      <div className="p-3 bg-muted rounded-md">
        <div className="text-sm font-medium mb-2">Selected Scope:</div>
        <div className="space-y-2">
          {selectedGroupNames.length > 0 && (
            <div>
              <span className="text-xs text-muted-foreground">Groups:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {selectedGroupNames.map((name, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {selectedItemNames.length > 0 && (
            <div>
              <span className="text-xs text-muted-foreground">Individual Items:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {selectedItemNames.slice(0, 5).map((name, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs">
                    {name}
                  </Badge>
                ))}
                {selectedItemNames.length > 5 && (
                  <Badge variant="outline" className="text-xs">
                    +{selectedItemNames.length - 5} more
                  </Badge>
                )}
              </div>
            </div>
          )}
          {selectedGroupNames.length === 0 && selectedItemNames.length === 0 && (
            <span className="text-xs text-muted-foreground">No items or groups selected</span>
          )}
        </div>
      </div>

      {/* Selection Tabs */}
      <Tabs defaultValue="groups" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="groups" data-testid="tab-select-groups">
            <Package className="h-4 w-4 mr-2" />
            Item Groups
          </TabsTrigger>
          <TabsTrigger value="items" data-testid="tab-select-items">
            <List className="h-4 w-4 mr-2" />
            Individual Items
          </TabsTrigger>
        </TabsList>

        <TabsContent value="groups" className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-3">
          {allGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No item groups available. Create groups from the Inventory Items page.
            </p>
          ) : (
            allGroups.map((group) => (
              <div key={group.id} className="flex items-start space-x-2 py-1">
                <Checkbox
                  id={`group-${group.id}`}
                  checked={scopeData.groups.includes(group.id)}
                  onCheckedChange={() => handleGroupToggle(group.id)}
                  data-testid={`checkbox-group-${group.id}`}
                />
                <div className="flex-1">
                  <Label
                    htmlFor={`group-${group.id}`}
                    className="text-sm font-medium cursor-pointer"
                  >
                    {group.name}
                  </Label>
                  {group.description && (
                    <p className="text-xs text-muted-foreground">{group.description}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="items" className="space-y-3">
          {/* Search and Filter Controls */}
          <div className="space-y-2 border rounded-md p-3 bg-muted/50">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or part number..."
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                className="pl-8 pr-8"
                data-testid="input-search-items"
              />
              {itemSearch && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1 h-7 w-7 p-0"
                  onClick={() => setItemSearch('')}
                  data-testid="button-clear-item-search"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Sort and Filter Controls */}
            <div className="flex gap-2">
              <div className="flex-1">
                <Select value={itemSort} onValueChange={(v) => setItemSort(v as any)}>
                  <SelectTrigger className="h-9" data-testid="select-sort-items">
                    <SelectValue placeholder="Sort by..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Sort by Name</SelectItem>
                    <SelectItem value="partNumber">Sort by Part Number</SelectItem>
                    <SelectItem value="selected">Selected First</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Select value={itemFilter} onValueChange={(v) => setItemFilter(v as any)}>
                  <SelectTrigger className="h-9" data-testid="select-filter-items">
                    <SelectValue placeholder="Filter..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Items</SelectItem>
                    <SelectItem value="selected">Selected Only</SelectItem>
                    <SelectItem value="unselected">Unselected Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Results Count */}
            <div className="text-xs text-muted-foreground" data-testid="text-items-count">
              Showing {filteredAndSortedItems.length} of {allItems.length} items
              {scopeData.items.length > 0 && ` (${scopeData.items.length} selected)`}
            </div>
          </div>

          {/* Items List */}
          <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-3">
            {allItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No inventory items available.
              </p>
            ) : filteredAndSortedItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No items match your search or filter criteria.
              </p>
            ) : (
              filteredAndSortedItems.map((item) => (
                <div key={item.id} className="flex items-start space-x-2 py-1">
                  <Checkbox
                    id={`item-${item.id}`}
                    checked={scopeData.items.includes(item.id)}
                    onCheckedChange={() => handleItemToggle(item.id)}
                    data-testid={`checkbox-item-${item.id}`}
                  />
                  <Label
                    htmlFor={`item-${item.id}`}
                    className="text-sm cursor-pointer flex-1"
                  >
                    <span className="font-mono text-xs text-muted-foreground mr-2">
                      {item.agPartNumber}
                    </span>
                    {item.name}
                  </Label>
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        Select item groups and/or individual items that this vendor is approved to supply.
      </p>
    </div>
  );
}
