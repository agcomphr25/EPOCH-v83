import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, TreePine, Search } from 'lucide-react';

export default function RobustPartsIntegrationCard() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPartId, setSelectedPartId] = useState('');

  const { data: parts = [], isLoading: partsLoading } = useQuery({
    queryKey: ['/api/mrp/parts', { q: searchQuery }],
    queryFn: () => searchQuery ? apiRequest(`/api/mrp/parts?q=${searchQuery}&limit=10`) : [],
    enabled: !!searchQuery
  });

  const { data: bomData = [], isLoading: bomLoading } = useQuery({
    queryKey: ['/api/mrp/parts', selectedPartId, 'bom'],
    queryFn: () => selectedPartId ? apiRequest(`/api/mrp/parts/${selectedPartId}/bom`) : [],
    enabled: !!selectedPartId
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Robust Parts Integration</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Integration with Robust Parts & BOM system
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search Parts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search robust parts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-robust-parts"
            />
          </div>
          
          {partsLoading ? (
            <div className="text-sm text-gray-500">Searching parts...</div>
          ) : parts.length > 0 ? (
            <div className="space-y-2">
              {parts.map((part: any) => (
                <div 
                  key={part.id} 
                  className="border rounded p-2 cursor-pointer hover:bg-gray-50"
                  onClick={() => setSelectedPartId(part.id)}
                  data-testid={`part-item-${part.id}`}
                >
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-blue-500" />
                    <span className="font-medium">{part.id}</span>
                    <span className="text-gray-600">{part.name}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : searchQuery && (
            <div className="text-sm text-gray-500">No parts found for "{searchQuery}"</div>
          )}
        </CardContent>
      </Card>

      {selectedPartId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TreePine className="h-5 w-5 text-green-500" />
              BOM Structure
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bomData.length > 0 ? (
              <div className="space-y-2">
                {bomData.map((line: any, index: number) => (
                  <div key={index} className="flex items-center justify-between p-2 border rounded">
                    <span>{line.componentPartId}</span>
                    <span className="text-sm text-gray-600">Qty: {line.quantityRequired}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No BOM data available</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}