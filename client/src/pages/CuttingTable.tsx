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
import { Loader2, Plus, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
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
  productCategoryId: string;
  componentName: string;
  materialId: string;
  requiredQuantity: number;
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

  // Form state for Add Fabric Inventory tab
  const [fabricFormLine, setFabricFormLine] = useState('');
  const [fabricBrand, setFabricBrand] = useState('');
  const [fabricType, setFabricType] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [internalControlNumber, setInternalControlNumber] = useState('');
  const [manufactureDate, setManufactureDate] = useState('');
  const [receivedDate, setReceivedDate] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [location, setLocation] = useState('');
  const [fabricQuantity, setFabricQuantity] = useState('');
  const [fabricNotes, setFabricNotes] = useState('');

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

  const { data: weeklyData = [], isLoading: loadingWeekly } = useQuery<WeeklyData[]>({
    queryKey: ['/api/cutting-table/weekly-data/by-week', currentWeek],
  });

  const { data: cutProgress = [], isLoading: loadingProgress } = useQuery<CutProgress[]>({
    queryKey: ['/api/cutting-table/cut-progress/by-week', currentWeek],
  });

  const { data: fabricInventory = [], isLoading: loadingInventory } = useQuery<FabricInventory[]>({
    queryKey: ['/api/cutting-table/fabric-inventory'],
  });

  const isLoading = loadingMaterials || loadingLines || loadingCategories || loadingComponents || loadingWeekly || loadingProgress || loadingInventory;

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
      
      if (!fabricFormLine || !fabricBrand || !fabricType || !fabricQuantity) {
        toast({
          title: "Missing Information",
          description: "Please fill in Production Line, Brand, Fabric, and Quantity",
          variant: "destructive"
        });
        return;
      }

      try {
        await apiRequest('/api/cutting-table/fabric-inventory', {
          method: 'POST',
          body: JSON.stringify({
            productionLineId: fabricFormLine,
            brand: fabricBrand,
            fabric: fabricType,
            batchNumber: batchNumber || null,
            internalControlNumber: internalControlNumber || null,
            manufactureDate: manufactureDate || null,
            receivedDate: receivedDate || null,
            expirationDate: expirationDate || null,
            location: location || null,
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
        setFabricBrand('');
        setFabricType('');
        setBatchNumber('');
        setInternalControlNumber('');
        setManufactureDate('');
        setReceivedDate('');
        setExpirationDate('');
        setLocation('');
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
              <label className="text-sm font-medium">Brand *</label>
              <Input 
                type="text" 
                value={fabricBrand}
                onChange={(e) => setFabricBrand(e.target.value)}
                placeholder="e.g., Hexcel, Toray"
                data-testid="input-fabric-brand"
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
    type FabricWithDetails = FabricInventory & { brand?: string; fabric?: string; batchNumber?: string; internalControlNumber?: string; barcode?: string; receivedDate?: string; manufactureDate?: string; productionLineId?: string };
    const fabricWithDetails = fabricInventory as FabricWithDetails[];

    return (
      <Card className="p-8" data-testid="fabric-inventory">
        <h3 className="text-lg font-semibold mb-4">Fabric Inventory</h3>
        {fabricWithDetails.length === 0 ? (
          <p className="text-muted-foreground">No fabric inventory data available. Use the "Add Fabric" tab to add inventory.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 text-sm font-medium">Production Line</th>
                  <th className="text-left p-2 text-sm font-medium">Brand</th>
                  <th className="text-left p-2 text-sm font-medium">Fabric</th>
                  <th className="text-left p-2 text-sm font-medium">Batch #</th>
                  <th className="text-left p-2 text-sm font-medium">Control #</th>
                  <th className="text-left p-2 text-sm font-medium">Barcode</th>
                  <th className="text-left p-2 text-sm font-medium">Location</th>
                  <th className="text-left p-2 text-sm font-medium">Qty</th>
                  <th className="text-left p-2 text-sm font-medium">Received</th>
                  <th className="text-left p-2 text-sm font-medium">Expires</th>
                </tr>
              </thead>
              <tbody>
                {fabricWithDetails.map(item => {
                  const line = productionLines.find(l => l.id === item.productionLineId);
                  const isLowStock = item.quantityInStock <= item.lowStockThreshold;

                  return (
                    <tr 
                      key={item.id} 
                      className={`border-b hover:bg-muted/50 ${isLowStock ? 'bg-red-50 dark:bg-red-900/10' : ''}`}
                      data-testid={`inventory-item-${item.id}`}
                    >
                      <td className="p-2 text-sm">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${line?.lineName === 'P2' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                          {line?.lineName || '-'}
                        </span>
                      </td>
                      <td className="p-2 text-sm">{item.brand || '-'}</td>
                      <td className="p-2 text-sm">{item.fabric || '-'}</td>
                      <td className="p-2 text-sm">{item.batchNumber || '-'}</td>
                      <td className="p-2 text-sm">{item.internalControlNumber || '-'}</td>
                      <td className="p-2 text-sm font-mono text-xs">
                        {item.barcode ? (
                          <span className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded" data-testid={`barcode-${item.id}`}>
                            {item.barcode}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="p-2 text-sm">{item.location || '-'}</td>
                      <td className="p-2 text-sm">
                        <span className={`font-semibold ${isLowStock ? 'text-red-600' : ''}`} data-testid={`text-stock-${item.id}`}>
                          {item.quantityInStock}
                        </span>
                        {isLowStock && <span className="text-xs text-red-600 ml-1">⚠</span>}
                      </td>
                      <td className="p-2 text-sm">
                        {item.receivedDate ? new Date(item.receivedDate).toLocaleDateString() : '-'}
                      </td>
                      <td className="p-2 text-sm">
                        {item.expirationDate ? new Date(item.expirationDate).toLocaleDateString() : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
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
        <TabsList className="grid w-full grid-cols-7" data-testid="tabs-list">
          <TabsTrigger value="dashboard" data-testid="tab-dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="daily" data-testid="tab-daily">Daily Tracker</TabsTrigger>
          <TabsTrigger value="weekly" data-testid="tab-weekly">Weekly Report</TabsTrigger>
          <TabsTrigger value="projections" data-testid="tab-projections">Projections</TabsTrigger>
          <TabsTrigger value="submit" data-testid="tab-submit">Submit Data</TabsTrigger>
          <TabsTrigger value="addFabric" data-testid="tab-add-fabric">Add Fabric</TabsTrigger>
          <TabsTrigger value="inventory" data-testid="tab-inventory">Inventory</TabsTrigger>
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

        <TabsContent value="submit" className="mt-6" data-testid="content-submit">
          {renderSubmitData()}
        </TabsContent>

        <TabsContent value="addFabric" className="mt-6" data-testid="content-add-fabric">
          {renderAddFabricForm()}
        </TabsContent>

        <TabsContent value="inventory" className="mt-6" data-testid="content-inventory">
          {renderFabricInventory()}
        </TabsContent>
      </Tabs>
    </div>
  );
}
