import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Users, Send } from 'lucide-react';

export default function AssignProgramPage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/training/programs">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Assign Training Program</h1>
            <p className="text-muted-foreground">
              Assign training programs to employees
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Select Program</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Choose a training program to assign
            </p>
            <select className="w-full p-2 border rounded-md">
              <option value="">Select a program...</option>
            </select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Select Employees
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Choose employees to receive this training
            </p>
            <div className="border rounded-md p-4 min-h-[200px]">
              <p className="text-sm text-muted-foreground">No employees selected</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assignment Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Start Date</label>
              <input 
                type="date" 
                className="w-full mt-1 p-2 border rounded-md"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Due Date</label>
              <input 
                type="date" 
                className="w-full mt-1 p-2 border rounded-md"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button>
              <Send className="h-4 w-4 mr-2" />
              Assign Program
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
