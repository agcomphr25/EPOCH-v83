import { AdminLayout } from "@/components/layout/admin-layout";
import { useParams, Link } from "wouter";
import { 
  useGetEmployee, 
  useUpdateEmployee, 
  useListPunches, 
  useListTimesheets, 
  useListLeaveEntries,
  useCreateLeaveEntry,
  useUpdateLeaveEntry,
  useDeleteLeaveEntry,
  getGetEmployeeQueryKey,
  getListLeaveEntriesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save, Plus, Trash2, Pencil } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

export default function AdminEmployeeDetail() {
  const { id } = useParams();
  const empId = parseInt(id || "0", 10);
  
  const { data: employee, isLoading: loadingEmployee } = useGetEmployee(empId, { query: { enabled: !!empId } });
  const { data: punches = [], isLoading: loadingPunches } = useListPunches({ employeeId: empId });
  const { data: timesheets = [], isLoading: loadingTimesheets } = useListTimesheets({ employeeId: empId });
  const { data: leaveEntries = [], isLoading: loadingLeave } = useListLeaveEntries({ employeeId: empId });
  
  const updateEmployee = useUpdateEmployee();
  const createLeave = useCreateLeaveEntry();
  const updateLeave = useUpdateLeaveEntry();
  const deleteLeave = useDeleteLeaveEntry();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState<any>({});
  const [leaveForm, setLeaveForm] = useState({ date: "", leaveType: "pto", hours: "8", note: "" });
  const [editingLeave, setEditingLeave] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ date: "", leaveType: "pto", hours: "8", note: "" });

  useEffect(() => {
    if (employee) {
      setFormData({
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        phone: employee.phone || "",
        department: employee.department || "",
        jobTitle: employee.jobTitle || "",
        employeeNumber: employee.employeeNumber || "",
        hourlyRate: employee.hourlyRate || "",
        pin: ""
      });
    }
  }, [employee]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    try {
      const payload = {
        ...formData,
        hourlyRate: formData.hourlyRate ? Number(formData.hourlyRate) : undefined,
      };
      if (!payload.pin) {
        delete payload.pin;
      }
      await updateEmployee.mutateAsync({
        id: empId,
        data: payload,
      });
      queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(empId) });
      toast.success("Employee profile updated");
    } catch (error: any) {
      toast.error(error.message || "Failed to update employee");
    }
  };

  if (loadingEmployee) return <AdminLayout><div className="text-muted-foreground p-8">Loading profile...</div></AdminLayout>;
  if (!employee) return <AdminLayout><div className="text-muted-foreground p-8">Employee not found.</div></AdminLayout>;

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/admin/employees">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{employee.firstName} {employee.lastName}</h1>
            <p className="text-muted-foreground">{employee.jobTitle || 'No Title'} • {employee.department || 'No Department'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <span className={`px-3 py-1 rounded-full text-sm font-semibold uppercase self-center ${
            employee.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400' : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400'
          }`}>
            {employee.status}
          </span>
        </div>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile">Profile Info</TabsTrigger>
          <TabsTrigger value="timesheets">Timesheets ({timesheets.length})</TabsTrigger>
          <TabsTrigger value="punches">Punch Log ({punches.length})</TabsTrigger>
          <TabsTrigger value="leave">Leave ({leaveEntries.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Personal Details</CardTitle>
                  <CardDescription>Update employee information and credentials</CardDescription>
                </div>
                <Button onClick={handleSave} disabled={updateEmployee.isPending} className="gap-2">
                  <Save className="h-4 w-4" />
                  Save Changes
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input value={formData.firstName} onChange={(e) => handleChange('firstName', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input value={formData.lastName} onChange={(e) => handleChange('lastName', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={formData.email} onChange={(e) => handleChange('email', e.target.value)} type="email" />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={formData.phone} onChange={(e) => handleChange('phone', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Employee ID / Number</Label>
                  <Input value={formData.employeeNumber} onChange={(e) => handleChange('employeeNumber', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Input value={formData.department} onChange={(e) => handleChange('department', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Job Title</Label>
                  <Input value={formData.jobTitle} onChange={(e) => handleChange('jobTitle', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Hourly Rate ($)</Label>
                  <Input value={formData.hourlyRate} onChange={(e) => handleChange('hourlyRate', e.target.value)} type="number" step="0.01" />
                </div>
                <div className="space-y-2">
                  <Label>Kiosk PIN (4 digits)</Label>
                  <Input value={formData.pin} onChange={(e) => handleChange('pin', e.target.value)} type="password" maxLength={4} placeholder={employee?.pin ? "Leave blank to keep current" : "Set PIN"} />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timesheets">
          <Card>
            <CardHeader>
              <CardTitle>Timesheet History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Total Hours</TableHead>
                    <TableHead>Overtime</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingTimesheets ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-4">Loading...</TableCell></TableRow>
                  ) : timesheets.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-4">No timesheets found.</TableCell></TableRow>
                  ) : timesheets.map(ts => (
                    <TableRow key={ts.id}>
                      <TableCell>{format(new Date(ts.periodStart), "PP")} - {format(new Date(ts.periodEnd), "PP")}</TableCell>
                      <TableCell>{ts.totalHours.toFixed(2)}h</TableCell>
                      <TableCell>{ts.overtimeHours.toFixed(2)}h</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${
                          ts.status === 'approved' ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400' :
                          ts.status === 'submitted' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-400' :
                          ts.status === 'rejected' ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400' :
                          'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400'
                        }`}>
                          {ts.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/admin/timesheets/${ts.id}`}>
                          <Button variant="ghost" size="sm">View</Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="punches">
          <Card>
            <CardHeader>
              <CardTitle>Punch Log</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Type</TableHead>
                    {punches.some(p => p.costCode) && <TableHead>Cost Code</TableHead>}
                    <TableHead>Source</TableHead>
                    <TableHead>Edited</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingPunches ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-4">Loading...</TableCell></TableRow>
                  ) : punches.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-4">No punches found.</TableCell></TableRow>
                  ) : punches.map(punch => (
                    <TableRow key={punch.id}>
                      <TableCell className="font-medium">{format(new Date(punch.punchedAt), "PPp")}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium uppercase ${
                          punch.type === 'clock_in' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                          punch.type === 'clock_out' ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300' :
                          'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                        }`}>
                          {punch.type.replace('_', ' ')}
                        </span>
                      </TableCell>
                      {punches.some(p => p.costCode) && (
                        <TableCell>
                          {punch.costCode ? (
                            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-medium border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                              {punch.costCode}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="uppercase text-xs">{punch.source}</TableCell>
                      <TableCell>{punch.isEdited ? <span className="text-amber-600 font-medium">Yes</span> : 'No'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leave">
          <Card>
            <CardHeader>
              <CardTitle>Record Leave</CardTitle>
              <CardDescription>Add PTO, sick days, holidays, or other leave</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={leaveForm.date} onChange={e => setLeaveForm(p => ({ ...p, date: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={leaveForm.leaveType} onValueChange={v => setLeaveForm(p => ({ ...p, leaveType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pto">PTO</SelectItem>
                      <SelectItem value="sick">Sick</SelectItem>
                      <SelectItem value="holiday">Holiday</SelectItem>
                      <SelectItem value="bereavement">Bereavement</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Hours</Label>
                  <Input type="number" min="0.5" max="24" step="0.5" value={leaveForm.hours} onChange={e => setLeaveForm(p => ({ ...p, hours: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Note</Label>
                  <Input value={leaveForm.note} onChange={e => setLeaveForm(p => ({ ...p, note: e.target.value }))} placeholder="Optional" />
                </div>
                <Button
                  disabled={createLeave.isPending || !leaveForm.date}
                  onClick={async () => {
                    try {
                      await createLeave.mutateAsync({ data: { employeeId: empId, date: leaveForm.date, leaveType: leaveForm.leaveType, hours: Number(leaveForm.hours), note: leaveForm.note || null } });
                      queryClient.invalidateQueries({ queryKey: getListLeaveEntriesQueryKey({ employeeId: empId }) });
                      setLeaveForm({ date: "", leaveType: "pto", hours: "8", note: "" });
                      toast.success("Leave entry created");
                    } catch (e: any) { toast.error(e.message || "Failed to create leave entry"); }
                  }}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Leave History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingLeave ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-4">Loading...</TableCell></TableRow>
                  ) : leaveEntries.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-4">No leave entries recorded.</TableCell></TableRow>
                  ) : leaveEntries.map(entry => (
                    <TableRow key={entry.id}>
                      {editingLeave === entry.id ? (
                        <>
                          <TableCell><Input type="date" value={editForm.date} onChange={e => setEditForm(p => ({ ...p, date: e.target.value }))} /></TableCell>
                          <TableCell>
                            <Select value={editForm.leaveType} onValueChange={v => setEditForm(p => ({ ...p, leaveType: v }))}>
                              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pto">PTO</SelectItem>
                                <SelectItem value="sick">Sick</SelectItem>
                                <SelectItem value="holiday">Holiday</SelectItem>
                                <SelectItem value="bereavement">Bereavement</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell><Input type="number" min="0.5" max="24" step="0.5" value={editForm.hours} onChange={e => setEditForm(p => ({ ...p, hours: e.target.value }))} className="w-20" /></TableCell>
                          <TableCell><Input value={editForm.note} onChange={e => setEditForm(p => ({ ...p, note: e.target.value }))} placeholder="Optional" /></TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="outline" onClick={async () => {
                                try {
                                  await updateLeave.mutateAsync({ id: entry.id, data: { date: editForm.date, leaveType: editForm.leaveType, hours: Number(editForm.hours), note: editForm.note || null } });
                                  queryClient.invalidateQueries({ queryKey: getListLeaveEntriesQueryKey({ employeeId: empId }) });
                                  setEditingLeave(null);
                                  toast.success("Leave entry updated");
                                } catch (e: any) { toast.error(e.message || "Failed to update"); }
                              }} disabled={updateLeave.isPending}>Save</Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingLeave(null)}>Cancel</Button>
                            </div>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="font-medium">{format(new Date(entry.date + "T00:00:00"), "PP")}</TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${
                              entry.leaveType === 'pto' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-400' :
                              entry.leaveType === 'sick' ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400' :
                              entry.leaveType === 'holiday' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-400' :
                              'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400'
                            }`}>
                              {entry.leaveType}
                            </span>
                          </TableCell>
                          <TableCell>{entry.hours}h</TableCell>
                          <TableCell className="text-muted-foreground">{entry.note || "—"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="icon" onClick={() => { setEditingLeave(entry.id); setEditForm({ date: entry.date, leaveType: entry.leaveType, hours: String(entry.hours), note: entry.note || "" }); }}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                disabled={deleteLeave.isPending}
                                onClick={async () => {
                                  try {
                                    await deleteLeave.mutateAsync({ id: entry.id });
                                    queryClient.invalidateQueries({ queryKey: getListLeaveEntriesQueryKey({ employeeId: empId }) });
                                    toast.success("Leave entry deleted");
                                  } catch (e: any) { toast.error(e.message || "Failed to delete"); }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </AdminLayout>
  );
}
