import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, Eye } from 'lucide-react';
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

interface POItemsManagerProps {
  poId: number;
  poNumber: string;
  customerId: string;
  customerName: string;
}

export default function POItemsManager({ poId, poNumber, customerId, customerName }: POItemsManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<POProduct | null>(null);
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

  const handleViewProduct = (product: POProduct) => {
    setSelectedProduct(product);
    setIsDialogOpen(true);
  };

  const getStockModelDisplayName = (stockModelId: string) => {
    const stockModel = stockModels.find(sm => sm.id === stockModelId);
    return stockModel?.displayName || stockModelId || 'Unknown Model';
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setSelectedProduct(null);
  };

  if (productsLoading || stockModelsLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <Package className="h-8 w-8 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-500">Loading customer products...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">PO Products for {customerName}</h2>
        </div>
        <Badge variant="outline">
          {customerProducts.length} Product{customerProducts.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      {customerProducts.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Products Found</h3>
              <p className="text-gray-500 mb-4">
                No PO products have been created for customer "{customerName}".
              </p>
              <p className="text-sm text-gray-400">
                Products can be created on the PO Products page and will appear here when associated with this customer.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
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
                  <TableHead>Handedness</TableHead>
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
                        <div className="text-sm text-gray-500">
                          {new Date(product.createdAt).toLocaleDateString()}
                        </div>
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
                      <Badge variant="secondary" className="capitalize">
                        {product.handedness || 'Not specified'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">${product.price.toFixed(2)}</span>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewProduct(product)}
                        data-testid={`button-view-${product.id}`}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Product Details Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Product Details</DialogTitle>
          </DialogHeader>
          
          {selectedProduct && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2">{selectedProduct.productName}</h3>
                  <p className="text-sm text-gray-600">
                    Created: {new Date(selectedProduct.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-green-600">
                    ${selectedProduct.price.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-medium text-gray-900">Basic Configuration</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Stock Model:</span>
                      <span className="text-sm font-medium">
                        {getStockModelDisplayName(selectedProduct.stockModel)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Material:</span>
                      <span className="text-sm font-medium capitalize">
                        {selectedProduct.material.replace('_', ' ') || 'Not specified'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Handedness:</span>
                      <span className="text-sm font-medium capitalize">
                        {selectedProduct.handedness || 'Not specified'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium text-gray-900">Features</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Action Length:</span>
                      <span className="text-sm font-medium">
                        {selectedProduct.actionLength || 'Not specified'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Action Inlet:</span>
                      <span className="text-sm font-medium">
                        {selectedProduct.actionInlet || 'Not specified'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Bottom Metal:</span>
                      <span className="text-sm font-medium">
                        {selectedProduct.bottomMetal || 'Not specified'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Barrel Inlet:</span>
                      <span className="text-sm font-medium">
                        {selectedProduct.barrelInlet || 'Not specified'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-medium text-gray-900">Hardware</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">QDs:</span>
                      <span className="text-sm font-medium">
                        {selectedProduct.qds || 'None'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Swivel Studs:</span>
                      <span className="text-sm font-medium">
                        {selectedProduct.swivelStuds || 'None'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium text-gray-900">Finish</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Paint Options:</span>
                      <span className="text-sm font-medium">
                        {selectedProduct.paintOptions || 'Not specified'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Texture:</span>
                      <span className="text-sm font-medium">
                        {selectedProduct.texture || 'Not specified'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleCloseDialog}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}