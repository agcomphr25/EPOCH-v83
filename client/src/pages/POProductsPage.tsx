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
  actionLength: string;
  actionInlet: string;
  bottomMetal: string;
  barrelInlet: string;
  qds: string;
  swivelStuds: string;
  paintOptions: string;
  texture: string;
  price: string;
}

export default function POProductsPage() {
  const { toast } = useToast();
  
  const [formData, setFormData] = useState<POProductFormData>({
    customerName: '',
    productName: '',
    material: '',
    handedness: '',
    stockModel: '',
    actionLength: '',
    actionInlet: '',
    bottomMetal: '',
    barrelInlet: '',
    qds: '',
    swivelStuds: '',
    paintOptions: '',
    texture: '',
    price: ''
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
      actionLength: '',
      actionInlet: '',
      bottomMetal: '',
      barrelInlet: '',
      qds: '',
      swivelStuds: '',
      paintOptions: '',
      texture: '',
      price: ''
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

                {/* Action Length */}
                <div className="space-y-2">
                  <Label htmlFor="actionLength">Action Length</Label>
                  <Select 
                    value={formData.actionLength} 
                    onValueChange={(value) => handleInputChange('actionLength', value)}
                    disabled={featuresLoading}
                  >
                    <SelectTrigger data-testid="select-action-length">
                      <SelectValue placeholder={featuresLoading ? "Loading..." : "Select action length"} />
                    </SelectTrigger>
                    <SelectContent>
                      {features
                        .find((f: any) => f.name === 'action_length' || f.id === 'action_length')
                        ?.options?.filter((option: any) => 
                          option.value && 
                          option.value.trim() !== '' && 
                          option.value.toLowerCase() !== 'none'
                        )
                        .map((option: any) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
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

                {/* Barrel Inlet */}
                <div className="space-y-2">
                  <Label htmlFor="barrelInlet">Barrel Inlet</Label>
                  <Select 
                    value={formData.barrelInlet} 
                    onValueChange={(value) => handleInputChange('barrelInlet', value)}
                    disabled={featuresLoading}
                  >
                    <SelectTrigger data-testid="select-barrel-inlet">
                      <SelectValue placeholder={featuresLoading ? "Loading..." : "Select barrel inlet"} />
                    </SelectTrigger>
                    <SelectContent>
                      {features
                        .find((f: any) => f.name === 'barrel_inlet' || f.id === 'barrel_inlet')
                        ?.options?.filter((option: any) => option.value && option.value.trim() !== '')
                        .map((option: any) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* QDs */}
                <div className="space-y-2">
                  <Label htmlFor="qds">QDs</Label>
                  <Select 
                    value={formData.qds} 
                    onValueChange={(value) => handleInputChange('qds', value)}
                  >
                    <SelectTrigger data-testid="select-qds">
                      <SelectValue placeholder="Select QDs option" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="2_on_left">2 on Left</SelectItem>
                      <SelectItem value="2_on_right">2 on Right</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Swivel Studs */}
                <div className="space-y-2">
                  <Label htmlFor="swivelStuds">Swivel Studs</Label>
                  <Select 
                    value={formData.swivelStuds} 
                    onValueChange={(value) => handleInputChange('swivelStuds', value)}
                  >
                    <SelectTrigger data-testid="select-swivel-studs">
                      <SelectValue placeholder="Select swivel studs option" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="3_ah">3 (AH)</SelectItem>
                      <SelectItem value="2_privateer">2 (Privateer)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Paint Options */}
                <div className="space-y-2">
                  <Label htmlFor="paintOptions">Paint Options</Label>
                  <Select 
                    value={formData.paintOptions} 
                    onValueChange={(value) => handleInputChange('paintOptions', value)}
                    disabled={featuresLoading}
                  >
                    <SelectTrigger data-testid="select-paint-options">
                      <SelectValue placeholder={featuresLoading ? "Loading..." : "Select paint options"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(() => {
                        // Find all paint-related features from different categories
                        const paintFeatures = features.filter((f: any) => 
                          f.category === 'paint_options' ||
                          f.displayName === 'Premium Options' ||
                          f.displayName === 'Terrain Options' ||
                          f.displayName === 'Rogue Options' ||
                          f.displayName === 'Standard Options' ||
                          f.displayName === 'Carbon Camo Ready' ||
                          f.displayName === 'Camo Options' ||
                          f.id === 'metallic_finishes' ||
                          f.name === 'metallic_finishes' ||
                          f.category === 'paint' ||
                          f.subcategory === 'paint'
                        );

                        const allOptions: any[] = [];
                        paintFeatures.forEach((feature: any) => {
                          if (feature.options) {
                            feature.options.forEach((option: any) => {
                              if (option.value && option.value.trim() !== '') {
                                allOptions.push(option);
                              }
                            });
                          }
                        });

                        return allOptions.map((option: any) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ));
                      })()}
                    </SelectContent>
                  </Select>
                </div>

                {/* Texture */}
                <div className="space-y-2">
                  <Label htmlFor="texture">Texture</Label>
                  <Select 
                    value={formData.texture} 
                    onValueChange={(value) => handleInputChange('texture', value)}
                  >
                    <SelectTrigger data-testid="select-texture">
                      <SelectValue placeholder="Select texture option" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="grip_forend">Grip & Forend</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Price Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Pricing</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="price">Price ($)</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    min="0"
                    data-testid="input-price"
                    value={formData.price}
                    onChange={(e) => handleInputChange('price', e.target.value)}
                    placeholder="0.00"
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