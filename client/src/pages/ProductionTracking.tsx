import ProductionTracker from '@/components/ProductionTracker';
import PipelineVisualization from '@/components/PipelineVisualization';
import ModelAnalyticsDashboard from '@/components/ModelAnalyticsDashboard';

export default function ProductionTracking() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Pipeline Production Overview */}
      <PipelineVisualization />

      {/* Model Analytics Dashboard */}
      <ModelAnalyticsDashboard />

      {/* Production Tracking */}
      <ProductionTracker />
    </div>
  );
}
