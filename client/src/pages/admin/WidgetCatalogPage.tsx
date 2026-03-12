import { useState, Component, ReactNode } from 'react';
import { getAllWidgets, WidgetRegistryEntry, WidgetTypeId } from '@/lib/widgetRegistry';
import WidgetRenderer from '@/components/widgets/WidgetRenderer';
import { DashboardFilterProvider } from '@/contexts/DashboardFilterContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Copy, Check, Search, LayoutGrid, Eye, EyeOff } from 'lucide-react';

// ─── Demo props for widgets that require them ─────────────────────────────────
const DEMO_PROPS: Partial<Record<WidgetTypeId, Record<string, unknown>>> = {
  metric_stat:       { metricSlug: 'orders_in_production', title: 'Orders in Production' },
  metric_stat_group: { slugs: ['orders_in_production', 'orders_completed_today'], label: 'Production' },
  hero_metric:       { metricSlug: 'orders_in_production' },
  signal_card:       { metricSlug: 'orders_in_production' },
};

// ─── Category styling ─────────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  metric: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  chart:  'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  table:  'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  status: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  misc:   'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
};

const ALL_CATEGORIES = ['all', 'metric', 'chart', 'table', 'status', 'misc'] as const;

// ─── Build a copy-ready config snippet for a widget ──────────────────────────
function buildConfigSnippet(entry: WidgetRegistryEntry): string {
  const demoProps = DEMO_PROPS[entry.id] ?? {};
  const props: Record<string, unknown> = { ...entry.defaultProps, ...demoProps };
  return JSON.stringify(
    {
      id: `w-${entry.id}-1`,
      type: entry.id,
      colSpan: 'col-span-1',
      props,
    },
    null,
    2
  );
}

// ─── Error boundary for isolated widget previews ─────────────────────────────
class WidgetPreviewBoundary extends Component<
  { children: ReactNode; widgetId: string },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: ReactNode; widgetId: string }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(err: Error) {
    return { hasError: true, message: err.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-16 rounded-lg border border-dashed text-xs text-muted-foreground px-3 text-center">
          Preview unavailable — requires full dashboard context
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Single widget card ───────────────────────────────────────────────────────
function WidgetCard({
  entry,
  showPreview,
}: {
  entry: WidgetRegistryEntry;
  showPreview: boolean;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const demoProps = DEMO_PROPS[entry.id] ?? {};
  const hasRequiredDemo = entry.requiredProps.every(
    (p) => demoProps[p] !== undefined || (entry.defaultProps?.[p] !== undefined)
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(buildConfigSnippet(entry));
    setCopied(true);
    toast({ title: 'Config snippet copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border rounded-xl overflow-hidden bg-card flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm leading-tight">{entry.displayName}</h3>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[entry.category] ?? CATEGORY_COLORS.misc}`}
            >
              {entry.category}
            </span>
          </div>
          <code className="text-xs text-muted-foreground font-mono mt-0.5 block truncate">
            {entry.id}
          </code>
        </div>
        <Button size="sm" variant="outline" className="shrink-0 h-7 px-2 text-xs" onClick={handleCopy}>
          {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
          <span className="ml-1">{copied ? 'Copied' : 'Copy'}</span>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground px-4 pb-3 leading-relaxed">{entry.description}</p>

      {/* Props info */}
      {entry.requiredProps.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1">
          {entry.requiredProps.map((p) => (
            <span
              key={p}
              className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800 font-mono"
            >
              {p} <span className="ml-0.5 opacity-60 text-[10px]">required</span>
            </span>
          ))}
        </div>
      )}

      {/* Live preview */}
      {showPreview && (
        <>
          <Separator />
          <div className="p-3 bg-muted/30">
            {hasRequiredDemo ? (
              <WidgetPreviewBoundary widgetId={entry.id}>
                <DashboardFilterProvider>
                  <WidgetRenderer
                    config={{
                      id: `preview-${entry.id}`,
                      type: entry.id,
                      props: { ...entry.defaultProps, ...demoProps },
                    }}
                  />
                </DashboardFilterProvider>
              </WidgetPreviewBoundary>
            ) : (
              <div className="flex items-center justify-center h-16 text-xs text-muted-foreground rounded-lg border border-dashed">
                Preview unavailable — props required
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function WidgetCatalogPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [showPreviews, setShowPreviews] = useState(true);

  const allWidgets = getAllWidgets();

  const filtered = allWidgets.filter((w) => {
    const matchesCategory = category === 'all' || w.category === category;
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      w.id.includes(q) ||
      w.displayName.toLowerCase().includes(q) ||
      w.description.toLowerCase().includes(q) ||
      w.category.includes(q);
    return matchesCategory && matchesSearch;
  });

  const counts = ALL_CATEGORIES.reduce<Record<string, number>>((acc, cat) => {
    acc[cat] =
      cat === 'all'
        ? allWidgets.length
        : allWidgets.filter((w) => w.category === cat).length;
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <LayoutGrid className="h-7 w-7 text-primary shrink-0" />
          <div>
            <h1 className="text-2xl font-bold">Widget Catalog</h1>
            <p className="text-sm text-muted-foreground">
              {allWidgets.length} registered widget types — browse, preview, and copy configs to use in dashboards.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowPreviews((v) => !v)}
          className="shrink-0"
        >
          {showPreviews ? (
            <><EyeOff className="h-4 w-4 mr-1.5" /> Hide Previews</>
          ) : (
            <><Eye className="h-4 w-4 mr-1.5" /> Show Previews</>
          )}
        </Button>
      </div>

      {/* Search + filter row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, ID, or description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Tabs value={category} onValueChange={setCategory}>
          <TabsList className="h-9">
            {ALL_CATEGORIES.map((cat) => (
              <TabsTrigger key={cat} value={cat} className="text-xs capitalize px-3">
                {cat}
                {counts[cat] > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 h-4">
                    {counts[cat]}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          No widgets match your search.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((entry) => (
            <WidgetCard key={entry.id} entry={entry} showPreview={showPreviews} />
          ))}
        </div>
      )}

      {/* Usage guide */}
      <div className="rounded-xl border bg-muted/30 p-5 space-y-3">
        <h2 className="font-semibold text-sm">How to use a widget</h2>
        <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
          <li>Click <strong>Copy</strong> on any widget card to get a ready-to-paste JSON config.</li>
          <li>
            Paste the config into a dashboard layout in{' '}
            <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
              server/src/routes/widgets.ts
            </code>{' '}
            or your custom dashboard config file.
          </li>
          <li>
            Use{' '}
            <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
              {'<WidgetRenderer config={...} />'}
            </code>{' '}
            anywhere in the app to render any registered widget by its type ID.
          </li>
          <li>
            Register new widgets by calling{' '}
            <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">registerWidget()</code>{' '}
            in{' '}
            <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
              client/src/lib/widgetRegistry.ts
            </code>
            .
          </li>
        </ol>
      </div>
    </div>
  );
}
