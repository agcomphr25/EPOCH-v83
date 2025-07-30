import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Factory, List, Settings } from "lucide-react";
import LayupScheduler from "../components/LayupScheduler";

export default function LayupDepartmentPage() {
  const [activeTab, setActiveTab] = useState("scheduler");

  return (
    <div className="max-w-[95vw] mx-auto space-y-6">
      {/* Department Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="bg-blue-100 p-3 rounded-lg">
            <Factory className="h-8 w-8 text-blue-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Layup Department</h1>
            <p className="text-gray-600">Production scheduling and queue management</p>
          </div>
        </div>
        
        {/* Department Status */}
        <div className="flex items-center space-x-4">
          <div className="text-right">
            <div className="text-sm text-gray-500">Department Status</div>
            <div className="text-lg font-semibold text-green-600">Active</div>
          </div>
        </div>
      </div>

      {/* Department Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="scheduler" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Production Scheduler
          </TabsTrigger>
          <TabsTrigger value="queue" className="flex items-center gap-2">
            <List className="h-4 w-4" />
            Department Queue
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Department Settings
          </TabsTrigger>
        </TabsList>

        {/* Production Scheduler Tab */}
        <TabsContent value="scheduler" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Layup Production Scheduler
              </CardTitle>
              <CardDescription>
                Schedule orders for layup production using drag-and-drop interface. 
                Automatically assigns orders to available molds based on compatibility and capacity.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {/* Full LayupScheduler Component */}
              <LayupScheduler />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Department Queue Tab */}
        <TabsContent value="queue" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <List className="h-5 w-5" />
                Layup Department Queue
              </CardTitle>
              <CardDescription>
                View and manage orders currently in the layup department queue
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-gray-500">
                <Factory className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <h3 className="text-lg font-medium mb-2">Department Queue View</h3>
                <p className="text-sm">
                  This will show orders currently assigned to layup department with status tracking.
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  Integration with existing layup-plugging queue system coming soon.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Department Settings Tab */}
        <TabsContent value="settings" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Mold Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Mold Configuration
                </CardTitle>
                <CardDescription>
                  Configure molds available in the layup department
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-gray-500">
                  <p className="text-sm">
                    Mold settings are managed within the Production Scheduler.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setActiveTab("scheduler")}
                    className="mt-4"
                  >
                    Go to Scheduler Settings
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Employee Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Factory className="h-5 w-5" />
                  Employee Configuration
                </CardTitle>
                <CardDescription>
                  Configure employees working in layup department
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-gray-500">
                  <p className="text-sm">
                    Employee settings are managed within the Production Scheduler.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setActiveTab("scheduler")}
                    className="mt-4"
                  >
                    Go to Scheduler Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}