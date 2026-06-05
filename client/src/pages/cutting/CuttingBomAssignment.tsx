import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  cutPrograms?: {
    programName: string;
    squareMetersPerCut: number;
    assignedParts: { partNumber: string; yieldPerCut: number }[];
  }[];
  noPlySchedule?: boolean;
  plySchedule?: {
    plyNumber: number;
    assignedParts: { partNumber: string; quantity: number }[];
  }[];
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
  squareMetersRequired?: number | null;
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

type WizardPart = {
  inventoryItemId: number;
  partNumber: string;
  name: string;
  quantityNeeded: number;
  fabricId: number | null;
  fabricName: string;
};

type PacketBomMaterialFormRow = {
  fabricType: string;
  commonName: string;
  quantityNeeded: number;
  rollsRequired: number;
  squareMetersRequired: number | "";
};

type CutProgram = {
  id: string;
  programName: string;
  squareMetersPerCut: number;
  assignedParts: {
    inventoryItemId: number;
    partNumber: string;
    name: string;
    yieldPerCut: number;
  }[];
};

type PlyEntry = {
  id: string;
  plyNumber: number;
  assignedParts: {
    inventoryItemId: number;
    partNumber: string;
    name: string;
    quantity: number;
  }[];
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
    materials: [] as PacketBomMaterialFormRow[],
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

  // Inventory items marked as packets (isPacket=true)
  const { data: inventoryPackets = [] } = useQuery<{ id: number; agPartNumber: string; name: string; sku: string }[]>({
    queryKey: ['/api/cutting-table/packet-items'],
  });

  // Inventory items marked as packet parts (isPacketPart=true)
  const { data: inventoryPacketParts = [] } = useQuery<{ id: number; agPartNumber: string; name: string; sku: string }[]>({
    queryKey: ['/api/cutting-table/packet-part-items'],
  });

  // Wizard state for new 3-step flow
  const [selectedPacketId, setSelectedPacketId] = useState<number | null>(null);
  const [wizardParts, setWizardParts] = useState<WizardPart[]>([]);
  const [cutPrograms, setCutPrograms] = useState<CutProgram[]>([]);
  const [newProgramName, setNewProgramName] = useState("");
  const [newProgramSqMeters, setNewProgramSqMeters] = useState("0.5");
  
  // Ply schedule state (Step 4)
  const [noPlyScheduleNeeded, setNoPlyScheduleNeeded] = useState(false);
  const [plyEntries, setPlyEntries] = useState<PlyEntry[]>([]);
  const [newPlyNumber, setNewPlyNumber] = useState("1");

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

  const { packetsNeedingBom, bomDemandById } = useMemo(() => {
    if (!weeklyQueueData?.items) return { packetsNeedingBom: [], bomDemandById: new Map<string, { demand: number; source: string }>() };
    
    const demandById = new Map<string, { demand: number; source: string }>();
    
    const bomLookup = new Map<string, PacketBOM[]>();
    packetBOMs.forEach(bom => {
      const keys = [
        bom.id?.toLowerCase(),
        bom.partNumber?.toLowerCase(),
        bom.packetType?.toLowerCase(),
      ].filter(Boolean) as string[];
      
      keys.forEach(key => {
        if (!bomLookup.has(key)) {
          bomLookup.set(key, []);
        }
        bomLookup.get(key)!.push(bom);
      });
    });
    
    const getCategoryBomsP1 = (materialType: string, nameLower: string) => {
      const matchingBoms: PacketBOM[] = [];
      packetBOMs.forEach(bom => {
        const ptLower = bom.packetType?.toLowerCase() || '';
        const pnLower = bom.partNumber?.toLowerCase() || '';
        
        if (materialType === 'carbon_fiber' || nameLower.startsWith('cf_') || nameLower.includes('carbon')) {
          if (ptLower.includes('cf') || ptLower.includes('carbon') || pnLower.includes('cf') || pnLower.includes('carbon')) {
            matchingBoms.push(bom);
          }
        } else if (materialType === 'fiberglass' || nameLower.startsWith('fg_') || nameLower.includes('fiberglass')) {
          if (ptLower.includes('fg') || ptLower.includes('fiberglass') || pnLower.includes('fg') || pnLower.includes('fiberglass')) {
            matchingBoms.push(bom);
          }
        } else if (nameLower.includes('mesa')) {
          if (ptLower.includes('mesa') || pnLower.includes('mesa')) {
            matchingBoms.push(bom);
          }
        }
      });
      return matchingBoms;
    };
    
    const existingBomTypes = new Set(
      packetBOMs.flatMap(bom => [bom.partNumber?.toLowerCase(), bom.packetType?.toLowerCase()].filter(Boolean))
    );
    
    const stockPacketDemand = { cf: 0, fg: 0, mesa: 0 };
    const p2Packets: Record<string, { name: string; demand: number; source: string }> = {};
    
    weeklyQueueData.items.forEach((item: any) => {
      const demand = item.packetsNeeded || 1;
      const name = item.stockModel || '';
      const nameLower = name.toLowerCase();
      const materialType = (item.materialType || '').toLowerCase();
      const isP1 = item.source === 'P1' || item.source === 'P1_PO';
      const packetBomId = item.packetBomId;
      
      if (packetBomId) {
        const existing = demandById.get(packetBomId) || { demand: 0, source: item.source };
        demandById.set(packetBomId, { demand: existing.demand + demand, source: item.source });
        return;
      }
      
      if (isP1) {
        if (materialType === 'carbon_fiber' || nameLower.startsWith('cf_') || nameLower.includes('carbon')) {
          stockPacketDemand.cf += demand;
        } else if (materialType === 'fiberglass' || nameLower.startsWith('fg_') || nameLower.includes('fiberglass')) {
          stockPacketDemand.fg += demand;
        } else if (nameLower.includes('mesa')) {
          stockPacketDemand.mesa += demand;
        }
        
        const matchingBoms = getCategoryBomsP1(materialType, nameLower);
        matchingBoms.forEach(bom => {
          const existing = demandById.get(bom.id) || { demand: 0, source: item.source };
          demandById.set(bom.id, { demand: existing.demand + demand, source: item.source });
        });
        return;
      }
      
      let matchedBoms = bomLookup.get(nameLower) || [];
      
      // If no exact match, try partial matching (e.g., "Disruptor" matches "Disruptor Packet")
      if (matchedBoms.length === 0) {
        matchedBoms = packetBOMs.filter(bom => {
          const ptLower = bom.packetType?.toLowerCase() || '';
          const pnLower = bom.partNumber?.toLowerCase() || '';
          return ptLower.includes(nameLower) || nameLower.includes(ptLower) ||
                 pnLower.includes(nameLower) || nameLower.includes(pnLower);
        });
      }
      
      if (matchedBoms.length > 0) {
        matchedBoms.forEach(bom => {
          const existing = demandById.get(bom.id) || { demand: 0, source: item.source };
          demandById.set(bom.id, { demand: existing.demand + demand, source: item.source });
        });
        return;
      }
      
      const itemIsPacket = item.isPacket === true || 
        (item.source === 'P2' && (nameLower.includes('packet') || (item.sku || '').toLowerCase().includes('packet')));
      if (!itemIsPacket) return;
      
      // Check if any BOM exists with partial match before adding to needsBom list
      const hasPartialBomMatch = packetBOMs.some(bom => {
        const ptLower = bom.packetType?.toLowerCase() || '';
        const pnLower = bom.partNumber?.toLowerCase() || '';
        return ptLower.includes(nameLower) || nameLower.includes(ptLower) ||
               pnLower.includes(nameLower) || nameLower.includes(pnLower);
      });
      if (hasPartialBomMatch) return;
      
      if (!name || existingBomTypes.has(nameLower)) return;
      
      if (!p2Packets[name]) {
        p2Packets[name] = { name, demand: 0, source: item.source };
      }
      p2Packets[name].demand += demand;
    });
    
    const result: { name: string; demand: number; source: string }[] = [];
    
    const hasCfBom = packetBOMs.some(bom => 
      bom.packetType?.toLowerCase().includes('cf') || bom.packetType?.toLowerCase().includes('carbon')
    );
    const hasFgBom = packetBOMs.some(bom => 
      bom.packetType?.toLowerCase().includes('fg') || bom.packetType?.toLowerCase().includes('fiberglass')
    );
    const hasMesaBom = packetBOMs.some(bom => 
      bom.packetType?.toLowerCase().includes('mesa')
    );
    
    if (stockPacketDemand.cf > 0 && !hasCfBom) {
      result.push({ name: 'CF Stock Packet', demand: stockPacketDemand.cf, source: 'P1' });
    }
    if (stockPacketDemand.fg > 0 && !hasFgBom) {
      result.push({ name: 'FG Stock Packet', demand: stockPacketDemand.fg, source: 'P1' });
    }
    if (stockPacketDemand.mesa > 0 && !hasMesaBom) {
      result.push({ name: 'Mesa Packet', demand: stockPacketDemand.mesa, source: 'P1' });
    }
    
    result.push(...Object.values(p2Packets));
    
    return { 
      packetsNeedingBom: result.sort((a, b) => b.demand - a.demand),
      bomDemandById: demandById
    };
  }, [weeklyQueueData?.items, packetBOMs]);

  const bomsWithDemand = useMemo(() => {
    return packetBOMs.filter(bom => bomDemandById.has(bom.id)).map(bom => {
      const demandInfo = bomDemandById.get(bom.id);
      return {
        ...bom,
        currentDemand: demandInfo?.demand || 0,
        demandSource: demandInfo?.source || '',
      };
    }).sort((a, b) => b.currentDemand - a.currentDemand);
  }, [packetBOMs, bomDemandById]);

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
    setSelectedPacketId(null);
    setWizardParts([]);
    setCutPrograms([]);
    setNewProgramName("");
    setNewProgramSqMeters("0.5");
    setNoPlyScheduleNeeded(false);
    setPlyEntries([]);
    setNewPlyNumber("1");
  };

  // Toggle part selection for wizard step 2
  const togglePartSelection = (part: { id: number; agPartNumber: string; name: string }) => {
    const existing = wizardParts.find(p => p.inventoryItemId === part.id);
    if (existing) {
      setWizardParts(prev => prev.filter(p => p.inventoryItemId !== part.id));
    } else {
      setWizardParts(prev => [...prev, {
        inventoryItemId: part.id,
        partNumber: part.agPartNumber,
        name: part.name,
        quantityNeeded: 1,
        fabricId: null,
        fabricName: '',
        cutProgramName: '',
        squareMetersPerCut: 0,
        yieldPerCut: 1,
      }]);
    }
  };

  // Update part details in wizard step 2
  const updateWizardPart = (inventoryItemId: number, field: keyof WizardPart, value: any) => {
    setWizardParts(prev => prev.map(p => 
      p.inventoryItemId === inventoryItemId ? { ...p, [field]: value } : p
    ));
  };

  const addPacketBomMaterial = () => {
    setPacketBomForm(prev => ({
      ...prev,
      materials: [
        ...prev.materials,
        {
          fabricType: "",
          commonName: "",
          quantityNeeded: 1,
          rollsRequired: 1,
          squareMetersRequired: "",
        },
      ],
    }));
  };

  const updatePacketBomMaterial = (index: number, field: keyof PacketBomMaterialFormRow, value: string | number) => {
    setPacketBomForm(prev => ({
      ...prev,
      materials: prev.materials.map((material, materialIndex) =>
        materialIndex === index ? { ...material, [field]: value } : material
      ),
    }));
  };

  const selectPacketBomMaterialFabric = (index: number, fabricId: string) => {
    const fabric = fabricItems.find(item => String(item.id) === fabricId);
    if (!fabric) return;
    setPacketBomForm(prev => ({
      ...prev,
      materials: prev.materials.map((material, materialIndex) =>
        materialIndex === index
          ? {
              ...material,
              fabricType: fabric.name || fabric.fabric || "",
              commonName: fabric.agPartNumber || fabric.fabric || fabric.name || "",
            }
          : material
      ),
    }));
  };

  const removePacketBomMaterial = (index: number) => {
    setPacketBomForm(prev => ({
      ...prev,
      materials: prev.materials.filter((_, materialIndex) => materialIndex !== index),
    }));
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
    // Build parts data from wizard parts with basic info
    const partsData = wizardParts.map((part, index) => ({
      inventoryItemId: part.inventoryItemId,
      partNumber: part.partNumber,
      partDescription: part.name,
      fabricType: part.fabricName || 'Unknown',
      quantityNeeded: part.quantityNeeded,
      sortOrder: index,
    }));

    // Build cut programs data with assigned parts and yields
    const programsData = cutPrograms.map((program, index) => ({
      programName: program.programName,
      squareMetersPerCut: program.squareMetersPerCut,
      sortOrder: index,
      assignedParts: program.assignedParts.map(ap => ({
        inventoryItemId: ap.inventoryItemId,
        partNumber: ap.partNumber,
        yieldPerCut: ap.yieldPerCut,
      })),
    }));

    // Calculate actual metrics from cut programs
    const totalYield = cutPrograms.reduce((sum, prog) => 
      sum + prog.assignedParts.reduce((partSum, ap) => partSum + (ap.yieldPerCut || 0), 0), 0);
    const totalSqMeters = cutPrograms.reduce((sum, prog) => sum + (prog.squareMetersPerCut || 0), 0);
    const numCutPrograms = cutPrograms.length;

    const data = {
      partNumber: packetBomForm.partNumber,
      packetType: packetBomForm.packetType,
      inventoryItemId: selectedPacketId,
      yieldPerCut: totalYield > 0 ? totalYield : (parseInt(packetBomForm.yieldPerCut) || 4),
      squareMetersPerCut: totalSqMeters > 0 ? totalSqMeters : (parseFloat(packetBomForm.squareMetersPerCut) || 0.5),
      wasteFactor: parseFloat(packetBomForm.wasteFactor) || 0.05,
      materials: packetBomForm.materials
        .filter(material => material.fabricType.trim())
        .map(material => ({
          fabricType: material.fabricType.trim(),
          commonName: material.commonName.trim(),
          quantityNeeded: material.quantityNeeded || 1,
          rollsRequired: material.rollsRequired || 1,
          squareMetersRequired: material.squareMetersRequired === "" ? undefined : Number(material.squareMetersRequired),
        })),
      parts: partsData,
      cutPrograms: programsData,
      cuts: packetBomForm.cuts,
      noPlySchedule: noPlyScheduleNeeded,
      plySchedule: noPlyScheduleNeeded ? [] : plyEntries.map(ply => ({
        plyNumber: ply.plyNumber,
        assignedParts: ply.assignedParts.map(ap => ({
          inventoryItemId: ap.inventoryItemId,
          partNumber: ap.partNumber,
          quantity: ap.quantity,
        })),
      })),
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
        rollsRequired: m.rollsRequired || 1,
        squareMetersRequired: m.squareMetersRequired ?? "",
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
            Packets to Manufacture
          </CardTitle>
          <CardDescription>BOMs with current manufacturing demand from the schedule</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingBOMs ? (
            <div className="text-center py-8 text-muted-foreground">Loading BOMs...</div>
          ) : bomsWithDemand.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No packets currently need manufacturing. Check back when there's demand from the schedule.
            </div>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {bomsWithDemand.map((bom) => (
                <AccordionItem key={bom.id} value={bom.id}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center justify-between w-full pr-4">
                      <div className="flex items-center gap-3">
                        <Layers className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{bom.partNumber || bom.packetType}</span>
                        <Badge variant="outline">{bom.packetType}</Badge>
                        <Badge variant="destructive">{bom.currentDemand} needed</Badge>
                        <Badge variant="secondary">{bom.demandSource}</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{bom.parts?.length || 0} parts</span>
                        <span>•</span>
                        <span>{bom.cutPrograms?.length || bom.cuts?.length || 0} programs</span>
                        <span>•</span>
                        <span>{bom.cutPrograms?.reduce((sum: number, p: any) => sum + (p.assignedParts?.reduce((ps: number, ap: any) => ps + (ap.yieldPerCut || 0), 0) || 0), 0) || bom.yieldPerCut || 0} total yield</span>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <Label className="text-muted-foreground">Total Yield (all programs)</Label>
                          <p className="font-medium">
                            {bom.cutPrograms?.reduce((sum: number, p: any) => sum + (p.assignedParts?.reduce((ps: number, ap: any) => ps + (ap.yieldPerCut || 0), 0) || 0), 0) || bom.yieldPerCut || 0} pieces
                          </p>
                        </div>
                        <div>
                          <Label className="text-muted-foreground">Total Square Meters (all programs)</Label>
                          <p className="font-medium">
                            {bom.cutPrograms?.reduce((sum: number, p: any) => sum + (parseFloat(p.squareMetersPerCut) || 0), 0) || bom.squareMetersPerCut || 0} m²
                          </p>
                        </div>
                        <div>
                          <Label className="text-muted-foreground">Cut Programs</Label>
                          <p className="font-medium">{bom.cutPrograms?.length || 0} programs</p>
                        </div>
                      </div>

                      {/* Fabric requirements from Step 2 */}
                      {bom.materials && bom.materials.length > 0 && (
                        <div>
                          <Label className="text-muted-foreground mb-2 block">Fabric Requirements</Label>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {bom.materials.map((material: any, idx) => (
                              <div key={idx} className="rounded border bg-muted/30 p-2 text-sm">
                                <div className="flex items-center justify-between gap-2">
                                  <div>
                                    <p className="font-medium">{material.fabricType}</p>
                                    {material.commonName && <p className="text-xs text-muted-foreground font-mono">{material.commonName}</p>}
                                  </div>
                                  <Badge variant="outline">Qty {material.quantityNeeded || 1}</Badge>
                                </div>
                                <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
                                  <span>{material.rollsRequired || 1} roll(s)</span>
                                  {material.squareMetersRequired != null && <span>{material.squareMetersRequired} sq m</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Parts from Step 2 */}
                      {bom.parts && bom.parts.length > 0 && (
                        <div>
                          <Label className="text-muted-foreground mb-2 block">Parts (Step 2)</Label>
                          <div className="space-y-1">
                            {bom.parts.map((part: any, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-sm bg-muted/30 rounded px-2 py-1">
                                <Badge variant="secondary">{part.partNumber}</Badge>
                                <span>Qty: {part.quantity || 1}</span>
                                {part.fabricName && (
                                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                    {part.fabricName}
                                  </Badge>
                                )}
                                {part.partDescription && <span className="text-muted-foreground">- {part.partDescription}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Cut Programs from Step 3 */}
                      {bom.cutPrograms && bom.cutPrograms.length > 0 && (
                        <div>
                          <Label className="text-muted-foreground mb-2 block">Cut Programs (Step 3)</Label>
                          <div className="space-y-2">
                            {bom.cutPrograms.map((program, idx) => (
                              <div key={idx} className="bg-muted/50 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <Scissors className="h-4 w-4 text-primary" />
                                    <span className="font-medium">{program.programName}</span>
                                  </div>
                                  <Badge variant="outline">{program.squareMetersPerCut} m²/cut</Badge>
                                </div>
                                {program.assignedParts && program.assignedParts.length > 0 && (
                                  <div className="mt-2">
                                    <p className="text-xs font-medium mb-1">Assigned Parts:</p>
                                    <div className="flex flex-wrap gap-1">
                                      {program.assignedParts.map((ap, apIdx) => (
                                        <Badge key={apIdx} variant="secondary" className="text-xs">
                                          {ap.partNumber} - Yield: {ap.yieldPerCut}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Ply Schedule from Step 4 */}
                      <div>
                        <Label className="text-muted-foreground mb-2 block">Ply Schedule (Step 4)</Label>
                        {bom.noPlySchedule ? (
                          <div className="text-sm text-muted-foreground italic bg-muted/30 rounded px-3 py-2">
                            No ply schedule needed for this BOM
                          </div>
                        ) : bom.plySchedule && bom.plySchedule.length > 0 ? (
                          <div className="space-y-2">
                            {bom.plySchedule.map((ply, idx) => (
                              <div key={idx} className="bg-muted/50 rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <Layers className="h-4 w-4 text-primary" />
                                  <span className="font-medium">Ply {ply.plyNumber}</span>
                                  <Badge variant="outline">{ply.assignedParts?.length || 0} parts</Badge>
                                </div>
                                {ply.assignedParts && ply.assignedParts.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {ply.assignedParts.map((ap, apIdx) => (
                                      <Badge key={apIdx} variant="secondary" className="text-xs">
                                        {ap.partNumber} × {ap.quantity}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground italic bg-muted/30 rounded px-3 py-2">
                            No ply schedule configured
                          </div>
                        )}
                      </div>

                      {/* Legacy Cuts (if any) */}
                      {bom.cuts && bom.cuts.length > 0 && (
                        <div>
                          <Label className="text-muted-foreground mb-2 block">Legacy Cuts</Label>
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
              {editingPacketBom ? "Edit Packet BOM" : "Create Packet BOM"} - Step {wizardStep} of 4
            </DialogTitle>
            <DialogDescription>
              {wizardStep === 1 && "Select a packet from inventory"}
              {wizardStep === 2 && "Select packet parts, enter quantity and fabric for each"}
              {wizardStep === 3 && "Create cut programs and assign parts with yield"}
              {wizardStep === 4 && "Set up ply schedule (optional)"}
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-center mb-4">
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4].map((step) => (
                <div key={step} className="flex items-center">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                      wizardStep >= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {wizardStep > step ? <Check className="h-4 w-4" /> : step}
                  </div>
                  {step < 4 && <ChevronRight className="h-4 w-4 mx-2 text-muted-foreground" />}
                </div>
              ))}
            </div>
          </div>

          {wizardStep === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-base font-medium">Select Packet from Inventory</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Choose a packet that has been marked as "Packet" in the inventory items.
                </p>
                {inventoryPackets.length === 0 ? (
                  <div className="border rounded-lg p-6 text-center text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No packets found in inventory.</p>
                    <p className="text-sm">Mark items as "Packet" in Inventory Management to see them here.</p>
                  </div>
                ) : (
                  <div className="border rounded-lg divide-y max-h-[400px] overflow-y-auto">
                    {inventoryPackets.map((packet) => (
                      <div
                        key={packet.id}
                        className={cn(
                          "p-3 cursor-pointer hover:bg-muted/50 transition-colors flex items-center justify-between",
                          selectedPacketId === packet.id && "bg-primary/10 border-l-4 border-l-primary"
                        )}
                        onClick={() => {
                          setSelectedPacketId(packet.id);
                          setPacketBomForm(prev => ({
                            ...prev,
                            partNumber: packet.agPartNumber,
                            packetType: packet.name,
                          }));
                        }}
                        data-testid={`packet-option-${packet.id}`}
                      >
                        <div>
                          <div className="font-medium">{packet.agPartNumber}</div>
                          <div className="text-sm text-muted-foreground">{packet.name}</div>
                        </div>
                        {selectedPacketId === packet.id && (
                          <Check className="h-5 w-5 text-primary" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {wizardStep === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-base font-medium">Select Packet Parts</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Choose parts that have been marked as "Packet Part" in inventory, then set quantity and fabric for each.
                </p>
              </div>

              {inventoryPacketParts.length === 0 ? (
                <div className="border rounded-lg p-6 text-center text-muted-foreground">
                  <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No packet parts found in inventory.</p>
                  <p className="text-sm">Mark items as "Packet Part" in Inventory Management to see them here.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="border rounded-lg max-h-[300px] overflow-y-auto">
                    <div className="p-2 bg-muted/50 font-medium text-sm border-b sticky top-0">
                      Available Parts (click to add)
                    </div>
                    {inventoryPacketParts.filter(p => !wizardParts.find(wp => wp.inventoryItemId === p.id)).map((part) => (
                      <div
                        key={part.id}
                        className="p-2 cursor-pointer hover:bg-muted/50 transition-colors border-b last:border-b-0"
                        onClick={() => togglePartSelection(part)}
                        data-testid={`part-option-${part.id}`}
                      >
                        <div className="font-medium text-sm">{part.agPartNumber}</div>
                        <div className="text-xs text-muted-foreground">{part.name}</div>
                      </div>
                    ))}
                  </div>

                  <div className="border rounded-lg">
                    <div className="p-2 bg-muted/50 font-medium text-sm border-b">
                      Selected Parts ({wizardParts.length})
                    </div>
                    {wizardParts.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        Click parts on the left to add them
                      </div>
                    ) : (
                      <div className="max-h-[250px] overflow-y-auto">
                        {wizardParts.map((part) => (
                          <div key={part.inventoryItemId} className="p-3 border-b last:border-b-0 space-y-2">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="font-medium text-sm">{part.partNumber}</div>
                                <div className="text-xs text-muted-foreground">{part.name}</div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => togglePartSelection({ id: part.inventoryItemId, agPartNumber: part.partNumber, name: part.name })}
                                data-testid={`remove-part-${part.inventoryItemId}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs">Quantity</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  value={part.quantityNeeded}
                                  onChange={(e) => updateWizardPart(part.inventoryItemId, 'quantityNeeded', parseInt(e.target.value) || 1)}
                                  className="h-8 text-sm"
                                  data-testid={`input-qty-${part.inventoryItemId}`}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Fabric</Label>
                                <Select
                                  value={part.fabricId?.toString() || ''}
                                  onValueChange={(value) => {
                                    const fabric = fabricItems.find(f => f.id.toString() === value);
                                    updateWizardPart(part.inventoryItemId, 'fabricId', fabric?.id || null);
                                    updateWizardPart(part.inventoryItemId, 'fabricName', fabric?.name || fabric?.fabric || '');
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-sm" data-testid={`select-fabric-${part.inventoryItemId}`}>
                                    <SelectValue placeholder="Select fabric" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {fabricItems.map((fabric) => (
                                      <SelectItem key={fabric.id} value={fabric.id.toString()}>
                                        {fabric.name || fabric.fabric}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Label className="text-base font-medium">BOM Fabric Requirements</Label>
                    <p className="text-sm text-muted-foreground">
                      Add one row for each fabric required by this packet. Use multiple rows when the packet uses more than one fabric.
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addPacketBomMaterial} data-testid="button-add-bom-fabric">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Fabric
                  </Button>
                </div>

                {packetBomForm.materials.length === 0 ? (
                  <div className="border border-dashed rounded-lg p-4 text-sm text-muted-foreground text-center">
                    No BOM fabric rows yet. Add every fabric that must be traced for this packet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {packetBomForm.materials.map((material, index) => (
                      <div key={index} className="grid grid-cols-12 gap-2 items-end border rounded-lg p-3">
                        <div className="col-span-12 md:col-span-5 space-y-1">
                          <Label className="text-xs">Fabric entry</Label>
                          <Select
                            value=""
                            onValueChange={(value) => selectPacketBomMaterialFabric(index, value)}
                          >
                            <SelectTrigger className="h-8 text-sm" data-testid={`select-bom-fabric-${index}`}>
                              <SelectValue placeholder={material.fabricType || "Select fabric"} />
                            </SelectTrigger>
                            <SelectContent>
                              {fabricItems.map((fabric) => (
                                <SelectItem key={fabric.id} value={String(fabric.id)}>
                                  {(fabric.agPartNumber || "No part #") + " - " + (fabric.name || fabric.fabric)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {(material.commonName || material.fabricType) && (
                            <p className="text-xs text-muted-foreground">
                              {material.commonName && <span className="font-mono">{material.commonName}</span>}
                              {material.commonName && material.fabricType && " - "}
                              {material.fabricType}
                            </p>
                          )}
                        </div>
                        <div className="col-span-4 md:col-span-2 space-y-1">
                          <Label className="text-xs">Qty / packet</Label>
                          <Input
                            type="number"
                            min="1"
                            value={material.quantityNeeded}
                            onChange={(e) => updatePacketBomMaterial(index, "quantityNeeded", parseInt(e.target.value) || 1)}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="col-span-4 md:col-span-2 space-y-1">
                          <Label className="text-xs">Rolls</Label>
                          <Input
                            type="number"
                            min="1"
                            value={material.rollsRequired}
                            onChange={(e) => updatePacketBomMaterial(index, "rollsRequired", parseInt(e.target.value) || 1)}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="col-span-4 md:col-span-2 space-y-1">
                          <Label className="text-xs">Sq m</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={material.squareMetersRequired}
                            onChange={(e) => updatePacketBomMaterial(index, "squareMetersRequired", e.target.value === "" ? "" : Number(e.target.value))}
                            className="h-8 text-sm"
                            placeholder="Optional"
                          />
                        </div>
                        <div className="col-span-12 md:col-span-1 flex md:justify-end">
                          <Button type="button" variant="ghost" size="sm" onClick={() => removePacketBomMaterial(index)} data-testid={`button-remove-bom-fabric-${index}`}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {wizardStep === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-base font-medium">Cut Programs</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Create cut programs, then assign parts from Step 2 to each program with their yield per cut.
                </p>
              </div>

              {/* Add New Program */}
              <div className="border rounded-lg p-4 bg-muted/30">
                <div className="flex items-end gap-3">
                  <div className="flex-1 space-y-2">
                    <Label className="text-sm">Program Name</Label>
                    <Input
                      value={newProgramName}
                      onChange={(e) => setNewProgramName(e.target.value)}
                      placeholder="e.g., PROG-001"
                      data-testid="input-new-program-name"
                    />
                  </div>
                  <div className="w-40 space-y-2">
                    <Label className="text-sm">Sq Meters / Cut</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newProgramSqMeters}
                      onChange={(e) => setNewProgramSqMeters(e.target.value)}
                      placeholder="0.50"
                      data-testid="input-new-program-sqm"
                    />
                  </div>
                  <Button
                    onClick={() => {
                      if (!newProgramName.trim()) {
                        toast({ title: "Enter a program name", variant: "destructive" });
                        return;
                      }
                      const newProgram: CutProgram = {
                        id: `prog-${Date.now()}`,
                        programName: newProgramName.trim(),
                        squareMetersPerCut: parseFloat(newProgramSqMeters) || 0.5,
                        assignedParts: [],
                      };
                      setCutPrograms(prev => [...prev, newProgram]);
                      setNewProgramName("");
                      setNewProgramSqMeters("0.5");
                    }}
                    data-testid="button-add-program"
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add Program
                  </Button>
                </div>
              </div>

              {/* Programs List */}
              {cutPrograms.length === 0 ? (
                <div className="border rounded-lg p-6 text-center text-muted-foreground">
                  <Scissors className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No cut programs created yet.</p>
                  <p className="text-sm">Add a program above to get started.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {cutPrograms.map((program) => (
                    <div key={program.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Scissors className="h-4 w-4 text-primary" />
                          <span className="font-medium">{program.programName}</span>
                          <Badge variant="secondary">{program.squareMetersPerCut} m² / cut</Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCutPrograms(prev => prev.filter(p => p.id !== program.id))}
                          data-testid={`button-remove-program-${program.id}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                      {/* Assigned Parts */}
                      <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground">Assigned Parts:</Label>
                        {program.assignedParts.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic">No parts assigned yet</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {program.assignedParts.map((assignedPart) => (
                              <Badge key={assignedPart.inventoryItemId} variant="outline" className="py-1 px-2">
                                {assignedPart.partNumber} (Yield: {assignedPart.yieldPerCut})
                                <button
                                  className="ml-2 hover:text-destructive"
                                  onClick={() => {
                                    setCutPrograms(prev => prev.map(p =>
                                      p.id === program.id
                                        ? { ...p, assignedParts: p.assignedParts.filter(ap => ap.inventoryItemId !== assignedPart.inventoryItemId) }
                                        : p
                                    ));
                                  }}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Add Part to Program */}
                      <div className="flex items-end gap-2 pt-2 border-t">
                        <div className="flex-1">
                          <Label className="text-sm">Add Part</Label>
                          <Select
                            onValueChange={(value) => {
                              const part = wizardParts.find(p => p.inventoryItemId.toString() === value);
                              if (part && !program.assignedParts.find(ap => ap.inventoryItemId === part.inventoryItemId)) {
                                setCutPrograms(prev => prev.map(p =>
                                  p.id === program.id
                                    ? {
                                        ...p,
                                        assignedParts: [...p.assignedParts, {
                                          inventoryItemId: part.inventoryItemId,
                                          partNumber: part.partNumber,
                                          name: part.name,
                                          yieldPerCut: 1,
                                        }]
                                      }
                                    : p
                                ));
                              }
                            }}
                          >
                            <SelectTrigger className="h-9" data-testid={`select-add-part-${program.id}`}>
                              <SelectValue placeholder="Select a part to add..." />
                            </SelectTrigger>
                            <SelectContent>
                              {wizardParts
                                .filter(part => !program.assignedParts.find(ap => ap.inventoryItemId === part.inventoryItemId))
                                .map((part) => (
                                  <SelectItem key={part.inventoryItemId} value={part.inventoryItemId.toString()}>
                                    {part.partNumber} - {part.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Yield Inputs for Assigned Parts */}
                      {program.assignedParts.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 pt-2">
                          {program.assignedParts.map((assignedPart) => (
                            <div key={assignedPart.inventoryItemId} className="flex items-center gap-2">
                              <span className="text-sm font-medium w-24 truncate">{assignedPart.partNumber}</span>
                              <Label className="text-xs text-muted-foreground">Yield:</Label>
                              <Input
                                type="number"
                                min="1"
                                className="w-20 h-8"
                                value={assignedPart.yieldPerCut}
                                onChange={(e) => {
                                  const newYield = parseInt(e.target.value) || 1;
                                  setCutPrograms(prev => prev.map(p =>
                                    p.id === program.id
                                      ? {
                                          ...p,
                                          assignedParts: p.assignedParts.map(ap =>
                                            ap.inventoryItemId === assignedPart.inventoryItemId
                                              ? { ...ap, yieldPerCut: newYield }
                                              : ap
                                          )
                                        }
                                      : p
                                  ));
                                }}
                                data-testid={`input-yield-${program.id}-${assignedPart.inventoryItemId}`}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {wizardStep === 4 && (
            <div className="space-y-4">
              {/* No Ply Schedule Checkbox */}
              <div className="flex items-center space-x-2 p-3 border rounded-lg bg-muted/30">
                <Checkbox
                  id="noPlySchedule"
                  checked={noPlyScheduleNeeded}
                  onCheckedChange={(checked) => setNoPlyScheduleNeeded(checked === true)}
                  data-testid="checkbox-no-ply-schedule"
                />
                <Label htmlFor="noPlySchedule" className="text-sm font-medium cursor-pointer">
                  No ply schedule needed for this BOM
                </Label>
              </div>

              {!noPlyScheduleNeeded && (
                <>
                  <div className="space-y-2">
                    <Label className="text-base font-medium">Ply Schedule</Label>
                    <p className="text-sm text-muted-foreground mb-3">
                      Add plies and assign one or more parts to each ply.
                    </p>
                  </div>

                  {/* Add New Ply */}
                  <div className="border rounded-lg p-4 bg-muted/30">
                    <div className="flex items-end gap-3">
                      <div className="w-32 space-y-2">
                        <Label className="text-sm">Ply Number</Label>
                        <Input
                          type="number"
                          min="1"
                          value={newPlyNumber}
                          onChange={(e) => setNewPlyNumber(e.target.value)}
                          placeholder="1"
                          data-testid="input-new-ply-number"
                        />
                      </div>
                      <Button
                        onClick={() => {
                          const plyNum = parseInt(newPlyNumber) || 1;
                          if (plyEntries.find(p => p.plyNumber === plyNum)) {
                            toast({ title: `Ply ${plyNum} already exists`, variant: "destructive" });
                            return;
                          }
                          const newPly: PlyEntry = {
                            id: `ply-${Date.now()}`,
                            plyNumber: plyNum,
                            assignedParts: [],
                          };
                          setPlyEntries(prev => [...prev, newPly].sort((a, b) => a.plyNumber - b.plyNumber));
                          setNewPlyNumber(String(plyNum + 1));
                        }}
                        data-testid="button-add-ply"
                      >
                        <Plus className="h-4 w-4 mr-1" /> Add Ply
                      </Button>
                    </div>
                  </div>

                  {/* Plies List */}
                  {plyEntries.length === 0 ? (
                    <div className="border rounded-lg p-6 text-center text-muted-foreground">
                      <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No plies added yet.</p>
                      <p className="text-sm">Add a ply above to get started.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {plyEntries.map((ply) => (
                        <div key={ply.id} className="border rounded-lg p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Layers className="h-4 w-4 text-primary" />
                              <span className="font-medium">Ply {ply.plyNumber}</span>
                              <Badge variant="secondary">{ply.assignedParts.length} parts</Badge>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPlyEntries(prev => prev.filter(p => p.id !== ply.id))}
                              data-testid={`button-remove-ply-${ply.id}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>

                          {/* Assigned Parts with Quantity */}
                          {ply.assignedParts.length > 0 && (
                            <div className="space-y-2">
                              {ply.assignedParts.map((assignedPart) => (
                                <div key={assignedPart.inventoryItemId} className="flex items-center gap-3 bg-muted/30 rounded p-2">
                                  <span className="flex-1 text-sm">{assignedPart.partNumber} - {assignedPart.name}</span>
                                  <div className="flex items-center gap-2">
                                    <Label className="text-xs text-muted-foreground">Qty:</Label>
                                    <Input
                                      type="number"
                                      min="1"
                                      className="w-16 h-7 text-sm"
                                      value={assignedPart.quantity}
                                      onChange={(e) => {
                                        const newQty = parseInt(e.target.value) || 1;
                                        setPlyEntries(prev => prev.map(p =>
                                          p.id === ply.id
                                            ? {
                                                ...p,
                                                assignedParts: p.assignedParts.map(ap =>
                                                  ap.inventoryItemId === assignedPart.inventoryItemId
                                                    ? { ...ap, quantity: newQty }
                                                    : ap
                                                )
                                              }
                                            : p
                                        ));
                                      }}
                                      data-testid={`input-ply-qty-${ply.id}-${assignedPart.inventoryItemId}`}
                                    />
                                  </div>
                                  <button
                                    className="text-muted-foreground hover:text-destructive"
                                    onClick={() => {
                                      setPlyEntries(prev => prev.map(p =>
                                        p.id === ply.id
                                          ? { ...p, assignedParts: p.assignedParts.filter(ap => ap.inventoryItemId !== assignedPart.inventoryItemId) }
                                          : p
                                      ));
                                    }}
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add Part to Ply */}
                          <div className="flex items-end gap-2 pt-2 border-t">
                            <div className="flex-1">
                              <Label className="text-sm">Add Part to Ply</Label>
                              <Select
                                onValueChange={(value) => {
                                  const part = wizardParts.find(p => p.inventoryItemId.toString() === value);
                                  if (part && !ply.assignedParts.find(ap => ap.inventoryItemId === part.inventoryItemId)) {
                                    setPlyEntries(prev => prev.map(p =>
                                      p.id === ply.id
                                        ? {
                                            ...p,
                                            assignedParts: [...p.assignedParts, {
                                              inventoryItemId: part.inventoryItemId,
                                              partNumber: part.partNumber,
                                              name: part.name,
                                              quantity: 1,
                                            }]
                                          }
                                        : p
                                    ));
                                  }
                                }}
                              >
                                <SelectTrigger className="h-9" data-testid={`select-add-part-ply-${ply.id}`}>
                                  <SelectValue placeholder="Select a part to add..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {wizardParts
                                    .filter(part => !ply.assignedParts.find(ap => ap.inventoryItemId === part.inventoryItemId))
                                    .map((part) => (
                                      <SelectItem key={part.inventoryItemId} value={part.inventoryItemId.toString()}>
                                        {part.partNumber} - {part.name}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
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
                {wizardStep < 4 ? (
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
