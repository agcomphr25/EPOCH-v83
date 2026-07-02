import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import ProductionTracker from '@/components/ProductionTracker';
import PipelineVisualization from '@/components/PipelineVisualization';
import ModelAnalyticsDashboard from '@/components/ModelAnalyticsDashboard';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';

export default function ProductionTracking() {
  const { data: currentUser } = useQuery<{ id: number; username: string; role: string }>({
    queryKey: ['/api/auth/session'],
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-end">
        <Button asChild variant="outline">
          <Link href="/production-tracking/customer-wip">Customer WIP</Link>
        </Button>
      </div>

      {/* Pipeline Production Overview */}
      <PipelineVisualization />

      {/* Model Analytics Dashboard - Admin only */}
      {currentUser?.role === 'ADMIN' && (
        <Accordion type="single" collapsible>
          <AccordionItem value="model-analytics">
            <AccordionTrigger>Model Analytics Dashboard</AccordionTrigger>
            <AccordionContent>
              <ModelAnalyticsDashboard />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {/* Production Tracking */}
      <ProductionTracker />
    </div>
  );
}
