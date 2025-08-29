import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Package, Plus, Save } from 'lucide-react';

interface StockModel {
  id: string;
  name: string;
  displayName: string;
  price: number;
  description?: string;
  isActive: boolean;
  sortOrder: number;
}

interface POProductFormData {
  customerName: string;
  productName: string;
  material: string;
  handedness: string;
  stockModel: string;
  actionInlet: string;
  bottomMetal: string;
  barrelInlet: string;
  qds: string;
  swivelStuds: string;
  paintOptions: string;
  texture: string;
}

export default function POProductsPage() {
  const { toast } = useToast();
  
  const [formData, setFormData] = useState<POProductFormData>({
    customerName: '',
    productName: '',
    material: '',
    handedness: '',
    stockModel: '',
    actionInlet: '',
    bottomMetal: '',
    barrelInlet: '',
    qds: '',
    swivelStuds: '',
    paintOptions: '',
    texture: ''
  });

  // Fetch stock models for dropdown
  // Fetch stock models for dropdown
  const { data: stockModels = [], isLoading: stockModelsLoading } = useQuery<StockModel[]>({
    queryKey: ['/api/stock-models'],
    queryFn: async () => {
      const result = await apiRequest('/api/stock-models');
      return result;
    },
  });

  // Fetch features for Action Inlet dropdown
  const { data: features = [], isLoading: featuresLoading } = useQuery({
    queryKey: ['/api/features'],
    queryFn: async () => {
      const result = await apiRequest('/api/features');
      return result;
    },
  });

  const handleInputChange = (field: keyof POProductFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.customerName || !formData.productName) {
      toast({
        title: "Missing required fields",
        description: "Please fill in Customer Name and Product Name",
        variant: "destructive",
      });
      return;
    }

    // For now, just show success toast - actual submission logic can be added later
    toast({
      title: "PO Product Saved",
      description: "Product configuration has been saved successfully",
    });
    
    console.log('PO Product Form Data:', formData);
  };

  const handleReset = () => {
    setFormData({
      customerName: '',
      productName: '',
      material: '',
      handedness: '',
      stockModel: '',
      actionInlet: '',
      bottomMetal: '',
      barrelInlet: '',
      qds: '',
      swivelStuds: '',
      paintOptions: '',
      texture: ''
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Package className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold text-gray-900">PO Products</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Product Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="customerName">Customer Name *</Label>
                <Input
                  id="customerName"
                  data-testid="input-customer-name"
                  value={formData.customerName}
                  onChange={(e) => handleInputChange('customerName', e.target.value)}
                  placeholder="Enter customer name"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="productName">Product Name *</Label>
                <Input
                  id="productName"
                  data-testid="input-product-name"
                  value={formData.productName}
                  onChange={(e) => handleInputChange('productName', e.target.value)}
                  placeholder="Enter product name"
                  required
                />
              </div>
            </div>

            {/* Features Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Features</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Material */}
                <div className="space-y-2">
                  <Label htmlFor="material">Material</Label>
                  <Select 
                    value={formData.material} 
                    onValueChange={(value) => handleInputChange('material', value)}
                  >
                    <SelectTrigger data-testid="select-material">
                      <SelectValue placeholder="Select material" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="carbon_fiber">Carbon Fiber</SelectItem>
                      <SelectItem value="fiberglass">Fiberglass</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Handedness */}
                <div className="space-y-2">
                  <Label htmlFor="handedness">Handedness</Label>
                  <Select 
                    value={formData.handedness} 
                    onValueChange={(value) => handleInputChange('handedness', value)}
                  >
                    <SelectTrigger data-testid="select-handedness">
                      <SelectValue placeholder="Select handedness" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="right">Right</SelectItem>
                      <SelectItem value="left">Left</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Stock Model */}
                <div className="space-y-2">
                  <Label htmlFor="stockModel">Stock Model</Label>
                  <Select 
                    value={formData.stockModel} 
                    onValueChange={(value) => handleInputChange('stockModel', value)}
                    disabled={stockModelsLoading}
                  >
                    <SelectTrigger data-testid="select-stock-model">
                      <SelectValue placeholder={stockModelsLoading ? "Loading..." : "Select stock model"} />
                    </SelectTrigger>
                    <SelectContent>
                      {stockModels
                        .filter(model => model.isActive)
                        .sort((a, b) => a.sortOrder - b.sortOrder)
                        .map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.displayName}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Action Inlet */}
                <div className="space-y-2">
                  <Label htmlFor="actionInlet">Action Inlet</Label>
                  <Select 
                    value={formData.actionInlet} 
                    onValueChange={(value) => handleInputChange('actionInlet', value)}
                    disabled={featuresLoading}
                  >
                    <SelectTrigger data-testid="select-action-inlet">
                      <SelectValue placeholder={featuresLoading ? "Loading..." : "Select action inlet"} />
                    </SelectTrigger>
                    <SelectContent>
                      {features
                        .find((f: any) => f.name === 'action_inlet' || f.id === 'action_inlet')
                        ?.options?.filter((option: any) => option.value && option.value.trim() !== '')
                        .map((option: any) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Bottom Metal */}
                <div className="space-y-2">
                  <Label htmlFor="bottomMetal">Bottom Metal</Label>
                  <Select 
                    value={formData.bottomMetal} 
                    onValueChange={(value) => handleInputChange('bottomMetal', value)}
                    disabled={featuresLoading}
                  >
                    <SelectTrigger data-testid="select-bottom-metal">
                      <SelectValue placeholder={featuresLoading ? "Loading..." : "Select bottom metal"} />
                    </SelectTrigger>
                    <SelectContent>
                      {features
                        .find((f: any) => f.name === 'bottom_metal' || f.id === 'bottom_metal')
                        ?.options?.filter((option: any) => option.value && option.value.trim() !== '')
                        .map((option: any) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Barrel Inlet - Placeholder */}
                <div className="space-y-2">
                  <Label htmlFor="barrelInlet">Barrel Inlet</Label>
                  <Input
                    id="barrelInlet"
                    data-testid="input-barrel-inlet"
                    value={formData.barrelInlet}
                    onChange={(e) => handleInputChange('barrelInlet', e.target.value)}
                    placeholder="Barrel Inlet (placeholder)"
                    disabled
                  />
                </div>

                {/* QDs - Placeholder */}
                <div className="space-y-2">
                  <Label htmlFor="qds">QDs</Label>
                  <Input
                    id="qds"
                    data-testid="input-qds"
                    value={formData.qds}
                    onChange={(e) => handleInputChange('qds', e.target.value)}
                    placeholder="QDs (placeholder)"
                    disabled
                  />
                </div>

                {/* Swivel Studs - Placeholder */}
                <div className="space-y-2">
                  <Label htmlFor="swivelStuds">Swivel Studs</Label>
                  <Input
                    id="swivelStuds"
                    data-testid="input-swivel-studs"
                    value={formData.swivelStuds}
                    onChange={(e) => handleInputChange('swivelStuds', e.target.value)}
                    placeholder="Swivel Studs (placeholder)"
                    disabled
                  />
                </div>

                {/* Paint Options - Placeholder */}
                <div className="space-y-2">
                  <Label htmlFor="paintOptions">Paint Options</Label>
                  <Input
                    id="paintOptions"
                    data-testid="input-paint-options"
                    value={formData.paintOptions}
                    onChange={(e) => handleInputChange('paintOptions', e.target.value)}
                    placeholder="Paint Options (placeholder)"
                    disabled
                  />
                </div>

                {/* Texture - Placeholder */}
                <div className="space-y-2">
                  <Label htmlFor="texture">Texture</Label>
                  <Input
                    id="texture"
                    data-testid="input-texture"
                    value={formData.texture}
                    onChange={(e) => handleInputChange('texture', e.target.value)}
                    placeholder="Texture (placeholder)"
                    disabled
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 pt-6">
              <Button type="submit" data-testid="button-save">
                <Save className="h-4 w-4 mr-2" />
                Save Product
              </Button>
              <Button type="button" variant="outline" onClick={handleReset} data-testid="button-reset">
                Reset Form
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}