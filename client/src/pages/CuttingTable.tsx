import { useState } from "react";
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

        // Reset form
        setSelectedFormLine('');
        setSelectedCategory('');
        setQuantity('');

        // Refetch data
        queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/weekly-data'] });
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
              <SelectTrigger data-testid="select-product-category">
                <SelectValue placeholder="Select product category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map(cat => (
                  <SelectItem 
                    key={cat.id} 
                    value={cat.id}
                    data-testid={`option-category-${cat.id}`}
                  >
                    {cat.categoryName}
                  </SelectItem>
                ))}
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

  const renderFabricInventory = () => (
    <Card className="p-8" data-testid="fabric-inventory">
      <h3 className="text-lg font-semibold mb-4">Fabric Inventory</h3>
      {fabricInventory.length === 0 ? (
        <p className="text-muted-foreground">No fabric inventory data available.</p>
      ) : (
        <div className="space-y-4">
          {fabricInventory.map(item => {
            const material = materials.find(m => m.id === item.materialId);
            const isLowStock = item.quantityInStock <= item.lowStockThreshold;

            return (
              <div 
                key={item.id} 
                className={`p-4 border rounded-lg ${isLowStock ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : ''}`}
                data-testid={`inventory-item-${item.id}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">{material?.materialName}</h4>
                    {item.lotNumber && <p className="text-sm text-muted-foreground">Lot: {item.lotNumber}</p>}
                    {item.location && <p className="text-sm text-muted-foreground">Location: {item.location}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold" data-testid={`text-stock-${item.id}`}>
                      {item.quantityInStock} in stock
                    </p>
                    {isLowStock && (
                      <span className="text-xs text-red-600 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Low Stock
                      </span>
                    )}
                  </div>
                </div>
                {item.expirationDate && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Expires: {new Date(item.expirationDate).toLocaleDateString()}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );

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
        <TabsList className="grid w-full grid-cols-6" data-testid="tabs-list">
          <TabsTrigger value="dashboard" data-testid="tab-dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="daily" data-testid="tab-daily">Daily Tracker</TabsTrigger>
          <TabsTrigger value="weekly" data-testid="tab-weekly">Weekly Report</TabsTrigger>
          <TabsTrigger value="projections" data-testid="tab-projections">Projections</TabsTrigger>
          <TabsTrigger value="submit" data-testid="tab-submit">Submit Data</TabsTrigger>
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

        <TabsContent value="inventory" className="mt-6" data-testid="content-inventory">
          {renderFabricInventory()}
        </TabsContent>
      </Tabs>
    </div>
  );
}
