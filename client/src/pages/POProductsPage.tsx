import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Package, Plus, Save, Edit, Trash2, Eye } from 'lucide-react';

interface StockModel {
  id: string;
  name: string;
  displayName: string;
  price: number;
  description?: string;
  isActive: boolean;
  sortOrder: number;
}

interface POProduct {
  id: number;
  customerName: string;
  productName: string;
  productType: string;
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
  flatTop: boolean;
  price: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface POProductFormData {
  customerName: string;
  productName: string;
  productType: string;
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
  flatTop: boolean;
  price: string;
}

export default function POProductsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<POProduct | null>(null);
  const [formData, setFormData] = useState<POProductFormData>({
    customerName: '',
    productName: '',
    productType: '',
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
    flatTop: false,
    price: ''
  });

  // Fetch PO Products
  const { data: poProducts = [], isLoading: productsLoading, refetch } = useQuery<POProduct[]>({
    queryKey: ['/api/po-products'],
    queryFn: async () => {
      const result = await apiRequest('/api/po-products');
      return result;
    },
  });

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

  // Mutations for CRUD operations
  const createMutation = useMutation({
    mutationFn: async (data: Omit<POProduct, 'id' | 'isActive' | 'createdAt' | 'updatedAt'>) => {
      return apiRequest('/api/po-products', {
        method: 'POST',
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/po-products'] });
      toast({
        title: "Success",
<<<<<<< HEAD
        description: "PO Product created successfully",
=======
        description: "P1 PO Product created successfully",
>>>>>>> origin/main
      });
      handleReset();
      setShowCreateForm(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
<<<<<<< HEAD
        description: error.message || "Failed to create PO Product",
=======
        description: error.message || "Failed to create P1 PO Product",
>>>>>>> origin/main
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<POProduct> }) => {
      return apiRequest(`/api/po-products/${id}`, {
        method: 'PUT',
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/po-products'] });
      toast({
        title: "Success",
<<<<<<< HEAD
        description: "PO Product updated successfully",
=======
        description: "P1 PO Product updated successfully",
>>>>>>> origin/main
      });
      setEditingProduct(null);
      handleReset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
<<<<<<< HEAD
        description: error.message || "Failed to update PO Product",
=======
        description: error.message || "Failed to update P1 PO Product",
>>>>>>> origin/main
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/po-products/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/po-products'] });
      toast({
        title: "Success",
<<<<<<< HEAD
        description: "PO Product deleted successfully",
=======
        description: "P1 PO Product deleted successfully",
>>>>>>> origin/main
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
<<<<<<< HEAD
        description: error.message || "Failed to delete PO Product",
=======
        description: error.message || "Failed to delete P1 PO Product",
>>>>>>> origin/main
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: keyof POProductFormData, value: string | boolean) => {
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

    const productData = {
      ...formData,
      price: parseFloat(formData.price) || 0,
    };

    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data: productData });
    } else {
      createMutation.mutate(productData);
    }
  };

  const handleReset = () => {
    setFormData({
      customerName: '',
      productName: '',
      productType: '',
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
      flatTop: false,
      price: ''
    });
    setEditingProduct(null);
  };

  const handleEdit = (product: POProduct) => {
    setEditingProduct(product);
    setFormData({
      customerName: product.customerName,
      productName: product.productName,
      productType: product.productType || '',
      material: product.material,
      handedness: product.handedness,
      stockModel: product.stockModel,
      actionLength: product.actionLength,
      actionInlet: product.actionInlet,
      bottomMetal: product.bottomMetal,
      barrelInlet: product.barrelInlet,
      qds: product.qds,
      swivelStuds: product.swivelStuds,
      paintOptions: product.paintOptions,
      texture: product.texture,
      flatTop: product.flatTop || false,
      price: product.price.toString(),
    });
    setShowCreateForm(true);
  };

  const handleDelete = (id: number) => {
<<<<<<< HEAD
    if (window.confirm('Are you sure you want to delete this PO Product?')) {
=======
    if (window.confirm('Are you sure you want to delete this P1 PO Product?')) {
>>>>>>> origin/main
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-6 w-6 text-primary" />
<<<<<<< HEAD
          <h1 className="text-3xl font-bold text-gray-900">PO Products</h1>
=======
          <h1 className="text-3xl font-bold text-gray-900">P1 PO Products</h1>
>>>>>>> origin/main
        </div>
        <Button 
          onClick={() => {
            handleReset();
            setShowCreateForm(true);
          }}
          data-testid="button-add-product"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Product
        </Button>
      </div>

      {/* Products Table */}
      <Card>
        <CardHeader>
<<<<<<< HEAD
          <CardTitle>All PO Products</CardTitle>
=======
          <CardTitle>All P1 PO Products</CardTitle>
>>>>>>> origin/main
        </CardHeader>
        <CardContent>
          {productsLoading ? (
            <div className="text-center py-8">Loading products...</div>
          ) : poProducts.length === 0 ? (
            <div className="text-center py-8">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
<<<<<<< HEAD
              <p className="text-gray-500">No PO Products found</p>
=======
              <p className="text-gray-500">No P1 PO Products found</p>
>>>>>>> origin/main
              <Button 
                className="mt-4" 
                onClick={() => setShowCreateForm(true)}
                data-testid="button-create-first-product"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Product
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Product Type</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Stock Model</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {poProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell data-testid={`text-customer-${product.id}`}>
                      {product.customerName}
                    </TableCell>
                    <TableCell data-testid={`text-product-${product.id}`}>
                      {product.productName}
                    </TableCell>
                    <TableCell data-testid={`text-product-type-${product.id}`}>
                      {product.productType || '-'}
                    </TableCell>
                    <TableCell data-testid={`text-material-${product.id}`}>
                      {product.material || '-'}
                    </TableCell>
                    <TableCell data-testid={`text-stock-model-${product.id}`}>
                      {stockModels.find(sm => sm.id === product.stockModel)?.displayName || product.stockModel || '-'}
                    </TableCell>
                    <TableCell data-testid={`text-price-${product.id}`}>
                      ${product.price.toFixed(2)}
                    </TableCell>
                    <TableCell data-testid={`text-created-${product.id}`}>
                      {new Date(product.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(product)}
                          data-testid={`button-edit-${product.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(product.id)}
                          data-testid={`button-delete-${product.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Product Form Dialog */}
      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
<<<<<<< HEAD
              {editingProduct ? 'Edit PO Product' : 'Create New PO Product'}
            </DialogTitle>
            <DialogDescription>
              {editingProduct ? 'Update the product details below.' : 'Fill in the product details below to create a new PO Product.'}
=======
              {editingProduct ? 'Edit P1 PO Product' : 'Create New P1 PO Product'}
            </DialogTitle>
            <DialogDescription>
              {editingProduct ? 'Update the product details below.' : 'Fill in the product details below to create a new P1 PO Product.'}
>>>>>>> origin/main
            </DialogDescription>
          </DialogHeader>

      <Card>
        <CardHeader>
          <CardTitle>{editingProduct ? 'Edit Product' : 'Product Configuration'}</CardTitle>
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

            {/* Product Type */}
            <div className="space-y-2">
              <Label htmlFor="productType">Product Type</Label>
              <Select 
                value={formData.productType} 
                onValueChange={(value) => handleInputChange('productType', value)}
              >
                <SelectTrigger data-testid="select-product-type">
                  <SelectValue placeholder="Select product type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stock">Stock</SelectItem>
<<<<<<< HEAD
=======
                  <SelectItem value="P2-Item">P2 Item</SelectItem>
>>>>>>> origin/main
                  <SelectItem value="AG-M5-SA">AG-M5-SA</SelectItem>
                  <SelectItem value="AG-M5-LA">AG-M5-LA</SelectItem>
                  <SelectItem value="AG-M5-LA-CIP">AG-M5-LA-CIP</SelectItem>
                  <SelectItem value="AG-BDL-SA">AG-BDL-SA</SelectItem>
                  <SelectItem value="AG-BDL-LA">AG-BDL-LA</SelectItem>
                  <SelectItem value="4-ARCA">4" ARCA</SelectItem>
                  <SelectItem value="6-ARCA">6" ARCA</SelectItem>
                  <SelectItem value="8-ARCA">8" ARCA</SelectItem>
                  <SelectItem value="AG-PIC-RAIL">AG PIC RAIL</SelectItem>
                </SelectContent>
              </Select>
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

                {/* Flat Top Checkbox */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="flatTop"
                      checked={formData.flatTop}
                      onCheckedChange={(checked) => handleInputChange('flatTop', checked as boolean)}
                      data-testid="checkbox-flat-top"
                    />
                    <Label htmlFor="flatTop" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      Flat Top
                    </Label>
                  </div>
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
              <Button 
                type="submit" 
                data-testid="button-save"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                <Save className="h-4 w-4 mr-2" />
                {createMutation.isPending || updateMutation.isPending 
                  ? (editingProduct ? 'Updating...' : 'Saving...') 
                  : (editingProduct ? 'Update Product' : 'Save Product')
                }
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  handleReset();
                  setShowCreateForm(false);
                }} 
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button type="button" variant="outline" onClick={handleReset} data-testid="button-reset">
                Reset Form
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
        </DialogContent>
      </Dialog>
    </div>
  );
}