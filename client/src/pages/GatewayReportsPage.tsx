import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Calendar, Edit, Trash2, Save, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface GatewayReport {
  id: number;
  reportDate: string;
  buttpadsUnits: number;
  duratecUnits: number;
  sandblastingUnits: number;
  textureUnits: number;
  notes?: string;
  createdBy?: number;
  createdAt: string;
  updatedAt: string;
}

interface ReportFormData {
  reportDate: string;
  buttpadsUnits: number;
  duratecUnits: number;
  sandblastingUnits: number;
  textureUnits: number;
  notes: string;
}

const GatewayReportsPage = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingReport, setEditingReport] = useState<GatewayReport | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Week navigation state
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay()); // Start of current week (Sunday)
    return weekStart.toISOString().split('T')[0];
  });

  const [formData, setFormData] = useState<ReportFormData>({
    reportDate: new Date().toISOString().split('T')[0], // Today's date
    buttpadsUnits: 0,
    duratecUnits: 0,
    sandblastingUnits: 0,
    textureUnits: 0,
    notes: ""
  });

  // Fetch all gateway reports
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["/api/gateway-reports"],
    queryFn: () => apiRequest("/api/gateway-reports"),
  });

  // Create report mutation
  const createReportMutation = useMutation({
    mutationFn: (data: ReportFormData) => 
      apiRequest("/api/gateway-reports", { method: "POST", body: data as any }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gateway-reports"] });
      toast({ title: "Success", description: "Gateway report created successfully" });
      resetForm();
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.response?.data?.error || "Failed to create report",
        variant: "destructive"
      });
    },
  });

  // Update report mutation
  const updateReportMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ReportFormData> }) =>
      apiRequest(`/api/gateway-reports/${id}`, { method: "PUT", body: data as any }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gateway-reports"] });
      toast({ title: "Success", description: "Gateway report updated successfully" });
      setEditingReport(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.response?.data?.error || "Failed to update report",
        variant: "destructive"
      });
    },
  });

  // Delete report mutation
  const deleteReportMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/gateway-reports/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gateway-reports"] });
      toast({ title: "Success", description: "Gateway report deleted successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.response?.data?.error || "Failed to delete report",
        variant: "destructive"
      });
    },
  });

  const resetForm = () => {
    setFormData({
      reportDate: new Date().toISOString().split('T')[0],
      buttpadsUnits: 0,
      duratecUnits: 0,
      sandblastingUnits: 0,
      textureUnits: 0,
      notes: ""
    });
    setShowForm(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createReportMutation.mutate(formData);
  };

  const handleEdit = (report: GatewayReport) => {
    setEditingReport(report);
  };

  const handleUpdate = (report: GatewayReport) => {
    updateReportMutation.mutate({ 
      id: report.id, 
      data: {
        buttpadsUnits: report.buttpadsUnits,
        duratecUnits: report.duratecUnits,
        sandblastingUnits: report.sandblastingUnits,
        textureUnits: report.textureUnits,
        notes: report.notes || ""
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this gateway report?")) {
      deleteReportMutation.mutate(id);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getDayOfWeek = (dateString: string) => {
    const date = new Date(dateString);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[date.getDay()];
  };

  const getWeekKey = (dateString: string) => {
    const date = new Date(dateString);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
    return weekStart.toISOString().split('T')[0];
  };

  const formatWeekRange = (weekStart: string) => {
    const start = new Date(weekStart);
    const end = new Date(start);
    end.setDate(start.getDate() + 6); // End of week (Saturday)
    
    const formatOptions: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    const startFormatted = start.toLocaleDateString('en-US', formatOptions);
    const endFormatted = end.toLocaleDateString('en-US', formatOptions);
    
    return `${startFormatted} - ${endFormatted}`;
  };

  // Week navigation functions
  const goToPreviousWeek = () => {
    const currentWeek = new Date(selectedWeek);
    currentWeek.setDate(currentWeek.getDate() - 7);
    setSelectedWeek(currentWeek.toISOString().split('T')[0]);
  };

  const goToNextWeek = () => {
    const currentWeek = new Date(selectedWeek);
    currentWeek.setDate(currentWeek.getDate() + 7);
    setSelectedWeek(currentWeek.toISOString().split('T')[0]);
  };

  const goToCurrentWeek = () => {
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    setSelectedWeek(weekStart.toISOString().split('T')[0]);
  };

  // Calculate running totals for a specific week
  const getWeeklyRunningTotals = (reports: GatewayReport[], weekStart: string) => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    // Filter reports for the selected week
    const weekReports = reports.filter(report => {
      const reportDate = new Date(report.reportDate);
      const start = new Date(weekStart);
      const end = new Date(weekEnd);
      return reportDate >= start && reportDate <= end;
    });

    // Create array for each day of the week
    const dailyRunningTotals = [];
    let runningButtpadTotal = 0;
    let runningDuratecTotal = 0;
    let runningSandblastingTotal = 0;
    let runningTextureTotal = 0;

    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(weekStart);
      currentDate.setDate(currentDate.getDate() + i);
      const dateString = currentDate.toISOString().split('T')[0];
      
      // Find report for this specific date
      const dayReport = weekReports.find(report => report.reportDate === dateString);
      
      if (dayReport) {
        runningButtpadTotal += dayReport.buttpadsUnits;
        runningDuratecTotal += dayReport.duratecUnits;
        runningSandblastingTotal += dayReport.sandblastingUnits;
        runningTextureTotal += dayReport.textureUnits;
      }

      dailyRunningTotals.push({
        date: dateString,
        dayName: getDayOfWeek(dateString),
        dailyButtpad: dayReport?.buttpadsUnits || 0,
        dailyDuratec: dayReport?.duratecUnits || 0,
        dailySandblasting: dayReport?.sandblastingUnits || 0,
        dailyTexture: dayReport?.textureUnits || 0,
        runningButtpadTotal,
        runningDuratecTotal,
        runningSandblastingTotal,
        runningTextureTotal,
        hasReport: !!dayReport
      });
    }

    return dailyRunningTotals;
  };

  // Calculate weekly totals for historical view
  const getWeeklyTotals = (reports: GatewayReport[]) => {
    const weeklyData: { [weekKey: string]: {
      weekStart: string;
      buttpadsTotal: number;
      duratecTotal: number;
      sandblastingTotal: number;
      textureTotal: number;
      reportCount: number;
    }} = {};

    reports.forEach(report => {
      const weekKey = getWeekKey(report.reportDate);
      
      if (!weeklyData[weekKey]) {
        weeklyData[weekKey] = {
          weekStart: weekKey,
          buttpadsTotal: 0,
          duratecTotal: 0,
          sandblastingTotal: 0,
          textureTotal: 0,
          reportCount: 0
        };
      }
      
      weeklyData[weekKey].buttpadsTotal += report.buttpadsUnits;
      weeklyData[weekKey].duratecTotal += report.duratecUnits;
      weeklyData[weekKey].sandblastingTotal += report.sandblastingUnits;
      weeklyData[weekKey].textureTotal += report.textureUnits;
      weeklyData[weekKey].reportCount += 1;
    });

    // Convert to array and sort by week start date (most recent first)
    return Object.values(weeklyData).sort((a, b) => 
      new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime()
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gateway Report</h1>
          <p className="text-gray-600">Track weekly production totals across areas</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Report
        </Button>
      </div>

      <Tabs defaultValue="weekly" className="space-y-4">
        <TabsList>
          <TabsTrigger value="weekly">Weekly Running Totals</TabsTrigger>
          <TabsTrigger value="historical">Historical Weeks</TabsTrigger>
          <TabsTrigger value="daily">Daily Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="weekly" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Weekly Running Totals</CardTitle>
                  <CardDescription>
                    Running totals for {formatWeekRange(selectedWeek)}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={goToPreviousWeek}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={goToCurrentWeek}>
                    Current Week
                  </Button>
                  <Button variant="outline" size="sm" onClick={goToNextWeek}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">Loading reports...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Day</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-center">Daily<br/>Buttpads</TableHead>
                      <TableHead className="text-center">Running<br/>Buttpads</TableHead>
                      <TableHead className="text-center">Daily<br/>Duratec</TableHead>
                      <TableHead className="text-center">Running<br/>Duratec</TableHead>
                      <TableHead className="text-center">Daily<br/>Sandblasting</TableHead>
                      <TableHead className="text-center">Running<br/>Sandblasting</TableHead>
                      <TableHead className="text-center">Daily<br/>Texture</TableHead>
                      <TableHead className="text-center">Running<br/>Texture</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getWeeklyRunningTotals(reports, selectedWeek).map((day, index) => (
                      <TableRow key={day.date} className={!day.hasReport ? "opacity-50" : ""}>
                        <TableCell className="font-medium">
                          {day.dayName}
                        </TableCell>
                        <TableCell>
                          {formatDate(day.date)}
                        </TableCell>
                        <TableCell className="text-center">
                          {day.dailyButtpad}
                        </TableCell>
                        <TableCell className="text-center font-semibold text-blue-600">
                          {day.runningButtpadTotal}
                        </TableCell>
                        <TableCell className="text-center">
                          {day.dailyDuratec}
                        </TableCell>
                        <TableCell className="text-center font-semibold text-green-600">
                          {day.runningDuratecTotal}
                        </TableCell>
                        <TableCell className="text-center">
                          {day.dailySandblasting}
                        </TableCell>
                        <TableCell className="text-center font-semibold text-orange-600">
                          {day.runningSandblastingTotal}
                        </TableCell>
                        <TableCell className="text-center">
                          {day.dailyTexture}
                        </TableCell>
                        <TableCell className="text-center font-semibold text-purple-600">
                          {day.runningTextureTotal}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historical" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Historical Weekly Totals</CardTitle>
              <CardDescription>
                Weekly totals for each production area
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">Loading reports...</div>
              ) : reports.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No gateway reports found. Create your first report to get started.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Week</TableHead>
                      <TableHead>Buttpads Total</TableHead>
                      <TableHead>Duratec Total</TableHead>
                      <TableHead>Sandblasting Total</TableHead>
                      <TableHead>Texture Total</TableHead>
                      <TableHead>Days Reported</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getWeeklyTotals(reports).slice(0, 10).map((week, index) => (
                      <TableRow key={week.weekStart}>
                        <TableCell className="font-medium">
                          {formatWeekRange(week.weekStart)}
                        </TableCell>
                        <TableCell className="text-center font-semibold">
                          {week.buttpadsTotal}
                        </TableCell>
                        <TableCell className="text-center font-semibold">
                          {week.duratecTotal}
                        </TableCell>
                        <TableCell className="text-center font-semibold">
                          {week.sandblastingTotal}
                        </TableCell>
                        <TableCell className="text-center font-semibold">
                          {week.textureTotal}
                        </TableCell>
                        <TableCell className="text-center text-gray-600">
                          {week.reportCount} {week.reportCount === 1 ? 'day' : 'days'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="daily" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily Gateway Reports</CardTitle>
              <CardDescription>
                Individual daily reports with editing capabilities
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">Loading reports...</div>
              ) : reports.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No gateway reports found. Create your first report to get started.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Day</TableHead>
                      <TableHead>Buttpads</TableHead>
                      <TableHead>Duratec</TableHead>
                      <TableHead>Sandblasting</TableHead>
                      <TableHead>Texture</TableHead>
                      <TableHead>Daily Total</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reports.slice(0, 10).map((report: GatewayReport) => (
                      <TableRow key={report.id}>
                        <TableCell>{formatDate(report.reportDate)}</TableCell>
                        <TableCell className="font-medium">
                          {getDayOfWeek(report.reportDate)}
                        </TableCell>
                        <TableCell>
                          {editingReport?.id === report.id ? (
                            <Input
                              type="number"
                              value={editingReport.buttpadsUnits}
                              onChange={(e) => setEditingReport({
                                ...editingReport,
                                buttpadsUnits: parseInt(e.target.value) || 0
                              })}
                              className="w-20"
                              min="0"
                            />
                          ) : (
                            report.buttpadsUnits
                          )}
                        </TableCell>
                        <TableCell>
                          {editingReport?.id === report.id ? (
                            <Input
                              type="number"
                              value={editingReport.duratecUnits}
                              onChange={(e) => setEditingReport({
                                ...editingReport,
                                duratecUnits: parseInt(e.target.value) || 0
                              })}
                              className="w-20"
                              min="0"
                            />
                          ) : (
                            report.duratecUnits
                          )}
                        </TableCell>
                        <TableCell>
                          {editingReport?.id === report.id ? (
                            <Input
                              type="number"
                              value={editingReport.sandblastingUnits}
                              onChange={(e) => setEditingReport({
                                ...editingReport,
                                sandblastingUnits: parseInt(e.target.value) || 0
                              })}
                              className="w-20"
                              min="0"
                            />
                          ) : (
                            report.sandblastingUnits
                          )}
                        </TableCell>
                        <TableCell>
                          {editingReport?.id === report.id ? (
                            <Input
                              type="number"
                              value={editingReport.textureUnits}
                              onChange={(e) => setEditingReport({
                                ...editingReport,
                                textureUnits: parseInt(e.target.value) || 0
                              })}
                              className="w-20"
                              min="0"
                            />
                          ) : (
                            report.textureUnits
                          )}
                        </TableCell>
                        <TableCell className="font-semibold">
                          {(editingReport?.id === report.id ? 
                            editingReport.buttpadsUnits + editingReport.duratecUnits + 
                            editingReport.sandblastingUnits + editingReport.textureUnits :
                            report.buttpadsUnits + report.duratecUnits + 
                            report.sandblastingUnits + report.textureUnits
                          )}
                        </TableCell>
                        <TableCell>
                          {editingReport?.id === report.id ? (
                            <Input
                              value={editingReport.notes || ""}
                              onChange={(e) => setEditingReport({
                                ...editingReport,
                                notes: e.target.value
                              })}
                              className="w-32"
                              placeholder="Notes..."
                            />
                          ) : (
                            <span className="text-sm text-gray-600 truncate max-w-32 block">
                              {report.notes || "-"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {editingReport?.id === report.id ? (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => handleUpdate(editingReport)}
                                  disabled={updateReportMutation.isPending}
                                >
                                  <Save className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingReport(null)}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleEdit(report)}
                                >
                                  <Edit className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDelete(report.id)}
                                  disabled={deleteReportMutation.isPending}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      {/* New Report Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                New Gateway Report
              </CardTitle>
              <CardDescription>
                Enter daily units processed for each area
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="reportDate">Date</Label>
                  <Input
                    id="reportDate"
                    type="date"
                    value={formData.reportDate}
                    onChange={(e) => setFormData({ ...formData, reportDate: e.target.value })}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="buttpadsUnits">Buttpads Units</Label>
                    <Input
                      id="buttpadsUnits"
                      type="number"
                      min="0"
                      value={formData.buttpadsUnits}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        buttpadsUnits: parseInt(e.target.value) || 0 
                      })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="duratecUnits">Duratec Units</Label>
                    <Input
                      id="duratecUnits"
                      type="number"
                      min="0"
                      value={formData.duratecUnits}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        duratecUnits: parseInt(e.target.value) || 0 
                      })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="sandblastingUnits">Sandblasting Units</Label>
                    <Input
                      id="sandblastingUnits"
                      type="number"
                      min="0"
                      value={formData.sandblastingUnits}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        sandblastingUnits: parseInt(e.target.value) || 0 
                      })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="textureUnits">Texture Units</Label>
                    <Input
                      id="textureUnits"
                      type="number"
                      min="0"
                      value={formData.textureUnits}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        textureUnits: parseInt(e.target.value) || 0 
                      })}
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Any additional notes for the day..."
                    rows={3}
                  />
                </div>

                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createReportMutation.isPending}>
                    {createReportMutation.isPending ? "Creating..." : "Create Report"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default GatewayReportsPage;