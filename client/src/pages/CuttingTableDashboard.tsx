import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Scissors, 
  Package, 
  Thermometer, 
  MapPin, 
  Calendar, 
  Users, 
  AlertTriangle,
  TrendingUp,
  Clock,
  Building,
  Snowflake
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';

export default function CuttingTableDashboard() {
  const [, setLocation] = useLocation();

  // Get summary data from various endpoints
  const { data: packetQueue = [] } = useQuery<any[]>({
    queryKey: ['/api/packet-cutting-queue'],
  });

  const { data: materialInventory = [] } = useQuery<any[]>({
    queryKey: ['/api/material-inventory'],
  });

  const { data: defrostSchedule = [] } = useQuery<any[]>({
    queryKey: ['/api/defrost-schedule'],
  });

  // Calculate summary metrics
  const pendingPackets = packetQueue.filter((task: any) => !task.isCompleted).length;
  const completedPackets = packetQueue.filter((task: any) => task.isCompleted).length;
  const lowStockMaterials = materialInventory.filter((material: any) => 
    material.currentStock <= material.minimumStock
  ).length;
  const upcomingDefrost = defrostSchedule.filter((schedule: any) => 
    schedule.status === 'scheduled' && new Date(schedule.scheduledDate) <= new Date(Date.now() + 7*24*60*60*1000)
  ).length;

  const navigationCards = [
    {
      title: "P1 Packet Manager",
      description: "Manage P1 carbon fiber and fiberglass packet cutting",
      icon: Package,
      color: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300",
      iconColor: "text-blue-600 dark:text-blue-400",
      path: "/department-queue/cutting-table",
      metrics: [
        { label: "Pending", value: pendingPackets, color: "text-orange-600" },
        { label: "Completed", value: completedPackets, color: "text-green-600" }
      ]
    },
    {
      title: "P2 Packet Manager", 
      description: "Manage P2 OEM/supplier packet cutting operations",
      icon: Package,
      color: "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300",
      iconColor: "text-purple-600 dark:text-purple-400", 
      path: "/cutting-table/p2-packets",
      metrics: [
        { label: "P2 Tasks", value: 0, color: "text-purple-600" },
        { label: "OEM Orders", value: 0, color: "text-blue-600" }
      ]
    },
    {
      title: "Material Tracker",
      description: "Track CF, FG materials inventory and locations",
      icon: MapPin,
      color: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300",
      iconColor: "text-green-600 dark:text-green-400",
      path: "/cutting-table/material-tracker",
      metrics: [
        { label: "Materials", value: materialInventory.length, color: "text-green-600" },
        { label: "Low Stock", value: lowStockMaterials, color: "text-red-600" }
      ]
    },
    {
      title: "Defrost Schedule",
      description: "Schedule and track freezer defrost cycles",
      icon: Snowflake,
      color: "bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800 text-cyan-700 dark:text-cyan-300",
      iconColor: "text-cyan-600 dark:text-cyan-400",
      path: "/cutting-table/defrost-schedule", 
      metrics: [
        { label: "Freezers", value: 20, color: "text-cyan-600" },
        { label: "This Week", value: upcomingDefrost, color: "text-orange-600" }
      ]
    },
    {
      title: "Cutting Schedule",
      description: "Overall cutting operations schedule and planning",
      icon: Calendar,
      color: "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300",
      iconColor: "text-orange-600 dark:text-orange-400",
      path: "/cutting-table/schedule",
      metrics: [
        { label: "Today", value: 0, color: "text-orange-600" },
        { label: "Week", value: 0, color: "text-blue-600" }
      ]
    },
    {
      title: "Reports & Analytics",
      description: "Cutting efficiency and material usage reports",
      icon: TrendingUp,
      color: "bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300",
      iconColor: "text-gray-600 dark:text-gray-400",
      path: "/cutting-table/reports",
      metrics: [
        { label: "Efficiency", value: "94%", color: "text-green-600" },
        { label: "Waste", value: "6%", color: "text-red-600" }
      ]
    }
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-8">
        <Scissors className="h-8 w-8 text-primary" />
        <h1 className="text-4xl font-bold">Cutting Table Dashboard</h1>
      </div>

      {/* Alert Summary Bar */}
      <Card className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <span className="font-medium text-yellow-800 dark:text-yellow-200">System Status</span>
            </div>
            
            <div className="flex flex-wrap gap-4">
              {lowStockMaterials > 0 && (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <Package className="h-3 w-3" />
                  {lowStockMaterials} Low Stock Alert{lowStockMaterials > 1 ? 's' : ''}
                </Badge>
              )}
              
              {upcomingDefrost > 0 && (
                <Badge variant="secondary" className="flex items-center gap-1 bg-cyan-100 text-cyan-800">
                  <Snowflake className="h-3 w-3" />
                  {upcomingDefrost} Defrost{upcomingDefrost > 1 ? 's' : ''} This Week
                </Badge>
              )}
              
              {pendingPackets > 0 && (
                <Badge className="flex items-center gap-1 bg-blue-100 text-blue-800">
                  <Scissors className="h-3 w-3" />
                  {pendingPackets} Packet{pendingPackets > 1 ? 's' : ''} Pending
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Navigation Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {navigationCards.map((card, index) => {
          const Icon = card.icon;
          
          return (
            <Card 
              key={index}
              className={`${card.color} hover:shadow-lg transition-all duration-200 cursor-pointer group`}
              onClick={() => setLocation(card.path)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Icon className={`h-6 w-6 ${card.iconColor}`} />
                    <CardTitle className="text-lg">{card.title}</CardTitle>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      →
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm opacity-75 mb-4">
                  {card.description}
                </p>
                
                {/* Metrics */}
                <div className="flex justify-between items-center">
                  {card.metrics.map((metric, metricIndex) => (
                    <div key={metricIndex} className="text-center">
                      <div className={`text-2xl font-bold ${metric.color}`}>
                        {metric.value}
                      </div>
                      <div className="text-xs opacity-75">
                        {metric.label}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="text-center">
          <CardContent className="pt-6">
            <Building className="h-8 w-8 mx-auto text-blue-600 mb-2" />
            <div className="text-2xl font-bold text-blue-600">3</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Buildings</div>
          </CardContent>
        </Card>

        <Card className="text-center">
          <CardContent className="pt-6">
            <Users className="h-8 w-8 mx-auto text-green-600 mb-2" />
            <div className="text-2xl font-bold text-green-600">8</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Active Cutters</div>
          </CardContent>
        </Card>

        <Card className="text-center">
          <CardContent className="pt-6">
            <Clock className="h-8 w-8 mx-auto text-orange-600 mb-2" />
            <div className="text-2xl font-bold text-orange-600">16</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Hours/Day</div>
          </CardContent>
        </Card>

        <Card className="text-center">
          <CardContent className="pt-6">
            <TrendingUp className="h-8 w-8 mx-auto text-purple-600 mb-2" />
            <div className="text-2xl font-bold text-purple-600">94%</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Efficiency</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}