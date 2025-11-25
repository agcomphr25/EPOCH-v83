import { useQuery } from '@tanstack/react-query';
import { useRoute, Link } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Printer, ArrowLeft, FileCheck, Clock, Shield, CheckCircle, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { COMPANY_INFO } from '@shared/company-config';

interface TestResult {
  testName: string;
  specification: string;
  result: string;
  status: 'PASS' | 'FAIL' | 'CONDITIONAL';
  notes?: string;
}

interface TestReportData {
  id: string;
  reportNumber: string;
  lotNumberId?: string;
  lotNumber?: string;
  certificateId?: string;
  customerId: string;
  customerName: string;
  partNumber?: string;
  partName?: string;
  serialNumbers?: string[];
  testDate?: string;
  testType?: string;
  testResults?: TestResult[];
  overallResult: string;
  testEquipment?: any;
  environmentalConditions?: any;
  testEngineer?: string;
  testEngineerSignature?: string;
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
  status: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export default function P2TestReportViewer() {
  const [match, params] = useRoute('/p2/test-report/:id');
  const reportId = params?.id;

  const { data: report, isLoading, error } = useQuery<TestReportData>({
    queryKey: [`/api/p2-traveler-viewer/test-for-conformance/${reportId}`],
    enabled: !!reportId,
  });

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <Clock className="h-8 w-8 animate-spin mx-auto text-gray-400" />
        <p className="text-gray-500 mt-4">Loading test report...</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <FileCheck className="h-8 w-8 mx-auto text-red-400" />
        <p className="text-red-500 mt-4">Failed to load test report</p>
        <Link href="/p2-traveler-viewer">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Traveler Viewer
          </Button>
        </Link>
      </div>
    );
  }

  const serialNumbers = (report.serialNumbers as string[]) || [];
  const testResults = (report.testResults as TestResult[]) || [];
  const testEquipment = report.testEquipment as any;
  const environmentalConditions = report.environmentalConditions as any;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PASS': return 'bg-green-100 text-green-800';
      case 'FAIL': return 'bg-red-100 text-red-800';
      case 'CONDITIONAL': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <div className="print:hidden flex items-center justify-between mb-6">
        <Link href="/p2-traveler-viewer">
          <Button variant="ghost">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint} data-testid="button-print">
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </div>
      </div>

      <Card className="print:shadow-none print:border-0" data-testid="test-report-document">
        <CardContent className="p-8">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-2xl font-bold">{COMPANY_INFO.name}</h1>
              <p className="text-sm text-gray-600">{COMPANY_INFO.streetAddress}</p>
              <p className="text-sm text-gray-600">{COMPANY_INFO.city}, {COMPANY_INFO.state} {COMPANY_INFO.zipCode}</p>
              <p className="text-sm text-gray-600">{COMPANY_INFO.phone}</p>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-2 mb-2">
                <Shield className="h-6 w-6 text-blue-600" />
                <span className="text-sm font-medium text-blue-600">AS9100 COMPLIANT</span>
              </div>
              <Badge className={getStatusColor(report.overallResult)}>
                {report.overallResult}
              </Badge>
            </div>
          </div>

          <div className="text-center my-8">
            <FileCheck className="h-12 w-12 mx-auto text-blue-600 mb-4" />
            <h2 className="text-2xl font-bold text-gray-800">TEST FOR CONFORMANCE REPORT</h2>
            <p className="font-mono font-bold text-lg mt-2" data-testid="text-report-number">{report.reportNumber}</p>
          </div>

          <Separator className="my-6" />

          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <h3 className="font-semibold text-gray-500 text-sm mb-3">CUSTOMER INFORMATION</h3>
              <div className="space-y-2">
                <div>
                  <span className="text-sm text-gray-500">Customer:</span>
                  <p className="font-semibold" data-testid="text-customer-name">{report.customerName}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Lot Number:</span>
                  <p className="font-mono" data-testid="text-lot-number">{report.lotNumber || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Test Type:</span>
                  <p data-testid="text-test-type">{report.testType || 'Standard Conformance'}</p>
                </div>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-gray-500 text-sm mb-3">PRODUCT INFORMATION</h3>
              <div className="space-y-2">
                <div>
                  <span className="text-sm text-gray-500">Part Number:</span>
                  <p className="font-mono" data-testid="text-part-number">{report.partNumber || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Part Name:</span>
                  <p data-testid="text-part-name">{report.partName || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Test Date:</span>
                  <p data-testid="text-test-date">{report.testDate ? format(new Date(report.testDate), 'MMM d, yyyy') : 'N/A'}</p>
                </div>
              </div>
            </div>
          </div>

          {serialNumbers.length > 0 && (
            <div className="mb-8">
              <h3 className="font-semibold text-gray-500 text-sm mb-3">SERIAL NUMBERS TESTED</h3>
              <div className="flex flex-wrap gap-2">
                {serialNumbers.map((sn, index) => (
                  <Badge key={index} variant="outline" className="font-mono" data-testid={`badge-serial-${index}`}>
                    {sn}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {testResults.length > 0 && (
            <div className="mb-8">
              <h3 className="font-semibold text-gray-500 text-sm mb-3">TEST RESULTS</h3>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-3 font-medium">Test Name</th>
                      <th className="text-left p-3 font-medium">Specification</th>
                      <th className="text-left p-3 font-medium">Result</th>
                      <th className="text-center p-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {testResults.map((test, index) => (
                      <tr key={index} className="border-t" data-testid={`row-test-${index}`}>
                        <td className="p-3 font-medium">{test.testName}</td>
                        <td className="p-3">{test.specification}</td>
                        <td className="p-3 font-mono">{test.result}</td>
                        <td className="p-3 text-center">
                          {test.status === 'PASS' ? (
                            <CheckCircle className="h-5 w-5 text-green-600 mx-auto" />
                          ) : test.status === 'FAIL' ? (
                            <XCircle className="h-5 w-5 text-red-600 mx-auto" />
                          ) : (
                            <Badge className={getStatusColor(test.status)}>{test.status}</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {testEquipment && (
            <div className="mb-8">
              <h3 className="font-semibold text-gray-500 text-sm mb-3">TEST EQUIPMENT</h3>
              <Card className="bg-gray-50">
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(testEquipment).map(([key, value]) => (
                      <div key={key}>
                        <span className="text-sm text-gray-500 capitalize">{key.replace(/_/g, ' ')}:</span>
                        <p className="font-mono">{String(value)}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {environmentalConditions && (
            <div className="mb-8">
              <h3 className="font-semibold text-gray-500 text-sm mb-3">ENVIRONMENTAL CONDITIONS</h3>
              <Card className="bg-gray-50">
                <CardContent className="p-4">
                  <div className="grid grid-cols-3 gap-4">
                    {Object.entries(environmentalConditions).map(([key, value]) => (
                      <div key={key}>
                        <span className="text-sm text-gray-500 capitalize">{key.replace(/_/g, ' ')}:</span>
                        <p className="font-mono">{String(value)}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {report.notes && (
            <div className="mb-8">
              <h3 className="font-semibold text-gray-500 text-sm mb-3">NOTES</h3>
              <p className="text-gray-700" data-testid="text-notes">{report.notes}</p>
            </div>
          )}

          <Separator className="my-6" />

          <div className="grid grid-cols-2 gap-8">
            <div>
              <h3 className="font-semibold text-gray-500 text-sm mb-3">TEST ENGINEER</h3>
              <div className="border-b border-dashed border-gray-400 pb-1 mb-2 min-h-[40px]">
                {report.testEngineerSignature ? (
                  <img
                    src={report.testEngineerSignature}
                    alt="Test Engineer Signature"
                    className="h-10 object-contain"
                  />
                ) : (
                  <span className="text-gray-400 text-sm italic">Signature pending</span>
                )}
              </div>
              <p className="font-medium" data-testid="text-test-engineer">{report.testEngineer || 'N/A'}</p>
              <p className="text-sm text-gray-500">Test Engineer</p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-500 text-sm mb-3">APPROVAL</h3>
              <div className="border-b border-dashed border-gray-400 pb-1 mb-2 min-h-[40px]">
                {report.approvedBy ? (
                  <p className="font-medium">{report.approvedBy}</p>
                ) : (
                  <span className="text-gray-400 text-sm italic">Approval pending</span>
                )}
              </div>
              <p className="text-sm text-gray-500">
                {report.approvedAt ? format(new Date(report.approvedAt), 'MMM d, yyyy') : 'Date pending'}
              </p>
              <p className="text-sm text-gray-500">Quality Manager</p>
            </div>
          </div>

          <div className="mt-8 text-center text-xs text-gray-400 print:text-gray-500">
            <p>This report was generated by {COMPANY_INFO.name} Quality Management System</p>
            <p>Report generated on {format(new Date(report.createdAt), 'MMMM d, yyyy HH:mm')}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
