import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { GitBranch, Package } from 'lucide-react';

interface SubAssemblyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentBomId: number;
  onSuccess: () => void;
}

interface BOMDefinition {
  id: number;
  sku: string;
  modelName: string;
  revision: string;
  description?: string;
  isActive: boolean;
}

export function SubAssemblyDialog({ open, onOpenChange, parentBomId, onSuccess }: SubAssemblyDialogProps) {
  const [selectedChildBomId, setSelectedChildBomId] = useState<string>('');
  const [partName, setPartName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [purchasingUnitConversion, setPurchasingUnitConversion] = useState('1');
  const [notes, setNotes] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch available sub-assemblies
  const { data: availableBOMs = [], isLoading } = useQuery<BOMDefinition[]>({
    queryKey: [`/api/boms/${parentBomId}/available-sub-assemblies`],
    enabled: open,
  });

  const createSubAssemblyMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest(`/api/boms/${parentBomId}/sub-assemblies`, {
        method: 'POST',
        body: data,
      });
    },
    onSuccess: () => {
      toast({ title: "Sub-assembly created successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/boms/${parentBomId}/details`] });
      resetForm();
      onSuccess();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create sub-assembly",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setSelectedChildBomId('');
    setPartName('');
    setQuantity('1');
    setPurchasingUnitConversion('1');
    setNotes('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedChildBomId || !partName || !quantity) {
      toast({
        title: "Missing required fields",
        description: "Please fill in Child BOM, Part Name, and Quantity",
        variant: "destructive",
      });
      return;
    }

    createSubAssemblyMutation.mutate({
      childBomId: parseInt(selectedChildBomId),
      partName,
      quantity: parseInt(quantity),
      quantityMultiplier: parseFloat(purchasingUnitConversion),
      notes: notes || undefined,
    });
  };

  const selectedBOM = availableBOMs.find(bom => bom.id.toString() === selectedChildBomId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="w-5 h-5" />
            Add Sub-Assembly
          </DialogTitle>
          <DialogDescription>
            Create a hierarchical relationship by referencing another BOM as a sub-assembly
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Child BOM Selection */}
          <div className="space-y-2">
            <Label htmlFor="childBom">Child BOM *</Label>
            <Select value={selectedChildBomId} onValueChange={setSelectedChildBomId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a BOM to use as sub-assembly" />
              </SelectTrigger>
              <SelectContent>
                {isLoading ? (
                  <SelectItem value="loading" disabled>Loading...</SelectItem>
                ) : availableBOMs.length === 0 ? (
                  <SelectItem value="none" disabled>No BOMs available</SelectItem>
                ) : (
                  availableBOMs.map((bom) => (
                    <SelectItem key={bom.id} value={bom.id.toString()}>
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4" />
                        <span>{bom.modelName} ({bom.revision})</span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {selectedBOM && (
              <p className="text-sm text-gray-600">
                {selectedBOM.description || 'No description available'}
              </p>
            )}
          </div>

          {/* Part Name */}
          <div className="space-y-2">
            <Label htmlFor="partName">Part Name *</Label>
            <Input
              id="partName"
              value={partName}
              onChange={(e) => setPartName(e.target.value)}
              placeholder="e.g., Wing Assembly, Control Surface"
              required
            />
          </div>

          {/* Quantity and Multiplier */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchasingUnitConversion">Purchasing Unit Conversion</Label>
              <Input
                id="purchasingUnitConversion"
                type="number"
                step="0.01"
                min="0.01"
                value={purchasingUnitConversion}
                onChange={(e) => setPurchasingUnitConversion(e.target.value)}
                title="Factor to convert engineering quantities to purchasing units (e.g., 0.01 if items are sold in packs of 100)"
                placeholder="1.0"
              />
              <p className="text-xs text-muted-foreground">
                Conversion factor for procurement (e.g., 0.02 if screws come in packs of 50)
              </p>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Manufacturing Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Special assembly instructions or notes..."
              rows={3}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={createSubAssemblyMutation.isPending}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={createSubAssemblyMutation.isPending}
            >
              {createSubAssemblyMutation.isPending ? 'Creating...' : 'Create Sub-Assembly'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}