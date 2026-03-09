import { Suspense } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { getWidget, WidgetConfig } from '@/lib/widgetRegistry';

interface WidgetRendererProps {
  config: WidgetConfig;
  className?: string;
}

function WidgetError({ type }: { type: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 px-4 py-3 text-red-500 text-sm">
      <AlertCircle className="h-4 w-4 flex-shrink-0" />
      <span>Unknown widget type: <code className="font-mono text-xs">{type}</code></span>
    </div>
  );
}

function WidgetFallback() {
  return (
    <div className="flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-6">
      <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
    </div>
  );
}

export default function WidgetRenderer({ config, className }: WidgetRendererProps) {
  const entry = getWidget(config.type);

  if (!entry) {
    return <WidgetError type={config.type} />;
  }

  const mergedProps = {
    ...entry.defaultProps,
    ...config.props,
    className,
  };

  const Component = entry.component;

  return (
    <Suspense fallback={<WidgetFallback />}>
      <Component {...mergedProps} />
    </Suspense>
  );
}
