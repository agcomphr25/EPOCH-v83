import { useListEmployees } from "@workspace/api-client-react";
import { EmployeeLayout } from "@/components/layout/employee-layout";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { User, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";

export default function EmployeeLanding() {
  const { data: employees = [], isLoading } = useListEmployees({ status: "active" });
  const [search, setSearch] = useState("");

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => 
      `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      emp.employeeNumber?.toLowerCase().includes(search.toLowerCase())
    );
  }, [employees, search]);

  return (
    <EmployeeLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-2 mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Select Profile</h1>
          <p className="text-muted-foreground">Choose your name to access your employee dashboard</p>
        </div>

        <div className="relative max-w-md mx-auto mb-8">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            className="pl-9 h-12 text-lg bg-background" 
            placeholder="Search by name or ID..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading employees...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEmployees.map(emp => (
              <Link key={emp.id} href={`/employee/${emp.id}`}>
                <Card className="card-lift hover:border-primary cursor-pointer group h-full">
                  <CardContent className="p-6 flex items-center gap-4">
                    <div className="bg-primary/10 p-3 rounded-full group-hover:bg-primary/20 transition-colors duration-200">
                      <User className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <div className="font-semibold text-lg group-hover:text-primary transition-colors duration-200">
                        {emp.firstName} {emp.lastName}
                      </div>
                      {(emp.department || emp.jobTitle) && (
                        <div className="text-sm text-muted-foreground">
                          {[emp.department, emp.jobTitle].filter(Boolean).join(" - ")}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
            
            {filteredEmployees.length === 0 && (
              <div className="col-span-full text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                No employees found matching "{search}"
              </div>
            )}
          </div>
        )}
      </div>
    </EmployeeLayout>
  );
}
