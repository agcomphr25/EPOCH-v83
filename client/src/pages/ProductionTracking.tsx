import ProductionTracker from '@/components/ProductionTracker';
import PipelineVisualization from '@/components/PipelineVisualization';

export default function ProductionTracking() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Pipeline Production Overview */}
      <PipelineVisualization />
      
      {/* Production Tracking */}
      <ProductionTracker />
    </div>
  );
}