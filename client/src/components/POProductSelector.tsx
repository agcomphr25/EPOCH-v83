import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, Plus, ShoppingCart } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface POProduct {
  id: number;
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
  flatTop: boolean;
  price: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface StockModel {
  id: string;
  name: string;
  displayName: string;
  price: number;
  description?: string;
  isActive: boolean;
  sortOrder: number;
}

interface POProductSelectorProps {
  poId: number;
  customerName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface SelectedProduct {
  product: POProduct;
  quantity: number;
}

export default function POProductSelector({ poId, customerName, isOpen, onClose, onSuccess }: POProductSelectorProps) {
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const { toast } = useToast();

  // Fetch customer-associated PO products
  const { data: allPOProducts = [], isLoading: productsLoading } = useQuery<POProduct[]>({
    queryKey: ['/api/po-products'],
    queryFn: async () => {
      const result = await apiRequest('/api/po-products');
      return result;
    },
  });

  // Fetch stock models for display names
  const { data: stockModels = [], isLoading: stockModelsLoading } = useQuery<StockModel[]>({
    queryKey: ['/api/stock-models'],
    queryFn: async () => {
      const result = await apiRequest('/api/stock-models');
      return result;
    },
  });

  // Filter products by customer name
  const customerProducts = allPOProducts.filter(product => 
    product.customerName.toLowerCase().trim() === customerName.toLowerCase().trim()
  );

  const getStockModelDisplayName = (stockModelId: string) => {
    const stockModel = stockModels.find(sm => sm.id === stockModelId);
    return stockModel?.displayName || stockModelId || 'Unknown Model';
  };

  const addProductToSelection = (product: POProduct) => {
    const existingIndex = selectedProducts.findIndex(sp => sp.product.id === product.id);
    if (existingIndex >= 0) {
      // Increase quantity if already selected
      const updated = [...selectedProducts];
      updated[existingIndex].quantity += 1;
      setSelectedProducts(updated);
    } else {
      // Add new product with quantity 1
      setSelectedProducts([...selectedProducts, { product, quantity: 1 }]);
    }
  };

  const updateProductQuantity = (productId: number, quantity: number) => {
    if (quantity <= 0) {
      // Remove product if quantity is 0 or negative
      setSelectedProducts(selectedProducts.filter(sp => sp.product.id !== productId));
    } else {
      // Update quantity
      const updated = selectedProducts.map(sp => 
        sp.product.id === productId ? { ...sp, quantity } : sp
      );
      setSelectedProducts(updated);
    }
  };

  const removeProductFromSelection = (productId: number) => {
    setSelectedProducts(selectedProducts.filter(sp => sp.product.id !== productId));
  };

  const handleAddToOrder = async () => {
    if (selectedProducts.length === 0) {
      toast({
        title: "No products selected",
        description: "Please select at least one product to add to the order",
        variant: "destructive",
      });
      return;
    }

    try {
      // Save each selected product as a PO item
      for (const sp of selectedProducts) {
        const poItemData = {
          poId: poId,
          itemType: 'custom_model',
          itemId: sp.product.id.toString(),
          itemName: sp.product.productName,
          stockModelId: sp.product.stockModel || 'mesa_universal',
          stockModelName: sp.product.productName,
          quantity: sp.quantity,
          unitPrice: sp.product.price,
          totalPrice: sp.product.price * sp.quantity,
          specifications: {
            stockModel: sp.product.stockModel,
            material: sp.product.material,
            handedness: sp.product.handedness,
            actionLength: sp.product.actionLength,
            actionInlet: sp.product.actionInlet,
            bottomMetal: sp.product.bottomMetal,
            barrelInlet: sp.product.barrelInlet,
            qds: sp.product.qds,
            swivelStuds: sp.product.swivelStuds,
            paintOptions: sp.product.paintOptions,
            texture: sp.product.texture,
            flatTop: sp.product.flatTop
          },
          notes: `Product from PO Products: ${sp.product.customerName}`,
          orderCount: 0
        };

        await apiRequest(`/api/pos/${poId}/items`, {
          method: 'POST',
          body: poItemData
        });
      }

      toast({
        title: "Products Added",
        description: `Added ${selectedProducts.length} product(s) to the purchase order`,
      });
      
      // Reset selection and close
      setSelectedProducts([]);
      onSuccess();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add products to order",
        variant: "destructive",
      });
    }
  };

  const handleClose = () => {
    setSelectedProducts([]);
    onClose();
  };

  const getTotalValue = () => {
    return selectedProducts.reduce((total, sp) => total + (sp.product.price * sp.quantity), 0);
  };

  if (productsLoading || stockModelsLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Add Order Items</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <Package className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">Loading products...</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Select Products for {customerName}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {customerProducts.length === 0 ? (
            <Card>
              <CardContent className="py-8">
                <div className="text-center">
                  <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Products Available</h3>
                  <p className="text-gray-500">
                    No PO products have been created for customer "{customerName}".
                    Products must be created on the PO Products page first.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Available Products */}
              <Card>
                <CardHeader>
                  <CardTitle>Available Products</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product Name</TableHead>
                        <TableHead>Stock Model</TableHead>
                        <TableHead>Material</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customerProducts.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{product.productName}</div>
                              {product.flatTop && (
                                <Badge variant="secondary" className="mt-1">
                                  Flat Top
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {getStockModelDisplayName(product.stockModel)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {product.material.replace('_', ' ') || 'Not specified'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">${product.price.toFixed(2)}</span>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              onClick={() => addProductToSelection(product)}
                              data-testid={`button-add-product-${product.id}`}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Add
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Selected Products */}
              {selectedProducts.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ShoppingCart className="h-5 w-5" />
                      Selected Products ({selectedProducts.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {selectedProducts.map((sp) => (
                        <div
                          key={sp.product.id}
                          className="flex items-center justify-between p-4 border rounded-lg"
                        >
                          <div className="flex-1">
                            <div className="font-medium">{sp.product.productName}</div>
                            <div className="text-sm text-gray-600">
                              {getStockModelDisplayName(sp.product.stockModel)} • ${sp.product.price.toFixed(2)} each
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`quantity-${sp.product.id}`} className="text-sm">
                              Qty:
                            </Label>
                            <Input
                              id={`quantity-${sp.product.id}`}
                              type="number"
                              min="1"
                              value={sp.quantity}
                              onChange={(e) => updateProductQuantity(sp.product.id, parseInt(e.target.value) || 0)}
                              className="w-20"
                              data-testid={`input-quantity-${sp.product.id}`}
                            />
                            <div className="text-sm font-medium min-w-[80px] text-right">
                              ${(sp.product.price * sp.quantity).toFixed(2)}
                            </div>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => removeProductFromSelection(sp.product.id)}
                              data-testid={`button-remove-${sp.product.id}`}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))}
                      
                      <div className="flex justify-between items-center pt-4 border-t">
                        <div className="text-lg font-semibold">
                          Total: ${getTotalValue().toFixed(2)}
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={handleClose}>
                            Cancel
                          </Button>
                          <Button onClick={handleAddToOrder} data-testid="button-add-to-order">
                            Add to Order
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}