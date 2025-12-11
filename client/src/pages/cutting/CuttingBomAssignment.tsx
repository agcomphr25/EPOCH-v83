import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { 
  Package, 
  Plus,
  Edit,
  Trash2,
  Layers,
  FileText,
  Check,
  X,
  ChevronRight,
  Settings,
  Scissors,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type PacketBOM = {
  id: string;
  packetType: string;
  partNumber: string;
  description: string;
  materials: PacketBOMMaterial[];
  parts?: PacketBOMPart[];
  cuts?: CutDefinition[];
  squareMetersPerCut: number;
  yieldPerCut: number;
  wasteFactor?: number;
  createdAt: string;
};

type PacketBOMMaterial = {
  id: string;
  packetBomId: string;
  fabricType: string;
  commonName: string | null;
  quantityNeeded: number;
  rollsRequired: number;
};

type PacketBOMPart = {
  id: string;
  partNumber: string;
  partDescription: string | null;
  quantity: number;
};

type CutDefinition = {
  id: string;
  label: string;
  materialPartNumber: string;
  materialName: string;
  cutsNeeded: number;
  plySchedule?: PlyScheduleItem[];
  assignedParts: { partNumber: string; partDescription: string; partsPerCut: number }[];
};

type PlyScheduleItem = {
  plyNumber: number;
  materialType: string;
  orientation: string;
  notes?: string;
};

export default function CuttingBomAssignment() {
  const { toast } = useToast();
  
  const [isPacketBomDialogOpen, setIsPacketBomDialogOpen] = useState(false);
  const [editingPacketBom, setEditingPacketBom] = useState<PacketBOM | null>(null);
  const [wizardStep, setWizardStep] = useState(1);
  
  const [packetBomForm, setPacketBomForm] = useState({
    partNumber: "",
    packetType: "",
    yieldPerCut: "4",
    squareMetersPerCut: "0.5",
    wasteFactor: "0.05",
    materials: [] as { fabricType: string; commonName: string; quantityNeeded: number }[],
    parts: [] as { partNumber: string; partDescription: string; quantity: number }[],
    cuts: [] as CutDefinition[],
  });

  const [newPartForm, setNewPartForm] = useState({
    partNumber: "",
    partDescription: "",
    quantity: 1,
  });

  const [newCutForm, setNewCutForm] = useState({
    label: "",
    materialPartNumber: "",
    materialName: "",
    cutsNeeded: 1,
    plySchedule: [] as PlyScheduleItem[],
  });

  const [newPlyForm, setNewPlyForm] = useState({
    materialType: "",
    orientation: "0°",
    notes: "",
  });

  const { data: packetBOMs = [], isLoading: loadingBOMs } = useQuery<PacketBOM[]>({
    queryKey: ['/api/cutting-table/packet-boms'],
  });

  const { data: availablePacketItems = [] } = useQuery<{ id: number; agPartNumber: string; name: string; description: string | null }[]>({
    queryKey: ['/api/cutting-table-mfg-queue/available-packets'],
  });

  const { data: fabricItems = [] } = useQuery<{ id: number; agPartNumber: string; name: string; fabric: string }[]>({
    queryKey: ['/api/cutting-table/fabric-items'],
  });

  const { data: weeklyQueueData } = useQuery<{
    items: { stockModel: string; source: string; packetsNeeded: number }[];
  }>({
    queryKey: ['/api/cutting-table/weekly-cutting-queue', 'showAll'],
    queryFn: async () => {
      const res = await fetch('/api/cutting-table/weekly-cutting-queue?showAll=true');
      if (!res.ok) return { items: [] };
      return res.json();
    },
  });

  const packetsNeedingBom = useMemo(() => {
    if (!weeklyQueueData?.items) return [];
    
    const existingBomTypes = new Set(
      packetBOMs.flatMap(bom => [bom.partNumber, bom.packetType].filter(Boolean))
    );
    
    const demandedPackets: Record<string, { name: string; demand: number; source: string }> = {};
    
    weeklyQueueData.items.forEach(item => {
      if (!item.stockModel) return;
      const name = item.stockModel;
      if (!existingBomTypes.has(name)) {
        if (!demandedPackets[name]) {
          demandedPackets[name] = { name, demand: 0, source: item.source };
        }
        demandedPackets[name].demand += item.packetsNeeded || 1;
      }
    });
    
    return Object.values(demandedPackets).sort((a, b) => b.demand - a.demand);
  }, [weeklyQueueData?.items, packetBOMs]);

  const createPacketBomMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('/api/cutting-table/packet-boms', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/packet-boms'] });
      toast({ title: "Created", description: "Packet BOM created successfully." });
      setIsPacketBomDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create packet BOM.", variant: "destructive" });
    },
  });

  const updatePacketBomMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest(`/api/cutting-table/packet-boms/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/packet-boms'] });
      toast({ title: "Updated", description: "Packet BOM updated successfully." });
      setIsPacketBomDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update packet BOM.", variant: "destructive" });
    },
  });

  const deletePacketBomMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/cutting-table/packet-boms/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/packet-boms'] });
      toast({ title: "Deleted", description: "Packet BOM removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete packet BOM.", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setPacketBomForm({
      partNumber: "",
      packetType: "",
      yieldPerCut: "4",
      squareMetersPerCut: "0.5",
      wasteFactor: "0.05",
      materials: [],
      parts: [],
      cuts: [],
    });
    setNewPartForm({ partNumber: "", partDescription: "", quantity: 1 });
    setNewCutForm({ label: "", materialPartNumber: "", materialName: "", cutsNeeded: 1, plySchedule: [] });
    setWizardStep(1);
    setEditingPacketBom(null);
  };

  const handleAddPart = () => {
    if (!newPartForm.partNumber) return;
    setPacketBomForm(prev => ({
      ...prev,
      parts: [...prev.parts, { ...newPartForm }],
    }));
    setNewPartForm({ partNumber: "", partDescription: "", quantity: 1 });
  };

  const handleRemovePart = (index: number) => {
    setPacketBomForm(prev => ({
      ...prev,
      parts: prev.parts.filter((_, i) => i !== index),
    }));
  };

  const handleAddCut = () => {
    if (!newCutForm.label || !newCutForm.materialPartNumber) return;
    const newCut: CutDefinition = {
      id: `cut-${Date.now()}`,
      ...newCutForm,
      assignedParts: [],
    };
    setPacketBomForm(prev => ({
      ...prev,
      cuts: [...prev.cuts, newCut],
    }));
    setNewCutForm({ label: "", materialPartNumber: "", materialName: "", cutsNeeded: 1, plySchedule: [] });
  };

  const handleAddPlyToCut = (cutIndex: number) => {
    if (!newPlyForm.materialType) return;
    const updatedCuts = [...packetBomForm.cuts];
    const currentPlySchedule = updatedCuts[cutIndex].plySchedule || [];
    updatedCuts[cutIndex].plySchedule = [
      ...currentPlySchedule,
      {
        plyNumber: currentPlySchedule.length + 1,
        ...newPlyForm,
      },
    ];
    setPacketBomForm(prev => ({ ...prev, cuts: updatedCuts }));
    setNewPlyForm({ materialType: "", orientation: "0°", notes: "" });
  };

  const handleRemoveCut = (index: number) => {
    setPacketBomForm(prev => ({
      ...prev,
      cuts: prev.cuts.filter((_, i) => i !== index),
    }));
  };

  const handleAssignPartToCut = (cutIndex: number, part: { partNumber: string; partDescription: string }) => {
    const updatedCuts = [...packetBomForm.cuts];
    const existingPartIndex = updatedCuts[cutIndex].assignedParts.findIndex(p => p.partNumber === part.partNumber);
    if (existingPartIndex >= 0) {
      updatedCuts[cutIndex].assignedParts[existingPartIndex].partsPerCut += 1;
    } else {
      updatedCuts[cutIndex].assignedParts.push({ ...part, partsPerCut: 1 });
    }
    setPacketBomForm(prev => ({ ...prev, cuts: updatedCuts }));
  };

  const handleSavePacketBom = () => {
    const data = {
      partNumber: packetBomForm.partNumber,
      packetType: packetBomForm.packetType,
      yieldPerCut: parseInt(packetBomForm.yieldPerCut) || 4,
      squareMetersPerCut: parseFloat(packetBomForm.squareMetersPerCut) || 0.5,
      wasteFactor: parseFloat(packetBomForm.wasteFactor) || 0.05,
      materials: packetBomForm.materials,
      parts: packetBomForm.parts,
      cuts: packetBomForm.cuts,
    };

    if (editingPacketBom) {
      updatePacketBomMutation.mutate({ id: editingPacketBom.id, data });
    } else {
      createPacketBomMutation.mutate(data);
    }
  };

  const handleEditBom = (bom: PacketBOM) => {
    setEditingPacketBom(bom);
    setPacketBomForm({
      partNumber: bom.partNumber || "",
      packetType: bom.packetType || "",
      yieldPerCut: String(bom.yieldPerCut || 4),
      squareMetersPerCut: String(bom.squareMetersPerCut || 0.5),
      wasteFactor: String(bom.wasteFactor || 0.05),
      materials: bom.materials?.map(m => ({
        fabricType: m.fabricType,
        commonName: m.commonName || "",
        quantityNeeded: m.quantityNeeded || 1,
      })) || [],
      parts: bom.parts?.map(p => ({
        partNumber: p.partNumber,
        partDescription: p.partDescription || "",
        quantity: p.quantity || 1,
      })) || [],
      cuts: bom.cuts || [],
    });
    setWizardStep(1);
    setIsPacketBomDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold" data-testid="text-page-title">BOM Assignment</h2>
          <p className="text-muted-foreground">Link packets to BOMs with parts, fabric usage, and ply schedules</p>
        </div>
        <Button onClick={() => { resetForm(); setIsPacketBomDialogOpen(true); }} data-testid="button-create-bom">
          <Plus className="h-4 w-4 mr-2" />
          Create Packet BOM
        </Button>
      </div>

      {packetsNeedingBom.length > 0 && (
        <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              Action Needed: Create BOMs
            </CardTitle>
            <CardDescription className="text-amber-600 dark:text-amber-500">
              The following packets have demand but no BOM configured
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Packet Name</TableHead>
                  <TableHead className="text-center">Demand</TableHead>
                  <TableHead className="text-center">Source</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packetsNeedingBom.map((packet) => (
                  <TableRow key={packet.name}>
                    <TableCell className="font-medium">{packet.name}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="destructive">{packet.demand}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{packet.source}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        onClick={() => {
                          resetForm();
                          setPacketBomForm(prev => ({
                            ...prev,
                            packetType: packet.name,
                            partNumber: packet.name,
                          }));
                          setIsPacketBomDialogOpen(true);
                        }}
                        data-testid={`button-create-bom-for-${packet.name}`}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Create BOM
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Packet BOMs
          </CardTitle>
          <CardDescription>Configured packet BOMs with cutting specifications</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingBOMs ? (
            <div className="text-center py-8 text-muted-foreground">Loading BOMs...</div>
          ) : packetBOMs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No packet BOMs configured. Create one to get started.
            </div>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {packetBOMs.map((bom) => (
                <AccordionItem key={bom.id} value={bom.id}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center justify-between w-full pr-4">
                      <div className="flex items-center gap-3">
                        <Layers className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{bom.partNumber || bom.packetType}</span>
                        <Badge variant="outline">{bom.packetType}</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{bom.parts?.length || 0} parts</span>
                        <span>•</span>
                        <span>{bom.cuts?.length || 0} cuts</span>
                        <span>•</span>
                        <span>{bom.yieldPerCut || 4} yield/cut</span>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <Label className="text-muted-foreground">Yield Per Cut</Label>
                          <p className="font-medium">{bom.yieldPerCut || 4} pieces</p>
                        </div>
                        <div>
                          <Label className="text-muted-foreground">Square Meters/Cut</Label>
                          <p className="font-medium">{bom.squareMetersPerCut || 0.5} m²</p>
                        </div>
                        <div>
                          <Label className="text-muted-foreground">Waste Factor</Label>
                          <p className="font-medium">{((bom.wasteFactor || 0.05) * 100).toFixed(0)}%</p>
                        </div>
                      </div>

                      {bom.parts && bom.parts.length > 0 && (
                        <div>
                          <Label className="text-muted-foreground mb-2 block">Parts</Label>
                          <div className="flex flex-wrap gap-2">
                            {bom.parts.map((part, idx) => (
                              <Badge key={idx} variant="secondary">
                                {part.partNumber} × {part.quantity || 1}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {bom.cuts && bom.cuts.length > 0 && (
                        <div>
                          <Label className="text-muted-foreground mb-2 block">Cuts & Ply Schedule</Label>
                          <div className="space-y-2">
                            {bom.cuts.map((cut, idx) => (
                              <div key={idx} className="bg-muted/50 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-medium">{cut.label}</span>
                                  <Badge>{cut.cutsNeeded} cut(s)</Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  Material: {cut.materialName || cut.materialPartNumber}
                                </p>
                                {cut.plySchedule && cut.plySchedule.length > 0 && (
                                  <div className="mt-2">
                                    <p className="text-xs font-medium mb-1">Ply Schedule:</p>
                                    <div className="flex flex-wrap gap-1">
                                      {cut.plySchedule.map((ply, plyIdx) => (
                                        <Badge key={plyIdx} variant="outline" className="text-xs">
                                          Ply {ply.plyNumber}: {ply.materialType} @ {ply.orientation}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {cut.assignedParts && cut.assignedParts.length > 0 && (
                                  <div className="mt-2 text-xs text-muted-foreground">
                                    Assigned: {cut.assignedParts.map(p => `${p.partNumber} (${p.partsPerCut})`).join(", ")}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2 pt-2">
                        <Button variant="outline" size="sm" onClick={() => handleEditBom(bom)} data-testid={`button-edit-bom-${bom.id}`}>
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="text-destructive"
                          onClick={() => deletePacketBomMutation.mutate(bom.id)}
                          data-testid={`button-delete-bom-${bom.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      <Dialog open={isPacketBomDialogOpen} onOpenChange={setIsPacketBomDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPacketBom ? "Edit Packet BOM" : "Create Packet BOM"} - Step {wizardStep} of 3
            </DialogTitle>
            <DialogDescription>
              {wizardStep === 1 && "Select the packet item and configure basic settings"}
              {wizardStep === 2 && "Add parts that make up this packet"}
              {wizardStep === 3 && "Configure cuts, materials, and ply schedules"}
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-center mb-4">
            <div className="flex items-center gap-2">
              {[1, 2, 3].map((step) => (
                <div key={step} className="flex items-center">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                      wizardStep >= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {wizardStep > step ? <Check className="h-4 w-4" /> : step}
                  </div>
                  {step < 3 && <ChevronRight className="h-4 w-4 mx-2 text-muted-foreground" />}
                </div>
              ))}
            </div>
          </div>

          {wizardStep === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Packet Item</Label>
                  <Select
                    value={packetBomForm.partNumber}
                    onValueChange={(value) => {
                      const item = availablePacketItems.find(i => i.agPartNumber === value);
                      setPacketBomForm(prev => ({
                        ...prev,
                        partNumber: value,
                        packetType: item?.name || prev.packetType,
                      }));
                    }}
                  >
                    <SelectTrigger data-testid="select-packet-item">
                      <SelectValue placeholder="Select packet item" />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePacketItems.map((item) => (
                        <SelectItem key={item.id} value={item.agPartNumber}>
                          {item.agPartNumber} - {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Packet Type</Label>
                  <Input
                    value={packetBomForm.packetType}
                    onChange={(e) => setPacketBomForm(prev => ({ ...prev, packetType: e.target.value }))}
                    placeholder="e.g., CF Short Action"
                    data-testid="input-packet-type"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Yield Per Cut</Label>
                  <Input
                    type="number"
                    value={packetBomForm.yieldPerCut}
                    onChange={(e) => setPacketBomForm(prev => ({ ...prev, yieldPerCut: e.target.value }))}
                    data-testid="input-yield-per-cut"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Square Meters Per Cut</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={packetBomForm.squareMetersPerCut}
                    onChange={(e) => setPacketBomForm(prev => ({ ...prev, squareMetersPerCut: e.target.value }))}
                    data-testid="input-sqm-per-cut"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Waste Factor</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={packetBomForm.wasteFactor}
                    onChange={(e) => setPacketBomForm(prev => ({ ...prev, wasteFactor: e.target.value }))}
                    data-testid="input-waste-factor"
                  />
                </div>
              </div>
            </div>
          )}

          {wizardStep === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2 items-end">
                <div className="space-y-2">
                  <Label>Part Number</Label>
                  <Input
                    value={newPartForm.partNumber}
                    onChange={(e) => setNewPartForm(prev => ({ ...prev, partNumber: e.target.value }))}
                    placeholder="Part #"
                    data-testid="input-new-part-number"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    value={newPartForm.partDescription}
                    onChange={(e) => setNewPartForm(prev => ({ ...prev, partDescription: e.target.value }))}
                    placeholder="Part description"
                    data-testid="input-new-part-description"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    value={newPartForm.quantity}
                    onChange={(e) => setNewPartForm(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                    data-testid="input-new-part-quantity"
                  />
                </div>
                <Button onClick={handleAddPart} data-testid="button-add-part">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Part
                </Button>
              </div>

              {packetBomForm.parts.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Part Number</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {packetBomForm.parts.map((part, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{part.partNumber}</TableCell>
                        <TableCell>{part.partDescription}</TableCell>
                        <TableCell>{part.quantity}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => handleRemovePart(index)} data-testid={`button-remove-part-${index}`}>
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}

          {wizardStep === 3 && (
            <div className="space-y-6">
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Scissors className="h-4 w-4" />
                  Add Cut Definition
                </h4>
                <div className="grid grid-cols-4 gap-2 items-end">
                  <div className="space-y-2">
                    <Label>Cut Label</Label>
                    <Input
                      value={newCutForm.label}
                      onChange={(e) => setNewCutForm(prev => ({ ...prev, label: e.target.value }))}
                      placeholder="e.g., Cut 1 - Inletting"
                      data-testid="input-cut-label"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Material</Label>
                    <Select
                      value={newCutForm.materialPartNumber}
                      onValueChange={(value) => {
                        const item = fabricItems.find(i => i.agPartNumber === value);
                        setNewCutForm(prev => ({
                          ...prev,
                          materialPartNumber: value,
                          materialName: item?.name || item?.fabric || value,
                        }));
                      }}
                    >
                      <SelectTrigger data-testid="select-cut-material">
                        <SelectValue placeholder="Select material" />
                      </SelectTrigger>
                      <SelectContent>
                        {fabricItems.map((item) => (
                          <SelectItem key={item.id} value={item.agPartNumber}>
                            {item.agPartNumber} - {item.name || item.fabric}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Cuts Needed</Label>
                    <Input
                      type="number"
                      value={newCutForm.cutsNeeded}
                      onChange={(e) => setNewCutForm(prev => ({ ...prev, cutsNeeded: parseInt(e.target.value) || 1 }))}
                      data-testid="input-cuts-needed"
                    />
                  </div>
                  <Button onClick={handleAddCut} data-testid="button-add-cut">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Cut
                  </Button>
                </div>
              </div>

              {packetBomForm.cuts.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-medium">Configured Cuts</h4>
                  {packetBomForm.cuts.map((cut, cutIndex) => (
                    <div key={cut.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="font-medium">{cut.label}</span>
                          <span className="text-sm text-muted-foreground ml-2">
                            ({cut.materialName || cut.materialPartNumber}) × {cut.cutsNeeded}
                          </span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveCut(cutIndex)} data-testid={`button-remove-cut-${cutIndex}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="bg-muted/50 rounded p-3">
                        <Label className="text-sm mb-2 block">Ply Schedule</Label>
                        <div className="flex gap-2 items-end mb-2">
                          <div className="flex-1">
                            <Input
                              placeholder="Material type"
                              value={newPlyForm.materialType}
                              onChange={(e) => setNewPlyForm(prev => ({ ...prev, materialType: e.target.value }))}
                              data-testid={`input-ply-material-${cutIndex}`}
                            />
                          </div>
                          <Select value={newPlyForm.orientation} onValueChange={(v) => setNewPlyForm(prev => ({ ...prev, orientation: v }))}>
                            <SelectTrigger className="w-24" data-testid={`select-ply-orientation-${cutIndex}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0°">0°</SelectItem>
                              <SelectItem value="45°">45°</SelectItem>
                              <SelectItem value="90°">90°</SelectItem>
                              <SelectItem value="-45°">-45°</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button size="sm" onClick={() => handleAddPlyToCut(cutIndex)} data-testid={`button-add-ply-${cutIndex}`}>
                            Add Ply
                          </Button>
                        </div>
                        {cut.plySchedule && cut.plySchedule.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {cut.plySchedule.map((ply, plyIdx) => (
                              <Badge key={plyIdx} variant="secondary" className="text-xs">
                                Ply {ply.plyNumber}: {ply.materialType} @ {ply.orientation}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="bg-muted/50 rounded p-3">
                        <Label className="text-sm mb-2 block">Assign Parts to This Cut</Label>
                        <div className="flex flex-wrap gap-2">
                          {packetBomForm.parts.map((part, partIdx) => (
                            <Button
                              key={partIdx}
                              variant="outline"
                              size="sm"
                              onClick={() => handleAssignPartToCut(cutIndex, part)}
                              data-testid={`button-assign-part-${cutIndex}-${partIdx}`}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              {part.partNumber}
                            </Button>
                          ))}
                        </div>
                        {cut.assignedParts.length > 0 && (
                          <div className="mt-2 text-sm text-muted-foreground">
                            Assigned: {cut.assignedParts.map(p => `${p.partNumber} (${p.partsPerCut})`).join(", ")}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <div className="flex justify-between w-full">
              <div>
                {wizardStep > 1 && (
                  <Button variant="outline" onClick={() => setWizardStep(s => s - 1)} data-testid="button-wizard-back">
                    Back
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsPacketBomDialogOpen(false)} data-testid="button-cancel">
                  Cancel
                </Button>
                {wizardStep < 3 ? (
                  <Button onClick={() => setWizardStep(s => s + 1)} data-testid="button-wizard-next">
                    Next
                  </Button>
                ) : (
                  <Button 
                    onClick={handleSavePacketBom} 
                    disabled={createPacketBomMutation.isPending || updatePacketBomMutation.isPending}
                    data-testid="button-save-bom"
                  >
                    {editingPacketBom ? "Update BOM" : "Create BOM"}
                  </Button>
                )}
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
