import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Calendar, Package } from 'lucide-react';

export default function MRPShortagesCard() {
  const { data: shortages = [], isLoading } = useQuery({
    queryKey: ['/api/mrp/shortages'],
    queryFn: () => apiRequest('/api/mrp/shortages')
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Material Shortages</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Critical shortages requiring immediate attention
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Critical Shortages
          </CardTitle>
          <CardDescription>
            Parts with insufficient inventory to meet demand
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading shortages...</p>
          ) : shortages.length > 0 ? (
            <div className="space-y-3">
              {shortages.map((shortage: any, index: number) => (
                <div key={index} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-gray-400" />
                      <span className="font-medium">{shortage.partId}</span>
                    </div>
                    <Badge className="bg-red-100 text-red-800">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Shortage
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                    <div>Required: {shortage.requiredQty || 0}</div>
                    <div>Available: {shortage.availableQty || 0}</div>
                    <div>Shortage: {shortage.shortageQty || 0}</div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Need: {shortage.needDate ? new Date(shortage.needDate).toLocaleDateString() : 'ASAP'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No shortages found</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}