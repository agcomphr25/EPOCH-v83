import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Package, PlayCircle, CheckCircle } from 'lucide-react';
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface StockItem {
  id: number;
  itemId: string;
  itemName: string;
  itemType: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  specifications?: any;
  orderCount: number;
}

interface POWithStockItems {
  id: number;
  poNumber: string;
  customerName: string;
  customerId: string;
  dueDate?: string;
  status: string;
  totalStockQuantity: number;
  distinctStockItems: number;
  stockItems: StockItem[];
  prioritySettings?: {
    id: number;
    selectionMode: 'entire_po' | 'specific_items';
    stockItemIds: string[] | null;
    manualQuantities: Record<string, number> | null;
    priorityLevel: number;
  } | null;
}

interface Vendor {
  id: string;
  name: string;
  poCount: number;
  totalStockItems: number;
}

interface OemPrioritySettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function OemPrioritySettingsDialog({
  open,
  onOpenChange
}: OemPrioritySettingsDialogProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'priorities' | 'stock-items'>('stock-items');
  
  // Expandable state
  const [expandedPOIds, setExpandedPOIds] = useState<Set<number>>(new Set());
  
  // Selection state: Record<poId, Record<itemId, { selected: boolean, quantity: number }>>
  const [selectedItems, setSelectedItems] = useState<Record<number, Record<number, { selected: boolean, quantity: number }>>>({});
  
  // Selection mode per PO: Record<poId, 'entire_po' | 'specific_items'>
  const [selectionMode, setSelectionMode] = useState<Record<number, 'entire_po' | 'specific_items'>>({});
  
  // Priority level per PO
  const [priorityLevels, setPriorityLevels] = useState<Record<number, number>>({});
  
  // Vendor PO data cache: Record<vendorId, POWithStockItems[]>
  const [vendorPODataCache, setVendorPODataCache] = useState<Record<string, POWithStockItems[]>>({});

  // Fetch all vendors
  const { data: vendors = [], isLoading: vendorsLoading } = useQuery<Vendor[]>({
    queryKey: ['/api/po-vendors'],
    enabled: open
  });

  // Fetch vendor PO data when expanded
  const fetchVendorPOData = async (vendorId: string) => {
    if (vendorPODataCache[vendorId]) return vendorPODataCache[vendorId];
    
    const data = await apiRequest(`/api/oem-settings/layup-scheduler/oem-priority/${vendorId}`) as POWithStockItems[];
    setVendorPODataCache(prev => ({ ...prev, [vendorId]: data }));
    
    // Initialize selection state for new POs
    if (data && Array.isArray(data)) {
      const newSelectionMode: Record<number, 'entire_po' | 'specific_items'> = {};
      const newSelectedItems: Record<number, Record<number, { selected: boolean, quantity: number }>> = {};
      const newPriorityLevels: Record<number, number> = {};

      data.forEach((po: POWithStockItems) => {
        if (po.prioritySettings) {
          newSelectionMode[po.id] = po.prioritySettings.selectionMode;
          newPriorityLevels[po.id] = po.prioritySettings.priorityLevel;
          
          if (po.prioritySettings.selectionMode === 'specific_items' && po.prioritySettings.stockItemIds) {
            newSelectedItems[po.id] = {};
            po.prioritySettings.stockItemIds.forEach((itemId: string) => {
              const item = po.stockItems.find((i: StockItem) => i.id.toString() === itemId);
              if (item) {
                newSelectedItems[po.id][item.id] = {
                  selected: true,
                  quantity: po.prioritySettings!.manualQuantities?.[itemId] || item.quantity
                };
              }
            });
          } else if (po.prioritySettings.selectionMode === 'entire_po') {
            newSelectedItems[po.id] = {};
            po.stockItems.forEach((item: StockItem) => {
              newSelectedItems[po.id][item.id] = {
                selected: true,
                quantity: item.quantity
              };
            });
          }
        } else {
          newSelectionMode[po.id] = 'entire_po';
          newPriorityLevels[po.id] = 1;
        }
      });

      setSelectionMode(prev => ({ ...prev, ...newSelectionMode }));
      setSelectedItems(prev => ({ ...prev, ...newSelectedItems }));
      setPriorityLevels(prev => ({ ...prev, ...newPriorityLevels }));
    }
    
    return data;
  };

  // Save priority settings mutation
  const savePriorityMutation = useMutation({
    mutationFn: async ({ poId, vendorId, vendorName }: { poId: number, vendorId: string, vendorName: string }) => {
      const poData = vendorPODataCache[vendorId]?.find((p: POWithStockItems) => p.id === poId);
      if (!poData) throw new Error('PO not found');

      const mode = selectionMode[poId] || 'entire_po';
      const items = selectedItems[poId] || {};
      const stockItemIds = mode === 'entire_po'
        ? poData.stockItems.map((item: StockItem) => item.id.toString())
        : Object.keys(items).filter(itemId => items[parseInt(itemId)]?.selected);

      const manualQuantities: Record<string, number> = {};
      if (mode === 'specific_items') {
        Object.keys(items).forEach(itemId => {
          if (items[parseInt(itemId)]?.selected) {
            manualQuantities[itemId] = items[parseInt(itemId)].quantity;
          }
        });
      }

      return apiRequest('/api/oem-settings/priority-settings/save', {
        method: 'POST',
        body: JSON.stringify({
          vendorId,
          vendorName,
          poId,
          poNumber: poData.poNumber,
          selectionMode: mode,
          stockItemIds,
          manualQuantities,
          priorityLevel: priorityLevels[poId] || 1
        }),
        headers: { 'Content-Type': 'application/json' }
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/oem-settings/layup-scheduler/oem-priority/${variables.vendorId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/oem-settings/priority-settings'] });
      // Clear cache to refetch
      setVendorPODataCache(prev => {
        const updated = { ...prev };
        delete updated[variables.vendorId];
        return updated;
      });
      toast({
        title: "Priority Settings Saved",
        description: "OEM priority settings have been saved successfully"
      });
    },
    onError: (error) => {
      toast({
        title: "Save Failed",
        description: "Failed to save OEM priority settings",
        variant: "destructive"
      });
      console.error('Save error:', error);
    }
  });

  // Generate production orders mutation
  const generateOrdersMutation = useMutation({
    mutationFn: async (poId: number) => {
      return apiRequest(`/api/pos/${poId}/generate-production-orders`, {
        method: 'POST'
      });
    },
    onSuccess: (_, poId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/oem-settings/layup-scheduler/oem-priority'] });
      queryClient.invalidateQueries({ queryKey: [`/api/production-orders/by-po/${poId}`] });
      toast({
        title: "Production Orders Generated",
        description: "Production orders have been created successfully"
      });
    },
    onError: (error) => {
      toast({
        title: "Generation Failed",
        description: "Failed to generate production orders",
        variant: "destructive"
      });
      console.error('Generation error:', error);
    }
  });

  const togglePOExpansion = (poId: number) => {
    const newExpanded = new Set(expandedPOIds);
    if (newExpanded.has(poId)) {
      newExpanded.delete(poId);
    } else {
      newExpanded.add(poId);
    }
    setExpandedPOIds(newExpanded);
  };

  const toggleItemSelection = (poId: number, itemId: number, quantity: number) => {
    setSelectedItems(prev => {
      const poItems = prev[poId] || {};
      const isSelected = poItems[itemId]?.selected || false;
      
      return {
        ...prev,
        [poId]: {
          ...poItems,
          [itemId]: {
            selected: !isSelected,
            quantity: isSelected ? quantity : (poItems[itemId]?.quantity || quantity)
          }
        }
      };
    });
  };

  const updateItemQuantity = (poId: number, itemId: number, quantity: number) => {
    setSelectedItems(prev => {
      const poItems = prev[poId] || {};
      return {
        ...prev,
        [poId]: {
          ...poItems,
          [itemId]: {
            ...poItems[itemId],
            quantity
          }
        }
      };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">OEM Priority Settings</DialogTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            Configure priority scheduling for OEM purchase orders and stock items
          </p>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'priorities' | 'stock-items')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="stock-items" data-testid="tab-stock-items">
              <Package className="w-4 h-4 mr-2" />
              Stock Items & Selection
            </TabsTrigger>
            <TabsTrigger value="priorities" data-testid="tab-priorities">
              <CheckCircle className="w-4 h-4 mr-2" />
              Priority Summary
            </TabsTrigger>
          </TabsList>

          {/* Stock Items Tab - Main UI */}
          <TabsContent value="stock-items" className="space-y-4 mt-4">
            {vendorsLoading ? (
              <div className="text-center py-8 text-gray-500">Loading vendors...</div>
            ) : vendors.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No OEM vendors with open purchase orders</div>
            ) : (
              <Accordion type="multiple" className="space-y-3">
                {vendors.map((vendor: Vendor) => (
                  <AccordionItem key={vendor.id} value={vendor.id} className="border rounded-lg">
                    <AccordionTrigger 
                      className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => {
                        if (!vendorPODataCache[vendor.id]) {
                          fetchVendorPOData(vendor.id);
                        }
                      }}
                      data-testid={`vendor-accordion-${vendor.id}`}
                    >
                      <div className="flex items-center gap-3 flex-1 text-left">
                        <div>
                          <div className="font-semibold text-gray-900 dark:text-white">
                            {vendor.name}
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            {vendor.poCount} PO{vendor.poCount !== 1 ? 's' : ''} • {vendor.totalStockItems} stock items
                          </div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 py-3">
                      {!vendorPODataCache[vendor.id] ? (
                        <div className="text-center py-4 text-gray-500">Loading purchase orders...</div>
                      ) : vendorPODataCache[vendor.id].length === 0 ? (
                        <div className="text-center py-4 text-gray-500">No open purchase orders</div>
                      ) : (
                        <div className="space-y-3">
                          {vendorPODataCache[vendor.id].map((po: POWithStockItems) => (
                            <div key={po.id} className="border rounded-lg bg-gray-50 dark:bg-gray-900">
                              {/* PO Header - Collapsible */}
                              <div
                                className="p-3 flex items-center justify-between cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors rounded-t-lg"
                                onClick={() => togglePOExpansion(po.id)}
                                data-testid={`po-header-${po.id}`}
                              >
                                <div className="flex items-center gap-2 flex-1">
                                  {expandedPOIds.has(po.id) ? (
                                    <ChevronDown className="w-4 h-4 text-gray-500" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-gray-500" />
                                  )}
                                  <div>
                                    <div className="font-medium text-gray-900 dark:text-white text-sm">
                                      PO #{po.poNumber}
                                    </div>
                                    <div className="text-xs text-gray-600 dark:text-gray-400">
                                      {po.totalStockQuantity} items ({po.distinctStockItems} types) • Due: {po.dueDate ? new Date(po.dueDate).toLocaleDateString() : 'Not set'}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {po.prioritySettings && (
                                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                                      Priority {po.prioritySettings.priorityLevel}
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              {/* PO Content - Expandable */}
                              {expandedPOIds.has(po.id) && (
                                <div className="border-t p-3 space-y-3 bg-white dark:bg-gray-800">
                                  {/* Selection Mode */}
                                  <div className="flex gap-4 items-center bg-gray-50 dark:bg-gray-900 p-2 rounded text-sm">
                                    <span className="font-medium">Mode:</span>
                                    <div className="flex gap-3">
                                      <label className="flex items-center gap-1.5 cursor-pointer">
                                        <input
                                          type="radio"
                                          name={`mode-${po.id}`}
                                          checked={selectionMode[po.id] === 'entire_po'}
                                          onChange={() => setSelectionMode(prev => ({ ...prev, [po.id]: 'entire_po' }))}
                                          className="w-3.5 h-3.5"
                                          data-testid={`radio-entire-po-${po.id}`}
                                        />
                                        <span className="text-xs">Entire PO</span>
                                      </label>
                                      <label className="flex items-center gap-1.5 cursor-pointer">
                                        <input
                                          type="radio"
                                          name={`mode-${po.id}`}
                                          checked={selectionMode[po.id] === 'specific_items'}
                                          onChange={() => setSelectionMode(prev => ({ ...prev, [po.id]: 'specific_items' }))}
                                          className="w-3.5 h-3.5"
                                          data-testid={`radio-specific-items-${po.id}`}
                                        />
                                        <span className="text-xs">Specific Items</span>
                                      </label>
                                    </div>
                                  </div>

                                  {/* Stock Items Table */}
                                  <div className="border rounded">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead className="w-10">
                                            {selectionMode[po.id] === 'specific_items' && <span className="text-xs">Select</span>}
                                          </TableHead>
                                          <TableHead className="text-xs">Item Name</TableHead>
                                          <TableHead className="text-xs">Type</TableHead>
                                          <TableHead className="text-xs">PO Qty</TableHead>
                                          <TableHead className="text-xs">Schedule Qty</TableHead>
                                          <TableHead className="text-xs">Price</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {po.stockItems.map((item: StockItem) => {
                                          const isSelected = selectionMode[po.id] === 'entire_po' || selectedItems[po.id]?.[item.id]?.selected;
                                          const scheduleQty = selectedItems[po.id]?.[item.id]?.quantity || item.quantity;

                                          return (
                                            <TableRow key={item.id} data-testid={`stock-item-row-${item.id}`}>
                                              <TableCell className="py-2">
                                                {selectionMode[po.id] === 'specific_items' && (
                                                  <Checkbox
                                                    checked={isSelected}
                                                    onCheckedChange={() => toggleItemSelection(po.id, item.id, item.quantity)}
                                                    data-testid={`checkbox-item-${item.id}`}
                                                  />
                                                )}
                                              </TableCell>
                                              <TableCell className="font-medium text-sm py-2">{item.itemName}</TableCell>
                                              <TableCell className="py-2">
                                                <Badge variant="outline" className="text-xs">{item.itemType}</Badge>
                                              </TableCell>
                                              <TableCell className="text-sm py-2">{item.quantity}</TableCell>
                                              <TableCell className="py-2">
                                                {isSelected && selectionMode[po.id] === 'specific_items' ? (
                                                  <Input
                                                    type="number"
                                                    min={1}
                                                    max={item.quantity}
                                                    value={scheduleQty}
                                                    onChange={(e) => updateItemQuantity(po.id, item.id, parseInt(e.target.value) || 1)}
                                                    className="w-16 h-7 text-sm"
                                                    data-testid={`input-qty-${item.id}`}
                                                  />
                                                ) : (
                                                  <span className="text-sm text-gray-600">{scheduleQty}</span>
                                                )}
                                              </TableCell>
                                              <TableCell className="text-sm py-2">${item.unitPrice.toFixed(2)}</TableCell>
                                            </TableRow>
                                          );
                                        })}
                                      </TableBody>
                                    </Table>
                                  </div>

                                  {/* Action Buttons */}
                                  <div className="flex justify-between items-center pt-2 border-t">
                                    <div className="flex gap-3 items-center">
                                      <label className="text-xs font-medium">Priority:</label>
                                      <Input
                                        type="number"
                                        min={1}
                                        max={10}
                                        value={priorityLevels[po.id] || 1}
                                        onChange={(e) => setPriorityLevels(prev => ({ ...prev, [po.id]: parseInt(e.target.value) || 1 }))}
                                        className="w-16 h-7 text-sm"
                                        data-testid={`input-priority-${po.id}`}
                                      />
                                    </div>
                                    <div className="flex gap-2">
                                      <Button
                                        onClick={() => generateOrdersMutation.mutate(po.id)}
                                        disabled={generateOrdersMutation.isPending}
                                        variant="outline"
                                        size="sm"
                                        data-testid={`button-generate-${po.id}`}
                                      >
                                        <PlayCircle className="w-3.5 h-3.5 mr-1.5" />
                                        <span className="text-xs">Generate Orders</span>
                                      </Button>
                                      <Button
                                        onClick={() => savePriorityMutation.mutate({ poId: po.id, vendorId: vendor.id, vendorName: vendor.name })}
                                        disabled={savePriorityMutation.isPending}
                                        size="sm"
                                        data-testid={`button-save-${po.id}`}
                                      >
                                        <span className="text-xs">Save Priority</span>
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </TabsContent>

          {/* Priorities Tab - Summary View */}
          <TabsContent value="priorities" className="space-y-4 mt-4">
            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
              <h3 className="font-semibold mb-4">Priority Summary</h3>
              {Object.entries(vendorPODataCache).map(([vendorId, pos]) => (
                <div key={vendorId} className="mb-6">
                  <h4 className="font-medium mb-2 text-blue-700 dark:text-blue-400">
                    {vendors.find(v => v.id === vendorId)?.name || vendorId}
                  </h4>
                  {pos.map((po: POWithStockItems) => (
                    <div key={po.id} className="mb-3 p-3 bg-white dark:bg-gray-800 rounded border ml-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium text-sm">PO #{po.poNumber}</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            Mode: {selectionMode[po.id] === 'entire_po' ? 'Entire PO' : 'Specific Items'}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            Items: {selectionMode[po.id] === 'entire_po' 
                              ? `${po.totalStockQuantity} (all)`
                              : `${Object.values(selectedItems[po.id] || {}).filter(i => i.selected).length} selected`}
                          </div>
                        </div>
                        <Badge className="bg-blue-100 text-blue-800 text-xs">
                          Priority {priorityLevels[po.id] || 1}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
