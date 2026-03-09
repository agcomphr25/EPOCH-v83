import { cn } from '@/lib/utils';
import WidgetRenderer from './WidgetRenderer';
import { DashboardLayout } from '@/config/dashboardLayouts';

interface DashboardGridProps {
  layout: DashboardLayout;
  className?: string;
}

export default function DashboardGrid({ layout, className }: DashboardGridProps) {
  if (!layout.sections || layout.sections.length === 0) {
    return (
      <div className="text-sm text-gray-400 italic px-1">
        No widgets configured for this dashboard.
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {layout.sections.map((section) => (
        <div key={section.id}>
          {section.title && (
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3 px-0.5">
              {section.title}
            </h3>
          )}
          <div
            className={cn(
              'grid gap-3',
              section.columns === 1 && 'grid-cols-1',
              section.columns === 2 && 'grid-cols-1 sm:grid-cols-2',
              section.columns === 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
              section.columns === 4 && 'grid-cols-2 sm:grid-cols-2 lg:grid-cols-4',
              !section.columns       && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
            )}
          >
            {section.widgets.map((widget) => (
              <div
                key={widget.id}
                className={cn(widget.colSpan ?? 'col-span-1')}
              >
                <WidgetRenderer config={widget} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
