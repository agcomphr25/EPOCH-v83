import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ShoppingCart, DollarSign, Users, RefreshCw, Calendar as CalendarIcon, Building2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

// Create Vendor PO Dialog component
function CreateVendorPODialog({ suggestion, isOpen, onClose }: {
  suggestion: any;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [formData, setFormData] = useState({
    vendorId: 0,
    expectedDeliveryDate: '',
    shipVia: '',
    notes: `Created from MRP suggestion for part ${suggestion?.partId || 'N/A'}`
  });
  const [deliveryDate, setDeliveryDate] = useState<Date | undefined>();
  const [selectedItems, setSelectedItems] = useState<any[]>([]);

  const queryClient = useQueryClient();

  // Fetch vendors for dropdown
  const { data: vendors = [] } = useQuery({
    queryKey: ['/api/vendors'],
    queryFn: () => apiRequest('/api/vendors'),
    enabled: isOpen
  });

  // Create vendor PO mutation
  const createVendorPOMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/vendor-pos', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    onSuccess: (newPO: any) => {
      // Add the suggested item to the newly created PO
      if (suggestion && newPO.id) {
        const itemData = {
          agPartNumber: suggestion.partId,
          description: `Item from MRP suggestion - ${suggestion.partId}`,
          quantity: suggestion.suggestedQty || 1,
          unitPrice: suggestion.estimatedCost ? (suggestion.estimatedCost / (suggestion.suggestedQty || 1)) : 0,
          vendorPartNumber: suggestion.preferredVendor?.vendorPartNumber || '',
          uom: 'EA',
          notes: 'Added from MRP suggestion'
        };

        // Add item to the vendor PO
        apiRequest(`/api/vendor-pos/${newPO.id}/items`, {
          method: 'POST',
          body: JSON.stringify(itemData)
        }).then(() => {
          // Refresh all vendor POs
          queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
          // Refresh the specific PO items list
          queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos', newPO.id, 'items'] });
          toast.success(`Vendor PO ${newPO.poNumber} created successfully with suggested item`);
        }).catch((error) => {
          toast.error('PO created but failed to add suggested item');
        });
      } else {
        toast.success(`Vendor PO created successfully`);
      }
      onClose();
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to create vendor PO');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.vendorId === 0) {
      toast.error('Please select a vendor');
      return;
    }

    createVendorPOMutation.mutate({
      ...formData,
      expectedDeliveryDate: deliveryDate ? deliveryDate.toISOString().split('T')[0] : undefined
    });
  };

  // Find the preferred vendor if available
  const preferredVendor = suggestion?.preferredVendor;
  const matchingVendor = vendors.find((v: any) => 
    v.name?.toLowerCase() === preferredVendor?.vendorName?.toLowerCase()
  );

  // Auto-select preferred vendor if found
  React.useEffect(() => {
    if (matchingVendor && formData.vendorId === 0) {
      setFormData({ ...formData, vendorId: matchingVendor.id });
    }
  }, [matchingVendor, formData.vendorId]);

  const shipViaOptions = [
    'FedEx Ground',
    'FedEx Express',
    'UPS Ground',
    'UPS Next Day',
    'USPS',
    'Freight',
    'Will Call',
    'Other'
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle data-testid="create-vendor-po-dialog-title">
            Create Vendor PO from Suggestion
          </DialogTitle>
        </DialogHeader>
        
        {suggestion && (
          <div className="bg-blue-50 p-4 rounded-lg mb-4">
            <h4 className="font-medium mb-2">MRP Suggestion Details:</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Part:</span>
                <span className="ml-2 font-medium">{suggestion.partId}</span>
              </div>
              <div>
                <span className="text-gray-600">Suggested Qty:</span>
                <span className="ml-2 font-medium">{suggestion.suggestedQty?.toLocaleString() || 'N/A'}</span>
              </div>
              {suggestion.preferredVendor && (
                <>
                  <div>
                    <span className="text-gray-600">Vendor:</span>
                    <span className="ml-2 font-medium">{suggestion.preferredVendor.vendorName}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Est. Cost:</span>
                    <span className="ml-2 font-medium">${suggestion.estimatedCost?.toFixed(2) || 'N/A'}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="vendorId">Vendor *</Label>
            <Select
              value={formData.vendorId.toString()}
              onValueChange={(value) => setFormData({ ...formData, vendorId: parseInt(value) })}
              data-testid="select-vendor"
            >
              <SelectTrigger>
                <SelectValue placeholder="Select vendor..." />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((vendor: any) => (
                  <SelectItem key={vendor.id} value={vendor.id.toString()}>
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      {vendor.name}
                      {matchingVendor?.id === vendor.id && (
                        <Badge className="ml-2 bg-green-100 text-green-800">Suggested</Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="expectedDeliveryDate">Expected Delivery Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !deliveryDate && "text-muted-foreground"
                  )}
                  data-testid="button-delivery-date"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {deliveryDate ? format(deliveryDate, "PPP") : "Select date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={deliveryDate}
                  onSelect={setDeliveryDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label htmlFor="shipVia">Ship Via</Label>
            <Select
              value={formData.shipVia}
              onValueChange={(value) => setFormData({ ...formData, shipVia: value })}
              data-testid="select-ship-via"
            >
              <SelectTrigger>
                <SelectValue placeholder="Select shipping method..." />
              </SelectTrigger>
              <SelectContent>
                {shipViaOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              data-testid="input-notes"
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button 
              type="submit" 
              className="flex-1" 
              disabled={createVendorPOMutation.isPending}
              data-testid="button-create-po"
            >
              {createVendorPOMutation.isPending ? 'Creating...' : 'Create Vendor PO'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel">
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function POSuggestionsCard() {
  const [selectedSuggestion, setSelectedSuggestion] = useState<any>(null);
  const [showCreatePODialog, setShowCreatePODialog] = useState(false);

  const { data: suggestions = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/enhanced/po/suggestions'],
    queryFn: () => apiRequest('/api/enhanced/po/suggestions')
  });

  const handleCreatePO = (suggestion: any) => {
    setSelectedSuggestion(suggestion);
    setShowCreatePODialog(true);
  };

  const totalEstimatedCost = suggestions.reduce((sum: number, s: any) => sum + (s.estimatedCost || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Purchase Order Suggestions</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Auto-generated purchase order recommendations based on MRP
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => refetch()}
          data-testid="button-refresh-po-suggestions"
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{suggestions.length}</div>
              <div className="text-sm text-gray-600">Suggested Orders</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                ${totalEstimatedCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-sm text-gray-600">Total Estimated Cost</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Suggestions List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-blue-500" />
            Purchase Recommendations
          </CardTitle>
          <CardDescription>
            Based on current shortages and reorder points
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-500">Loading suggestions...</span>
            </div>
          ) : suggestions.length > 0 ? (
            <div className="space-y-3">
              {suggestions.map((suggestion: any, index: number) => (
                <div key={index} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{suggestion.partId}</div>
                      <div className="text-sm text-gray-600">
                        Suggested Qty: {suggestion.suggestedQty?.toLocaleString() || 'N/A'}
                      </div>
                    </div>
                    <Badge className="bg-orange-100 text-orange-800">
                      Recommended
                    </Badge>
                  </div>

                  {suggestion.preferredVendor && (
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3 text-gray-400" />
                        <span>{suggestion.preferredVendor.vendorName}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3 text-gray-400" />
                        <span>${suggestion.estimatedCost?.toFixed(2) || 'N/A'}</span>
                      </div>
                      <div className="text-gray-600">
                        Part #: {suggestion.preferredVendor.vendorPartNumber}
                      </div>
                      <div className="text-gray-600">
                        Lead: {suggestion.preferredVendor.leadTimeDays || 'N/A'} days
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleCreatePO(suggestion)}
                      data-testid={`button-create-vendor-po-${suggestion.partId}`}
                    >
                      <ShoppingCart className="h-3 w-3 mr-1" />
                      Create Vendor PO
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <ShoppingCart className="h-12 w-12 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No purchase order suggestions at this time</p>
              <p className="text-xs text-gray-400 mt-1">Run MRP calculation to generate suggestions</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Vendor PO Dialog */}
      <CreateVendorPODialog
        suggestion={selectedSuggestion}
        isOpen={showCreatePODialog}
        onClose={() => {
          setShowCreatePODialog(false);
          setSelectedSuggestion(null);
        }}
      />
    </div>
  );
}