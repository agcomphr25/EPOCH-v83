import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Save,
  TrendingUp,
  BarChart3,
  PieChart,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, getISOWeek, getYear } from 'date-fns';

// Gateway report schema for data entry
const gatewayReportSchema = z.object({
  weekStartDate: z.string(),
  year: z.number(),
  weekNumber: z.number(),
  // Buttpads (Mon-Fri)
  buttpadsMon: z.number().int().min(0).default(0),
  buttpadsTue: z.number().int().min(0).default(0),
  buttpadsWed: z.number().int().min(0).default(0),
  buttpadsThu: z.number().int().min(0).default(0),
  buttpadsFri: z.number().int().min(0).default(0),
  // Sandblasting (Mon-Fri)
  sandblastingMon: z.number().int().min(0).default(0),
  sandblastingTue: z.number().int().min(0).default(0),
  sandblastingWed: z.number().int().min(0).default(0),
  sandblastingThu: z.number().int().min(0).default(0),
  sandblastingFri: z.number().int().min(0).default(0),
  // Duratec (Mon-Fri)
  duratecMon: z.number().int().min(0).default(0),
  duratecTue: z.number().int().min(0).default(0),
  duratecWed: z.number().int().min(0).default(0),
  duratecThu: z.number().int().min(0).default(0),
  duratecFri: z.number().int().min(0).default(0),
  // Texture (Mon-Fri)
  textureMon: z.number().int().min(0).default(0),
  textureTue: z.number().int().min(0).default(0),
  textureWed: z.number().int().min(0).default(0),
  textureThu: z.number().int().min(0).default(0),
  textureFri: z.number().int().min(0).default(0),
});

type GatewayReportFormData = z.infer<typeof gatewayReportSchema>;

export default function GatewayReports() {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState('data-entry');

  // Calculate Monday of the selected week
  const weekStart = useMemo(() => startOfWeek(selectedDate, { weekStartsOn: 1 }), [selectedDate]);
  const weekEnd = useMemo(() => endOfWeek(selectedDate, { weekStartsOn: 1 }), [selectedDate]);
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  const year = getYear(weekStart);
  const weekNumber = getISOWeek(weekStart);

  // Fetch report data for the selected week
  const { data: reportData, isLoading } = useQuery({
    queryKey: [`/api/gateway-reports/week/${weekStartStr}`],
    retry: false,
  });

  // Fetch stats for visualizations
  const { data: statsData } = useQuery({
    queryKey: [`/api/gateway-reports/stats?year=${year}`],
  });

  const form = useForm<GatewayReportFormData>({
    resolver: zodResolver(gatewayReportSchema),
    defaultValues: {
      weekStartDate: weekStartStr,
      year,
      weekNumber,
      buttpadsMon: 0,
      buttpadsTue: 0,
      buttpadsWed: 0,
      buttpadsThu: 0,
      buttpadsFri: 0,
      sandblastingMon: 0,
      sandblastingTue: 0,
      sandblastingWed: 0,
      sandblastingThu: 0,
      sandblastingFri: 0,
      duratecMon: 0,
      duratecTue: 0,
      duratecWed: 0,
      duratecThu: 0,
      duratecFri: 0,
      textureMon: 0,
      textureTue: 0,
      textureWed: 0,
      textureThu: 0,
      textureFri: 0,
    },
  });

  // Save/update report mutation
  const saveReportMutation = useMutation({
    mutationFn: (data: GatewayReportFormData) =>
      apiRequest('/api/gateway-reports', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === 'string' &&
          query.queryKey[0].startsWith('/api/gateway-reports'),
      });
      toast({ title: 'Success', description: 'Gateway report saved successfully' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to save gateway report', variant: 'destructive' });
    },
  });

  // Update form when report data loads
  useEffect(() => {
    if (reportData) {
      form.reset({
        weekStartDate: reportData.weekStartDate,
        year: reportData.year,
        weekNumber: reportData.weekNumber,
        buttpadsMon: reportData.buttpadsMon || 0,
        buttpadsTue: reportData.buttpadsTue || 0,
        buttpadsWed: reportData.buttpadsWed || 0,
        buttpadsThu: reportData.buttpadsThu || 0,
        buttpadsFri: reportData.buttpadsFri || 0,
        sandblastingMon: reportData.sandblastingMon || 0,
        sandblastingTue: reportData.sandblastingTue || 0,
        sandblastingWed: reportData.sandblastingWed || 0,
        sandblastingThu: reportData.sandblastingThu || 0,
        sandblastingFri: reportData.sandblastingFri || 0,
        duratecMon: reportData.duratecMon || 0,
        duratecTue: reportData.duratecTue || 0,
        duratecWed: reportData.duratecWed || 0,
        duratecThu: reportData.duratecThu || 0,
        duratecFri: reportData.duratecFri || 0,
        textureMon: reportData.textureMon || 0,
        textureTue: reportData.textureTue || 0,
        textureWed: reportData.textureWed || 0,
        textureThu: reportData.textureThu || 0,
        textureFri: reportData.textureFri || 0,
      });
    } else {
      // Reset form with current week info when no data exists
      form.reset({
        weekStartDate: weekStartStr,
        year,
        weekNumber,
        buttpadsMon: 0,
        buttpadsTue: 0,
        buttpadsWed: 0,
        buttpadsThu: 0,
        buttpadsFri: 0,
        sandblastingMon: 0,
        sandblastingTue: 0,
        sandblastingWed: 0,
        sandblastingThu: 0,
        sandblastingFri: 0,
        duratecMon: 0,
        duratecTue: 0,
        duratecWed: 0,
        duratecThu: 0,
        duratecFri: 0,
        textureMon: 0,
        textureTue: 0,
        textureWed: 0,
        textureThu: 0,
        textureFri: 0,
      });
    }
  }, [reportData, weekStartStr, year, weekNumber, form]);

  // Calculate weekly totals from form values
  const formValues = form.watch();
  const weeklyTotals = useMemo(() => {
    return {
      buttpads:
        formValues.buttpadsMon +
        formValues.buttpadsTue +
        formValues.buttpadsWed +
        formValues.buttpadsThu +
        formValues.buttpadsFri,
      sandblasting:
        formValues.sandblastingMon +
        formValues.sandblastingTue +
        formValues.sandblastingWed +
        formValues.sandblastingThu +
        formValues.sandblastingFri,
      duratec:
        formValues.duratecMon +
        formValues.duratecTue +
        formValues.duratecWed +
        formValues.duratecThu +
        formValues.duratecFri,
      texture:
        formValues.textureMon +
        formValues.textureTue +
        formValues.textureWed +
        formValues.textureThu +
        formValues.textureFri,
    };
  }, [formValues]);

  const onSubmit = (data: GatewayReportFormData) => {
    saveReportMutation.mutate(data);
  };

  const handlePreviousWeek = () => {
    setSelectedDate(subWeeks(selectedDate, 1));
  };

  const handleNextWeek = () => {
    setSelectedDate(addWeeks(selectedDate, 1));
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      setIsDatePickerOpen(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="gateway-reports-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
            Gateway Reports
          </h1>
          <p className="text-muted-foreground mt-2">
            Track daily production totals for Buttpads, Sandblasting, Duratec, and Texture
          </p>
        </div>
      </div>

      {/* Week Navigation */}
      <Card>
        <CardHeader>
          <CardTitle>Week Selection</CardTitle>
          <CardDescription>
            Navigate between weeks or jump to a specific date
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePreviousWeek}
              data-testid="button-previous-week"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-[300px] justify-start text-left font-normal',
                    !selectedDate && 'text-muted-foreground'
                  )}
                  data-testid="button-select-week"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(weekStart, 'MMM dd, yyyy')} - {format(weekEnd, 'MMM dd, yyyy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateSelect}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <Button
              variant="outline"
              size="icon"
              onClick={handleNextWeek}
              data-testid="button-next-week"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <div className="ml-auto text-sm text-muted-foreground">
              Week {weekNumber}, {year}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="data-entry" data-testid="tab-data-entry">
            Data Entry
          </TabsTrigger>
          <TabsTrigger value="weekly-totals" data-testid="tab-weekly-totals">
            Weekly Totals
          </TabsTrigger>
          <TabsTrigger value="trends" data-testid="tab-trends">
            Trends & Analysis
          </TabsTrigger>
        </TabsList>

        {/* Data Entry Tab */}
        <TabsContent value="data-entry" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily Production Entry</CardTitle>
              <CardDescription>
                Enter production totals for Monday through Friday (0 is a valid entry)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[150px]">Function</TableHead>
                            <TableHead className="text-center">Monday</TableHead>
                            <TableHead className="text-center">Tuesday</TableHead>
                            <TableHead className="text-center">Wednesday</TableHead>
                            <TableHead className="text-center">Thursday</TableHead>
                            <TableHead className="text-center">Friday</TableHead>
                            <TableHead className="text-center font-semibold">Week Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {/* Buttpads Row */}
                          <TableRow>
                            <TableCell className="font-medium">Buttpads</TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name="buttpadsMon"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="0"
                                        {...field}
                                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                        className="text-center"
                                        data-testid="input-buttpads-mon"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name="buttpadsTue"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="0"
                                        {...field}
                                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                        className="text-center"
                                        data-testid="input-buttpads-tue"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name="buttpadsWed"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="0"
                                        {...field}
                                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                        className="text-center"
                                        data-testid="input-buttpads-wed"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name="buttpadsThu"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="0"
                                        {...field}
                                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                        className="text-center"
                                        data-testid="input-buttpads-thu"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name="buttpadsFri"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="0"
                                        {...field}
                                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                        className="text-center"
                                        data-testid="input-buttpads-fri"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell className="text-center font-semibold bg-muted">
                              {weeklyTotals.buttpads}
                            </TableCell>
                          </TableRow>

                          {/* Sandblasting Row */}
                          <TableRow>
                            <TableCell className="font-medium">Sandblasting</TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name="sandblastingMon"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="0"
                                        {...field}
                                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                        className="text-center"
                                        data-testid="input-sandblasting-mon"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name="sandblastingTue"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="0"
                                        {...field}
                                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                        className="text-center"
                                        data-testid="input-sandblasting-tue"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name="sandblastingWed"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="0"
                                        {...field}
                                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                        className="text-center"
                                        data-testid="input-sandblasting-wed"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name="sandblastingThu"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="0"
                                        {...field}
                                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                        className="text-center"
                                        data-testid="input-sandblasting-thu"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name="sandblastingFri"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="0"
                                        {...field}
                                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                        className="text-center"
                                        data-testid="input-sandblasting-fri"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell className="text-center font-semibold bg-muted">
                              {weeklyTotals.sandblasting}
                            </TableCell>
                          </TableRow>

                          {/* Duratec Row */}
                          <TableRow>
                            <TableCell className="font-medium">Duratec</TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name="duratecMon"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="0"
                                        {...field}
                                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                        className="text-center"
                                        data-testid="input-duratec-mon"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name="duratecTue"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="0"
                                        {...field}
                                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                        className="text-center"
                                        data-testid="input-duratec-tue"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name="duratecWed"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="0"
                                        {...field}
                                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                        className="text-center"
                                        data-testid="input-duratec-wed"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name="duratecThu"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="0"
                                        {...field}
                                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                        className="text-center"
                                        data-testid="input-duratec-thu"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name="duratecFri"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="0"
                                        {...field}
                                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                        className="text-center"
                                        data-testid="input-duratec-fri"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell className="text-center font-semibold bg-muted">
                              {weeklyTotals.duratec}
                            </TableCell>
                          </TableRow>

                          {/* Texture Row */}
                          <TableRow>
                            <TableCell className="font-medium">Texture</TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name="textureMon"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="0"
                                        {...field}
                                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                        className="text-center"
                                        data-testid="input-texture-mon"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name="textureTue"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="0"
                                        {...field}
                                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                        className="text-center"
                                        data-testid="input-texture-tue"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name="textureWed"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="0"
                                        {...field}
                                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                        className="text-center"
                                        data-testid="input-texture-wed"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name="textureThu"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="0"
                                        {...field}
                                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                        className="text-center"
                                        data-testid="input-texture-thu"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name="textureFri"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="0"
                                        {...field}
                                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                        className="text-center"
                                        data-testid="input-texture-fri"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell className="text-center font-semibold bg-muted">
                              {weeklyTotals.texture}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        disabled={saveReportMutation.isPending}
                        data-testid="button-save-report"
                      >
                        <Save className="mr-2 h-4 w-4" />
                        {saveReportMutation.isPending ? 'Saving...' : 'Save Report'}
                      </Button>
                    </div>
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Weekly Totals Tab */}
        <TabsContent value="weekly-totals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Weekly Summary</CardTitle>
              <CardDescription>
                Current week totals by function
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="border rounded-lg p-4">
                  <div className="text-sm font-medium text-muted-foreground">Buttpads</div>
                  <div className="text-3xl font-bold mt-2">{weeklyTotals.buttpads}</div>
                  <div className="text-xs text-muted-foreground mt-1">Total this week</div>
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-sm font-medium text-muted-foreground">Sandblasting</div>
                  <div className="text-3xl font-bold mt-2">{weeklyTotals.sandblasting}</div>
                  <div className="text-xs text-muted-foreground mt-1">Total this week</div>
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-sm font-medium text-muted-foreground">Duratec</div>
                  <div className="text-3xl font-bold mt-2">{weeklyTotals.duratec}</div>
                  <div className="text-xs text-muted-foreground mt-1">Total this week</div>
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-sm font-medium text-muted-foreground">Texture</div>
                  <div className="text-3xl font-bold mt-2">{weeklyTotals.texture}</div>
                  <div className="text-xs text-muted-foreground mt-1">Total this week</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trends & Analysis Tab */}
        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Year-to-Date Summary ({year})</CardTitle>
              <CardDescription>
                Total production across all four functions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {statsData ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-muted-foreground">Buttpads</div>
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-3xl font-bold mt-2">{statsData.stats.buttpads.total}</div>
                    <div className="text-xs text-muted-foreground mt-1">YTD Total</div>
                  </div>
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-muted-foreground">Sandblasting</div>
                      <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-3xl font-bold mt-2">{statsData.stats.sandblasting.total}</div>
                    <div className="text-xs text-muted-foreground mt-1">YTD Total</div>
                  </div>
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-muted-foreground">Duratec</div>
                      <PieChart className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-3xl font-bold mt-2">{statsData.stats.duratec.total}</div>
                    <div className="text-xs text-muted-foreground mt-1">YTD Total</div>
                  </div>
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-muted-foreground">Texture</div>
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="text-3xl font-bold mt-2">{statsData.stats.texture.total}</div>
                    <div className="text-xs text-muted-foreground mt-1">YTD Total</div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">Loading statistics...</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Monthly Breakdown ({year})</CardTitle>
              <CardDescription>
                Production totals by month
              </CardDescription>
            </CardHeader>
            <CardContent>
              {statsData ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead className="text-right">Buttpads</TableHead>
                        <TableHead className="text-right">Sandblasting</TableHead>
                        <TableHead className="text-right">Duratec</TableHead>
                        <TableHead className="text-right">Texture</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((month) => {
                        const monthName = format(new Date(year, month - 1), 'MMMM');
                        return (
                          <TableRow key={month}>
                            <TableCell className="font-medium">{monthName}</TableCell>
                            <TableCell className="text-right">
                              {statsData.stats.buttpads.byMonth[month] || 0}
                            </TableCell>
                            <TableCell className="text-right">
                              {statsData.stats.sandblasting.byMonth[month] || 0}
                            </TableCell>
                            <TableCell className="text-right">
                              {statsData.stats.duratec.byMonth[month] || 0}
                            </TableCell>
                            <TableCell className="text-right">
                              {statsData.stats.texture.byMonth[month] || 0}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">Loading monthly data...</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
