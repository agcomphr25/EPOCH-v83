import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Package } from 'lucide-react';

export default function MRPShortagesCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['/api/mrp/material-readiness'],
    queryFn: () => apiRequest('/api/mrp/material-readiness'),
  });

  const shortages: any[] = Array.isArray(data?.blocking_materials)
    ? data.blocking_materials
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Material Shortages
        </h3>
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
            <p className="text-sm text-gray-500">Loading shortages…</p>
          ) : shortages.length > 0 ? (
            <div className="space-y-3">
              {shortages.map((s: any, index: number) => (
                <div key={index} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-gray-400" />
                      <div>
                        <span className="font-medium font-mono text-sm">
                          {s.ag_part_number}
                        </span>
                        {s.name && s.name !== s.ag_part_number && (
                          <p className="text-xs text-gray-500">{s.name}</p>
                        )}
                      </div>
                    </div>
                    <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Shortage: {s.shortage ?? 0}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-sm text-gray-600 dark:text-gray-400">
                    <div>
                      <p className="text-xs text-gray-400">Required</p>
                      <p className="font-medium">{s.required ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Available</p>
                      <p className="font-medium">{s.available ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">On Hand</p>
                      <p className="font-medium">{s.on_hand ?? 0}</p>
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
