/**
 * Algorithmic Scheduler Component
 * Provides intelligent order scheduling based on stock model categorization and priority scoring
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { 
  Zap, 
  Target, 
  Calendar, 
  TrendingUp, 
  BarChart3, 
  Settings, 
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Info
} from 'lucide-react';

interface AlgorithmicSchedulerProps {
  onScheduleGenerated?: (allocations: any[]) => void;
  currentOrderCount?: number;
  workDays?: number[];
}

interface ScheduleAnalytics {
  totalOrders: number;
  scheduledOrders: number;
  efficiency: number;
  moldUtilization: { [moldId: string]: number };
  dailyCapacity: number;
  scheduleDays: number;
}

interface StockModelGroup {
  stockModelId: string;
  orderCount: number;
  urgentCount: number;
}

export default function AlgorithmicScheduler({ 
  onScheduleGenerated, 
  currentOrderCount = 0,
  workDays = [1, 2, 3, 4]
}: AlgorithmicSchedulerProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [analytics, setAnalytics] = useState<ScheduleAnalytics | null>(null);
  const [stockModelGroups, setStockModelGroups] = useState<StockModelGroup[]>([]);
  const [lastGenerated, setLastGenerated] = useState<Date | null>(null);
  
  // Configuration parameters
  const [stockModelFilter, setStockModelFilter] = useState('');
  const [maxOrdersPerDay, setMaxOrdersPerDay] = useState(20);
  const [scheduleDays, setScheduleDays] = useState(20);
  const [priorityWeighting, setPriorityWeighting] = useState('balanced');
  
  const { toast } = useToast();

  const generateAlgorithmicSchedule = async () => {
    if (isGenerating) return;
    
    setIsGenerating(true);
    try {
      console.log('🔄 Generating algorithmic schedule...');
      
      const response = await apiRequest('/api/scheduler/generate-algorithmic-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          stockModelFilter: stockModelFilter.trim() || undefined,
          maxOrdersPerDay,
          scheduleDays,
          priorityWeighting,
          workDays: workDays
        }
      });

      if (response.success) {
        console.log(`✅ Generated ${response.allocations.length} schedule allocations`);
        
        setAnalytics(response.analytics);
        setStockModelGroups(response.stockModelGroups || []);
        setLastGenerated(new Date());
        
        // Pass allocations back to parent component
        if (onScheduleGenerated) {
          onScheduleGenerated(response.allocations);
        }
        
        toast({
          title: "Schedule Generated Successfully",
          description: `Created ${response.allocations.length} order allocations with ${response.analytics.efficiency.toFixed(1)}% efficiency`,
        });
      } else {
        throw new Error(response.error || 'Failed to generate schedule');
      }
    } catch (error) {
      console.error('🔄 Schedule generation error:', error);
      toast({
        title: "Schedule Generation Failed", 
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const getEfficiencyColor = (efficiency: number) => {
    if (efficiency >= 90) return 'text-green-600';
    if (efficiency >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getEfficiencyIcon = (efficiency: number) => {
    if (efficiency >= 90) return <CheckCircle className="w-4 h-4 text-green-600" />;
    if (efficiency >= 70) return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
    return <AlertTriangle className="w-4 h-4 text-red-600" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-blue-600" />
            Algorithmic Scheduler
          </h2>
          <p className="text-gray-600 mt-1">
            Intelligent order allocation by stock model categorization and priority scoring
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {lastGenerated && (
            <div className="text-sm text-gray-500">
              Last generated: {lastGenerated.toLocaleTimeString()}
            </div>
          )}
          <Button 
            onClick={generateAlgorithmicSchedule}
            disabled={isGenerating}
            size="lg"
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Generate Schedule
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Configuration Parameters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Algorithm Parameters
          </CardTitle>
          <CardDescription>
            Configure the scheduling algorithm behavior
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="stockModelFilter">Stock Model Filter</Label>
              <Input
                id="stockModelFilter"
                placeholder="e.g. Mesa, CF, FG"
                value={stockModelFilter}
                onChange={(e) => setStockModelFilter(e.target.value)}
                disabled={isGenerating}
              />
              <p className="text-xs text-gray-500">Leave empty for all models</p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="maxOrdersPerDay">Max Orders/Day</Label>
              <Input
                id="maxOrdersPerDay"
                type="number"
                min="1"
                max="100"
                value={maxOrdersPerDay}
                onChange={(e) => setMaxOrdersPerDay(parseInt(e.target.value) || 20)}
                disabled={isGenerating}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="scheduleDays">Schedule Days</Label>
              <Input
                id="scheduleDays"
                type="number"
                min="5"
                max="60"
                value={scheduleDays}
                onChange={(e) => setScheduleDays(parseInt(e.target.value) || 20)}
                disabled={isGenerating}
              />
              <p className="text-xs text-gray-500">Mon-Thu work days only</p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="priorityWeighting">Priority Weighting</Label>
              <Select 
                value={priorityWeighting} 
                onValueChange={setPriorityWeighting}
                disabled={isGenerating}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">Urgent First</SelectItem>
                  <SelectItem value="balanced">Balanced</SelectItem>
                  <SelectItem value="capacity">Capacity Optimized</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Analytics Dashboard */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Orders</p>
                  <p className="text-2xl font-bold">{analytics.totalOrders}</p>
                </div>
                <Target className="w-8 h-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Scheduled</p>
                  <p className="text-2xl font-bold">{analytics.scheduledOrders}</p>
                </div>
                <Calendar className="w-8 h-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Efficiency</p>
                  <p className={`text-2xl font-bold ${getEfficiencyColor(analytics.efficiency)}`}>
                    {analytics.efficiency.toFixed(1)}%
                  </p>
                </div>
                {getEfficiencyIcon(analytics.efficiency)}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Daily Capacity</p>
                  <p className="text-2xl font-bold">{analytics.dailyCapacity}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Stock Model Groups */}
      {stockModelGroups.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Stock Model Analysis
            </CardTitle>
            <CardDescription>
              Order distribution by stock model category
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stockModelGroups.map((group) => (
                <div 
                  key={group.stockModelId}
                  className="p-4 border rounded-lg bg-gray-50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold">{group.stockModelId}</h4>
                    {group.urgentCount > 0 && (
                      <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                        {group.urgentCount} urgent
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>{group.orderCount} orders</span>
                    <span className="flex items-center gap-1">
                      <Info className="w-3 h-3" />
                      {((group.orderCount / analytics!.totalOrders) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Algorithm Status */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isGenerating ? 'bg-yellow-500 animate-pulse' : analytics ? 'bg-green-500' : 'bg-gray-400'}`} />
            <div>
              <p className="font-medium">
                {isGenerating 
                  ? 'Generating algorithmic schedule...' 
                  : analytics 
                    ? 'Algorithm ready - schedule generated successfully'
                    : 'Ready to generate algorithmic schedule'
                }
              </p>
              <p className="text-sm text-gray-600">
                {currentOrderCount > 0 && `${currentOrderCount} orders in production queue`}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}