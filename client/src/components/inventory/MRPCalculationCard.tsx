import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Settings, Play, Clock, CheckCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function MRPCalculationCard() {
  const [selectedScope, setSelectedScope] = useState('ALL');
  const [scopeId, setScopeId] = useState('');
  const queryClient = useQueryClient();

  // Run MRP calculation
  const runMrpMutation = useMutation({
    mutationFn: async (data: { scope: string; scopeId?: string }) => {
      return await apiRequest('/api/mrp/calculate', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: (result) => {
      toast.success(`MRP calculated: ${result.requirementsGenerated} requirements, ${result.shortagesIdentified} shortages`);
      queryClient.invalidateQueries({ queryKey: ['/api/mrp/requirements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/mrp/shortages'] });
    },
    onError: (error: any) => {
      toast.error(`MRP calculation failed: ${error.message}`);
    },
  });

  // Get MRP history
  const { data: history = [] } = useQuery({
    queryKey: ['/api/mrp/calculation-history'],
    queryFn: () => apiRequest('/api/mrp/calculation-history?limit=5')
  });

  const handleRunMRP = () => {
    const data: any = { scope: selectedScope };
    if ((selectedScope === 'SPECIFIC_PART' || selectedScope === 'SPECIFIC_ORDER') && scopeId) {
      data.scopeId = scopeId;
    }
    runMrpMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">MRP Calculation</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Run material requirements planning calculations
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run MRP Calculation</CardTitle>
          <CardDescription>Calculate material requirements and identify shortages</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Calculation Scope</label>
            <select
              value={selectedScope}
              onChange={(e) => setSelectedScope(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              data-testid="select-mrp-scope"
            >
              <option value="ALL">All Parts</option>
              <option value="SPECIFIC_PART">Specific Part</option>
              <option value="SPECIFIC_ORDER">Specific Order</option>
            </select>
          </div>

          {(selectedScope === 'SPECIFIC_PART' || selectedScope === 'SPECIFIC_ORDER') && (
            <div>
              <label className="block text-sm font-medium mb-2">
                {selectedScope === 'SPECIFIC_PART' ? 'Part ID' : 'Order ID'}
              </label>
              <input
                type="text"
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder={`Enter ${selectedScope === 'SPECIFIC_PART' ? 'part' : 'order'} ID`}
                data-testid="input-scope-id"
              />
            </div>
          )}

          <Button 
            onClick={handleRunMRP}
            disabled={runMrpMutation.isPending}
            className="w-full"
            data-testid="button-run-mrp"
          >
            <Play className="h-4 w-4 mr-2" />
            {runMrpMutation.isPending ? 'Calculating...' : 'Run MRP Calculation'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Calculations</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length > 0 ? (
            <div className="space-y-2">
              {history.map((calc: any, index: number) => (
                <div key={index} className="flex items-center justify-between p-2 border rounded">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm">
                      {new Date(calc.runDate || Date.now()).toLocaleString()}
                    </span>
                  </div>
                  <Badge variant="outline">
                    {calc.scope || 'ALL'}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No recent calculations</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}