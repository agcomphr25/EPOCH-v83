import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  ChevronLeft,
  ChevronRight,
  Database,
  Edit,
  FileSpreadsheet,
  BarChart3,
  Calendar,
  DollarSign,
  Package,
  Users,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Presentation,
} from 'lucide-react';

interface DataField {
  name: string;
  source: 'epoch' | 'manual' | 'calculated';
  table?: string;
  description: string;
  currentValue?: string | number;
}

interface Slide {
  id: number;
  title: string;
  section: string;
  content: string[];
  dataFields: DataField[];
}

const slides: Slide[] = [
  {
    id: 1,
    title: 'Monthly Business Review',
    section: 'Title',
    content: ['Dec. 11, 2025', 'LLC', 'Responsive  Reliable  Supportive'],
    dataFields: [
      { name: 'Review Date', source: 'manual', description: 'Date of the monthly review meeting' },
    ],
  },
  {
    id: 2,
    title: 'Agenda',
    section: 'Overview',
    content: [
      'Financial Overview - Glenn',
      'KPI chart and tracking',
      'Financial Forecast - Dave',
      'Customer Service/Marketing - Matt',
      'Action Items & Calendar Review - Laurie',
      'CAR Update - Laurie',
      'Risk/Opportunity - Dave',
      'Add\'l Discussion Points & Conclusion',
      'Owner Meeting',
    ],
    dataFields: [],
  },
  {
    id: 3,
    title: 'Financial Review',
    section: 'Financial',
    content: ['Glenn Jones', 'LLC', 'Responsive  Reliable  Supportive'],
    dataFields: [],
  },
  {
    id: 4,
    title: '# Products Shipped',
    section: 'Financial',
    content: [
      'Shipped stocks in Nov: 202',
      'Shipped stocks in Oct: 253',
      'Shipped stocks in Sep: 338',
      '4-Week Moving Average: 238',
      'AS products delivered Nov: 63',
      'AS products delivered Oct: 85',
    ],
    dataFields: [
      { name: 'Shipped Stocks (Current Month)', source: 'epoch', table: 'all_orders', description: 'Count of orders with shippedDate in current month' },
      { name: 'Shipped Stocks (Previous Month)', source: 'epoch', table: 'all_orders', description: 'Count of orders with shippedDate in previous month' },
      { name: 'Shipped Stocks (2 Months Ago)', source: 'epoch', table: 'all_orders', description: 'Count of orders with shippedDate 2 months ago' },
      { name: '4-Week Moving Average', source: 'calculated', description: 'Calculated from weekly shipment data' },
      { name: 'AS Products Delivered', source: 'epoch', table: 'all_orders', description: 'Filter by AS product type and shippedDate' },
    ],
  },
  {
    id: 5,
    title: 'Credit Card Sales',
    section: 'Financial',
    content: [
      'Credit card sales for Nov 2025: $71,694',
      'Credit card sales for Oct 2025: $64,391',
      'Credit card sales for Nov 2024: $219,366',
      'Credit card sales for Oct 2024: $149,189',
      'Credit card sales for Dec 2024: $122,023',
      'YTD Comparison 1,917,913.66 (2024) v 1,483,604.54 (2025)',
      '77%',
    ],
    dataFields: [
      { name: 'Credit Card Sales (Current Month)', source: 'epoch', table: 'payments', description: 'Sum of payments where paymentType = credit_card for current month' },
      { name: 'Credit Card Sales (Previous Month)', source: 'epoch', table: 'payments', description: 'Sum of payments where paymentType = credit_card for previous month' },
      { name: 'Credit Card Sales YTD', source: 'epoch', table: 'payments', description: 'Sum of all credit card payments for current year' },
      { name: 'YoY Comparison %', source: 'calculated', description: 'Calculated from current YTD vs prior year YTD' },
    ],
  },
  {
    id: 6,
    title: 'Chart Slide',
    section: 'Financial',
    content: ['(Chart placeholder)'],
    dataFields: [],
  },
  {
    id: 7,
    title: 'Combined Financial Highlights',
    section: 'Financial',
    content: [
      'Revenue Nov 2025: $143,964.30',
      'Revenue Oct 2025: $200,480.85',
      'Revenue YTD: $2,244,966.88',
      'Gross Margin: 33.63% / 53.69% / 38.21%',
      'Net Income: -$5,937.37 / $18,427.93 / -$79,631.45',
      'Net Margin: -3.84% / 9.43% / -3.55%',
      'Cash: $263,622 end of Nov',
      'Forecast: $300,000 end of Dec',
    ],
    dataFields: [
      { name: 'Monthly Revenue', source: 'epoch', table: 'payments', description: 'Sum of all payments for the month' },
      { name: 'YTD Revenue', source: 'epoch', table: 'payments', description: 'Sum of all payments for the year' },
      { name: 'Gross Margin %', source: 'manual', description: 'Requires COGS data - enter manually' },
      { name: 'Net Income', source: 'manual', description: 'Requires full P&L - enter manually' },
      { name: 'Net Margin %', source: 'calculated', description: 'Net Income / Revenue' },
      { name: 'Cash Balance', source: 'manual', description: 'Bank balance - enter manually' },
    ],
  },
  {
    id: 8,
    title: 'Cash Flow Projection',
    section: 'Financial',
    content: ['May - Aug projection chart'],
    dataFields: [
      { name: 'Cash Flow Projections', source: 'manual', description: 'Forward-looking projections - enter manually' },
    ],
  },
  {
    id: 9,
    title: 'AS Financial Highlights',
    section: 'Financial',
    content: [
      'Revenue Sep 2025: $52,600.00',
      'Revenue YTD: $375,292.72',
      'Gross Margin: 36.04% / 49.44%',
      'Net Income: $16,439.27 / $157,125.44',
      'Net Margin: 31.25% / 41.87%',
      'DDTC: $3,000.00',
    ],
    dataFields: [
      { name: 'AS Revenue', source: 'epoch', table: 'all_orders', description: 'Filter by AS order type, sum payment amounts' },
      { name: 'AS Gross Margin', source: 'manual', description: 'Requires AS-specific COGS' },
      { name: 'AS Net Income', source: 'manual', description: 'Requires AS-specific expenses' },
    ],
  },
  {
    id: 10,
    title: 'Quality Objectives PL1',
    section: 'KPIs',
    content: [
      'Sales: Year over year revenue growth - Goal: 5%',
      'Sales: 12 month credit card sales growth - Goal: 5%',
      'Monthly KPI tracking table',
    ],
    dataFields: [
      { name: 'YoY Revenue Growth', source: 'calculated', description: 'Compare current period revenue to same period last year' },
      { name: '12-Month CC Sales Growth', source: 'calculated', description: 'Rolling 12-month comparison' },
      { name: 'Monthly KPI Values', source: 'epoch', table: 'multiple', description: 'Various metrics tracked over time' },
    ],
  },
  {
    id: 11,
    title: 'Quality Objectives (continued)',
    section: 'KPIs',
    content: ['Additional quality metrics and tracking'],
    dataFields: [
      { name: 'On-Time Delivery %', source: 'epoch', table: 'all_orders', description: 'Orders shipped by dueDate / total orders' },
      { name: 'Quality Defect Rate', source: 'epoch', table: 'nonconformance', description: 'Count of NCRs / total production' },
    ],
  },
  {
    id: 12,
    title: 'Action Items Update',
    section: 'Action Items',
    content: ['Outstanding action items from previous meetings'],
    dataFields: [
      { name: 'Open Action Items', source: 'epoch', table: 'tasks', description: 'Tasks assigned from business reviews' },
      { name: 'Completed Actions', source: 'epoch', table: 'tasks', description: 'Tasks completed since last review' },
    ],
  },
  {
    id: 13,
    title: 'Action Items (continued)',
    section: 'Action Items',
    content: ['Additional action items and assignments'],
    dataFields: [],
  },
  {
    id: 14,
    title: 'Action Items (continued)',
    section: 'Action Items',
    content: ['More action items'],
    dataFields: [],
  },
  {
    id: 15,
    title: 'Accounting Alerts',
    section: 'Action Items',
    content: ['Financial and accounting notifications'],
    dataFields: [
      { name: 'Outstanding Invoices', source: 'epoch', table: 'all_orders', description: 'Orders where isPaid = false' },
      { name: 'Overdue Payments', source: 'epoch', table: 'all_orders', description: 'Unpaid orders past due date' },
    ],
  },
  {
    id: 16,
    title: 'Customer Satisfaction',
    section: 'Customer Service',
    content: ['Survey results and feedback'],
    dataFields: [
      { name: 'CSAT Score', source: 'epoch', table: 'customer_satisfaction', description: 'Average satisfaction rating' },
      { name: 'NPS Score', source: 'manual', description: 'Net Promoter Score - survey required' },
      { name: 'Customer Complaints', source: 'epoch', table: 'nonconformance', description: 'Customer-reported issues' },
    ],
  },
  {
    id: 17,
    title: 'Marketing Update',
    section: 'Customer Service',
    content: ['Marketing activities and campaigns'],
    dataFields: [
      { name: 'Website Traffic', source: 'manual', description: 'Google Analytics data' },
      { name: 'Lead Count', source: 'manual', description: 'New inquiries/leads' },
      { name: 'Conversion Rate', source: 'calculated', description: 'Orders / Leads' },
    ],
  },
  {
    id: 18,
    title: 'Marketing (continued)',
    section: 'Customer Service',
    content: ['Additional marketing metrics'],
    dataFields: [],
  },
  {
    id: 19,
    title: 'Production Update',
    section: 'Operations',
    content: ['Production status and metrics'],
    dataFields: [
      { name: 'Orders in Production', source: 'epoch', table: 'all_orders', description: 'Count of orders in production departments' },
      { name: 'Production Backlog', source: 'epoch', table: 'all_orders', description: 'Orders not yet started' },
      { name: 'Avg Lead Time', source: 'calculated', description: 'Average days from order to ship' },
    ],
  },
  {
    id: 20,
    title: 'Inventory Status',
    section: 'Operations',
    content: ['Inventory levels and alerts'],
    dataFields: [
      { name: 'Parts Below Min', source: 'epoch', table: 'parts_inventory', description: 'Parts needing reorder' },
      { name: 'Total Inventory Value', source: 'epoch', table: 'parts_inventory', description: 'Sum of inventory * unit cost' },
    ],
  },
  {
    id: 21,
    title: 'Training Status',
    section: 'Operations',
    content: ['Employee training completion'],
    dataFields: [
      { name: 'Training Completion %', source: 'epoch', table: 'employee_certifications', description: 'Completed / Required certifications' },
      { name: 'Overdue Certifications', source: 'epoch', table: 'employee_certifications', description: 'Expired or expiring soon' },
    ],
  },
  {
    id: 22,
    title: 'Personnel Updates',
    section: 'Operations',
    content: ['Staffing and HR updates'],
    dataFields: [
      { name: 'Headcount', source: 'epoch', table: 'users', description: 'Active employee count' },
      { name: 'Open Positions', source: 'manual', description: 'Hiring needs' },
    ],
  },
  {
    id: 23,
    title: 'Calendar Review',
    section: 'Calendar',
    content: [
      'Short Term Events (30 days):',
      '- Dec 11 - Business Review',
      '- Dec 17 - Christmas Party',
      '- TBD - Annual EAB Meeting',
      'Mid-Term Events (31-90 days):',
      '- Jan 8 - Business Review',
      '- Feb 2-6 - Maintenance Week',
      '- Feb 12 - Business Review',
      '- Mar 16-20 - Calibration Week',
      'Long-Term Events (91+ days):',
      '- Apr 9 - Business Review',
    ],
    dataFields: [
      { name: 'Calendar Events', source: 'epoch', table: 'calendar_events', description: 'Scheduled business events' },
      { name: 'Maintenance Schedule', source: 'epoch', table: 'maintenance_records', description: 'Planned maintenance' },
    ],
  },
  {
    id: 24,
    title: 'Corrective Actions Update',
    section: 'Quality',
    content: ['Laurie Tandy', 'LLC'],
    dataFields: [],
  },
  {
    id: 25,
    title: 'Open CARs',
    section: 'Quality',
    content: ['Open CARs: N/A'],
    dataFields: [
      { name: 'Open CARs', source: 'epoch', table: 'corrective_actions', description: 'Active corrective action requests' },
      { name: 'CAR Status', source: 'epoch', table: 'corrective_actions', description: 'Status of each open CAR' },
    ],
  },
  {
    id: 26,
    title: 'Risks and Opportunities',
    section: 'Risk',
    content: ['Dave Tandy', 'LLC'],
    dataFields: [],
  },
  {
    id: 27,
    title: 'Update & Identify Risks & Opportunities',
    section: 'Risk',
    content: ['SEE: QMS Dashboard "Org Risks"'],
    dataFields: [
      { name: 'Risk Register', source: 'epoch', table: 'risk_register', description: 'Identified organizational risks' },
      { name: 'Opportunity Log', source: 'manual', description: 'Business opportunities identified' },
    ],
  },
  {
    id: 28,
    title: 'Conclusion',
    section: 'Closing',
    content: ['Meeting wrap-up'],
    dataFields: [],
  },
  {
    id: 29,
    title: 'Owner Discussion Points',
    section: 'Closing',
    content: ['Christmas Bonus', 'Follow up on Steve\'s email'],
    dataFields: [],
  },
];

function getSourceIcon(source: DataField['source']) {
  switch (source) {
    case 'epoch':
      return <Database className="h-4 w-4 text-green-600" />;
    case 'calculated':
      return <BarChart3 className="h-4 w-4 text-blue-600" />;
    case 'manual':
      return <Edit className="h-4 w-4 text-orange-500" />;
  }
}

function getSourceBadge(source: DataField['source']) {
  switch (source) {
    case 'epoch':
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">EPOCH Auto</Badge>;
    case 'calculated':
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Calculated</Badge>;
    case 'manual':
      return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">Manual Entry</Badge>;
  }
}

interface FieldWithSlide extends DataField {
  slideId: number;
  slideTitle: string;
}

export default function BusinessReviewPresentation() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [view, setView] = useState<'presentation' | 'data-mapping'>('presentation');

  const goToSlide = useCallback((index: number) => {
    if (index >= 0 && index < slides.length) {
      setCurrentSlide(index);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (view !== 'presentation') return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goToSlide(currentSlide - 1);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goToSlide(currentSlide + 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        goToSlide(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        goToSlide(slides.length - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSlide, view, goToSlide]);

  const currentSlideData = slides[currentSlide];

  const epochFieldsWithSlides: FieldWithSlide[] = slides.flatMap(s => 
    s.dataFields.filter(f => f.source === 'epoch').map(f => ({ ...f, slideId: s.id, slideTitle: s.title }))
  );
  const calculatedFieldsWithSlides: FieldWithSlide[] = slides.flatMap(s => 
    s.dataFields.filter(f => f.source === 'calculated').map(f => ({ ...f, slideId: s.id, slideTitle: s.title }))
  );
  const manualFieldsWithSlides: FieldWithSlide[] = slides.flatMap(s => 
    s.dataFields.filter(f => f.source === 'manual').map(f => ({ ...f, slideId: s.id, slideTitle: s.title }))
  );

  const sections = Array.from(new Set(slides.map(s => s.section)));

  return (
    <div className="container mx-auto p-6 max-w-7xl" data-testid="business-review-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="page-title">
            <Presentation className="h-8 w-8" />
            Monthly Business Review
          </h1>
          <p className="text-muted-foreground mt-1">December 2025 - Imported from PowerPoint</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={view === 'presentation' ? 'default' : 'outline'}
            onClick={() => setView('presentation')}
            data-testid="btn-presentation-view"
          >
            <Presentation className="h-4 w-4 mr-2" />
            Slides
          </Button>
          <Button
            variant={view === 'data-mapping' ? 'default' : 'outline'}
            onClick={() => setView('data-mapping')}
            data-testid="btn-data-mapping-view"
          >
            <Database className="h-4 w-4 mr-2" />
            Data Mapping
          </Button>
        </div>
      </div>

      {view === 'presentation' ? (
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-3">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Slides ({slides.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[600px]">
                  {slides.map((slide, index) => (
                    <button
                      key={slide.id}
                      onClick={() => goToSlide(index)}
                      className={`w-full text-left px-4 py-3 border-b hover:bg-muted/50 transition-colors ${
                        currentSlide === index ? 'bg-primary/10 border-l-4 border-l-primary' : ''
                      }`}
                      data-testid={`slide-nav-${slide.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">{slide.id}</span>
                        <span className="text-sm font-medium truncate">{slide.title}</span>
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <Badge variant="secondary" className="text-xs">{slide.section}</Badge>
                        {slide.dataFields.some(f => f.source === 'epoch') && (
                          <Database className="h-3 w-3 text-green-600" />
                        )}
                      </div>
                    </button>
                  ))}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          <div className="col-span-9">
            <Card className="h-[600px] flex flex-col">
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <Badge variant="secondary">{currentSlideData.section}</Badge>
                    <CardTitle className="mt-2">{currentSlideData.title}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => goToSlide(currentSlide - 1)}
                      disabled={currentSlide === 0}
                      data-testid="btn-prev-slide"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground px-2">
                      {currentSlide + 1} / {slides.length}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => goToSlide(currentSlide + 1)}
                      disabled={currentSlide === slides.length - 1}
                      data-testid="btn-next-slide"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 p-6 overflow-auto">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-3">SLIDE CONTENT</h3>
                    <ul className="space-y-2">
                      {currentSlideData.content.map((item, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <Circle className="h-2 w-2 mt-2 flex-shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {currentSlideData.dataFields.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                          DATA FIELDS ({currentSlideData.dataFields.length})
                        </h3>
                        <div className="space-y-3">
                          {currentSlideData.dataFields.map((field, index) => (
                            <div
                              key={index}
                              className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30"
                            >
                              {getSourceIcon(field.source)}
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium">{field.name}</span>
                                  {getSourceBadge(field.source)}
                                </div>
                                <p className="text-sm text-muted-foreground">{field.description}</p>
                                {field.table && (
                                  <code className="text-xs bg-muted px-1 py-0.5 rounded mt-1 inline-block">
                                    Table: {field.table}
                                  </code>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <Card className="border-green-200 bg-green-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Database className="h-5 w-5 text-green-600" />
                  EPOCH Auto-Populated
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-green-700">{epochFieldsWithSlides.length}</p>
                <p className="text-sm text-muted-foreground">Fields can be pulled from database</p>
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-600" />
                  Calculated Fields
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-blue-700">{calculatedFieldsWithSlides.length}</p>
                <p className="text-sm text-muted-foreground">Derived from EPOCH data</p>
              </CardContent>
            </Card>

            <Card className="border-orange-200 bg-orange-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Edit className="h-5 w-5 text-orange-500" />
                  Manual Entry
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-orange-700">{manualFieldsWithSlides.length}</p>
                <p className="text-sm text-muted-foreground">Requires external data input</p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="epoch" className="w-full">
            <TabsList>
              <TabsTrigger value="epoch" className="gap-2">
                <Database className="h-4 w-4" />
                EPOCH Fields ({epochFieldsWithSlides.length})
              </TabsTrigger>
              <TabsTrigger value="calculated" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Calculated ({calculatedFieldsWithSlides.length})
              </TabsTrigger>
              <TabsTrigger value="manual" className="gap-2">
                <Edit className="h-4 w-4" />
                Manual ({manualFieldsWithSlides.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="epoch" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Fields That Can Be Auto-Populated from EPOCH</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    These fields can be automatically pulled from the EPOCH database for the monthly review
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {epochFieldsWithSlides.map((field, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-3 p-4 rounded-lg border bg-green-50/50"
                      >
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold">{field.name}</span>
                            {field.table && (
                              <code className="text-xs bg-green-100 px-2 py-0.5 rounded text-green-800">
                                {field.table}
                              </code>
                            )}
                            <Badge variant="outline" className="text-xs">
                              Slide {field.slideId}: {field.slideTitle}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{field.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="calculated" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Calculated Fields</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    These fields are derived from EPOCH data through calculations
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {calculatedFieldsWithSlides.map((field, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-3 p-4 rounded-lg border bg-blue-50/50"
                      >
                        <BarChart3 className="h-5 w-5 text-blue-600 mt-0.5" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold">{field.name}</span>
                            <Badge variant="outline" className="text-xs">
                              Slide {field.slideId}: {field.slideTitle}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{field.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="manual" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Manual Entry Required</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    These fields require data from external sources or manual input
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {manualFieldsWithSlides.map((field, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-3 p-4 rounded-lg border bg-orange-50/50"
                      >
                        <AlertTriangle className="h-5 w-5 text-orange-500 mt-0.5" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold">{field.name}</span>
                            <Badge variant="outline" className="text-xs">
                              Slide {field.slideId}: {field.slideTitle}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{field.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <Card>
            <CardHeader>
              <CardTitle>Implementation Priority</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold flex items-center gap-2 mb-2">
                    <Package className="h-4 w-4" />
                    High Priority - Core Metrics
                  </h4>
                  <ul className="text-sm space-y-1 text-muted-foreground ml-6">
                    <li>Products Shipped by Month (all_orders.shippedDate)</li>
                    <li>Credit Card Sales by Month (payments table)</li>
                    <li>Monthly Revenue Totals (payments table)</li>
                    <li>Orders in Production (all_orders.currentDepartment)</li>
                  </ul>
                </div>
                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold flex items-center gap-2 mb-2">
                    <Users className="h-4 w-4" />
                    Medium Priority - Operations
                  </h4>
                  <ul className="text-sm space-y-1 text-muted-foreground ml-6">
                    <li>On-Time Delivery Rate</li>
                    <li>Training Completion Status</li>
                    <li>Parts Needing Reorder</li>
                    <li>Open Action Items</li>
                  </ul>
                </div>
                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold flex items-center gap-2 mb-2">
                    <Calendar className="h-4 w-4" />
                    Lower Priority - Calendar & Quality
                  </h4>
                  <ul className="text-sm space-y-1 text-muted-foreground ml-6">
                    <li>Calendar Events Integration</li>
                    <li>Open CARs Status</li>
                    <li>Risk Register Items</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
