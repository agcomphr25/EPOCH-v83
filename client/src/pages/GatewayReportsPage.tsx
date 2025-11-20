import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronLeft, ChevronRight, Save, TrendingUp } from 'lucide-react';
import { format, startOfWeek, addWeeks, subWeeks, addDays } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface WeeklyData {
  buttpadsMonday: number;
  buttpadsTuesday: number;
  buttpadsWednesday: number;
  buttpadsThursday: number;
  buttpadsFriday: number;
  sandblastingMonday: number;
  sandblastingTuesday: number;
  sandblastingWednesday: number;
  sandblastingThursday: number;
  sandblastingFriday: number;
  textureMonday: number;
  textureTuesday: number;
  textureWednesday: number;
  textureThursday: number;
  textureFriday: number;
  duratecMonday: number;
  duratecTuesday: number;
  duratecWednesday: number;
  duratecThursday: number;
  duratecFriday: number;
}

export default function GatewayReportsPage() {
  const { toast } = useToast();
  const [currentWeek, setCurrentWeek] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [formData, setFormData] = useState<WeeklyData>({
    buttpadsMonday: 0,
    buttpadsTuesday: 0,
    buttpadsWednesday: 0,
    buttpadsThursday: 0,
    buttpadsFriday: 0,
    sandblastingMonday: 0,
    sandblastingTuesday: 0,
    sandblastingWednesday: 0,
    sandblastingThursday: 0,
    sandblastingFriday: 0,
    textureMonday: 0,
    textureTuesday: 0,
    textureWednesday: 0,
    textureThursday: 0,
    textureFriday: 0,
    duratecMonday: 0,
    duratecTuesday: 0,
    duratecWednesday: 0,
    duratecThursday: 0,
    duratecFriday: 0,
  });

  const weekStartDate = format(currentWeek, 'yyyy-MM-dd');

  // Fetch current week's data
  const { data: weekData } = useQuery({
    queryKey: [`/api/gateway-reports/week/${weekStartDate}`],
  });

  // Fetch trends data (6 months)
  const { data: trendsData = [] } = useQuery({
    queryKey: ['/api/gateway-reports/trends'],
  });

  // Update form when week data changes
  useEffect(() => {
    if (weekData && weekData.id) {
      setFormData({
        buttpadsMonday: weekData.buttpadsMonday || 0,
        buttpadsTuesday: weekData.buttpadsTuesday || 0,
        buttpadsWednesday: weekData.buttpadsWednesday || 0,
        buttpadsThursday: weekData.buttpadsThursday || 0,
        buttpadsFriday: weekData.buttpadsFriday || 0,
        sandblastingMonday: weekData.sandblastingMonday || 0,
        sandblastingTuesday: weekData.sandblastingTuesday || 0,
        sandblastingWednesday: weekData.sandblastingWednesday || 0,
        sandblastingThursday: weekData.sandblastingThursday || 0,
        sandblastingFriday: weekData.sandblastingFriday || 0,
        textureMonday: weekData.textureMonday || 0,
        textureTuesday: weekData.textureTuesday || 0,
        textureWednesday: weekData.textureWednesday || 0,
        textureThursday: weekData.textureThursday || 0,
        textureFriday: weekData.textureFriday || 0,
        duratecMonday: weekData.duratecMonday || 0,
        duratecTuesday: weekData.duratecTuesday || 0,
        duratecWednesday: weekData.duratecWednesday || 0,
        duratecThursday: weekData.duratecThursday || 0,
        duratecFriday: weekData.duratecFriday || 0,
      });
    } else {
      // Reset form for new week
      setFormData({
        buttpadsMonday: 0,
        buttpadsTuesday: 0,
        buttpadsWednesday: 0,
        buttpadsThursday: 0,
        buttpadsFriday: 0,
        sandblastingMonday: 0,
        sandblastingTuesday: 0,
        sandblastingWednesday: 0,
        sandblastingThursday: 0,
        sandblastingFriday: 0,
        textureMonday: 0,
        textureTuesday: 0,
        textureWednesday: 0,
        textureThursday: 0,
        textureFriday: 0,
        duratecMonday: 0,
        duratecTuesday: 0,
        duratecWednesday: 0,
        duratecThursday: 0,
        duratecFriday: 0,
      });
    }
  }, [weekData, weekStartDate]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('/api/gateway-reports', {
        method: 'POST',
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/gateway-reports/week/${weekStartDate}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/gateway-reports/trends'] });
      toast({
        title: 'Success',
        description: 'Gateway report saved successfully',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to save gateway report',
        variant: 'destructive',
      });
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      weekStartDate,
      ...formData,
    });
  };

  const handleInputChange = (field: keyof WeeklyData, value: string) => {
    const numValue = parseInt(value) || 0;
    setFormData(prev => ({ ...prev, [field]: numValue }));
  };

  const goToPreviousWeek = () => {
    setCurrentWeek(prev => subWeeks(prev, 1));
  };

  const goToNextWeek = () => {
    setCurrentWeek(prev => addWeeks(prev, 1));
  };

  const goToCurrentWeek = () => {
    setCurrentWeek(startOfWeek(new Date(), { weekStartsOn: 1 }));
  };

  // Prepare chart data
  const chartData = useMemo(() => {
    return trendsData.map((report: any) => {
      const weekStart = new Date(report.weekStartDate);
      return {
        week: format(weekStart, 'MMM dd'),
        Buttpads: (report.buttpadsMonday + report.buttpadsTuesday + report.buttpadsWednesday + report.buttpadsThursday + report.buttpadsFriday),
        Sandblasting: (report.sandblastingMonday + report.sandblastingTuesday + report.sandblastingWednesday + report.sandblastingThursday + report.sandblastingFriday),
        Texture: (report.textureMonday + report.textureTuesday + report.textureWednesday + report.textureThursday + report.textureFriday),
        Duratec: (report.duratecMonday + report.duratecTuesday + report.duratecWednesday + report.duratecThursday + report.duratecFriday),
      };
    });
  }, [trendsData]);

  const categories = ['Buttpads', 'Sandblasting', 'Texture', 'Duratec'];
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  return (
    <div className="p-6 space-y-6 max-w-full mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Gateway Reports
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Production activity tracking
          </p>
        </div>
      </div>

      {/* Week Navigation */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={goToPreviousWeek}
              data-testid="button-previous-week"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Previous Week
            </Button>

            <div className="text-center">
              <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Week of {format(currentWeek, 'MMMM dd, yyyy')}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {format(currentWeek, 'MMM dd')} - {format(addDays(currentWeek, 4), 'MMM dd, yyyy')}
              </div>
              <Button
                variant="link"
                size="sm"
                onClick={goToCurrentWeek}
                className="mt-1"
              >
                Go to Current Week
              </Button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={goToNextWeek}
              data-testid="button-next-week"
            >
              Next Week
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Data Entry Grid */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Activity (Items Processed)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[150px]">Category</TableHead>
                  {days.map(day => (
                    <TableHead key={day} className="text-center">{day}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map(category => (
                  <TableRow key={category}>
                    <TableCell className="font-medium">{category}</TableCell>
                    {days.map(day => {
                      const fieldName = `${category.toLowerCase()}${day}` as keyof WeeklyData;
                      return (
                        <TableCell key={day} className="text-center">
                          <Input
                            type="number"
                            min="0"
                            value={formData[fieldName]}
                            onChange={(e) => handleInputChange(fieldName, e.target.value)}
                            className="w-20 text-center"
                            data-testid={`input-${fieldName}`}
                          />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-6 flex justify-end">
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              data-testid="button-save"
            >
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? 'Saving...' : 'Save Data'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Trends Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Weekly Trends (Last 6 Months)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="Buttpads" stroke="#3b82f6" strokeWidth={2} />
                <Line type="monotone" dataKey="Sandblasting" stroke="#10b981" strokeWidth={2} />
                <Line type="monotone" dataKey="Texture" stroke="#f59e0b" strokeWidth={2} />
                <Line type="monotone" dataKey="Duratec" stroke="#ef4444" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Historical Data Table */}
      <Card>
        <CardHeader>
          <CardTitle>Historical Data</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Week Start</TableHead>
                  <TableHead className="text-right">Buttpads</TableHead>
                  <TableHead className="text-right">Sandblasting</TableHead>
                  <TableHead className="text-right">Texture</TableHead>
                  <TableHead className="text-right">Duratec</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trendsData.slice().reverse().map((report: any) => {
                  const buttpadsTotal = report.buttpadsMonday + report.buttpadsTuesday + report.buttpadsWednesday + report.buttpadsThursday + report.buttpadsFriday;
                  const sandblastingTotal = report.sandblastingMonday + report.sandblastingTuesday + report.sandblastingWednesday + report.sandblastingThursday + report.sandblastingFriday;
                  const textureTotal = report.textureMonday + report.textureTuesday + report.textureWednesday + report.textureThursday + report.textureFriday;
                  const duratecTotal = report.duratecMonday + report.duratecTuesday + report.duratecWednesday + report.duratecThursday + report.duratecFriday;
                  const grandTotal = buttpadsTotal + sandblastingTotal + textureTotal + duratecTotal;

                  return (
                    <TableRow key={report.id}>
                      <TableCell className="font-medium">
                        {format(new Date(report.weekStartDate), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell className="text-right">{buttpadsTotal}</TableCell>
                      <TableCell className="text-right">{sandblastingTotal}</TableCell>
                      <TableCell className="text-right">{textureTotal}</TableCell>
                      <TableCell className="text-right">{duratecTotal}</TableCell>
                      <TableCell className="text-right font-semibold">{grandTotal}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
