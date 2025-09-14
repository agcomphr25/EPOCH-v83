import React from 'react';
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from 'date-fns';
import { getDisplayOrderId } from '@/lib/orderUtils';

interface OrderTooltipProps {
  order: any;
  stockModels: any[];
  showHoverText?: boolean;
  className?: string;
  children?: React.ReactNode;
}

// Format order features for display
const formatOrderFeatures = (order: any) => {
  if (!order.features) return '';
  
  const features = order.features;
  const parts = [];
  
  // Helper function to format feature options
  const formatOptions = (options: any) => {
    if (!options) return '';
    if (typeof options === 'string') return options;
    if (Array.isArray(options)) return options.join(', ');
    if (typeof options === 'object') {
      return Object.entries(options)
        .filter(([_, value]) => value !== null && value !== undefined && value !== '')
        .map(([key, value]) => {
          if (typeof value === 'boolean') return value ? key : '';
          return `${key}: ${value}`;
        })
        .filter(Boolean)
        .join(', ');
    }
    return String(options);
  };

  // Add each feature type
  if (features.rails && features.rails !== 'none') {
    parts.push(`Rails: ${formatOptions(features.rails)}`);
  }
  
  if (features.paint && features.paint !== 'none') {
    parts.push(`Paint: ${formatOptions(features.paint)}`);
  }
  
  if (features.bottomMetal && features.bottomMetal !== 'none') {
    parts.push(`Bottom Metal: ${formatOptions(features.bottomMetal)}`);
  }
  
  if (features.handedness && features.handedness !== 'none') {
    parts.push(`Handedness: ${formatOptions(features.handedness)}`);
  }
  
  if (features.triggerGuard && features.triggerGuard !== 'none') {
    parts.push(`Trigger Guard: ${formatOptions(features.triggerGuard)}`);
  }
  
  if (features.gripCap && features.gripCap !== 'none') {
    parts.push(`Grip Cap: ${formatOptions(features.gripCap)}`);
  }
  
  if (features.cheekPiece && features.cheekPiece !== 'none') {
    parts.push(`Cheek Piece: ${formatOptions(features.cheekPiece)}`);
  }
  
  if (features.length && features.length !== 'none') {
    parts.push(`Length: ${formatOptions(features.length)}`);
  }

  return parts.join('\n');
};

// Format complete order details
const formatOrderDetails = (order: any, stockModels: any[]) => {
  const details = [];
  
  // Basic order info
  details.push(`Order: ${getDisplayOrderId(order)}`);
  if (order.customer) details.push(`Customer: ${order.customer}`);
  
  // Model info
  const modelId = order.stockModelId || order.modelId;
  const getModelDisplayName = (modelId: string) => {
    if (!modelId) return 'Unknown Model';
    const model = stockModels.find((m: any) => m.id === modelId);
    return model?.displayName || model?.name || modelId;
  };
  details.push(`Model: ${getModelDisplayName(modelId)}`);
  
  // Material type
  const materialType = modelId?.startsWith('cf_') ? 'CF' : 
                      modelId?.startsWith('fg_') ? 'FG' : null;
  if (materialType) details.push(`Material: ${materialType}`);
  
  // Dates
  if (order.dueDate) {
    details.push(`Due: ${format(new Date(order.dueDate), 'MMM d, yyyy')}`);
  }
  
  if (order.createdAt) {
    const daysInDept = Math.floor((Date.now() - new Date(order.updatedAt || order.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    details.push(`In Dept: ${daysInDept} days`);
  }
  
  details.push(''); // Empty line before features
  
  // Add features
  const featuresText = formatOrderFeatures(order);
  if (featuresText) {
    details.push('CUSTOMIZATIONS:');
    details.push(featuresText);
  }
  
  return details.join('\n');
};

export function OrderTooltip({ order, stockModels, showHoverText = true, className = "", children }: OrderTooltipProps) {
  const modelId = order.stockModelId || order.modelId;
  const materialType = modelId?.startsWith('cf_') ? 'CF' : 
                      modelId?.startsWith('fg_') ? 'FG' : null;
  
  const getModelDisplayName = (modelId: string) => {
    if (!modelId) return 'Unknown Model';
    const model = stockModels.find((m: any) => m.id === modelId);
    return model?.displayName || model?.name || modelId;
  };

  const orderDetails = formatOrderDetails(order, stockModels);

  return (
    <div className={`relative group`}>
      <Card className={`border-l-4 ${className.includes('border-l-') ? className : `border-l-blue-500 ${className}`} hover:shadow-lg transition-shadow duration-200 cursor-pointer`}>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <div className="font-semibold text-lg">
              {getDisplayOrderId(order)}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {order.status}
              </Badge>
              {children}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {materialType && (
                <Badge variant="secondary" className="text-xs">
                  {materialType}
                </Badge>
              )}
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {getModelDisplayName(modelId)}
              </span>
            </div>

            {order.customer && (
              <div className="text-xs text-gray-500">
                Customer: {order.customer}
              </div>
            )}

            {order.dueDate && (
              <div className="text-xs text-gray-500">
                Due: {format(new Date(order.dueDate), 'MMM d, yyyy')}
              </div>
            )}

            {order.createdAt && (
              <div className="text-xs text-gray-500">
                In Dept: {Math.floor((Date.now() - new Date(order.updatedAt || order.createdAt).getTime()) / (1000 * 60 * 60 * 24))} days
              </div>
            )}

            {showHoverText && (
              <div className="text-xs text-blue-500 mt-2 italic">
                Hover for order details
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* CSS-based tooltip */}
      <div className="absolute left-full ml-4 top-0 z-50 w-80 p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none">
        <div className="space-y-2">
          <div className="font-semibold text-blue-600 dark:text-blue-400 border-b border-gray-200 dark:border-gray-600 pb-2 mb-3">
            Order Details
          </div>
          <div className="text-sm whitespace-pre-line text-gray-700 dark:text-gray-300 font-mono leading-relaxed">
            {orderDetails}
          </div>
        </div>
      </div>
    </div>
  );
}

export { formatOrderFeatures, formatOrderDetails };