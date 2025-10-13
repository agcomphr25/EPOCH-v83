import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";

type TrainingMatrixEntry = {
  id: number;
  employeeName: string | null;
  trainingName: string;
  lastCompleted: string | null;
  status: string;
  notes: string | null;
};

export default function TrainingMatrixView() {
  const [searchTerm, setSearchTerm] = useState("");
  
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

  // Extract unique employees and trainings
  const employees = Array.from(new Set(matrixData.map(e => e.employeeName).filter(Boolean))).sort();
  const trainings = Array.from(new Set(matrixData.map(e => e.trainingName))).sort();

  // Filter by search term
  const filteredEmployees = searchTerm
    ? employees.filter(emp => emp?.toLowerCase().includes(searchTerm.toLowerCase()))
    : employees;

  // Create lookup map for quick access
  const matrixMap = new Map<string, TrainingMatrixEntry>();
  matrixData.forEach(entry => {
    const key = `${entry.employeeName}-${entry.trainingName}`;
    matrixMap.set(key, entry);
  });

  const getEntry = (employee: string, training: string) => {
    return matrixMap.get(`${employee}-${training}`);
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

  const completedCount = (employee: string | null) => {
    if (!employee) return 0;
    return trainings.filter(training => {
      const entry = getEntry(employee, training);
      return entry?.status === 'COMPLETED';
    }).length;
  };

  const totalTrainings = trainings.length;

  return (
    <div className="p-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Employee Training Matrix</CardTitle>
            <div className="flex items-center gap-4">
              <Input
                placeholder="Search employees..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64"
                data-testid="input-search-employees"
              />
              <Badge variant="outline" className="text-sm">
                {filteredEmployees.length} Employees × {totalTrainings} Trainings
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
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
                      className="p-3 text-left font-semibold min-w-[120px] border-l"
                      data-testid={`header-training-${training.replace(/\s+/g, '-').toLowerCase()}`}
                    >
                      <div className="transform -rotate-45 origin-left text-xs whitespace-nowrap">
                        {training}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee) => {
                  const completed = completedCount(employee);
                  const percentage = Math.round((completed / totalTrainings) * 100);
                  
                  return (
                    <tr
                      key={employee}
                      className="border-b hover:bg-muted/50"
                      data-testid={`row-employee-${employee?.replace(/\s+/g, '-').toLowerCase()}`}
                    >
                      <td className="sticky left-0 bg-background z-10 p-3 font-medium">
                        {employee}
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
                        const entry = getEntry(employee!, training);
                        const isCompleted = entry?.status === 'COMPLETED';
                        const date = formatDate(entry?.lastCompleted || null);
                        
                        return (
                          <td
                            key={training}
                            className="p-3 text-center border-l"
                            data-testid={`cell-${employee?.replace(/\s+/g, '-').toLowerCase()}-${training.replace(/\s+/g, '-').toLowerCase()}`}
                          >
                            {isCompleted ? (
                              <div className="flex flex-col items-center gap-1">
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
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
