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
            <div className="mb-4 px-0.5">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500 dark:text-gray-400">
                {section.title}
              </h3>
              <div className="mt-1.5 h-px bg-gradient-to-r from-gray-200 via-gray-200 to-transparent dark:from-gray-700 dark:via-gray-700" />
            </div>
          )}
          <div
            className={cn(
              'grid gap-3',
              section.columns === 1 && 'grid-cols-1',
              section.columns === 2 && 'grid-cols-1 md:grid-cols-2',
              section.columns === 3 && 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
              section.columns === 4 && 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
              !section.columns       && 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
            )}
          >
            {section.widgets.map((widget) => (
              <div
                key={widget.id}
                className={cn(
                  widget.colSpan ?? 'col-span-1',
                  'transition-all duration-200 hover:shadow-lg hover:translate-y-[-2px]'
                )}
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
