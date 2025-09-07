import React, { useState } from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Scissors, ArrowRight, Package, CheckCircle, AlertTriangle, FileText, Eye, User, Calendar } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { getDisplayOrderId } from '@/lib/orderUtils';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';

interface CuttingRequirement {
  id: number;
  orderId: string;
  materialId: number;
  componentId: number;
  cutsRequired: number;
  cutsCompleted: number;
  isCompleted: boolean;
  assignedTo: string | null;
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined data
  materialName: string;
  materialType: string;
  yieldPerCut: number;
  wasteFactor: number;
  componentName: string;
  quantityRequired: number;
  categoryName: string;
  isP1: boolean;
  // Order data
  orderDate: string;
  dueDate: string;
  customerId: string;
  modelId: string;
  currentDepartment: string;
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
  const [selectedRequirements, setSelectedRequirements] = useState<Set<number>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(null);
  const [assignedEmployee, setAssignedEmployee] = useState<string>('');
  const [completionNotes, setCompletionNotes] = useState<string>('');
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Get cutting requirements for orders
  const { data: cuttingRequirements = [], isLoading } = useQuery({
    queryKey: ['/api/cutting-requirements'],
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  // Get cutting materials for reference
  const { data: cuttingMaterials = [] } = useQuery({
    queryKey: ['/api/cutting-materials'],
  });

  // Get current department counts for summary
  const { data: allOrders = [] } = useQuery({
    queryKey: ['/api/orders/all'],
  });

  // Filter orders by current department for summary cards
  const layupCount = allOrders.filter((order: any) => order.currentDepartment === 'Layup').length;
  const barcodeCount = allOrders.filter((order: any) => order.currentDepartment === 'Barcode').length;
  const cuttingCount = cuttingRequirements.filter((req: CuttingRequirement) => !req.isCompleted).length;

  // Multi-select functions
  const toggleRequirementSelection = (requirementId: number) => {
    setSelectedRequirements(prev => {
      const newSet = new Set(prev);
      if (newSet.has(requirementId)) {
        newSet.delete(requirementId);
      } else {
        newSet.add(requirementId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedRequirements(new Set());
    } else {
      const incompleteRequirements = cuttingRequirements
        .filter((req: CuttingRequirement) => !req.isCompleted)
        .map((req: CuttingRequirement) => req.id);
      setSelectedRequirements(new Set(incompleteRequirements));
    }
    setSelectAll(!selectAll);
  };

  // Mutation for completing cutting requirements
  const completeCuttingRequirements = useMutation({
    mutationFn: async (data: { requirementIds: number[], assignedTo?: string, notes?: string }) => {
      const response = await fetch('/api/cutting-requirements/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to complete cutting requirements');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-requirements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
      setSelectedRequirements(new Set());
      setSelectAll(false);
      setAssignedEmployee('');
      setCompletionNotes('');
      toast({
        title: "Success",
        description: `${selectedRequirements.size} cutting requirement(s) completed`,
      });
    },
    onError: (error) => {
      console.error('Error completing cutting requirements:', error);
      toast({
        title: "Error",
        description: "Failed to complete cutting requirements",
        variant: "destructive"
      });
    }
  });

  // Mutation for progressing orders to next department
  const progressOrdersToNextDepartment = useMutation({
    mutationFn: async (orderIds: string[]) => {
      const response = await fetch('/api/cutting-table/progress-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds }),
      });
      if (!response.ok) throw new Error('Failed to progress orders');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-requirements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
      toast({
        title: "Success",
        description: `${data.progressedOrders} order(s) progressed to next department`,
      });
    },
    onError: (error) => {
      console.error('Error progressing orders:', error);
      toast({
        title: "Error",
        description: "Failed to progress orders to next department",
        variant: "destructive"
      });
    }
  });

  const handleCompleteSelected = () => {
    if (selectedRequirements.size === 0) {
      toast({
        title: "No requirements selected",
        description: "Please select cutting requirements to complete",
        variant: "destructive"
      });
      return;
    }

    completeCuttingRequirements.mutate({
      requirementIds: Array.from(selectedRequirements),
      assignedTo: assignedEmployee || undefined,
      notes: completionNotes || undefined,
    });
  };

  // Auto-select order when scanned
  const handleOrderScanned = (orderId: string) => {
    const orderRequirements = cuttingRequirements.filter(
      (req: CuttingRequirement) => req.orderId === orderId && !req.isCompleted
    );
    
    if (orderRequirements.length > 0) {
      const requirementIds = orderRequirements.map(req => req.id);
      setSelectedRequirements(new Set(requirementIds));
      setHighlightedOrderId(orderId);
      setTimeout(() => setHighlightedOrderId(null), 3000);
      toast({
        title: "Order requirements selected",
        description: `${requirementIds.length} cutting requirement(s) for order ${orderId} selected`,
      });
    } else {
      toast({
        title: "No requirements found",
        description: `Order ${orderId} has no pending cutting requirements`,
        variant: "destructive"
      });
    }
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

  // Get priority styling based on due date
  const getPriorityInfo = (dueDate: string) => {
    const due = new Date(dueDate);
    const now = new Date();
    const daysDiff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff < 0) {
      return { label: 'OVERDUE', color: 'bg-red-100 dark:bg-red-900/20 border-red-300 dark:border-red-700 text-red-800 dark:text-red-200' };
    } else if (daysDiff === 0) {
      return { label: 'DUE TODAY', color: 'bg-orange-100 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700 text-orange-800 dark:text-orange-200' };
    } else if (daysDiff <= 3) {
      return { label: 'DUE SOON', color: 'bg-yellow-100 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-200' };
    } else {
      return { label: 'ON TIME', color: 'bg-green-100 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-800 dark:text-green-200' };
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Scissors className="h-6 w-6" />
        <h1 className="text-3xl font-bold">Cutting Table Manager</h1>
      </div>

      {/* Barcode Scanner */}
      <BarcodeScanner onOrderScanned={handleOrderScanned} />

      {/* Department Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {/* Current Cutting Queue */}
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-blue-700 dark:text-blue-300 flex items-center gap-2">
              <Scissors className="h-5 w-5" />
              Cutting Queue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {cuttingCount}
            </div>
            <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
              Requirements pending
            </p>
          </CardContent>
        </Card>

        {/* Next Department - Layup */}
        <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-green-700 dark:text-green-300 flex items-center gap-2">
              <Package className="h-5 w-5" />
              Layup/Plugging
              <ArrowRight className="h-5 w-5" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {layupCount}
            </div>
            <p className="text-sm text-green-600 dark:text-green-400 mt-1">
              Orders in next department
            </p>
          </CardContent>
        </Card>

        {/* Barcode Department */}
        <Card className="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-purple-700 dark:text-purple-300 flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Barcode
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
              {barcodeCount}
            </div>
            <p className="text-sm text-purple-600 dark:text-purple-400 mt-1">
              Orders in Barcode department
            </p>
          </CardContent>
        </Card>

        {/* Materials Summary */}
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
      {selectedRequirements.size > 0 && (
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-blue-600" />
                <span className="font-medium text-blue-800 dark:text-blue-200">
                  {selectedRequirements.size} requirement(s) selected
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
                    <DialogTitle>Cutting Completion Notes</DialogTitle>
                  </DialogHeader>
                  <Textarea
                    placeholder="Enter notes about the cutting process, material quality, issues encountered, etc."
                    value={completionNotes}
                    onChange={(e) => setCompletionNotes(e.target.value)}
                    rows={4}
                  />
                </DialogContent>
              </Dialog>

              <Button 
                onClick={handleCompleteSelected}
                disabled={completeCuttingRequirements.isPending}
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
          disabled={cuttingRequirements.filter((req: CuttingRequirement) => !req.isCompleted).length === 0}
        />
        <label htmlFor="select-all" className="text-sm font-medium">
          Select all incomplete requirements ({cuttingRequirements.filter((req: CuttingRequirement) => !req.isCompleted).length})
        </label>
      </div>

      {/* Cutting Requirements List */}
      <div className="space-y-4">
        {isLoading ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-gray-500">Loading cutting requirements...</div>
            </CardContent>
          </Card>
        ) : cuttingRequirements.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-gray-500">
                <Scissors className="h-12 w-12 mx-auto mb-4 opacity-50" />
                No cutting requirements found
              </div>
            </CardContent>
          </Card>
        ) : (
          cuttingRequirements.map((requirement: CuttingRequirement) => {
            const priority = getPriorityInfo(requirement.dueDate);
            const isHighlighted = highlightedOrderId === requirement.orderId;
            const isSelected = selectedRequirements.has(requirement.id);

            return (
              <Card 
                key={requirement.id} 
                className={`transition-all duration-200 ${
                  isHighlighted ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''
                } ${
                  isSelected ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600' : ''
                } ${
                  requirement.isCompleted ? 'opacity-60' : ''
                } ${priority.color}`}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleRequirementSelection(requirement.id)}
                      disabled={requirement.isCompleted}
                      className="mt-1"
                    />
                    
                    <div className="flex-1 space-y-3">
                      {/* Header Row */}
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold">
                            {getDisplayOrderId({ orderId: requirement.orderId })}
                          </span>
                          <Badge className={getMaterialTypeBadgeColor(requirement.materialType)}>
                            {requirement.materialType}
                          </Badge>
                          <Badge variant="outline">
                            {requirement.categoryName}
                          </Badge>
                          {requirement.isCompleted && (
                            <Badge className="bg-green-600 text-white">
                              COMPLETED
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <Calendar className="h-4 w-4" />
                          Due: {format(new Date(requirement.dueDate), 'MMM dd, yyyy')}
                        </div>
                      </div>

                      {/* Material and Component Info */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="font-medium text-gray-700 dark:text-gray-300">Material</div>
                          <div>{requirement.materialName}</div>
                          <div className="text-gray-500">
                            Yield: {requirement.yieldPerCut} per cut | Waste: {(requirement.wasteFactor * 100).toFixed(1)}%
                          </div>
                        </div>
                        
                        <div>
                          <div className="font-medium text-gray-700 dark:text-gray-300">Component</div>
                          <div>{requirement.componentName}</div>
                          <div className="text-gray-500">
                            Qty Required: {requirement.quantityRequired}
                          </div>
                        </div>
                        
                        <div>
                          <div className="font-medium text-gray-700 dark:text-gray-300">Cutting Progress</div>
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-bold">
                              {requirement.cutsCompleted} / {requirement.cutsRequired}
                            </span>
                            <span className="text-gray-500">cuts</span>
                          </div>
                          {requirement.assignedTo && (
                            <div className="flex items-center gap-1 text-gray-500">
                              <User className="h-3 w-3" />
                              {requirement.assignedTo}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Notes */}
                      {requirement.notes && (
                        <div className="text-sm">
                          <div className="font-medium text-gray-700 dark:text-gray-300">Notes</div>
                          <div className="text-gray-600 dark:text-gray-400">{requirement.notes}</div>
                        </div>
                      )}

                      {/* Completion Info */}
                      {requirement.isCompleted && requirement.completedAt && (
                        <div className="text-sm text-green-600 dark:text-green-400">
                          Completed: {format(new Date(requirement.completedAt), 'MMM dd, yyyy HH:mm')}
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