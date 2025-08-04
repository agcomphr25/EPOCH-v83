import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookOpen, Download, FileText, Shield, Users, Clock, X, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface HandbookModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HandbookModal({ isOpen, onClose }: HandbookModalProps) {
  const [selectedSection, setSelectedSection] = useState('welcome');
  const { toast } = useToast();

  const handleDownload = (section: string) => {
    // In a real implementation, this would download the actual PDF
    toast({
      title: "Download Started",
      description: `Downloading ${section} section...`,
    });
  };

  const handbookSections = [
    {
      id: 'welcome',
      title: 'Welcome & Introduction',
      icon: Users,
      description: 'Company overview, mission, and values',
      content: `
        Welcome to EPOCH Manufacturing!
        
        We are excited to have you join our team. This handbook will guide you through our company policies, procedures, and culture.
        
        Our Mission: To deliver exceptional manufacturing solutions while fostering a safe, inclusive, and innovative workplace.
        
        Our Values:
        • Excellence in everything we do
        • Safety as our top priority  
        • Continuous improvement and innovation
        • Respect for all team members
        • Environmental responsibility
      `,
    },
    {
      id: 'policies',
      title: 'Company Policies',
      icon: FileText,
      description: 'HR policies, code of conduct, and procedures',
      content: `
        Company Policies & Procedures
        
        1. Code of Conduct
        - Treat all colleagues with respect and professionalism
        - Maintain confidentiality of company information
        - Report any safety concerns immediately
        
        2. Attendance Policy
        - Regular attendance is essential
        - Report absences as early as possible
        - Use time clock system for accurate tracking
        
        3. Communication
        - Use official company email for business communications
        - Follow escalation procedures for concerns
        - Participate in team meetings and training
        
        4. Performance Standards
        - Meet quality and productivity expectations
        - Complete required training and certifications
        - Participate in performance evaluations
      `,
    },
    {
      id: 'safety',
      title: 'Safety Procedures',
      icon: Shield,
      description: 'Safety protocols, emergency procedures, and equipment',
      content: `
        Safety First - Always
        
        Personal Protective Equipment (PPE):
        • Safety glasses required in all production areas
        • Steel-toed boots mandatory on factory floor
        • Hard hats required in designated zones
        • Hearing protection in high-noise areas
        
        Emergency Procedures:
        • Fire evacuation routes posted throughout facility
        • Emergency contact numbers: 911 for immediate danger
        • First aid stations located at each department
        • Report all incidents immediately to supervisor
        
        Equipment Safety:
        • Only operate equipment you're trained and certified on
        • Perform daily safety checks before use
        • Report damaged or malfunctioning equipment
        • Follow lockout/tagout procedures for maintenance
        
        Chemical Safety:
        • Review Safety Data Sheets (SDS) before handling
        • Use proper ventilation and PPE
        • Store chemicals in designated areas
        • Report spills or exposures immediately
      `,
    },
    {
      id: 'benefits',
      title: 'Benefits & Time Off',
      icon: Clock,
      description: 'Employee benefits, vacation, and time-off policies',
      content: `
        Employee Benefits Package
        
        Health & Wellness:
        • Medical, dental, and vision insurance
        • Health Savings Account (HSA) options
        • Employee Assistance Program (EAP)
        • Annual wellness screenings
        
        Time Off:
        • Paid Time Off (PTO) accrual based on service
        • Holiday pay for company-recognized holidays
        • Sick leave as required by state law
        • Bereavement leave for immediate family
        
        Retirement:
        • 401(k) plan with company matching
        • Vesting schedule begins after 1 year
        • Financial planning resources available
        
        Professional Development:
        • Training and certification opportunities
        • Tuition reimbursement program
        • Career advancement pathways
        • Skills development workshops
        
        Additional Benefits:
        • Life insurance coverage
        • Disability insurance
        • Employee discounts
        • Recognition and reward programs
      `,
    },
  ];

  const currentSection = handbookSections.find(section => section.id === selectedSection);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <BookOpen className="w-5 h-5" />
              <span>Employee Handbook</span>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownload('complete')}
              >
                <Download className="w-4 h-4 mr-2" />
                Download PDF
              </Button>
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-[60vh]">
          {/* Sidebar Navigation */}
          <div className="md:col-span-1 border-r pr-4">
            <div className="space-y-2">
              <h3 className="font-semibold text-sm text-gray-700 mb-3">Sections</h3>
              {handbookSections.map((section) => {
                const IconComponent = section.icon;
                return (
                  <button
                    key={section.id}
                    onClick={() => setSelectedSection(section.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedSection === section.id
                        ? 'bg-blue-50 border-blue-200 text-blue-700'
                        : 'bg-white border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center space-x-2 mb-1">
                      <IconComponent className="w-4 h-4" />
                      <span className="font-medium text-sm">{section.title}</span>
                    </div>
                    <p className="text-xs text-gray-500">{section.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content Area */}
          <div className="md:col-span-3 overflow-y-auto">
            {currentSection && (
              <Card className="h-full">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <currentSection.icon className="w-5 h-5" />
                      <CardTitle>{currentSection.title}</CardTitle>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownload(currentSection.id)}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                  </div>
                  <CardDescription>{currentSection.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                      {currentSection.content}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t pt-4">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div>
              <p>Last updated: {new Date().toLocaleDateString()}</p>
              <p>Version 8.0 - EPOCH Manufacturing ERP System</p>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm">
                <ExternalLink className="w-4 h-4 mr-2" />
                Print Version
              </Button>
              <span>Questions? Contact HR</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}