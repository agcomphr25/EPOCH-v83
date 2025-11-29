import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Package, 
  Plus, 
  Pencil, 
  Trash2, 
  Search, 
  RefreshCw,
  Printer,
  ExternalLink,
  AlertTriangle,
  Clock
} from "lucide-react";

type FabricInventory = {
  id: string;
  materialId: string | null;
  productionLineId: string | null;
  source: string | null;
  fabric: string | null;
  batchNumber: string | null;
  internalControlNumber: string | null;
  manufactureDate: string | null;
  receivedDate: string | null;
  expirationDate: string | null;
  location: string | null;
  conformanceDocumentLink: string | null;
  quantityInStock: number;
  squareMeters: string | null;
  lowStockThreshold: number | null;
  barcode: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type ProductionLine = {
  id: string;
  lineName: string;
  lineNumber: number;
  description: string | null;
  isActive: boolean;
};

type CuttingMaterial = {
  id: string;
  materialName: string;
  materialType: string | null;
  description: string | null;
  isActive: boolean;
};

const emptyForm = {
  materialId: "",
  productionLineId: "",
  source: "",
  fabric: "",
  batchNumber: "",
  internalControlNumber: "",
  manufactureDate: "",
  receivedDate: "",
  expirationDate: "",
  location: "",
  conformanceDocumentLink: "",
  quantityInStock: "",
  squareMeters: "",
  lowStockThreshold: "",
  notes: "",
};

export default function FabricInventoryPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<FabricInventory | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: fabricInventory = [], isLoading, refetch } = useQuery<FabricInventory[]>({
    queryKey: ['/api/cutting-table/fabric-inventory'],
  });

  const { data: productionLines = [] } = useQuery<ProductionLine[]>({
    queryKey: ['/api/cutting-table/production-lines'],
  });

  const { data: materials = [] } = useQuery<CuttingMaterial[]>({
    queryKey: ['/api/cutting-table/materials'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      return apiRequest('/api/cutting-table/fabric-inventory', {
        method: 'POST',
        body: JSON.stringify({
          materialId: data.materialId || null,
          productionLineId: data.productionLineId || null,
          source: data.source || null,
          fabric: data.fabric || null,
          batchNumber: data.batchNumber || null,
          internalControlNumber: data.internalControlNumber || null,
          manufactureDate: data.manufactureDate || null,
          receivedDate: data.receivedDate || null,
          expirationDate: data.expirationDate || null,
          location: data.location || null,
          conformanceDocumentLink: data.conformanceDocumentLink || null,
          quantityInStock: parseInt(data.quantityInStock) || 0,
          squareMeters: data.squareMeters || null,
          lowStockThreshold: parseInt(data.lowStockThreshold) || 10,
          notes: data.notes || null,
        }),
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Fabric inventory item created" });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/fabric-inventory'] });
      setIsAddDialogOpen(false);
      setForm(emptyForm);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create fabric inventory item", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof form }) => {
      return apiRequest(`/api/cutting-table/fabric-inventory/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          materialId: data.materialId || null,
          productionLineId: data.productionLineId || null,
          source: data.source || null,
          fabric: data.fabric || null,
          batchNumber: data.batchNumber || null,
          internalControlNumber: data.internalControlNumber || null,
          manufactureDate: data.manufactureDate || null,
          receivedDate: data.receivedDate || null,
          expirationDate: data.expirationDate || null,
          location: data.location || null,
          conformanceDocumentLink: data.conformanceDocumentLink || null,
          quantityInStock: parseInt(data.quantityInStock) || 0,
          squareMeters: data.squareMeters || null,
          lowStockThreshold: parseInt(data.lowStockThreshold) || 10,
          notes: data.notes || null,
        }),
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Fabric inventory item updated" });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/fabric-inventory'] });
      setIsEditDialogOpen(false);
      setSelectedItem(null);
      setForm(emptyForm);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update fabric inventory item", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/cutting-table/fabric-inventory/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Fabric inventory item deleted" });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/fabric-inventory'] });
      setIsDeleteDialogOpen(false);
      setSelectedItem(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete fabric inventory item", variant: "destructive" });
    },
  });

  const handleAdd = () => {
    setForm(emptyForm);
    setIsAddDialogOpen(true);
  };

  const handleEdit = (item: FabricInventory) => {
    setSelectedItem(item);
    setForm({
      materialId: item.materialId || "",
      productionLineId: item.productionLineId || "",
      source: item.source || "",
      fabric: item.fabric || "",
      batchNumber: item.batchNumber || "",
      internalControlNumber: item.internalControlNumber || "",
      manufactureDate: item.manufactureDate ? item.manufactureDate.split('T')[0] : "",
      receivedDate: item.receivedDate ? item.receivedDate.split('T')[0] : "",
      expirationDate: item.expirationDate ? item.expirationDate.split('T')[0] : "",
      location: item.location || "",
      conformanceDocumentLink: item.conformanceDocumentLink || "",
      quantityInStock: String(item.quantityInStock || 0),
      squareMeters: item.squareMeters || "",
      lowStockThreshold: String(item.lowStockThreshold || 10),
      notes: item.notes || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleDelete = (item: FabricInventory) => {
    setSelectedItem(item);
    setIsDeleteDialogOpen(true);
  };

  const handlePrintLabel = async (item: FabricInventory) => {
    if (!item.barcode) {
      toast({ title: "Error", description: "This item doesn't have a barcode", variant: "destructive" });
      return;
    }
    window.open(`/api/cutting-table/fabric-inventory/${item.id}/print-barcode`, '_blank');
  };

  const getStatusBadge = (item: FabricInventory) => {
    const quantity = item.quantityInStock || 0;
    const threshold = item.lowStockThreshold || 10;
    const expDate = item.expirationDate ? new Date(item.expirationDate) : null;
    const isExpired = expDate && expDate < new Date();

    if (isExpired) {
      return <Badge variant="destructive" className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Expired</Badge>;
    }
    if (quantity <= 0) {
      return <Badge variant="destructive">Out of Stock</Badge>;
    }
    if (quantity <= threshold) {
      return <Badge className="bg-yellow-600 hover:bg-yellow-700">Low Stock</Badge>;
    }
    return <Badge className="bg-green-600 hover:bg-green-700">In Stock</Badge>;
  };

  const filteredInventory = fabricInventory.filter(item => {
    const query = searchQuery.toLowerCase();
    return (
      (item.fabric || "").toLowerCase().includes(query) ||
      (item.source || "").toLowerCase().includes(query) ||
      (item.batchNumber || "").toLowerCase().includes(query) ||
      (item.internalControlNumber || "").toLowerCase().includes(query) ||
      (item.location || "").toLowerCase().includes(query) ||
      (item.barcode || "").toLowerCase().includes(query)
    );
  });

  const getProductionLineName = (lineId: string | null) => {
    if (!lineId) return "-";
    const line = productionLines.find(l => l.id === lineId);
    return line?.lineName || "-";
  };

  const getMaterialName = (materialId: string | null) => {
    if (!materialId) return "-";
    const material = materials.find(m => m.id === materialId);
    return material?.materialName || "-";
  };

  const FabricForm = ({ isEdit = false }: { isEdit?: boolean }) => (
    <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto pr-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="fabric">Fabric Type *</Label>
          <Input
            id="fabric"
            value={form.fabric}
            onChange={(e) => setForm({ ...form, fabric: e.target.value })}
            placeholder="e.g., Carbon Fiber, Fiberglass"
            data-testid="input-fabric"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="source">Source/Manufacturer</Label>
          <Input
            id="source"
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
            placeholder="e.g., Hexcel, Toray"
            data-testid="input-source"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="productionLineId">Production Line</Label>
          <Select
            value={form.productionLineId}
            onValueChange={(value) => setForm({ ...form, productionLineId: value })}
          >
            <SelectTrigger data-testid="select-production-line">
              <SelectValue placeholder="Select production line" />
            </SelectTrigger>
            <SelectContent>
              {productionLines.map((line) => (
                <SelectItem key={line.id} value={line.id}>
                  {line.lineName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="materialId">Material Category</Label>
          <Select
            value={form.materialId}
            onValueChange={(value) => setForm({ ...form, materialId: value })}
          >
            <SelectTrigger data-testid="select-material">
              <SelectValue placeholder="Select material" />
            </SelectTrigger>
            <SelectContent>
              {materials.map((mat) => (
                <SelectItem key={mat.id} value={mat.id}>
                  {mat.materialName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="batchNumber">Batch/Lot Number</Label>
          <Input
            id="batchNumber"
            value={form.batchNumber}
            onChange={(e) => setForm({ ...form, batchNumber: e.target.value })}
            placeholder="e.g., LOT-2024-001"
            data-testid="input-batch-number"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="internalControlNumber">Internal Control #</Label>
          <Input
            id="internalControlNumber"
            value={form.internalControlNumber}
            onChange={(e) => setForm({ ...form, internalControlNumber: e.target.value })}
            placeholder="e.g., ICN-12345"
            data-testid="input-internal-control"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="quantityInStock">Quantity in Stock *</Label>
          <Input
            id="quantityInStock"
            type="number"
            value={form.quantityInStock}
            onChange={(e) => setForm({ ...form, quantityInStock: e.target.value })}
            placeholder="0"
            data-testid="input-quantity"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="squareMeters">Square Meters</Label>
          <Input
            id="squareMeters"
            value={form.squareMeters}
            onChange={(e) => setForm({ ...form, squareMeters: e.target.value })}
            placeholder="e.g., 100.5"
            data-testid="input-square-meters"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="lowStockThreshold">Low Stock Threshold</Label>
          <Input
            id="lowStockThreshold"
            type="number"
            value={form.lowStockThreshold}
            onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })}
            placeholder="10"
            data-testid="input-threshold"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">Storage Location</Label>
          <Input
            id="location"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="e.g., Freezer 1, Shelf A3"
            data-testid="input-location"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="manufactureDate">Manufacture Date</Label>
          <Input
            id="manufactureDate"
            type="date"
            value={form.manufactureDate}
            onChange={(e) => setForm({ ...form, manufactureDate: e.target.value })}
            data-testid="input-manufacture-date"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="receivedDate">Received Date</Label>
          <Input
            id="receivedDate"
            type="date"
            value={form.receivedDate}
            onChange={(e) => setForm({ ...form, receivedDate: e.target.value })}
            data-testid="input-received-date"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="expirationDate">Expiration Date</Label>
          <Input
            id="expirationDate"
            type="date"
            value={form.expirationDate}
            onChange={(e) => setForm({ ...form, expirationDate: e.target.value })}
            data-testid="input-expiration-date"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="conformanceDocumentLink">Conformance Document Link</Label>
        <Input
          id="conformanceDocumentLink"
          type="url"
          value={form.conformanceDocumentLink}
          onChange={(e) => setForm({ ...form, conformanceDocumentLink: e.target.value })}
          placeholder="https://..."
          data-testid="input-conformance-link"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Additional notes..."
          rows={3}
          data-testid="input-notes"
        />
      </div>
    </div>
  );

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="fabric-inventory-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Fabric Inventory</h1>
          <p className="text-muted-foreground">Manage cutting table fabric inventory with full traceability</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={handleAdd} data-testid="button-add-fabric">
            <Plus className="h-4 w-4 mr-2" />
            Add Fabric
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Inventory Items</CardTitle>
              <CardDescription>
                {filteredInventory.length} of {fabricInventory.length} items
              </CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search inventory..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
                data-testid="input-search"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredInventory.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Package className="h-12 w-12 mb-4" />
              <p>No fabric inventory items found</p>
              <Button variant="link" onClick={handleAdd}>Add your first fabric</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Fabric</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Batch #</TableHead>
                    <TableHead>Line</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInventory.map((item) => (
                    <TableRow key={item.id} data-testid={`row-fabric-${item.id}`}>
                      <TableCell>{getStatusBadge(item)}</TableCell>
                      <TableCell className="font-medium">{item.fabric || "-"}</TableCell>
                      <TableCell>{item.source || "-"}</TableCell>
                      <TableCell>{item.batchNumber || "-"}</TableCell>
                      <TableCell>{getProductionLineName(item.productionLineId)}</TableCell>
                      <TableCell>{item.location || "-"}</TableCell>
                      <TableCell className="text-right font-mono">{item.quantityInStock}</TableCell>
                      <TableCell>
                        {item.expirationDate ? (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(item.expirationDate).toLocaleDateString()}
                          </span>
                        ) : "-"}
                      </TableCell>
                      <TableCell>
                        {item.barcode ? (
                          <Badge variant="outline" className="font-mono text-xs">
                            {item.barcode}
                          </Badge>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {item.conformanceDocumentLink && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => window.open(item.conformanceDocumentLink!, '_blank')}
                              title="View conformance document"
                              data-testid={`button-view-doc-${item.id}`}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          )}
                          {item.barcode && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handlePrintLabel(item)}
                              title="Print barcode label"
                              data-testid={`button-print-${item.id}`}
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(item)}
                            title="Edit"
                            data-testid={`button-edit-${item.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(item)}
                            title="Delete"
                            className="text-destructive hover:text-destructive"
                            data-testid={`button-delete-${item.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Fabric Inventory</DialogTitle>
            <DialogDescription>
              Add a new fabric item to the cutting table inventory.
            </DialogDescription>
          </DialogHeader>
          <FabricForm />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate(form)}
              disabled={!form.fabric || createMutation.isPending}
              data-testid="button-save-add"
            >
              {createMutation.isPending ? "Saving..." : "Add Fabric"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Fabric Inventory</DialogTitle>
            <DialogDescription>
              Update the fabric inventory item details.
            </DialogDescription>
          </DialogHeader>
          <FabricForm isEdit />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => selectedItem && updateMutation.mutate({ id: selectedItem.id, data: form })}
              disabled={!form.fabric || updateMutation.isPending}
              data-testid="button-save-edit"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Fabric Inventory Item?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedItem?.fabric}"? 
              This action cannot be undone and will remove all associated tracking data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedItem && deleteMutation.mutate(selectedItem.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
