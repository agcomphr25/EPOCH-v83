import { useQuery } from '@tanstack/react-query';
import { useRoute, Link } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Printer, ArrowLeft, Award, CheckCircle, Clock, Shield } from 'lucide-react';
import { format } from 'date-fns';
import { COMPANY_INFO, CERTIFICATE_TEMPLATES } from '@shared/company-config';

const formatTemplateDate = (value?: string) => {
  if (!value) return '';
  const date = value.includes('T') ? new Date(value) : new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return format(date, 'MM/dd/yyyy');
};

interface InspectionSummary {
  totalInspections: number;
  passed: number;
  failed: number;
  conditional: number;
}

interface CertificateData {
  id: string;
  certificateNumber: string;
  lotNumberId?: string;
  lotNumber?: string;
  customerId: string;
  customerName: string;
  customerAddress?: string;
  poNumber?: string;
  partNumber?: string;
  partName?: string;
  quantity: number;
  serialNumbers?: string[];
  manufacturingDate?: string;
  shipDate?: string;
  certificationText?: string;
  specifications?: any;
  materialCertifications?: any;
  processRecords?: any;
  specialProcesses?: string;
  inspectionSummary?: InspectionSummary;
  traceabilityData?: any;
  templateDocumentName?: string;
  templateDocumentNumber?: string;
  templateVersion?: string;
  templateVersionDate?: string;
  templateDisplay?: string;
  qaMgrName?: string;
  qaMgrTitle?: string;
  qaMgrSignature?: string;
  qaMgrDate?: string;
  status: string;
  approvedBy?: string;
  approvedAt?: string;
  issuedAt?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export default function P2CertificateViewer() {
  const [match, params] = useRoute('/p2/certificate/:id');
  const certificateId = params?.id;

  const { data: certificate, isLoading, error } = useQuery<CertificateData>({
    queryKey: [`/api/p2-traveler-viewer/certificate-of-conformance/${certificateId}`],
    enabled: !!certificateId,
  });

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <Clock className="h-8 w-8 animate-spin mx-auto text-gray-400" />
        <p className="text-gray-500 mt-4">Loading certificate...</p>
      </div>
    );
  }

  if (error || !certificate) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <Award className="h-8 w-8 mx-auto text-red-400" />
        <p className="text-red-500 mt-4">Failed to load certificate</p>
        <Link href="/p2-traveler-viewer">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Traveler Viewer
          </Button>
        </Link>
      </div>
    );
  }

  const serialNumbers = (certificate.serialNumbers as string[]) || [];
  const inspectionSummary = certificate.inspectionSummary as any;
  const formNumber = certificate.templateDocumentNumber || 'FO Form 6';
  const versionDisplay =
    certificate.templateDisplay ||
    (certificate.templateVersion
      ? `Version ${certificate.templateVersion}${certificate.templateVersionDate ? ` ${formatTemplateDate(certificate.templateVersionDate)}` : ''}`
      : 'Version 2.3 08/14/2024');
  const qaMgrName = certificate.qaMgrName || certificate.approvedBy || '';
  const qaMgrTitle = certificate.qaMgrTitle || 'Quality Assurance';

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

      <Card className="print:shadow-none print:border-0" data-testid="certificate-document">
        <CardContent className="p-8">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-2xl font-bold">AG Advanced</h1>
              <p className="text-sm text-gray-600">{COMPANY_INFO.streetAddress}</p>
              <p className="text-sm text-gray-600">{COMPANY_INFO.city}, {COMPANY_INFO.state} {COMPANY_INFO.zipCode}</p>
              <p className="text-sm text-gray-600">{COMPANY_INFO.phone}</p>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-2 mb-2">
                <Shield className="h-6 w-6 text-blue-600" />
                <span className="text-sm font-medium text-blue-600">AS9100 COMPLIANT</span>
              </div>
              <Badge className={certificate.status === 'APPROVED' ? 'bg-green-100 text-green-800' : certificate.status === 'DRAFT' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'}>
                {certificate.status}
              </Badge>
            </div>
          </div>

          <div className="text-center my-8">
            <Award className="h-12 w-12 mx-auto text-blue-600 mb-4" />
            <h2 className="text-2xl font-bold text-gray-800">MANUFACTURER'S CERTIFICATE OF CONFORMANCE</h2>
            <p className="font-mono font-bold text-lg mt-2" data-testid="text-certificate-number">{certificate.certificateNumber}</p>
          </div>

          <Separator className="my-6" />

          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <h3 className="font-semibold text-gray-500 text-sm mb-3">CUSTOMER INFORMATION</h3>
              <div className="space-y-2">
                <div>
                  <span className="text-sm text-gray-500">Customer:</span>
                  <p className="font-semibold" data-testid="text-customer-name">{certificate.customerName}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">PO Number:</span>
                  <p className="font-mono" data-testid="text-po-number">{certificate.poNumber || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Lot Number:</span>
                  <p className="font-mono" data-testid="text-lot-number">{certificate.lotNumber || 'N/A'}</p>
                </div>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-gray-500 text-sm mb-3">PRODUCT INFORMATION</h3>
              <div className="space-y-2">
                <div>
                  <span className="text-sm text-gray-500">SKU:</span>
                  <p className="font-mono" data-testid="text-part-number">{certificate.partNumber || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Part Name:</span>
                  <p data-testid="text-part-name">{certificate.partName || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Special Processes:</span>
                  <p data-testid="text-special-processes">{certificate.specialProcesses || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Quantity:</span>
                  <p data-testid="text-quantity">{certificate.quantity}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Manufacturing Date:</span>
                  <p data-testid="text-mfg-date">{certificate.manufacturingDate ? format(new Date(certificate.manufacturingDate), 'MMM d, yyyy') : 'N/A'}</p>
                </div>
              </div>
            </div>
          </div>

          {serialNumbers.length > 0 && (
            <>
              <Separator className="my-6" />
              <div className="mb-8">
                <h3 className="font-semibold text-gray-500 text-sm mb-3">SERIAL NUMBERS</h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex flex-wrap gap-2">
                    {serialNumbers.map((serial: string, index: number) => (
                      <Badge key={index} variant="outline" className="font-mono" data-testid={`badge-serial-${index}`}>
                        {serial}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          <Separator className="my-6" />

          <div className="mb-8">
            <h3 className="font-semibold text-gray-500 text-sm mb-3">CERTIFICATION STATEMENT</h3>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <p className="text-sm leading-relaxed">
                {certificate.certificationText || CERTIFICATE_TEMPLATES?.manufacturersConformance?.certificationText || 
                  `We hereby certify that the items described above have been manufactured, inspected, and tested in accordance with the applicable drawings, specifications, and quality requirements. All materials used meet the requirements of the applicable material specifications. The items conform to all specified requirements and are acceptable for use.`
                }
              </p>
            </div>
          </div>

          {inspectionSummary && (
            <>
              <Separator className="my-6" />
              <div className="mb-8">
                <h3 className="font-semibold text-gray-500 text-sm mb-3">INSPECTION SUMMARY</h3>
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-gray-800">{inspectionSummary.totalInspections || 0}</p>
                    <p className="text-xs text-gray-500">Total Inspections</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-green-600">{inspectionSummary.passed || 0}</p>
                    <p className="text-xs text-gray-500">Passed</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-red-600">{inspectionSummary.failed || 0}</p>
                    <p className="text-xs text-gray-500">Failed</p>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-yellow-600">{inspectionSummary.conditional || 0}</p>
                    <p className="text-xs text-gray-500">Conditional</p>
                  </div>
                </div>
              </div>
            </>
          )}

          <Separator className="my-6" />

          <div className="grid grid-cols-2 gap-8">
            <div>
              <h3 className="font-semibold text-gray-500 text-sm mb-3">QUALITY ASSURANCE APPROVAL</h3>
              <div className="space-y-4">
                <div>
                  <span className="text-sm text-gray-500">QA Manager:</span>
                  <div className="border-b border-gray-300 min-h-[2rem] mt-1 flex items-end pb-1">
                    {qaMgrName}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{qaMgrTitle}</p>
                </div>
                {certificate.qaMgrSignature && (
                  <div>
                    <span className="text-sm text-gray-500">Signature:</span>
                    <div className="mt-1">
                      <img src={certificate.qaMgrSignature} alt="QA Manager Signature" className="max-h-16" />
                    </div>
                  </div>
                )}
                <div>
                  <span className="text-sm text-gray-500">Date:</span>
                  <p>{certificate.qaMgrDate ? format(new Date(certificate.qaMgrDate), 'MMM d, yyyy') : '__________________'}</p>
                </div>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-gray-500 text-sm mb-3">DOCUMENT INFORMATION</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-500">Created:</span>
                  <span className="ml-2">{format(new Date(certificate.createdAt), 'MMM d, yyyy h:mm a')}</span>
                </div>
                <div>
                  <span className="text-gray-500">Created By:</span>
                  <span className="ml-2">{certificate.createdBy}</span>
                </div>
                {certificate.approvedBy && (
                  <div>
                    <span className="text-gray-500">Approved By:</span>
                    <span className="ml-2">{certificate.approvedBy}</span>
                  </div>
                )}
                {certificate.issuedAt && (
                  <div>
                    <span className="text-gray-500">Issued:</span>
                    <span className="ml-2">{format(new Date(certificate.issuedAt), 'MMM d, yyyy')}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {certificate.notes && (
            <>
              <Separator className="my-6" />
              <div>
                <h3 className="font-semibold text-gray-500 text-sm mb-2">NOTES</h3>
                <p className="text-sm">{certificate.notes}</p>
              </div>
            </>
          )}

          <div className="mt-8 pt-6 border-t text-center text-xs text-gray-400">
            <p>This certificate is generated in accordance with AS9100 quality management system requirements.</p>
            <p>Document ID: {certificate.id}</p>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
            <span>{formNumber}</span>
            <span>{versionDisplay}</span>
          </div>
        </CardContent>
      </Card>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          [data-testid="certificate-document"],
          [data-testid="certificate-document"] * {
            visibility: visible;
          }
          [data-testid="certificate-document"] {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
