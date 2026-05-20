import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileSearch, Calculator, Plus, ChevronRight } from 'lucide-react';

interface EstimatingRfq {
  id: string;
  rfq_number: string;
  customer_name_snapshot: string | null;
  status: string;
  source: string;
  part_count: number;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'secondary',
  IN_PROGRESS: 'default',
  PRICED: 'default',
  QUOTED: 'default',
  WON: 'default',
  LOST: 'destructive',
  ARCHIVED: 'secondary',
};

export default function RFQListPage() {
  const [, setLocation] = useLocation();
  const openNewRfq = () => setLocation('/rfq-builder');

  const { data: rfqs = [], isLoading } = useQuery<EstimatingRfq[]>({
    queryKey: ['/api/estimating/rfqs'],
  });

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">RFQs</h1>
            <p className="text-gray-500 mt-1">
              The RFQ workspace is being added here. This page will manage incoming RFQs, draft estimating records, and quote status.
            </p>
          </div>
          <Button onClick={openNewRfq} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New RFQ
          </Button>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="py-10 text-center text-gray-400">Loading RFQs…</CardContent>
          </Card>
        ) : rfqs.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card
              className="hover:shadow-md transition-shadow cursor-pointer border-2 border-dashed border-gray-200"
              onClick={openNewRfq}
            >
              <CardContent className="flex flex-col items-center justify-center py-10 text-center gap-3">
                <div className="bg-blue-50 p-3 rounded-full">
                  <FileSearch className="h-8 w-8 text-blue-500" />
                </div>
                <div>
                  <p className="font-semibold text-gray-800 text-lg">Create New RFQ</p>
                  <p className="text-sm text-gray-500 mt-1">Start a new request for quotation</p>
                </div>
                <Button variant="outline" className="mt-2">Start RFQ</Button>
              </CardContent>
            </Card>

            <Card
              className="hover:shadow-md transition-shadow cursor-pointer border-2 border-dashed border-gray-200"
              onClick={() => setLocation('/rfq-builder')}
            >
              <CardContent className="flex flex-col items-center justify-center py-10 text-center gap-3">
                <div className="bg-green-50 p-3 rounded-full">
                  <Calculator className="h-8 w-8 text-green-500" />
                </div>
                <div>
                  <p className="font-semibold text-gray-800 text-lg">Open Cost Builder</p>
                  <p className="text-sm text-gray-500 mt-1">Build and review multi-part cost estimates</p>
                </div>
                <Button variant="outline" className="mt-2">Go to Cost Builder</Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-800">
                <FileSearch className="h-5 w-5 text-blue-500" />
                All RFQs ({rfqs.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-gray-100">
                {rfqs.map((rfq) => (
                  <li
                    key={rfq.id}
                    className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 cursor-pointer"
                    onClick={() => setLocation(`/rfq-builder/${rfq.id}`)}
                  >
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="font-semibold text-gray-900">{rfq.rfq_number}</p>
                        <p className="text-sm text-gray-500">
                          {rfq.customer_name_snapshot ?? 'No customer'} &middot; {rfq.part_count ?? 0} part{rfq.part_count === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={STATUS_COLORS[rfq.status] as any ?? 'secondary'}>
                        {rfq.status}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
