import { useQuery } from '@tanstack/react-query';
import ProductionTracker from '@/components/ProductionTracker';
import PipelineVisualization from '@/components/PipelineVisualization';
import ModelAnalyticsDashboard from '@/components/ModelAnalyticsDashboard';

export default function ProductionTracking() {
  const { data: currentUser } = useQuery<{ id: number; username: string; role: string }>({
    queryKey: ['/api/auth/session'],
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Pipeline Production Overview */}
      <PipelineVisualization />

      {/* Model Analytics Dashboard - Admin only */}
      {currentUser?.role === 'ADMIN' && <ModelAnalyticsDashboard />}

      {/* Production Tracking */}
      <ProductionTracker />
    </div>
  );
}
