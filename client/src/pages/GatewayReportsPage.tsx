import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Calendar, Edit, Trash2, Save, X } from "lucide-react";
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

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gateway Report</h1>
          <p className="text-gray-600">Track daily activity across production areas</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Report
        </Button>
      </div>

      <Tabs defaultValue="recent" className="space-y-4">
        <TabsList>
          <TabsTrigger value="recent">Recent Reports</TabsTrigger>
          <TabsTrigger value="all">All Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="recent" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Gateway Reports</CardTitle>
              <CardDescription>
                Daily units processed by area (last 10 reports)
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
                      <TableHead>Total</TableHead>
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

        <TabsContent value="all" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Gateway Reports</CardTitle>
              <CardDescription>
                Complete history of daily production activity
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">Loading reports...</div>
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
                      <TableHead>Total</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reports.map((report: GatewayReport) => (
                      <TableRow key={report.id}>
                        <TableCell>{formatDate(report.reportDate)}</TableCell>
                        <TableCell className="font-medium">
                          {getDayOfWeek(report.reportDate)}
                        </TableCell>
                        <TableCell>{report.buttpadsUnits}</TableCell>
                        <TableCell>{report.duratecUnits}</TableCell>
                        <TableCell>{report.sandblastingUnits}</TableCell>
                        <TableCell>{report.textureUnits}</TableCell>
                        <TableCell className="font-semibold">
                          {report.buttpadsUnits + report.duratecUnits + 
                           report.sandblastingUnits + report.textureUnits}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-gray-600 truncate max-w-32 block">
                            {report.notes || "-"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
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