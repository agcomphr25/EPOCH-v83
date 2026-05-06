import { useState, useEffect, useRef, useCallback } from 'react';
import { Monitor, Play, X, ChevronLeft, ChevronRight, Upload, Trash2, ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import * as pdfjsLib from 'pdfjs-dist';
import { getAllWidgets, getWidget, WidgetTypeId } from '@/lib/widgetRegistry';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

type LayoutType = '2-panel' | '4-panel';

type PanelContent =
  | 'blank'
  | 'presentation'
  | 'timer-station'
  | 'shipping-tracker'
  | 'production-pipeline'
  | 'manufacturing-queue'
  | 'production-floor-timers'
  | 'widget';

interface PanelConfig {
  content: PanelContent;
  widgetType?: WidgetTypeId;
  widgetProps?: Record<string, string>;
}

interface TVConfig {
  layout: LayoutType;
  panels: PanelConfig[];
  slideInterval: number;
}

interface SlideData {
  id: string;
  dataUrl: string;
  name: string;
}

const LIVE_MODULE_OPTIONS: { value: PanelContent; label: string }[] = [
  { value: 'blank', label: 'Blank' },
  { value: 'presentation', label: 'Presentation' },
  { value: 'production-floor-timers', label: 'Production Floor Timers' },
  { value: 'timer-station', label: 'Timer Station' },
  { value: 'shipping-tracker', label: 'Shipping Tracker' },
  { value: 'production-pipeline', label: 'Production Pipeline' },
  { value: 'manufacturing-queue', label: 'Manufacturing Queue' },
];

const CONTENT_URLS: Record<Exclude<PanelContent, 'blank' | 'presentation' | 'widget'>, string> = {
  'production-floor-timers': '/tv-timer-board?embed=1',
  'timer-station': '/app/production/stations?embed=1',
  'shipping-tracker': '/shipping-tracker?embed=1',
  'production-pipeline': '/projects/pipeline?embed=1',
  'manufacturing-queue': '/manufacturing-queue?embed=1',
};

const DEFAULT_CONFIG: TVConfig = {
  layout: '2-panel',
  panels: [
    { content: 'blank' },
    { content: 'blank' },
    { content: 'blank' },
    { content: 'blank' },
  ],
  slideInterval: 15,
};

const STORAGE_KEY = 'tv_display_config_v2';
const SLIDES_STORAGE_KEY = 'tv_display_slides_v2';

function loadConfig(): TVConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        panels: parsed.panels?.length ? parsed.panels : DEFAULT_CONFIG.panels,
      };
    }
  } catch {}
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config: TVConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function loadSlides(): SlideData[] {
  try {
    const raw = localStorage.getItem(SLIDES_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveSlides(slides: SlideData[]) {
  try {
    localStorage.setItem(SLIDES_STORAGE_KEY, JSON.stringify(slides));
  } catch (e) {
    console.warn('Could not persist slides (quota exceeded?)', e);
  }
}

function PresentationPanel({ interval }: { interval: number }) {
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setSlides(loadSlides());
  }, []);

  const startTimer = useCallback(
    (count: number) => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (count > 1) {
        timerRef.current = setInterval(() => {
          setCurrentIndex((i) => (i + 1) % count);
        }, interval * 1000);
      }
    },
    [interval]
  );

  useEffect(() => {
    startTimer(slides.length);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [slides.length, startTimer]);

  const goNext = () => {
    setCurrentIndex((i) => (i + 1) % slides.length);
    startTimer(slides.length);
  };

  const goPrev = () => {
    setCurrentIndex((i) => (i - 1 + slides.length) % slides.length);
    startTimer(slides.length);
  };

  if (slides.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black text-gray-500 text-sm">
        No slides loaded — configure in the TV Display settings
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black overflow-hidden group">
      <img
        src={slides[currentIndex]?.dataUrl}
        alt={`Slide ${currentIndex + 1}`}
        className="w-full h-full object-contain"
      />
      {slides.length > 1 && (
        <>
          <button
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
            {currentIndex + 1} / {slides.length}
          </div>
        </>
      )}
    </div>
  );
}

function IframePanel({ url }: { url: string }) {
  return (
    <iframe
      src={url}
      className="w-full h-full border-0"
      style={{ display: 'block', overflow: 'hidden' }}
      scrolling="no"
      title="Panel content"
    />
  );
}

function BlankPanel() {
  return <div className="w-full h-full bg-black" />;
}

function coerceWidgetProps(
  rawProps: Record<string, string>,
  propTypes?: Record<string, 'string' | 'string[]' | 'number'>,
): Record<string, unknown> {
  if (!propTypes) return rawProps;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawProps)) {
    const type = propTypes[key];
    if (type === 'string[]') {
      result[key] = value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (type === 'number') {
      result[key] = parseFloat(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function WidgetPanel({ config }: { config: PanelConfig }) {
  if (!config.widgetType) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-900 text-gray-500 text-sm">
        No widget selected
      </div>
    );
  }
  const entry = getWidget(config.widgetType);
  if (!entry) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-900 text-gray-500 text-sm">
        Unknown widget
      </div>
    );
  }
  const WidgetComponent = entry.component;
  const coerced = coerceWidgetProps(config.widgetProps ?? {}, entry.propTypes);
  const props = { ...(entry.defaultProps ?? {}), ...coerced };
  return (
    <div className="w-full h-full overflow-auto bg-white p-2">
      <WidgetComponent {...props} />
    </div>
  );
}

function LivePanel({ config, interval }: { config: PanelConfig; interval: number }) {
  if (config.content === 'blank') return <BlankPanel />;
  if (config.content === 'presentation') return <PresentationPanel interval={interval} />;
  if (config.content === 'widget') return <WidgetPanel config={config} />;
  return <IframePanel url={CONTENT_URLS[config.content as keyof typeof CONTENT_URLS]} />;
}

function SlideManager({
  slides,
  onSlidesChange,
}: {
  slides: SlideData[];
  onSlidesChange: (s: SlideData[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setLoading(true);
    const newSlides: SlideData[] = [...slides];

    for (const file of files) {
      if (file.type === 'application/pdf') {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d')!;
            await page.render({ canvasContext: ctx, viewport }).promise;
            newSlides.push({
              id: `${Date.now()}-${pageNum}-${Math.random()}`,
              dataUrl: canvas.toDataURL('image/jpeg', 0.85),
              name: `${file.name} — Page ${pageNum}`,
            });
          }
        } catch (err) {
          console.error('Failed to render PDF', err);
        }
      } else if (file.type.startsWith('image/')) {
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        newSlides.push({
          id: `${Date.now()}-${Math.random()}`,
          dataUrl,
          name: file.name,
        });
      }
    }

    onSlidesChange(newSlides);
    setLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeSlide = (id: string) => {
    onSlidesChange(slides.filter((s) => s.id !== id));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
        >
          <Upload className="h-4 w-4 mr-1" />
          {loading ? 'Processing...' : 'Upload Images / PDF'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf"
          multiple
          className="hidden"
          onChange={handleFileUpload}
        />
        {slides.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-red-500 hover:text-red-600"
            onClick={() => onSlidesChange([])}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Clear All
          </Button>
        )}
      </div>
      {slides.length > 0 ? (
        <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1 border rounded bg-gray-50">
          {slides.map((slide, idx) => (
            <div
              key={slide.id}
              className="relative group rounded overflow-hidden border bg-white"
            >
              <img
                src={slide.dataUrl}
                alt={slide.name}
                className="w-full aspect-video object-contain"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                <span className="text-white text-xs font-bold">{idx + 1}</span>
                <button
                  onClick={() => removeSlide(slide.id)}
                  className="text-red-300 hover:text-red-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400 italic">No slides yet. Upload images or a PDF.</p>
      )}
    </div>
  );
}

export default function TVDisplayPage() {
  const [config, setConfig] = useState<TVConfig>(loadConfig);
  const [isLive, setIsLive] = useState(false);
  const [showExitHint, setShowExitHint] = useState(false);
  const [slides, setSlides] = useState<SlideData[]>(loadSlides);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, navigate] = useLocation();

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else {
      navigate('/');
    }
  };

  useEffect(() => {
    if (!isLive) return;
    setShowExitHint(true);
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setShowExitHint(false), 4000);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsLive(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, [isLive]);

  const panelCount = config.layout === '2-panel' ? 2 : 4;
  const allWidgets = getAllWidgets();

  useEffect(() => {
    saveConfig(config);
  }, [config]);

  useEffect(() => {
    saveSlides(slides);
  }, [slides]);

  const updateLayout = (layout: LayoutType) => {
    setConfig((c) => ({ ...c, layout }));
  };

  const updatePanelContent = (index: number, selectValue: string) => {
    setConfig((c) => {
      const panels = [...c.panels];
      if (selectValue.startsWith('widget:')) {
        const widgetType = selectValue.slice('widget:'.length) as WidgetTypeId;
        panels[index] = { content: 'widget', widgetType, widgetProps: {} };
      } else {
        panels[index] = { content: selectValue as PanelContent };
      }
      return { ...c, panels };
    });
  };

  const updatePanelWidgetProp = (panelIndex: number, propKey: string, propValue: string) => {
    setConfig((c) => {
      const panels = [...c.panels];
      panels[panelIndex] = {
        ...panels[panelIndex],
        widgetProps: { ...(panels[panelIndex].widgetProps ?? {}), [propKey]: propValue },
      };
      return { ...c, panels };
    });
  };

  const updateInterval = (val: string) => {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 1) setConfig((c) => ({ ...c, slideInterval: n }));
  };

  const handleMouseMove = () => {
    setShowExitHint(true);
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setShowExitHint(false), 3000);
  };

  const hasPresentationPanel = config.panels
    .slice(0, panelCount)
    .some((p) => p.content === 'presentation');

  const getPanelSelectValue = (panel: PanelConfig): string => {
    if (panel.content === 'widget' && panel.widgetType) {
      return `widget:${panel.widgetType}`;
    }
    return panel.content;
  };

  if (isLive) {
    const activePanels = config.panels.slice(0, panelCount);
    return (
      <div
        className={cn(
          'fixed inset-0 z-50 bg-black',
          panelCount === 2 ? 'grid grid-cols-2' : 'grid grid-cols-2 grid-rows-2'
        )}
        style={{ width: '100vw', height: '100vh' }}
        onMouseMove={handleMouseMove}
      >
        {activePanels.map((panel, i) => (
          <div key={i} className="relative overflow-hidden">
            <LivePanel config={panel} interval={config.slideInterval} />
          </div>
        ))}

        <button
          className={cn(
            'fixed top-4 right-4 z-[9999] bg-black/80 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm transition-opacity duration-500 hover:bg-black',
            showExitHint ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
          onClick={() => setIsLive(false)}
          data-testid="button-tv-display-exit-live"
        >
          <X className="h-4 w-4" />
          Exit Live Mode (Esc)
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleBack}
            data-testid="button-tv-display-back"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Monitor className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">TV Display</h1>
            <p className="text-sm text-gray-500">
              Configure and launch a multi-panel shop floor display.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border shadow-sm p-6 space-y-6">
          <div className="space-y-2">
            <Label className="text-base font-semibold">Layout</Label>
            <div className="flex gap-3">
              <button
                onClick={() => updateLayout('2-panel')}
                className={cn(
                  'flex-1 border-2 rounded-lg p-4 flex flex-col items-center gap-2 transition-colors cursor-pointer',
                  config.layout === '2-panel'
                    ? 'border-primary bg-primary/5'
                    : 'border-gray-200 hover:border-gray-300'
                )}
              >
                <div className="flex gap-1 w-20">
                  <div className="flex-1 h-12 bg-gray-300 rounded" />
                  <div className="flex-1 h-12 bg-gray-300 rounded" />
                </div>
                <span className="text-sm font-medium">Split (2-panel)</span>
              </button>
              <button
                onClick={() => updateLayout('4-panel')}
                className={cn(
                  'flex-1 border-2 rounded-lg p-4 flex flex-col items-center gap-2 transition-colors cursor-pointer',
                  config.layout === '4-panel'
                    ? 'border-primary bg-primary/5'
                    : 'border-gray-200 hover:border-gray-300'
                )}
              >
                <div className="grid grid-cols-2 gap-1 w-20">
                  <div className="h-6 bg-gray-300 rounded" />
                  <div className="h-6 bg-gray-300 rounded" />
                  <div className="h-6 bg-gray-300 rounded" />
                  <div className="h-6 bg-gray-300 rounded" />
                </div>
                <span className="text-sm font-medium">Four-Screen (4-panel)</span>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-base font-semibold">Panel Content</Label>
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: panelCount }).map((_, i) => {
                const panel = config.panels[i] ?? { content: 'blank' };
                const selectValue = getPanelSelectValue(panel);
                const widgetEntry =
                  panel.content === 'widget' && panel.widgetType
                    ? getWidget(panel.widgetType)
                    : undefined;
                return (
                  <div key={i} className="space-y-2">
                    <Label className="text-xs text-gray-500">
                      Panel {i + 1}
                      {config.layout === '4-panel' &&
                        ` (${i === 0 ? 'Top-Left' : i === 1 ? 'Top-Right' : i === 2 ? 'Bottom-Left' : 'Bottom-Right'})`}
                      {config.layout === '2-panel' && ` (${i === 0 ? 'Left' : 'Right'})`}
                    </Label>
                    <Select
                      value={selectValue}
                      onValueChange={(val) => updatePanelContent(i, val)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__live_modules_header__" disabled>
                          — Live Modules —
                        </SelectItem>
                        {LIVE_MODULE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                        <SelectItem value="__widgets_header__" disabled>
                          — Catalog Widgets —
                        </SelectItem>
                        {allWidgets.map((w) => (
                          <SelectItem key={w.id} value={`widget:${w.id}`}>
                            {w.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {widgetEntry && widgetEntry.requiredProps.length > 0 && (
                      <div className="space-y-1.5 pl-1 border-l-2 border-primary/30">
                        {widgetEntry.requiredProps.map((propKey) => (
                          <div key={propKey} className="space-y-0.5">
                            <Label className="text-xs text-gray-500">{propKey}</Label>
                            <Input
                              className="h-7 text-xs"
                              placeholder={`Enter ${propKey}…`}
                              value={(panel.widgetProps ?? {})[propKey] ?? ''}
                              onChange={(e) => updatePanelWidgetProp(i, propKey, e.target.value)}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {hasPresentationPanel && (
            <div className="space-y-4 border-t pt-4">
              <Label className="text-base font-semibold">Presentation Slides</Label>
              <div className="flex items-center gap-3">
                <Label className="text-sm text-gray-600 whitespace-nowrap">
                  Auto-advance every
                </Label>
                <Input
                  type="number"
                  min={1}
                  className="w-20"
                  value={config.slideInterval}
                  onChange={(e) => updateInterval(e.target.value)}
                />
                <span className="text-sm text-gray-500">seconds</span>
              </div>
              <SlideManager slides={slides} onSlidesChange={setSlides} />
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button size="lg" className="gap-2" onClick={() => setIsLive(true)}>
            <Play className="h-5 w-5" />
            Go Live
          </Button>
        </div>
      </div>
    </div>
  );
}
