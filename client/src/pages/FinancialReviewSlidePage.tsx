import { useState, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, Printer, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

import CoverSlide from './financial-review/slides/CoverSlide';
import AgendaSlide from './financial-review/slides/AgendaSlide';
import SectionHeaderSlide from './financial-review/slides/SectionHeaderSlide';
import ShipmentsSlide from './financial-review/slides/ShipmentsSlide';
import CreditCardSalesSlide from './financial-review/slides/CreditCardSalesSlide';
import RevenueTrendSlide from './financial-review/slides/RevenueTrendSlide';
import FinancialHighlightsSlide from './financial-review/slides/FinancialHighlightsSlide';
import CashFlowSlide from './financial-review/slides/CashFlowSlide';
import ASFinancialsSlide from './financial-review/slides/ASFinancialsSlide';
import KPIsSlide from './financial-review/slides/KPIsSlide';
import ActionItemsSlide from './financial-review/slides/ActionItemsSlide';
import CustomerScoreSlide from './financial-review/slides/CustomerScoreSlide';
import BDPipelineSlide from './financial-review/slides/BDPipelineSlide';
import RiskOpportunitySlide from './financial-review/slides/RiskOpportunitySlide';
import CalendarSlide from './financial-review/slides/CalendarSlide';

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  return format(d, 'MMMM yyyy');
}

interface Slide {
  title: string;
  render: (props: { session: any; onSave: (f: any) => void; saving: boolean; monthLabel: string }) => JSX.Element;
}

const SLIDES: Slide[] = [
  {
    title: 'Cover',
    render: ({ session, onSave, saving, monthLabel: ml }) => (
      <CoverSlide session={session} monthLabel={ml} onSave={onSave} saving={saving} />
    ),
  },
  {
    title: 'Agenda',
    render: ({ session, onSave, saving }) => (
      <AgendaSlide session={session} onSave={onSave} saving={saving} />
    ),
  },
  {
    title: 'Financial Review',
    render: () => <SectionHeaderSlide title="Financial Review" subtitle="Monthly Performance Summary" />,
  },
  {
    title: '# Products Shipped',
    render: () => <ShipmentsSlide />,
  },
  {
    title: 'Credit Card Sales',
    render: () => <CreditCardSalesSlide />,
  },
  {
    title: 'Revenue Trend',
    render: () => <RevenueTrendSlide />,
  },
  {
    title: 'Combined Financial Highlights',
    render: ({ session, onSave, saving }) => (
      <FinancialHighlightsSlide session={session} onSave={onSave} saving={saving} />
    ),
  },
  {
    title: 'Cash Flow Projection',
    render: ({ session, onSave, saving }) => (
      <CashFlowSlide session={session} onSave={onSave} saving={saving} />
    ),
  },
  {
    title: 'AS Financial Highlights',
    render: ({ session, onSave, saving }) => (
      <ASFinancialsSlide session={session} onSave={onSave} saving={saving} />
    ),
  },
  {
    title: 'Quality Objectives — KPIs',
    render: () => <KPIsSlide />,
  },
  {
    title: 'Quality Objectives (cont.)',
    render: () => (
      <SectionHeaderSlide
        title="Quality Objectives"
        subtitle="AS9100 Compliance & Continuous Improvement"
      />
    ),
  },
  {
    title: 'Action Items Update',
    render: ({ session, onSave, saving }) => (
      <ActionItemsSlide session={session} onSave={onSave} saving={saving} />
    ),
  },
  {
    title: 'Customer Satisfaction Score',
    render: () => <CustomerScoreSlide />,
  },
  {
    title: 'Business Development Pipeline',
    render: ({ session, onSave, saving }) => (
      <BDPipelineSlide session={session} onSave={onSave} saving={saving} />
    ),
  },
  {
    title: 'Risk & Opportunity',
    render: ({ session, onSave, saving }) => (
      <RiskOpportunitySlide session={session} onSave={onSave} saving={saving} />
    ),
  },
  {
    title: 'Calendar Review',
    render: ({ session, onSave, saving }) => (
      <CalendarSlide session={session} onSave={onSave} saving={saving} />
    ),
  },
];

export default function FinancialReviewSlidePage() {
  const params = useParams<{ monthKey: string }>();
  const monthKey = params.monthKey;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [slideIndex, setSlideIndex] = useState(0);

  const { data: session, isLoading } = useQuery<any>({
    queryKey: ['/api/financial-review', monthKey],
    queryFn: async () => {
      const res = await fetch(`/api/financial-review/${monthKey}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load session');
      return res.json();
    },
    enabled: !!monthKey,
  });

  const saveMutation = useMutation({
    mutationFn: (fields: any) =>
      apiRequest('PUT', `/api/financial-review/${monthKey}`, { ...session, ...fields }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/financial-review', monthKey] });
      queryClient.invalidateQueries({ queryKey: ['/api/financial-review'] });
    },
    onError: () => {
      toast({ title: 'Save failed', description: 'Could not save changes. Please try again.', variant: 'destructive' });
    },
  });

  const handleSave = useCallback((fields: any) => {
    saveMutation.mutate(fields);
  }, [saveMutation, session]);

  const slide = SLIDES[slideIndex];
  const ml = monthKey ? monthLabel(monthKey) : '';

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .slide-container { page-break-after: always; box-shadow: none !important; border: none !important; }
          body { margin: 0; }
        }
      `}</style>

      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col">
        {/* Top bar */}
        <div className="no-print bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/finance/review')}>
              <ArrowLeft className="h-4 w-4 mr-1" /> All Reviews
            </Button>
            <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
            <span className="font-semibold text-gray-900 dark:text-white">{ml} — Monthly Business Review</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Slide {slideIndex + 1} / {SLIDES.length}
            </span>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1" /> Print / PDF
            </Button>
          </div>
        </div>

        {/* Slide title bar */}
        <div className="no-print bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 px-6 py-1.5">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span className="text-xs font-mono bg-gray-200 dark:bg-gray-700 rounded px-1.5 py-0.5">{slideIndex + 1}</span>
            <span>{slide.title}</span>
          </div>
        </div>

        {/* Slide area */}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="slide-container w-full max-w-5xl bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden" style={{ minHeight: 540, height: 'calc(100vh - 220px)' }}>
            {isLoading ? (
              <div className="h-full flex items-center justify-center">
                <Skeleton className="w-3/4 h-32" />
              </div>
            ) : (
              slide.render({
                session,
                onSave: handleSave,
                saving: saveMutation.isPending,
                monthLabel: ml,
              })
            )}
          </div>
        </div>

        {/* Navigation controls */}
        <div className="no-print bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => setSlideIndex((i) => Math.max(0, i - 1))}
            disabled={slideIndex === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>

          {/* Slide dots */}
          <div className="flex gap-1.5 overflow-x-auto max-w-lg">
            {SLIDES.map((s, i) => (
              <button
                key={i}
                title={s.title}
                onClick={() => setSlideIndex(i)}
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-colors ${
                  i === slideIndex
                    ? 'bg-blue-600'
                    : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400'
                }`}
              />
            ))}
          </div>

          <Button
            variant="outline"
            onClick={() => setSlideIndex((i) => Math.min(SLIDES.length - 1, i + 1))}
            disabled={slideIndex === SLIDES.length - 1}
          >
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </>
  );
}
