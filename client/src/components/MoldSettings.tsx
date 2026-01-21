import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Settings, RefreshCw, Search, Filter } from 'lucide-react';

interface Mold {
  id: number;
  moldId: string;
  modelName: string;
  stockModels: string[];
  instanceNumber: number;
  enabled: boolean;
  multiplier: number;
  isActive: boolean;
}

interface MoldSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MoldSettings({ open, onOpenChange }: MoldSettingsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterModel, setFilterModel] = useState('all');

  const { data: moldsData, isLoading, refetch } = useQuery<{ success: boolean; molds: Mold[] }>({
    queryKey: ['/api/layup-schedule/molds'],
    enabled: open,
  });

  const molds = moldsData?.molds || [];

  const uniqueModelNames = Array.from(new Set(molds.map(m => m.modelName))).sort();

  const filteredMolds = molds.filter(mold => {
    const matchesSearch = mold.moldId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mold.modelName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterModel === 'all' || mold.modelName === filterModel;
    return matchesSearch && matchesFilter;
  });

  const moldsByModel = filteredMolds.reduce((acc, mold) => {
    if (!acc[mold.modelName]) {
      acc[mold.modelName] = [];
    }
    acc[mold.modelName].push(mold);
    return acc;
  }, {} as Record<string, Mold[]>);

  const enabledCount = molds.filter(m => m.enabled && m.isActive).length;
  const totalCount = molds.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Mold Settings
          </DialogTitle>
          <DialogDescription>
            View and manage mold configurations for layup scheduling. Molds are matched to orders by their model name.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4 py-4 border-b">
          <div className="flex items-center gap-2 flex-1">
            <Search className="w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search molds..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={filterModel}
              onChange={(e) => setFilterModel(e.target.value)}
              className="border rounded px-3 py-2 text-sm"
            >
              <option value="all">All Models</option>
              {uniqueModelNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <div className="flex items-center gap-4 py-2 text-sm text-gray-600">
          <span>Total Molds: <strong>{totalCount}</strong></span>
          <span>Enabled: <strong>{enabledCount}</strong></span>
          <span>Showing: <strong>{filteredMolds.length}</strong></span>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(moldsByModel).sort(([a], [b]) => a.localeCompare(b)).map(([modelName, modelMolds]) => (
                <div key={modelName} className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium text-gray-900">{modelName}</h3>
                      <Badge variant="outline" className="text-xs">
                        {modelMolds.length} mold{modelMolds.length !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-500">
                      Matches: <code className="bg-gray-200 px-1 rounded text-xs">
                        {modelName.toLowerCase().replace(/\s+/g, '_')}
                      </code>
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[180px]">Mold ID</TableHead>
                        <TableHead className="w-[80px]">Instance</TableHead>
                        <TableHead className="w-[100px]">Capacity</TableHead>
                        <TableHead>Stock Models</TableHead>
                        <TableHead className="w-[100px]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {modelMolds.sort((a, b) => a.instanceNumber - b.instanceNumber).map(mold => (
                        <TableRow key={mold.id}>
                          <TableCell className="font-medium">{mold.moldId}</TableCell>
                          <TableCell>{mold.instanceNumber}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{mold.multiplier}x</Badge>
                          </TableCell>
                          <TableCell>
                            {mold.stockModels && mold.stockModels.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {mold.stockModels.map((sm, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {sm}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400 text-sm italic">
                                Uses model name matching
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {mold.enabled && mold.isActive ? (
                              <Badge className="bg-green-100 text-green-800">Active</Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-gray-100 text-gray-600">
                                Inactive
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
              {Object.keys(moldsByModel).length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  No molds found matching your search criteria.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t pt-4 mt-4">
          <p className="text-sm text-gray-500">
            Molds are automatically matched to orders based on their model name. 
            For example, a "Mesa Universal" mold will match orders with stock model "mesa_universal".
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
