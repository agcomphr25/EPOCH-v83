import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Calendar, Clock, Target, Shield, AlertTriangle, CheckCircle2, Loader2, CalendarDays } from 'lucide-react';
import { getConfidenceLabel, getConfidenceColor, getConfidenceDotColor, type ConfidenceLevel } from '@/lib/forecastConfidence';
import { format } from 'date-fns';

interface ForecastData {
  recommendedDate: string;
  confidence: ConfidenceLevel;
  window: {
    earliest: string;
    latest: string;
  };
  timeline?: { stage: string; date: string }[];
  reasons: string[];
  totalBusinessDays: number;
  estimatedCycleDays: number;
  backlogDelayDays: number;
}

interface ForecastDateModalProps {
  open: boolean;
  onClose: () => void;
  onSelectDate: (date: Date, isManual: boolean) => void;
  forecastData: ForecastData | null;
  isLoading: boolean;
  error: string | null;
}

function formatDate(iso: string): string {
  try {
    return format(new Date(iso), 'MMM d, yyyy');
  } catch {
    return iso;
  }
}

function getDaysBetween(a: string, b: string): number {
  const msPerDay = 86400000;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / msPerDay);
}

export function ForecastDateModal({
  open,
  onClose,
  onSelectDate,
  forecastData,
  isLoading,
  error,
}: ForecastDateModalProps) {
  const [showManualPicker, setShowManualPicker] = useState(false);
  const [manualDate, setManualDate] = useState('');

  const handleSelect = (dateStr: string, manual: boolean) => {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      onSelectDate(d, manual);
      onClose();
    }
  };

  const confidenceLevel = forecastData?.confidence ?? 'Low';
  const confidenceColor = getConfidenceColor(confidenceLevel);
  const dotColor = getConfidenceDotColor(confidenceLevel);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5 text-blue-600" />
            Estimated Completion Forecast
          </DialogTitle>
          <DialogDescription>
            Select a forecast-based completion date or choose manually
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-sm text-muted-foreground">Running production forecast...</p>
          </div>
        )}

        {error && !isLoading && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-amber-800">Forecast unavailable</p>
                <p className="text-sm text-amber-700 mt-1">
                  {error}. Using default 14-week estimate.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Select a date manually</Label>
              <Input
                type="date"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
              />
              <Button
                className="w-full"
                disabled={!manualDate}
                onClick={() => handleSelect(manualDate, true)}
              >
                Use Selected Date
              </Button>
            </div>
          </div>
        )}

        {forecastData && !isLoading && !error && (
          <div className="space-y-5">
            <div className="p-4 rounded-lg border bg-blue-50/50 border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Recommended Completion</span>
                <Badge variant="outline" className={`${confidenceColor} text-xs`}>
                  <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${dotColor}`} />
                  {confidenceLevel} Confidence
                </Badge>
              </div>
              <p className="text-2xl font-bold text-blue-900">
                {formatDate(forecastData.recommendedDate)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                ~{forecastData.totalBusinessDays} business days from today
              </p>
              <Button
                className="mt-3 w-full"
                onClick={() => handleSelect(forecastData.recommendedDate, false)}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Use Recommended Date
              </Button>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                Expected Window
              </h4>
              <div className="relative">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>Earliest</span>
                  <span>Most Likely</span>
                  <span>Latest</span>
                </div>
                <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="absolute inset-y-0 left-[10%] right-[10%] bg-gradient-to-r from-green-200 via-blue-300 to-amber-200 rounded-full" />
                  {(() => {
                    const totalSpan = getDaysBetween(forecastData.window.earliest, forecastData.window.latest);
                    const recSpan = getDaysBetween(forecastData.window.earliest, forecastData.recommendedDate);
                    const pct = totalSpan > 0 ? Math.max(10, Math.min(90, 10 + (recSpan / totalSpan) * 80)) : 50;
                    return (
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-600 border-2 border-white rounded-full shadow"
                        style={{ left: `${pct}%`, transform: 'translate(-50%, -50%)' }}
                      />
                    );
                  })()}
                </div>
                <div className="flex items-center justify-between text-xs font-medium mt-1">
                  <span className="text-green-700">{formatDate(forecastData.window.earliest)}</span>
                  <span className="text-blue-700 font-bold">{formatDate(forecastData.recommendedDate)}</span>
                  <span className="text-amber-700">{formatDate(forecastData.window.latest)}</span>
                </div>
              </div>
            </div>

            <Separator />

            {forecastData.timeline && forecastData.timeline.length > 0 && (
              <>
                <div>
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    Production Timeline
                  </h4>
                  <div className="space-y-0">
                    {forecastData.timeline.map((step, i) => (
                      <div key={step.stage} className="flex items-center gap-3 relative">
                        <div className="flex flex-col items-center">
                          <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-blue-200 z-10" />
                          {i < forecastData.timeline!.length - 1 && (
                            <div className="w-0.5 h-6 bg-blue-200" />
                          )}
                        </div>
                        <div className="flex items-center justify-between flex-1 py-1">
                          <span className="text-sm">{step.stage}</span>
                          <span className="text-xs text-muted-foreground">{formatDate(step.date)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <Separator />
              </>
            )}

            {forecastData.reasons.length > 0 && (
              <>
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    Forecast Reasoning
                  </h4>
                  <ul className="space-y-1">
                    {forecastData.reasons.map((reason, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
                <Separator />
              </>
            )}

            <div>
              <h4 className="text-sm font-medium mb-3">Alternative Options</h4>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-auto py-3 flex flex-col gap-1"
                  onClick={() => handleSelect(forecastData.window.earliest, false)}
                >
                  <span className="text-xs text-muted-foreground">Earliest Possible</span>
                  <span className="text-sm font-medium">{formatDate(forecastData.window.earliest)}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-auto py-3 flex flex-col gap-1 border-blue-300 bg-blue-50"
                  onClick={() => handleSelect(forecastData.recommendedDate, false)}
                >
                  <span className="text-xs text-muted-foreground">Recommended</span>
                  <span className="text-sm font-medium">{formatDate(forecastData.recommendedDate)}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-auto py-3 flex flex-col gap-1"
                  onClick={() => handleSelect(forecastData.window.latest, false)}
                >
                  <span className="text-xs text-muted-foreground">Conservative</span>
                  <span className="text-sm font-medium">{formatDate(forecastData.window.latest)}</span>
                </Button>
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                Manual Override
              </h4>
              {!showManualPicker ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowManualPicker(true)}
                >
                  Open Calendar Picker
                </Button>
              ) : (
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">Pick any date</Label>
                    <Input
                      type="date"
                      value={manualDate}
                      onChange={(e) => setManualDate(e.target.value)}
                    />
                  </div>
                  <Button
                    size="sm"
                    disabled={!manualDate}
                    onClick={() => handleSelect(manualDate, true)}
                  >
                    Use This Date
                  </Button>
                </div>
              )}
              {showManualPicker && (
                <p className="text-xs text-muted-foreground mt-1">
                  Manual dates will not auto-adjust for model or rush fee changes.
                </p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
