import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  ShoppingCart,
  Factory,
  Layers,
  HelpCircle,
  BookOpen,
  FileText,
  ArrowRight,
  CalendarCheck,
  ClipboardCheck,
  FilePenLine,
  ShieldCheck,
} from 'lucide-react';
import { Link } from 'wouter';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

const faqData: FAQItem[] = [
  // Order Entry
  {
    id: 'oe-1',
    question: 'How do I create a new order?',
    answer: 'Navigate to Order Entry from the menu. Select a customer using the search box, choose a stock model, configure the features you need, and click "Save Draft" or "Finalize Order" when ready.',
    category: 'Order Entry',
  },
  {
    id: 'oe-2',
    question: 'What is the difference between Save Draft and Finalize Order?',
    answer: 'Save Draft keeps the order editable and does not send it to production. Finalize Order locks the order details and moves it to the Production Queue for manufacturing.',
    category: 'Order Entry',
  },
  {
    id: 'oe-3',
    question: 'How do I apply a discount to an order?',
    answer: 'In the Order Entry form, scroll to the Discount section. You can enter a discount code if the customer has one, or use the Custom Discount option to apply a percentage or fixed amount discount.',
    category: 'Order Entry',
  },
  {
    id: 'oe-4',
    question: 'Can I edit an order after it has been finalized?',
    answer: 'Finalized orders can still be edited, but changes are tracked. For major changes, consider creating a kickback or contacting a manager. The system preserves the order history for audit purposes.',
    category: 'Order Entry',
  },
  {
    id: 'oe-5',
    question: 'How do I add a payment to an order?',
    answer: 'Open the order in Order Entry, scroll down to the Payments section, and click "Add Payment". Enter the payment type (credit card, check, cash, etc.), amount, and date. The balance due will update automatically.',
    category: 'Order Entry',
  },
  {
    id: 'oe-6',
    question: 'What does the "NOT PAID" badge mean?',
    answer: 'The NOT PAID badge indicates that the order has an outstanding balance. Once payments equal or exceed the order total, the badge will change to show the order is paid.',
    category: 'Order Entry',
  },

  // Production Queue
  {
    id: 'pq-1',
    question: 'How do I find an order in the Production Queue?',
    answer: 'Use the search box at the top of the Production Queue page. You can search by Order ID (like EL065) or FishBowl Number. You can also filter by department or status.',
    category: 'Production Queue',
  },
  {
    id: 'pq-2',
    question: 'How do I move an order to the next department?',
    answer: 'Click on the order to view its details, then click the department progression button (e.g., "Complete Layup" or "Move to CNC"). The order will automatically advance to the next stage.',
    category: 'Production Queue',
  },
  {
    id: 'pq-3',
    question: 'What is a kickback and when should I use it?',
    answer: 'A kickback sends an order back to a previous department when an issue is found. Use it when quality problems are discovered or when rework is needed. Always include a reason for the kickback.',
    category: 'Production Queue',
  },
  {
    id: 'pq-4',
    question: 'How do I see which orders are due soon?',
    answer: 'Orders in the Production Queue show their due dates. Orders due within 7 days are highlighted. You can also sort by due date to prioritize urgent orders.',
    category: 'Production Queue',
  },
  {
    id: 'pq-5',
    question: 'What do the different order statuses mean?',
    answer: 'DRAFT: Not yet finalized. FINALIZED: Ready for production. IN_PROGRESS: Currently being worked on. COMPLETED: Finished manufacturing. SHIPPED: Sent to customer. CANCELLED: Order was cancelled.',
    category: 'Production Queue',
  },

  // BOM (Bill of Materials)
  {
    id: 'bom-1',
    question: 'What is a BOM?',
    answer: 'BOM stands for Bill of Materials. It is a list of all the parts, components, and materials needed to manufacture a specific stock model. BOMs help ensure consistency and enable inventory planning.',
    category: 'Bill of Materials',
  },
  {
    id: 'bom-2',
    question: 'How do I create a new BOM?',
    answer: 'Navigate to BOM Management, click "Create New BOM", select the stock model it applies to, then add each component with its required quantity. Save and activate the BOM when complete.',
    category: 'Bill of Materials',
  },
  {
    id: 'bom-3',
    question: 'Can I have multiple BOMs for the same stock model?',
    answer: 'Yes, you can create multiple BOM versions (revisions) for the same stock model. Only one can be active at a time. This is useful when materials or processes change.',
    category: 'Bill of Materials',
  },
  {
    id: 'bom-4',
    question: 'How do BOMs connect to inventory?',
    answer: 'When a BOM is linked to an order, the system can check if all required parts are in stock, calculate material needs for production planning, and generate pick lists for the warehouse.',
    category: 'Bill of Materials',
  },
  {
    id: 'bom-5',
    question: 'What is BOM revision control?',
    answer: 'Revision control tracks changes to BOMs over time. Each time you update a BOM, you can create a new revision with notes about what changed. This maintains a history for quality and compliance purposes.',
    category: 'Bill of Materials',
  },

  // General
  {
    id: 'gen-1',
    question: 'How do I use the global search?',
    answer: 'Press Ctrl+E (or Cmd+E on Mac) to open global search. Type your search term to find orders, customers, or navigate to different sections of the app.',
    category: 'General',
  },
  {
    id: 'gen-2',
    question: 'How do I request a refund for an order?',
    answer: 'Navigate to Refund Request, select the customer and order, enter the refund amount (up to what has been paid), provide a reason, and submit. The request goes to management for approval before processing.',
    category: 'General',
  },
  {
    id: 'gen-3',
    question: 'Why can\'t I refund more than the Total Paid amount?',
    answer: 'Refunds can only be issued for money that has been received. The system limits refund requests to the actual amount paid on the order to prevent over-refunding.',
    category: 'General',
  },

  // Timekeeping
  {
    id: 'tk-1',
    question: 'Where do I submit a PTO request?',
    answer: 'Open Employee Portal and select the Time Off tab. Choose the request type, dates, optional note, and click Submit PTO Request. You can track the status in My Time-Off Requests.',
    category: 'Timekeeping',
  },
  {
    id: 'tk-2',
    question: 'How do I request a punch correction?',
    answer: 'Open Employee Portal and select the Time Clock tab. Use Request Punch Correction to select an existing punch or add a missing punch, enter the corrected time details, write a clear reason, and submit the request for review.',
    category: 'Timekeeping',
  },
  {
    id: 'tk-3',
    question: 'Where do I review and certify my timesheet?',
    answer: 'Open Employee Portal and select the Timesheets tab. Review the pay period, complete daily sign-offs, prepare the period for certification when needed, and certify any items listed under Needs Certification.',
    category: 'Timekeeping',
  },
  {
    id: 'tk-4',
    question: 'Why does EPOCH ask me to certify time records?',
    answer: 'Employee certification helps confirm that recorded labor is complete, accurate, and represents work actually performed. These acknowledgments support DCAA-ready timekeeping controls and audit evidence.',
    category: 'Timekeeping',
  },
];

const categories = [
  { name: 'Order Entry', icon: ShoppingCart, color: 'bg-blue-100 text-blue-800' },
  { name: 'Production Queue', icon: Factory, color: 'bg-green-100 text-green-800' },
  { name: 'Bill of Materials', icon: Layers, color: 'bg-purple-100 text-purple-800' },
  { name: 'Timekeeping', icon: ClipboardCheck, color: 'bg-amber-100 text-amber-800' },
  { name: 'General', icon: HelpCircle, color: 'bg-gray-100 text-gray-800' },
];

const guideCards = [
  {
    href: '/help/timeclock-training-program',
    title: 'Timeclock Training and Certification Program',
    description: 'Starter program outline for employee timeclock training and certification',
    icon: ShieldCheck,
    color: 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400',
  },
  {
    href: '/help/pto-request-guide',
    title: 'How to Submit a PTO Request',
    description: 'Request full-day, half-day, hourly, or multi-day PTO from Employee Portal',
    icon: CalendarCheck,
    color: 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400',
  },
  {
    href: '/help/punch-edit-request-guide',
    title: 'How to Request a Punch Edit',
    description: 'Submit missed or incorrect punch changes for supervisor review',
    icon: FilePenLine,
    color: 'bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400',
  },
  {
    href: '/help/timesheet-review-guide',
    title: 'How to View and Certify Timesheets',
    description: 'Review daily sign-offs, certify pay periods, and view timesheet history',
    icon: ClipboardCheck,
    color: 'bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400',
  },
  {
    href: '/help/p2-order-guide',
    title: 'How to Create a New P2 Order',
    description: 'Complete walkthrough of the P2 order creation process',
    icon: FileText,
    color: 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400',
  },
];

export default function HelpCenter() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filteredFAQs = faqData.filter((faq) => {
    const matchesSearch =
      searchQuery === '' ||
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      selectedCategory === null || faq.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const getCategoryColor = (category: string) => {
    const cat = categories.find((c) => c.name === category);
    return cat?.color || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl" data-testid="help-center-page">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <BookOpen className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900" data-testid="help-title">
            Help Center
          </h1>
        </div>
        <p className="text-gray-600">
          Find answers to common questions about using EPOCH v8
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          type="text"
          placeholder="Search for help..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          data-testid="help-search-input"
        />
      </div>

      {/* Category Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Badge
          variant={selectedCategory === null ? 'default' : 'outline'}
          className="cursor-pointer px-3 py-1"
          onClick={() => setSelectedCategory(null)}
          data-testid="filter-all"
        >
          All Topics
        </Badge>
        {categories.map((category) => {
          const Icon = category.icon;
          return (
            <Badge
              key={category.name}
              variant={selectedCategory === category.name ? 'default' : 'outline'}
              className="cursor-pointer px-3 py-1 flex items-center gap-1"
              onClick={() => setSelectedCategory(category.name)}
              data-testid={`filter-${category.name.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <Icon className="h-3 w-3" />
              {category.name}
            </Badge>
          );
        })}
      </div>

      {/* FAQ Accordion */}
      <Card data-testid="faq-card">
        <CardHeader>
          <CardTitle className="text-lg">
            Frequently Asked Questions
            <span className="text-sm font-normal text-gray-500 ml-2">
              ({filteredFAQs.length} {filteredFAQs.length === 1 ? 'result' : 'results'})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredFAQs.length === 0 ? (
            <div className="text-center py-8 text-gray-500" data-testid="no-results">
              <HelpCircle className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>No matching questions found.</p>
              <p className="text-sm">Try a different search term or category.</p>
            </div>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {filteredFAQs.map((faq) => (
                <AccordionItem key={faq.id} value={faq.id} data-testid={`faq-item-${faq.id}`}>
                  <AccordionTrigger className="text-left hover:no-underline">
                    <div className="flex items-start gap-3 pr-4">
                      <Badge
                        variant="secondary"
                        className={`${getCategoryColor(faq.category)} text-xs shrink-0 mt-0.5`}
                      >
                        {faq.category}
                      </Badge>
                      <span className="font-medium">{faq.question}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="text-gray-600 pl-20">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {/* Guides */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Step-by-Step Guides
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {guideCards.map((guide) => {
            const Icon = guide.icon;
            return (
              <Link key={guide.href} href={guide.href}>
                <div className="flex items-center justify-between p-3 rounded-md border hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${guide.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-medium">{guide.title}</h3>
                      <p className="text-sm text-muted-foreground">{guide.description}</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            );
          })}
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="hover:shadow-md transition-shadow cursor-pointer" data-testid="quick-link-order-entry">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <ShoppingCart className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-medium">Order Entry</h3>
              <p className="text-sm text-gray-500">Create and manage orders</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow cursor-pointer" data-testid="quick-link-production">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Factory className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h3 className="font-medium">Production Queue</h3>
              <p className="text-sm text-gray-500">Track manufacturing progress</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow cursor-pointer" data-testid="quick-link-bom">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Layers className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-medium">Bill of Materials</h3>
              <p className="text-sm text-gray-500">Manage component lists</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
