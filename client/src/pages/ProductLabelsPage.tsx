import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  FileSpreadsheet,
  ImagePlus,
  Minus,
  Package,
  Plus,
  Printer,
  Tag,
  Trash2,
} from 'lucide-react';

type LabelMode = 'P1' | 'P2';
type TemplateKey = '8160' | '8162';

const LABEL_TEMPLATES: Record<TemplateKey, { label: string; columns: number; rows: number; labelsPerPage: number }> = {
  '8162': { label: 'Avery 8162 - 14 labels', columns: 2, rows: 7, labelsPerPage: 14 },
  '8160': { label: 'Avery 8160 - 30 labels', columns: 3, rows: 10, labelsPerPage: 30 },
};

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
  fillPage: boolean;
}

interface P2ProjectOption {
  projectName: string;
  lotCount: number;
}

interface P2LotOption {
  id: string;
  lotNumber: string;
  poNumber: string | null;
  customerName: string | null;
  partNumber: string | null;
  partName: string | null;
  quantity: number | null;
  projectName: string;
  packingSlipNumber: string | null;
  createdAt: string;
}

function buildDescription(product: ProductItem): string {
  const parts: string[] = ['AG Composites'];

  const name = product.product_name || '';
  const ptype = product.product_type || '';

  if (name.includes('BM-') || name.includes('Bottom') || ptype.includes('BDL') || ptype.includes('M5')) {
    if (name.includes('M5BDL') || ptype.includes('BDL')) {
      parts.push('BDL Bottom Metal');
    } else if (name.includes('M5') || ptype.includes('M5')) {
      parts.push('M5 Bottom Metal');
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
    const len = product.action_length.replace(/_/g, ' ').trim();
    parts.push(`${len.charAt(0).toUpperCase()}${len.slice(1)} Action`);
  } else {
    const pName = product.product_name || '';
    const pType = product.product_type || '';
    if (pName.includes('-LA') || pType.includes('-LA') || pName.toLowerCase().includes('long')) {
      parts.push('Long Action');
    } else if (pName.includes('-SA') || pType.includes('-SA') || pName.toLowerCase().includes('short')) {
      parts.push('Short Action');
    }
  }

  if (product.material) {
    const mat = product.material.replace(/_/g, ' ');
    if (mat.includes('carbon')) {
      parts.push('Carbon');
    } else if (mat.includes('aluminum') || mat.includes('alum')) {
      parts.push('blk Aluminum');
    }
  } else {
    const pName = product.product_name || '';
    if (pName.includes('BM-') || pName.includes('Bottom')) {
      parts.push('blk Aluminum');
    }
  }

  return parts.join(' ');
}

function getLabelCode(product: ProductItem): string {
  return product.product_name || product.barcode || '';
}

function readLogoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read logo file'));
    reader.readAsDataURL(file);
  });
}

export default function ProductLabelsPage() {
  const { toast } = useToast();
  const [mode, setMode] = useState<LabelMode>('P1');
  const [template, setTemplate] = useState<TemplateKey>('8162');
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [productSearch, setProductSearch] = useState<string>('');
  const [labelItems, setLabelItems] = useState<LabelItem[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedLotId, setSelectedLotId] = useState<string>('');
  const [includeLogo, setIncludeLogo] = useState(false);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [logoFileName, setLogoFileName] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPrintSetup, setShowPrintSetup] = useState(false);
  const [usePartialSheet, setUsePartialSheet] = useState(false);
  const [usedCells, setUsedCells] = useState<Set<number>>(new Set());

  const templateConfig = LABEL_TEMPLATES[template];

  const { data: customers = [] } = useQuery<string[]>({
    queryKey: ['/api/product-labels/customers'],
  });

  const { data: p2Projects = [], isLoading: p2ProjectsLoading } = useQuery<P2ProjectOption[]>({
    queryKey: ['/api/product-labels/p2-projects'],
    enabled: mode === 'P2',
  });

  const { data: p2Lots = [], isLoading: p2LotsLoading } = useQuery<P2LotOption[]>({
    queryKey: ['/api/product-labels/p2-lots', selectedProject],
    queryFn: async () => {
      const res = await fetch(`/api/product-labels/p2-lots?projectName=${encodeURIComponent(selectedProject)}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch P2 lots');
      return res.json();
    },
    enabled: mode === 'P2' && !!selectedProject,
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
    enabled: mode === 'P1' && !!selectedCustomer,
  });

  const selectedLot = useMemo(
    () => p2Lots.find((lot) => lot.id === selectedLotId),
    [p2Lots, selectedLotId]
  );

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
          barcodeValue: getLabelCode(product),
          description: buildDescription(product),
          copies: 1,
          fillPage: false,
        },
      ]);
    }
  };

  const updateCopies = (productId: number, delta: number) => {
    setLabelItems(
      labelItems
        .map((item) =>
          item.productId === productId
            ? { ...item, copies: Math.max(0, item.copies + delta), fillPage: false }
            : item
        )
        .filter((item) => item.copies > 0)
    );
  };

  const setCopies = (productId: number, value: string) => {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 1) return;
    setLabelItems(
      labelItems.map((item) =>
        item.productId === productId ? { ...item, copies: Math.min(num, 200), fillPage: false } : item
      )
    );
  };

  const toggleFillPage = (productId: number) => {
    setLabelItems(
      labelItems.map((item) =>
        item.productId === productId
          ? {
              ...item,
              fillPage: !item.fillPage,
              copies: !item.fillPage ? templateConfig.labelsPerPage : 1,
            }
          : item
      )
    );
  };

  const updateBarcodeValue = (productId: number, barcodeValue: string) => {
    setLabelItems(
      labelItems.map((item) =>
        item.productId === productId ? { ...item, barcodeValue } : item
      )
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

  const filteredProducts = productSearch.trim()
    ? products.filter((p) => {
        const search = productSearch.toLowerCase();
        return (
          p.product_name?.toLowerCase().includes(search) ||
          p.customer_product_number?.toLowerCase().includes(search)
        );
      })
    : products;

  const selectAll = () => {
    const newItems: LabelItem[] = filteredProducts
      .filter((p) => !labelItems.find((l) => l.productId === p.id))
      .map((product) => ({
        productId: product.id,
        barcodeValue: getLabelCode(product),
        description: buildDescription(product),
        copies: 1,
        fillPage: false,
      }));
    setLabelItems([...labelItems, ...newItems]);
  };

  const clearAll = () => setLabelItems([]);

  const totalLabels = mode === 'P2'
    ? selectedLot?.quantity || 0
    : labelItems.reduce((sum, item) => item.fillPage ? sum + templateConfig.labelsPerPage : sum + item.copies, 0);

  const canPrint = mode === 'P2' ? !!selectedLotId : labelItems.length > 0;

  const handleLogoChange = async (file?: File) => {
    if (!file) {
      setLogoBase64(null);
      setLogoFileName('');
      return;
    }

    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      toast({
        title: 'Unsupported logo',
        description: 'Use a PNG or JPEG logo file.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const dataUrl = await readLogoFile(file);
      setLogoBase64(dataUrl);
      setLogoFileName(file.name);
    } catch (error: any) {
      toast({ title: 'Logo error', description: error.message, variant: 'destructive' });
    }
  };

  const openPrintSetup = () => {
    if (!canPrint) {
      toast({
        title: mode === 'P2' ? 'No lot selected' : 'No items selected',
        description: mode === 'P2' ? 'Select a P2 project and lot first.' : 'Add products to generate labels.',
        variant: 'destructive',
      });
      return;
    }

    if (includeLogo && !logoBase64) {
      toast({
        title: 'Logo required',
        description: 'Choose a PNG or JPEG logo file, or clear Add logo.',
        variant: 'destructive',
      });
      return;
    }

    setUsedCells(new Set());
    setUsePartialSheet(false);
    setShowPrintSetup(true);
  };

  const generateLabels = async (skipIndexes: number[]) => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/product-labels/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          mode,
          template,
          products: mode === 'P1' ? labelItems : undefined,
          lotId: mode === 'P2' ? selectedLotId : undefined,
          logoBase64: includeLogo ? logoBase64 : null,
          skipIndexes,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate labels');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');

      toast({ title: 'Labels Generated', description: `${totalLabels} labels ready to print.` });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const confirmPrint = () => {
    const skipIndexes = usePartialSheet ? Array.from(usedCells).sort((a, b) => a - b) : [];
    setShowPrintSetup(false);
    generateLabels(skipIndexes);
  };

  const toggleUsedCell = (index: number) => {
    setUsedCells((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <Tag className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Product Label Generator</h1>
            <p className="text-muted-foreground">Generate P1 product labels or P2 lot serial labels</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex rounded-md border p-1">
            <Button
              type="button"
              size="sm"
              variant={mode === 'P1' ? 'default' : 'ghost'}
              onClick={() => setMode('P1')}
            >
              P1
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === 'P2' ? 'default' : 'ghost'}
              onClick={() => setMode('P2')}
            >
              P2
            </Button>
          </div>

          <Select value={template} onValueChange={(value) => setTemplate(value as TemplateKey)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(LABEL_TEMPLATES).map(([key, config]) => (
                <SelectItem key={key} value={key}>{config.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mb-6 rounded-lg border p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Checkbox
              id="include-logo"
              checked={includeLogo}
              onCheckedChange={(checked) => setIncludeLogo(checked === true)}
            />
            <Label htmlFor="include-logo" className="text-sm font-medium">Add logo to labels</Label>
          </div>
          {includeLogo && (
            <div className="flex flex-wrap items-center gap-3">
              <Input
                type="file"
                accept="image/png,image/jpeg"
                className="max-w-sm"
                onChange={(event) => handleLogoChange(event.target.files?.[0])}
              />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ImagePlus className="h-4 w-4" />
                <span>{logoFileName || 'PNG or JPEG'}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {mode === 'P1' ? 'Select Products' : 'Select P2 Shipment Lot'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {mode === 'P1' ? (
              <>
                <Select value={selectedCustomer} onValueChange={(v) => { setSelectedCustomer(v); setProductSearch(''); }}>
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
                  <Input
                    placeholder="Search by name or product number..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />
                )}

                {selectedCustomer && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={selectAll}>Select All</Button>
                    <Button variant="outline" size="sm" onClick={clearAll}>Clear All</Button>
                  </div>
                )}

                {productsLoading && <p className="text-muted-foreground text-sm">Loading products...</p>}

                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {filteredProducts.map((product) => {
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
                          <p className="text-xs text-muted-foreground font-mono">
                            {product.customer_product_number || null}
                          </p>
                        </div>
                        {inQueue ? (
                          <span className="text-xs text-primary font-medium ml-2">Added ({inQueue.fillPage ? 'Full Page' : inQueue.copies})</span>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); addToLabels(product); }}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <Select
                  value={selectedProject}
                  onValueChange={(value) => {
                    setSelectedProject(value);
                    setSelectedLotId('');
                  }}
                  disabled={p2ProjectsLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a project..." />
                  </SelectTrigger>
                  <SelectContent>
                    {p2Projects.map((project) => (
                      <SelectItem key={project.projectName} value={project.projectName}>
                        {project.projectName} ({project.lotCount})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={selectedLotId}
                  onValueChange={setSelectedLotId}
                  disabled={!selectedProject || p2LotsLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a shipment lot..." />
                  </SelectTrigger>
                  <SelectContent>
                    {p2Lots.map((lot) => (
                      <SelectItem key={lot.id} value={lot.id}>
                        {lot.lotNumber} - {lot.partNumber || 'SKU pending'} ({lot.quantity || 0})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedLot && (
                  <div className="rounded-lg border p-4 text-sm">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs text-muted-foreground">Lot</div>
                        <div className="font-mono font-medium">{selectedLot.lotNumber}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Labels</div>
                        <div className="font-medium">{selectedLot.quantity || 0}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">SKU</div>
                        <div className="font-mono font-medium">{selectedLot.partNumber || 'Finalized SKU'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">PO</div>
                        <div className="font-medium">{selectedLot.poNumber || 'None'}</div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Printer className="h-5 w-5" />
                Label Queue ({totalLabels} labels)
              </span>
              <Button onClick={openPrintSetup} disabled={isGenerating || !canPrint} className="gap-2">
                <Printer className="h-4 w-4" />
                {isGenerating ? 'Generating...' : 'Print Labels'}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {mode === 'P2' ? (
              selectedLot ? (
                <div className="space-y-3">
                  <div className="border rounded-lg p-3">
                    <div className="font-medium">{selectedLot.lotNumber}</div>
                    <div className="text-sm text-muted-foreground">
                      One label for each serialized item in the lot.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Tag className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No P2 lot selected</p>
                  <p className="text-sm">Select a project and shipment lot to generate serial labels</p>
                </div>
              )
            ) : labelItems.length === 0 ? (
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
                      <Button variant="ghost" size="sm" onClick={() => removeItem(item.productId)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Product Code (barcode value)</label>
                      <Input
                        value={item.barcodeValue}
                        onChange={(e) => updateBarcodeValue(item.productId, e.target.value)}
                        className="text-sm font-mono font-bold"
                        placeholder="Product code..."
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Description text</label>
                      <Input
                        value={item.description}
                        onChange={(e) => updateDescription(item.productId, e.target.value)}
                        className="text-sm"
                        placeholder="Label description..."
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Copies:</span>
                        <Button variant="outline" size="sm" onClick={() => updateCopies(item.productId, -1)} disabled={item.fillPage}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          value={item.fillPage ? String(templateConfig.labelsPerPage) : item.copies}
                          onChange={(e) => setCopies(item.productId, e.target.value)}
                          className="w-14 text-center text-sm"
                          disabled={item.fillPage}
                        />
                        <Button variant="outline" size="sm" onClick={() => updateCopies(item.productId, 1)} disabled={item.fillPage}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <Button
                        variant={item.fillPage ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => toggleFillPage(item.productId)}
                        className="gap-1 ml-auto"
                      >
                        <FileSpreadsheet className="h-3 w-3" />
                        Fill Page
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showPrintSetup} onOpenChange={setShowPrintSetup}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Select label cells</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="partial-sheet"
                checked={usePartialSheet}
                onCheckedChange={(checked) => setUsePartialSheet(checked === true)}
              />
              <Label htmlFor="partial-sheet">Use a partially printed sheet</Label>
            </div>

            {usePartialSheet && (
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(${templateConfig.columns}, minmax(0, 1fr))` }}
              >
                {Array.from({ length: templateConfig.labelsPerPage }, (_, index) => {
                  const used = usedCells.has(index);
                  return (
                    <Button
                      key={index}
                      type="button"
                      variant={used ? 'default' : 'outline'}
                      className="h-12"
                      onClick={() => toggleUsedCell(index)}
                    >
                      {index + 1}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPrintSetup(false)}>Cancel</Button>
            <Button onClick={confirmPrint} disabled={isGenerating}>
              {isGenerating ? 'Generating...' : 'Generate PDF'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
