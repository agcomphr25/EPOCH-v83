import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calculator, ClipboardList, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface AqlSamplingEntry {
  id: number;
  lotSizeMin: number;
  lotSizeMax: number;
  sampleSize: number;
  inspectionLevel: string;
  description: string;
  isActive: boolean;
}

interface SampleCalculation {
  lotSize: number;
  requiredSampleSize: number;
  lotRange: string;
  inspectionLevel: string;
  note?: string;
}

export default function AQLSamplingReference() {
  const [lotSizeInput, setLotSizeInput] = useState('');
  const [calculatedSample, setCalculatedSample] = useState<SampleCalculation | null>(null);
  const [calculating, setCalculating] = useState(false);

  const { data: samplingChart, isLoading } = useQuery<AqlSamplingEntry[]>({
    queryKey: ['/api/aql-sampling'],
  });

  const calculateSampleSize = async () => {
    const lotSize = parseInt(lotSizeInput);
    if (isNaN(lotSize) || lotSize < 1) return;

    setCalculating(true);
    try {
      const response = await fetch(`/api/aql-sampling/calculate/${lotSize}`);
      if (response.ok) {
        const data = await response.json();
        setCalculatedSample(data);
      }
    } catch (error) {
      console.error('Error calculating sample size:', error);
    } finally {
      setCalculating(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      calculateSampleSize();
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-blue-600" />
            <CardTitle>AQL Sampling Chart</CardTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <p>Based on ANSI/ASQ Z1.4 (MIL-STD-105E) acceptance sampling standards. 
                  This chart defines the minimum number of samples required for quality inspection 
                  based on lot size.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <CardDescription>
            Standard quality sampling requirements based on lot size (Normal Inspection Level II)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <Calculator className="h-4 w-4 text-blue-600" />
              <span className="font-medium">Sample Size Calculator</span>
            </div>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-sm text-muted-foreground mb-1 block">
                  Enter Lot Size
                </label>
                <Input
                  type="number"
                  placeholder="e.g., 100"
                  value={lotSizeInput}
                  onChange={(e) => setLotSizeInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  min="1"
                  data-testid="input-lot-size"
                />
              </div>
              <Button 
                onClick={calculateSampleSize} 
                disabled={calculating || !lotSizeInput}
                data-testid="button-calculate-sample"
              >
                Calculate
              </Button>
            </div>

            {calculatedSample && (
              <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-muted-foreground">For lot size of </span>
                    <span className="font-bold text-lg">{calculatedSample.lotSize}</span>
                    <span className="text-sm text-muted-foreground"> units:</span>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                      {calculatedSample.requiredSampleSize}
                    </div>
                    <div className="text-xs text-muted-foreground">samples required</div>
                  </div>
                </div>
                {calculatedSample.note && (
                  <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">
                    {calculatedSample.note}
                  </p>
                )}
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading sampling chart...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lot Size Range</TableHead>
                  <TableHead className="text-center">Sample Size</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Inspection Level</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {samplingChart?.map((entry) => (
                  <TableRow 
                    key={entry.id}
                    className={
                      calculatedSample && 
                      calculatedSample.lotSize >= entry.lotSizeMin && 
                      calculatedSample.lotSize <= entry.lotSizeMax
                        ? 'bg-blue-50 dark:bg-blue-900/20'
                        : ''
                    }
                  >
                    <TableCell className="font-medium">
                      {entry.lotSizeMin.toLocaleString()} - {entry.lotSizeMax.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="text-lg px-3 py-1">
                        {entry.sampleSize}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.description}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {entry.inspectionLevel}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
