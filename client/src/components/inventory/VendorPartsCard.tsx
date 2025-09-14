import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, DollarSign, Star, Search } from 'lucide-react';

export default function VendorPartsCard() {
  const [searchPartId, setSearchPartId] = useState('');
  
  const { data: vendorParts = [] } = useQuery({
    queryKey: ['/api/inventory/vendor-parts/part', searchPartId],
    queryFn: () => searchPartId ? apiRequest(`/api/inventory/vendor-parts/part/${searchPartId}`) : [],
    enabled: !!searchPartId
  });

  const { data: preferredVendor } = useQuery({
    queryKey: ['/api/inventory/vendor-parts/preferred', searchPartId],
    queryFn: () => searchPartId ? apiRequest(`/api/inventory/vendor-parts/preferred/${searchPartId}`) : null,
    enabled: !!searchPartId
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Vendor Parts Management</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Vendor relationships and parts mapping
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search Vendor Parts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Enter part ID to find vendors..."
              value={searchPartId}
              onChange={(e) => setSearchPartId(e.target.value)}
              className="pl-9"
              data-testid="input-search-vendor-parts"
            />
          </div>
        </CardContent>
      </Card>

      {preferredVendor && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500" />
              Preferred Vendor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{preferredVendor.vendorName}</span>
                <Badge className="bg-yellow-100 text-yellow-800">Preferred</Badge>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-2 text-sm text-gray-600">
                <div>Part #: {preferredVendor.vendorPartNumber}</div>
                <div className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  ${preferredVendor.unitPrice?.toFixed(2) || 'N/A'}
                </div>
                <div>Lead Time: {preferredVendor.leadTimeDays || 'N/A'} days</div>
                <div>MOQ: {preferredVendor.minimumOrderQty || 'N/A'}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {vendorParts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              All Vendors for {searchPartId}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {vendorParts.map((vendorPart: any, index: number) => (
                <div key={index} className="border rounded p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{vendorPart.vendorName}</span>
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3 text-gray-400" />
                      <span className="text-sm">${vendorPart.unitPrice?.toFixed(2) || 'N/A'}</span>
                    </div>
                  </div>
                  <div className="text-sm text-gray-600">
                    {vendorPart.vendorPartNumber} • Lead: {vendorPart.leadTimeDays || 'N/A'} days
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {searchPartId && vendorParts.length === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-sm text-gray-500">No vendor parts found for "{searchPartId}"</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}