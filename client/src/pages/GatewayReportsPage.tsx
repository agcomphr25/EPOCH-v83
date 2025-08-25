import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft, ChevronRight, Calendar, BarChart3, Save } from 'lucide-react';
import { format, addWeeks, startOfWeek, addDays } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';

interface GatewayReport {
  id?: number;
  date: string;
  buttpads: number;
  duratec: number;
  sandblasting: number;
  texture: number;
}

interface WeeklySummary {
  buttpads: number;
  duratec: number;
  sandblasting: number;
  texture: number;
}

const AREAS = ['Buttpads', 'Duratec', 'Sandblasting', 'Texture'] as const;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;

function getWeekStart(date: Date): Date {
  // Get Monday as start of week
  const start = startOfWeek(date, { weekStartsOn: 1 });
  return start;
}

function formatDateForAPI(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export default function GatewayReportsPage() {
  const { toast } = useToast();
  const [currentWeek, setCurrentWeek] = useState(() => getWeekStart(new Date()));
  const [editingData, setEditingData] = useState<{ [key: string]: { [key: string]: number } }>({});

  const weekStartStr = formatDateForAPI(currentWeek);

  // Generate dates for the current week (Mon-Fri)
  const weekDates = DAYS.map((_, index) => {
    const date = addDays(currentWeek, index);
    return {
      date,
      dateStr: formatDateForAPI(date),
      dayName: DAYS[index]
    };
  });

  // Fetch week data
  const { data: weekReports = [], isLoading } = useQuery<GatewayReport[]>({
    queryKey: ['/api/gateway-reports/week', weekStartStr],
    queryFn: () => 
      fetch(`/api/gateway-reports/week/${weekStartStr}`)
        .then(res => res.json()),
  });

  // Fetch weekly summary
  const { data: weeklySummary } = useQuery<WeeklySummary>({
    queryKey: ['/api/gateway-reports/summary', weekStartStr],
    queryFn: () => 
      fetch(`/api/gateway-reports/summary/${weekStartStr}`)
        .then(res => res.json()),
  });

  // Create or update report mutation
  const saveReportMutation = useMutation({
    mutationFn: (data: { date: string; buttpads: number; duratec: number; sandblasting: number; texture: number }) => 
      fetch('/api/gateway-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gateway-reports/week', weekStartStr] });
      queryClient.invalidateQueries({ queryKey: ['/api/gateway-reports/summary', weekStartStr] });
      toast({
        title: "Success",
        description: "Gateway report saved successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save gateway report",
        variant: "destructive",
      });
    },
  });

  // Convert array of reports to map for easy lookup
  const reportsMap = weekReports.reduce((acc, report) => {
    acc[report.date] = report;
    return acc;
  }, {} as { [key: string]: GatewayReport });

  const handleInputChange = (dateStr: string, area: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setEditingData(prev => ({
      ...prev,
      [dateStr]: {
        ...prev[dateStr],
        [area.toLowerCase()]: numValue
      }
    }));
  };

  const getValue = (dateStr: string, area: string): number => {
    const editingValue = editingData[dateStr]?.[area.toLowerCase()];
    if (editingValue !== undefined) return editingValue;
    
    const report = reportsMap[dateStr];
    return report?.[area.toLowerCase() as keyof GatewayReport] as number || 0;
  };

  const saveDay = async (dateStr: string) => {
    const dayData = editingData[dateStr];
    if (!dayData) return;

    const reportData = {
      date: dateStr,
      buttpads: dayData.buttpads || getValue(dateStr, 'buttpads'),
      duratec: dayData.duratec || getValue(dateStr, 'duratec'),
      sandblasting: dayData.sandblasting || getValue(dateStr, 'sandblasting'),
      texture: dayData.texture || getValue(dateStr, 'texture'),
    };

    await saveReportMutation.mutateAsync(reportData);
    
    // Clear editing data for this day
    setEditingData(prev => {
      const newData = { ...prev };
      delete newData[dateStr];
      return newData;
    });
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    setCurrentWeek(prev => addWeeks(prev, direction === 'next' ? 1 : -1));
    setEditingData({}); // Clear editing data when changing weeks
  };

  const goToCurrentWeek = () => {
    setCurrentWeek(getWeekStart(new Date()));
    setEditingData({});
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-96">
          <div className="text-lg">Loading gateway reports...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-6">
        {/* Header with navigation */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Gateway Report</h1>
            <p className="text-muted-foreground">
              Track daily activity for production areas
            </p>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => navigateWeek('prev')}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <Button 
              variant="outline" 
              onClick={goToCurrentWeek}
              className="flex items-center space-x-2"
            >
              <Calendar className="h-4 w-4" />
              <span>Current Week</span>
            </Button>
            
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => navigateWeek('next')}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Week display */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <BarChart3 className="h-5 w-5" />
              <span>
                Week of {format(currentWeek, 'MMMM d, yyyy')} - {format(addDays(currentWeek, 4), 'MMMM d, yyyy')}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Data Entry Grid */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Area</TableHead>
                    {weekDates.map(({ dayName, date }) => (
                      <TableHead key={dayName} className="text-center min-w-32">
                        <div className="space-y-1">
                          <div className="font-medium">{dayName}</div>
                          <div className="text-xs text-muted-foreground">
                            {format(date, 'M/d')}
                          </div>
                        </div>
                      </TableHead>
                    ))}
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {AREAS.map((area) => (
                    <TableRow key={area}>
                      <TableCell className="font-medium">{area}</TableCell>
                      {weekDates.map(({ dateStr }) => (
                        <TableCell key={`${area}-${dateStr}`} className="p-2">
                          <Input
                            type="number"
                            min="0"
                            value={getValue(dateStr, area)}
                            onChange={(e) => handleInputChange(dateStr, area, e.target.value)}
                            className="w-full text-center"
                            placeholder="0"
                          />
                        </TableCell>
                      ))}
                      <TableCell></TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-medium">Save</TableCell>
                    {weekDates.map(({ dateStr }) => (
                      <TableCell key={`save-${dateStr}`} className="p-2">
                        <Button
                          size="sm"
                          onClick={() => saveDay(dateStr)}
                          disabled={!editingData[dateStr] || saveReportMutation.isPending}
                          className="w-full"
                        >
                          <Save className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    ))}
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Weekly Summary */}
        {weeklySummary && (
          <Card>
            <CardHeader>
              <CardTitle>Weekly Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {AREAS.map((area) => (
                  <div key={area} className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-primary">
                      {weeklySummary[area.toLowerCase() as keyof WeeklySummary] || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">{area}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}