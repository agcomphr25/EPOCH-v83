import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Calculator, DollarSign, Info } from "lucide-react";
import { calculateFinalPrice, getActiveShortTermDiscounts, type ShortTermSale } from '@/utils/discountUtils';

interface DiscountCalculatorProps {
  activeSales: ShortTermSale[];
}

export default function DiscountCalculator({ activeSales }: DiscountCalculatorProps) {
  const [basePrice, setBasePrice] = useState<number>(1000);
  const [customerType, setCustomerType] = useState<string>('AGR–Individual');
  const [isMilLeo, setIsMilLeo] = useState<boolean>(false);
  const [result, setResult] = useState<any>(null);

  const calculateDiscount = () => {
    const activeDiscounts = getActiveShortTermDiscounts(new Date(), activeSales);
    const calculation = calculateFinalPrice(
      basePrice,
      customerType,
      isMilLeo,
      new Date(),
      activeSales
    );
    setResult(calculation);
  };

  const customerTypes = [
    'AGR–Individual',
    'AGR–Gunbuilder', 
    'OEM',
    'Distributor'
  ];

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          Discount Calculator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="base-price">Base Price</Label>
            <div className="flex items-center gap-2 mt-1">
              <DollarSign className="h-4 w-4 text-gray-500" />
              <Input
                id="base-price"
                type="number"
                value={basePrice}
                onChange={(e) => setBasePrice(Number(e.target.value))}
                className="flex-1"
                min="0"
                step="0.01"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="customer-type">Customer Type</Label>
            <Select value={customerType} onValueChange={setCustomerType}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select customer type" />
              </SelectTrigger>
              <SelectContent>
                {customerTypes.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="mil-leo"
            checked={isMilLeo}
            onCheckedChange={(checked) => setIsMilLeo(checked as boolean)}
          />
          <Label htmlFor="mil-leo" className="text-sm font-medium">
            Military/Law Enforcement (MIL/LEO)
          </Label>
        </div>

        {/* Active Sales Display */}
        {activeSales.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Active Sales:</Label>
            <div className="flex flex-wrap gap-2">
              {activeSales.map((sale, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {sale.name} ({sale.percent}%)
                </Badge>
              ))}
            </div>
          </div>
        )}

        <Button onClick={calculateDiscount} className="w-full">
          <Calculator className="h-4 w-4 mr-2" />
          Calculate Final Price
        </Button>

        {result && (
          <div className="space-y-4 pt-4 border-t">
            <div className="flex justify-between items-center">
              <span className="text-lg font-semibold">Final Price:</span>
              <span className="text-2xl font-bold text-green-600">
                ${result.finalPrice.toFixed(2)}
              </span>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <Info className="h-4 w-4" />
                Discount Breakdown:
              </h4>
              {result.breakdown.length > 0 ? (
                <div className="space-y-2">
                  {result.breakdown.map((item: any, index: number) => (
                    <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                      <Badge variant="outline">{item.type}</Badge>
                      <span className="text-sm font-medium text-red-600">
                        -${item.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                    <span className="font-medium">Total Savings:</span>
                    <span className="font-bold text-red-600">
                      -${result.breakdown.reduce((sum: number, item: any) => sum + item.amount, 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">No discounts applied</p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}