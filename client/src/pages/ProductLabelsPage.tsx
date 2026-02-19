import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

import { useToast } from '@/hooks/use-toast';
import { Printer, Tag, Package, Plus, Minus, Trash2 } from 'lucide-react';

interface ProductItem {
  id: number;
  customer_name: string;
  product_name: string;
  product_type: string;
  barcode: string;
  customer_product_number: string;
  material: string;
  handedness: string;
  action_length: string;
  action_inlet: string;
  bottom_metal: string;
  barrel_inlet: string;
  notes: string;
}

interface LabelItem {
  productId: number;
  barcodeValue: string;
  description: string;
  copies: number;
}

function buildDescription(product: ProductItem): string {
  const parts: string[] = ['AG Composites'];

  const name = product.product_name || '';
  if (name.includes('BM-') || name.includes('Bottom')) {
    if (name.includes('M5')) {
      parts.push('M5 Bottom Metal');
    } else if (name.includes('BDL')) {
      parts.push('BDL Bottom Metal');
    } else {
      parts.push('Bottom Metal');
    }
  } else if (name.includes('CRB-') || name.includes('Carbon')) {
    parts.push('Carbon Fiber Stock');
  } else if (name.includes('FG-') || name.includes('Fiber')) {
    parts.push('Fiberglass Stock');
  } else {
    parts.push(name);
  }

  if (product.action_inlet) {
    const inlet = product.action_inlet.replace(/_/g, ' ');
    if (inlet.toLowerCase().includes('remington')) {
      parts.push('Remington 700');
    } else {
      parts.push(inlet);
    }
  }

  if (product.action_length) {
    const length = product.action_length.replace(/_/g, ' ');
    parts.push(length.charAt(0).toUpperCase() + length.slice(1) + ' Action');
  }

  if (product.material) {
    const mat = product.material.replace(/_/g, ' ');
    if (mat.includes('carbon')) {
      parts.push('Carbon');
    } else if (mat.includes('aluminum') || mat.includes('alum')) {
      parts.push('blk Aluminum');
    }
  }

  return parts.join(' ');
}

export default function ProductLabelsPage() {
  const { toast } = useToast();
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [labelItems, setLabelItems] = useState<LabelItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: customers = [] } = useQuery<string[]>({
    queryKey: ['/api/product-labels/customers'],
  });

  const productQueryKey = selectedCustomer
    ? `/api/product-labels/products?customerName=${encodeURIComponent(selectedCustomer)}`
    : '/api/product-labels/products';

  const { data: products = [], isLoading: productsLoading } = useQuery<ProductItem[]>({
    queryKey: ['/api/product-labels/products', selectedCustomer],
    queryFn: async () => {
      const res = await fetch(productQueryKey, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch products');
      return res.json();
    },
    enabled: !!selectedCustomer,
  });

  const addToLabels = (product: ProductItem) => {
    const existing = labelItems.find((item) => item.productId === product.id);
    if (existing) {
      setLabelItems(
        labelItems.map((item) =>
          item.productId === product.id ? { ...item, copies: item.copies + 1 } : item
        )
      );
    } else {
      setLabelItems([
        ...labelItems,
        {
          productId: product.id,
          barcodeValue: product.barcode,
          description: buildDescription(product),
          copies: 1,
        },
      ]);
    }
  };

  const updateCopies = (productId: number, delta: number) => {
    setLabelItems(
      labelItems
        .map((item) =>
          item.productId === productId
            ? { ...item, copies: Math.max(0, item.copies + delta) }
            : item
        )
        .filter((item) => item.copies > 0)
    );
  };

  const updateDescription = (productId: number, description: string) => {
    setLabelItems(
      labelItems.map((item) =>
        item.productId === productId ? { ...item, description } : item
      )
    );
  };

  const removeItem = (productId: number) => {
    setLabelItems(labelItems.filter((item) => item.productId !== productId));
  };

  const selectAll = () => {
    const newItems: LabelItem[] = products
      .filter((p) => !labelItems.find((l) => l.productId === p.id))
      .map((product) => ({
        productId: product.id,
        barcodeValue: product.barcode,
        description: buildDescription(product),
        copies: 1,
      }));
    setLabelItems([...labelItems, ...newItems]);
  };

  const clearAll = () => setLabelItems([]);

  const generateLabels = async () => {
    if (labelItems.length === 0) {
      toast({ title: 'No items selected', description: 'Add products to generate labels.', variant: 'destructive' });
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch('/api/product-labels/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ products: labelItems }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate labels');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');

      toast({ title: 'Labels Generated', description: `${labelItems.reduce((sum, i) => sum + i.copies, 0)} labels ready to print.` });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const totalLabels = labelItems.reduce((sum, item) => sum + item.copies, 0);

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center gap-3 mb-6">
        <Tag className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Product Label Generator</h1>
          <p className="text-muted-foreground">Generate Avery 5162 product labels with barcodes</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Select Products
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
              <SelectTrigger>
                <SelectValue placeholder="Select a customer..." />
              </SelectTrigger>
              <SelectContent>
                {customers.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedCustomer && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAll}>Select All</Button>
                <Button variant="outline" size="sm" onClick={clearAll}>Clear All</Button>
              </div>
            )}

            {productsLoading && <p className="text-muted-foreground text-sm">Loading products...</p>}

            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {products.map((product) => {
                const inQueue = labelItems.find((l) => l.productId === product.id);
                return (
                  <div
                    key={product.id}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                      inQueue ? 'bg-primary/10 border-primary' : 'hover:bg-muted'
                    }`}
                    onClick={() => !inQueue && addToLabels(product)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{product.product_name}</p>
                      <p className="text-xs text-muted-foreground">Barcode: {product.barcode}</p>
                    </div>
                    {inQueue ? (
                      <span className="text-xs text-primary font-medium ml-2">Added ({inQueue.copies})</span>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); addToLabels(product); }}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Printer className="h-5 w-5" />
                Label Queue ({totalLabels} labels)
              </span>
              <Button onClick={generateLabels} disabled={isGenerating || labelItems.length === 0} className="gap-2">
                <Printer className="h-4 w-4" />
                {isGenerating ? 'Generating...' : 'Print Labels'}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {labelItems.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Tag className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No products added yet</p>
                <p className="text-sm">Select a customer and add products to generate labels</p>
              </div>
            ) : (
              <div className="space-y-3">
                {labelItems.map((item) => (
                  <div key={item.productId} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-bold">{item.barcodeValue}</span>
                      <Button variant="ghost" size="sm" onClick={() => removeItem(item.productId)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <Input
                      value={item.description}
                      onChange={(e) => updateDescription(item.productId, e.target.value)}
                      className="text-sm"
                      placeholder="Label description..."
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Copies:</span>
                      <Button variant="outline" size="sm" onClick={() => updateCopies(item.productId, -1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center font-medium">{item.copies}</span>
                      <Button variant="outline" size="sm" onClick={() => updateCopies(item.productId, 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
