import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trash2, Edit3, Plus, Percent, Users, Calendar } from "lucide-react";

export interface PersistentDiscount {
  customerType: string;
  percent: number;
}

export interface ShortTermSale {
  id: number;
  name: string;
  percent: number;
  startDate: string;
  endDate: string;
}

interface DiscountAdminProps {
  onSalesChange?: (sales: ShortTermSale[]) => void;
}

export default function DiscountAdmin({ onSalesChange }: DiscountAdminProps) {
  const initialPersistent: PersistentDiscount[] = [
    { customerType: 'AGR–Individual', percent: 10 },
    { customerType: 'AGR–Gunbuilder', percent: 20 },
    { customerType: 'OEM', percent: 0 },
    { customerType: 'Distributor', percent: 0 },
  ];

  const [persistent, setPersistent] = useState(initialPersistent);
  const [sales, setSales] = useState<ShortTermSale[]>([]);

  const [formSale, setFormSale] = useState<{
    id: number | null;
    name: string;
    percent: number;
    startDate: string;
    endDate: string;
  }>({
    id: null,
    name: '',
    percent: 0,
    startDate: '',
    endDate: '',
  });

  const handlePersistChange = (idx: number, field: keyof PersistentDiscount, value: string) => {
    const arr = [...persistent];
    if (field === 'percent') {
      arr[idx] = { ...arr[idx], [field]: Number(value) };
    } else {
      arr[idx] = { ...arr[idx], [field]: value };
    }
    setPersistent(arr);
  };

  const handleSaleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newSale: ShortTermSale = {
      ...formSale,
      id: formSale.id || Date.now(),
    };
    setSales(prev => {
      const filtered = prev.filter(s => s.id !== newSale.id);
      const updated = [...filtered, newSale];
      onSalesChange && onSalesChange(updated);
      return updated;
    });
    setFormSale({ id: null, name: '', percent: 0, startDate: '', endDate: '' });
  };

  const handleEditSale = (sale: ShortTermSale) => setFormSale(sale);
  
  const handleDeleteSale = (id: number) => {
    setSales(prev => {
      const updated = prev.filter(s => s.id !== id);
      onSalesChange && onSalesChange(updated);
      return updated;
    });
  };

  const isFormValid = formSale.name && formSale.percent > 0 && formSale.startDate && formSale.endDate;

  return (
    <div className="space-y-6">
      {/* Persistent Discounts Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Persistent Discounts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer Type</TableHead>
                <TableHead>Discount Percentage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {persistent.map((row, idx) => (
                <TableRow key={row.customerType}>
                  <TableCell className="font-medium">{row.customerType}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={row.percent}
                        onChange={e => handlePersistChange(idx, 'percent', e.target.value)}
                        className="w-20"
                        min="0"
                        max="100"
                      />
                      <Percent className="h-4 w-4 text-gray-500" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Short-Term Sales Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Short-Term Sales
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
            <Button type="submit" disabled={!isFormValid} className="w-full md:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              {formSale.id ? 'Update' : 'Add'} Sale
            </Button>
          </form>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                    No sales configured yet
                  </TableCell>
                </TableRow>
              ) : (
                sales.map(sale => {
                  const now = new Date();
                  const startDate = new Date(sale.startDate);
                  const endDate = new Date(sale.endDate);
                  const isActive = now >= startDate && now <= endDate;
                  const isUpcoming = now < startDate;
                  const isExpired = now > endDate;

                  return (
                    <TableRow key={sale.id}>
                      <TableCell className="font-medium">{sale.name}</TableCell>
                      <TableCell>{sale.percent}%</TableCell>
                      <TableCell>{sale.startDate}</TableCell>
                      <TableCell>{sale.endDate}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={isActive ? "default" : isUpcoming ? "secondary" : "outline"}
                          className={isActive ? "bg-green-100 text-green-800" : ""}
                        >
                          {isActive ? "Active" : isUpcoming ? "Upcoming" : "Expired"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditSale(sale)}
                          >
                            <Edit3 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteSale(sale.id)}
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
        </CardContent>
      </Card>
    </div>
  );
}