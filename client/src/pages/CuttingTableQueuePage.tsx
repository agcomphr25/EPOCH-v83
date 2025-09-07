import React, { useState } from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Scissors, ArrowRight, Package, CheckCircle, AlertTriangle, FileText, Eye, User, Calendar, Plus, RefreshCw } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';

interface PacketCuttingTask {
  id: number;
  packetTypeId: number;
  materialId: number;
  packetsNeeded: number;
  packetsCut: number;
  priorityLevel: number;
  requestedBy: string | null;
  assignedTo: string | null;
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
  // Joined data
  packetName: string;
  packetMaterialType: string;
  packetDescription: string;
  materialName: string;
  materialType: string;
  yieldPerCut: number;
  wasteFactor: number;
}

interface PacketType {
  id: number;
  packetName: string;
  materialType: string;
  description: string;
  isActive: boolean;
}

interface CuttingMaterial {
  id: number;
  materialName: string;
  materialType: string;
  yieldPerCut: number;
  wasteFactor: number;
  description: string | null;
  isActive: boolean;
}

export default function CuttingTableQueuePage() {
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [highlightedTaskId, setHighlightedTaskId] = useState<number | null>(null);
  const [assignedEmployee, setAssignedEmployee] = useState<string>('');
  const [completionNotes, setCompletionNotes] = useState<string>('');
  const [showAddRequest, setShowAddRequest] = useState(false);
  const [packetsMadeInputs, setPacketsMadeInputs] = useState<Record<number, string>>({});
  const [newRequest, setNewRequest] = useState({
    packetTypeId: '',
    materialId: '',
    packetsNeeded: '',
    priorityLevel: 1,
    requestedBy: '',
    notes: ''
  });
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Get packet cutting queue
  const { data: packetCuttingQueue = [], isLoading } = useQuery<PacketCuttingTask[]>({
    queryKey: ['/api/packet-cutting-queue'],
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  // Get packet types
  const { data: packetTypes = [] } = useQuery<PacketType[]>({
    queryKey: ['/api/packet-types'],
  });

  // Get cutting materials
  const { data: cuttingMaterials = [] } = useQuery<CuttingMaterial[]>({
    queryKey: ['/api/cutting-materials'],
  });

  // Calculate summary counts
  const pendingTasks = packetCuttingQueue.filter(task => !task.isCompleted);
  const completedTasks = packetCuttingQueue.filter(task => task.isCompleted);
  const totalPacketsNeeded = packetCuttingQueue.reduce((sum, task) => sum + task.packetsNeeded, 0);
  const totalPacketsCut = packetCuttingQueue.reduce((sum, task) => sum + task.packetsCut, 0);

  // Multi-select functions
  const toggleTaskSelection = (taskId: number) => {
    setSelectedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedTasks(new Set());
    } else {
      const incompleteTasks = pendingTasks.map(task => task.id);
      setSelectedTasks(new Set(incompleteTasks));
    }
    setSelectAll(!selectAll);
  };

  // Mutation for completing packet cutting tasks
  const completePacketCuttingTasks = useMutation({
    mutationFn: async (data: { queueIds: number[], assignedTo?: string, notes?: string }) => {
      const response = await fetch('/api/packet-cutting-queue/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to complete packet cutting tasks');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/packet-cutting-queue'] });
      setSelectedTasks(new Set());
      setSelectAll(false);
      setAssignedEmployee('');
      setCompletionNotes('');
      toast({
        title: "Success",
        description: `${selectedTasks.size} packet cutting task(s) completed`,
      });
    },
    onError: (error) => {
      console.error('Error completing packet cutting tasks:', error);
      toast({
        title: "Error",
        description: "Failed to complete packet cutting tasks",
        variant: "destructive"
      });
    }
  });

  // Mutation for adding new packet cutting request
  const addPacketRequest = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/packet-cutting-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          packetTypeId: parseInt(data.packetTypeId),
          materialId: parseInt(data.materialId),
          packetsNeeded: parseInt(data.packetsNeeded),
        }),
      });
      if (!response.ok) throw new Error('Failed to add packet request');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/packet-cutting-queue'] });
      setShowAddRequest(false);
      setNewRequest({
        packetTypeId: '',
        materialId: '',
        packetsNeeded: '',
        priorityLevel: 1,
        requestedBy: '',
        notes: ''
      });
      toast({
        title: "Success",
        description: "New packet cutting request added",
      });
    },
    onError: (error) => {
      console.error('Error adding packet request:', error);
      toast({
        title: "Error",
        description: "Failed to add packet cutting request",
        variant: "destructive"
      });
    }
  });

  // Mutation for auto-populating packet cutting from production orders
  const autoPopulatePackets = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/packet-cutting-queue/auto-populate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Failed to auto-populate packets');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/packet-cutting-queue'] });
      toast({
        title: "Success",
        description: `Auto-populated ${data.packetTypesCreated} packet types from ${data.ordersAnalyzed} production orders`,
      });
    },
    onError: (error) => {
      console.error('Error auto-populating packets:', error);
      toast({
        title: "Error",
        description: "Failed to auto-populate packet cutting requirements",
        variant: "destructive"
      });
    }
  });

  // Mutation for updating individual packet progress
  const updatePacketProgress = useMutation({
    mutationFn: async (data: { taskId: number, packetsMade: number, currentPackets: number }) => {
      console.log('Updating packet progress:', data);
      const newTotal = data.currentPackets + data.packetsMade;
      const response = await fetch(`/api/packet-cutting-queue/${data.taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queueId: data.taskId,
          packetsCut: newTotal  // Send new total, not additional packets
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Update failed:', errorText);
        throw new Error('Failed to update packet progress');
      }
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/packet-cutting-queue'] });
      // Clear the input for this task
      setPacketsMadeInputs(prev => ({
        ...prev,
        [variables.taskId]: ''
      }));
      toast({
        title: "Success",
        description: `Updated packet progress`,
      });
    },
    onError: (error) => {
      console.error('Error updating packet progress:', error);
      toast({
        title: "Error",
        description: "Failed to update packet progress",
        variant: "destructive"
      });
    }
  });

  const handleUpdateProgress = (taskId: number) => {
    const packetsMadeStr = packetsMadeInputs[taskId] || '0';
    const packetsMade = parseInt(packetsMadeStr);
    
    if (isNaN(packetsMade) || packetsMade < 0) {
      toast({
        title: "Invalid input",
        description: "Please enter a valid number of packets made",
        variant: "destructive"
      });
      return;
    }

    // Find the current task to get current packet count
    const currentTask = packetCuttingQueue.find(task => task.id === taskId);
    if (!currentTask) {
      toast({
        title: "Error",
        description: "Task not found",
        variant: "destructive"
      });
      return;
    }

    updatePacketProgress.mutate({
      taskId,
      packetsMade,
      currentPackets: currentTask.packetsCut
    });
  };

  const handleCompleteSelected = () => {
    if (selectedTasks.size === 0) {
      toast({
        title: "No tasks selected",
        description: "Please select packet cutting tasks to complete",
        variant: "destructive"
      });
      return;
    }

    completePacketCuttingTasks.mutate({
      queueIds: Array.from(selectedTasks),
      assignedTo: assignedEmployee || undefined,
      notes: completionNotes || undefined,
    });
  };

  const handleAddRequest = () => {
    if (!newRequest.packetTypeId || !newRequest.materialId || !newRequest.packetsNeeded) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    addPacketRequest.mutate(newRequest);
  };

  // Auto-select task when barcode scanned (can be extended for packet barcode scanning)
  const handleOrderScanned = (orderId: string) => {
    // For now, just show a message. Can be enhanced to select related packet tasks
    toast({
      title: "Barcode scanned",
      description: `Order ${orderId} scanned. Packet-based cutting doesn't use individual order scanning.`,
      variant: "default"
    });
  };

  // Get material type badge color
  const getMaterialTypeBadgeColor = (materialType: string) => {
    switch (materialType.toLowerCase()) {
      case 'carbon fiber': return 'bg-gray-800 hover:bg-gray-900 text-white';
      case 'fiberglass': return 'bg-blue-600 hover:bg-blue-700 text-white';
      case 'primtex': return 'bg-green-600 hover:bg-green-700 text-white';
      default: return 'bg-gray-500 hover:bg-gray-600 text-white';
    }
  };

  // Get priority badge color
  const getPriorityBadgeColor = (priority: number) => {
    switch (priority) {
      case 1: return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200';
      case 2: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200';
      case 3: return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-200';
      case 4: return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200';
      case 5: return 'bg-red-200 text-red-900 dark:bg-red-800/20 dark:text-red-100';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-200';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Scissors className="h-6 w-6" />
          <h1 className="text-3xl font-bold">Cutting Table Manager - P1 Packets</h1>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => autoPopulatePackets.mutate()}
            disabled={autoPopulatePackets.isPending}
            variant="outline" 
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${autoPopulatePackets.isPending ? 'animate-spin' : ''}`} />
            Auto-Populate from Orders
          </Button>
          <Button onClick={() => setShowAddRequest(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Packet Request
          </Button>
        </div>
      </div>

      {/* Barcode Scanner (for future enhancement) */}
      <BarcodeScanner onOrderScanned={handleOrderScanned} />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {/* Pending Tasks */}
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-blue-700 dark:text-blue-300 flex items-center gap-2">
              <Scissors className="h-5 w-5" />
              Pending Tasks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {pendingTasks.length}
            </div>
            <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
              Packet cutting tasks
            </p>
          </CardContent>
        </Card>

        {/* Completed Tasks */}
        <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-green-700 dark:text-green-300 flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {completedTasks.length}
            </div>
            <p className="text-sm text-green-600 dark:text-green-400 mt-1">
              Tasks completed
            </p>
          </CardContent>
        </Card>

        {/* Total Progress */}
        <Card className="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-purple-700 dark:text-purple-300 flex items-center gap-2">
              <Package className="h-5 w-5" />
              Packets Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
              {totalPacketsCut} / {totalPacketsNeeded}
            </div>
            <p className="text-sm text-purple-600 dark:text-purple-400 mt-1">
              Packets cut / needed
            </p>
          </CardContent>
        </Card>

        {/* Materials */}
        <Card className="bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Package className="h-5 w-5" />
              Materials
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-600 dark:text-gray-400">
              {cuttingMaterials.length}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Active materials
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      {selectedTasks.size > 0 && (
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-blue-600" />
                <span className="font-medium text-blue-800 dark:text-blue-200">
                  {selectedTasks.size} task(s) selected
                </span>
              </div>
              
              <Select value={assignedEmployee} onValueChange={setAssignedEmployee}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Assign to employee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TOMAS">Tomas</SelectItem>
                  <SelectItem value="AG">AG</SelectItem>
                  <SelectItem value="TIMMY">Timmy</SelectItem>
                  <SelectItem value="GLENN">Glenn</SelectItem>
                  <SelectItem value="BRAD">Brad</SelectItem>
                  <SelectItem value="JOEY">Joey</SelectItem>
                </SelectContent>
              </Select>

              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <FileText className="h-4 w-4 mr-2" />
                    Add Notes
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Packet Cutting Completion Notes</DialogTitle>
                  </DialogHeader>
                  <Textarea
                    placeholder="Enter notes about the packet cutting process, material quality, issues encountered, etc."
                    value={completionNotes}
                    onChange={(e) => setCompletionNotes(e.target.value)}
                    rows={4}
                  />
                </DialogContent>
              </Dialog>

              <Button 
                onClick={handleCompleteSelected}
                disabled={completePacketCuttingTasks.isPending}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Complete Cutting
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Select All */}
      <div className="flex items-center gap-2 mb-4">
        <Checkbox
          id="select-all"
          checked={selectAll}
          onCheckedChange={toggleSelectAll}
          disabled={pendingTasks.length === 0}
        />
        <label htmlFor="select-all" className="text-sm font-medium">
          Select all pending tasks ({pendingTasks.length})
        </label>
      </div>

      {/* Add New Request Dialog */}
      <Dialog open={showAddRequest} onOpenChange={setShowAddRequest}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Packet Cutting Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="packet-type">Packet Type</Label>
              <Select value={newRequest.packetTypeId} onValueChange={(value) => setNewRequest(prev => ({ ...prev, packetTypeId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select packet type" />
                </SelectTrigger>
                <SelectContent>
                  {packetTypes.map(type => (
                    <SelectItem key={type.id} value={type.id.toString()}>
                      {type.packetName} ({type.materialType})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="material">Material</Label>
              <Select value={newRequest.materialId} onValueChange={(value) => setNewRequest(prev => ({ ...prev, materialId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select material" />
                </SelectTrigger>
                <SelectContent>
                  {cuttingMaterials.map(material => (
                    <SelectItem key={material.id} value={material.id.toString()}>
                      {material.materialName} ({material.materialType})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="packets-needed">Packets Needed</Label>
              <Input
                id="packets-needed"
                type="number"
                min="1"
                value={newRequest.packetsNeeded}
                onChange={(e) => setNewRequest(prev => ({ ...prev, packetsNeeded: e.target.value }))}
                placeholder="Enter number of packets needed"
              />
            </div>

            <div>
              <Label htmlFor="priority">Priority Level</Label>
              <Select value={newRequest.priorityLevel.toString()} onValueChange={(value) => setNewRequest(prev => ({ ...prev, priorityLevel: parseInt(value) }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Low (1)</SelectItem>
                  <SelectItem value="2">Normal (2)</SelectItem>
                  <SelectItem value="3">High (3)</SelectItem>
                  <SelectItem value="4">Urgent (4)</SelectItem>
                  <SelectItem value="5">Critical (5)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="requested-by">Requested By</Label>
              <Input
                id="requested-by"
                value={newRequest.requestedBy}
                onChange={(e) => setNewRequest(prev => ({ ...prev, requestedBy: e.target.value }))}
                placeholder="Enter requestor name"
              />
            </div>

            <div>
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={newRequest.notes}
                onChange={(e) => setNewRequest(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes or requirements"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddRequest(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddRequest} disabled={addPacketRequest.isPending}>
                Add Request
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Packet Cutting Queue List */}
      <div className="space-y-4">
        {isLoading ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-gray-500">Loading packet cutting queue...</div>
            </CardContent>
          </Card>
        ) : packetCuttingQueue.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-gray-500">
                <Scissors className="h-12 w-12 mx-auto mb-4 opacity-50" />
                No packet cutting tasks found
              </div>
            </CardContent>
          </Card>
        ) : (
          packetCuttingQueue.map(task => {
            const isHighlighted = highlightedTaskId === task.id;
            const isSelected = selectedTasks.has(task.id);
            const progress = task.packetsNeeded > 0 ? (task.packetsCut / task.packetsNeeded) * 100 : 0;

            return (
              <Card 
                key={task.id} 
                className={`transition-all duration-200 ${
                  isHighlighted ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''
                } ${
                  isSelected ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600' : ''
                } ${
                  task.isCompleted ? 'opacity-60' : ''
                }`}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleTaskSelection(task.id)}
                      disabled={task.isCompleted}
                      className="mt-1"
                    />
                    
                    <div className="flex-1 space-y-3">
                      {/* Header Row */}
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold">
                            {task.packetName}
                          </span>
                          <Badge className={getMaterialTypeBadgeColor(task.materialType)}>
                            {task.materialType}
                          </Badge>
                          <Badge className={getPriorityBadgeColor(task.priorityLevel)}>
                            Priority {task.priorityLevel}
                          </Badge>
                          {task.isCompleted && (
                            <Badge className="bg-green-600 text-white">
                              COMPLETED
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <Calendar className="h-4 w-4" />
                          Created: {format(new Date(task.createdAt), 'MMM dd, yyyy')}
                        </div>
                      </div>

                      {/* Progress and Details */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="font-medium text-gray-700 dark:text-gray-300">Material</div>
                          <div>{task.materialName}</div>
                          <div className="text-gray-500">
                            Yield: {task.yieldPerCut} per cut | Waste: {(task.wasteFactor * 100).toFixed(1)}%
                          </div>
                        </div>
                        
                        <div>
                          <div className="font-medium text-gray-700 dark:text-gray-300">Cutting Progress</div>
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-bold">
                              {task.packetsCut} / {task.packetsNeeded}
                            </span>
                            <span className="text-gray-500">packets</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                            <div 
                              className="bg-blue-600 h-2 rounded-full" 
                              style={{ width: `${Math.min(progress, 100)}%` }}
                            ></div>
                          </div>
                          
                          {/* Add Packets Made Input */}
                          {!task.isCompleted && (
                            <div className="flex items-center gap-2 mt-2">
                              <Input
                                type="number"
                                min="0"
                                placeholder="Packets made"
                                className="w-24 h-8 text-sm"
                                value={packetsMadeInputs[task.id] || ''}
                                onChange={(e) => setPacketsMadeInputs(prev => ({
                                  ...prev,
                                  [task.id]: e.target.value
                                }))}
                              />
                              <Button
                                size="sm"
                                onClick={() => handleUpdateProgress(task.id)}
                                disabled={updatePacketProgress.isPending}
                                className="h-8 px-3 text-xs"
                              >
                                Add
                              </Button>
                            </div>
                          )}
                        </div>
                        
                        <div>
                          <div className="font-medium text-gray-700 dark:text-gray-300">Assignment</div>
                          {task.assignedTo ? (
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {task.assignedTo}
                            </div>
                          ) : (
                            <span className="text-gray-500">Unassigned</span>
                          )}
                          {task.requestedBy && (
                            <div className="text-gray-500 text-xs">
                              Requested by: {task.requestedBy}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Notes */}
                      {task.notes && (
                        <div className="text-sm">
                          <div className="font-medium text-gray-700 dark:text-gray-300">Notes</div>
                          <div className="text-gray-600 dark:text-gray-400">{task.notes}</div>
                        </div>
                      )}

                      {/* Completion Info */}
                      {task.isCompleted && task.completedAt && (
                        <div className="text-sm text-green-600 dark:text-green-400">
                          Completed: {format(new Date(task.completedAt), 'MMM dd, yyyy HH:mm')}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}