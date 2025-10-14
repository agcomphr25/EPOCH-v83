import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, ArrowUpDown } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TrainingMatrixEntry = {
  id: number;
  employeeId: number | null;
  employeeName: string | null;
  jobTitle: string | null;
  department: string | null;
  trainingName: string;
  lastCompleted: string | null;
  lastScore: number | null;
  status: string;
  notes: string | null;
};

export default function TrainingMatrixView() {
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"employee" | "training">("employee");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  
  const { data: matrixData, isLoading } = useQuery<TrainingMatrixEntry[]>({
    queryKey: ["/api/training/matrix"],
  });

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!matrixData || matrixData.length === 0) {
    return (
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle>Training Matrix</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">No training data available.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Extract unique employees with their details
  const employeeMap = new Map<string, { name: string; jobTitle: string | null; department: string | null }>();
  matrixData.forEach(entry => {
    if (entry.employeeName && !employeeMap.has(entry.employeeName)) {
      employeeMap.set(entry.employeeName, {
        name: entry.employeeName,
        jobTitle: entry.jobTitle,
        department: entry.department
      });
    }
  });
  
  // Owners list - these should appear at the bottom
  const owners = ['Dave', 'Angie', 'Matt', 'Laurie'];
  const isOwner = (name: string) => owners.some(owner => name.toLowerCase().includes(owner.toLowerCase()));
  
  // Sort employees based on sortOrder, with owners always at the bottom
  const employees = Array.from(employeeMap.values()).sort((a, b) => {
    const aIsOwner = isOwner(a.name);
    const bIsOwner = isOwner(b.name);
    
    // If one is owner and other isn't, owner goes to bottom
    if (aIsOwner && !bIsOwner) return 1;
    if (!aIsOwner && bIsOwner) return -1;
    
    // Both are owners or both are not owners, sort alphabetically
    return sortOrder === "asc" 
      ? a.name.localeCompare(b.name)
      : b.name.localeCompare(a.name);
  });
  
  // Sort trainings based on sortOrder
  const trainings = Array.from(new Set(matrixData.map(e => e.trainingName))).sort((a, b) =>
    sortOrder === "asc" 
      ? a.localeCompare(b)
      : b.localeCompare(a)
  );

  // Filter by search term
  const filteredEmployees = viewMode === "employee"
    ? (searchTerm
        ? employees.filter(emp => emp.name.toLowerCase().includes(searchTerm.toLowerCase()))
        : employees)
    : employees;

  const filteredTrainings = viewMode === "training"
    ? (searchTerm
        ? trainings.filter(training => training.toLowerCase().includes(searchTerm.toLowerCase()))
        : trainings)
    : trainings;

  // Create lookup map for quick access
  const matrixMap = new Map<string, TrainingMatrixEntry>();
  matrixData.forEach(entry => {
    const key = `${entry.employeeName}-${entry.trainingName}`;
    matrixMap.set(key, entry);
  });

  const getEntry = (employeeName: string, training: string) => {
    return matrixMap.get(`${employeeName}-${training}`);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const completedCount = (employeeName: string) => {
    return trainings.filter(training => {
      const entry = getEntry(employeeName, training);
      return entry?.status === 'COMPLETED';
    }).length;
  };

  const trainingCompletedCount = (trainingName: string) => {
    return employees.filter(employee => {
      const entry = getEntry(employee.name, trainingName);
      return entry?.status === 'COMPLETED';
    }).length;
  };

  const totalTrainings = trainings.length;
  const totalEmployees = employees.length;

  return (
    <div className="p-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between mb-4">
            <CardTitle>Training Matrix</CardTitle>
            <Badge variant="outline" className="text-sm">
              {totalEmployees} Employees × {totalTrainings} Trainings
            </Badge>
          </div>
          <div className="flex items-center gap-4">
            <Select value={viewMode} onValueChange={(value: "employee" | "training") => setViewMode(value)}>
              <SelectTrigger className="w-48" data-testid="select-view-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Sort by Employee</SelectItem>
                <SelectItem value="training">Sort by Training</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              data-testid="button-toggle-sort"
            >
              <ArrowUpDown className="h-4 w-4 mr-2" />
              {sortOrder === "asc" ? "A-Z" : "Z-A"}
            </Button>
            <Input
              placeholder={viewMode === "employee" ? "Search employees..." : "Search trainings..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-64"
              data-testid="input-search"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            {viewMode === "employee" ? (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="sticky left-0 bg-background z-10 p-3 text-left font-semibold min-w-[200px]">
                      Employee
                    </th>
                    <th className="p-3 text-center font-semibold min-w-[100px]">
                      Progress
                    </th>
                    {trainings.map((training) => (
                      <th
                        key={training}
                        className="p-3 text-left font-bold min-w-[140px] border-l h-40 bg-muted/50"
                        data-testid={`header-training-${training.replace(/\s+/g, '-').toLowerCase()}`}
                      >
                        <div className="transform -rotate-45 origin-left text-sm whitespace-nowrap font-bold">
                          {training}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map((employee) => {
                    const completed = completedCount(employee.name);
                    const percentage = Math.round((completed / totalTrainings) * 100);
                    
                    return (
                      <tr
                        key={employee.name}
                        className="border-b hover:bg-muted/50"
                        data-testid={`row-employee-${employee.name.replace(/\s+/g, '-').toLowerCase()}`}
                      >
                        <td className="sticky left-0 bg-background z-10 p-3">
                          <div className="flex flex-col">
                            <span className="font-medium">{employee.name}</span>
                            {employee.jobTitle && (
                              <span className="text-xs text-muted-foreground">{employee.jobTitle}</span>
                            )}
                            {employee.department && (
                              <span className="text-xs text-blue-600">{employee.department}</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <Badge
                              variant={percentage === 100 ? "default" : percentage > 50 ? "secondary" : "destructive"}
                              className="w-16"
                            >
                              {percentage}%
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {completed}/{totalTrainings}
                            </span>
                          </div>
                        </td>
                        {trainings.map((training) => {
                          const entry = getEntry(employee.name, training);
                          const isCompleted = entry?.status === 'COMPLETED';
                          const date = formatDate(entry?.lastCompleted || null);
                          const score = entry?.lastScore;
                          
                          return (
                            <td
                              key={training}
                              className="p-3 text-center border-l"
                              data-testid={`cell-${employee.name.replace(/\s+/g, '-').toLowerCase()}-${training.replace(/\s+/g, '-').toLowerCase()}`}
                            >
                              {isCompleted ? (
                                <div className="flex flex-col items-center gap-1">
                                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                                  {score !== null && score !== undefined && (
                                    <span className="text-xs font-semibold text-green-700">{score}%</span>
                                  )}
                                  <span className="text-xs text-muted-foreground">{date}</span>
                                  {entry?.notes && (
                                    <span className="text-xs text-blue-600">({entry.notes})</span>
                                  )}
                                </div>
                              ) : (
                                <Circle className="h-5 w-5 text-red-400 mx-auto" />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="sticky left-0 bg-background z-10 p-3 text-left font-semibold min-w-[200px]">
                      Training
                    </th>
                    <th className="p-3 text-center font-semibold min-w-[100px]">
                      Completion
                    </th>
                    {employees.map((employee) => (
                      <th
                        key={employee.name}
                        className="p-3 text-left font-bold min-w-[140px] border-l h-40 bg-muted/50"
                        data-testid={`header-employee-${employee.name.replace(/\s+/g, '-').toLowerCase()}`}
                      >
                        <div className="transform -rotate-45 origin-left text-sm whitespace-nowrap font-bold">
                          {employee.name}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredTrainings.map((training) => {
                    const completed = trainingCompletedCount(training);
                    const percentage = Math.round((completed / totalEmployees) * 100);
                    
                    return (
                      <tr
                        key={training}
                        className="border-b hover:bg-muted/50"
                        data-testid={`row-training-${training.replace(/\s+/g, '-').toLowerCase()}`}
                      >
                        <td className="sticky left-0 bg-background z-10 p-3">
                          <div className="flex flex-col">
                            <span className="font-medium">{training}</span>
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <Badge
                              variant={percentage === 100 ? "default" : percentage > 50 ? "secondary" : "destructive"}
                              className="w-16"
                            >
                              {percentage}%
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {completed}/{totalEmployees}
                            </span>
                          </div>
                        </td>
                        {employees.map((employee) => {
                          const entry = getEntry(employee.name, training);
                          const isCompleted = entry?.status === 'COMPLETED';
                          const date = formatDate(entry?.lastCompleted || null);
                          const score = entry?.lastScore;
                          
                          return (
                            <td
                              key={employee.name}
                              className="p-3 text-center border-l"
                              data-testid={`cell-${training.replace(/\s+/g, '-').toLowerCase()}-${employee.name.replace(/\s+/g, '-').toLowerCase()}`}
                            >
                              {isCompleted ? (
                                <div className="flex flex-col items-center gap-1">
                                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                                  {score !== null && score !== undefined && (
                                    <span className="text-xs font-semibold text-green-700">{score}%</span>
                                  )}
                                  <span className="text-xs text-muted-foreground">{date}</span>
                                  {entry?.notes && (
                                    <span className="text-xs text-blue-600">({entry.notes})</span>
                                  )}
                                </div>
                              ) : (
                                <Circle className="h-5 w-5 text-red-400 mx-auto" />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="mt-6 flex items-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>Completed</span>
            </div>
            <div className="flex items-center gap-2">
              <Circle className="h-4 w-4 text-red-400" />
              <span>Pending</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
