import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Edit3, Plus, Calendar, Percent } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import type { ShortTermSale } from '@shared/schema';

interface DiscountAdminProps {
  onSalesChange?: (sales: ShortTermSale[]) => void;
}

export default function DiscountAdmin({ onSalesChange }: DiscountAdminProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Fetch short term sales from database
  const { data: sales = [], isLoading } = useQuery({
    queryKey: ['/api/short-term-sales'],
    queryFn: () => apiRequest('/api/short-term-sales'),
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/short-term-sales', {
      method: 'POST',
      body: data,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/short-term-sales'] });
      setFormSale({ id: null, name: '', percent: 0, startDate: '', endDate: '', appliesTo: 'total' });
      toast({ title: "Success", description: "Short-term sale created successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create short-term sale", variant: "destructive" });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => 
      apiRequest(`/api/short-term-sales/${id}`, {
        method: 'PUT',
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/short-term-sales'] });
      setFormSale({ id: null, name: '', percent: 0, startDate: '', endDate: '', appliesTo: 'total' });
      toast({ title: "Success", description: "Short-term sale updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update short-term sale", variant: "destructive" });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/short-term-sales/${id}`, {
      method: 'DELETE',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/short-term-sales'] });
      toast({ title: "Success", description: "Short-term sale deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete short-term sale", variant: "destructive" });
    },
  });

  const [formSale, setFormSale] = useState<{
    id: number | null;
    name: string;
    percent: number;
    startDate: string;
    endDate: string;
    appliesTo: string;
  }>({
    id: null,
    name: '',
    percent: 0,
    startDate: '',
    endDate: '',
    appliesTo: 'total'
  });



  const handleSaleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const saleData = {
      name: formSale.name,
      percent: formSale.percent,
      startDate: new Date(formSale.startDate).toISOString(),
      endDate: new Date(formSale.endDate).toISOString(),
      appliesTo: formSale.appliesTo,
      isActive: 1,
    };
    
    if (formSale.id) {
      updateMutation.mutate({ id: formSale.id, data: saleData });
    } else {
      createMutation.mutate(saleData);
    }
    
    setFormSale({ id: null, name: '', percent: 0, startDate: '', endDate: '', appliesTo: 'total' });
  };

  const handleEditSale = (sale: ShortTermSale) => {
    setFormSale({
      id: sale.id,
      name: sale.name,
      percent: sale.percent,
      startDate: format(new Date(sale.startDate), 'yyyy-MM-dd'),
      endDate: format(new Date(sale.endDate), 'yyyy-MM-dd'),
      appliesTo: sale.appliesTo || 'total',
    });
  };
  
  const handleDeleteSale = (id: number) => {
    deleteMutation.mutate(id);
  };

  const isFormValid = formSale.name && formSale.percent > 0 && formSale.startDate && formSale.endDate;

  const getSaleStatus = (sale: ShortTermSale) => {
    const now = new Date();
    const start = new Date(sale.startDate);
    const end = new Date(sale.endDate);
    
    if (now < start) return { status: 'upcoming', color: 'bg-blue-100 text-blue-800' };
    if (now > end) return { status: 'expired', color: 'bg-gray-100 text-gray-800' };
    return { status: 'active', color: 'bg-green-100 text-green-800' };
  };

  // Notify parent component when sales change
  useEffect(() => {
    if (onSalesChange && sales.length > 0) {
      onSalesChange(sales);
    }
  }, [sales, onSalesChange]);

  return (
    <div className="space-y-6">
      {/* Short-Term Sales Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Short-Term Sales
            {formSale.id && (
              <Badge variant="secondary" className="ml-2">
                Editing: {formSale.name}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaleSubmit} className="space-y-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="sale-name">Sale Name</Label>
                <Input
                  id="sale-name"
                  type="text"
                  value={formSale.name}
                  onChange={e => setFormSale({ ...formSale, name: e.target.value })}
                  placeholder="e.g., Summer Sale"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="sale-percent">Discount Percentage</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    id="sale-percent"
                    type="number"
                    value={formSale.percent}
                    onChange={e => setFormSale({ ...formSale, percent: Number(e.target.value) })}
                    min="0"
                    max="100"
                    className="flex-1"
                  />
                  <Percent className="h-4 w-4 text-gray-500" />
                </div>
              </div>
              <div>
                <Label htmlFor="applies-to">Applies To</Label>
                <Select value={formSale.appliesTo} onValueChange={value => setFormSale({ ...formSale, appliesTo: value })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select what the discount applies to" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="total">Total Order</SelectItem>
                    <SelectItem value="stock_model">Stock Model Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="start-date">Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={formSale.startDate}
                  onChange={e => setFormSale({ ...formSale, startDate: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="end-date">End Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={formSale.endDate}
                  onChange={e => setFormSale({ ...formSale, endDate: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                type="submit" 
                disabled={!isFormValid || createMutation.isPending || updateMutation.isPending} 
                className="w-full md:w-auto"
              >
                <Plus className="h-4 w-4 mr-2" />
                {formSale.id ? 'Update' : 'Add'} Sale
              </Button>
              {formSale.id && (
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={() => setFormSale({ id: null, name: '', percent: 0, startDate: '', endDate: '', appliesTo: 'total' })}
                  className="w-full md:w-auto"
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>

          {isLoading ? (
            <div className="text-center py-8">
              <div className="text-sm text-gray-500">Loading sales...</div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Applies To</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                      No sales configured yet
                    </TableCell>
                  </TableRow>
                ) : (
                  sales.map(sale => {
                    const status = getSaleStatus(sale);

                    return (
                      <TableRow key={sale.id}>
                        <TableCell className="font-medium">{sale.name}</TableCell>
                        <TableCell>{sale.percent}%</TableCell>
                        <TableCell>{sale.appliesTo === 'stock_model' ? 'Stock Model Only' : 'Total Order'}</TableCell>
                        <TableCell>{format(new Date(sale.startDate), 'yyyy-MM-dd')}</TableCell>
                        <TableCell>{format(new Date(sale.endDate), 'yyyy-MM-dd')}</TableCell>
                        <TableCell>
                          <Badge className={status.color}>
                            {status.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditSale(sale)}
                              disabled={updateMutation.isPending}
                            >
                              <Edit3 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteSale(sale.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}