import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, CheckCircle2, AlertCircle, Printer, Edit } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type Material = {
  id: string;
  materialName: string;
  yieldPerCut: number;
  materialType: string;
  wasteFactor: string;
  isActive: boolean;
};

type ProductionLine = {
  id: string;
  lineName: string;
  lineNumber: number;
  description: string;
  isActive: boolean;
};

type ProductCategory = {
  id: string;
  productionLineId: string;
  categoryName: string;
  displayOrder: number;
};

type Component = {
  id: string;
  componentName: string;
  yieldPerCut: number;
  fabricType: string;
  thickness: string;
  isActive: boolean;
};

type PacketComposition = {
  id: string;
  productCategoryId: string;
  componentId: string | null;
  inventoryItemId: number | null;
  quantityNeeded: number;
};

type WeeklyData = {
  id: string;
  weekDate: string;
  productionLineId: string;
  productCategoryId: string;
  quantity: number;
};

type CutProgress = {
  id: string;
  weekDate: string;
  workDate: string;
  materialId: string;
  productionLineId: string;
  productCategoryId: string;
  componentId: string;
  cutsCompleted: number;
  cutsRequired: number;
  isCompleted: boolean;
};

type FabricInventory = {
  id: string;
  materialId: string;
  lotNumber: string | null;
  quantityInStock: number;
  receivedDate: string | null;
  expirationDate: string | null;
  lowStockThreshold: number;
  location: string | null;
  notes: string | null;
};

// Calculate cuts required using the business formula
function calculateCutsRequired(totalPieces: number, yieldPerCut: number, wasteFactor: number): number {
  const effectiveYield = Math.floor(yieldPerCut * (1 - wasteFactor));
  return Math.ceil(totalPieces / effectiveYield);
}

// Get Monday of the current week
function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

// Add days to a date
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export default function CuttingTable() {
  const { toast } = useToast();
  const [currentWeek, setCurrentWeek] = useState(getMondayOfWeek(new Date()));
  const [selectedLine, setSelectedLine] = useState<string>("all");
  
  // Form state for Submit Data tab
  const [selectedWeek, setSelectedWeek] = useState(getMondayOfWeek(new Date()));
  const [selectedFormLine, setSelectedFormLine] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [quantity, setQuantity] = useState('');
  
  // Form state for Configure Recipes tab
  const [recipePacketType, setRecipePacketType] = useState('');
  const [recipePartNumber, setRecipePartNumber] = useState('');
  const [recipeInventoryItem, setRecipeInventoryItem] = useState('');
  const [recipeQuantity, setRecipeQuantity] = useState('');

  // Form state for Add Fabric Inventory tab
  const [fabricFormLine, setFabricFormLine] = useState('');
  const [fabricSource, setFabricSource] = useState('');
  const [fabricType, setFabricType] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [internalControlNumber, setInternalControlNumber] = useState('');
  const [manufactureDate, setManufactureDate] = useState('');
  const [receivedDate, setReceivedDate] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [location, setLocation] = useState('');
  const [conformanceDocLink, setConformanceDocLink] = useState('');
  const [fabricQuantity, setFabricQuantity] = useState('');
  const [fabricNotes, setFabricNotes] = useState('');

  // Form state for Packet Management tab
  const [selectedPacketCategory, setSelectedPacketCategory] = useState('');
  const [packetsNeeded, setPacketsNeeded] = useState('');
  const [buildingSession, setBuildingSession] = useState(false);

  // Form state for Inventory tab
  const [inventorySortBy, setInventorySortBy] = useState<'fabric' | 'expiration' | 'quantity'>('expiration');
  const [editingFabric, setEditingFabric] = useState<FabricInventory | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Fetch all data
  const { data: materials = [], isLoading: loadingMaterials } = useQuery<Material[]>({
    queryKey: ['/api/cutting-table/materials'],
  });

  const { data: productionLines = [], isLoading: loadingLines } = useQuery<ProductionLine[]>({
    queryKey: ['/api/cutting-table/production-lines'],
  });

  const { data: categories = [], isLoading: loadingCategories } = useQuery<ProductCategory[]>({
    queryKey: ['/api/cutting-table/product-categories'],
  });

  const { data: components = [], isLoading: loadingComponents } = useQuery<Component[]>({
    queryKey: ['/api/cutting-table/components'],
  });

  const { data: packetCompositions = [], isLoading: loadingPacketCompositions } = useQuery<PacketComposition[]>({
    queryKey: ['/api/cutting-table/packet-compositions'],
  });

  const { data: weeklyData = [], isLoading: loadingWeekly } = useQuery<WeeklyData[]>({
    queryKey: ['/api/cutting-table/weekly-data/by-week', currentWeek],
  });

  const { data: cutProgress = [], isLoading: loadingProgress } = useQuery<CutProgress[]>({
    queryKey: ['/api/cutting-table/cut-progress/by-week', currentWeek],
  });

  const { data: fabricInventory = [], isLoading: loadingInventory } = useQuery<FabricInventory[]>({
    queryKey: ['/api/cutting-table/fabric-inventory'],
  });

  const { data: inventoryItems = [], isLoading: loadingInventoryItems } = useQuery<any[]>({
    queryKey: ['/api/enhanced/inventory/items'],
  });

  const isLoading = loadingMaterials || loadingLines || loadingCategories || loadingComponents || loadingPacketCompositions || loadingWeekly || loadingProgress || loadingInventory || loadingInventoryItems;

  // Clear selected category when production line changes
  useEffect(() => {
    setSelectedCategory('');
  }, [selectedFormLine]);

  // Initialize mutation
  const initializeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/cutting-table/initialize', {
        method: 'POST',
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Cutting table initialized with P1/P2 production lines and categories"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/production-lines'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/product-categories'] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to initialize cutting table",
        variant: "destructive"
      });
    },
  });

  // Navigate weeks
  const previousWeek = () => {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() - 7);
    setCurrentWeek(d.toISOString().split('T')[0]);
  };

  const nextWeek = () => {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() + 7);
    setCurrentWeek(d.toISOString().split('T')[0]);
  };

  const goToToday = () => {
    setCurrentWeek(getMondayOfWeek(new Date()));
  };

  // Dashboard: Visual cards showing weekly requirements
  const renderDashboard = () => {
    // Group weekly data by product category
    const filteredWeekly = selectedLine === "all" 
      ? weeklyData 
      : weeklyData.filter(w => w.productionLineId === selectedLine);

    return (
      <div className="space-y-6" data-testid="cutting-dashboard">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button onClick={previousWeek} variant="outline" size="sm" data-testid="button-prev-week">
              ← Previous Week
            </Button>
            <span className="font-medium" data-testid="text-current-week">Week of {currentWeek}</span>
            <Button onClick={nextWeek} variant="outline" size="sm" data-testid="button-next-week">
              Next Week →
            </Button>
            <Button onClick={goToToday} variant="outline" size="sm" data-testid="button-today">
              Today
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="line-filter">Production Line:</Label>
            <Select value={selectedLine} onValueChange={setSelectedLine}>
              <SelectTrigger className="w-[200px]" id="line-filter" data-testid="select-production-line">
                <SelectValue placeholder="Select line" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Lines</SelectItem>
                {productionLines.map((line) => (
                  <SelectItem key={line.id} value={line.id}>
                    {line.lineName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {filteredWeekly.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <p data-testid="text-no-data">No weekly data for this week. Use the Submit Data tab to add production goals.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-auto-fit gap-4">
            {filteredWeekly.map((week) => {
              const category = categories.find(c => c.id === week.productCategoryId);
              const line = productionLines.find(l => l.id === week.productionLineId);
              const categoryComponents = components.filter(c => c.productCategoryId === week.productCategoryId);
              
              // Calculate total cuts required and completed
              let totalRequired = 0;
              let totalCompleted = 0;
              
              categoryComponents.forEach(comp => {
                const material = materials.find(m => m.id === comp.materialId);
                if (material) {
                  const totalPieces = week.quantity * comp.requiredQuantity;
                  const cutsRequired = calculateCutsRequired(totalPieces, material.yieldPerCut, parseFloat(material.wasteFactor));
                  totalRequired += cutsRequired;
                  
                  const progress = cutProgress.find(p => 
                    p.componentId === comp.id && p.weekDate === week.weekDate
                  );
                  totalCompleted += progress?.cutsCompleted || 0;
                }
              });

              const completionPercent = totalRequired > 0 ? Math.round((totalCompleted / totalRequired) * 100) : 0;
              const isComplete = completionPercent === 100;
              const bgColor = isComplete 
                ? 'bg-green-100 dark:bg-green-900 border-green-500' 
                : completionPercent > 50 
                  ? 'bg-yellow-100 dark:bg-yellow-900 border-yellow-500'
                  : 'bg-red-100 dark:bg-red-900 border-red-500';

              return (
                <Card 
                  key={week.id} 
                  className={`w-24 h-24 flex flex-col items-center justify-center border-2 ${bgColor}`}
                  data-testid={`card-product-${week.id}`}
                >
                  <div className="text-xs font-medium text-center px-1" data-testid={`text-category-${week.id}`}>
                    {category?.categoryName.substring(0, 15)}
                  </div>
                  <div className="text-lg font-bold" data-testid={`text-quantity-${week.id}`}>{week.quantity}</div>
                  <div className="text-xs" data-testid={`text-completion-${week.id}`}>{completionPercent}%</div>
                  {isComplete && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                </Card>
              );
            })}
          </div>
        )}

        {/* Checklist by Production Line */}
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-4">Required Cuts</h3>
          {productionLines.map((line) => {
            const lineWeeklyData = weeklyData.filter(w => w.productionLineId === line.id);
            if (lineWeeklyData.length === 0) return null;

            return (
              <Card key={line.id} className="p-4 mb-4" data-testid={`card-line-checklist-${line.id}`}>
                <h4 className="font-medium mb-3">{line.lineName}: {line.description}</h4>
                <div className="space-y-2">
                  {lineWeeklyData.map((week) => {
                    const category = categories.find(c => c.id === week.productCategoryId);
                    const categoryComponents = components.filter(c => c.productCategoryId === week.productCategoryId);

                    return (
                      <div key={week.id} className="ml-4">
                        <div className="font-medium text-sm">{category?.categoryName} ({week.quantity} units)</div>
                        {categoryComponents.map(comp => {
                          const material = materials.find(m => m.id === comp.materialId);
                          if (!material) return null;

                          const totalPieces = week.quantity * comp.requiredQuantity;
                          const cutsRequired = calculateCutsRequired(totalPieces, material.yieldPerCut, parseFloat(material.wasteFactor));
                          
                          const progress = cutProgress.find(p => 
                            p.componentId === comp.id && p.weekDate === week.weekDate
                          );

                          return (
                            <div key={comp.id} className="ml-6 text-sm text-muted-foreground flex items-center justify-between">
                              <span data-testid={`text-component-${comp.id}`}>
                                {comp.componentName} - {material.materialName}: {progress?.cutsCompleted || 0} / {cutsRequired} cuts
                              </span>
                              {progress?.isCompleted && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  };

  // Daily Tracker: Auto-distribute weekly goals across Mon-Thu
  const renderDailyTracker = () => {
    const workDays = [
      { name: 'Monday', date: currentWeek },
      { name: 'Tuesday', date: addDays(currentWeek, 1) },
      { name: 'Wednesday', date: addDays(currentWeek, 2) },
      { name: 'Thursday', date: addDays(currentWeek, 3) },
    ];

    return (
      <div className="space-y-6" data-testid="daily-tracker">
        <div className="flex items-center gap-4">
          <Button onClick={previousWeek} variant="outline" size="sm" data-testid="button-prev-week-daily">
            ← Previous Week
          </Button>
          <span className="font-medium">Week of {currentWeek}</span>
          <Button onClick={nextWeek} variant="outline" size="sm" data-testid="button-next-week-daily">
            Next Week →
          </Button>
          <Button onClick={goToToday} variant="outline" size="sm" data-testid="button-today-daily">
            Today
          </Button>
        </div>

        {weeklyData.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <p>No weekly data for this week.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {workDays.map((day) => {
              const dayProgress = cutProgress.filter(p => p.workDate === day.date);
              
              return (
                <Card key={day.name} className="p-4" data-testid={`card-day-${day.name}`}>
                  <h3 className="font-semibold mb-3">{day.name}</h3>
                  <p className="text-sm text-muted-foreground mb-3">{day.date}</p>
                  
                  {dayProgress.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No cuts scheduled</p>
                  ) : (
                    <div className="space-y-2">
                      {dayProgress.map(progress => {
                        const component = components.find(c => c.id === progress.componentId);
                        const material = materials.find(m => m.id === progress.materialId);
                        const category = categories.find(c => c.id === progress.productCategoryId);

                        return (
                          <div key={progress.id} className="text-sm" data-testid={`progress-${progress.id}`}>
                            <div className="font-medium">{category?.categoryName}</div>
                            <div className="text-muted-foreground">
                              {material?.materialName}: {progress.cutsCompleted} / {progress.cutsRequired}
                            </div>
                            {progress.isCompleted && (
                              <span className="text-xs text-green-600 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Complete
                              </span>
                            )}
                          </div>
                        );
                      })}
                      <div className="pt-2 border-t">
                        <div className="font-medium">Total Cuts: {dayProgress.reduce((sum, p) => sum + p.cutsCompleted, 0)} / {dayProgress.reduce((sum, p) => sum + p.cutsRequired, 0)}</div>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // Simplified tabs for now - we'll expand functionality later
  const renderWeeklyReport = () => (
    <Card className="p-8" data-testid="weekly-report">
      <h3 className="text-lg font-semibold mb-4">Weekly Reports</h3>
      <p className="text-muted-foreground">Historical data and drill-down coming soon...</p>
    </Card>
  );

  const renderProjections = () => (
    <Card className="p-8" data-testid="projections">
      <h3 className="text-lg font-semibold mb-4">Projections</h3>
      <p className="text-muted-foreground">Future requirements based on historical data coming soon...</p>
    </Card>
  );

  const renderPacketManagement = () => {
    const packetCategories = categories.filter(cat => 
      packetCompositions.some(comp => comp.productCategoryId === cat.id)
    );

    const handleBuildPacket = async () => {
      if (!selectedPacketCategory || !packetsNeeded || parseInt(packetsNeeded) <= 0) {
        toast({
          title: "Missing Information",
          description: "Please select a packet type and enter a valid quantity",
          variant: "destructive"
        });
        return;
      }

      setBuildingSession(true);
      try {
        const result = await apiRequest('/api/cutting-table/packet-sessions/build', {
          method: 'POST',
          body: JSON.stringify({
            productCategoryId: selectedPacketCategory,
            packetsCount: parseInt(packetsNeeded),
            performedBy: 'Production Team',
            notes: `Built ${packetsNeeded} packets via UI`,
          }),
        });

        const lotsCount = result.sessionLots?.length || 0;
        toast({
          title: "Packet Build Complete",
          description: `Built ${packetsNeeded} packet(s) using ${lotsCount} inventory lot(s). Session ID: ${result.session?.id?.slice(0, 8)}...`,
          duration: 5000,
        });

        queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/fabric-inventory'] });
        setSelectedPacketCategory('');
        setPacketsNeeded('');
      } catch (error: any) {
        const errorMsg = error.error || error.message || "Failed to build packet session";
        toast({
          title: "Build Failed",
          description: errorMsg,
          variant: "destructive",
          duration: 7000,
        });
      } finally {
        setBuildingSession(false);
      }
    };

    const selectedCategory = categories.find(c => c.id === selectedPacketCategory);
    const categoryCompositions = packetCompositions.filter(
      comp => comp.productCategoryId === selectedPacketCategory
    );

    return (
      <div className="space-y-6" data-testid="packet-management">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recipe Summary Panel */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Recipe Summary</h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Packet Type</label>
                <Select value={selectedPacketCategory} onValueChange={setSelectedPacketCategory}>
                  <SelectTrigger data-testid="select-packet-type">
                    <SelectValue placeholder="Select packet type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {packetCategories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.categoryName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedCategory && categoryCompositions.length > 0 && (
                <div className="border rounded p-4 bg-muted/50">
                  <h4 className="font-medium mb-3">{selectedCategory.categoryName} Composition</h4>
                  <div className="space-y-2">
                    {categoryCompositions.map(comp => {
                      const component = components.find(c => c.id === comp.componentId);
                      return component ? (
                        <div key={comp.id} className="flex justify-between text-sm p-2 bg-background rounded">
                          <span className="font-medium">{component.componentName}</span>
                          <span className="text-muted-foreground">
                            {comp.quantityNeeded}x • {component.fabricType} {component.thickness}
                          </span>
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Build Session Panel */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Build Packet Session</h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Packets to Build</label>
                <Input
                  type="number"
                  placeholder="Enter quantity"
                  value={packetsNeeded}
                  onChange={(e) => setPacketsNeeded(e.target.value)}
                  disabled={!selectedPacketCategory}
                  data-testid="input-packets-needed"
                  min="1"
                />
              </div>

              {selectedPacketCategory && packetsNeeded && parseInt(packetsNeeded) > 0 && (
                <div className="border rounded p-4 bg-blue-50 dark:bg-blue-950">
                  <h4 className="font-medium mb-2 text-sm">Estimated Requirements:</h4>
                  <div className="space-y-1 text-sm">
                    {categoryCompositions.map(comp => {
                      const component = components.find(c => c.id === comp.componentId);
                      if (!component) return null;
                      const totalNeeded = comp.quantityNeeded * parseInt(packetsNeeded);
                      return (
                        <div key={comp.id} className="flex justify-between">
                          <span>{component.componentName}:</span>
                          <span className="font-mono">{totalNeeded} pcs</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <Button
                onClick={handleBuildPacket}
                disabled={!selectedPacketCategory || !packetsNeeded || buildingSession}
                className="w-full"
                data-testid="button-build-session"
              >
                {buildingSession ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Building...
                  </>
                ) : (
                  'Build Packet Session (FIFO)'
                )}
              </Button>

              <div className="text-xs text-muted-foreground space-y-1 mt-2 p-2 border rounded bg-muted/30">
                <p>ℹ️ FIFO Allocation Process:</p>
                <p>• Automatically selects lots with nearest expiration dates</p>
                <p>• Updates inventory balances in real-time</p>
                <p>• Creates audit trail for all transactions</p>
              </div>
            </div>
          </Card>
        </div>

        {/* All Packet Compositions Reference */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Recipe Summary - All Configured Packet Recipes</h3>
          <p className="text-sm text-muted-foreground mb-4">
            View all packet recipes configured for each packet type. These recipes are used during packet building.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {packetCategories.map(cat => {
              const comps = packetCompositions.filter(pc => pc.productCategoryId === cat.id);
              return (
                <div key={cat.id} className="border rounded p-4 hover:bg-muted/50">
                  <h4 className="font-medium mb-2">{cat.categoryName}</h4>
                  {comps.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No recipe configured</p>
                  ) : (
                    <div className="space-y-1">
                      {comps.map(comp => {
                        const item = inventoryItems.find((i: any) => i.id === comp.inventoryItemId);
                        return item ? (
                          <div key={comp.id} className="text-sm text-muted-foreground">
                            • {comp.quantityNeeded}x {item.agPartNumber} - {item.name}
                          </div>
                        ) : comp.componentId ? (
                          <div key={comp.id} className="text-sm text-muted-foreground">
                            • {comp.quantityNeeded}x (Legacy Component)
                          </div>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    );
  };

  const renderConfigureRecipes = () => {
    const handleAddComposition = async (e: React.FormEvent) => {
      e.preventDefault();

      if (!recipePacketType || !recipeInventoryItem || !recipeQuantity) {
        toast({
          title: "Missing Information",
          description: "Please fill in all fields",
          variant: "destructive"
        });
        return;
      }

      try {
        await apiRequest('/api/cutting-table/packet-compositions', {
          method: 'POST',
          body: JSON.stringify({
            productCategoryId: recipePacketType,
            inventoryItemId: parseInt(recipeInventoryItem),
            componentId: null,
            quantityNeeded: parseInt(recipeQuantity),
          }),
        });

        toast({
          title: "Success",
          description: "Inventory item added to packet recipe"
        });

        queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/packet-compositions'] });

        setRecipePartNumber('');
        setRecipeInventoryItem('');
        setRecipeQuantity('');
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to add inventory item to recipe",
          variant: "destructive"
        });
      }
    };

    const handleDeleteComposition = async (compositionId: string) => {
      try {
        await apiRequest(`/api/cutting-table/packet-compositions/${compositionId}`, {
          method: 'DELETE',
        });

        toast({
          title: "Success",
          description: "Inventory item removed from recipe"
        });

        queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/packet-compositions'] });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to remove inventory item",
          variant: "destructive"
        });
      }
    };

    const selectedPacketCompositions = packetCompositions.filter(pc => pc.productCategoryId === recipePacketType);

    return (
      <div className="space-y-6">
        <Card className="p-8" data-testid="configure-recipes">
          <h3 className="text-lg font-semibold mb-6">Configure Packet Recipes</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Define which inventory items and quantities are needed for each packet type. This configuration will be used when building packets to automatically consume inventory.
          </p>

          <form onSubmit={handleAddComposition} className="space-y-6 max-w-2xl">
            <div className="space-y-2">
              <label className="text-sm font-medium">Packet Type *</label>
              <Select value={recipePacketType} onValueChange={setRecipePacketType}>
                <SelectTrigger data-testid="select-packet-type">
                  <SelectValue placeholder="Select packet type" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem 
                      key={cat.id} 
                      value={cat.id}
                      data-testid={`option-packet-${cat.id}`}
                    >
                      {cat.categoryName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Part Number (Quick Entry)</label>
              <Input 
                type="text"
                value={recipePartNumber}
                onChange={(e) => {
                  const partNumber = e.target.value.toUpperCase();
                  setRecipePartNumber(partNumber);
                  
                  // Auto-lookup and select matching inventory item
                  if (partNumber.length > 0) {
                    const matchingItem = inventoryItems.find(
                      (item: any) => item.isPacketPart === true && 
                      item.agPartNumber?.toUpperCase() === partNumber
                    );
                    if (matchingItem) {
                      setRecipeInventoryItem(matchingItem.id.toString());
                    }
                  }
                }}
                placeholder="Type part number (e.g., AG123)"
                data-testid="input-part-number"
                className="uppercase"
              />
              <p className="text-xs text-muted-foreground">
                Type the AG part number to quickly find and select an item
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Packet Part (from Inventory) *</label>
                <Select value={recipeInventoryItem} onValueChange={setRecipeInventoryItem}>
                  <SelectTrigger data-testid="select-inventory-item">
                    <SelectValue placeholder="Select packet part" />
                  </SelectTrigger>
                  <SelectContent>
                    {inventoryItems
                      .filter((item: any) => item.isPacketPart === true)
                      .map((item: any) => (
                        <SelectItem 
                          key={item.id} 
                          value={item.id.toString()}
                          data-testid={`option-item-${item.id}`}
                        >
                          {item.agPartNumber} - {item.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Quantity Needed Per Packet *</label>
                <Input 
                  type="number" 
                  min="1"
                  value={recipeQuantity}
                  onChange={(e) => setRecipeQuantity(e.target.value)}
                  placeholder="Enter quantity"
                  data-testid="input-recipe-quantity"
                />
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full"
              data-testid="button-add-recipe-item"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Item to Recipe
            </Button>
          </form>

          {recipePacketType && (
            <div className="mt-8 pt-6 border-t">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-medium">
                  Current Recipe for {categories.find(c => c.id === recipePacketType)?.categoryName}
                </h4>
                {selectedPacketCompositions.length > 0 && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      if (!confirm(`Delete all ${selectedPacketCompositions.length} item(s) from this recipe?`)) return;
                      
                      try {
                        for (const comp of selectedPacketCompositions) {
                          await apiRequest(`/api/cutting-table/packet-compositions/${comp.id}`, {
                            method: 'DELETE',
                          });
                        }
                        
                        toast({
                          title: "Success",
                          description: "All recipe items deleted"
                        });
                        
                        queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/packet-compositions'] });
                      } catch (error) {
                        toast({
                          title: "Error",
                          description: "Failed to delete recipe items",
                          variant: "destructive"
                        });
                      }
                    }}
                    data-testid="button-clear-recipe"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear All
                  </Button>
                )}
              </div>
              {selectedPacketCompositions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No items configured yet</p>
              ) : (
                <div className="space-y-2">
                  {selectedPacketCompositions.map(comp => {
                    const item = inventoryItems.find((i: any) => i.id === comp.inventoryItemId);
                    return (
                      <div 
                        key={comp.id} 
                        className="flex items-center justify-between p-3 border rounded hover:bg-muted/50"
                        data-testid={`recipe-item-${comp.id}`}
                      >
                        <div className="flex-1">
                          <span className="font-medium">{comp.quantityNeeded}x</span>
                          <span className="ml-2">
                            {item ? `${item.agPartNumber} - ${item.name}` : comp.componentId ? '(Legacy Component)' : 'Unknown Item'}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteComposition(comp.id)}
                          data-testid={`button-delete-recipe-${comp.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    );
  };

  const renderSubmitData = () => {
    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      
      if (!selectedFormLine || !selectedCategory || !quantity) {
        toast({
          title: "Missing Information",
          description: "Please fill in all fields",
          variant: "destructive"
        });
        return;
      }

      try {
        await apiRequest('/api/cutting-table/weekly-data', {
          method: 'POST',
          body: JSON.stringify({
            weekDate: selectedWeek,
            productionLineId: selectedFormLine,
            productCategoryId: selectedCategory,
            quantity: parseInt(quantity),
          }),
        });

        toast({
          title: "Success",
          description: "Weekly production data added successfully"
        });

        // Invalidate cache to refresh the data display
        queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/weekly-data'] });

        // Reset form
        setSelectedFormLine('');
        setSelectedCategory('');
        setQuantity('');
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to submit weekly data",
          variant: "destructive"
        });
      }
    };

    return (
      <Card className="p-8" data-testid="submit-data">
        <h3 className="text-lg font-semibold mb-6">Submit Weekly Production Goals</h3>
        
        <form onSubmit={handleSubmit} className="space-y-6 max-w-md">
          <div className="space-y-2">
            <label className="text-sm font-medium">Week Starting</label>
            <Input 
              type="date" 
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
              data-testid="input-week-date"
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Production Line</label>
            <Select value={selectedFormLine} onValueChange={setSelectedFormLine}>
              <SelectTrigger data-testid="select-production-line">
                <SelectValue placeholder="Select production line" />
              </SelectTrigger>
              <SelectContent>
                {productionLines.map(line => (
                  <SelectItem 
                    key={line.id} 
                    value={line.id}
                    data-testid={`option-line-${line.id}`}
                  >
                    {line.lineName} - {line.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Product Category</label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger data-testid="select-product-category" disabled={!selectedFormLine}>
                <SelectValue placeholder={selectedFormLine ? "Select product category" : "Select production line first"} />
              </SelectTrigger>
              <SelectContent>
                {categories
                  .filter(cat => cat.productionLineId === selectedFormLine)
                  .map(cat => (
                    <SelectItem 
                      key={cat.id} 
                      value={cat.id}
                      data-testid={`option-category-${cat.id}`}
                    >
                      {cat.categoryName}
                    </SelectItem>
                  ))
                }
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Quantity (Units)</label>
            <Input 
              type="number" 
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Enter quantity"
              data-testid="input-quantity"
              className="w-full"
            />
          </div>

          <Button 
            type="submit" 
            className="w-full"
            data-testid="button-submit-data"
          >
            Submit Production Goal
          </Button>
        </form>

        <div className="mt-8 pt-6 border-t">
          <h4 className="font-medium mb-3">Current Week's Goals</h4>
          {weeklyData.filter(w => w.weekDate === selectedWeek).length === 0 ? (
            <p className="text-sm text-muted-foreground">No goals set for this week yet.</p>
          ) : (
            <div className="space-y-2">
              {weeklyData.filter(w => w.weekDate === selectedWeek).map(week => {
                const line = productionLines.find(l => l.id === week.productionLineId);
                const category = categories.find(c => c.id === week.productCategoryId);
                return (
                  <div 
                    key={week.id} 
                    className="text-sm p-2 bg-muted rounded"
                    data-testid={`current-goal-${week.id}`}
                  >
                    <span className="font-medium">{line?.lineName}</span> - {category?.categoryName}: {week.quantity} units
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    );
  };

  const renderAddFabricForm = () => {
    const handleFabricSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      
      if (!fabricFormLine || !fabricSource || !fabricType || !fabricQuantity) {
        toast({
          title: "Missing Information",
          description: "Please fill in Production Line, Source, Fabric, and Quantity",
          variant: "destructive"
        });
        return;
      }

      try {
        await apiRequest('/api/cutting-table/fabric-inventory', {
          method: 'POST',
          body: JSON.stringify({
            productionLineId: fabricFormLine,
            source: fabricSource,
            fabric: fabricType,
            batchNumber: batchNumber || null,
            internalControlNumber: internalControlNumber || null,
            manufactureDate: manufactureDate || null,
            receivedDate: receivedDate || null,
            expirationDate: expirationDate || null,
            location: location || null,
            conformanceDocumentLink: conformanceDocLink || null,
            quantityInStock: parseInt(fabricQuantity),
            notes: fabricNotes || null,
          }),
        });

        toast({
          title: "Success",
          description: "Fabric inventory added successfully"
        });

        // Invalidate cache to refresh the data display
        queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/fabric-inventory'] });

        // Reset form
        setFabricFormLine('');
        setFabricSource('');
        setFabricType('');
        setBatchNumber('');
        setInternalControlNumber('');
        setManufactureDate('');
        setReceivedDate('');
        setExpirationDate('');
        setLocation('');
        setConformanceDocLink('');
        setFabricQuantity('');
        setFabricNotes('');
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to add fabric inventory",
          variant: "destructive"
        });
      }
    };

    const selectedLine = productionLines.find(l => l.id === fabricFormLine);
    const isP2 = selectedLine?.lineName === 'P2';

    return (
      <Card className="p-8" data-testid="add-fabric-form">
        <h3 className="text-lg font-semibold mb-6">Add Fabric to Inventory</h3>
        
        <form onSubmit={handleFabricSubmit} className="space-y-6 max-w-2xl">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Production Line *</label>
              <Select value={fabricFormLine} onValueChange={setFabricFormLine}>
                <SelectTrigger data-testid="select-fabric-production-line">
                  <SelectValue placeholder="Select production line" />
                </SelectTrigger>
                <SelectContent>
                  {productionLines.map(line => (
                    <SelectItem 
                      key={line.id} 
                      value={line.id}
                      data-testid={`option-fabric-line-${line.id}`}
                    >
                      {line.lineName} - {line.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isP2 && (
                <p className="text-xs text-green-600">✓ Barcode will be auto-generated for P2</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Source *</label>
              <Input 
                type="text" 
                value={fabricSource}
                onChange={(e) => setFabricSource(e.target.value)}
                placeholder="e.g., Hexcel, Toray"
                data-testid="input-fabric-source"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Fabric *</label>
              <Input 
                type="text" 
                value={fabricType}
                onChange={(e) => setFabricType(e.target.value)}
                placeholder="e.g., Carbon Fiber, Fiberglass"
                data-testid="input-fabric-type"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Batch Number</label>
              <Input 
                type="text" 
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                placeholder="Enter batch number"
                data-testid="input-batch-number"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Internal Control/Part Number</label>
              <Input 
                type="text" 
                value={internalControlNumber}
                onChange={(e) => setInternalControlNumber(e.target.value)}
                placeholder="Enter part number"
                data-testid="input-control-number"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Manufacture Date</label>
              <Input 
                type="date" 
                value={manufactureDate}
                onChange={(e) => setManufactureDate(e.target.value)}
                data-testid="input-manufacture-date"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Received Date</label>
              <Input 
                type="date" 
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
                data-testid="input-received-date"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Expiration Date</label>
              <Input 
                type="date" 
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
                data-testid="input-expiration-date"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Location/Freezer #</label>
              <Input 
                type="text" 
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., Freezer 2, Rack A3"
                data-testid="input-location"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Quantity (Rolls/Units) *</label>
              <Input 
                type="number" 
                min="0"
                value={fabricQuantity}
                onChange={(e) => setFabricQuantity(e.target.value)}
                placeholder="Enter quantity"
                data-testid="input-fabric-quantity"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Conformance & Traceability Paperwork Link</label>
            <Input 
              type="url" 
              value={conformanceDocLink}
              onChange={(e) => setConformanceDocLink(e.target.value)}
              placeholder="https://drive.google.com/... or file path"
              data-testid="input-conformance-doc-link"
            />
            <p className="text-xs text-muted-foreground">Enter a link to Google Drive, Dropbox, or internal file system path</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Notes</label>
            <Input 
              type="text" 
              value={fabricNotes}
              onChange={(e) => setFabricNotes(e.target.value)}
              placeholder="Additional notes"
              data-testid="input-fabric-notes"
            />
          </div>

          <Button 
            type="submit" 
            className="w-full"
            data-testid="button-submit-fabric"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Fabric to Inventory
          </Button>
        </form>
      </Card>
    );
  };

  const renderFabricInventory = () => {
    type FabricWithDetails = FabricInventory & { source?: string; fabric?: string; batchNumber?: string; internalControlNumber?: string; barcode?: string; receivedDate?: string; manufactureDate?: string; productionLineId?: string; conformanceDocumentLink?: string };
    const fabricWithDetails = fabricInventory as FabricWithDetails[];

    const getExpirationStatus = (expirationDate: string | null | undefined) => {
      if (!expirationDate) return { label: 'No Expiration', color: 'text-gray-500', bgColor: 'bg-gray-100 dark:bg-gray-800' };
      
      const today = new Date();
      const expDate = new Date(expirationDate);
      const daysUntilExpiration = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysUntilExpiration < 0) return { label: 'Expired', color: 'text-red-700', bgColor: 'bg-red-100 dark:bg-red-900' };
      if (daysUntilExpiration <= 7) return { label: `${daysUntilExpiration}d - Critical`, color: 'text-orange-700', bgColor: 'bg-orange-100 dark:bg-orange-900' };
      if (daysUntilExpiration <= 30) return { label: `${daysUntilExpiration}d - Soon`, color: 'text-yellow-700', bgColor: 'bg-yellow-100 dark:bg-yellow-900' };
      return { label: `${daysUntilExpiration}d - OK`, color: 'text-green-700', bgColor: 'bg-green-100 dark:bg-green-900' };
    };

    const sortedInventory = [...fabricWithDetails].sort((a, b) => {
      if (inventorySortBy === 'fabric') {
        return (a.fabric || '').localeCompare(b.fabric || '');
      } else if (inventorySortBy === 'expiration') {
        if (!a.expirationDate && !b.expirationDate) return 0;
        if (!a.expirationDate) return 1;
        if (!b.expirationDate) return -1;
        return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
      } else if (inventorySortBy === 'quantity') {
        return a.quantityInStock - b.quantityInStock;
      }
      return 0;
    });

    const fabricTypes = Array.from(new Set(fabricWithDetails.map(item => item.fabric).filter(Boolean)));
    const totalQuantity = fabricWithDetails.reduce((sum, item) => sum + item.quantityInStock, 0);

    return (
      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold">Fabric Inventory Overview</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {fabricTypes.length} fabric types • {fabricWithDetails.length} lots • {totalQuantity} units total
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Sort by:</label>
              <Select value={inventorySortBy} onValueChange={(v) => setInventorySortBy(v as any)}>
                <SelectTrigger className="w-[160px]" data-testid="select-inventory-sort">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expiration">Expiration (FIFO)</SelectItem>
                  <SelectItem value="fabric">Fabric Type</SelectItem>
                  <SelectItem value="quantity">Quantity</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {fabricWithDetails.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No fabric inventory data available. Use the "Add Fabric" tab to add inventory.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 text-sm font-medium">Line</th>
                    <th className="text-left p-2 text-sm font-medium">Fabric Type</th>
                    <th className="text-left p-2 text-sm font-medium">Source</th>
                    <th className="text-left p-2 text-sm font-medium">Batch/Control</th>
                    <th className="text-left p-2 text-sm font-medium">Location</th>
                    <th className="text-right p-2 text-sm font-medium">Qty on Hand</th>
                    <th className="text-left p-2 text-sm font-medium">Received</th>
                    <th className="text-left p-2 text-sm font-medium">Expiration Status</th>
                    <th className="text-left p-2 text-sm font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedInventory.map(item => {
                    const line = productionLines.find(l => l.id === item.productionLineId);
                    const isLowStock = item.quantityInStock <= item.lowStockThreshold;
                    const expirationStatus = getExpirationStatus(item.expirationDate);

                    return (
                      <tr 
                        key={item.id} 
                        className="border-b hover:bg-muted/50"
                        data-testid={`inventory-item-${item.id}`}
                      >
                        <td className="p-2 text-sm">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${line?.lineName === 'P2' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'}`}>
                            {line?.lineName || '-'}
                          </span>
                        </td>
                        <td className="p-2 text-sm font-medium">{item.fabric || '-'}</td>
                        <td className="p-2 text-sm text-muted-foreground">{item.source || '-'}</td>
                        <td className="p-2 text-sm text-muted-foreground">
                          {item.batchNumber && <div className="text-xs">B: {item.batchNumber}</div>}
                          {item.internalControlNumber && <div className="text-xs">C: {item.internalControlNumber}</div>}
                          {!item.batchNumber && !item.internalControlNumber && '-'}
                        </td>
                        <td className="p-2 text-sm">{item.location || '-'}</td>
                        <td className="p-2 text-right">
                          <span className={`font-bold text-lg ${isLowStock ? 'text-red-600' : 'text-foreground'}`} data-testid={`text-stock-${item.id}`}>
                            {item.quantityInStock}
                          </span>
                          {isLowStock && <div className="text-xs text-red-600">⚠ Low Stock</div>}
                        </td>
                        <td className="p-2 text-sm text-muted-foreground">
                          {item.receivedDate ? new Date(item.receivedDate).toLocaleDateString() : '-'}
                        </td>
                        <td className="p-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${expirationStatus.color} ${expirationStatus.bgColor}`}>
                            {expirationStatus.label}
                          </span>
                          {item.expirationDate && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {new Date(item.expirationDate).toLocaleDateString()}
                            </div>
                          )}
                        </td>
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingFabric(item);
                                setEditDialogOpen(true);
                              }}
                              data-testid={`button-edit-fabric-${item.id}`}
                              className="flex items-center gap-1 text-xs"
                            >
                              <Edit className="w-3 h-3" />
                              Edit
                            </Button>
                            {item.barcode && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(`/api/cutting-table/fabric-inventory/${item.id}/print-barcode`, '_blank')}
                                data-testid={`button-print-barcode-${item.id}`}
                                className="flex items-center gap-1 text-xs"
                              >
                                <Printer className="w-3 h-3" />
                                Print
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Edit Fabric Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Fabric Inventory</DialogTitle>
            </DialogHeader>
            {editingFabric && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await apiRequest(`/api/cutting-table/fabric-inventory/${editingFabric.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify(editingFabric),
                    });
                    
                    toast({
                      title: "Success",
                      description: "Fabric inventory updated successfully"
                    });
                    
                    setEditDialogOpen(false);
                    setEditingFabric(null);
                    queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/fabric-inventory'] });
                  } catch (error) {
                    toast({
                      title: "Error",
                      description: "Failed to update fabric inventory",
                      variant: "destructive"
                    });
                  }
                }}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Quantity in Stock *</label>
                    <Input
                      type="number"
                      value={editingFabric.quantityInStock}
                      onChange={(e) => setEditingFabric({ ...editingFabric, quantityInStock: parseInt(e.target.value) || 0 })}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Low Stock Threshold</label>
                    <Input
                      type="number"
                      value={editingFabric.lowStockThreshold}
                      onChange={(e) => setEditingFabric({ ...editingFabric, lowStockThreshold: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Location</label>
                  <Input
                    type="text"
                    value={editingFabric.location || ''}
                    onChange={(e) => setEditingFabric({ ...editingFabric, location: e.target.value })}
                    placeholder="e.g., Warehouse A, Shelf 3"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Received Date</label>
                    <Input
                      type="date"
                      value={editingFabric.receivedDate || ''}
                      onChange={(e) => setEditingFabric({ ...editingFabric, receivedDate: e.target.value })}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Expiration Date</label>
                    <Input
                      type="date"
                      value={editingFabric.expirationDate || ''}
                      onChange={(e) => setEditingFabric({ ...editingFabric, expirationDate: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Notes</label>
                  <Input
                    type="text"
                    value={editingFabric.notes || ''}
                    onChange={(e) => setEditingFabric({ ...editingFabric, notes: e.target.value })}
                    placeholder="Additional notes"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditDialogOpen(false);
                      setEditingFabric(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">
                    Save Changes
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  const renderCutManagement = () => {
    const [cutFormData, setCutFormData] = useState({
      workDate: new Date().toISOString().split('T')[0],
      productCategoryId: '',
      piecesYielded: '',
      fabricSquareMetersUsed: '',
      notes: '',
    });

    const { data: cutRecords = [], isLoading: recordsLoading, refetch: refetchCutRecords } = useQuery({
      queryKey: ['/api/cutting-table/cut-records'],
    });

    const createCutRecordMutation = useMutation({
      mutationFn: async (data: any) => {
        const response = await apiRequest('/api/cutting-table/cut-records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        return response;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/cut-records'] });
        refetchCutRecords();
        setCutFormData({
          workDate: new Date().toISOString().split('T')[0],
          productCategoryId: '',
          piecesYielded: '',
          fabricSquareMetersUsed: '',
          notes: '',
        });
        toast({ title: 'Success', description: 'Cut record added successfully' });
      },
      onError: (error: Error) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to add cut record',
          variant: 'destructive',
        });
      },
    });

    const deleteCutRecordMutation = useMutation({
      mutationFn: async (id: string) => {
        await apiRequest(`/api/cutting-table/cut-records/${id}`, { method: 'DELETE' });
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/cut-records'] });
        refetchCutRecords();
        toast({ title: 'Success', description: 'Cut record deleted successfully' });
      },
      onError: (error: Error) => {
        toast({ 
          title: 'Error', 
          description: error.message || 'Failed to delete cut record',
          variant: 'destructive',
        });
      },
    });

    const handleSubmitCutRecord = (e: React.FormEvent) => {
      e.preventDefault();

      if (!cutFormData.productCategoryId || !cutFormData.piecesYielded || !cutFormData.fabricSquareMetersUsed) {
        toast({
          title: 'Validation Error',
          description: 'Please fill in all required fields',
          variant: 'destructive',
        });
        return;
      }

      createCutRecordMutation.mutate({
        workDate: cutFormData.workDate,
        productCategoryId: cutFormData.productCategoryId,
        piecesYielded: parseInt(cutFormData.piecesYielded),
        fabricSquareMetersUsed: parseFloat(cutFormData.fabricSquareMetersUsed),
        notes: cutFormData.notes || null,
      });
    };

    return (
      <div className="space-y-6">
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">Record Cut Performance</h2>
          <form onSubmit={handleSubmitCutRecord} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Work Date *</label>
                <Input
                  type="date"
                  value={cutFormData.workDate}
                  onChange={(e) => setCutFormData({ ...cutFormData, workDate: e.target.value })}
                  required
                  data-testid="input-work-date"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Product Category *</label>
                <Select
                  value={cutFormData.productCategoryId}
                  onValueChange={(value) => setCutFormData({ ...cutFormData, productCategoryId: value })}
                >
                  <SelectTrigger data-testid="select-product-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat: any) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.categoryName} (P{cat.productionLineId})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Pieces Yielded *</label>
                <Input
                  type="number"
                  min="0"
                  value={cutFormData.piecesYielded}
                  onChange={(e) => setCutFormData({ ...cutFormData, piecesYielded: e.target.value })}
                  placeholder="Number of pieces cut"
                  required
                  data-testid="input-pieces-yielded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Fabric Used (m²) *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cutFormData.fabricSquareMetersUsed}
                  onChange={(e) => setCutFormData({ ...cutFormData, fabricSquareMetersUsed: e.target.value })}
                  placeholder="Square meters of fabric"
                  required
                  data-testid="input-fabric-used"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Notes</label>
              <textarea
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={cutFormData.notes}
                onChange={(e) => setCutFormData({ ...cutFormData, notes: e.target.value })}
                placeholder="Optional notes about this cut"
                data-testid="textarea-notes"
              />
            </div>

            <Button 
              type="submit" 
              disabled={createCutRecordMutation.isPending}
              data-testid="button-submit-cut-record"
            >
              {createCutRecordMutation.isPending ? 'Saving...' : 'Record Cut'}
            </Button>
          </form>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">Cut Records History</h2>
          {recordsLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : cutRecords.length === 0 ? (
            <p className="text-muted-foreground text-center p-8">No cut records found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Category</th>
                    <th className="text-right p-2">Pieces</th>
                    <th className="text-right p-2">Fabric (m²)</th>
                    <th className="text-right p-2">Yield/m²</th>
                    <th className="text-left p-2">Notes</th>
                    <th className="text-right p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cutRecords.map((record: any) => {
                    const category = categories.find((c: any) => c.id === record.productCategoryId);
                    const yieldPerSqM = record.fabricSquareMetersUsed > 0 
                      ? (record.piecesYielded / record.fabricSquareMetersUsed).toFixed(2)
                      : 'N/A';
                    
                    return (
                      <tr key={record.id} className="border-b hover:bg-muted/50">
                        <td className="p-2">{new Date(record.workDate).toLocaleDateString()}</td>
                        <td className="p-2">{category?.categoryName || 'Unknown'}</td>
                        <td className="p-2 text-right">{record.piecesYielded}</td>
                        <td className="p-2 text-right">{record.fabricSquareMetersUsed.toFixed(2)}</td>
                        <td className="p-2 text-right font-semibold">{yieldPerSqM}</td>
                        <td className="p-2 text-sm text-muted-foreground">{record.notes || '-'}</td>
                        <td className="p-2 text-right">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this cut record?')) {
                                deleteCutRecordMutation.mutate(record.id);
                              }
                            }}
                            disabled={deleteCutRecordMutation.isPending}
                            data-testid={`button-delete-${record.id}`}
                          >
                            Delete
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  // Show initialization prompt if no production lines exist
  if (productionLines.length === 0 && !isLoading) {
    return (
      <div className="container mx-auto p-6" data-testid="cutting-table-page">
        <h1 className="text-3xl font-bold mb-6" data-testid="text-page-title">Cutting Table</h1>
        <Card className="p-8 text-center">
          <h3 className="text-xl font-semibold mb-4">Initialize Cutting Table</h3>
          <p className="text-muted-foreground mb-6">
            Click the button below to set up the production lines (P1 and P2) and product categories.
          </p>
          <Button 
            onClick={() => initializeMutation.mutate()}
            disabled={initializeMutation.isPending}
            data-testid="button-initialize"
          >
            {initializeMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Initializing...
              </>
            ) : (
              'Initialize Production Lines & Categories'
            )}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6" data-testid="cutting-table-page">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold" data-testid="text-page-title">Cutting Table</h1>
        {productionLines.length > 0 && categories.length === 0 && (
          <Button 
            onClick={() => initializeMutation.mutate()}
            variant="outline"
            size="sm"
            disabled={initializeMutation.isPending}
            data-testid="button-reinitialize"
          >
            {initializeMutation.isPending ? 'Initializing...' : 'Reinitialize Categories'}
          </Button>
        )}
      </div>

      <Tabs defaultValue="dashboard" className="w-full" data-testid="tabs-main">
        <TabsList className="grid w-full grid-cols-10" data-testid="tabs-list">
          <TabsTrigger value="dashboard" data-testid="tab-dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="daily" data-testid="tab-daily">Daily Tracker</TabsTrigger>
          <TabsTrigger value="weekly" data-testid="tab-weekly">Weekly Report</TabsTrigger>
          <TabsTrigger value="projections" data-testid="tab-projections">Projections</TabsTrigger>
          <TabsTrigger value="packetMgmt" data-testid="tab-packet-mgmt">Packet Mgmt</TabsTrigger>
          <TabsTrigger value="configRecipes" data-testid="tab-config-recipes">Configure Recipes</TabsTrigger>
          <TabsTrigger value="submit" data-testid="tab-submit">Submit Data</TabsTrigger>
          <TabsTrigger value="addFabric" data-testid="tab-add-fabric">Add Fabric</TabsTrigger>
          <TabsTrigger value="inventory" data-testid="tab-inventory">Inventory</TabsTrigger>
          <TabsTrigger value="cutManagement" data-testid="tab-cut-management">Cut Mgmt</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-6" data-testid="content-dashboard">
          {renderDashboard()}
        </TabsContent>

        <TabsContent value="daily" className="mt-6" data-testid="content-daily">
          {renderDailyTracker()}
        </TabsContent>

        <TabsContent value="weekly" className="mt-6" data-testid="content-weekly">
          {renderWeeklyReport()}
        </TabsContent>

        <TabsContent value="projections" className="mt-6" data-testid="content-projections">
          {renderProjections()}
        </TabsContent>

        <TabsContent value="packetMgmt" className="mt-6" data-testid="content-packet-mgmt">
          {renderPacketManagement()}
        </TabsContent>

        <TabsContent value="configRecipes" className="mt-6" data-testid="content-config-recipes">
          {renderConfigureRecipes()}
        </TabsContent>

        <TabsContent value="submit" className="mt-6" data-testid="content-submit">
          {renderSubmitData()}
        </TabsContent>

        <TabsContent value="addFabric" className="mt-6" data-testid="content-add-fabric">
          {renderAddFabricForm()}
        </TabsContent>

        <TabsContent value="inventory" className="mt-6" data-testid="content-inventory">
          {renderFabricInventory()}
        </TabsContent>

        <TabsContent value="cutManagement" className="mt-6" data-testid="content-cut-management">
          {renderCutManagement()}
        </TabsContent>
      </Tabs>
    </div>
  );
}
