import React, { useState } from 'react';
import DiscountAdmin from '@/components/DiscountAdmin';
import DiscountCalculator from '@/components/DiscountCalculator';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calculator, TrendingDown } from "lucide-react";

interface ShortTermSale {
  id: number;
  name: string;
  percent: number;
  startDate: string;
  endDate: string;
}

export default function DiscountManagement() {
  const [activeSales, setActiveSales] = useState<ShortTermSale[]>([]);

  const handleSalesChange = (sales: ShortTermSale[]) => {
    setActiveSales(sales);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <TrendingDown className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Discount Management</h1>
          <p className="text-gray-600">Manage customer discounts and promotional sales</p>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Customer Types</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">4</div>
            <p className="text-xs text-muted-foreground">
              Active discount categories
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Sales</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeSales.length}</div>
            <p className="text-xs text-muted-foreground">
              Running promotional sales
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Max Discount</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">20%</div>
            <p className="text-xs text-muted-foreground">
              Highest persistent discount
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Discount Calculator */}
      <div className="mb-6">
        <DiscountCalculator activeSales={activeSales} />
      </div>

      {/* Discount Admin Component */}
      <DiscountAdmin onSalesChange={handleSalesChange} />
    </div>
  );
}